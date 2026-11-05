// Google Agenda (G1–G4), sem projeto no Google Cloud e sem acesso do sistema à conta Google:
// - Importar: o administrador exporta a agenda do Google (.ics ou o .zip do Google) e envia
//   aqui. Cada evento é revisado: compromisso (padrão, ligado a cada processo citado),
//   audiência ou não importar. Nada é gravado antes da revisão.
// - Enviar: o Google assina um endereço privado (com token) que devolve prazos, audiências e
//   compromissos em .ics. O administrador centraliza: a assinatura traz a agenda de todos.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import JSZip from "jszip";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { dataNoFuso, gerarIcs, IcsInvalidoError, lerIcs, numerosCnjNoTexto, SUFIXO_UID, type EventoIcs, type EventoSaida } from "@/dominio/agenda/ics";
import { validarNumeroCnj } from "@/dominio/cnj/numero-cnj";
import { formatarData, somarDias, type DataCivil } from "@/dominio/prazos/data-civil";
import { formatarDataHora } from "@/lib/data-hora";
import { hoje as hojeSp, paraDataCivil, paraDate } from "@/lib/hoje";
import type { UsuarioAtual } from "../auth/usuario";
import { cifrar, decifrar, indiceBusca } from "../cripto/cifra";
import { comUsuario, prisma } from "../db/prisma";
import { NaoEncontradoError, RegraDeNegocioError } from "../erros";
import { exigirPermissao } from "../permissoes/matriz";

// ───────────────────────── Importação ─────────────────────────

export type SituacaoEvento = "novo" | "ja_importado" | "do_sistema" | "passado" | "recorrente" | "cancelado";

export const SITUACAO_EVENTO: Record<SituacaoEvento, string> = {
  novo: "Para revisar",
  ja_importado: "Já importado antes",
  do_sistema: "Enviado pelo próprio sistema",
  passado: "Anterior a hoje",
  recorrente: "Evento repetido (série): lançar manualmente",
  cancelado: "Cancelado no Google",
};

/** Evento guardado no lote (datas em texto ISO). */
export interface EventoLote {
  uid: string;
  titulo: string;
  descricao: string | null;
  local: string | null;
  diaInteiro: boolean;
  inicio: string;
  fim: string | null;
  data: DataCivil;
  situacao: SituacaoEvento;
  /** Números CNJ citados no título, na descrição ou no local. */
  numeros: string[];
  aviso: string | null;
}

export type TipoDecisao = "COMPROMISSO" | "AUDIENCIA" | "IGNORAR";

export interface DecisaoEvento {
  tipo: TipoDecisao;
  /** Números CNJ separados por ";" ou quebra de linha. */
  processos: string;
  tipoAudienciaId?: string;
  modalidade?: "PRESENCIAL" | "VIRTUAL";
}

const LIMITE_EVENTOS = 2000;
const TAMANHO_MAXIMO = 10 * 1024 * 1024;

/** Lê o .ics, ou todos os .ics de um .zip (o Google exporta assim). */
export async function lerArquivoAgenda(nome: string, conteudo: Buffer): Promise<EventoIcs[]> {
  if (conteudo.length > TAMANHO_MAXIMO) throw new RegraDeNegocioError("Arquivo maior que 10 MB.");
  const ehZip = conteudo.subarray(0, 2).toString("latin1") === "PK";
  try {
    if (!ehZip) return lerIcs(conteudo.toString("utf8"));
    const zip = await JSZip.loadAsync(conteudo);
    const arquivos = Object.values(zip.files).filter((f) => !f.dir && f.name.toLowerCase().endsWith(".ics"));
    if (!arquivos.length) throw new RegraDeNegocioError(`O arquivo ${nome} não contém agendas (.ics).`);
    const eventos: EventoIcs[] = [];
    for (const f of arquivos) eventos.push(...lerIcs(await f.async("string")));
    return eventos;
  } catch (e) {
    if (e instanceof IcsInvalidoError) throw new RegraDeNegocioError(`Arquivo de agenda inválido: ${e.message}`);
    if (e instanceof RegraDeNegocioError) throw e;
    if (ehZip) throw new RegraDeNegocioError("Não foi possível abrir o arquivo .zip.");
    throw e;
  }
}

/** Classifica cada evento (função pura; `existentes` = UIDs já gravados no sistema). */
export function classificarEventos(eventos: EventoIcs[], existentes: Set<string>, hoje: DataCivil): EventoLote[] {
  const vistos = new Set<string>();
  const saida: EventoLote[] = [];
  for (const e of eventos) {
    if (vistos.has(e.uid)) continue;
    vistos.add(e.uid);
    const situacao: SituacaoEvento = e.uid.endsWith(SUFIXO_UID)
      ? "do_sistema"
      : existentes.has(e.uid)
        ? "ja_importado"
        : e.cancelado
          ? "cancelado"
          : e.recorrente
            ? "recorrente"
            : e.data < hoje
              ? "passado"
              : "novo";
    saida.push({
      uid: e.uid,
      titulo: e.titulo.slice(0, 300),
      descricao: e.descricao?.slice(0, 4000) ?? null,
      local: e.local?.slice(0, 500) ?? null,
      diaInteiro: e.diaInteiro,
      inicio: e.inicio.toISOString(),
      fim: e.fim?.toISOString() ?? null,
      data: e.data,
      situacao,
      numeros: numerosCnjNoTexto(e.titulo, e.descricao, e.local),
      aviso: e.avisoFuso,
    });
  }
  saida.sort((a, b) => a.inicio.localeCompare(b.inicio));
  return saida;
}

/** Sem escolha, o evento vira compromisso ligado a cada processo citado (G2). */
export function decisaoPadrao(e: EventoLote): DecisaoEvento {
  return { tipo: "COMPROMISSO", processos: e.numeros.join("; ") };
}

/** Sugestão de modalidade para audiência: link no local ou na descrição → virtual. */
export function modalidadeSugerida(e: Pick<EventoLote, "local" | "descricao">): "PRESENCIAL" | "VIRTUAL" {
  return /https?:\/\/|meet\.google|zoom\.us|teams\.microsoft|webex/i.test(`${e.local ?? ""} ${e.descricao ?? ""}`) ? "VIRTUAL" : "PRESENCIAL";
}

export async function criarLoteAgenda(
  admin: UsuarioAtual,
  arquivo: { nome: string; conteudo: Buffer },
  hoje: DataCivil = hojeSp(),
  cliente: PrismaClient = prisma(),
) {
  exigirPermissao(admin, "agenda.google");
  const lidos = await lerArquivoAgenda(arquivo.nome, arquivo.conteudo);
  if (!lidos.length) throw new RegraDeNegocioError("O arquivo não tem eventos.");
  const uids = lidos.map((e) => e.uid);
  const [a, c] = await Promise.all([
    cliente.audiencia.findMany({ where: { uidExterno: { in: uids } }, select: { uidExterno: true } }),
    cliente.compromisso.findMany({ where: { uidExterno: { in: uids } }, select: { uidExterno: true } }),
  ]);
  const existentes = new Set([...a, ...c].map((x) => x.uidExterno!));
  const todos = classificarEventos(lidos, existentes, hoje);
  // Eventos antigos só entram na contagem: a exportação do Google traz o histórico inteiro.
  const guardados = todos.filter((e) => e.situacao !== "passado");
  if (guardados.filter((e) => e.situacao === "novo").length > LIMITE_EVENTOS) {
    throw new RegraDeNegocioError(`Mais de ${LIMITE_EVENTOS} eventos futuros: exporte só a agenda do escritório.`);
  }
  const contagem = Object.fromEntries(Object.keys(SITUACAO_EVENTO).map((s) => [s, todos.filter((e) => e.situacao === s).length]));
  return cliente.loteAgenda.create({
    data: {
      arquivo: arquivo.nome.slice(0, 200),
      eventos: { lista: guardados, contagem } as unknown as Prisma.InputJsonObject,
      criadoPorId: admin.id,
    },
  });
}

export function listarLotesAgenda(admin: UsuarioAtual, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "agenda.google");
  return cliente.loteAgenda.findMany({
    select: { id: true, arquivo: true, situacao: true, criadoEm: true, gravadoEm: true, criadoPor: { select: { nome: true } } },
    orderBy: { criadoEm: "desc" },
    take: 20,
  });
}

interface ProcessoAchado {
  id: string;
  numeroCnj: string;
}

export interface EventoRevisado extends EventoLote {
  indice: number;
  decisao: DecisaoEvento;
  processosAchados: ProcessoAchado[];
  problemas: string[];
  avisos: string[];
}

function numerosDigitados(texto: string): { validos: string[]; invalidos: string[] } {
  const validos: string[] = [];
  const invalidos: string[] = [];
  for (const parte of texto.split(/[;\n,]+/).map((x) => x.trim()).filter(Boolean)) {
    const r = validarNumeroCnj(parte);
    if (r.valido) {
      if (!validos.includes(r.numero.formatado)) validos.push(r.numero.formatado);
    } else invalidos.push(parte);
  }
  return { validos, invalidos };
}

/** Lote com a decisão efetiva de cada evento e o que impede a gravação. */
export async function obterLoteAgenda(admin: UsuarioAtual, id: string, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "agenda.google");
  const l = await cliente.loteAgenda.findUnique({ where: { id }, include: { criadoPor: { select: { nome: true } } } });
  if (!l) throw new NaoEncontradoError("Lote não encontrado.");
  const { lista, contagem } = l.eventos as unknown as { lista: EventoLote[]; contagem: Record<SituacaoEvento, number> };
  const decisoes = (l.decisoes ?? {}) as unknown as Record<string, DecisaoEvento>;
  const novos = lista.map((e, indice) => ({ e, indice })).filter(({ e }) => e.situacao === "novo");

  const efetivas = novos.map(({ e }) => decisoes[e.uid] ?? decisaoPadrao(e));
  const todosNumeros = [...new Set(efetivas.flatMap((d) => numerosDigitados(d.processos).validos))];
  const [processos, tiposAudiencia] = await Promise.all([
    cliente.processo.findMany({ where: { numeroCnj: { in: todosNumeros }, excluidoEm: null }, select: { id: true, numeroCnj: true } }),
    cliente.itemLista.findMany({ where: { lista: "TIPO_AUDIENCIA", ativo: true }, orderBy: [{ ordem: "asc" }, { valor: "asc" }] }),
  ]);
  const porNumero = new Map(processos.map((p) => [p.numeroCnj!, { id: p.id, numeroCnj: p.numeroCnj! }]));

  const revisados: EventoRevisado[] = novos.map(({ e, indice }, i) => {
    const decisao = efetivas[i]!;
    const problemas: string[] = [];
    const avisos: string[] = e.aviso ? [e.aviso] : [];
    const { validos, invalidos } = numerosDigitados(decisao.processos);
    const achados = validos.map((n) => porNumero.get(n)).filter((p): p is ProcessoAchado => !!p);
    if (decisao.tipo !== "IGNORAR") {
      for (const n of invalidos) problemas.push(`Número inválido: "${n}".`);
      for (const n of validos) if (!porNumero.has(n)) problemas.push(`Processo ${n} não cadastrado no sistema.`);
    }
    if (decisao.tipo === "AUDIENCIA") {
      if (validos.length !== 1) problemas.push("Audiência: informe exatamente um processo.");
      if (!decisao.tipoAudienciaId || !tiposAudiencia.some((t) => t.id === decisao.tipoAudienciaId)) problemas.push("Audiência: escolha o tipo.");
      if (e.diaInteiro) problemas.push("Audiência: o evento não tem horário no Google; corrija lá ou lance manualmente.");
    }
    if (decisao.tipo === "COMPROMISSO" && validos.length === 0) avisos.push("Sem processo: entra como compromisso avulso.");
    if (decisao.tipo === "COMPROMISSO" && achados.length > 1) avisos.push(`Um compromisso em cada um dos ${achados.length} processos.`);
    return { ...e, indice, decisao, processosAchados: achados, problemas, avisos };
  });

  return {
    ...l,
    contagem,
    outros: lista.filter((e) => e.situacao !== "novo"),
    revisados,
    tiposAudiencia,
    podeGravar: l.situacao === "EM_REVISAO" && revisados.every((r) => r.problemas.length === 0),
  };
}

const esquemaDecisao = z.object({
  tipo: z.enum(["COMPROMISSO", "AUDIENCIA", "IGNORAR"]),
  processos: z.string().max(2000),
  tipoAudienciaId: z.string().optional(),
  modalidade: z.enum(["PRESENCIAL", "VIRTUAL"]).optional(),
});

/** Decisões por UID; os problemas são mostrados na tela, sem impedir que se salve. */
export async function salvarDecisoesAgenda(admin: UsuarioAtual, id: string, entrada: unknown, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "agenda.google");
  const d = z.record(z.string(), esquemaDecisao).parse(entrada);
  const l = await cliente.loteAgenda.findUnique({ where: { id } });
  if (!l) throw new NaoEncontradoError("Lote não encontrado.");
  if (l.situacao !== "EM_REVISAO") throw new RegraDeNegocioError("Este lote não está mais em revisão.");
  await cliente.loteAgenda.update({
    where: { id },
    data: { decisoes: d as unknown as Prisma.InputJsonObject, revisadoEm: new Date() },
  });
}

export async function descartarLoteAgenda(admin: UsuarioAtual, id: string, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "agenda.google");
  const r = await cliente.loteAgenda.updateMany({ where: { id, situacao: "EM_REVISAO" }, data: { situacao: "DESCARTADO" } });
  if (r.count === 0) throw new RegraDeNegocioError("Só lotes em revisão podem ser descartados.");
}

/** Grava numa única transação. O administrador que importa fica como responsável (G4). */
export async function gravarLoteAgenda(admin: UsuarioAtual, id: string, cliente: PrismaClient = prisma()) {
  const l = await obterLoteAgenda(admin, id, cliente);
  if (l.situacao !== "EM_REVISAO") throw new RegraDeNegocioError("Este lote não está mais em revisão.");
  if (!l.podeGravar) throw new RegraDeNegocioError("Há eventos com pendência: corrija e salve a revisão antes de gravar.");

  const relatorio = await comUsuario(
    admin.id,
    async (tx) => {
      const r = { compromissos: 0, audiencias: 0, ignorados: 0, jaExistentes: 0 };
      for (const e of l.revisados) {
        const { tipo } = e.decisao;
        if (tipo === "IGNORAR") {
          r.ignorados++;
          continue;
        }
        const repetido =
          (await tx.audiencia.count({ where: { uidExterno: e.uid } })) + (await tx.compromisso.count({ where: { uidExterno: e.uid } }));
        if (repetido) {
          r.jaExistentes++;
          continue;
        }
        const inicio = new Date(e.inicio);
        const fim = e.fim ? new Date(e.fim) : null;
        if (tipo === "AUDIENCIA") {
          await tx.audiencia.create({
            data: {
              processoId: e.processosAchados[0]!.id,
              dataHora: inicio,
              tipoId: e.decisao.tipoAudienciaId!,
              modalidade: e.decisao.modalidade ?? modalidadeSugerida(e),
              localOuLink: e.local,
              responsavelId: admin.id,
              uidExterno: e.uid,
            },
          });
          r.audiencias++;
          continue;
        }
        const base = {
          titulo: e.titulo,
          inicio,
          fim: e.diaInteiro ? null : fim,
          diaInteiro: e.diaInteiro,
          local: e.local,
          descricao: e.descricao,
          responsavelId: admin.id,
          uidExterno: e.uid,
        };
        const alvos = e.processosAchados.length ? e.processosAchados.map((p) => p.id) : [null];
        for (const processoId of alvos) await tx.compromisso.create({ data: { ...base, processoId } });
        r.compromissos += alvos.length;
      }
      await tx.loteAgenda.update({ where: { id }, data: { situacao: "GRAVADO", gravadoEm: new Date(), relatorio: r } });
      return r;
    },
    cliente,
    { timeout: 60_000 },
  );
  return relatorio;
}

// ───────────────────────── Envio ao Google (assinatura) ─────────────────────────

const hashToken = (token: string) => indiceBusca(`agenda-google:${token}`);

export function urlDaAssinatura(base: string, token: string) {
  return `${base.replace(/\/$/, "")}/calendario/${token}`;
}

/** Token atual (decifrado) para o administrador ver o endereço; null se desligada. */
export async function obterAssinatura(admin: UsuarioAtual, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "agenda.google");
  const c = await cliente.configuracaoEscritorio.findUnique({ where: { id: 1 } });
  if (!c?.agendaTokenCifrado) return null;
  return { token: decifrar(c.agendaTokenCifrado), criadoEm: c.agendaTokenCriadoEm };
}

/** Gera um endereço novo; o anterior deixa de funcionar na hora. */
export async function gerarAssinatura(admin: UsuarioAtual, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "agenda.google");
  const token = randomBytes(24).toString("base64url");
  const dados = { agendaTokenCifrado: cifrar(token), agendaTokenHash: hashToken(token), agendaTokenCriadoEm: new Date() };
  await comUsuario(admin.id, (tx) => tx.configuracaoEscritorio.upsert({ where: { id: 1 }, update: dados, create: { id: 1, ...dados } }), cliente);
  return token;
}

export async function desligarAssinatura(admin: UsuarioAtual, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "agenda.google");
  await comUsuario(
    admin.id,
    (tx) => tx.configuracaoEscritorio.updateMany({ where: { id: 1 }, data: { agendaTokenCifrado: null, agendaTokenHash: null, agendaTokenCriadoEm: null } }),
    cliente,
  );
}

const JANELA_PASSADA = 30;
const JANELA_FUTURA = 400;

/**
 * Eventos enviados ao Google: prazos em aberto (dia inteiro, na data final efetiva),
 * audiências e compromissos, de 30 dias atrás a 400 dias à frente. Em processo com segredo de
 * justiça não vão nomes de partes nem assunto. O que veio do Google não volta para lá.
 */
export async function eventosParaGoogle(base: string, hoje: DataCivil = hojeSp(), cliente: PrismaClient = prisma()): Promise<EventoSaida[]> {
  const de = paraDate(somarDias(hoje, -JANELA_PASSADA));
  const ate = paraDate(somarDias(hoje, JANELA_FUTURA));
  const processo = {
    select: {
      id: true,
      numeroCnj: true,
      segredoJustica: true,
      partes: { where: { ehClienteDoEscritorio: true }, select: { pessoa: { select: { nome: true } } } },
    },
  } as const;
  const [prazos, audiencias, compromissos] = await Promise.all([
    cliente.prazo.findMany({
      where: { situacao: "ABERTO", excluidoEm: null, processo: { excluidoEm: null }, dataFinalEfetiva: { gte: de, lte: ate } },
      include: { processo, responsavel: { select: { nome: true } } },
      orderBy: { dataFinalEfetiva: "asc" },
    }),
    cliente.audiencia.findMany({
      where: { excluidoEm: null, uidExterno: null, processo: { excluidoEm: null }, dataHora: { gte: de, lte: ate } },
      include: { processo, responsavel: { select: { nome: true } }, tipo: true },
    }),
    cliente.compromisso.findMany({
      where: { excluidoEm: null, uidExterno: null, inicio: { gte: de, lte: ate }, OR: [{ processoId: null }, { processo: { excluidoEm: null } }] },
      include: { processo, responsavel: { select: { nome: true } } },
    }),
  ]);
  type P = (typeof prazos)[number]["processo"];
  const numero = (p: P) => p.numeroCnj ?? "processo sem número";
  const detalhes = (p: P | null, responsavel: string, extra: string[] = []) =>
    [
      ...(p ? [`Processo: ${numero(p)}`] : []),
      ...(p && !p.segredoJustica && p.partes.length ? [`Cliente: ${p.partes.map((x) => x.pessoa.nome).join(", ")}`] : []),
      ...(p?.segredoJustica ? ["Segredo de justiça"] : []),
      `Responsável: ${responsavel}`,
      ...extra,
      ...(p ? [`${base.replace(/\/$/, "")}/processos/${p.id}`] : []),
    ].join("\n");

  return [
    ...prazos.map<EventoSaida>((x) => ({
      uid: `prazo-${x.id}${SUFIXO_UID}`,
      titulo: `Prazo${x.conferidoEm ? "" : " (não conferido)"}: ${x.descricao} — ${numero(x.processo)}`,
      descricao: detalhes(x.processo, x.responsavel.nome, [`Data final: ${formatarData(paraDataCivil(x.dataFinalEfetiva))}`]),
      data: paraDataCivil(x.dataFinalEfetiva),
    })),
    ...audiencias.map<EventoSaida>((x) => ({
      uid: `audiencia-${x.id}${SUFIXO_UID}`,
      titulo: `Audiência (${x.tipo.valor}) — ${numero(x.processo)}`,
      descricao: detalhes(x.processo, x.responsavel.nome, [`Data e hora: ${formatarDataHora(x.dataHora)}`]),
      local: x.localOuLink,
      inicio: x.dataHora,
    })),
    ...compromissos.map<EventoSaida>((x) => ({
      uid: `compromisso-${x.id}${SUFIXO_UID}`,
      titulo: x.processo ? `${x.titulo} — ${numero(x.processo)}` : x.titulo,
      descricao: detalhes(x.processo, x.responsavel.nome, x.descricao ? [x.descricao] : []),
      local: x.local,
      ...(x.diaInteiro ? { data: dataNoFuso(x.inicio) } : { inicio: x.inicio, fim: x.fim }),
    })),
  ];
}

export const NOME_AGENDA = "Medeiros e Barbosa — prazos e audiências";

export async function icsDaAgenda(base: string, hoje: DataCivil = hojeSp(), cliente: PrismaClient = prisma()) {
  return gerarIcs(NOME_AGENDA, await eventosParaGoogle(base, hoje, cliente));
}

/** Agenda para o endereço de assinatura; null se o token não confere ou se está desligada. */
export async function icsDaAssinatura(token: string, base: string, cliente: PrismaClient = prisma()): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const c = await cliente.configuracaoEscritorio.findUnique({ where: { id: 1 }, select: { agendaTokenHash: true } });
  if (!c?.agendaTokenHash) return null;
  const a = createHash("sha256").update(c.agendaTokenHash).digest();
  const b = createHash("sha256").update(hashToken(token)).digest();
  if (!timingSafeEqual(a, b)) return null;
  return icsDaAgenda(base, hojeSp(), cliente);
}

/** Exportação avulsa (.ics para importar uma vez no Google), só administrador. */
export async function icsParaDownload(admin: UsuarioAtual, base: string, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "agenda.google");
  return icsDaAgenda(base, hojeSp(), cliente);
}

// Processos, partes e vínculos (seções 3, 4.1, 4.3 e 5).

import { z } from "zod";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { validarNumeroCnj } from "@/dominio/cnj/numero-cnj";
import { paraDate } from "@/lib/hoje";
import type { UsuarioAtual } from "../auth/usuario";
import { comUsuario, prisma, type Transacao } from "../db/prisma";
import { NaoEncontradoError, ProibidoError, RegraDeNegocioError } from "../erros";
import { exigirPermissao, pode } from "../permissoes/matriz";
import { filtroProcessosVisiveis } from "../permissoes/visibilidade";
import { booleano, dataOpcional, idOpcional, lista, processoVisivel, textoOpcional } from "./comum";

/** "1.234,56" ou "1234.56" → "1234.56". */
const valorMonetario = z.preprocess((v) => {
  if (typeof v !== "string" || v.trim() === "") return undefined;
  const t = v.replace(/[R$\s]/g, "");
  return t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
}, z.string().regex(/^\d+(\.\d{1,2})?$/, "Valor da causa inválido.").optional());

export const esquemaStatus = z.object({
  statusId: z.uuid("Escolha o status."),
  motivoSuspensao: textoOpcional,
  dataSuspensao: dataOpcional,
  dataEncerramento: dataOpcional,
  dataResultado: dataOpcional,
});

export const esquemaProcesso = esquemaStatus.extend({
  numeroCnj: textoOpcional,
  grau: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["PRIMEIRO", "SEGUNDO", "RECURSAL", "SUPERIOR"]).optional()),
  orgaoJulgador: textoOpcional,
  comarcaId: idOpcional,
  areaId: z.uuid("Escolha a área."),
  classeId: idOpcional,
  assunto: textoOpcional,
  dataDistribuicao: dataOpcional,
  dataCitacao: dataOpcional,
  valorCausa: valorMonetario,
  faseAtual: textoOpcional,
  segredoJustica: booleano,
  responsavelId: z.uuid("Escolha o advogado responsável."),
  observacoes: textoOpcional,
  cadastroIncompleto: booleano,
  pendencias: textoOpcional,
});

export const esquemaParte = z.object({
  pessoaId: z.uuid("Escolha a pessoa."),
  polo: z.enum(["ATIVO", "PASSIVO", "TERCEIRO", "OUTRO"]),
  qualificacaoIds: lista(z.uuid()),
  ehClienteDoEscritorio: booleano,
});

type DadosStatus = z.infer<typeof esquemaStatus>;

/** Regras da seção 4.3 e A4. Devolve os campos de status a gravar. */
async function aplicarRegrasDeStatus(tx: Transacao, usuario: UsuarioAtual, dados: DadosStatus, statusAnteriorId?: string) {
  const status = await tx.statusProcesso.findFirst({ where: { id: dados.statusId, ativo: true } });
  if (!status) throw new RegraDeNegocioError("Status inválido.");
  if (statusAnteriorId && statusAnteriorId !== status.id) {
    const anterior = await tx.statusProcesso.findUniqueOrThrow({ where: { id: statusAnteriorId } });
    if (anterior.comportamento === "ENCERRADO_EXIGE_DATA" && status.comportamento !== "ENCERRADO_EXIGE_DATA" && !pode(usuario.perfil, "processo.reabrir")) {
      throw new ProibidoError(`Somente um administrador pode reabrir processo com status "${anterior.nome}".`);
    }
  }
  const campos = {
    statusId: status.id,
    motivoSuspensao: null as string | null,
    dataSuspensao: null as Date | null,
    dataEncerramento: null as Date | null,
    resultado: status.resultado,
    dataResultado: null as Date | null,
  };
  switch (status.comportamento) {
    case "SUSPENSO_EXIGE_MOTIVO":
      if (!dados.motivoSuspensao) throw new RegraDeNegocioError(`O status "${status.nome}" exige o motivo (ex.: "Tema 1414/STJ").`);
      campos.motivoSuspensao = dados.motivoSuspensao;
      campos.dataSuspensao = dados.dataSuspensao ? paraDate(dados.dataSuspensao) : null;
      break;
    case "ENCERRADO_EXIGE_DATA":
      if (!dados.dataEncerramento) throw new RegraDeNegocioError(`O status "${status.nome}" exige a data de encerramento.`);
      campos.dataEncerramento = paraDate(dados.dataEncerramento);
      campos.dataResultado = dados.dataResultado ? paraDate(dados.dataResultado) : null;
      break;
    case "CONCLUIDO_NAO_DEFINITIVO":
      // A4: acordo homologado equivale a sentença; a data da homologação é a data do resultado.
      if (!dados.dataResultado) throw new RegraDeNegocioError(`O status "${status.nome}" exige a data da homologação.`);
      campos.dataResultado = paraDate(dados.dataResultado);
      break;
    case "ATIVO":
      campos.resultado = null;
      break;
  }
  return campos;
}

/** Valida o número CNJ (4.1) e preenche ano, segmento, tribunal e origem. */
async function camposCnj(tx: Transacao, numero: string | undefined) {
  if (!numero) return { numeroCnj: null, cnjAno: null, cnjSegmento: null, cnjOrigem: null, tribunalCodigo: null };
  const r = validarNumeroCnj(numero);
  if (!r.valido) throw new RegraDeNegocioError(`Número CNJ: ${r.erro}`);
  const n = r.numero;
  // Tribunal fora da tabela: o número é aceito e o tribunal fica em branco (decisão CNJ).
  const tribunal = await tx.tribunal.findUnique({ where: { codigo: n.codigoTribunal } });
  return {
    numeroCnj: n.formatado,
    cnjAno: n.ano,
    cnjSegmento: n.segmento,
    cnjOrigem: n.origem,
    tribunalCodigo: tribunal?.codigo ?? null,
  };
}

async function validarResponsavel(tx: Transacao, id: string) {
  const u = await tx.usuario.findFirst({ where: { id, ativo: true } });
  // Seção 2: todo processo tem um advogado responsável (os sócios são administradores e advogados).
  if (!u || u.perfil === "ASSISTENTE") throw new RegraDeNegocioError("O responsável deve ser um advogado ou sócio ativo.");
}

function camposComuns(d: z.infer<typeof esquemaProcesso>) {
  const data = (v?: string) => (v ? paraDate(v) : null);
  return {
    grau: d.grau ?? null,
    orgaoJulgador: d.orgaoJulgador ?? null,
    comarcaId: d.comarcaId ?? null,
    areaId: d.areaId,
    classeId: d.classeId ?? null,
    assunto: d.assunto ?? null,
    dataDistribuicao: data(d.dataDistribuicao),
    dataCitacao: data(d.dataCitacao),
    valorCausa: d.valorCausa ?? null,
    faseAtual: d.faseAtual ?? null,
    segredoJustica: d.segredoJustica,
    responsavelId: d.responsavelId,
    observacoes: d.observacoes ?? null,
    cadastroIncompleto: d.cadastroIncompleto,
    pendencias: d.pendencias ?? null,
  };
}

function traduzirUnicidade(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    throw new RegraDeNegocioError("Já existe processo cadastrado com este número CNJ.");
  }
  throw e;
}

export async function criarProcesso(
  usuario: UsuarioAtual,
  entrada: unknown,
  partes: unknown[] = [],
  cliente: PrismaClient = prisma(),
) {
  exigirPermissao(usuario, "processo.editar");
  const d = esquemaProcesso.parse(entrada);
  const listaPartes = partes.map((p) => esquemaParte.parse(p));
  return comUsuario(
    usuario.id,
    async (tx) => {
      await validarResponsavel(tx, d.responsavelId);
      const processo = await tx.processo.create({
        data: { ...camposComuns(d), ...(await camposCnj(tx, d.numeroCnj)), ...(await aplicarRegrasDeStatus(tx, usuario, d)) },
      });
      for (const p of listaPartes) await gravarParte(tx, processo.id, p);
      return processo;
    },
    cliente,
  ).catch(traduzirUnicidade);
}

export async function atualizarProcesso(usuario: UsuarioAtual, id: string, entrada: unknown, cliente: PrismaClient = prisma()) {
  exigirPermissao(usuario, "processo.editar");
  const d = esquemaProcesso.parse(entrada);
  return comUsuario(
    usuario.id,
    async (tx) => {
      const atual = await processoVisivel(tx, usuario, id);
      await validarResponsavel(tx, d.responsavelId);
      return tx.processo.update({
        where: { id },
        data: {
          ...camposComuns(d),
          ...(await camposCnj(tx, d.numeroCnj)),
          ...(await aplicarRegrasDeStatus(tx, usuario, d, atual.statusId)),
        },
      });
    },
    cliente,
  ).catch(traduzirUnicidade);
}

/** Ação "alterar status" da ficha do processo. */
export async function alterarStatus(usuario: UsuarioAtual, id: string, entrada: unknown, cliente: PrismaClient = prisma()) {
  exigirPermissao(usuario, "processo.editar");
  const d = esquemaStatus.parse(entrada);
  return comUsuario(
    usuario.id,
    async (tx) => {
      const atual = await processoVisivel(tx, usuario, id);
      return tx.processo.update({ where: { id }, data: await aplicarRegrasDeStatus(tx, usuario, d, atual.statusId) });
    },
    cliente,
  );
}

async function gravarParte(tx: Transacao, processoId: string, p: z.infer<typeof esquemaParte>) {
  const pessoa = await tx.pessoa.findFirst({ where: { id: p.pessoaId, excluidoEm: null } });
  if (!pessoa) throw new RegraDeNegocioError("Pessoa não encontrada.");
  const qualificacoes = await tx.itemLista.findMany({
    where: { id: { in: p.qualificacaoIds }, lista: "QUALIFICACAO_PARTE" },
    select: { id: true },
  });
  try {
    return await tx.parteProcesso.create({
      data: {
        processoId,
        pessoaId: p.pessoaId,
        polo: p.polo,
        ehClienteDoEscritorio: p.ehClienteDoEscritorio,
        qualificacoes: { connect: qualificacoes },
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new RegraDeNegocioError(`${pessoa.nome} já está neste polo do processo.`);
    }
    throw e;
  }
}

export async function adicionarParte(usuario: UsuarioAtual, processoId: string, entrada: unknown, cliente: PrismaClient = prisma()) {
  exigirPermissao(usuario, "processo.editar");
  const p = esquemaParte.parse(entrada);
  return comUsuario(
    usuario.id,
    async (tx) => {
      await processoVisivel(tx, usuario, processoId);
      return gravarParte(tx, processoId, p);
    },
    cliente,
  );
}

/** D10: tirar uma parte do processo é edição (registrada no histórico), não exclusão. */
export async function removerParte(usuario: UsuarioAtual, parteId: string, cliente: PrismaClient = prisma()) {
  exigirPermissao(usuario, "processo.editar");
  return comUsuario(
    usuario.id,
    async (tx) => {
      const parte = await tx.parteProcesso.findUnique({ where: { id: parteId } });
      if (!parte) throw new NaoEncontradoError("Parte não encontrada.");
      await processoVisivel(tx, usuario, parte.processoId);
      await tx.parteProcesso.update({ where: { id: parteId }, data: { qualificacoes: { set: [] } } });
      await tx.parteProcesso.delete({ where: { id: parteId } });
    },
    cliente,
  );
}

export const esquemaVinculo = z.object({
  numeroCnj: z.string().trim().min(1, "Informe o número do processo a vincular."),
  tipo: z.enum(["RECURSO", "CUMPRIMENTO_SENTENCA", "INCIDENTE", "CONEXO", "REPROPOSITURA", "APENSO"]),
});

export async function vincularProcesso(usuario: UsuarioAtual, origemId: string, entrada: unknown, cliente: PrismaClient = prisma()) {
  exigirPermissao(usuario, "processo.editar");
  const d = esquemaVinculo.parse(entrada);
  const r = validarNumeroCnj(d.numeroCnj);
  if (!r.valido) throw new RegraDeNegocioError(`Número CNJ: ${r.erro}`);
  return comUsuario(
    usuario.id,
    async (tx) => {
      await processoVisivel(tx, usuario, origemId);
      const alvo = await tx.processo.findFirst({
        where: { numeroCnj: r.numero.formatado, excluidoEm: null, AND: [filtroProcessosVisiveis(usuario)] },
      });
      if (!alvo) throw new RegraDeNegocioError("Processo a vincular não encontrado. Cadastre-o antes de vincular.");
      if (alvo.id === origemId) throw new RegraDeNegocioError("Um processo não pode ser vinculado a ele mesmo.");
      const existe = await tx.vinculoProcesso.findFirst({
        where: {
          OR: [
            { processoOrigemId: origemId, processoVinculadoId: alvo.id },
            { processoOrigemId: alvo.id, processoVinculadoId: origemId },
          ],
          tipo: d.tipo,
        },
      });
      if (existe) throw new RegraDeNegocioError("Os processos já estão vinculados com este tipo.");
      return tx.vinculoProcesso.create({ data: { processoOrigemId: origemId, processoVinculadoId: alvo.id, tipo: d.tipo } });
    },
    cliente,
  );
}

export async function desvincularProcesso(usuario: UsuarioAtual, vinculoId: string, cliente: PrismaClient = prisma()) {
  exigirPermissao(usuario, "processo.editar");
  return comUsuario(
    usuario.id,
    async (tx) => {
      const v = await tx.vinculoProcesso.findUnique({ where: { id: vinculoId } });
      if (!v) throw new NaoEncontradoError("Vínculo não encontrado.");
      await processoVisivel(tx, usuario, v.processoOrigemId);
      await tx.vinculoProcesso.delete({ where: { id: vinculoId } });
    },
    cliente,
  );
}

/** Tudo o que a Ficha do processo mostra (seção 5). */
export async function obterFichaProcesso(usuario: UsuarioAtual, id: string, cliente: PrismaClient = prisma()) {
  return cliente.$transaction(async (tx) => {
    const p = await processoVisivel(tx, usuario, id, {
      status: true,
      area: true,
      classe: true,
      comarca: true,
      tribunal: true,
      responsavel: { select: { id: true, nome: true } },
      partes: { include: { pessoa: { select: { id: true, nome: true, tipo: true, ehCliente: true } }, qualificacoes: true } },
      andamentos: { where: { excluidoEm: null }, include: { tipo: true, usuario: { select: { nome: true } } }, orderBy: [{ data: "desc" }, { criadoEm: "desc" }] },
      prazos: { where: { excluidoEm: null }, include: { responsavel: { select: { id: true, nome: true } }, conferidoPor: { select: { nome: true } } }, orderBy: { dataFinalEfetiva: "asc" } },
      audiencias: { where: { excluidoEm: null }, include: { tipo: true, responsavel: { select: { nome: true } } }, orderBy: { dataHora: "asc" } },
      compromissos: { where: { excluidoEm: null }, include: { responsavel: { select: { nome: true } } }, orderBy: { inicio: "asc" } },
    });
    const visivel = filtroProcessosVisiveis(usuario);
    const resumo = { select: { id: true, numeroCnj: true, assunto: true, status: { select: { nome: true } } } } as const;
    // Sequencial: numa transação, as consultas usam a mesma conexão.
    const origem = await tx.vinculoProcesso.findMany({
      where: { processoOrigemId: id, processoVinculado: { excluidoEm: null, AND: [visivel] } },
      include: { processoVinculado: resumo },
    });
    const destino = await tx.vinculoProcesso.findMany({
      where: { processoVinculadoId: id, processoOrigem: { excluidoEm: null, AND: [visivel] } },
      include: { processoOrigem: resumo },
    });
    const vinculos = [
      ...origem.map((v) => ({ id: v.id, tipo: v.tipo, sentido: "origem" as const, processo: v.processoVinculado })),
      ...destino.map((v) => ({ id: v.id, tipo: v.tipo, sentido: "destino" as const, processo: v.processoOrigem })),
    ];
    return { ...p, vinculos };
  });
}

/** Busca da lista de processos (seção 5): número, cliente ou parte contrária. */
export interface FiltrosProcessos {
  termo?: string;
  areaId?: string;
  statusId?: string;
  tribunalCodigo?: string;
  comarcaId?: string;
  responsavelId?: string;
  parteId?: string;
  /** "ativos": exceto encerrados e arquivados (seção 6). */
  situacao?: string;
  semNumero?: string;
  semComarca?: string;
}

export async function buscarProcessos(
  usuario: UsuarioAtual,
  filtros: FiltrosProcessos,
  cliente: PrismaClient = prisma(),
  limite = 200,
) {
  const termo = filtros.termo?.trim();
  // Número completo digitado sem pontuação: busca pela forma gravada (formatada).
  const cnj = termo ? validarNumeroCnj(termo) : null;
  const numero = cnj?.valido ? cnj.numero.formatado : termo;
  const where: Prisma.ProcessoWhereInput = {
    excluidoEm: null,
    AND: [
      filtroProcessosVisiveis(usuario),
      termo
        ? {
            OR: [
              { numeroCnj: { contains: numero } },
              { assunto: { contains: termo, mode: "insensitive" as const } },
              { partes: { some: { pessoa: { nome: { contains: termo, mode: "insensitive" as const } } } } },
            ],
          }
        : {},
      filtros.areaId ? { areaId: filtros.areaId } : {},
      filtros.statusId ? { statusId: filtros.statusId } : {},
      filtros.tribunalCodigo ? { tribunalCodigo: filtros.tribunalCodigo } : {},
      filtros.responsavelId ? { responsavelId: filtros.responsavelId } : {},
      filtros.parteId ? { partes: { some: { pessoaId: filtros.parteId } } } : {},
      filtros.comarcaId ? { comarcaId: filtros.comarcaId } : {},
      filtros.semComarca ? { comarcaId: null } : {},
      filtros.semNumero ? { numeroCnj: null } : {},
      filtros.situacao === "ativos" ? { status: { comportamento: { not: "ENCERRADO_EXIGE_DATA" as const } } } : {},
    ],
  };
  return cliente.processo.findMany({
    where,
    include: {
      status: true,
      area: true,
      comarca: true,
      tribunal: true,
      responsavel: { select: { nome: true } },
      partes: { include: { pessoa: { select: { id: true, nome: true } } } },
    },
    orderBy: [{ atualizadoEm: "desc" }],
    take: limite,
  });
}

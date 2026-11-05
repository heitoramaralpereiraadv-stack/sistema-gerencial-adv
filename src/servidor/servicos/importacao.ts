// Importação da planilha (seção 8.1): lote em revisão → decisões → gravação numa única
// transação → relatório. Somente administrador.

import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { lerPlanilha, PlanilhaInvalidaError, type LinhasPlanilha } from "@/importacao/planilha";
import {
  conciliacao,
  decisoesVazias,
  esquemaAjustes,
  montarProposta,
  type Ajustes,
  type Decisoes,
} from "@/importacao/proposta";
import { paraDate } from "@/lib/hoje";
import type { UsuarioAtual } from "../auth/usuario";
import { comUsuario, prisma, type Transacao } from "../db/prisma";
import { NaoEncontradoError, RegraDeNegocioError } from "../erros";
import { exigirPermissao } from "../permissoes/matriz";

interface ConteudoLote {
  linhas: LinhasPlanilha;
  ajustes: Ajustes;
  decisoes: Decisoes;
}

const comoJson = (v: unknown) => v as Prisma.InputJsonObject;

export async function criarLote(
  admin: UsuarioAtual,
  arquivo: { nome: string; conteudo: Buffer },
  ajustesTexto: string | null,
  cliente: PrismaClient = prisma(),
) {
  exigirPermissao(admin, "importacao.executar");
  let linhas: LinhasPlanilha;
  try {
    linhas = await lerPlanilha(arquivo.conteudo);
  } catch (e) {
    if (e instanceof PlanilhaInvalidaError) throw new RegraDeNegocioError(e.message);
    throw e;
  }
  let ajustes: Ajustes = { clientes: {}, processos: {}, naoMesclar: [] };
  if (ajustesTexto?.trim()) {
    try {
      ajustes = esquemaAjustes.parse(JSON.parse(ajustesTexto));
    } catch {
      throw new RegraDeNegocioError("Arquivo de ajustes inválido (JSON fora do formato esperado).");
    }
  }
  const conteudo: ConteudoLote = { linhas, ajustes, decisoes: decisoesVazias() };
  return cliente.loteImportacao.create({
    data: {
      arquivo: arquivo.nome,
      hashArquivo: createHash("sha256").update(arquivo.conteudo).digest("hex"),
      proposta: comoJson(conteudo),
      criadoPorId: admin.id,
    },
  });
}

async function lote(cliente: PrismaClient | Transacao, id: string) {
  const l = await cliente.loteImportacao.findUnique({ where: { id } });
  if (!l) throw new NaoEncontradoError("Lote de importação não encontrado.");
  return { ...l, conteudo: l.proposta as unknown as ConteudoLote };
}

export function listarLotes(admin: UsuarioAtual, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "importacao.executar");
  return cliente.loteImportacao.findMany({
    select: { id: true, arquivo: true, situacao: true, criadoEm: true, gravadoEm: true, criadoPor: { select: { nome: true } } },
    orderBy: { criadoEm: "desc" },
  });
}

/** Lote com a proposta recalculada a partir das decisões já salvas. */
export async function obterLote(admin: UsuarioAtual, id: string, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "importacao.executar");
  const l = await lote(cliente, id);
  const proposta = montarProposta(l.conteudo.linhas, l.conteudo.ajustes, l.conteudo.decisoes);
  return { ...l, proposta, conciliacao: conciliacao(l.conteudo.linhas, proposta), decisoes: l.conteudo.decisoes };
}

const esquemaDecisoes = z.object({
  separacoes: z.record(z.string(), z.boolean()),
  partesSeparadas: z.record(z.string(), z.array(z.string().trim().min(1).max(200))).optional(),
  mesclagens: z.record(z.string(), z.object({ aceita: z.boolean(), nome: z.string().max(200).optional() })),
  responsaveis: z.record(z.string(), z.string()),
});

export async function salvarDecisoes(admin: UsuarioAtual, id: string, entrada: unknown, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "importacao.executar");
  const d = esquemaDecisoes.parse(entrada);
  const l = await lote(cliente, id);
  if (l.situacao !== "EM_REVISAO") throw new RegraDeNegocioError("Este lote não está mais em revisão.");
  const usuarios = await cliente.usuario.findMany({ where: { id: { in: Object.values(d.responsaveis) }, ativo: true } });
  for (const [nome, uid] of Object.entries(d.responsaveis)) {
    const u = usuarios.find((x) => x.id === uid);
    if (!u) throw new RegraDeNegocioError(`Usuário escolhido para "${nome}" não existe ou está inativo.`);
    if (u.perfil === "ASSISTENTE") throw new RegraDeNegocioError(`O responsável por processos deve ser advogado ou sócio ("${nome}").`);
  }
  const conteudo: ConteudoLote = { ...l.conteudo, decisoes: { ...d, revisadoEm: new Date().toISOString() } };
  await cliente.loteImportacao.update({ where: { id }, data: { proposta: comoJson(conteudo) } });
}

export async function descartarLote(admin: UsuarioAtual, id: string, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "importacao.executar");
  const l = await lote(cliente, id);
  if (l.situacao !== "EM_REVISAO") throw new RegraDeNegocioError("Só lotes em revisão podem ser descartados.");
  await cliente.loteImportacao.update({ where: { id }, data: { situacao: "DESCARTADO" } });
}

/** Grava a proposta revisada numa única transação: ou entra tudo, ou nada. */
export async function gravarLote(admin: UsuarioAtual, id: string, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "importacao.executar");
  const l = await obterLote(admin, id, cliente);
  if (l.situacao !== "EM_REVISAO") throw new RegraDeNegocioError("Este lote não está mais em revisão.");
  if (l.proposta.erros.length) throw new RegraDeNegocioError(`Há pendências que impedem a gravação: ${l.proposta.erros.join(" ")}`);
  const ja = await cliente.loteImportacao.findFirst({ where: { situacao: "GRAVADO" } });
  if (ja) throw new RegraDeNegocioError("A planilha já foi importada (há um lote gravado). A importação é feita uma única vez.");

  const { proposta, decisoes } = l;
  const numeros = proposta.processos.map((p) => p.numeroCnj).filter((n): n is string => !!n);
  const existentes = await cliente.processo.findMany({ where: { numeroCnj: { in: numeros } }, select: { numeroCnj: true } });
  if (existentes.length) {
    throw new RegraDeNegocioError(
      `Já existem no sistema processos com estes números: ${existentes.map((e) => e.numeroCnj).join(", ")}. Exclua ou ajuste antes de importar.`,
    );
  }
  const relatorio = await comUsuario(
    admin.id,
    async (tx) => {
      const itens = await tx.itemLista.findMany();
      const item = async (lista: "AREA" | "CATEGORIA_PARTE" | "QUALIFICACAO_PARTE", valor: string) => {
        const achado = itens.find((i) => i.lista === lista && i.valor === valor);
        if (achado) return achado.id;
        if (lista === "AREA") throw new RegraDeNegocioError(`Área "${valor}" não existe nas listas do sistema.`);
        const novo = await tx.itemLista.create({ data: { lista, valor, ordem: 99 } });
        itens.push(novo);
        return novo.id;
      };
      const status = new Map((await tx.statusProcesso.findMany()).map((s) => [s.nome, s]));
      const responsavel = (nome: string | null) => (nome ? decisoes.responsaveis[nome]! : decisoes.responsaveis[proposta.responsaveis[0]!]!);

      // Comarcas
      const comarcas = new Map<string, string>();
      for (const p of proposta.processos) {
        if (!p.comarca) continue;
        const chave = `${p.comarca.nome}|${p.comarca.uf}`;
        if (comarcas.has(chave)) continue;
        const existente = await tx.comarca.findUnique({ where: { nome_uf: { nome: p.comarca.nome, uf: p.comarca.uf } } });
        const c =
          existente ??
          (await tx.comarca.create({
            data: { nome: p.comarca.nome, uf: p.comarca.uf, tribunalCodigo: p.comarca.tribunalCodigo, codigoOrigem: p.comarca.codigoOrigem },
          }));
        comarcas.set(chave, c.id);
      }

      // Pessoas
      const idPessoa = new Map<string, string>();
      for (const p of proposta.pessoas) {
        const observacoes = p.outrosNomes.length ? `Também citado na planilha como: ${p.outrosNomes.join("; ")}.` : null;
        const criada = await tx.pessoa.create({
          data: {
            tipo: p.tipo,
            nome: p.nome,
            categoriaId: p.categoria && p.tipo === "PJ" ? await item("CATEGORIA_PARTE", p.categoria) : null,
            ehCliente: p.ehCliente,
            situacao: p.situacao,
            cidade: p.cidade,
            uf: p.uf,
            responsavelId: p.responsavel ? responsavel(p.responsavel) : null,
            dataEntrada: p.dataEntrada ? paraDate(p.dataEntrada) : null,
            codigoLegado: p.codigoLegado,
            cadastroIncompleto: p.pendencias.length > 0,
            pendencias: p.pendencias.join("; ") || null,
            observacoes,
          },
        });
        idPessoa.set(p.chave, criada.id);
      }

      // Processos e partes
      const idProcesso = new Map<string, string>();
      for (const p of proposta.processos) {
        const s = status.get(p.status);
        if (!s) throw new RegraDeNegocioError(`${p.codigoLegado}: status "${p.status}" não existe.`);
        const criado = await tx.processo.create({
          data: {
            numeroCnj: p.numeroCnj,
            cnjAno: p.cnjAno,
            cnjSegmento: p.cnjSegmento,
            cnjOrigem: p.cnjOrigem,
            tribunalCodigo: p.tribunalCodigo,
            grau: p.grau,
            orgaoJulgador: p.orgaoJulgador,
            comarcaId: p.comarca ? comarcas.get(`${p.comarca.nome}|${p.comarca.uf}`)! : null,
            areaId: await item("AREA", p.area),
            assunto: p.assunto,
            dataDistribuicao: p.dataDistribuicao ? paraDate(p.dataDistribuicao) : null,
            dataCitacao: p.dataCitacao ? paraDate(p.dataCitacao) : null,
            statusId: s.id,
            resultado: s.resultado,
            faseAtual: p.faseAtual,
            motivoSuspensao: p.motivoSuspensao,
            responsavelId: responsavel(p.responsavel),
            observacoes: p.observacoes,
            cadastroIncompleto: p.pendencias.length > 0,
            pendencias: p.pendencias.join("; ") || null,
            codigoLegado: p.codigoLegado,
          },
        });
        idProcesso.set(p.codigoLegado, criado.id);
        for (const parte of p.partes) {
          const qualificacoes = [];
          for (const q of parte.qualificacoes) qualificacoes.push({ id: await item("QUALIFICACAO_PARTE", q) });
          await tx.parteProcesso.create({
            data: {
              processoId: criado.id,
              pessoaId: idPessoa.get(parte.pessoa)!,
              polo: parte.polo,
              ehClienteDoEscritorio: parte.ehCliente,
              qualificacoes: { connect: qualificacoes },
            },
          });
        }
      }
      for (const v of proposta.vinculos) {
        await tx.vinculoProcesso.create({
          data: { processoOrigemId: idProcesso.get(v.origem)!, processoVinculadoId: idProcesso.get(v.destino)!, tipo: "RELACIONADO" },
        });
      }

      const mesclagensAceitas = proposta.mesclagens.filter((m) => m.aceita);
      return {
        gravadoEm: new Date().toISOString(),
        processos: proposta.processos.filter((p) => !p.codigoLegado.includes("-R")).length,
        processosRelacionados: proposta.processos.filter((p) => p.codigoLegado.includes("-R")).length,
        clientes: proposta.pessoas.filter((p) => p.ehCliente).length,
        demaisPartes: proposta.pessoas.filter((p) => !p.ehCliente).length,
        comarcas: comarcas.size,
        vinculos: proposta.vinculos.length,
        mesclagens: { grupos: mesclagensAceitas.length, cadastrosUnidos: mesclagensAceitas.reduce((n, m) => n + m.nomes.length - 1, 0) },
        separacoes: proposta.separacoes.filter((s) => s.separar).length,
        pendentes: [
          ...proposta.processos.filter((p) => p.pendencias.length).map((p) => ({ tipo: "processo", codigo: p.codigoLegado, nome: p.numeroCnj ?? "sem número", pendencias: p.pendencias })),
          ...proposta.pessoas.filter((p) => p.pendencias.length).map((p) => ({ tipo: "pessoa", codigo: p.codigoLegado ?? "", nome: p.nome, pendencias: p.pendencias })),
        ],
        conciliacao: l.conciliacao,
      };
    },
    cliente,
    { timeout: 120_000 },
  );

  await cliente.loteImportacao.update({
    where: { id },
    data: { situacao: "GRAVADO", gravadoEm: new Date(), relatorio: comoJson(relatorio) },
  });
  return relatorio;
}

export type RelatorioImportacao = Awaited<ReturnType<typeof gravarLote>>;

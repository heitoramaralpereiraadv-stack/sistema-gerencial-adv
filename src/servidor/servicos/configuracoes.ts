// Configurações (seção 5, somente administrador): listas de domínio, status, feriados e comarcas.

import { z } from "zod";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { paraDate } from "@/lib/hoje";
import type { UsuarioAtual } from "../auth/usuario";
import { comUsuario, prisma } from "../db/prisma";
import { NaoEncontradoError, RegraDeNegocioError } from "../erros";
import { exigirPermissao } from "../permissoes/matriz";
import { carregarFeriados } from "../seed/carga-inicial";
import { booleano, dataCivil, idOpcional, textoObrigatorio, textoOpcional } from "./comum";

const LISTAS = ["AREA", "CLASSE", "TIPO_ANDAMENTO", "CATEGORIA_PARTE", "QUALIFICACAO_PARTE", "TIPO_AUDIENCIA"] as const;

function duplicado(mensagem: string) {
  return (e: unknown): never => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new RegraDeNegocioError(mensagem);
    throw e;
  };
}

// ── Listas de domínio ───────────────────────────────────────────────

export function todosOsItens(cliente: PrismaClient = prisma()) {
  return cliente.itemLista.findMany({ orderBy: [{ lista: "asc" }, { ordem: "asc" }, { valor: "asc" }] });
}

export const esquemaItem = z.object({ lista: z.enum(LISTAS), valor: textoObrigatorio("o valor") });

export async function criarItem(admin: UsuarioAtual, entrada: unknown, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "configuracao.gerenciar");
  const d = esquemaItem.parse(entrada);
  return comUsuario(
    admin.id,
    async (tx) => {
      const ultimo = await tx.itemLista.aggregate({ where: { lista: d.lista }, _max: { ordem: true } });
      return tx.itemLista.create({ data: { ...d, ordem: (ultimo._max.ordem ?? -1) + 1 } });
    },
    cliente,
  ).catch(duplicado("Este valor já existe na lista."));
}

export const esquemaEdicaoItem = z.object({
  valor: textoObrigatorio("o valor"),
  ordem: z.coerce.number().int().min(0),
  ativo: booleano,
});

/** Itens em uso não são apagados: desativados, somem dos formulários e continuam nos registros antigos. */
export async function editarItem(admin: UsuarioAtual, id: string, entrada: unknown, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "configuracao.gerenciar");
  const d = esquemaEdicaoItem.parse(entrada);
  return comUsuario(admin.id, (tx) => tx.itemLista.update({ where: { id }, data: d }), cliente).catch(
    duplicado("Este valor já existe na lista."),
  );
}

// ── Status ──────────────────────────────────────────────────────────

/** A8: nome, ordem e ativo são editáveis; o comportamento é fixo. */
export async function editarStatus(admin: UsuarioAtual, id: string, entrada: unknown, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "configuracao.gerenciar");
  const d = z.object({ nome: textoObrigatorio("o nome"), ordem: z.coerce.number().int().min(0), ativo: booleano }).parse(entrada);
  return comUsuario(
    admin.id,
    async (tx) => {
      if (!d.ativo && (await tx.processo.count({ where: { statusId: id, excluidoEm: null } })) > 0) {
        throw new RegraDeNegocioError("Há processos com este status; altere-os antes de desativá-lo.");
      }
      return tx.statusProcesso.update({ where: { id }, data: d });
    },
    cliente,
  ).catch(duplicado("Já existe status com este nome."));
}

// ── Feriados ────────────────────────────────────────────────────────

export const esquemaFeriado = z
  .object({
    data: dataCivil,
    abrangencia: z.enum(["NACIONAL", "ESTADUAL", "MUNICIPAL", "FORENSE"]),
    natureza: z.enum(["FERIADO", "INDISPONIBILIDADE", "EXPEDIENTE_REDUZIDO"]),
    uf: z.preprocess((v) => (v === "" ? undefined : v), z.string().length(2).toUpperCase().optional()),
    comarcaId: idOpcional,
    tribunalCodigo: textoOpcional,
    descricao: textoObrigatorio("a descrição"),
    fonte: textoOpcional,
  })
  .superRefine((d, ctx) => {
    const exige = (cond: boolean, message: string) => cond || ctx.addIssue({ code: "custom", message });
    if (d.abrangencia === "ESTADUAL") exige(!!d.uf, "Feriado estadual exige a UF.");
    if (d.abrangencia === "MUNICIPAL") exige(!!d.comarcaId, "Feriado municipal exige a comarca.");
    if (d.abrangencia === "FORENSE") exige(!!d.tribunalCodigo, "Feriado forense e indisponibilidade exigem o tribunal.");
  });

export function feriadosDoAno(ano: number, cliente: PrismaClient = prisma()) {
  return cliente.feriado.findMany({
    where: { data: { gte: paraDate(`${ano}-01-01`), lte: paraDate(`${ano}-12-31`) } },
    include: { comarca: true, tribunal: true },
    orderBy: { data: "asc" },
  });
}

export async function criarFeriado(admin: UsuarioAtual, entrada: unknown, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "configuracao.gerenciar");
  const d = esquemaFeriado.parse(entrada);
  return comUsuario(
    admin.id,
    async (tx) => {
      const comarca = d.comarcaId ? await tx.comarca.findUnique({ where: { id: d.comarcaId } }) : null;
      return tx.feriado.create({
        data: {
          data: paraDate(d.data),
          abrangencia: d.abrangencia,
          natureza: d.natureza,
          uf: d.abrangencia === "ESTADUAL" ? d.uf : d.abrangencia === "MUNICIPAL" ? (comarca?.uf ?? null) : null,
          comarcaId: d.abrangencia === "MUNICIPAL" || d.abrangencia === "FORENSE" ? (d.comarcaId ?? null) : null,
          tribunalCodigo: d.abrangencia === "FORENSE" ? d.tribunalCodigo : null,
          descricao: d.descricao,
          fonte: d.fonte ?? null,
        },
      });
    },
    cliente,
  );
}

/** Remover feriado lançado por engano (fica no histórico). Prazos já calculados guardam a memória. */
export async function removerFeriado(admin: UsuarioAtual, id: string, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "configuracao.gerenciar");
  return comUsuario(admin.id, (tx) => tx.feriado.delete({ where: { id } }), cliente);
}

/** Carrega os feriados padrão (B11, B13) de um ano; não duplica os já cadastrados. */
export async function carregarFeriadosPadrao(admin: UsuarioAtual, ano: number, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "configuracao.gerenciar");
  z.number().int().min(2020).max(2100).parse(ano);
  return comUsuario(admin.id, (tx) => carregarFeriados(tx, ano), cliente);
}

// ── Comarcas ────────────────────────────────────────────────────────

export const esquemaEdicaoComarca = z.object({
  nome: textoObrigatorio("o nome"),
  uf: z.string().trim().length(2, "UF inválida.").toUpperCase(),
  tribunalCodigo: textoOpcional,
  codigoOrigem: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4}$/, "Código de origem: 4 dígitos.").optional()),
});

export async function editarComarca(admin: UsuarioAtual, id: string, entrada: unknown, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "configuracao.gerenciar");
  const d = esquemaEdicaoComarca.parse(entrada);
  return comUsuario(
    admin.id,
    (tx) => tx.comarca.update({ where: { id }, data: { ...d, tribunalCodigo: d.tribunalCodigo ?? null, codigoOrigem: d.codigoOrigem ?? null } }),
    cliente,
  ).catch(duplicado(`A comarca ${d.nome}/${d.uf} já existe; use "mesclar".`));
}

/** D14: comarca duplicada é mesclada na correta (processos e feriados passam para ela). */
export async function mesclarComarcas(admin: UsuarioAtual, entrada: unknown, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "configuracao.gerenciar");
  const { manterId, removerId } = z
    .object({ manterId: z.uuid("Escolha a comarca que fica."), removerId: z.uuid("Escolha a comarca duplicada.") })
    .refine((d) => d.manterId !== d.removerId, "Escolha duas comarcas diferentes.")
    .parse(entrada);
  return comUsuario(
    admin.id,
    async (tx) => {
      if (!(await tx.comarca.findUnique({ where: { id: manterId } }))) throw new NaoEncontradoError("Comarca não encontrada.");
      await tx.processo.updateMany({ where: { comarcaId: removerId }, data: { comarcaId: manterId } });
      await tx.feriado.updateMany({ where: { comarcaId: removerId }, data: { comarcaId: manterId } });
      await tx.comarca.delete({ where: { id: removerId } });
    },
    cliente,
  );
}

export function comarcasComUso(cliente: PrismaClient = prisma()) {
  return cliente.comarca.findMany({
    include: { tribunal: true, _count: { select: { processos: true, feriados: true } } },
    orderBy: [{ uf: "asc" }, { nome: "asc" }],
  });
}

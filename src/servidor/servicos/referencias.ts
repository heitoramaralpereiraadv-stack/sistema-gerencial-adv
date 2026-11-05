// Listas usadas nos formulários: itens de domínio, status, comarcas, usuários ativos.

import { z } from "zod";
import { Prisma, type PrismaClient, type TipoLista } from "@/generated/prisma/client";
import type { UsuarioAtual } from "../auth/usuario";
import { comUsuario, prisma } from "../db/prisma";
import { RegraDeNegocioError } from "../erros";
import { exigirPermissao } from "../permissoes/matriz";
import { textoObrigatorio } from "./comum";

export function itensDaLista(lista: TipoLista, cliente: PrismaClient = prisma()) {
  return cliente.itemLista.findMany({ where: { lista, ativo: true }, orderBy: [{ ordem: "asc" }, { valor: "asc" }] });
}

export function statusAtivos(cliente: PrismaClient = prisma()) {
  return cliente.statusProcesso.findMany({ where: { ativo: true }, orderBy: { ordem: "asc" } });
}

export function comarcas(cliente: PrismaClient = prisma()) {
  return cliente.comarca.findMany({ orderBy: [{ uf: "asc" }, { nome: "asc" }] });
}

export function tribunais(cliente: PrismaClient = prisma()) {
  return cliente.tribunal.findMany({ orderBy: { codigo: "asc" } });
}

export function usuariosAtivos(cliente: PrismaClient = prisma()) {
  return cliente.usuario.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, perfil: true, veTodosProcessos: true },
    orderBy: { nome: "asc" },
  });
}

export const esquemaComarca = z.object({
  nome: textoObrigatorio("o nome da comarca"),
  uf: z.string().trim().length(2, "UF inválida.").toUpperCase(),
});

/** D14: advogado e assistente também podem incluir comarca nova. */
export async function criarComarca(usuario: UsuarioAtual, entrada: unknown, cliente: PrismaClient = prisma()) {
  exigirPermissao(usuario, "comarca.cadastrar");
  const d = esquemaComarca.parse(entrada);
  return comUsuario(usuario.id, (tx) => tx.comarca.create({ data: d }), cliente).catch((e) => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new RegraDeNegocioError(`A comarca ${d.nome}/${d.uf} já está cadastrada.`);
    }
    throw e;
  });
}

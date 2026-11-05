// Dados fictícios para os testes de integração.

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import type { UsuarioAtual } from "@/servidor/auth/usuario";
import type { Transacao } from "@/servidor/db/prisma";
import type { Perfil } from "@/servidor/permissoes/matriz";

export async function comoSeed<T>(prisma: PrismaClient, fn: (tx: Transacao) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.origem', 'seed', true)`;
    return fn(tx);
  });
}

export async function criarUsuario(
  prisma: PrismaClient,
  perfil: Perfil,
  opcoes: { veTodosProcessos?: boolean } = {},
): Promise<UsuarioAtual> {
  const id = randomUUID();
  const dados = {
    id,
    nome: `Usuário Teste ${perfil} ${id.slice(0, 4)}`,
    email: `teste-${id}@exemplo.invalid`,
    perfil,
    veTodosProcessos: opcoes.veTodosProcessos ?? true,
  };
  await comoSeed(prisma, (tx) => tx.usuario.create({ data: dados }));
  return dados;
}

/** Área e status fictícios, criados uma vez por banco. */
export async function referencias(prisma: PrismaClient) {
  return comoSeed(prisma, async (tx) => {
    const area = await tx.itemLista.upsert({
      where: { lista_valor: { lista: "AREA", valor: "Área Fictícia" } },
      update: {},
      create: { lista: "AREA", valor: "Área Fictícia" },
    });
    const status = await tx.statusProcesso.upsert({
      where: { nome: "Status Fictício" },
      update: {},
      create: { nome: "Status Fictício", comportamento: "ATIVO" },
    });
    return { areaId: area.id, statusId: status.id };
  });
}

export async function criarProcesso(
  prisma: PrismaClient,
  responsavelId: string,
  opcoes: { segredoJustica?: boolean } = {},
) {
  const { areaId, statusId } = await referencias(prisma);
  return comoSeed(prisma, (tx) =>
    tx.processo.create({
      data: { areaId, statusId, responsavelId, assunto: "Processo fictício", segredoJustica: opcoes.segredoJustica ?? false },
    }),
  );
}

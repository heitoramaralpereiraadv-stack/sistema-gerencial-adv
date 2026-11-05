// Registro de acesso às fichas de cliente (seção 7).

import type { PrismaClient } from "@/generated/prisma/client";
import type { UsuarioAtual } from "../auth/usuario";
import { prisma } from "../db/prisma";

export async function registrarAcesso(
  usuario: UsuarioAtual,
  entidade: "pessoa" | "processo",
  registroId: string,
  cliente: PrismaClient = prisma(),
): Promise<void> {
  await cliente.registroAcesso.create({ data: { usuarioId: usuario.id, entidade, registroId } });
}

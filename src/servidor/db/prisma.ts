// Cliente do banco e transação identificada. Toda escrita passa por comUsuario: o trigger de
// histórico recusa alterações sem usuário (migração seguranca_auditoria).

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";

export type Transacao = Prisma.TransactionClient;

const global = globalThis as unknown as { prisma?: PrismaClient };

export function criarPrisma(url = process.env.DATABASE_URL): PrismaClient {
  if (!url) throw new Error("DATABASE_URL não configurada.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

export function prisma(): PrismaClient {
  global.prisma ??= criarPrisma();
  return global.prisma;
}

/** Executa `fn` numa transação em que o banco sabe quem é o usuário (para o histórico). */
export function comUsuario<T>(
  usuarioId: string,
  fn: (tx: Transacao) => Promise<T>,
  cliente: PrismaClient = prisma(),
  opcoes?: { timeout?: number },
): Promise<T> {
  return cliente.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.usuario_id', ${usuarioId}, true)`;
    return fn(tx);
  }, opcoes);
}

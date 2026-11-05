// Gestão de usuários (somente administrador). Senha e 2FA ficam no Supabase Auth; aqui ficam
// nome, perfil e situação. Não há cadastro público: o acesso começa por convite.

import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { UsuarioAtual } from "../auth/usuario";
import { comUsuario, prisma, type Transacao } from "../db/prisma";
import { NaoEncontradoError, ProibidoError } from "../erros";
import { exigirPermissao } from "../permissoes/matriz";

/** Operações no provedor de autenticação; a implementação real usa o Supabase Admin. */
export interface ProvedorAuth {
  convidar(email: string): Promise<{ id: string }>;
  bloquear(id: string): Promise<void>;
  desbloquear(id: string): Promise<void>;
}

const PERFIS = ["ADMINISTRADOR", "ADVOGADO", "ASSISTENTE"] as const;

export const esquemaNovoUsuario = z.object({
  nome: z.string().trim().min(2, "Informe o nome."),
  email: z.email("E-mail inválido.").transform((e) => e.toLowerCase()),
  perfil: z.enum(PERFIS),
  veTodosProcessos: z.boolean().default(true),
});

export const esquemaAlteracaoUsuario = z.object({
  nome: z.string().trim().min(2).optional(),
  perfil: z.enum(PERFIS).optional(),
  veTodosProcessos: z.boolean().optional(),
});

export async function listarUsuarios(admin: UsuarioAtual, cliente: PrismaClient = prisma()) {
  exigirPermissao(admin, "usuario.gerenciar");
  return cliente.usuario.findMany({ orderBy: [{ ativo: "desc" }, { nome: "asc" }] });
}

export async function convidarUsuario(
  admin: UsuarioAtual,
  entrada: unknown,
  provedor: ProvedorAuth,
  cliente: PrismaClient = prisma(),
) {
  exigirPermissao(admin, "usuario.gerenciar");
  const dados = esquemaNovoUsuario.parse(entrada);
  const { id } = await provedor.convidar(dados.email);
  return comUsuario(admin.id, (tx) => tx.usuario.create({ data: { id, ...dados } }), cliente);
}

export async function alterarUsuario(
  admin: UsuarioAtual,
  id: string,
  entrada: unknown,
  cliente: PrismaClient = prisma(),
) {
  exigirPermissao(admin, "usuario.gerenciar");
  const dados = esquemaAlteracaoUsuario.parse(entrada);
  return comUsuario(
    admin.id,
    async (tx) => {
      const atual = await tx.usuario.findUnique({ where: { id } });
      if (!atual) throw new NaoEncontradoError("Usuário não encontrado.");
      if (atual.perfil === "ADMINISTRADOR" && dados.perfil && dados.perfil !== "ADMINISTRADOR") {
        await garantirOutroAdministrador(tx, id);
      }
      return tx.usuario.update({ where: { id }, data: dados });
    },
    cliente,
  );
}

export async function definirAtivo(
  admin: UsuarioAtual,
  id: string,
  ativo: boolean,
  provedor: ProvedorAuth,
  cliente: PrismaClient = prisma(),
) {
  exigirPermissao(admin, "usuario.gerenciar");
  if (!ativo && id === admin.id) throw new ProibidoError("Você não pode desativar o próprio acesso.");
  const usuario = await comUsuario(
    admin.id,
    async (tx) => {
      const atual = await tx.usuario.findUnique({ where: { id } });
      if (!atual) throw new NaoEncontradoError("Usuário não encontrado.");
      if (!ativo && atual.perfil === "ADMINISTRADOR") await garantirOutroAdministrador(tx, id);
      return tx.usuario.update({ where: { id }, data: { ativo } });
    },
    cliente,
  );
  // O bloqueio no Supabase impede renovar a sessão; exigirUsuario já recusa quem está inativo.
  await (ativo ? provedor.desbloquear(id) : provedor.bloquear(id));
  return usuario;
}

async function garantirOutroAdministrador(tx: Transacao, excetoId: string) {
  const outros = await tx.usuario.count({
    where: { perfil: "ADMINISTRADOR", ativo: true, id: { not: excetoId } },
  });
  if (outros === 0) throw new ProibidoError("O sistema precisa de pelo menos um administrador ativo.");
}

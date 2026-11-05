import "server-only";
import { cache } from "react";
import { prisma } from "../db/prisma";
import { NaoAutenticadoError, SegundoFatorPendenteError } from "../erros";
import { usuarioDeDesenvolvimento } from "./desenvolvimento";
import { supabaseServidor } from "./supabase";
import type { UsuarioAtual } from "./usuario";

/**
 * Usuário da requisição, conferido no servidor: sessão válida no Supabase (getUser consulta o
 * servidor de autenticação), segundo fator verificado (aal2) e cadastro ativo no sistema.
 * Toda Server Action e rota de dados começa por aqui.
 */
export const exigirUsuario = cache(async (): Promise<UsuarioAtual> => {
  let id = usuarioDeDesenvolvimento();
  if (!id) {
    const supabase = await supabaseServidor();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new NaoAutenticadoError();

    const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (nivel?.currentLevel !== "aal2") {
      throw new SegundoFatorPendenteError(nivel?.nextLevel === "aal2" ? "verificar" : "cadastrar");
    }
    id = data.user.id;
  }

  const usuario = await prisma().usuario.findUnique({ where: { id } });
  if (!usuario || !usuario.ativo) throw new NaoAutenticadoError("Usuário sem acesso ao sistema.");
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    perfil: usuario.perfil,
    veTodosProcessos: usuario.veTodosProcessos,
  };
});

// Dados do escritório para o cabeçalho dos relatórios (D7). Edição só pelo administrador.

import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { UsuarioAtual } from "../auth/usuario";
import { comUsuario, prisma } from "../db/prisma";
import { RegraDeNegocioError } from "../erros";
import { exigirPermissao } from "../permissoes/matriz";
import type { Escritorio } from "../relatorios/tipos";
import { booleano, textoObrigatorio, textoOpcional } from "./comum";

const PADRAO: Escritorio = {
  razaoSocial: "Medeiros e Barbosa Sociedade de Advogados",
  cnpj: null, registroOab: null, endereco: null, telefone: null, email: null, logoBase64: null, logoTipo: null,
};

export async function obterEscritorio(cliente: PrismaClient = prisma()): Promise<Escritorio> {
  return (await cliente.configuracaoEscritorio.findUnique({ where: { id: 1 } })) ?? PADRAO;
}

export const esquemaEscritorio = z.object({
  razaoSocial: textoObrigatorio("a razão social"),
  cnpj: textoOpcional,
  registroOab: textoOpcional,
  endereco: textoOpcional,
  telefone: textoOpcional,
  email: textoOpcional,
  removerLogo: booleano,
});

const TIPOS_LOGO = ["image/png", "image/jpeg"];
const TAMANHO_LOGO = 200 * 1024;

export async function salvarEscritorio(
  admin: UsuarioAtual,
  entrada: unknown,
  logo: { tipo: string; conteudo: Buffer } | null,
  cliente: PrismaClient = prisma(),
) {
  exigirPermissao(admin, "configuracao.gerenciar");
  const d = esquemaEscritorio.parse(entrada);
  if (logo && !TIPOS_LOGO.includes(logo.tipo)) throw new RegraDeNegocioError("O logotipo deve ser PNG ou JPEG.");
  if (logo && logo.conteudo.length > TAMANHO_LOGO) throw new RegraDeNegocioError("O logotipo deve ter até 200 KB.");
  const { removerLogo, ...campos } = d;
  const dados = {
    razaoSocial: campos.razaoSocial,
    cnpj: campos.cnpj ?? null,
    registroOab: campos.registroOab ?? null,
    endereco: campos.endereco ?? null,
    telefone: campos.telefone ?? null,
    email: campos.email ?? null,
    ...(logo && { logoBase64: logo.conteudo.toString("base64"), logoTipo: logo.tipo }),
    ...(removerLogo && !logo && { logoBase64: null, logoTipo: null }),
  };
  return comUsuario(admin.id, (tx) => tx.configuracaoEscritorio.upsert({ where: { id: 1 }, update: dados, create: { id: 1, ...dados } }), cliente);
}

/** Campos do cabeçalho que ainda faltam (D7). */
export function pendenciasDoCabecalho(e: Escritorio): string[] {
  return [!e.cnpj && "CNPJ", !e.registroOab && "registro na OAB", !e.endereco && "endereço", !e.logoBase64 && "logotipo"].filter(
    (x): x is string => !!x,
  );
}

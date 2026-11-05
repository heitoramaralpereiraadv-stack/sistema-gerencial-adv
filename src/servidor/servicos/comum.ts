// Esquemas e utilidades compartilhados pelos serviços. Os formulários chegam como FormData:
// campos vazios viram "não informado" e caixas de seleção viram booleanos.

import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { UsuarioAtual } from "../auth/usuario";
import type { Transacao } from "../db/prisma";
import { NaoEncontradoError } from "../erros";
import { filtroProcessosVisiveis } from "../permissoes/visibilidade";

const vazioParaIndefinido = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const textoOpcional = z.preprocess(vazioParaIndefinido, z.string().trim().optional());
export const textoObrigatorio = (rotulo: string) =>
  z.string({ error: `Informe ${rotulo}.` }).trim().min(1, `Informe ${rotulo}.`);
export const idOpcional = z.preprocess(vazioParaIndefinido, z.uuid().optional());
export const dataCivil = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
export const dataOpcional = z.preprocess(vazioParaIndefinido, dataCivil.optional());
export const booleano = z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean());

/** FormData → objeto simples; campos repetidos viram lista. */
export function dadosDoFormulario(form: FormData): Record<string, unknown> {
  const dados: Record<string, unknown> = {};
  for (const [chave, valor] of form.entries()) {
    if (typeof valor !== "string") continue;
    const atual = dados[chave];
    dados[chave] = atual === undefined ? valor : [...(Array.isArray(atual) ? atual : [atual]), valor];
  }
  return dados;
}

export const lista = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(item));

/** Processo visível ao usuário e não excluído, ou NaoEncontrado (não revela que existe). */
export async function processoVisivel<T extends Prisma.ProcessoInclude>(
  tx: Transacao,
  usuario: UsuarioAtual,
  id: string,
  include?: T,
) {
  const p = await tx.processo.findFirst({
    where: { id, excluidoEm: null, AND: [filtroProcessosVisiveis(usuario)] },
    include: include as T,
  });
  if (!p) throw new NaoEncontradoError("Processo não encontrado.");
  return p;
}

/** O usuário-alvo enxergaria este processo? (D4: prazo só para quem vê o processo.) */
export function enxergaProcesso(
  alvo: Pick<UsuarioAtual, "id" | "perfil" | "veTodosProcessos">,
  processo: { responsavelId: string; segredoJustica: boolean },
): boolean {
  if (alvo.perfil === "ADMINISTRADOR" || processo.responsavelId === alvo.id) return true;
  if (alvo.perfil === "ADVOGADO" && !alvo.veTodosProcessos) return false;
  return !processo.segredoJustica;
}

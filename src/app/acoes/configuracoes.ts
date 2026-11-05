"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { executarAcao, type ResultadoAcao } from "@/servidor/acao";
import { provedorSupabase } from "@/servidor/auth/provedor-supabase";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { dadosDoFormulario } from "@/servidor/servicos/comum";
import {
  carregarFeriadosPadrao,
  criarFeriado,
  criarItem,
  editarComarca,
  editarItem,
  editarStatus,
  mesclarComarcas,
  removerFeriado,
} from "@/servidor/servicos/configuracoes";
import { salvarEscritorio } from "@/servidor/servicos/escritorio";
import { mesclarPessoas } from "@/servidor/servicos/partes";
import { alterarUsuario, convidarUsuario, definirAtivo } from "@/servidor/servicos/usuarios";

type Estado = ResultadoAcao<unknown> | null;
const id = (v: string) => z.uuid().parse(v);
const booleano = (v: FormDataEntryValue | null) => v === "on";

export async function convidarUsuarioForm(_: Estado, form: FormData) {
  return executarAcao(async () => {
    const d = dadosDoFormulario(form);
    await convidarUsuario(await exigirUsuario(), { ...d, veTodosProcessos: booleano(form.get("veTodosProcessos")) }, provedorSupabase);
    revalidatePath("/configuracoes/usuarios");
  });
}

export async function alterarUsuarioForm(usuarioId: string, _: Estado, form: FormData) {
  return executarAcao(async () => {
    const d = dadosDoFormulario(form);
    await alterarUsuario(await exigirUsuario(), id(usuarioId), {
      nome: d.nome as string,
      perfil: d.perfil,
      veTodosProcessos: booleano(form.get("veTodosProcessos")),
    });
    revalidatePath("/configuracoes/usuarios");
  });
}

export async function definirAtivoForm(usuarioId: string, ativo: boolean, _: Estado, _form: FormData) {
  return executarAcao(async () => {
    await definirAtivo(await exigirUsuario(), id(usuarioId), ativo, provedorSupabase);
    revalidatePath("/configuracoes/usuarios");
  });
}

export async function criarItemForm(_: Estado, form: FormData) {
  return executarAcao(async () => {
    await criarItem(await exigirUsuario(), dadosDoFormulario(form));
    revalidatePath("/configuracoes/listas");
  });
}

export async function editarItemForm(itemId: string, _: Estado, form: FormData) {
  return executarAcao(async () => {
    await editarItem(await exigirUsuario(), id(itemId), dadosDoFormulario(form));
    revalidatePath("/configuracoes/listas");
  });
}

export async function editarStatusForm(statusId: string, _: Estado, form: FormData) {
  return executarAcao(async () => {
    await editarStatus(await exigirUsuario(), id(statusId), dadosDoFormulario(form));
    revalidatePath("/configuracoes/status");
  });
}

export async function criarFeriadoForm(_: Estado, form: FormData) {
  return executarAcao(async () => {
    await criarFeriado(await exigirUsuario(), dadosDoFormulario(form));
    revalidatePath("/configuracoes/feriados");
  });
}

export async function removerFeriadoForm(feriadoId: string, _: Estado, _form: FormData) {
  return executarAcao(async () => {
    await removerFeriado(await exigirUsuario(), id(feriadoId));
    revalidatePath("/configuracoes/feriados");
  });
}

export async function carregarFeriadosPadraoForm(ano: number, _: Estado, _form: FormData) {
  return executarAcao(async () => {
    const n = await carregarFeriadosPadrao(await exigirUsuario(), ano);
    revalidatePath("/configuracoes/feriados");
    return { incluidos: n };
  });
}

export async function editarComarcaForm(comarcaId: string, _: Estado, form: FormData) {
  return executarAcao(async () => {
    await editarComarca(await exigirUsuario(), id(comarcaId), dadosDoFormulario(form));
    revalidatePath("/configuracoes/comarcas");
  });
}

export async function mesclarComarcasForm(_: Estado, form: FormData) {
  return executarAcao(async () => {
    await mesclarComarcas(await exigirUsuario(), dadosDoFormulario(form));
    revalidatePath("/configuracoes/comarcas");
  });
}

export async function mesclarPessoasForm(_: Estado, form: FormData) {
  return executarAcao(async () => {
    await mesclarPessoas(await exigirUsuario(), dadosDoFormulario(form));
    revalidatePath("/partes");
  });
}

export async function salvarEscritorioForm(_: Estado, form: FormData) {
  return executarAcao(async () => {
    const arquivo = form.get("logo");
    const logo =
      arquivo instanceof File && arquivo.size > 0 ? { tipo: arquivo.type, conteudo: Buffer.from(await arquivo.arrayBuffer()) } : null;
    await salvarEscritorio(await exigirUsuario(), dadosDoFormulario(form), logo);
    revalidatePath("/configuracoes/escritorio");
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { executarAcao, type ResultadoAcao } from "@/servidor/acao";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { criarAndamento, editarAndamento, prazoDoFormulario } from "@/servidor/servicos/andamentos";
import { salvarAudiencia } from "@/servidor/servicos/audiencias";
import { dadosDoFormulario } from "@/servidor/servicos/comum";
import {
  adicionarParte,
  alterarStatus,
  atualizarProcesso,
  criarProcesso,
  desvincularProcesso,
  removerParte,
  vincularProcesso,
} from "@/servidor/servicos/processos";
import { criarComarca } from "@/servidor/servicos/referencias";

type Estado = ResultadoAcao<unknown> | null;
const id = (v: string) => z.uuid().parse(v);
const atualizar = (processoId: string) => revalidatePath(`/processos/${processoId}`);

export async function criarProcessoAcao(_: Estado, form: FormData) {
  let novoId: string | undefined;
  const r = await executarAcao(async () => {
    const usuario = await exigirUsuario();
    const dados = dadosDoFormulario(form);
    // "Novo processo para este cliente": o cliente entra como parte já no cadastro.
    const partes = dados.clienteId
      ? [{ pessoaId: dados.clienteId, polo: dados.clientePolo, qualificacaoIds: dados.clienteQualificacaoIds, ehClienteDoEscritorio: true }]
      : [];
    novoId = (await criarProcesso(usuario, dados, partes)).id;
  });
  if (r.ok && novoId) redirect(`/processos/${novoId}`);
  return r;
}

export async function atualizarProcessoAcao(processoId: string, _: Estado, form: FormData) {
  const r = await executarAcao(async () => {
    await atualizarProcesso(await exigirUsuario(), id(processoId), dadosDoFormulario(form));
  });
  if (r.ok) redirect(`/processos/${processoId}`);
  return r;
}

export async function alterarStatusAcao(processoId: string, _: Estado, form: FormData) {
  return executarAcao(async () => {
    await alterarStatus(await exigirUsuario(), id(processoId), dadosDoFormulario(form));
    atualizar(processoId);
  });
}

export async function adicionarParteAcao(processoId: string, _: Estado, form: FormData) {
  return executarAcao(async () => {
    await adicionarParte(await exigirUsuario(), id(processoId), dadosDoFormulario(form));
    atualizar(processoId);
  });
}

export async function removerParteAcao(processoId: string, parteId: string, _: Estado, _form: FormData) {
  return executarAcao(async () => {
    await removerParte(await exigirUsuario(), id(parteId));
    atualizar(processoId);
  });
}

export async function vincularProcessoAcao(processoId: string, _: Estado, form: FormData) {
  return executarAcao(async () => {
    await vincularProcesso(await exigirUsuario(), id(processoId), dadosDoFormulario(form));
    atualizar(processoId);
  });
}

export async function desvincularProcessoAcao(processoId: string, vinculoId: string, _: Estado, _form: FormData) {
  return executarAcao(async () => {
    await desvincularProcesso(await exigirUsuario(), id(vinculoId));
    atualizar(processoId);
  });
}

export async function criarAndamentoAcao(processoId: string, _: Estado, form: FormData) {
  return executarAcao(async () => {
    const dados = dadosDoFormulario(form);
    await criarAndamento(await exigirUsuario(), id(processoId), dados, prazoDoFormulario(dados));
    atualizar(processoId);
    revalidatePath("/");
  });
}

export async function editarAndamentoAcao(processoId: string, andamentoId: string, _: Estado, form: FormData) {
  return executarAcao(async () => {
    await editarAndamento(await exigirUsuario(), id(andamentoId), dadosDoFormulario(form));
    atualizar(processoId);
  });
}

export async function salvarAudienciaAcao(processoId: string, audienciaId: string | null, _: Estado, form: FormData) {
  return executarAcao(async () => {
    await salvarAudiencia(await exigirUsuario(), id(processoId), dadosDoFormulario(form), audienciaId ? id(audienciaId) : undefined);
    atualizar(processoId);
    revalidatePath("/");
  });
}

export async function criarComarcaAcao(_: Estado, form: FormData) {
  return executarAcao(async () => {
    const c = await criarComarca(await exigirUsuario(), dadosDoFormulario(form));
    revalidatePath("/processos", "layout");
    return { id: c.id, nome: c.nome, uf: c.uf };
  });
}

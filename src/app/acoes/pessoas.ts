"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { executarAcao, type ResultadoAcao } from "@/servidor/acao";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { dadosDoFormulario } from "@/servidor/servicos/comum";
import { adicionarRepresentante, atualizarPessoa, buscarPessoas, criarPessoa, removerRepresentante } from "@/servidor/servicos/pessoas";

type Estado = ResultadoAcao<unknown> | null;
const id = (v: string) => z.uuid().parse(v);

export async function criarPessoaAcao(_: Estado, form: FormData) {
  let novoId: string | undefined;
  const r = await executarAcao(async () => {
    novoId = (await criarPessoa(await exigirUsuario(), dadosDoFormulario(form))).id;
  });
  if (r.ok && novoId) redirect(`/clientes/${novoId}`);
  return r;
}

export async function atualizarPessoaAcao(pessoaId: string, _: Estado, form: FormData) {
  const r = await executarAcao(async () => {
    await atualizarPessoa(await exigirUsuario(), id(pessoaId), dadosDoFormulario(form));
  });
  if (r.ok) redirect(`/clientes/${pessoaId}`);
  return r;
}

/** Cadastro rápido de parte (ex.: parte contrária) a partir da ficha do processo. */
export async function criarPessoaRapidaAcao(dados: Record<string, unknown>) {
  return executarAcao(async () => {
    const p = await criarPessoa(await exigirUsuario(), dados);
    return { id: p.id, nome: p.nome };
  });
}

export async function buscarPessoasAcao(termo: string) {
  return executarAcao(async () => {
    await exigirUsuario();
    const r = await buscarPessoas(z.string().max(100).parse(termo));
    return r.slice(0, 15).map((p) => ({ id: p.id, nome: p.nome, ehCliente: p.ehCliente, tipo: p.tipo }));
  });
}

export async function adicionarRepresentanteAcao(pessoaId: string, _: Estado, form: FormData) {
  return executarAcao(async () => {
    await adicionarRepresentante(await exigirUsuario(), id(pessoaId), dadosDoFormulario(form));
    revalidatePath(`/clientes/${pessoaId}`);
  });
}

export async function removerRepresentanteAcao(pessoaId: string, representanteId: string, _: Estado, _form: FormData) {
  return executarAcao(async () => {
    await removerRepresentante(await exigirUsuario(), id(representanteId));
    revalidatePath(`/clientes/${pessoaId}`);
  });
}

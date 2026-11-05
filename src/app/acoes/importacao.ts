"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { executarAcao, type ResultadoAcao } from "@/servidor/acao";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { RegraDeNegocioError } from "@/servidor/erros";
import { criarLote, descartarLote, gravarLote, salvarDecisoes } from "@/servidor/servicos/importacao";

type Estado = ResultadoAcao<unknown> | null;
const id = (v: string) => z.uuid().parse(v);
const TAMANHO_MAXIMO = 5 * 1024 * 1024;

export async function enviarPlanilhaAcao(_: Estado, form: FormData) {
  let novoId: string | undefined;
  const r = await executarAcao(async () => {
    const admin = await exigirUsuario();
    const planilha = form.get("planilha");
    if (!(planilha instanceof File) || planilha.size === 0) throw new RegraDeNegocioError("Escolha a planilha .xlsx.");
    if (planilha.size > TAMANHO_MAXIMO) throw new RegraDeNegocioError("Planilha maior que 5 MB.");
    const ajustes = form.get("ajustes");
    const textoAjustes = ajustes instanceof File && ajustes.size > 0 ? await ajustes.text() : null;
    const lote = await criarLote(admin, { nome: planilha.name, conteudo: Buffer.from(await planilha.arrayBuffer()) }, textoAjustes);
    novoId = lote.id;
  });
  if (r.ok && novoId) redirect(`/importacao/${novoId}`);
  return r;
}

/** Lê o formulário de revisão: separar:<id>, mesclar:<id>, nome:<id>, responsavel:<nome>. */
function decisoesDoFormulario(form: FormData) {
  const separacoes: Record<string, boolean> = {};
  const partesSeparadas: Record<string, string[]> = {};
  for (const sid of form.getAll("separacao")) {
    separacoes[String(sid)] = form.get(`separar:${sid}`) === "on";
    const partes = String(form.get(`partes:${sid}`) ?? "").split(";").map((p) => p.trim()).filter(Boolean);
    if (partes.length) partesSeparadas[String(sid)] = partes;
  }
  const mesclagens: Record<string, { aceita: boolean; nome?: string }> = {};
  for (const mid of form.getAll("mesclagem")) {
    mesclagens[String(mid)] = { aceita: form.get(`mesclar:${mid}`) === "on", nome: String(form.get(`nome:${mid}`) ?? "") || undefined };
  }
  const responsaveis: Record<string, string> = {};
  for (const nome of form.getAll("responsavel")) {
    const v = String(form.get(`responsavel:${nome}`) ?? "");
    if (v) responsaveis[String(nome)] = v;
  }
  return { separacoes, partesSeparadas, mesclagens, responsaveis };
}

export async function salvarRevisaoAcao(loteId: string, _: Estado, form: FormData) {
  return executarAcao(async () => {
    await salvarDecisoes(await exigirUsuario(), id(loteId), decisoesDoFormulario(form));
    revalidatePath(`/importacao/${loteId}`);
  });
}

export async function gravarLoteAcao(loteId: string, _: Estado, _form: FormData) {
  return executarAcao(async () => {
    await gravarLote(await exigirUsuario(), id(loteId));
    revalidatePath(`/importacao/${loteId}`);
    revalidatePath("/", "layout");
  });
}

export async function descartarLoteAcao(loteId: string, _: Estado, _form: FormData) {
  const r = await executarAcao(async () => {
    await descartarLote(await exigirUsuario(), id(loteId));
  });
  if (r.ok) redirect("/importacao");
  return r;
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { memoriaPrazoEmTexto } from "@/dominio/prazos/memoria";
import { formatarDataComDia } from "@/dominio/prazos/data-civil";
import { executarAcao, type ResultadoAcao } from "@/servidor/acao";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { dadosDoFormulario } from "@/servidor/servicos/comum";
import {
  ajustarPrazo,
  alterarSituacaoPrazo,
  conferirPrazo,
  criarPrazo,
  cumprirPrazo,
  simularPrazo,
} from "@/servidor/servicos/prazos";

type Estado = ResultadoAcao<unknown> | null;
const id = (v: string) => z.uuid().parse(v);

function atualizar(processoId: string) {
  revalidatePath(`/processos/${processoId}`);
  revalidatePath("/");
}

export type Previa =
  | { tipo: "calculado"; dataFinal: string; memoria: string[] }
  | { tipo: "pendencia"; mensagem: string };

/** Prévia com memória de cálculo, antes de gravar (fluxo principal, passo 4). */
export async function simularPrazoAcao(processoId: string, dados: Record<string, unknown>): Promise<ResultadoAcao<Previa>> {
  return executarAcao(async () => {
    const s = await simularPrazo(await exigirUsuario(), id(processoId), dados);
    if (s.tipo === "pendencia") return { tipo: "pendencia" as const, mensagem: s.mensagem };
    return {
      tipo: "calculado" as const,
      dataFinal: formatarDataComDia(s.resultado.dataFinal),
      memoria: memoriaPrazoEmTexto({ tipo: "automatica", ...s.resultado.memoria }),
    };
  });
}

export async function criarPrazoAcao(processoId: string, _: Estado, form: FormData) {
  return executarAcao(async () => {
    await criarPrazo(await exigirUsuario(), id(processoId), dadosDoFormulario(form));
    atualizar(processoId);
  });
}

export async function conferirPrazoAcao(processoId: string, prazoId: string, _: Estado, _form: FormData) {
  return executarAcao(async () => {
    await conferirPrazo(await exigirUsuario(), id(prazoId));
    atualizar(processoId);
  });
}

export async function ajustarPrazoAcao(processoId: string, prazoId: string, _: Estado, form: FormData) {
  return executarAcao(async () => {
    await ajustarPrazo(await exigirUsuario(), id(prazoId), dadosDoFormulario(form));
    atualizar(processoId);
  });
}

export async function cumprirPrazoAcao(processoId: string, prazoId: string, _: Estado, form: FormData) {
  return executarAcao(async () => {
    await cumprirPrazo(await exigirUsuario(), id(prazoId), dadosDoFormulario(form));
    atualizar(processoId);
  });
}

export async function situacaoPrazoAcao(processoId: string, prazoId: string, situacao: string, _: Estado, _form: FormData) {
  return executarAcao(async () => {
    await alterarSituacaoPrazo(await exigirUsuario(), id(prazoId), z.enum(["PERDIDO", "CANCELADO", "ABERTO"]).parse(situacao));
    atualizar(processoId);
  });
}

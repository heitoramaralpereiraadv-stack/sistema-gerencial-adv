"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { executarAcao, type ResultadoAcao } from "@/servidor/acao";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { RegraDeNegocioError } from "@/servidor/erros";
import { dadosDoFormulario } from "@/servidor/servicos/comum";
import { salvarCompromisso } from "@/servidor/servicos/compromissos";
import {
  criarLoteAgenda,
  descartarLoteAgenda,
  desligarAssinatura,
  gerarAssinatura,
  gravarLoteAgenda,
  salvarDecisoesAgenda,
} from "@/servidor/servicos/google-agenda";

type Estado = ResultadoAcao<unknown> | null;
const id = (v: string) => z.uuid().parse(v);
const PAGINA = "/configuracoes/google-agenda";

/** Compromisso na ficha do processo (processoId) ou avulso, pela Agenda (processoId nulo). */
export async function salvarCompromissoAcao(processoId: string | null, compromissoId: string | null, _: Estado, form: FormData) {
  return executarAcao(async () => {
    await salvarCompromisso(await exigirUsuario(), processoId ? id(processoId) : null, dadosDoFormulario(form), compromissoId ? id(compromissoId) : undefined);
    if (processoId) revalidatePath(`/processos/${processoId}`);
    revalidatePath("/");
  });
}

export async function enviarAgendaGoogleAcao(_: Estado, form: FormData) {
  let novoId: string | undefined;
  const r = await executarAcao(async () => {
    const admin = await exigirUsuario();
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) throw new RegraDeNegocioError("Escolha o arquivo .ics ou .zip exportado do Google Agenda.");
    novoId = (await criarLoteAgenda(admin, { nome: arquivo.name, conteudo: Buffer.from(await arquivo.arrayBuffer()) })).id;
  });
  if (r.ok && novoId) redirect(`${PAGINA}/${novoId}`);
  return r;
}

/** Formulário de revisão: evento=<índice>, uid:<i>, tipo:<i>, processos:<i>, tipoAudienciaId:<i>, modalidade:<i>. */
export async function salvarRevisaoAgendaAcao(loteId: string, _: Estado, form: FormData) {
  return executarAcao(async () => {
    const decisoes: Record<string, unknown> = {};
    for (const i of form.getAll("evento")) {
      const campo = (nome: string) => String(form.get(`${nome}:${i}`) ?? "");
      decisoes[campo("uid")] = {
        tipo: campo("tipo"),
        processos: campo("processos"),
        tipoAudienciaId: campo("tipoAudienciaId") || undefined,
        modalidade: campo("modalidade") || undefined,
      };
    }
    await salvarDecisoesAgenda(await exigirUsuario(), id(loteId), decisoes);
    revalidatePath(`${PAGINA}/${loteId}`);
  });
}

export async function gravarLoteAgendaAcao(loteId: string, _: Estado, _form: FormData) {
  return executarAcao(async () => {
    await gravarLoteAgenda(await exigirUsuario(), id(loteId));
    revalidatePath(`${PAGINA}/${loteId}`);
    revalidatePath("/", "layout");
  });
}

export async function descartarLoteAgendaAcao(loteId: string, _: Estado, _form: FormData) {
  const r = await executarAcao(async () => descartarLoteAgenda(await exigirUsuario(), id(loteId)));
  if (r.ok) redirect(PAGINA);
  return r;
}

export async function gerarAssinaturaAcao(_: Estado, _form: FormData) {
  return executarAcao(async () => {
    await gerarAssinatura(await exigirUsuario());
    revalidatePath(PAGINA);
  });
}

export async function desligarAssinaturaAcao(_: Estado, _form: FormData) {
  return executarAcao(async () => {
    await desligarAssinatura(await exigirUsuario());
    revalidatePath(PAGINA);
  });
}

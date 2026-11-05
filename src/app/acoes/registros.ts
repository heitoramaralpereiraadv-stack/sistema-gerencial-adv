"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { executarAcao } from "@/servidor/acao";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { excluirRegistro } from "@/servidor/servicos/exclusao";

const entrada = z.object({
  entidade: z.enum(["pessoa", "processo", "andamento", "prazo", "audiencia"]),
  id: z.uuid(),
});

/** Exclusão lógica. A permissão é conferida no serviço, não na tela. */
export async function excluirRegistroAcao(entidade: string, id: string) {
  return executarAcao(async () => {
    const usuario = await exigirUsuario();
    const dados = entrada.parse({ entidade, id });
    await excluirRegistro(usuario, dados.entidade, dados.id);
    revalidatePath("/", "layout");
  });
}

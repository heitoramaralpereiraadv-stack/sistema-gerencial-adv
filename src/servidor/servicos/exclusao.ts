// Exclusão lógica (seção 2): marca excluidoEm; o trigger registra a EXCLUSAO no histórico.

import type { PrismaClient } from "@/generated/prisma/client";
import type { UsuarioAtual } from "../auth/usuario";
import { comUsuario, prisma } from "../db/prisma";
import { NaoEncontradoError } from "../erros";
import { exigirPermissao } from "../permissoes/matriz";
import { filtroProcessosVisiveis } from "../permissoes/visibilidade";

export type EntidadeExcluivel = "pessoa" | "processo" | "andamento" | "prazo" | "audiencia" | "compromisso";

export async function excluirRegistro(
  usuario: UsuarioAtual,
  entidade: EntidadeExcluivel,
  id: string,
  cliente: PrismaClient = prisma(),
): Promise<void> {
  exigirPermissao(usuario, "registro.excluir");
  const agora = new Date();
  const visivel = filtroProcessosVisiveis(usuario);

  await comUsuario(
    usuario.id,
    async (tx) => {
      const ativo = { id, excluidoEm: null };
      const dados = { excluidoEm: agora };
      let r: { count: number };
      switch (entidade) {
        case "pessoa":
          r = await tx.pessoa.updateMany({ where: ativo, data: dados });
          break;
        case "processo":
          r = await tx.processo.updateMany({ where: { ...ativo, AND: [visivel] }, data: dados });
          break;
        case "andamento":
          r = await tx.andamento.updateMany({ where: { ...ativo, processo: visivel }, data: dados });
          break;
        case "prazo":
          r = await tx.prazo.updateMany({ where: { ...ativo, processo: visivel }, data: dados });
          break;
        case "audiencia":
          r = await tx.audiencia.updateMany({ where: { ...ativo, processo: visivel }, data: dados });
          break;
        case "compromisso":
          r = await tx.compromisso.updateMany({ where: { ...ativo, OR: [{ processoId: null }, { processo: visivel }] }, data: dados });
          break;
      }
      if (r.count === 0) throw new NaoEncontradoError();
    },
    cliente,
  );
}

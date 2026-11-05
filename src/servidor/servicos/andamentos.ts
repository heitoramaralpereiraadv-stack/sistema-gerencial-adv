// Andamentos (seção 3) e fluxo principal da seção 5: o andamento e o prazo dele no mesmo
// formulário, gravados juntos.

import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { paraDate } from "@/lib/hoje";
import type { UsuarioAtual } from "../auth/usuario";
import { comUsuario, prisma } from "../db/prisma";
import { NaoEncontradoError, RegraDeNegocioError } from "../erros";
import { exigirPermissao } from "../permissoes/matriz";
import { filtroProcessosVisiveis } from "../permissoes/visibilidade";
import { booleano, dataCivil, processoVisivel, textoObrigatorio } from "./comum";
import { criarPrazoNaTransacao } from "./prazos";

export const esquemaAndamento = z.object({
  data: dataCivil,
  tipoId: z.uuid("Escolha o tipo de andamento."),
  descricao: textoObrigatorio("o texto do andamento"),
});

export async function criarAndamento(
  usuario: UsuarioAtual,
  processoId: string,
  entrada: unknown,
  prazo?: unknown,
  cliente: PrismaClient = prisma(),
) {
  exigirPermissao(usuario, "andamento.editar");
  const d = esquemaAndamento.parse(entrada);
  return comUsuario(
    usuario.id,
    async (tx) => {
      await processoVisivel(tx, usuario, processoId);
      const tipo = await tx.itemLista.findFirst({ where: { id: d.tipoId, lista: "TIPO_ANDAMENTO", ativo: true } });
      if (!tipo) throw new RegraDeNegocioError("Tipo de andamento inválido.");
      const andamento = await tx.andamento.create({
        data: { processoId, data: paraDate(d.data), tipoId: d.tipoId, descricao: d.descricao, usuarioId: usuario.id },
      });
      const novoPrazo = prazo ? await criarPrazoNaTransacao(tx, usuario, processoId, prazo, andamento.id) : null;
      return { andamento, prazo: novoPrazo };
    },
    cliente,
  );
}

export async function editarAndamento(usuario: UsuarioAtual, id: string, entrada: unknown, cliente: PrismaClient = prisma()) {
  exigirPermissao(usuario, "andamento.editar");
  const d = esquemaAndamento.parse(entrada);
  return comUsuario(
    usuario.id,
    async (tx) => {
      const atual = await tx.andamento.findFirst({
        where: { id, excluidoEm: null, processo: { excluidoEm: null, AND: [filtroProcessosVisiveis(usuario)] } },
      });
      if (!atual) throw new NaoEncontradoError("Andamento não encontrado.");
      return tx.andamento.update({ where: { id }, data: { data: paraDate(d.data), tipoId: d.tipoId, descricao: d.descricao } });
    },
    cliente,
  );
}

/** Lê o bloco "prazo" do formulário de andamento, quando marcado. */
export function prazoDoFormulario(dados: Record<string, unknown>): Record<string, unknown> | undefined {
  // No formulário combinado, "descricao" é o texto do andamento; o do prazo vem em "descricaoPrazo".
  return booleano.parse(dados.comPrazo) ? { ...dados, descricao: dados.descricaoPrazo } : undefined;
}

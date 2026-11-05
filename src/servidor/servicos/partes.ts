// Partes contrárias (seção 5): lista com contagem de processos e mesclagem de cadastros
// duplicados (somente administrador).

import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { UsuarioAtual } from "../auth/usuario";
import { comUsuario, prisma } from "../db/prisma";
import { NaoEncontradoError, RegraDeNegocioError } from "../erros";
import { exigirPermissao } from "../permissoes/matriz";
import { filtroProcessosVisiveis } from "../permissoes/visibilidade";

/** Pessoas que figuram como parte não cliente em processos visíveis, com a contagem. */
export async function listarPartesContrarias(
  usuario: UsuarioAtual,
  filtros: { termo?: string; categoriaId?: string } = {},
  cliente: PrismaClient = prisma(),
) {
  const processo = { excluidoEm: null, AND: [filtroProcessosVisiveis(usuario)] };
  const contagem = await cliente.parteProcesso.groupBy({
    by: ["pessoaId"],
    where: { ehClienteDoEscritorio: false, processo },
    _count: { _all: true },
  });
  const porPessoa = new Map(contagem.map((c) => [c.pessoaId, c._count._all]));
  const pessoas = await cliente.pessoa.findMany({
    where: {
      id: { in: [...porPessoa.keys()] },
      excluidoEm: null,
      ...(filtros.termo && { nome: { contains: filtros.termo, mode: "insensitive" as const } }),
      ...(filtros.categoriaId && { categoriaId: filtros.categoriaId }),
    },
    include: { categoria: true },
  });
  return pessoas
    .map((p) => ({ ...p, processos: porPessoa.get(p.id) ?? 0 }))
    .sort((a, b) => b.processos - a.processos || a.nome.localeCompare(b.nome, "pt-BR"));
}

export const esquemaMesclagem = z
  .object({ manterId: z.uuid("Escolha o cadastro que fica."), removerId: z.uuid("Escolha o cadastro duplicado.") })
  .refine((d) => d.manterId !== d.removerId, "Escolha dois cadastros diferentes.");

/**
 * Mescla o cadastro duplicado no que fica: participações em processos, representações,
 * contatos e documentos passam para o que fica; o duplicado é excluído logicamente.
 * Tudo numa transação, registrado no histórico.
 */
export async function mesclarPessoas(usuario: UsuarioAtual, entrada: unknown, cliente: PrismaClient = prisma()) {
  exigirPermissao(usuario, "parte.mesclar");
  const { manterId, removerId } = esquemaMesclagem.parse(entrada);
  return comUsuario(
    usuario.id,
    async (tx) => {
      const manter = await tx.pessoa.findFirst({ where: { id: manterId, excluidoEm: null } });
      const remover = await tx.pessoa.findFirst({ where: { id: removerId, excluidoEm: null } });
      if (!manter || !remover) throw new NaoEncontradoError("Cadastro não encontrado.");
      if (manter.cpfCnpjHash && remover.cpfCnpjHash && manter.cpfCnpjHash !== remover.cpfCnpjHash) {
        throw new RegraDeNegocioError("Os dois cadastros têm CPF/CNPJ diferentes: não são a mesma pessoa.");
      }

      // Participações: se o que fica já está no mesmo processo e polo, a duplicada é removida.
      const partes = await tx.parteProcesso.findMany({ where: { pessoaId: removerId }, include: { qualificacoes: true } });
      for (const parte of partes) {
        const existente = await tx.parteProcesso.findFirst({
          where: { processoId: parte.processoId, pessoaId: manterId, polo: parte.polo },
        });
        if (existente) {
          await tx.parteProcesso.update({
            where: { id: existente.id },
            data: {
              qualificacoes: { connect: parte.qualificacoes.map((q) => ({ id: q.id })) },
              ehClienteDoEscritorio: existente.ehClienteDoEscritorio || parte.ehClienteDoEscritorio,
            },
          });
          await tx.parteProcesso.update({ where: { id: parte.id }, data: { qualificacoes: { set: [] } } });
          await tx.parteProcesso.delete({ where: { id: parte.id } });
        } else {
          await tx.parteProcesso.update({ where: { id: parte.id }, data: { pessoaId: manterId } });
        }
      }
      await tx.contato.updateMany({ where: { pessoaId: removerId }, data: { pessoaId: manterId } });
      await tx.documentoPessoa.updateMany({ where: { pessoaId: removerId }, data: { pessoaId: manterId } });
      for (const campo of ["pessoaId", "representadoId"] as const) {
        const reps = await tx.representante.findMany({ where: { [campo]: removerId } });
        for (const r of reps) {
          const novo = { ...r, [campo]: manterId };
          const duplicado = await tx.representante.findFirst({
            where: { pessoaId: novo.pessoaId, representadoId: novo.representadoId, qualidade: r.qualidade },
          });
          if (duplicado || novo.pessoaId === novo.representadoId) await tx.representante.delete({ where: { id: r.id } });
          else await tx.representante.update({ where: { id: r.id }, data: { [campo]: manterId } });
        }
      }

      // CPF/CNPJ do duplicado passa para o que fica, se este não tiver (o índice é único).
      const transferirDocumento = !manter.cpfCnpjHash && remover.cpfCnpjHash;
      await tx.pessoa.update({
        where: { id: removerId },
        data: {
          excluidoEm: new Date(),
          cpfCnpjHash: null,
          cpfCnpjCifrado: null,
          observacoes: [remover.observacoes, `Mesclado em "${manter.nome}" (${manter.id}).`].filter(Boolean).join("\n"),
        },
      });
      return tx.pessoa.update({
        where: { id: manterId },
        data: {
          ehCliente: manter.ehCliente || remover.ehCliente,
          categoriaId: manter.categoriaId ?? remover.categoriaId,
          ...(transferirDocumento && { cpfCnpjHash: remover.cpfCnpjHash, cpfCnpjCifrado: remover.cpfCnpjCifrado }),
        },
      });
    },
    cliente,
  );
}

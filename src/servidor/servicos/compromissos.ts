// Compromissos da Agenda (G2): reuniões, diligências e outros eventos que não são prazo nem
// audiência. Podem ser ligados a um processo ou ficar avulsos. Vêm do Google Agenda ou são
// lançados aqui.

import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { validarNumeroCnj } from "@/dominio/cnj/numero-cnj";
import { dataHoraDeSaoPaulo } from "@/lib/data-hora";
import type { UsuarioAtual } from "../auth/usuario";
import { comUsuario, prisma, type Transacao } from "../db/prisma";
import { NaoEncontradoError, RegraDeNegocioError } from "../erros";
import { exigirPermissao } from "../permissoes/matriz";
import { filtroProcessosVisiveis } from "../permissoes/visibilidade";
import { dataCivil, enxergaProcesso, processoVisivel, textoObrigatorio, textoOpcional } from "./comum";

const hora = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida.").optional());

export const esquemaCompromisso = z
  .object({
    titulo: textoObrigatorio("o título"),
    data: dataCivil,
    /** Sem hora de início: compromisso de dia inteiro. */
    horaInicio: hora,
    horaFim: hora,
    local: textoOpcional,
    descricao: textoOpcional,
    responsavelId: z.uuid("Escolha o responsável."),
    /** Só no lançamento pela Agenda: número do processo (opcional). */
    numeroProcesso: textoOpcional,
  })
  .refine((d) => !d.horaFim || (d.horaInicio && d.horaFim >= d.horaInicio), { message: "A hora de término deve ser depois do início." });

export function periodoDoCompromisso(d: { data: string; horaInicio?: string; horaFim?: string }) {
  if (!d.horaInicio) return { inicio: dataHoraDeSaoPaulo(`${d.data}T00:00`), fim: null, diaInteiro: true };
  return {
    inicio: dataHoraDeSaoPaulo(`${d.data}T${d.horaInicio}`),
    fim: d.horaFim ? dataHoraDeSaoPaulo(`${d.data}T${d.horaFim}`) : null,
    diaInteiro: false,
  };
}

/** Processo visível pelo número CNJ (com ou sem pontuação), para ligar o compromisso. */
export async function processoPeloNumero(tx: Transacao | PrismaClient, usuario: UsuarioAtual, numero: string) {
  const r = validarNumeroCnj(numero);
  if (!r.valido) throw new RegraDeNegocioError(`Número do processo: ${r.erro}`);
  const p = await tx.processo.findFirst({ where: { numeroCnj: r.numero.formatado, excluidoEm: null, AND: [filtroProcessosVisiveis(usuario)] } });
  if (!p) throw new RegraDeNegocioError(`Processo ${r.numero.formatado} não cadastrado.`);
  return p;
}

export async function salvarCompromisso(
  usuario: UsuarioAtual,
  processoId: string | null,
  entrada: unknown,
  compromissoId?: string,
  cliente: PrismaClient = prisma(),
) {
  exigirPermissao(usuario, "compromisso.editar");
  const d = esquemaCompromisso.parse(entrada);
  return comUsuario(
    usuario.id,
    async (tx) => {
      const processo = processoId
        ? await processoVisivel(tx, usuario, processoId)
        : d.numeroProcesso
          ? await processoPeloNumero(tx, usuario, d.numeroProcesso)
          : null;
      const responsavel = await tx.usuario.findFirst({ where: { id: d.responsavelId, ativo: true } });
      if (!responsavel || (processo && !enxergaProcesso(responsavel, processo))) {
        throw new RegraDeNegocioError("O responsável escolhido não tem acesso a este processo.");
      }
      const dados = {
        titulo: d.titulo,
        ...periodoDoCompromisso(d),
        local: d.local ?? null,
        descricao: d.descricao ?? null,
        responsavelId: d.responsavelId,
      };
      if (!compromissoId) return tx.compromisso.create({ data: { ...dados, processoId: processo?.id ?? null } });
      const atual = await tx.compromisso.findFirst({
        where: {
          id: compromissoId,
          excluidoEm: null,
          ...(processoId ? { processoId } : {}),
          OR: [{ processoId: null }, { processo: { AND: [filtroProcessosVisiveis(usuario)] } }],
        },
      });
      if (!atual) throw new NaoEncontradoError("Compromisso não encontrado.");
      return tx.compromisso.update({
        where: { id: compromissoId },
        data: { ...dados, ...(processoId ? {} : { processoId: processo?.id ?? atual.processoId }) },
      });
    },
    cliente,
  );
}

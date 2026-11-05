// Audiências (seção 3): entram na Agenda junto com os prazos.

import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { dataHoraDeSaoPaulo } from "@/lib/data-hora";
import type { UsuarioAtual } from "../auth/usuario";
import { comUsuario, prisma } from "../db/prisma";
import { NaoEncontradoError, RegraDeNegocioError } from "../erros";
import { exigirPermissao } from "../permissoes/matriz";
import { filtroProcessosVisiveis } from "../permissoes/visibilidade";
import { enxergaProcesso, processoVisivel, textoOpcional } from "./comum";

export const esquemaAudiencia = z.object({
  dataHora: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Informe data e hora."),
  tipoId: z.uuid("Escolha o tipo de audiência."),
  modalidade: z.enum(["PRESENCIAL", "VIRTUAL"]),
  localOuLink: textoOpcional,
  responsavelId: z.uuid("Escolha o responsável."),
  resultado: textoOpcional,
});

export async function salvarAudiencia(
  usuario: UsuarioAtual,
  processoId: string,
  entrada: unknown,
  audienciaId?: string,
  cliente: PrismaClient = prisma(),
) {
  exigirPermissao(usuario, "audiencia.editar");
  const d = esquemaAudiencia.parse(entrada);
  return comUsuario(
    usuario.id,
    async (tx) => {
      const processo = await processoVisivel(tx, usuario, processoId);
      const tipo = await tx.itemLista.findFirst({ where: { id: d.tipoId, lista: "TIPO_AUDIENCIA", ativo: true } });
      if (!tipo) throw new RegraDeNegocioError("Tipo de audiência inválido.");
      const responsavel = await tx.usuario.findFirst({ where: { id: d.responsavelId, ativo: true } });
      if (!responsavel || !enxergaProcesso(responsavel, processo)) {
        throw new RegraDeNegocioError("O responsável escolhido não tem acesso a este processo.");
      }
      const dados = {
        dataHora: dataHoraDeSaoPaulo(d.dataHora),
        tipoId: d.tipoId,
        modalidade: d.modalidade,
        localOuLink: d.localOuLink ?? null,
        responsavelId: d.responsavelId,
        resultado: d.resultado ?? null,
      };
      if (!audienciaId) return tx.audiencia.create({ data: { ...dados, processoId } });
      const atual = await tx.audiencia.findFirst({
        where: { id: audienciaId, processoId, excluidoEm: null, processo: { AND: [filtroProcessosVisiveis(usuario)] } },
      });
      if (!atual) throw new NaoEncontradoError("Audiência não encontrada.");
      return tx.audiencia.update({ where: { id: audienciaId }, data: dados });
    },
    cliente,
  );
}

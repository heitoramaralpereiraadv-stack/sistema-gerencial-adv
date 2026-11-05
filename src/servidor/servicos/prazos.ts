// Prazos (seções 4.2 e 5, fluxo principal; decisões D4, D11, D13, D16, D17).
// O cálculo é sempre refeito no servidor: o navegador só mostra a prévia.

import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  calcularPrazo,
  PendenciaDeRegra,
  type CodigoPendencia,
  type EntradaPrazo,
  type ResultadoPrazo,
} from "@/dominio/prazos/motor";
import { memoriaManual, type MemoriaPrazo } from "@/dominio/prazos/memoria";
import { formatarData } from "@/dominio/prazos/data-civil";
import { hoje, paraDate } from "@/lib/hoje";
import type { UsuarioAtual } from "../auth/usuario";
import { comUsuario, prisma, type Transacao } from "../db/prisma";
import { NaoEncontradoError, ProibidoError, RegraDeNegocioError } from "../erros";
import { exigirPermissao } from "../permissoes/matriz";
import { filtroProcessosVisiveis } from "../permissoes/visibilidade";
import { carregarCalendarios, type ProcessoComLocal } from "./calendario";
import { booleano, dataCivil, dataOpcional, enxergaProcesso, processoVisivel, textoObrigatorio, textoOpcional } from "./comum";

export const esquemaEntradaPrazo = z.object({
  formaIntimacao: z.enum(["DJE", "PORTAL_CONSULTA", "PORTAL_TACITA", "DATA_INFORMADA"]),
  formaIntimacaoDetalhe: textoOpcional,
  dataReferencia: dataCivil,
  quantidadeDias: z.coerce.number().int("Quantidade de dias inválida.").min(1, "Quantidade de dias inválida.").max(3650),
  tipoContagem: z.enum(["UTEIS", "CORRIDOS"]),
  emDobro: booleano,
  criminal: booleano,
});

export const esquemaNovoPrazo = esquemaEntradaPrazo.extend({
  descricao: textoObrigatorio("a descrição do prazo"),
  responsavelId: z.uuid("Escolha o responsável."),
  dataFinalManual: dataOpcional,
  justificativaManual: textoOpcional,
  observacoes: textoOpcional,
});

export type Simulacao =
  | { tipo: "calculado"; resultado: ResultadoPrazo }
  | { tipo: "pendencia"; codigo: CodigoPendencia; mensagem: string };

/** A memória é JSON puro (strings, números, listas); o cast só informa isso ao Prisma. */
const comoJson = (m: MemoriaPrazo) => m as unknown as Prisma.InputJsonObject;

const incluirLocal = { comarca: true, tribunal: true, status: true } as const;

async function simularNoProcesso(
  tx: Transacao,
  processo: ProcessoComLocal,
  entrada: EntradaPrazo,
): Promise<Simulacao> {
  const calendarios = await carregarCalendarios(tx, paraDate(entrada.dataReferencia));
  try {
    return { tipo: "calculado", resultado: calcularPrazo(entrada, calendarios.para(processo)) };
  } catch (e) {
    if (e instanceof PendenciaDeRegra) return { tipo: "pendencia", codigo: e.codigo, mensagem: e.message };
    throw e;
  }
}

/** Prévia do cálculo para o formulário (passo 4 do fluxo principal). */
export async function simularPrazo(
  usuario: UsuarioAtual,
  processoId: string,
  entrada: unknown,
  cliente: PrismaClient = prisma(),
): Promise<Simulacao> {
  exigirPermissao(usuario, "prazo.editar");
  const dados = esquemaEntradaPrazo.parse(entrada);
  return cliente.$transaction(async (tx) => {
    const processo = await processoVisivel(tx, usuario, processoId, incluirLocal);
    return simularNoProcesso(tx, processo, dados);
  });
}

/** Cria o prazo dentro de uma transação já identificada (usado também pelo novo andamento). */
export async function criarPrazoNaTransacao(
  tx: Transacao,
  usuario: UsuarioAtual,
  processoId: string,
  entrada: unknown,
  andamentoId?: string,
) {
  exigirPermissao(usuario, "prazo.editar");
  const dados = esquemaNovoPrazo.parse(entrada);
  const processo = await processoVisivel(tx, usuario, processoId, incluirLocal);
  if (processo.status.comportamento === "ENCERRADO_EXIGE_DATA") {
    throw new RegraDeNegocioError(
      `Processo com status "${processo.status.nome}": novos prazos bloqueados. Um administrador pode reabri-lo.`,
    );
  }
  const responsavel = await tx.usuario.findFirst({ where: { id: dados.responsavelId, ativo: true } });
  if (!responsavel) throw new RegraDeNegocioError("Responsável inválido ou inativo.");
  if (!enxergaProcesso(responsavel, processo)) {
    throw new RegraDeNegocioError(`${responsavel.nome} não tem acesso a este processo e não pode ser responsável pelo prazo.`);
  }

  const entradaMotor: EntradaPrazo = {
    formaIntimacao: dados.formaIntimacao,
    formaIntimacaoDetalhe: dados.formaIntimacaoDetalhe,
    dataReferencia: dados.dataReferencia,
    quantidadeDias: dados.quantidadeDias,
    tipoContagem: dados.tipoContagem,
    emDobro: dados.emDobro,
    criminal: dados.criminal,
  };
  const simulacao = await simularNoProcesso(tx, processo, entradaMotor);
  const comuns = {
    processoId,
    andamentoId,
    descricao: dados.descricao,
    dataReferencia: paraDate(dados.dataReferencia),
    formaIntimacao: dados.formaIntimacao,
    formaIntimacaoDetalhe: dados.formaIntimacaoDetalhe,
    quantidadeDias: dados.quantidadeDias,
    tipoContagem: dados.tipoContagem,
    emDobro: dados.emDobro,
    criminal: dados.criminal,
    responsavelId: dados.responsavelId,
    observacoes: dados.observacoes,
  };

  if (simulacao.tipo === "calculado") {
    if (dados.dataFinalManual) {
      throw new RegraDeNegocioError(
        "O sistema calculou este prazo; a data manual só é aceita quando o cálculo não é possível. Para mudar a data, use o ajuste com justificativa.",
      );
    }
    const r = simulacao.resultado;
    const memoria: MemoriaPrazo = { tipo: "automatica", ...r.memoria };
    return tx.prazo.create({
      data: {
        ...comuns,
        modoCalculo: "AUTOMATICO",
        dataIntimacao: paraDate(r.dataIntimacao),
        dataInicio: paraDate(r.dataInicio),
        dataFinalCalculada: paraDate(r.dataFinal),
        dataFinalEfetiva: paraDate(r.dataFinal),
        memoriaCalculo: comoJson(memoria),
        versaoMotor: r.memoria.versaoMotor,
      },
    });
  }

  // D11: sem regra definida, vale a data informada pelo usuário.
  if (!dados.dataFinalManual) {
    throw new RegraDeNegocioError(`${simulacao.mensagem} Informe a data final manualmente.`);
  }
  if (dados.dataFinalManual < dados.dataReferencia) {
    throw new RegraDeNegocioError("A data final não pode ser anterior à data de referência.");
  }
  const memoria = memoriaManual(
    entradaMotor,
    { codigo: simulacao.codigo, mensagem: simulacao.mensagem },
    dados.dataFinalManual,
    dados.justificativaManual ?? null,
    usuario.nome,
  );
  return tx.prazo.create({
    data: {
      ...comuns,
      modoCalculo: "MANUAL",
      pendenciaRegra: simulacao.codigo,
      dataFinalManual: paraDate(dados.dataFinalManual),
      justificativaManual: dados.justificativaManual,
      dataFinalEfetiva: paraDate(dados.dataFinalManual),
      memoriaCalculo: comoJson(memoria),
      versaoMotor: memoria.versaoMotor,
    },
  });
}

export async function criarPrazo(
  usuario: UsuarioAtual,
  processoId: string,
  entrada: unknown,
  cliente: PrismaClient = prisma(),
) {
  return comUsuario(usuario.id, (tx) => criarPrazoNaTransacao(tx, usuario, processoId, entrada), cliente);
}

async function prazoVisivel(tx: Transacao, usuario: UsuarioAtual, id: string) {
  const prazo = await tx.prazo.findFirst({
    where: { id, excluidoEm: null, processo: { excluidoEm: null, AND: [filtroProcessosVisiveis(usuario)] } },
  });
  if (!prazo) throw new NaoEncontradoError("Prazo não encontrado.");
  return prazo;
}

/** D16: confere quem é responsável pelo prazo, qualquer que seja o perfil. */
export async function conferirPrazo(usuario: UsuarioAtual, id: string, cliente: PrismaClient = prisma()) {
  return comUsuario(
    usuario.id,
    async (tx) => {
      const prazo = await prazoVisivel(tx, usuario, id);
      if (prazo.responsavelId !== usuario.id) {
        throw new ProibidoError("Somente o responsável pelo prazo pode conferi-lo.");
      }
      return tx.prazo.update({ where: { id }, data: { conferidoPorId: usuario.id, conferidoEm: new Date() } });
    },
    cliente,
  );
}

export const esquemaAjuste = z.object({
  dataFinalAjustada: dataCivil,
  justificativaAjuste: textoObrigatorio("a justificativa do ajuste"),
});

/** D17: advogado e administrador; a data ajustada prevalece e a conferência é desfeita. */
export async function ajustarPrazo(
  usuario: UsuarioAtual,
  id: string,
  entrada: unknown,
  cliente: PrismaClient = prisma(),
) {
  exigirPermissao(usuario, "prazo.editar");
  const dados = esquemaAjuste.parse(entrada);
  return comUsuario(
    usuario.id,
    async (tx) => {
      const prazo = await prazoVisivel(tx, usuario, id);
      if (prazo.situacao !== "ABERTO") throw new RegraDeNegocioError("Só prazos abertos podem ser ajustados.");
      return tx.prazo.update({
        where: { id },
        data: {
          dataFinalAjustada: paraDate(dados.dataFinalAjustada),
          justificativaAjuste: dados.justificativaAjuste,
          dataFinalEfetiva: paraDate(dados.dataFinalAjustada),
          conferidoPorId: null,
          conferidoEm: null,
        },
      });
    },
    cliente,
  );
}

export const esquemaCumprimento = z.object({ cumpridoEm: dataCivil });

/** Marcar como cumprido: inclui assistente (D9). */
export async function cumprirPrazo(
  usuario: UsuarioAtual,
  id: string,
  entrada: unknown,
  cliente: PrismaClient = prisma(),
) {
  exigirPermissao(usuario, "prazo.cumprir");
  const { cumpridoEm } = esquemaCumprimento.parse(entrada);
  if (cumpridoEm > hoje()) throw new RegraDeNegocioError("A data de cumprimento não pode ser futura.");
  return comUsuario(
    usuario.id,
    async (tx) => {
      const prazo = await prazoVisivel(tx, usuario, id);
      if (prazo.situacao !== "ABERTO") throw new RegraDeNegocioError("O prazo não está aberto.");
      return tx.prazo.update({ where: { id }, data: { situacao: "CUMPRIDO", cumpridoEm: paraDate(cumpridoEm) } });
    },
    cliente,
  );
}

/** Perdido, cancelado ou reaberto (D13: o sistema nunca marca "perdido" sozinho). */
export async function alterarSituacaoPrazo(
  usuario: UsuarioAtual,
  id: string,
  situacao: "PERDIDO" | "CANCELADO" | "ABERTO",
  cliente: PrismaClient = prisma(),
) {
  exigirPermissao(usuario, "prazo.editar");
  z.enum(["PERDIDO", "CANCELADO", "ABERTO"]).parse(situacao);
  return comUsuario(
    usuario.id,
    async (tx) => {
      const prazo = await prazoVisivel(tx, usuario, id);
      if (situacao === "ABERTO" ? prazo.situacao === "ABERTO" : prazo.situacao !== "ABERTO") {
        throw new RegraDeNegocioError(
          situacao === "ABERTO" ? "O prazo já está aberto." : `Prazo ${prazo.situacao.toLowerCase()}: reabra antes de alterar.`,
        );
      }
      return tx.prazo.update({
        where: { id },
        data: { situacao, cumpridoEm: situacao === "ABERTO" ? null : prazo.cumpridoEm },
      });
    },
    cliente,
  );
}

export function descreverDataEfetiva(p: { dataFinalEfetiva: Date; dataFinalAjustada: Date | null; modoCalculo: string }) {
  const data = formatarData(p.dataFinalEfetiva.toISOString().slice(0, 10));
  if (p.dataFinalAjustada) return `${data} (ajustada)`;
  return p.modoCalculo === "MANUAL" ? `${data} (contado manualmente)` : data;
}

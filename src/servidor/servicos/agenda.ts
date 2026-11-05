// Agenda, a tela inicial (seção 5): prazos e audiências de hoje, dos próximos 7 dias úteis e
// vencidos, por responsável. Dias úteis e alertas pelo calendário de cada processo (D12, 4.4).

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { somarDias, type DataCivil } from "@/dominio/prazos/data-civil";
import type { Calendario } from "@/dominio/prazos/calendario";
import { dataEmSaoPaulo, dataHoraDeSaoPaulo } from "@/lib/data-hora";
import { hoje as hojeSp, paraDataCivil, paraDate } from "@/lib/hoje";
import type { UsuarioAtual } from "../auth/usuario";
import { prisma } from "../db/prisma";
import { filtroProcessosVisiveis } from "../permissoes/visibilidade";
import { carregarCalendarios } from "./calendario";

export const DIAS_UTEIS_AGENDA = 7;
// Folga em dias corridos para cobrir 7 dias úteis mesmo atravessando o recesso de 32 dias.
const JANELA_CORRIDA = 60;

export type Alerta = "vencido" | "vermelho" | "amarelo" | "nenhum";

/** Seção 4.4: até 3 dias úteis vermelho; até 10 amarelo; vencido e não cumprido, cinza. */
export function alerta(diasUteis: number | null): Alerta {
  if (diasUteis === null) return "vencido";
  if (diasUteis <= 3) return "vermelho";
  if (diasUteis <= 10) return "amarelo";
  return "nenhum";
}

/** Dias úteis de amanhã até `data` (inclusive); 0 = hoje; null = já passou. */
export function diasUteisAte(calendario: Calendario, hoje: DataCivil, data: DataCivil): number | null {
  if (data < hoje) return null;
  let n = 0;
  for (let d = somarDias(hoje, 1); d <= data; d = somarDias(d, 1)) if (calendario.ehDiaUtil(d)) n++;
  return n;
}

export type FiltroResponsavel = "meus" | "todos" | string;

const incluirProcesso = {
  select: {
    id: true,
    numeroCnj: true,
    assunto: true,
    comarcaId: true,
    tribunalCodigo: true,
    grau: true,
    cnjSegmento: true,
    comarca: { select: { nome: true, uf: true } },
    tribunal: { select: { sigla: true, uf: true, segmento: true, sedeCidade: true, sedeUf: true } },
    partes: { where: { ehClienteDoEscritorio: true }, select: { pessoa: { select: { id: true, nome: true } } } },
  },
} as const;

export async function obterAgenda(
  usuario: UsuarioAtual,
  filtro: FiltroResponsavel = "meus",
  hoje: DataCivil = hojeSp(),
  cliente: PrismaClient = prisma(),
) {
  const responsavelId = filtro === "meus" ? usuario.id : filtro === "todos" ? undefined : filtro;
  const processo: Prisma.ProcessoWhereInput = { excluidoEm: null, AND: [filtroProcessosVisiveis(usuario)] };
  const limite = paraDate(somarDias(hoje, JANELA_CORRIDA));

  const [prazos, audiencias, compromissos, calendarios] = await Promise.all([
    cliente.prazo.findMany({
      where: { situacao: "ABERTO", excluidoEm: null, processo, ...(responsavelId && { responsavelId }), dataFinalEfetiva: { lte: limite } },
      include: { processo: incluirProcesso, responsavel: { select: { id: true, nome: true } } },
      orderBy: { dataFinalEfetiva: "asc" },
    }),
    cliente.audiencia.findMany({
      where: {
        excluidoEm: null,
        processo,
        ...(responsavelId && { responsavelId }),
        dataHora: { gte: dataHoraDeSaoPaulo(`${hoje}T00:00`), lte: limite },
      },
      include: { processo: incluirProcesso, responsavel: { select: { id: true, nome: true } }, tipo: true },
      orderBy: { dataHora: "asc" },
    }),
    cliente.compromisso.findMany({
      where: {
        excluidoEm: null,
        OR: [{ processoId: null }, { processo }],
        ...(responsavelId && { responsavelId }),
        inicio: { gte: dataHoraDeSaoPaulo(`${hoje}T00:00`), lte: limite },
      },
      include: { processo: incluirProcesso, responsavel: { select: { id: true, nome: true } } },
      orderBy: { inicio: "asc" },
    }),
    carregarCalendarios(cliente, paraDate(hoje)),
  ]);


  const itensPrazo = prazos.map((p) => {
    const dias = diasUteisAte(calendarios.para(p.processo), hoje, paraDataCivil(p.dataFinalEfetiva));
    return { ...p, diasUteis: dias, alerta: alerta(dias) };
  });
  const itensAudiencia = audiencias
    .map((a) => ({ ...a, diasUteis: diasUteisAte(calendarios.para(a.processo), hoje, dataEmSaoPaulo(a.dataHora)) }))
    .filter((a) => a.diasUteis !== null && a.diasUteis <= DIAS_UTEIS_AGENDA);

  // Compromisso avulso: calendário sem comarca nem tribunal (fins de semana, nacionais e recesso).
  const semProcesso = { comarcaId: null, tribunalCodigo: null };
  const itensCompromisso = compromissos
    .map((c) => ({ ...c, diasUteis: diasUteisAte(calendarios.para(c.processo ?? semProcesso), hoje, dataEmSaoPaulo(c.inicio)) }))
    .filter((c) => c.diasUteis !== null && c.diasUteis <= DIAS_UTEIS_AGENDA);

  return {
    hoje,
    compromissos: itensCompromisso,
    vencidos: itensPrazo.filter((p) => p.diasUteis === null),
    deHoje: itensPrazo.filter((p) => p.diasUteis === 0),
    proximos: itensPrazo.filter((p) => p.diasUteis !== null && p.diasUteis >= 1 && p.diasUteis <= DIAS_UTEIS_AGENDA),
    audiencias: itensAudiencia,
  };
}

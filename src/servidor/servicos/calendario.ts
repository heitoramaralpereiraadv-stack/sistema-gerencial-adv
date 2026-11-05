// Calendário de cada processo (regra 6, D12 e B8): feriados da tabela aplicáveis ao tribunal e
// à comarca dele, mais fins de semana e recesso. Em 2º grau e Turma Recursal valem os
// feriados da sede do tribunal; na Justiça Federal, só os nacionais.

import type { PrismaClient } from "@/generated/prisma/client";
import { Calendario, feriadosAplicaveis, type DiaNaoUtil, type LocalProcesso } from "@/dominio/prazos/calendario";
import { paraDataCivil } from "@/lib/hoje";
import type { Transacao } from "../db/prisma";

export interface ProcessoComLocal {
  comarcaId: string | null;
  tribunalCodigo: string | null;
  grau?: string | null;
  cnjSegmento?: string | null;
  comarca?: { uf: string } | null;
  tribunal?: { uf: string | null; segmento: string; sedeCidade: string | null; sedeUf: string | null } | null;
}

const GRAUS_NA_SEDE = new Set(["SEGUNDO", "RECURSAL", "SUPERIOR"]);
const chaveComarca = (nome: string, uf: string) =>
  `${nome.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()}|${uf}`;

/** Registros da tabela Feriado a partir de uma data e as comarcas (para achar a sede). */
export async function carregarCalendarios(tx: Transacao | PrismaClient, aPartirDe: Date): Promise<Calendarios> {
  const feriados = await tx.feriado.findMany({ where: { data: { gte: aPartirDe } } });
  const comarcas = await tx.comarca.findMany({ select: { id: true, nome: true, uf: true } });
  const dias: DiaNaoUtil[] = feriados.map((f) => ({
    data: paraDataCivil(f.data),
    abrangencia: f.abrangencia,
    natureza: f.natureza,
    uf: f.uf,
    comarcaId: f.comarcaId,
    tribunalCodigo: f.tribunalCodigo,
    descricao: f.descricao,
  }));
  return new Calendarios(dias, new Map(comarcas.map((c) => [chaveComarca(c.nome, c.uf), c.id])));
}

/** Monta e reaproveita um Calendario por local (vários processos compartilham comarca). */
export class Calendarios {
  private readonly cache = new Map<string, Calendario>();
  constructor(
    private readonly dias: DiaNaoUtil[],
    private readonly comarcasPorNome = new Map<string, string>(),
  ) {}

  local(p: ProcessoComLocal): LocalProcesso {
    const segmento = p.tribunal?.segmento ?? p.cnjSegmento ?? null;
    const t = p.tribunal;
    if (p.grau && GRAUS_NA_SEDE.has(p.grau) && t?.sedeCidade && t.sedeUf) {
      return {
        uf: t.sedeUf,
        comarcaId: this.comarcasPorNome.get(chaveComarca(t.sedeCidade, t.sedeUf)) ?? null,
        tribunalCodigo: p.tribunalCodigo,
        segmento,
      };
    }
    return { uf: p.comarca?.uf ?? t?.uf ?? null, comarcaId: p.comarcaId, tribunalCodigo: p.tribunalCodigo, segmento };
  }

  para(p: ProcessoComLocal): Calendario {
    const local = this.local(p);
    const chave = `${local.uf}|${local.comarcaId}|${local.tribunalCodigo}|${local.segmento}`;
    let c = this.cache.get(chave);
    if (!c) {
      c = new Calendario(feriadosAplicaveis(this.dias, local));
      this.cache.set(chave, c);
    }
    return c;
  }
}

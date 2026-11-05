// Dias não úteis para a contagem de prazos (requisitos, seção 4.2, regras 6 e 8).

import { diaDaSemana, formatarData, type DataCivil } from "./data-civil";

export type Abrangencia = "NACIONAL" | "ESTADUAL" | "MUNICIPAL" | "FORENSE";
export type NaturezaDia = "FERIADO" | "INDISPONIBILIDADE" | "EXPEDIENTE_REDUZIDO";

/** Registro da tabela Feriado. */
export interface DiaNaoUtil {
  data: DataCivil;
  abrangencia: Abrangencia;
  natureza: NaturezaDia;
  uf?: string | null;
  comarcaId?: string | null;
  tribunalCodigo?: string | null;
  descricao: string;
}

/**
 * Onde o processo tramita, para escolher os feriados aplicáveis. Em 2º grau e Turma
 * Recursal, uf e comarca são as da sede do tribunal (B8).
 */
export interface LocalProcesso {
  uf: string | null;
  comarcaId: string | null;
  tribunalCodigo: string | null;
  /** Segmento J do número CNJ: "4" Federal, "5" Trabalho, "8" Estadual. */
  segmento?: string | null;
}

/**
 * Feriados "aplicáveis ao tribunal e à comarca do processo" (regra 6 e B8):
 * nacionais sempre; forenses e indisponibilidades do tribunal do processo (e da comarca, se o
 * registro a indicar); estaduais da UF e municipais da comarca, exceto na Justiça Federal,
 * que segue só os nacionais (e os registros do próprio tribunal).
 */
export function feriadosAplicaveis(feriados: DiaNaoUtil[], local: LocalProcesso): DiaNaoUtil[] {
  const federal = local.segmento === "4";
  return feriados.filter((f) => {
    switch (f.abrangencia) {
      case "NACIONAL":
        return true;
      case "ESTADUAL":
        return !federal && local.uf != null && f.uf === local.uf;
      case "MUNICIPAL":
        return !federal && local.comarcaId != null && f.comarcaId === local.comarcaId;
      case "FORENSE":
        return (
          local.tribunalCodigo != null &&
          f.tribunalCodigo === local.tribunalCodigo &&
          (f.comarcaId == null || f.comarcaId === local.comarcaId)
        );
    }
  });
}

const ROTULO_ABRANGENCIA: Record<Abrangencia, string> = {
  NACIONAL: "Feriado nacional",
  ESTADUAL: "Feriado estadual",
  MUNICIPAL: "Feriado municipal",
  FORENSE: "Feriado forense",
};

export const MOTIVO_RECESSO = "Recesso de 20/12 a 20/01 (CPC, art. 220)";

/** CPC, art. 220: de 20 de dezembro a 20 de janeiro, inclusive. */
export function emRecesso(d: DataCivil): boolean {
  const mmdd = d.slice(5);
  return mmdd >= "12-20" || mmdd <= "01-20";
}

export class Calendario {
  private readonly porData = new Map<DataCivil, DiaNaoUtil[]>();

  /** Recebe somente os registros já filtrados para o processo (feriadosAplicaveis). */
  constructor(dias: DiaNaoUtil[]) {
    for (const d of dias) {
      const lista = this.porData.get(d.data) ?? [];
      lista.push(d);
      this.porData.set(d.data, lista);
    }
  }

  /** Sábado, domingo, feriado ou indisponibilidade — sem considerar o recesso. */
  motivosSemRecesso(d: DataCivil): string[] {
    const motivos: string[] = [];
    const dia = diaDaSemana(d);
    if (dia === 6) motivos.push("Sábado");
    if (dia === 0) motivos.push("Domingo");
    for (const f of this.porData.get(d) ?? []) {
      if (f.natureza === "EXPEDIENTE_REDUZIDO") continue;
      motivos.push(
        f.natureza === "INDISPONIBILIDADE"
          ? `Indisponibilidade do sistema: ${f.descricao}`
          : `${ROTULO_ABRANGENCIA[f.abrangencia]}: ${f.descricao}`,
      );
    }
    return motivos;
  }

  /** Todos os motivos pelos quais o dia fica fora da contagem (vazio = dia útil). */
  motivos(d: DataCivil): string[] {
    const motivos = this.motivosSemRecesso(d);
    if (emRecesso(d)) motivos.push(MOTIVO_RECESSO);
    return motivos;
  }

  /** Descrição do expediente reduzido do dia (B13), se houver. Não torna o dia "não útil". */
  expedienteReduzido(d: DataCivil): string | null {
    const f = (this.porData.get(d) ?? []).find((x) => x.natureza === "EXPEDIENTE_REDUZIDO");
    return f ? `Expediente reduzido: ${f.descricao}` : null;
  }

  ehDiaUtil(d: DataCivil): boolean {
    return this.motivos(d).length === 0;
  }

  descrever(d: DataCivil): string {
    const m = this.motivos(d);
    return m.length ? `${formatarData(d)}: ${m.join("; ")}` : `${formatarData(d)}: dia útil`;
  }
}

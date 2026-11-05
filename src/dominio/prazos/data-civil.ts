// Data sem hora nem fuso ("AAAA-MM-DD"). Prazos processuais contam dias de calendário,
// então toda a aritmética é feita em UTC para não sofrer com horário de verão ou fuso.

export type DataCivil = string;

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DIAS_SEMANA = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado",
];

function paraUtc(d: DataCivil): Date {
  const m = FORMATO.exec(d);
  if (!m) throw new Error(`Data inválida: ${d}`);
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (dt.toISOString().slice(0, 10) !== d) throw new Error(`Data inválida: ${d}`);
  return dt;
}

export function validarData(d: DataCivil): DataCivil {
  paraUtc(d);
  return d;
}

export function somarDias(d: DataCivil, dias: number): DataCivil {
  const dt = paraUtc(d);
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(d: DataCivil): number {
  return paraUtc(d).getUTCDay();
}

export function nomeDiaDaSemana(d: DataCivil): string {
  return DIAS_SEMANA[diaDaSemana(d)]!;
}

/** "05/03/2026" */
export function formatarData(d: DataCivil): string {
  const [a, m, dia] = d.split("-");
  return `${dia}/${m}/${a}`;
}

/** "05/03/2026 (quinta-feira)" */
export function formatarDataComDia(d: DataCivil): string {
  return `${formatarData(d)} (${nomeDiaDaSemana(d)})`;
}

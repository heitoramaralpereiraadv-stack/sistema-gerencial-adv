// Feriados definidos pelos sócios (resposta B11, 03/11/2026). Feriados locais das demais
// comarcas e forenses dos tribunais serão informados depois pelo administrador.

import { somarDias, type DataCivil } from "./data-civil";

export interface FeriadoPadrao {
  data: DataCivil;
  abrangencia: "NACIONAL" | "MUNICIPAL";
  natureza: "FERIADO" | "EXPEDIENTE_REDUZIDO";
  /** Para municipais: comarca a que se aplica. */
  comarca?: { nome: string; uf: string };
  descricao: string;
  fonte: string;
}

const FONTE_SOCIOS = "Lista definida pelos sócios (B11)";
const FONTE_MOVEL = "Data móvel calculada a partir da Páscoa (B11, B13) — conferir no calendário oficial do ano";

const FIXOS_NACIONAIS: [string, string][] = [
  ["01-01", "Confraternização Universal"],
  ["04-21", "Tiradentes"],
  ["05-01", "Dia do Trabalho"],
  ["09-07", "Independência do Brasil"],
  ["10-12", "Nossa Senhora Aparecida"],
  ["11-02", "Finados"],
  ["11-15", "Proclamação da República"],
  ["11-20", "Dia Nacional de Zumbi e da Consciência Negra"],
  ["12-25", "Natal"],
];

const GOIANIA = { nome: "Goiânia", uf: "GO" };
const FIXOS_GOIANIA: [string, string][] = [
  ["05-24", "Feriado municipal de Goiânia (24 de maio)"],
  ["10-24", "Feriado municipal de Goiânia (24 de outubro)"],
];

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function pascoa(ano: number): DataCivil {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function feriadosPadrao(ano: number): FeriadoPadrao[] {
  const fixo = (mmdd: string) => `${ano}-${mmdd}`;
  return [
    ...FIXOS_NACIONAIS.map(([d, descricao]) => ({
      data: fixo(d), abrangencia: "NACIONAL" as const, natureza: "FERIADO" as const, descricao, fonte: FONTE_SOCIOS,
    })),
    ...FIXOS_GOIANIA.map(([d, descricao]) => ({
      data: fixo(d), abrangencia: "MUNICIPAL" as const, natureza: "FERIADO" as const, comarca: GOIANIA, descricao, fonte: FONTE_SOCIOS,
    })),
    { data: somarDias(pascoa(ano), -48), abrangencia: "NACIONAL", natureza: "FERIADO", descricao: "Carnaval (segunda-feira)", fonte: FONTE_MOVEL },
    { data: somarDias(pascoa(ano), -47), abrangencia: "NACIONAL", natureza: "FERIADO", descricao: "Carnaval (terça-feira)", fonte: FONTE_MOVEL },
    {
      data: somarDias(pascoa(ano), -46),
      abrangencia: "NACIONAL",
      natureza: "EXPEDIENTE_REDUZIDO",
      descricao: "Quarta-feira de Cinzas",
      fonte: FONTE_MOVEL,
    },
    { data: somarDias(pascoa(ano), -2), abrangencia: "NACIONAL", natureza: "FERIADO", descricao: "Sexta-feira da Semana Santa", fonte: FONTE_MOVEL },
  ];
}

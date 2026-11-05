// Formato comum dos relatórios (seção 6): a mesma tabela vira tela, Excel e PDF.

import { z } from "zod";
import type { DataCivil } from "@/dominio/prazos/data-civil";
import { hoje } from "@/lib/hoje";

export interface Coluna {
  chave: string;
  titulo: string;
  /** Peso relativo da largura (padrão 1). */
  largura?: number;
  numero?: boolean;
}

export type Valor = string | number | null;

export interface Tabela {
  titulo: string;
  /** Linhas de resumo acima da tabela (ex.: totais por responsável). */
  resumo?: { rotulo: string; valor: Valor }[];
  colunas: Coluna[];
  linhas: Record<string, Valor>[];
  /** Link de cada linha, só na tela (ex.: lista filtrada). */
  links?: (string | null)[];
  observacao?: string;
}

export interface Filtros {
  inicio: DataCivil;
  fim: DataCivil;
  responsavelId?: string;
  areaId?: string;
  statusId?: string;
}

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const idOpcional = z.preprocess((v) => (v === "" ? undefined : v), z.uuid().optional());

function mesAtual(): { inicio: DataCivil; fim: DataCivil } {
  const h = hoje();
  const [a, m] = h.split("-").map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { inicio: `${h.slice(0, 7)}-01`, fim: `${h.slice(0, 7)}-${String(ultimo).padStart(2, "0")}` };
}

/** Filtros da URL; período padrão = mês corrente. Valores inválidos são ignorados. */
export function lerFiltros(p: Record<string, string | string[] | undefined>): Filtros {
  const v = (k: string) => (Array.isArray(p[k]) ? p[k][0] : p[k]);
  const padrao = mesAtual();
  const inicio = data.safeParse(v("inicio")).data ?? padrao.inicio;
  const fim = data.safeParse(v("fim")).data ?? padrao.fim;
  return {
    inicio: inicio <= fim ? inicio : fim,
    fim: inicio <= fim ? fim : inicio,
    responsavelId: idOpcional.safeParse(v("responsavelId")).data,
    areaId: idOpcional.safeParse(v("areaId")).data,
    statusId: idOpcional.safeParse(v("statusId")).data,
  };
}

export interface Escritorio {
  razaoSocial: string;
  cnpj: string | null;
  registroOab: string | null;
  endereco: string | null;
  telefone: string | null;
  email: string | null;
  logoBase64: string | null;
  logoTipo: string | null;
}

/** Contexto impresso no cabeçalho de toda exportação. */
export interface ContextoExportacao {
  escritorio: Escritorio;
  filtrosDescritos: string[];
  geradoPor: string;
  geradoEm: Date;
}

// Número único de processo — Resolução CNJ 65/2008 (requisitos, seção 4.1).
// Formato NNNNNNN-DD.AAAA.J.TR.OOOO; DD é o dígito verificador módulo 97.

import { SEGMENTOS, tribunalPorCodigo, type TribunalCnj } from "./tribunais";

export interface NumeroCnj {
  formatado: string;
  sequencial: string;
  digito: string;
  ano: number;
  segmento: string;
  nomeSegmento: string | null;
  codigoTribunal: string; // "8.09"
  tribunal: TribunalCnj | null;
  origem: string;
}

export type ResultadoCnj =
  | { valido: true; numero: NumeroCnj }
  | { valido: false; erro: string };

const SO_DIGITOS = /^\d{20}$/;
const FORMATADO = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/;

/** Dígito verificador conforme o anexo VIII da Resolução CNJ 65/2008. */
export function calcularDigito(n: string, ano: string, j: string, tr: string, origem: string): string {
  const resto = BigInt(n + ano + j + tr + origem + "00") % 97n;
  return String(98n - resto).padStart(2, "0");
}

/** Aceita o número com ou sem pontuação; devolve as partes e o número formatado. */
export function validarNumeroCnj(entrada: string): ResultadoCnj {
  const texto = entrada.trim();
  if (!SO_DIGITOS.test(texto) && !FORMATADO.test(texto)) {
    return {
      valido: false,
      erro: "Formato inválido. Use NNNNNNN-DD.AAAA.J.TR.OOOO ou os 20 dígitos sem pontuação.",
    };
  }
  const d = texto.replace(/\D/g, "");
  const sequencial = d.slice(0, 7);
  const digito = d.slice(7, 9);
  const ano = d.slice(9, 13);
  const j = d.slice(13, 14);
  const tr = d.slice(14, 16);
  const origem = d.slice(16, 20);

  if (calcularDigito(sequencial, ano, j, tr, origem) !== digito) {
    return { valido: false, erro: "Dígito verificador inválido: confira o número digitado." };
  }

  const codigoTribunal = `${j}.${tr}`;
  return {
    valido: true,
    numero: {
      formatado: `${sequencial}-${digito}.${ano}.${j}.${tr}.${origem}`,
      sequencial,
      digito,
      ano: Number(ano),
      segmento: j,
      nomeSegmento: SEGMENTOS[j] ?? null,
      codigoTribunal,
      tribunal: tribunalPorCodigo(codigoTribunal) ?? null,
      origem,
    },
  };
}

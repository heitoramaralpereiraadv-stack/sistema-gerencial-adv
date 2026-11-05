// Validação de CPF e CNPJ (seção 3: "CPF/CNPJ único e validado").
// O CNPJ aceita o formato alfanumérico adotado pela Receita Federal a partir de julho de 2026
// (IN RFB 2.229/2024): 12 primeiras posições com 0-9 ou A-Z, dígitos verificadores numéricos.

export type ResultadoDocumento =
  | { valido: true; tipo: "CPF" | "CNPJ"; normalizado: string; formatado: string }
  | { valido: false; erro: string };

/** Remove pontuação e espaços; letras ficam em maiúsculas. */
export function normalizarDocumento(entrada: string): string {
  return entrada.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function digitoCpf(base: string): number {
  const peso = base.length + 1;
  const soma = [...base].reduce((s, c, i) => s + Number(c) * (peso - i), 0);
  return ((soma * 10) % 11) % 10;
}

export function validarCpf(entrada: string): ResultadoDocumento {
  const n = normalizarDocumento(entrada);
  if (!/^\d{11}$/.test(n)) return { valido: false, erro: "CPF deve ter 11 dígitos." };
  if (/^(\d)\1{10}$/.test(n)) return { valido: false, erro: "CPF inválido." };
  const d1 = digitoCpf(n.slice(0, 9));
  const d2 = digitoCpf(n.slice(0, 9) + d1);
  if (n.slice(9) !== `${d1}${d2}`) return { valido: false, erro: "CPF inválido: confira os dígitos." };
  return {
    valido: true,
    tipo: "CPF",
    normalizado: n,
    formatado: `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`,
  };
}

const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_2 = [6, ...PESOS_CNPJ_1];

function digitoCnpj(base: string, pesos: number[]): number {
  const soma = [...base].reduce((s, c, i) => s + (c.charCodeAt(0) - 48) * pesos[i]!, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCnpj(entrada: string): ResultadoDocumento {
  const n = normalizarDocumento(entrada);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(n)) return { valido: false, erro: "CNPJ deve ter 14 posições." };
  if (/^(\d)\1{13}$/.test(n)) return { valido: false, erro: "CNPJ inválido." };
  const d1 = digitoCnpj(n.slice(0, 12), PESOS_CNPJ_1);
  const d2 = digitoCnpj(n.slice(0, 12) + d1, PESOS_CNPJ_2);
  if (n.slice(12) !== `${d1}${d2}`) return { valido: false, erro: "CNPJ inválido: confira os dígitos." };
  return {
    valido: true,
    tipo: "CNPJ",
    normalizado: n,
    formatado: `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}`,
  };
}

/** CPF ou CNPJ, decidido pelo tamanho. */
export function validarCpfCnpj(entrada: string): ResultadoDocumento {
  return normalizarDocumento(entrada).length === 11 ? validarCpf(entrada) : validarCnpj(entrada);
}

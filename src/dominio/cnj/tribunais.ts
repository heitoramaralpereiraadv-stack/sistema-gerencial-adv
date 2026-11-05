// Códigos J.TR da numeração única (Resolução CNJ 65/2008) para os segmentos
// usados pelo escritório: 4 = Justiça Federal, 5 = Justiça do Trabalho, 8 = Justiça Estadual.

export interface TribunalCnj {
  codigo: string; // "8.09"
  sigla: string;
  segmento: "4" | "5" | "8";
  uf: string | null; // null quando a jurisdição abrange mais de uma UF
  /** Sede do tribunal: feriados aplicados aos processos em 2º grau e Turmas Recursais (B8). */
  sede: { cidade: string; uf: string };
}

export const SEGMENTOS: Record<string, string> = {
  "4": "Justiça Federal",
  "5": "Justiça do Trabalho",
  "8": "Justiça Estadual",
};

const UFS_ESTADUAIS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SE", "SP", "TO",
];

// UF de cada TRT; null para os regionais que abrangem mais de um estado.
const UFS_TRT: (string | null)[] = [
  "RJ", "SP", "MG", "RS", "BA", "PE", "CE", null, "PR", null, null, "SC",
  "PB", null, "SP", "MA", "ES", "GO", "AL", "SE", "RN", "PI", "MT", "MS",
];

const CAPITAIS: Record<string, string> = {
  AC: "Rio Branco", AL: "Maceió", AP: "Macapá", AM: "Manaus", BA: "Salvador", CE: "Fortaleza", DF: "Brasília",
  ES: "Vitória", GO: "Goiânia", MA: "São Luís", MT: "Cuiabá", MS: "Campo Grande", MG: "Belo Horizonte",
  PA: "Belém", PB: "João Pessoa", PR: "Curitiba", PE: "Recife", PI: "Teresina", RJ: "Rio de Janeiro",
  RN: "Natal", RS: "Porto Alegre", RO: "Porto Velho", RR: "Boa Vista", SC: "Florianópolis", SE: "Aracaju",
  SP: "São Paulo", TO: "Palmas",
};

// Sede de cada TRT (índice = número do regional - 1).
const SEDES_TRT: [string, string][] = [
  ["Rio de Janeiro", "RJ"], ["São Paulo", "SP"], ["Belo Horizonte", "MG"], ["Porto Alegre", "RS"], ["Salvador", "BA"],
  ["Recife", "PE"], ["Fortaleza", "CE"], ["Belém", "PA"], ["Curitiba", "PR"], ["Brasília", "DF"], ["Manaus", "AM"],
  ["Florianópolis", "SC"], ["João Pessoa", "PB"], ["Porto Velho", "RO"], ["Campinas", "SP"], ["São Luís", "MA"],
  ["Vitória", "ES"], ["Goiânia", "GO"], ["Maceió", "AL"], ["Aracaju", "SE"], ["Natal", "RN"], ["Teresina", "PI"],
  ["Cuiabá", "MT"], ["Campo Grande", "MS"],
];

const SEDES_TRF: [string, string][] = [
  ["Brasília", "DF"], ["Rio de Janeiro", "RJ"], ["São Paulo", "SP"], ["Porto Alegre", "RS"], ["Recife", "PE"], ["Belo Horizonte", "MG"],
];

const doisDigitos = (n: number) => String(n).padStart(2, "0");

export const TRIBUNAIS: TribunalCnj[] = [
  ...UFS_ESTADUAIS.map((uf, i) => ({
    codigo: `8.${doisDigitos(i + 1)}`,
    sigla: uf === "DF" ? "TJDFT" : `TJ${uf}`,
    segmento: "8" as const,
    uf,
    sede: { cidade: CAPITAIS[uf]!, uf },
  })),
  ...UFS_TRT.map((uf, i) => ({
    codigo: `5.${doisDigitos(i + 1)}`,
    sigla: `TRT-${i + 1}`,
    segmento: "5" as const,
    uf,
    sede: { cidade: SEDES_TRT[i]![0], uf: SEDES_TRT[i]![1] },
  })),
  ...[1, 2, 3, 4, 5, 6].map((n) => ({
    codigo: `4.${doisDigitos(n)}`,
    sigla: `TRF-${n}`,
    segmento: "4" as const,
    uf: null,
    sede: { cidade: SEDES_TRF[n - 1]![0], uf: SEDES_TRF[n - 1]![1] },
  })),
];

const PORCODIGO = new Map(TRIBUNAIS.map((t) => [t.codigo, t]));

export function tribunalPorCodigo(codigo: string): TribunalCnj | undefined {
  return PORCODIGO.get(codigo);
}

// Regras da importação (seção 8.1 e decisões C1–C8). Funções puras, testadas com dados fictícios.

export const semAcento = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "");
export const normalizar = (t: string) =>
  semAcento(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");

/**
 * Instituições financeiras e seguradoras da aba Relatório da planilha. Servem para reconhecer
 * nomes equivalentes ("Banco Inbursa S.A." e "Inbursa") e o polo do banco (C2).
 */
export const INSTITUICOES = [
  "agibank", "bmg", "brb", "banco do brasil", "banrisul", "bradesco", "c6", "capital consig", "digio", "facta",
  "icatu", "inbursa", "itau", "master", "mercado pago", "novo banco continental", "ole", "pan", "parana banco",
  "pine", "porto seguro", "santander",
];

/** Instituições citadas no nome, como palavras inteiras ("Masterfix" não é "Master"). */
export function instituicoesNoNome(nome: string): string[] {
  const n = ` ${normalizar(nome)} `;
  return INSTITUICOES.filter((i) => n.includes(` ${i} `));
}

export const ehBanco = (nome: string) =>
  instituicoesNoNome(nome).length > 0 || /\b(banco|financeira|consignad|credito|financiamento)/.test(normalizar(nome));
export const ehEntePublico = (nome: string) =>
  /^(inss|estado d|municipio d|uniao|fazenda publica|goianiaprev)/.test(normalizar(nome)) || /\binss\b/.test(normalizar(nome));
const ehEmpresa = (nome: string) =>
  /\b(ltda|s a|sa|me|eireli|cia|hospital|shopping|construtora|empreendimentos|franquia|farmaceuticos|produtos|industria|ind|comercio|com|associacao|spe|seguros|seguradora)\b/.test(
    normalizar(nome),
  );

export type TipoPessoa = "PF" | "PJ" | "ESPOLIO" | "ENTE_PUBLICO";
export type Categoria = "Instituição financeira" | "Seguradora" | "Empresa";

/** Tipo e categoria da parte contrária a partir do texto e da coluna "Tipo de parte contrária". */
export function classificarParte(nome: string, tipoPlanilha: string | null, parteDeComposto: boolean): { tipo: TipoPessoa; categoria: Categoria | null } {
  const n = normalizar(nome);
  if (ehEntePublico(nome)) return { tipo: "ENTE_PUBLICO", categoria: null };
  if (/\b(seguros|seguradora|icatu|porto seguro)\b/.test(n)) return { tipo: "PJ", categoria: "Seguradora" };
  if (ehBanco(nome)) return { tipo: "PJ", categoria: "Instituição financeira" };
  if (ehEmpresa(nome)) return { tipo: "PJ", categoria: "Empresa" };
  const t = normalizar(tipoPlanilha ?? "");
  // Num nome composto ("Fulana e Hospital X"), um nome de três palavras sem marca de empresa é pessoa física.
  if (parteDeComposto && n.split(" ").length >= 3) return { tipo: "PF", categoria: null };
  if (t === "pessoa fisica") return { tipo: "PF", categoria: null };
  if (t === "ente publico") return { tipo: "ENTE_PUBLICO", categoria: null };
  if (t === "instituicao financeira") return { tipo: "PJ", categoria: "Instituição financeira" };
  if (t === "seguradora") return { tipo: "PJ", categoria: "Seguradora" };
  return { tipo: "PJ", categoria: t === "pessoa juridica" ? "Empresa" : null };
}

/** Partes de um nome composto por " / " ou " e ", sem nenhum critério. */
export function partesDoNome(texto: string): string[] {
  return texto
    .split(/\s+\/\s+|\s+e\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

const abreviado = (p: string) => /^\p{L}{1,4}\./u.test(p) || /\s\p{L}{1,4}\.$/u.test(p);
const conhecido = (p: string) => ehEntePublico(p) || instituicoesNoNome(p).length > 0;

/** " e " só separa quando cada pedaço é um nome completo (não "Eli", não "Ind. e Com."). */
function separarPorE(texto: string): string[] {
  const pedacos = texto.split(/\s+e\s+/).map((p) => p.trim());
  if (pedacos.length < 2) return [texto];
  // Uma instituição só, com "e" no nome ("BRB Crédito, Financiamento e Investimento S.A.").
  if (ehBanco(texto) && instituicoesNoNome(texto).length <= 1 && !pedacos.some(ehEntePublico)) return [texto];
  const completo = (p: string) => conhecido(p) || (p.split(/\s+/).length >= 2 && !abreviado(p));
  return pedacos.every(completo) ? pedacos : [texto];
}

function distancia(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]!;
}

/** Nomes ligados por "/" que começam igual ou quase igual são apelidos ("Inovvar / Innovar", "TAC / Taco"). */
function saoApelidos(nomes: string[]): boolean {
  const primeiras = nomes.map((n) => normalizar(n).split(" ")[0] ?? "");
  return primeiras.every((p) => {
    const q = primeiras[0]!;
    return p.startsWith(q) || q.startsWith(p) || distancia(p, q) <= 2;
  });
}

/**
 * Sugestão de separação (C2). Bancos ligados por "/" ou "e" são o mesmo réu (nome e apelido),
 * como nomes quase iguais; nos demais casos, sugere separar. Todo nome com "/" ou "e" vai para
 * a revisão, que decide e pode corrigir os nomes.
 */
export function sugerirSeparacao(texto: string): { partes: string[]; separar: boolean } | null {
  if (partesDoNome(texto).length < 2) return null;
  const porBarra = texto.split(/\s+\/\s+/).map((p) => p.trim());
  const refinadas = porBarra.flatMap(separarPorE);
  if (refinadas.length < 2) return { partes: partesDoNome(texto), separar: false };
  const separar = !refinadas.every(ehBanco) && !(porBarra.length > 1 && saoApelidos(porBarra));
  return { partes: refinadas, separar };
}

/**
 * Chave de equivalência para a mesclagem: instituições pelo conjunto de nomes conhecidos
 * ("Banco Santander / Olé Consignado" = "Banco Olé Consignado / Santander"); demais pelo nome
 * sem acentos, pontuação e sufixos societários.
 */
export function chaveEquivalencia(nome: string): string {
  const inst = instituicoesNoNome(nome);
  if (inst.length) return `instituicao:${[...new Set(inst)].sort().join("+")}`;
  return `nome:${normalizar(nome).replace(/\b(s a|sa|ltda|me|eireli)\b/g, "").replace(/\s+/g, " ").trim()}`;
}

// ── Polo e qualificação ─────────────────────────────────────────────

export type Polo = "ATIVO" | "PASSIVO" | "TERCEIRO" | "OUTRO";
export interface PapelNoProcesso {
  polo: Polo;
  qualificacoes: string[];
}

/** Coluna "Polo do cliente" → polo e qualificações (A5: "Executado (avalista)" = executado + avalista). */
const PAPEL_CLIENTE: Record<string, PapelNoProcesso> = {
  autor: { polo: "ATIVO", qualificacoes: ["Autor"] },
  reu: { polo: "PASSIVO", qualificacoes: ["Réu"] },
  requerente: { polo: "ATIVO", qualificacoes: ["Requerente"] },
  reclamante: { polo: "ATIVO", qualificacoes: ["Reclamante"] },
  exequente: { polo: "ATIVO", qualificacoes: ["Exequente"] },
  executado: { polo: "PASSIVO", qualificacoes: ["Executado"] },
  "executado avalista": { polo: "PASSIVO", qualificacoes: ["Executado", "Avalista"] },
  "executado fiadora": { polo: "PASSIVO", qualificacoes: ["Executado", "Fiador"] },
  embargante: { polo: "ATIVO", qualificacoes: ["Embargante"] },
  inventariante: { polo: "ATIVO", qualificacoes: ["Inventariante"] },
  arrendadora: { polo: "ATIVO", qualificacoes: ["Arrendador"] },
  "depositario judicial": { polo: "TERCEIRO", qualificacoes: ["Depositário"] },
};

/** Qualificações recursais: o polo vem da parte contrária (C2: banco ou INSS é requerido). */
const RECURSAIS: Record<string, string[]> = {
  recorrente: ["Recorrente"],
  "apelante apelado": ["Apelante", "Apelado"],
  apelado: ["Apelado"],
};

const CONTRAPARTE: Record<string, string> = {
  Autor: "Réu", "Réu": "Autor", Requerente: "Requerido", Reclamante: "Reclamado", Exequente: "Executado",
  Executado: "Exequente", Embargante: "Embargado", Recorrente: "Recorrido", Apelante: "Apelado", Apelado: "Apelante",
  Arrendador: "Arrendatário",
};

/**
 * Papel do cliente e da parte contrária. Com o polo do cliente informado, a contraparte fica no
 * polo oposto. Sem ele (ou em recurso), banco/INSS como contraparte é requerido (C2).
 */
export function papeis(
  poloCliente: string | null,
  contraparteEhBancoOuInss: boolean,
): { cliente: PapelNoProcesso; contraparte: PapelNoProcesso; pendencia: string | null } {
  const chave = normalizar(poloCliente ?? "");
  const definido = PAPEL_CLIENTE[chave];
  if (definido) {
    const oposto: Polo = definido.polo === "ATIVO" ? "PASSIVO" : definido.polo === "PASSIVO" ? "ATIVO" : "OUTRO";
    return {
      cliente: definido,
      contraparte: { polo: oposto, qualificacoes: definido.qualificacoes.map((q) => CONTRAPARTE[q]).filter((q): q is string => !!q) },
      pendencia: null,
    };
  }
  const recursal = RECURSAIS[chave] ?? [];
  if (contraparteEhBancoOuInss) {
    return {
      cliente: { polo: "ATIVO", qualificacoes: recursal },
      contraparte: {
        polo: "PASSIVO",
        qualificacoes: recursal.length ? recursal.map((q) => CONTRAPARTE[q]!).filter(Boolean) : ["Requerido"],
      },
      pendencia: recursal.length ? null : "Polo do cliente a confirmar (presumido autor contra banco/INSS)",
    };
  }
  return {
    cliente: { polo: "OUTRO", qualificacoes: recursal },
    contraparte: { polo: "OUTRO", qualificacoes: [] },
    pendencia: `Polo do cliente a confirmar${poloCliente ? ` (planilha: "${poloCliente}")` : ""}`,
  };
}

// ── Juízo, comarca e grau ───────────────────────────────────────────

/** "5ª UPJ Varas Cíveis – Goiânia/GO" → { cidade: "Goiânia", uf: "GO" }. */
export function cidadeDoJuizo(juizo: string | null): { cidade: string; uf: string } | null {
  if (!juizo) return null;
  const achados = [...juizo.matchAll(/([\p{Lu}][\p{L}' ]+?)\/([A-Z]{2})\b/gu)];
  const ultimo = achados.at(-1);
  if (!ultimo) return null;
  return { cidade: ultimo[1]!.trim().replace(/^Comarca de\s+/i, ""), uf: ultimo[2]! };
}

export function grauDoJuizo(juizo: string | null, siglaTribunal: string | null): "PRIMEIRO" | "SEGUNDO" | "RECURSAL" | null {
  if (!juizo) return null;
  const n = normalizar(juizo);
  if (/\bturma recursal\b/.test(n)) return "RECURSAL";
  if (/\bcamara\b/.test(n) || (siglaTribunal && n === normalizar(siglaTribunal))) return "SEGUNDO";
  if (/\b(vara|jec|juizado|upj|jef|central de cumprimento|comarca)\b/.test(n)) return "PRIMEIRO";
  return null;
}

export const precisaConferir = (texto: string | null) => !!texto && /\(conferir/i.test(texto);

// ── Observações ─────────────────────────────────────────────────────

/** Números citados nas observações: completos (20 dígitos) ou parciais ("5062943-75.2026"). */
export function numerosNasObservacoes(obs: string | null): { completos: string[]; parciais: string[] } {
  if (!obs) return { completos: [], parciais: [] };
  const completos = [...obs.matchAll(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g)].map((m) => m[0]);
  const parciais = [...obs.matchAll(/\d{7}-\d{2}\.\d{4}(?!\.\d)/g)].map((m) => m[0]);
  return { completos, parciais };
}

/** "Encerrado – êxito" (planilha) = "Encerrado — êxito" (sistema). */
export const chaveStatus = (s: string) => normalizar(s);

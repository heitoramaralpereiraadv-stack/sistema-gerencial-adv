// Proposta de importação (seção 8.1): o que será gravado, com as separações e mesclagens
// sugeridas e as pendências. Função pura, recalculada a cada decisão da revisão; nada é
// gravado antes da confirmação.

import { z } from "zod";
import { tribunalPorCodigo } from "@/dominio/cnj/tribunais";
import { validarNumeroCnj } from "@/dominio/cnj/numero-cnj";
import type { LinhaProcesso, LinhasPlanilha } from "./planilha";
import {
  chaveEquivalencia,
  chaveStatus,
  cidadeDoJuizo,
  classificarParte,
  ehBanco,
  grauDoJuizo,
  normalizar,
  numerosNasObservacoes,
  papeis,
  precisaConferir,
  sugerirSeparacao,
  type Categoria,
  type Polo,
  type TipoPessoa,
} from "./regras";

// ── Ajustes (arquivo .local.json, fora do repositório) e decisões da revisão ──

const tipoPessoa = z.enum(["PF", "PJ", "ESPOLIO", "ENTE_PUBLICO"]);
const polo = z.enum(["ATIVO", "PASSIVO", "TERCEIRO", "OUTRO"]);

export const esquemaAjustes = z.object({
  clientes: z
    .record(
      z.string(),
      z.object({
        /** Separação de cliente composto (C1); "contraparte" e "mesmo_polo" não são clientes. */
        pessoas: z
          .array(z.object({ nome: z.string().min(2), tipo: tipoPessoa.optional(), papel: z.enum(["cliente", "contraparte", "mesmo_polo"]) }))
          .optional(),
        /** O registro não é uma pessoa (ex.: um caso cadastrado como cliente); os processos usam ajustes próprios. */
        remover: z.boolean().optional(),
        pendencia: z.string().optional(),
      }),
    )
    .default({}),
  processos: z
    .record(
      z.string(),
      z.object({
        /** Substitui as partes deduzidas da planilha. */
        partes: z
          .array(
            z.object({
              cliente: z.string().optional(), // código C… de um cliente da planilha
              nome: z.string().optional(),
              tipo: tipoPessoa.optional(),
              polo,
              qualificacoes: z.array(z.string()).default([]),
              ehCliente: z.boolean(),
            }),
          )
          .optional(),
        pendencia: z.string().optional(),
      }),
    )
    .default({}),
  /** Nomes que não devem ser mesclados com os equivalentes (ex.: empresas distintas do mesmo grupo). */
  naoMesclar: z.array(z.string()).default([]),
});
export type Ajustes = z.infer<typeof esquemaAjustes>;

export interface Decisoes {
  separacoes: Record<string, boolean>;
  /** Nomes corrigidos na revisão para uma separação. */
  partesSeparadas?: Record<string, string[]>;
  mesclagens: Record<string, { aceita: boolean; nome?: string }>;
  responsaveis: Record<string, string>;
  revisadoEm?: string;
}
export const decisoesVazias = (): Decisoes => ({ separacoes: {}, mesclagens: {}, responsaveis: {} });

// ── Resultado ──

export interface PessoaProposta {
  chave: string;
  nome: string;
  tipo: TipoPessoa;
  categoria: Categoria | null;
  ehCliente: boolean;
  situacao: "ATIVO" | "INATIVO" | "PROSPECCAO" | null;
  cidade: string | null;
  uf: string | null;
  responsavel: string | null;
  dataEntrada: string | null;
  codigoLegado: string | null;
  pendencias: string[];
  /** Outros nomes com que aparece na planilha (mesclagem ou apelido). */
  outrosNomes: string[];
}

export interface ParteProposta {
  pessoa: string;
  polo: Polo;
  qualificacoes: string[];
  ehCliente: boolean;
}

export interface ProcessoProposta {
  codigoLegado: string;
  numeroCnj: string | null;
  cnjAno: number | null;
  cnjSegmento: string | null;
  cnjOrigem: string | null;
  tribunalCodigo: string | null;
  grau: "PRIMEIRO" | "SEGUNDO" | "RECURSAL" | null;
  orgaoJulgador: string | null;
  comarca: { nome: string; uf: string; tribunalCodigo: string | null; codigoOrigem: string | null } | null;
  area: string;
  status: string;
  assunto: string | null;
  faseAtual: string | null;
  motivoSuspensao: string | null;
  dataDistribuicao: string | null;
  dataCitacao: string | null;
  valorCausa: string | null;
  responsavel: string | null;
  observacoes: string | null;
  partes: ParteProposta[];
  pendencias: string[];
}

export interface SeparacaoProposta {
  id: string;
  texto: string;
  partes: string[];
  sugerido: boolean;
  separar: boolean;
  processos: string[];
}

export interface MesclagemProposta {
  id: string;
  nomes: { nome: string; processos: string[] }[];
  nomeSugerido: string;
  nomeFinal: string;
  aceita: boolean;
}

export interface Proposta {
  pessoas: PessoaProposta[];
  processos: ProcessoProposta[];
  vinculos: { origem: string; destino: string }[];
  separacoes: SeparacaoProposta[];
  mesclagens: MesclagemProposta[];
  responsaveis: string[];
  /** Impedem a gravação. */
  erros: string[];
  /** Pontos a conferir que não impedem a gravação. */
  alertas: string[];
}

const STATUS_DO_SISTEMA = [
  "A protocolar", "Em andamento", "Em grau de recurso", "Cumprimento de sentença", "Sobrestado", "Suspenso", "Acordo",
  "Encerrado — êxito", "Encerrado — improcedente", "Arquivado",
];
const STATUS_SUSPENSO = new Set(["Sobrestado", "Suspenso"]);
const SITUACAO: Record<string, PessoaProposta["situacao"]> = { ativo: "ATIVO", inativo: "INATIVO", prospeccao: "PROSPECCAO" };
const TIPO_CLIENTE: Record<string, TipoPessoa> = { pf: "PF", pj: "PJ", espolio: "ESPOLIO" };
const MARCA_CONFIRMAR = /^\[confirmar\]\s*/i;
const dataValida = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);

export function montarProposta(linhas: LinhasPlanilha, ajustes: Ajustes, decisoes: Decisoes): Proposta {
  const erros: string[] = [];
  const alertas: string[] = [];
  const pessoas = new Map<string, PessoaProposta>();
  const responsaveis = new Set<string>();

  // ── 1. Clientes ──
  const clientesPorCodigo = new Map<string, { cliente: string[]; contraparte: string[]; mesmoPolo: string[] }>();
  const codigoPorNome = new Map<string, string>();
  for (const c of linhas.clientes) {
    codigoPorNome.set(normalizar(c.nome.replace(MARCA_CONFIRMAR, "")), c.codigo);
    const ajuste = ajustes.clientes[c.codigo];
    const papeisDoCodigo = { cliente: [] as string[], contraparte: [] as string[], mesmoPolo: [] as string[] };
    clientesPorCodigo.set(c.codigo, papeisDoCodigo);
    if (c.responsavel) responsaveis.add(c.responsavel);
    if (ajuste?.remover) continue;

    const confirmar = MARCA_CONFIRMAR.test(c.nome);
    const nomeBase = c.nome.replace(MARCA_CONFIRMAR, "").trim();
    const tipoBase = TIPO_CLIENTE[normalizar(c.tipo ?? "")];
    const pendenciasBase = [
      ...(confirmar ? ["Registro marcado [confirmar] na planilha"] : []),
      ...(ajuste?.pendencia ? [ajuste.pendencia] : []),
      ...(!tipoBase && !ajuste?.pessoas ? [`Tipo de pessoa a conferir (planilha: "${c.tipo ?? "vazio"}")`] : []),
    ];
    const local = c.cidadeUf?.match(/^(?:(.+)\/)?([A-Z]{2})$/);
    const lista = ajuste?.pessoas ?? [{ nome: nomeBase, tipo: undefined, papel: "cliente" as const }];
    if (!ajuste?.pessoas && /\s\/\s|\se\s/.test(nomeBase) && tipoBase !== "PJ") {
      alertas.push(`${c.codigo} "${nomeBase}": confira se é uma pessoa só (nome com "e" ou "/" sem ajuste).`);
    }
    lista.forEach((p, i) => {
      const chave = i === 0 ? c.codigo : `${c.codigo}-${i + 1}`;
      const ehCliente = p.papel === "cliente";
      pessoas.set(chave, {
        chave,
        nome: p.nome,
        tipo: p.tipo ?? tipoBase ?? "PF",
        categoria: null,
        ehCliente,
        situacao: ehCliente ? (SITUACAO[normalizar(c.situacao ?? "")] ?? "ATIVO") : null,
        cidade: ehCliente ? (local?.[1] ?? null) : null,
        uf: ehCliente ? (local?.[2] ?? null) : null,
        responsavel: ehCliente ? c.responsavel : null,
        dataEntrada: ehCliente ? dataValida(c.dataEntrada) : null,
        codigoLegado: chave,
        pendencias: [...pendenciasBase],
        outrosNomes: lista.length > 1 && i === 0 ? [c.nome] : [],
      });
      (p.papel === "cliente" ? papeisDoCodigo.cliente : p.papel === "contraparte" ? papeisDoCodigo.contraparte : papeisDoCodigo.mesmoPolo).push(chave);
    });
  }

  // ── 2. Partes contrárias: separação sugerida (C2) e identidade pelo nome ──
  const separacoes = new Map<string, SeparacaoProposta>();
  const contrapartePorNome = new Map<string, string>();
  const nomesPorPessoa = new Map<string, { nome: string; processos: Set<string> }>();

  function pessoaContraparte(nome: string, tipoPlanilha: string | null, deComposto: boolean, processo: string): string {
    const chaveNome = normalizar(nome);
    let chave = contrapartePorNome.get(chaveNome);
    if (!chave) {
      chave = `contraparte:${chaveNome}`;
      const { tipo, categoria } = classificarParte(nome, tipoPlanilha, deComposto);
      const aIdentificar = /\(([^)]+\s){2,}[^)]*\)/.test(nome);
      pessoas.set(chave, {
        chave, nome, tipo, categoria, ehCliente: false, situacao: null, cidade: null, uf: null, responsavel: null,
        dataEntrada: null, codigoLegado: null, pendencias: aIdentificar ? ["Parte a identificar"] : [], outrosNomes: [],
      });
      contrapartePorNome.set(chaveNome, chave);
      nomesPorPessoa.set(chave, { nome, processos: new Set() });
    }
    nomesPorPessoa.get(chave)!.processos.add(processo);
    return chave;
  }

  /** "— (curatela de X)" e "— (inventário de X)": parte incompleta, a preencher (C3). */
  function parteEspecial(texto: string): { nome: string; tipo: TipoPessoa } | null {
    const m = texto.match(/^[—-]\s*\((.+)\)\s*$/);
    if (!m) return null;
    const interno = m[1]!;
    const inventario = interno.match(/invent[aá]rio de (.+)/i);
    if (inventario) return { nome: `Espólio de ${inventario[1]!.trim()}`, tipo: "ESPOLIO" };
    const curatela = interno.match(/curatela de (.+)/i);
    if (curatela) return { nome: `${curatela[1]!.trim()} (curatelanda — nome a completar)`, tipo: "PF" };
    return { nome: interno, tipo: "PF" };
  }

  // ── 3. Mapa origem do número CNJ → comarca, aprendido da própria planilha (C7) ──
  const comarcaPorOrigem = new Map<string, { cidade: string; uf: string }>();
  for (const l of linhas.processos) {
    const r = l.numero ? validarNumeroCnj(l.numero) : null;
    const cidade = cidadeDoJuizo(l.juizo);
    if (!r?.valido || !cidade || precisaConferir(l.juizo)) continue;
    const chave = `${r.numero.codigoTribunal}.${r.numero.origem}`;
    const anterior = comarcaPorOrigem.get(chave);
    if (!anterior) comarcaPorOrigem.set(chave, cidade);
    else if (normalizar(anterior.cidade) !== normalizar(cidade.cidade)) {
      alertas.push(`Origem ${chave} aparece com duas cidades (${anterior.cidade} e ${cidade.cidade}); usada ${anterior.cidade}.`);
    }
  }
  const comarcaDoNumero = (numero: string | null) => {
    const r = numero ? validarNumeroCnj(numero) : null;
    if (!r?.valido) return null;
    const c = comarcaPorOrigem.get(`${r.numero.codigoTribunal}.${r.numero.origem}`);
    const tribunal = tribunalPorCodigo(r.numero.codigoTribunal);
    return c ? { nome: c.cidade, uf: c.uf, tribunalCodigo: tribunal ? tribunal.codigo : null, codigoOrigem: r.numero.origem } : null;
  };

  // ── 4. Processos ──
  const processos: ProcessoProposta[] = [];
  const numerosDaPlanilha = new Map<string, string>();
  for (const l of linhas.processos) {
    const r = l.numero ? validarNumeroCnj(l.numero) : null;
    if (r?.valido) numerosDaPlanilha.set(r.numero.formatado, l.codigo);
  }
  const vinculos: { origem: string; destino: string }[] = [];

  for (const l of linhas.processos) {
    const pendencias: string[] = [];
    if (l.responsavel) responsaveis.add(l.responsavel);
    const ajuste = ajustes.processos[l.codigo];
    if (ajuste?.pendencia) pendencias.push(ajuste.pendencia);

    // Cliente(s)
    const codigoCliente = codigoPorNome.get(normalizar(l.cliente.replace(MARCA_CONFIRMAR, "")));
    const doCliente = codigoCliente ? clientesPorCodigo.get(codigoCliente)! : null;
    if (MARCA_CONFIRMAR.test(l.cliente)) pendencias.push("Cliente marcado [confirmar] na planilha");
    if (!doCliente) erros.push(`${l.codigo}: cliente "${l.cliente}" não encontrado na aba Clientes.`);

    let partes: ParteProposta[] = [];
    if (ajuste?.partes) {
      for (const a of ajuste.partes) {
        const alvos = a.cliente
          ? (clientesPorCodigo.get(a.cliente)?.cliente ?? [])
          : [pessoaAjustada(a.nome ?? "", a.tipo)];
        if (a.cliente && alvos.length === 0) erros.push(`${l.codigo}: ajuste cita o cliente ${a.cliente}, que não existe.`);
        for (const pessoa of alvos) partes.push({ pessoa, polo: a.polo, qualificacoes: a.qualificacoes, ehCliente: a.ehCliente });
      }
    } else {
      // Partes contrárias do texto, com a separação decidida na revisão.
      const contrapartes: { chave: string; especial: boolean }[] = [];
      const texto = l.parteContraria?.trim() ?? "";
      if (!texto) pendencias.push("Parte contrária não informada");
      else if (MARCA_CONFIRMAR.test(texto)) pendencias.push("Parte contrária a confirmar");
      else {
        const especial = parteEspecial(texto);
        if (especial) {
          const chave = pessoaAjustada(especial.nome, especial.tipo);
          pessoas.get(chave)!.pendencias.push("Parte a completar (C3)");
          pendencias.push("Parte do processo a completar");
          contrapartes.push({ chave, especial: true });
        } else {
          const sugestao = sugerirSeparacao(texto);
          let nomes = [texto];
          if (sugestao) {
            const id = normalizar(texto);
            const separar = decisoes.separacoes[id] ?? sugestao.separar;
            const partes = decisoes.partesSeparadas?.[id]?.filter((x) => x.trim()) ?? sugestao.partes;
            const s = separacoes.get(id) ?? { id, texto, partes, sugerido: sugestao.separar, separar, processos: [] };
            s.processos.push(l.codigo);
            separacoes.set(id, s);
            if (separar && partes.length > 1) nomes = partes;
          }
          for (const nome of nomes) {
            contrapartes.push({ chave: pessoaContraparte(nome, l.tipoParteContraria, nomes.length > 1, l.codigo), especial: false });
          }
        }
      }
      const bancoOuInss = contrapartes.some((c) => {
        const nome = pessoas.get(c.chave)!.nome;
        return ehBanco(nome) || /\binss\b/.test(normalizar(nome));
      });
      const p = papeis(l.poloCliente, bancoOuInss);
      if (p.pendencia) pendencias.push(p.pendencia);
      for (const chave of doCliente?.cliente ?? []) partes.push({ pessoa: chave, ...p.cliente, ehCliente: true });
      for (const chave of doCliente?.mesmoPolo ?? []) partes.push({ pessoa: chave, ...p.cliente, ehCliente: false });
      for (const chave of doCliente?.contraparte ?? []) partes.push({ pessoa: chave, ...p.contraparte, ehCliente: false });
      for (const c of contrapartes) {
        partes.push(c.especial ? { pessoa: c.chave, polo: "OUTRO", qualificacoes: [], ehCliente: false } : { pessoa: c.chave, ...p.contraparte, ehCliente: false });
      }
    }

    // Número, tribunal, comarca e grau (C7)
    const r = l.numero ? validarNumeroCnj(l.numero) : null;
    if (l.numero && !r?.valido) pendencias.push(`Número CNJ inválido na planilha: ${l.numero}`);
    const n = r?.valido ? r.numero : null;
    const comarca = comarcaDoNumero(l.numero);
    if (!n) pendencias.push("Sem número: juízo e comarca a informar");
    else if (!comarca) pendencias.push("Comarca a informar");
    if (precisaConferir(l.juizo)) pendencias.push("Juízo a conferir (planilha: \"conferir\")");

    // Área e status
    const area = l.area?.trim() ?? "";
    if (!area) erros.push(`${l.codigo}: área não informada.`);
    const status = STATUS_DO_SISTEMA.find((s) => chaveStatus(s) === chaveStatus(l.status ?? ""));
    if (!status) erros.push(`${l.codigo}: status "${l.status ?? ""}" não existe no sistema.`);
    let motivoSuspensao: string | null = null;
    if (status && STATUS_SUSPENSO.has(status)) {
      motivoSuspensao = l.faseAtual ?? "A informar";
      if (!l.faseAtual) pendencias.push("Motivo do sobrestamento a informar");
      pendencias.push("Data do sobrestamento a informar");
    }
    if (l.natureza && /repropositura/i.test(l.natureza)) pendencias.push("Repropositura: informar a ação original (C5)");

    // Números nas observações (C4)
    const { completos, parciais } = numerosNasObservacoes(l.observacoes);
    for (const p of parciais) pendencias.push(`Número incompleto nas observações: ${p}`);
    completos.forEach((numero, i) => {
      const rv = validarNumeroCnj(numero);
      if (!rv.valido) return void pendencias.push(`Número inválido nas observações: ${numero}`);
      const existente = numerosDaPlanilha.get(rv.numero.formatado);
      if (existente) return void vinculos.push({ origem: l.codigo, destino: existente });
      const codigo = `${l.codigo}-R${i + 1}`;
      const comarcaRel = comarcaDoNumero(numero);
      processos.push({
        codigoLegado: codigo,
        numeroCnj: rv.numero.formatado,
        cnjAno: rv.numero.ano,
        cnjSegmento: rv.numero.segmento,
        cnjOrigem: rv.numero.origem,
        tribunalCodigo: rv.numero.tribunal?.codigo ?? null,
        grau: null,
        orgaoJulgador: null,
        comarca: comarcaRel,
        area,
        status: "Em andamento",
        assunto: null,
        faseAtual: null,
        motivoSuspensao: null,
        dataDistribuicao: null,
        dataCitacao: null,
        valorCausa: null,
        responsavel: l.responsavel,
        observacoes: `Processo relacionado citado nas observações de ${l.codigo} na planilha.`,
        partes: (doCliente?.cliente ?? []).map((pessoa) => ({ pessoa, polo: "OUTRO" as const, qualificacoes: [], ehCliente: true })),
        pendencias: [`Relacionado a ${l.codigo}: conferir área, status, partes e juízo (C4)`],
      });
      vinculos.push({ origem: l.codigo, destino: codigo });
    });

    processos.push({
      codigoLegado: l.codigo,
      numeroCnj: n?.formatado ?? null,
      cnjAno: n?.ano ?? null,
      cnjSegmento: n?.segmento ?? null,
      cnjOrigem: n?.origem ?? null,
      tribunalCodigo: n?.tribunal?.codigo ?? null,
      grau: grauDoJuizo(l.juizo, n?.tribunal?.sigla ?? null),
      orgaoJulgador: l.juizo,
      comarca,
      area,
      status: status ?? "",
      assunto: l.natureza,
      faseAtual: l.faseAtual,
      motivoSuspensao,
      dataDistribuicao: dataValida(l.dataDistribuicao),
      dataCitacao: dataValida(l.dataCitacao),
      valorCausa: l.valorCausa,
      responsavel: l.responsavel,
      observacoes: l.observacoes,
      partes: semRepetidas(partes),
      pendencias,
    });
  }

  function pessoaAjustada(nome: string, tipo: TipoPessoa | undefined): string {
    const chave = `ajuste:${normalizar(nome)}`;
    if (!pessoas.has(chave)) {
      const c = classificarParte(nome, null, false);
      pessoas.set(chave, {
        chave, nome, tipo: tipo ?? c.tipo, categoria: (tipo ?? c.tipo) === "PJ" ? c.categoria : null, ehCliente: false,
        situacao: null, cidade: null, uf: null, responsavel: null, dataEntrada: null, codigoLegado: null, pendencias: [], outrosNomes: [],
      });
    }
    return chave;
  }

  // ── 5. Mesclagem de nomes equivalentes (revisão manual antes de gravar) ──
  const grupos = new Map<string, string[]>();
  for (const chave of nomesPorPessoa.keys()) {
    const g = chaveEquivalencia(pessoas.get(chave)!.nome);
    grupos.set(g, [...(grupos.get(g) ?? []), chave]);
  }
  const mesclagens: MesclagemProposta[] = [];
  const destino = new Map<string, string>();
  for (const [id, chaves] of grupos) {
    if (chaves.length < 2) continue;
    const nomes = chaves.map((c) => ({ nome: nomesPorPessoa.get(c)!.nome, processos: [...nomesPorPessoa.get(c)!.processos] }));
    const nomeSugerido = sugerirNome(nomes);
    const decisao = decisoes.mesclagens[id];
    const vetada = nomes.some((n) => ajustes.naoMesclar.some((x) => normalizar(x) === normalizar(n.nome)));
    const aceita = decisao?.aceita ?? !vetada;
    const nomeFinal = decisao?.nome?.trim() || nomeSugerido;
    mesclagens.push({ id, nomes, nomeSugerido, nomeFinal, aceita });
    if (!aceita) continue;
    const [principal, ...outras] = chaves;
    const p = pessoas.get(principal!)!;
    p.outrosNomes = [...new Set([p.nome, ...outras.map((o) => pessoas.get(o)!.nome)].filter((x) => x !== nomeFinal))];
    p.nome = nomeFinal;
    for (const o of outras) {
      destino.set(o, principal!);
      pessoas.delete(o);
    }
  }
  for (const proc of processos) {
    proc.partes = semRepetidas(proc.partes.map((pa) => ({ ...pa, pessoa: destino.get(pa.pessoa) ?? pa.pessoa })));
  }

  // ── 6. Responsáveis (nomes da planilha → usuários do sistema) ──
  for (const nome of responsaveis) {
    if (!decisoes.responsaveis[nome]) erros.push(`Escolha o usuário que corresponde ao responsável "${nome}" da planilha.`);
  }
  if (!decisoes.revisadoEm) erros.push("Revise as separações e mesclagens e salve a revisão antes de gravar.");

  // Pessoas que não aparecem em nenhum processo não precisam ser gravadas, exceto clientes.
  const usadas = new Set(processos.flatMap((p) => p.partes.map((pa) => pa.pessoa)));
  const pessoasFinais = [...pessoas.values()].filter((p) => p.ehCliente || usadas.has(p.chave));

  return {
    pessoas: pessoasFinais,
    processos,
    vinculos,
    separacoes: [...separacoes.values()],
    mesclagens: mesclagens.sort((a, b) => a.nomeFinal.localeCompare(b.nomeFinal, "pt-BR")),
    responsaveis: [...responsaveis],
    erros,
    alertas,
  };
}

function semRepetidas(partes: ParteProposta[]): ParteProposta[] {
  const vistas = new Map<string, ParteProposta>();
  for (const p of partes) {
    const chave = `${p.pessoa}|${p.polo}`;
    const atual = vistas.get(chave);
    if (atual) {
      atual.qualificacoes = [...new Set([...atual.qualificacoes, ...p.qualificacoes])];
      atual.ehCliente ||= p.ehCliente;
    } else vistas.set(chave, { ...p, qualificacoes: [...p.qualificacoes] });
  }
  return [...vistas.values()];
}

/** Nome mais completo: o que tem "S.A." ou, na falta, o mais citado e mais longo. */
function sugerirNome(nomes: { nome: string; processos: string[] }[]): string {
  const ordenados = [...nomes].sort(
    (a, b) =>
      Number(/s\.?\s?a\.?$|s\/a$/i.test(b.nome)) - Number(/s\.?\s?a\.?$|s\/a$/i.test(a.nome)) ||
      b.processos.length - a.processos.length ||
      b.nome.length - a.nome.length,
  );
  return ordenados[0]!.nome;
}

/** Totais da planilha (aba Relatório) e da proposta, para a conciliação do painel (A2). */
export function conciliacao(linhas: LinhasPlanilha, proposta: Proposta) {
  const originais = proposta.processos.filter((p) => !p.codigoLegado.includes("-R"));
  const contar = <T,>(lista: T[], chave: (x: T) => string) =>
    lista.reduce<Record<string, number>>((acc, x) => ((acc[chave(x)] = (acc[chave(x)] ?? 0) + 1), acc), {});
  const normalizarStatus = (s: string | null) => STATUS_DO_SISTEMA.find((x) => chaveStatus(x) === chaveStatus(s ?? "")) ?? s ?? "";
  return {
    planilha: {
      processos: linhas.processos.length,
      semNumero: linhas.processos.filter((p) => !p.numero).length,
      clientes: linhas.clientes.length,
      porStatus: contar(linhas.processos, (p: LinhaProcesso) => normalizarStatus(p.status)),
      porArea: contar(linhas.processos, (p: LinhaProcesso) => p.area ?? ""),
    },
    sistema: {
      processos: originais.length,
      semNumero: originais.filter((p) => !p.numeroCnj).length,
      clientes: proposta.pessoas.filter((p) => p.ehCliente).length,
      porStatus: contar(originais, (p) => p.status),
      porArea: contar(originais, (p) => p.area),
      relacionados: proposta.processos.length - originais.length,
    },
  };
}

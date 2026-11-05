// Consultas dos relatórios da seção 6. Todas respeitam a visibilidade do usuário (segredo de
// justiça, "só os seus") e os filtros de responsável, área e status; o período vale para os
// relatórios com data própria (prazos, movimentação, resultados).

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { formatarData } from "@/dominio/prazos/data-civil";
import { hoje, paraDataCivil, paraDate } from "@/lib/hoje";
import { POLO, SITUACAO_PRAZO, TIPO_PESSOA, rotulo } from "@/lib/rotulos";
import type { UsuarioAtual } from "../auth/usuario";
import { mascarar } from "../cripto/cifra";
import { prisma } from "../db/prisma";
import { filtroProcessosVisiveis } from "../permissoes/visibilidade";
import { obterAgenda } from "../servicos/agenda";
import { obterFichaCliente } from "../servicos/pessoas";
import { buscarProcessos, type FiltrosProcessos } from "../servicos/processos";
import type { Filtros, Tabela } from "./tipos";

const RESULTADO = { EXITO: "Êxito", IMPROCEDENTE: "Improcedência", ACORDO: "Acordo" } as const;
const data = (d: Date | null) => (d ? formatarData(paraDataCivil(d)) : "");
const qs = (p: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => !!e[1])).toString();

function baseProcessos(usuario: UsuarioAtual, f: Filtros): Prisma.ProcessoWhereInput {
  return {
    excluidoEm: null,
    AND: [filtroProcessosVisiveis(usuario)],
    ...(f.responsavelId && { responsavelId: f.responsavelId }),
    ...(f.areaId && { areaId: f.areaId }),
    ...(f.statusId && { statusId: f.statusId }),
  };
}
const noPeriodo = (f: Filtros) => ({ gte: paraDate(f.inicio), lte: paraDate(f.fim) });
const filtrosLista = (f: Filtros) => ({ responsavelId: f.responsavelId, areaId: f.areaId, statusId: f.statusId });

const PARTES_RESUMO = { where: { ehClienteDoEscritorio: false }, select: { pessoa: { select: { nome: true } } } } as const;
const CLIENTES_RESUMO = { where: { ehClienteDoEscritorio: true }, select: { pessoa: { select: { nome: true } } } } as const;

// ── Indicadores gerais (painel) ─────────────────────────────────────

export async function indicadores(usuario: UsuarioAtual, f: Filtros, cliente: PrismaClient = prisma()) {
  const base = baseProcessos(usuario, f);
  const [clientesCadastrados, clientesAtivos, processos, ativos, semNumero, vencidos, agenda, incompletos] = await Promise.all([
    cliente.pessoa.count({ where: { ehCliente: true, excluidoEm: null } }),
    cliente.pessoa.count({ where: { ehCliente: true, excluidoEm: null, situacao: "ATIVO" } }),
    cliente.processo.count({ where: base }),
    cliente.processo.count({ where: { ...base, status: { comportamento: { not: "ENCERRADO_EXIGE_DATA" } } } }),
    cliente.processo.count({ where: { ...base, numeroCnj: null } }),
    cliente.prazo.count({
      where: {
        situacao: "ABERTO", excluidoEm: null, dataFinalEfetiva: { lt: paraDate(hoje()) }, processo: base,
        ...(f.responsavelId && { responsavelId: f.responsavelId }),
      },
    }),
    obterAgenda(usuario, f.responsavelId ?? "todos", hoje(), cliente),
    cadastrosIncompletos(usuario, f, cliente),
  ]);
  const proximos = agenda.deHoje.length + agenda.proximos.length;
  const filtros = filtrosLista(f);
  const tabela: Tabela = {
    titulo: "Indicadores gerais",
    colunas: [{ chave: "indicador", titulo: "Indicador", largura: 3 }, { chave: "valor", titulo: "Quantidade", numero: true }],
    linhas: [
      { indicador: "Clientes cadastrados", valor: clientesCadastrados },
      { indicador: "Clientes ativos", valor: clientesAtivos },
      { indicador: "Processos cadastrados", valor: processos },
      { indicador: "Processos ativos (exceto encerrados e arquivados)", valor: ativos },
      { indicador: "Prazos vencidos", valor: vencidos },
      { indicador: "Prazos de hoje e dos próximos 7 dias úteis", valor: proximos },
      { indicador: "Cadastros incompletos", valor: incompletos.linhas.length },
      { indicador: "Processos sem número", valor: semNumero },
    ],
    links: [
      "/clientes",
      "/clientes",
      `/processos?${qs(filtros)}`,
      `/processos?${qs({ ...filtros, situacao: "ativos" })}`,
      `/?${qs({ responsavel: f.responsavelId ?? "todos" })}`,
      `/?${qs({ responsavel: f.responsavelId ?? "todos" })}`,
      "/relatorios/cadastros-incompletos",
      `/processos?${qs({ ...filtros, semNumero: "1" })}`,
    ],
  };
  return { tabela, valores: { clientesCadastrados, clientesAtivos, processos, ativos, vencidos, proximos, incompletos: incompletos.linhas.length, semNumero } };
}

// ── Carteiras ───────────────────────────────────────────────────────

export async function carteiraPorStatus(usuario: UsuarioAtual, f: Filtros, cliente: PrismaClient = prisma()): Promise<Tabela> {
  const [status, contagem] = await Promise.all([
    cliente.statusProcesso.findMany({ orderBy: { ordem: "asc" } }),
    cliente.processo.groupBy({ by: ["statusId"], where: baseProcessos(usuario, f), _count: { _all: true } }),
  ]);
  const n = new Map(contagem.map((c) => [c.statusId, c._count._all]));
  const visiveis = status.filter((s) => s.ativo || n.has(s.id));
  return {
    titulo: "Carteira por status",
    colunas: [{ chave: "status", titulo: "Status", largura: 3 }, { chave: "processos", titulo: "Processos", numero: true }],
    linhas: visiveis.map((s) => ({ status: s.nome, processos: n.get(s.id) ?? 0 })),
    links: visiveis.map((s) => `/processos?${qs({ ...filtrosLista(f), statusId: s.id })}`),
  };
}

export async function carteiraPorArea(usuario: UsuarioAtual, f: Filtros, cliente: PrismaClient = prisma()): Promise<Tabela> {
  const [areas, contagem] = await Promise.all([
    cliente.itemLista.findMany({ where: { lista: "AREA" }, orderBy: [{ ordem: "asc" }, { valor: "asc" }] }),
    cliente.processo.groupBy({ by: ["areaId"], where: baseProcessos(usuario, f), _count: { _all: true } }),
  ]);
  const n = new Map(contagem.map((c) => [c.areaId, c._count._all]));
  const visiveis = areas.filter((a) => a.ativo || n.has(a.id));
  return {
    titulo: "Carteira por área",
    colunas: [{ chave: "area", titulo: "Área", largura: 3 }, { chave: "processos", titulo: "Processos", numero: true }],
    linhas: visiveis.map((a) => ({ area: a.valor, processos: n.get(a.id) ?? 0 })),
    links: visiveis.map((a) => `/processos?${qs({ ...filtrosLista(f), areaId: a.id })}`),
  };
}

export async function carteiraPorParteContraria(usuario: UsuarioAtual, f: Filtros, cliente: PrismaClient = prisma()): Promise<Tabela> {
  const contagem = await cliente.parteProcesso.groupBy({
    by: ["pessoaId"],
    where: { ehClienteDoEscritorio: false, processo: baseProcessos(usuario, f) },
    _count: { _all: true },
  });
  const pessoas = await cliente.pessoa.findMany({ where: { id: { in: contagem.map((c) => c.pessoaId) } }, include: { categoria: true } });
  const porId = new Map(pessoas.map((p) => [p.id, p]));
  const linhas = contagem
    .map((c) => {
      const p = porId.get(c.pessoaId)!;
      return { id: p.id, parte: p.nome, categoria: p.categoria?.valor ?? rotulo(TIPO_PESSOA, p.tipo), processos: c._count._all };
    })
    .sort((a, b) => b.processos - a.processos || a.parte.localeCompare(b.parte, "pt-BR"));
  const porCategoria = new Map<string, number>();
  for (const l of linhas) porCategoria.set(l.categoria, (porCategoria.get(l.categoria) ?? 0) + l.processos);
  return {
    titulo: "Carteira por parte contrária",
    resumo: [...porCategoria].sort((a, b) => b[1] - a[1]).map(([rotuloCategoria, valor]) => ({ rotulo: rotuloCategoria, valor })),
    colunas: [
      { chave: "parte", titulo: "Parte contrária", largura: 3 },
      { chave: "categoria", titulo: "Categoria", largura: 2 },
      { chave: "processos", titulo: "Processos", numero: true },
    ],
    linhas: linhas.map(({ id: _id, ...l }) => l),
    links: linhas.map((l) => `/processos?${qs({ ...filtrosLista(f), parteId: l.id })}`),
    observacao: "Um processo com duas partes contrárias conta para ambas.",
  };
}

export async function carteiraPorTribunalComarca(usuario: UsuarioAtual, f: Filtros, cliente: PrismaClient = prisma()): Promise<Tabela> {
  const contagem = await cliente.processo.groupBy({
    by: ["tribunalCodigo", "comarcaId"],
    where: baseProcessos(usuario, f),
    _count: { _all: true },
  });
  const [tribunais, comarcas] = await Promise.all([cliente.tribunal.findMany(), cliente.comarca.findMany()]);
  const t = new Map(tribunais.map((x) => [x.codigo, x.sigla]));
  const c = new Map(comarcas.map((x) => [x.id, `${x.nome}/${x.uf}`]));
  const linhas = contagem
    .map((x) => ({
      tribunalCodigo: x.tribunalCodigo,
      comarcaId: x.comarcaId,
      tribunal: (x.tribunalCodigo && t.get(x.tribunalCodigo)) ?? "Não informado",
      comarca: (x.comarcaId && c.get(x.comarcaId)) ?? "Não informada",
      processos: x._count._all,
    }))
    .sort((a, b) => a.tribunal.localeCompare(b.tribunal) || b.processos - a.processos);
  return {
    titulo: "Carteira por tribunal e comarca",
    colunas: [
      { chave: "tribunal", titulo: "Tribunal" },
      { chave: "comarca", titulo: "Comarca", largura: 2 },
      { chave: "processos", titulo: "Processos", numero: true },
    ],
    linhas: linhas.map((l) => ({ tribunal: l.tribunal, comarca: l.comarca, processos: l.processos })),
    links: linhas.map((l) =>
      `/processos?${qs({ ...filtrosLista(f), tribunalCodigo: l.tribunalCodigo ?? undefined, comarcaId: l.comarcaId ?? undefined, semComarca: l.comarcaId ? undefined : "1" })}`,
    ),
  };
}

// ── Prazos do período ───────────────────────────────────────────────

export async function prazosDoPeriodo(usuario: UsuarioAtual, f: Filtros, cliente: PrismaClient = prisma()): Promise<Tabela> {
  const prazos = await cliente.prazo.findMany({
    where: {
      excluidoEm: null,
      dataFinalEfetiva: noPeriodo(f),
      processo: { ...baseProcessos(usuario, { ...f, responsavelId: undefined }) },
      ...(f.responsavelId && { responsavelId: f.responsavelId }),
    },
    include: { responsavel: { select: { nome: true } }, processo: { select: { id: true, numeroCnj: true, partes: CLIENTES_RESUMO } } },
    orderBy: [{ responsavel: { nome: "asc" } }, { dataFinalEfetiva: "asc" }],
  });
  const h = hoje();
  const situacao = (p: (typeof prazos)[number]) =>
    p.situacao === "ABERTO" && paraDataCivil(p.dataFinalEfetiva) < h ? "Aberto — vencido" : rotulo(SITUACAO_PRAZO, p.situacao);
  const porResponsavel = new Map<string, Record<string, number>>();
  for (const p of prazos) {
    const r = porResponsavel.get(p.responsavel.nome) ?? { ABERTO: 0, CUMPRIDO: 0, PERDIDO: 0, CANCELADO: 0 };
    r[p.situacao] = (r[p.situacao] ?? 0) + 1;
    porResponsavel.set(p.responsavel.nome, r);
  }
  return {
    titulo: "Prazos do período",
    resumo: [...porResponsavel].map(([nome, r]) => ({
      rotulo: nome,
      valor: `${r.ABERTO} aberto(s), ${r.CUMPRIDO} cumprido(s), ${r.PERDIDO} perdido(s)${r.CANCELADO ? `, ${r.CANCELADO} cancelado(s)` : ""}`,
    })),
    colunas: [
      { chave: "responsavel", titulo: "Responsável", largura: 1.5 },
      { chave: "vencimento", titulo: "Vencimento" },
      { chave: "situacao", titulo: "Situação" },
      { chave: "descricao", titulo: "Prazo", largura: 2.5 },
      { chave: "processo", titulo: "Processo", largura: 2 },
      { chave: "cliente", titulo: "Cliente", largura: 2 },
      { chave: "cumpridoEm", titulo: "Cumprido em" },
    ],
    linhas: prazos.map((p) => ({
      responsavel: p.responsavel.nome,
      vencimento: data(p.dataFinalEfetiva),
      situacao: situacao(p),
      descricao: p.descricao,
      processo: p.processo.numeroCnj ?? "sem número",
      cliente: p.processo.partes.map((x) => x.pessoa.nome).join(", "),
      cumpridoEm: data(p.cumpridoEm),
    })),
    links: prazos.map((p) => `/processos/${p.processo.id}`),
    observacao: "Prazos com vencimento (data efetiva) no período.",
  };
}

// ── Movimentação mensal ─────────────────────────────────────────────

export async function movimentacaoMensal(usuario: UsuarioAtual, f: Filtros, cliente: PrismaClient = prisma()): Promise<Tabela> {
  const base = baseProcessos(usuario, f);
  const periodo = noPeriodo(f);
  const [distribuidos, encerrados, resultados, sentencas] = await Promise.all([
    cliente.processo.findMany({ where: { ...base, dataDistribuicao: periodo }, select: { dataDistribuicao: true } }),
    cliente.processo.findMany({ where: { ...base, dataEncerramento: periodo }, select: { dataEncerramento: true } }),
    // A4: homologação do acordo conta como sentença.
    cliente.processo.findMany({ where: { ...base, dataResultado: periodo }, select: { id: true, dataResultado: true } }),
    cliente.andamento.findMany({
      where: { excluidoEm: null, data: periodo, tipo: { valor: "Sentença" }, processo: base },
      select: { processoId: true, data: true },
    }),
  ]);
  const mes = (d: Date) => paraDataCivil(d).slice(0, 7);
  const meses: string[] = [];
  for (let m = f.inicio.slice(0, 7); m <= f.fim.slice(0, 7); ) {
    meses.push(m);
    const [a, mm] = m.split("-").map(Number) as [number, number];
    m = mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, "0")}`;
  }
  const contar = (datas: (Date | null)[]) => {
    const r = new Map<string, number>();
    for (const d of datas) if (d) r.set(mes(d), (r.get(mes(d)) ?? 0) + 1);
    return r;
  };
  const comSentenca = new Map<string, Set<string>>();
  for (const s of [...sentencas.map((x) => ({ id: x.processoId, d: x.data })), ...resultados.map((x) => ({ id: x.id, d: x.dataResultado! }))]) {
    const m = mes(s.d);
    comSentenca.set(m, (comSentenca.get(m) ?? new Set()).add(s.id));
  }
  const dist = contar(distribuidos.map((x) => x.dataDistribuicao));
  const enc = contar(encerrados.map((x) => x.dataEncerramento));
  const nomeMes = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return {
    titulo: "Movimentação mensal",
    colunas: [
      { chave: "mes", titulo: "Mês", largura: 2 },
      { chave: "distribuidos", titulo: "Distribuídos", numero: true },
      { chave: "encerrados", titulo: "Encerrados", numero: true },
      { chave: "sentencas", titulo: "Com sentença", numero: true },
    ],
    linhas: meses.map((m) => ({ mes: nomeMes(m), distribuidos: dist.get(m) ?? 0, encerrados: enc.get(m) ?? 0, sentencas: comSentenca.get(m)?.size ?? 0 })),
    observacao:
      "Distribuídos pela data de distribuição; encerrados pela data de encerramento; com sentença = andamento do tipo Sentença ou data de sentença/homologação no mês (acordo homologado conta como sentença).",
  };
}

// ── Resultados ──────────────────────────────────────────────────────

export async function resultados(usuario: UsuarioAtual, f: Filtros, cliente: PrismaClient = prisma()): Promise<Tabela> {
  const periodo = noPeriodo(f);
  const processos = await cliente.processo.findMany({
    where: {
      ...baseProcessos(usuario, f),
      resultado: { not: null },
      OR: [{ dataResultado: periodo }, { dataResultado: null, dataEncerramento: periodo }],
    },
    include: { area: true, responsavel: { select: { nome: true } }, partes: PARTES_RESUMO },
    orderBy: [{ resultado: "asc" }, { dataResultado: "asc" }],
  });
  const contar = (chave: (p: (typeof processos)[number]) => string) => {
    const r = new Map<string, number>();
    for (const p of processos) r.set(chave(p), (r.get(chave(p)) ?? 0) + 1);
    return [...r].sort((a, b) => b[1] - a[1]);
  };
  return {
    titulo: "Resultados",
    resumo: [
      ...contar((p) => RESULTADO[p.resultado!]).map(([r, n]) => ({ rotulo: r, valor: n })),
      ...contar((p) => `${RESULTADO[p.resultado!]} · ${p.area.valor}`).map(([r, n]) => ({ rotulo: r, valor: n })),
    ],
    colunas: [
      { chave: "resultado", titulo: "Resultado" },
      { chave: "data", titulo: "Data" },
      { chave: "processo", titulo: "Processo", largura: 2 },
      { chave: "area", titulo: "Área", largura: 1.5 },
      { chave: "contraria", titulo: "Parte contrária", largura: 2.5 },
      { chave: "responsavel", titulo: "Responsável", largura: 1.5 },
    ],
    linhas: processos.map((p) => ({
      resultado: RESULTADO[p.resultado!],
      data: data(p.dataResultado ?? p.dataEncerramento),
      processo: p.numeroCnj ?? "sem número",
      area: p.area.valor,
      contraria: p.partes.map((x) => x.pessoa.nome).join(", "),
      responsavel: p.responsavel.nome,
    })),
    links: processos.map((p) => `/processos/${p.id}`),
    observacao: "Pela data da sentença/homologação ou, na falta, pela data de encerramento.",
  };
}

// ── Sobrestados ─────────────────────────────────────────────────────

export async function sobrestados(usuario: UsuarioAtual, f: Filtros, cliente: PrismaClient = prisma()): Promise<Tabela> {
  const processos = await cliente.processo.findMany({
    where: { ...baseProcessos(usuario, f), status: { comportamento: "SUSPENSO_EXIGE_MOTIVO" } },
    include: { status: true, area: true, responsavel: { select: { nome: true } }, partes: CLIENTES_RESUMO },
    orderBy: [{ motivoSuspensao: "asc" }, { dataSuspensao: "asc" }],
  });
  const porMotivo = new Map<string, number>();
  for (const p of processos) porMotivo.set(p.motivoSuspensao ?? "—", (porMotivo.get(p.motivoSuspensao ?? "—") ?? 0) + 1);
  return {
    titulo: "Processos sobrestados ou suspensos",
    resumo: [...porMotivo].map(([motivo, n]) => ({ rotulo: motivo, valor: n })),
    colunas: [
      { chave: "processo", titulo: "Processo", largura: 2 },
      { chave: "cliente", titulo: "Cliente", largura: 2 },
      { chave: "status", titulo: "Status" },
      { chave: "motivo", titulo: "Motivo", largura: 2 },
      { chave: "desde", titulo: "Desde" },
      { chave: "area", titulo: "Área", largura: 1.5 },
      { chave: "responsavel", titulo: "Responsável" },
    ],
    linhas: processos.map((p) => ({
      processo: p.numeroCnj ?? "sem número",
      cliente: p.partes.map((x) => x.pessoa.nome).join(", "),
      status: p.status.nome,
      motivo: p.motivoSuspensao,
      desde: data(p.dataSuspensao) || "a informar",
      area: p.area.valor,
      responsavel: p.responsavel.nome,
    })),
    links: processos.map((p) => `/processos/${p.id}`),
  };
}

// ── Cadastros incompletos ───────────────────────────────────────────

export async function cadastrosIncompletos(usuario: UsuarioAtual, f: Filtros, cliente: PrismaClient = prisma()): Promise<Tabela> {
  const [clientes, processos] = await Promise.all([
    cliente.pessoa.findMany({
      where: { ehCliente: true, excluidoEm: null, OR: [{ cpfCnpjHash: null }, { contatos: { none: {} } }, { cadastroIncompleto: true }] },
      select: { id: true, nome: true, cpfCnpjHash: true, pendencias: true, _count: { select: { contatos: true } } },
      orderBy: { nome: "asc" },
    }),
    cliente.processo.findMany({
      where: {
        ...baseProcessos(usuario, f),
        OR: [{ numeroCnj: null }, { orgaoJulgador: null }, { comarcaId: null }, { dataDistribuicao: null }, { cadastroIncompleto: true }],
      },
      select: { id: true, numeroCnj: true, codigoLegado: true, orgaoJulgador: true, comarcaId: true, dataDistribuicao: true, pendencias: true, partes: CLIENTES_RESUMO },
      orderBy: { codigoLegado: "asc" },
    }),
  ]);
  const linhasClientes = clientes.map((c) => ({
    tipo: "Cliente",
    identificacao: c.nome,
    falta: [!c.cpfCnpjHash && "CPF/CNPJ", c._count.contatos === 0 && "contato"].filter(Boolean).join(", "),
    pendencias: c.pendencias,
  }));
  const linhasProcessos = processos.map((p) => ({
    tipo: "Processo",
    identificacao: `${p.numeroCnj ?? "sem número"}${p.codigoLegado ? ` (${p.codigoLegado})` : ""} — ${p.partes.map((x) => x.pessoa.nome).join(", ")}`,
    falta: [!p.numeroCnj && "número", !p.orgaoJulgador && "juízo", !p.comarcaId && "comarca", !p.dataDistribuicao && "data de distribuição"]
      .filter(Boolean)
      .join(", "),
    pendencias: p.pendencias,
  }));
  return {
    titulo: "Cadastros incompletos",
    resumo: [
      { rotulo: "Clientes", valor: linhasClientes.length },
      { rotulo: "Processos", valor: linhasProcessos.length },
    ],
    colunas: [
      { chave: "tipo", titulo: "Tipo" },
      { chave: "identificacao", titulo: "Cadastro", largura: 3.5 },
      { chave: "falta", titulo: "Falta", largura: 2 },
      { chave: "pendencias", titulo: "Pendências registradas", largura: 3.5 },
    ],
    linhas: [...linhasClientes, ...linhasProcessos],
    links: [...clientes.map((c) => `/clientes/${c.id}`), ...processos.map((p) => `/processos/${p.id}`)],
    observacao: "Clientes sem CPF/CNPJ ou contato; processos sem número, juízo, comarca ou data de distribuição; e os marcados como incompletos.",
  };
}

// ── Lista de processos (seção 5: exportar lista filtrada) ───────────

export async function listaDeProcessos(usuario: UsuarioAtual, filtros: FiltrosProcessos, cliente: PrismaClient = prisma()): Promise<Tabela> {
  const processos = await buscarProcessos(usuario, filtros, cliente, 5000);
  return {
    titulo: "Processos",
    colunas: [
      { chave: "numero", titulo: "Número", largura: 2 },
      { chave: "clientes", titulo: "Cliente(s)", largura: 2.5 },
      { chave: "contrarias", titulo: "Parte(s) contrária(s)", largura: 2.5 },
      { chave: "area", titulo: "Área", largura: 1.5 },
      { chave: "status", titulo: "Status", largura: 1.5 },
      { chave: "tribunal", titulo: "Tribunal" },
      { chave: "comarca", titulo: "Comarca", largura: 1.5 },
      { chave: "responsavel", titulo: "Responsável", largura: 1.5 },
    ],
    linhas: processos.map((p) => ({
      numero: p.numeroCnj ?? "sem número",
      clientes: p.partes.filter((x) => x.ehClienteDoEscritorio).map((x) => x.pessoa.nome).join(", "),
      contrarias: p.partes.filter((x) => !x.ehClienteDoEscritorio).map((x) => x.pessoa.nome).join(", "),
      area: p.area.valor,
      status: p.status.nome,
      tribunal: p.tribunal?.sigla ?? "",
      comarca: p.comarca ? `${p.comarca.nome}/${p.comarca.uf}` : "",
      responsavel: p.responsavel.nome,
    })),
    links: processos.map((p) => `/processos/${p.id}`),
  };
}

// ── Ficha do cliente (envio ao cliente) ─────────────────────────────

/** Sem dados reservados; CPF mascarado. O acesso fica registrado (seção 7). */
export async function fichaDoCliente(usuario: UsuarioAtual, pessoaId: string, cliente: PrismaClient = prisma()): Promise<Tabela> {
  const c = await obterFichaCliente(usuario, pessoaId, cliente);
  const ultimos = await cliente.andamento.findMany({
    where: { excluidoEm: null, processoId: { in: c.participacoes.map((p) => p.processo.id) } },
    orderBy: [{ data: "desc" }, { criadoEm: "desc" }],
    distinct: ["processoId"],
  });
  const ultimo = new Map(ultimos.map((a) => [a.processoId, a]));
  const resumir = (t: string) => (t.length > 300 ? `${t.slice(0, 297)}…` : t);
  return {
    titulo: `Ficha do cliente — ${c.nome}`,
    resumo: [
      { rotulo: "Cliente", valor: c.nome },
      { rotulo: "CPF/CNPJ", valor: c.cpfCnpj ? mascarar(c.cpfCnpj) : "não informado" },
      { rotulo: "Contatos", valor: c.contatos.map((x) => x.valor).join(" · ") || "não informado" },
      { rotulo: "Processos", valor: c.participacoes.length },
    ],
    colunas: [
      { chave: "processo", titulo: "Processo", largura: 2 },
      { chave: "papel", titulo: "Posição", largura: 1.3 },
      { chave: "contraria", titulo: "Parte contrária", largura: 2 },
      { chave: "status", titulo: "Status", largura: 1.3 },
      { chave: "andamento", titulo: "Último andamento", largura: 4 },
    ],
    linhas: c.participacoes.map(({ processo: p, polo, qualificacoes }) => {
      const a = ultimo.get(p.id);
      return {
        processo: p.numeroCnj ?? "sem número",
        papel: qualificacoes.map((q) => q.valor).join(", ") || rotulo(POLO, polo),
        contraria: p.partes.map((x) => x.pessoa.nome).join(", "),
        status: p.status.nome,
        andamento: a ? `${data(a.data)} — ${resumir(a.descricao)}` : "Sem andamento registrado",
      };
    }),
    links: c.participacoes.map(({ processo: p }) => `/processos/${p.id}`),
  };
}

// ── Catálogo ────────────────────────────────────────────────────────

export const RELATORIOS = {
  indicadores: { titulo: "Indicadores gerais", descricao: "Clientes e processos ativos, prazos vencidos e próximos, cadastros incompletos, processos sem número.", periodo: false, gerar: async (u: UsuarioAtual, f: Filtros, c?: PrismaClient) => (await indicadores(u, f, c)).tabela },
  status: { titulo: "Carteira por status", descricao: "Contagem por status, com a lista ao clicar.", periodo: false, gerar: carteiraPorStatus },
  area: { titulo: "Carteira por área", descricao: "Contagem por área.", periodo: false, gerar: carteiraPorArea },
  "parte-contraria": { titulo: "Carteira por parte contrária", descricao: "Por instituição ou pessoa, com a categoria (instituição financeira, seguradora, ente público).", periodo: false, gerar: carteiraPorParteContraria },
  "tribunal-comarca": { titulo: "Carteira por tribunal e comarca", descricao: "Para planejar deslocamentos e correspondentes.", periodo: false, gerar: carteiraPorTribunalComarca },
  prazos: { titulo: "Prazos do período", descricao: "Por responsável: abertos, cumpridos e perdidos.", periodo: true, gerar: prazosDoPeriodo },
  movimentacao: { titulo: "Movimentação mensal", descricao: "Processos distribuídos, encerrados e com sentença em cada mês.", periodo: true, gerar: movimentacaoMensal },
  resultados: { titulo: "Resultados", descricao: "Encerrados por resultado (êxito, improcedência, acordo), por área e parte contrária.", periodo: true, gerar: resultados },
  sobrestados: { titulo: "Sobrestados", descricao: "Processos sobrestados ou suspensos, com motivo e data.", periodo: false, gerar: sobrestados },
  "cadastros-incompletos": { titulo: "Cadastros incompletos", descricao: "Clientes sem CPF ou contato; processos sem número, juízo ou data de distribuição.", periodo: false, gerar: cadastrosIncompletos },
} as const;

export type TipoRelatorio = keyof typeof RELATORIOS;
export const ehTipoRelatorio = (t: string): t is TipoRelatorio => t in RELATORIOS;

export function descreverPeriodo(f: Filtros): string {
  return `Período: ${formatarData(f.inicio)} a ${formatarData(f.fim)}`;
}

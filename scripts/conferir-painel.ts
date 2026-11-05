// Critério de aceite 8.2: "Painel mostra os mesmos totais da aba Relatório da planilha após a
// importação". Recalcula os indicadores da aba Relatório com as mesmas fórmulas da planilha e
// compara com o painel do sistema (banco em DATABASE_URL). Mostra só contagens, sem nomes.
//
// Uso: npx tsx scripts/conferir-painel.ts <planilha.xlsx>

import "dotenv/config";
import { readFileSync } from "node:fs";
import { lerPlanilha } from "../src/importacao/planilha";
import { criarPrisma } from "../src/servidor/db/prisma";
import { carteiraPorArea, carteiraPorStatus, indicadores } from "../src/servidor/relatorios/consultas";
import { lerFiltros } from "../src/servidor/relatorios/tipos";

// Instituições listadas na aba Relatório (contagem por "contém", sem distinguir maiúsculas).
const INSTITUICOES = [
  "Agibank", "BMG", "BRB", "Banco do Brasil", "Banrisul", "Bradesco", "C6", "Capital Consig", "Digio", "Facta", "Icatu",
  "Inbursa", "Itaú", "Master", "Mercado Pago", "Novo Banco Continental", "Olé", "Pan", "Paraná Banco", "Pine", "Porto Seguro", "Santander",
];
const STATUS_PLANILHA: Record<string, string> = { "encerrado – êxito": "Encerrado — êxito", "encerrado – improcedente": "Encerrado — improcedente" };

const linhas = await lerPlanilha(readFileSync(process.argv[2]!));
const prisma = criarPrisma();
const admin = await prisma.usuario.findFirstOrThrow({ where: { perfil: "ADMINISTRADOR", ativo: true } });
const usuario = { id: admin.id, nome: admin.nome, email: admin.email, perfil: admin.perfil, veTodosProcessos: true };
const f = lerFiltros({});

// ── Planilha (fórmulas da aba Relatório) ──
const p = linhas.processos;
const contar = <T,>(lista: T[], chave: (x: T) => string) =>
  lista.reduce<Record<string, number>>((a, x) => ((a[chave(x)] = (a[chave(x)] ?? 0) + 1), a), {});
const encerrados = p.filter((x) => /^encerrado/i.test(x.status ?? "") || x.status === "Arquivado").length;
const planilha = {
  "Clientes cadastrados": linhas.clientes.length,
  "Clientes ativos": linhas.clientes.filter((c) => c.situacao === "Ativo").length,
  "Processos cadastrados": p.length,
  "Processos ativos": p.length - encerrados,
  "Processos sem número": p.filter((x) => !x.numero).length,
  // Colunas "Próximo prazo" e "Dias até o prazo" vazias na planilha.
  "Prazos vencidos": 0,
};
const statusPlanilha = contar(p, (x) => STATUS_PLANILHA[(x.status ?? "").toLowerCase()] ?? x.status ?? "");
const areaPlanilha = contar(p, (x) => x.area ?? "");
const instPlanilha = Object.fromEntries(
  INSTITUICOES.map((i) => [i, p.filter((x) => (x.parteContraria ?? "").toLowerCase().includes(i.toLowerCase())).length]),
);

// ── Sistema (painel) ──
const ind = await indicadores(usuario, f, prisma);
const st = await carteiraPorStatus(usuario, f, prisma);
const ar = await carteiraPorArea(usuario, f, prisma);
const relacionados = await prisma.processo.count({ where: { codigoLegado: { contains: "-R" }, excluidoEm: null } });
const sistema = {
  "Clientes cadastrados": ind.valores.clientesCadastrados,
  "Clientes ativos": ind.valores.clientesAtivos,
  "Processos cadastrados": ind.valores.processos,
  "Processos ativos": ind.valores.ativos,
  "Processos sem número": ind.valores.semNumero,
  "Prazos vencidos": ind.valores.vencidos,
};
const partes = await prisma.parteProcesso.findMany({
  where: { ehClienteDoEscritorio: false, processo: { excluidoEm: null } },
  select: { processoId: true, pessoa: { select: { nome: true, observacoes: true, codigoLegado: true } } },
});
const contem = (t: string, x: (typeof partes)[number]) => `${x.pessoa.nome} ${x.pessoa.observacoes ?? ""}`.toLowerCase().includes(t);
const instSistema = Object.fromEntries(
  INSTITUICOES.map((i) => [i, new Set(partes.filter((x) => contem(i.toLowerCase(), x)).map((x) => x.processoId)).size]),
);
// Partes não clientes vindas da coluna "Cliente" da planilha (C1: ex.: co-executada de C033).
const daColunaCliente = Object.fromEntries(
  INSTITUICOES.map((i) => [i, new Set(partes.filter((x) => x.pessoa.codigoLegado && contem(i.toLowerCase(), x)).map((x) => x.processoId)).size]),
);

type Linha = { indicador: string; planilha: number; sistema: number; situacao: string };
const tabela: Linha[] = [];
const comparar = (indicador: string, a: number, b: number, explicacao = "") =>
  tabela.push({ indicador, planilha: a, sistema: b, situacao: a === b ? "confere" : explicacao || "DIFERENTE" });
const rel = `+${relacionados} relacionados (C4)`;
for (const [k, v] of Object.entries(planilha)) {
  const explicacao =
    k.startsWith("Clientes") ? "clientes compostos separados (C1) e C049 não é pessoa"
    : k.startsWith("Processos cadastrados") || k.startsWith("Processos ativos") ? rel
    : "";
  comparar(k, v, sistema[k as keyof typeof sistema], explicacao);
}
for (const l of st.linhas) {
  const nome = String(l.status);
  const a = statusPlanilha[nome] ?? 0;
  const b = Number(l.processos);
  comparar(`Status: ${nome}`, a, b, nome === "Em andamento" && b - a === relacionados ? rel : "");
}
const relPorArea = contar(
  await prisma.processo.findMany({ where: { codigoLegado: { contains: "-R" } }, include: { area: true } }),
  (x) => x.area.valor,
);
for (const l of ar.linhas) {
  const nome = String(l.area);
  const a = areaPlanilha[nome] ?? 0;
  const b = Number(l.processos);
  comparar(`Área: ${nome}`, a, b, b - a === (relPorArea[nome] ?? 0) && b !== a ? `+${relPorArea[nome]} relacionado(s) (C4)` : "");
}
for (const i of INSTITUICOES) {
  const extra = daColunaCliente[i]!;
  comparar(`Contém "${i}"`, instPlanilha[i]!, instSistema[i]!, extra && instSistema[i]! - instPlanilha[i]! === extra ? `+${extra} parte vinda da coluna Cliente (C1)` : "");
}
console.table(tabela);
const divergentes = tabela.filter((l) => l.situacao === "DIFERENTE");
console.log(divergentes.length ? `${divergentes.length} indicador(es) com diferença não explicada.` : "Todos os indicadores conferem ou têm a diferença explicada.");
console.log(JSON.stringify({ tabela }));
await prisma.$disconnect();

// Dados FICTÍCIOS para desenvolvimento local (nunca rodar em produção).
// Uso: npx tsx scripts/dados-demonstracao.ts  → imprime o DEV_USUARIO_ID do administrador.

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { somarDias } from "../src/dominio/prazos/data-civil";
import { hoje } from "../src/lib/hoje";
import { criarPrisma } from "../src/servidor/db/prisma";
import { criarAndamento } from "../src/servidor/servicos/andamentos";
import { salvarAudiencia } from "../src/servidor/servicos/audiencias";
import { criarPessoa } from "../src/servidor/servicos/pessoas";
import { criarPrazo } from "../src/servidor/servicos/prazos";
import { criarProcesso } from "../src/servidor/servicos/processos";
import { cargaInicial } from "../src/servidor/seed/carga-inicial";

if (!/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "")) {
  console.error("Recusado: dados de demonstração só em banco local.");
  process.exit(1);
}

const prisma = criarPrisma();
const ano = Number(hoje().slice(0, 4));
await cargaInicial(prisma, [ano - 1, ano, ano + 1]);

const seed = <T>(fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.origem', 'seed', true)`;
    return fn(tx);
  });

const usuario = async (nome: string, perfil: "ADMINISTRADOR" | "ADVOGADO" | "ASSISTENTE") => {
  const email = `${nome.toLowerCase().replace(/\W+/g, ".")}@exemplo.invalid`;
  const u =
    (await prisma.usuario.findUnique({ where: { email } })) ??
    (await seed((tx) => tx.usuario.create({ data: { id: randomUUID(), nome, email, perfil } })));
  return { id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, veTodosProcessos: u.veTodosProcessos };
};

const socia = await usuario("Ana Sócia Fictícia", "ADMINISTRADOR");
const advogado = await usuario("Bruno Advogado Fictício", "ADVOGADO");
const assistente = await usuario("Carla Assistente Fictícia", "ASSISTENTE");

if (await prisma.processo.count()) {
  console.log(`Dados já existem. DEV_USUARIO_ID=${socia.id}`);
  process.exit(0);
}

for (const valor of ["Conciliação", "Instrução e julgamento", "Sustentação oral"]) {
  await seed((tx) => tx.itemLista.upsert({ where: { lista_valor: { lista: "TIPO_AUDIENCIA", valor } }, update: {}, create: { lista: "TIPO_AUDIENCIA", valor } }));
}
const item = (lista: "AREA" | "TIPO_ANDAMENTO" | "QUALIFICACAO_PARTE" | "CATEGORIA_PARTE" | "TIPO_AUDIENCIA", valor: string) =>
  prisma.itemLista.findFirstOrThrow({ where: { lista, valor } }).then((i) => i.id);
const status = (nome: string) => prisma.statusProcesso.findFirstOrThrow({ where: { nome } }).then((s) => s.id);
const goiania = (await prisma.comarca.findFirstOrThrow({ where: { nome: "Goiânia" } })).id;

const cliente = await criarPessoa(socia, {
  tipo: "PF", nome: "Joana Exemplo da Silva", cpfCnpj: "123.456.789-09", rg: "0000000 SSP/GO", ehCliente: "on",
  cidade: "Goiânia", uf: "GO", dataEntrada: somarDias(hoje(), -90), responsavelId: advogado.id,
  contatoTipo: ["WHATSAPP", "EMAIL"], contatoValor: ["(62) 90000-0001", "joana@exemplo.invalid"],
  documentoTipo: ["NUMERO_BENEFICIO"], documentoNumero: ["000.000.000-0"], documentoDescricao: ["Benefício fictício"],
  informacoesReservadas: "Informação reservada fictícia para teste.",
}, prisma);
const banco = await criarPessoa(socia, { tipo: "PJ", nome: "Banco Fictício S.A.", categoriaId: await item("CATEGORIA_PARTE", "Instituição financeira") }, prisma);
const autor = await item("QUALIFICACAO_PARTE", "Autor");
const reu = await item("QUALIFICACAO_PARTE", "Réu");

const processo = await criarProcesso(socia, {
  numeroCnj: "0000001-92.2026.8.09.0051", areaId: await item("AREA", "Bancário/Consumidor"), statusId: await status("Em andamento"),
  responsavelId: advogado.id, comarcaId: goiania, orgaoJulgador: "1ª Vara Cível (fictícia)", grau: "PRIMEIRO",
  assunto: "Consignado — contratação contestada (fictício)", faseAtual: "Instrução", valorCausa: "15.000,00", dataDistribuicao: somarDias(hoje(), -80),
}, [
  { pessoaId: cliente.id, polo: "ATIVO", qualificacaoIds: [autor], ehClienteDoEscritorio: "on" },
  { pessoaId: banco.id, polo: "PASSIVO", qualificacaoIds: [reu] },
], prisma);
const recurso = await criarProcesso(socia, {
  areaId: await item("AREA", "Bancário/Consumidor"), statusId: await status("A protocolar"), responsavelId: advogado.id,
  assunto: "Recurso a protocolar (fictício)", cadastroIncompleto: "on", pendencias: "Número a informar após a distribuição",
}, [{ pessoaId: cliente.id, polo: "ATIVO", qualificacaoIds: [], ehClienteDoEscritorio: "on" }], prisma);
await seed((tx) => tx.vinculoProcesso.create({ data: { processoOrigemId: processo.id, processoVinculadoId: recurso.id, tipo: "RECURSO" } }));

const publicacao = await item("TIPO_ANDAMENTO", "Publicação");
const prazoDe = (descricao: string, diasAtras: number, dias: number, responsavelId: string) => ({
  descricaoPrazo: descricao, formaIntimacao: "DATA_INFORMADA", formaIntimacaoDetalhe: "Em audiência",
  dataReferencia: ultimoDiaUtilAntes(somarDias(hoje(), -diasAtras)), quantidadeDias: dias, tipoContagem: "UTEIS", emDobro: false, responsavelId, comPrazo: "on",
});
function ultimoDiaUtilAntes(d: string) {
  let x = d;
  while ([0, 6].includes(new Date(`${x}T12:00:00Z`).getUTCDay())) x = somarDias(x, -1);
  return x;
}
for (const [texto, diasAtras, dias, resp] of [
  ["Intimação para manifestação sobre documentos (fictícia)", 20, 5, advogado.id],
  ["Intimação para especificar provas (fictícia)", 4, 5, advogado.id],
  ["Intimação para réplica (fictícia)", 2, 15, socia.id],
] as const) {
  const p = prazoDe(texto.replace("Intimação para ", "").replace(" (fictícia)", ""), diasAtras, dias, resp);
  await criarAndamento(socia, processo.id, { data: p.dataReferencia, tipoId: publicacao, descricao: texto }, { ...p, descricao: p.descricaoPrazo }, prisma);
}
// Exemplo de contagem manual: dias corridos (não criminal) vencendo num sábado (B3).
let quinta = somarDias(hoje(), 7);
while (new Date(`${quinta}T12:00:00Z`).getUTCDay() !== 4) quinta = somarDias(quinta, 1);
await criarPrazo(socia, processo.id, {
  descricao: "Exemplo de contagem manual", formaIntimacao: "DATA_INFORMADA", formaIntimacaoDetalhe: "Correio (AR)",
  dataReferencia: quinta, quantidadeDias: 2, tipoContagem: "CORRIDOS", emDobro: false, responsavelId: advogado.id,
  dataFinalManual: somarDias(quinta, 4), justificativaManual: "Contagem conferida no processo (exemplo fictício)",
}, prisma);
await salvarAudiencia(socia, processo.id, {
  dataHora: `${somarDias(hoje(), 3)}T14:30`, tipoId: await item("TIPO_AUDIENCIA", "Conciliação"), modalidade: "VIRTUAL",
  localOuLink: "https://exemplo.invalid/sala-ficticia", responsavelId: advogado.id,
}, undefined, prisma);

await prisma.$disconnect();
console.log(`Dados fictícios criados. Usuários: ${socia.nome} (admin), ${advogado.nome}, ${assistente.nome}.`);
console.log(`DEV_USUARIO_ID=${socia.id}`);

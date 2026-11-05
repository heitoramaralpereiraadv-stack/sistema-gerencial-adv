// Relatórios da seção 6 e exportação em Excel e PDF, com dados fictícios.

import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UsuarioAtual } from "@/servidor/auth/usuario";
import { criarPrisma } from "@/servidor/db/prisma";
import {
  cadastrosIncompletos,
  carteiraPorParteContraria,
  movimentacaoMensal,
  prazosDoPeriodo,
  resultados,
  sobrestados,
} from "@/servidor/relatorios/consultas";
import { exportar } from "@/servidor/relatorios/exportacao";
import { lerFiltros, type Filtros } from "@/servidor/relatorios/tipos";
import { criarAndamento } from "@/servidor/servicos/andamentos";
import { salvarEscritorio } from "@/servidor/servicos/escritorio";
import { criarPessoa } from "@/servidor/servicos/pessoas";
import { alterarSituacaoPrazo, criarPrazo, cumprirPrazo } from "@/servidor/servicos/prazos";
import { alterarStatus, criarProcesso } from "@/servidor/servicos/processos";
import { criarUsuario } from "../apoio/fixtures";

const prisma = criarPrisma();
afterAll(() => prisma.$disconnect());

let admin: UsuarioAtual, advogada: UsuarioAtual, assistente: UsuarioAtual;
let f: Filtros;
let ids: { area: string; status: Record<string, string>; sentenca: string };
let clienteId: string;

beforeAll(async () => {
  admin = await criarUsuario(prisma, "ADMINISTRADOR");
  advogada = await criarUsuario(prisma, "ADVOGADO");
  assistente = await criarUsuario(prisma, "ASSISTENTE");
  f = { inicio: "2026-09-01", fim: "2026-10-31", responsavelId: advogada.id };
  const status = await prisma.statusProcesso.findMany();
  ids = {
    area: (await prisma.itemLista.findFirstOrThrow({ where: { lista: "AREA", valor: "Saúde" } })).id,
    status: Object.fromEntries(status.map((s) => [s.nome, s.id])),
    sentenca: (await prisma.itemLista.findFirstOrThrow({ where: { lista: "TIPO_ANDAMENTO", valor: "Sentença" } })).id,
  };
  const cliente = await criarPessoa(admin, { tipo: "PF", nome: "Cliente Fictícia dos Relatórios", ehCliente: "on", contatoTipo: ["TELEFONE"], contatoValor: ["(62) 90000-1234"] }, prisma);
  clienteId = cliente.id;
  const banco = await criarPessoa(admin, { tipo: "PJ", nome: "Banco Fictício dos Relatórios S.A." }, prisma);
  const novo = (extra: Record<string, unknown>) =>
    criarProcesso(admin, { areaId: ids.area, statusId: ids.status["Em andamento"], responsavelId: advogada.id, ...extra }, [
      { pessoaId: cliente.id, polo: "ATIVO", qualificacaoIds: [], ehClienteDoEscritorio: "on" },
      { pessoaId: banco.id, polo: "PASSIVO", qualificacaoIds: [] },
    ], prisma);

  const p1 = await novo({ dataDistribuicao: "2026-09-10", orgaoJulgador: "Vara fictícia" });
  const p2 = await novo({ dataDistribuicao: "2026-10-05" });
  await novo({ segredoJustica: "on" });
  await alterarStatus(admin, p2.id, { statusId: ids.status["Encerrado — êxito"], dataEncerramento: "2026-10-20", dataResultado: "2026-10-15" }, prisma);
  const p3 = await novo({});
  await alterarStatus(admin, p3.id, { statusId: ids.status["Acordo"], dataResultado: "2026-09-25" }, prisma);
  const p4 = await novo({});
  await alterarStatus(admin, p4.id, { statusId: ids.status["Sobrestado"], motivoSuspensao: "Tema fictício 9999", dataSuspensao: "2026-09-02" }, prisma);
  await criarAndamento(admin, p1.id, { data: "2026-10-08", tipoId: ids.sentenca, descricao: "Sentença fictícia de procedência" }, undefined, prisma);

  const prazo = (descricao: string, dataReferencia: string) =>
    criarPrazo(admin, p1.id, { descricao, formaIntimacao: "DATA_INFORMADA", dataReferencia, quantidadeDias: 5, tipoContagem: "UTEIS", emDobro: false, responsavelId: advogada.id }, prisma);
  await prazo("Prazo aberto fictício", "2026-09-14");
  const cumprido = await prazo("Prazo cumprido fictício", "2026-09-21");
  await cumprirPrazo(advogada, cumprido.id, { cumpridoEm: "2026-09-25" }, prisma);
  const perdido = await prazo("Prazo perdido fictício", "2026-10-05");
  await alterarSituacaoPrazo(advogada, perdido.id, "PERDIDO", prisma);
});

describe("relatórios", () => {
  it("prazos do período por responsável: aberto (vencido), cumprido, perdido", async () => {
    const t = await prazosDoPeriodo(admin, f, prisma);
    expect(t.linhas.map((l) => [l.descricao, l.situacao])).toEqual([
      ["Prazo aberto fictício", "Aberto — vencido"],
      ["Prazo cumprido fictício", "Cumprido"],
      ["Prazo perdido fictício", "Perdido"],
    ]);
    expect(t.resumo).toEqual([{ rotulo: advogada.nome, valor: "1 aberto(s), 1 cumprido(s), 1 perdido(s)" }]);
  });

  it("movimentação mensal: distribuídos, encerrados e com sentença (acordo homologado conta)", async () => {
    const t = await movimentacaoMensal(admin, f, prisma);
    expect(t.linhas).toEqual([
      { mes: "setembro de 2026", distribuidos: 1, encerrados: 0, sentencas: 1 },
      { mes: "outubro de 2026", distribuidos: 1, encerrados: 1, sentencas: 2 },
    ]);
  });

  it("resultados por resultado e área", async () => {
    const t = await resultados(admin, f, prisma);
    expect(t.linhas.map((l) => l.resultado).sort()).toEqual(["Acordo", "Êxito"]);
    expect(t.linhas.every((l) => l.contraria === "Banco Fictício dos Relatórios S.A.")).toBe(true);
    expect(t.resumo).toEqual(expect.arrayContaining([{ rotulo: "Êxito · Saúde", valor: 1 }]));
  });

  it("sobrestados com motivo e data", async () => {
    const t = await sobrestados(admin, { ...f, responsavelId: advogada.id }, prisma);
    expect(t.linhas).toEqual([expect.objectContaining({ motivo: "Tema fictício 9999", desde: "02/09/2026", status: "Sobrestado" })]);
  });

  it("parte contrária com categoria e contagem", async () => {
    const t = await carteiraPorParteContraria(admin, f, prisma);
    expect(t.linhas).toContainEqual({ parte: "Banco Fictício dos Relatórios S.A.", categoria: "Pessoa jurídica", processos: 5 });
  });

  it("segredo de justiça não aparece para quem não pode ver (assistente)", async () => {
    const paraAdmin = await carteiraPorParteContraria(admin, f, prisma);
    const paraAssistente = await carteiraPorParteContraria(assistente, f, prisma);
    const n = (t: typeof paraAdmin) => t.linhas.find((l) => l.parte === "Banco Fictício dos Relatórios S.A.")?.processos;
    expect(n(paraAdmin)).toBe(5);
    expect(n(paraAssistente)).toBe(4);
  });

  it("cadastros incompletos: cliente sem CPF; processos sem número/juízo/data", async () => {
    const t = await cadastrosIncompletos(admin, f, prisma);
    expect(t.linhas).toContainEqual(expect.objectContaining({ tipo: "Cliente", identificacao: "Cliente Fictícia dos Relatórios", falta: "CPF/CNPJ" }));
    const processo = t.linhas.find((l) => l.tipo === "Processo" && String(l.falta).includes("número"));
    expect(processo?.falta).toBe("número, comarca");
  });
});

describe("exportação", () => {
  it("Excel com cabeçalho do escritório, filtros e tabela", async () => {
    await salvarEscritorio(admin, { razaoSocial: "Escritório Fictício Sociedade de Advogados", cnpj: "11.222.333/0001-81", registroOab: "GO 0000" }, null, prisma);
    const r = await exportar(admin, "prazos", "xlsx", { inicio: "2026-09-01", fim: "2026-10-31", responsavelId: advogada.id }, prisma);
    expect(r.nome).toMatch(/^prazos-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const livro = new ExcelJS.Workbook();
    await livro.xlsx.load(Buffer.from(r.conteudo) as unknown as ArrayBuffer);
    const valores: string[] = [];
    livro.worksheets[0]!.eachRow((l) => l.eachCell((c) => valores.push(String(c.value))));
    expect(valores[0]).toBe("Escritório Fictício Sociedade de Advogados");
    expect(valores).toContain("CNPJ 11.222.333/0001-81 · OAB GO 0000");
    expect(valores.some((v) => v.includes("Período: 01/09/2026 a 31/10/2026") && v.includes(`Responsável: ${advogada.nome}`))).toBe(true);
    expect(valores).toEqual(expect.arrayContaining(["Responsável", "Vencimento", "Prazo perdido fictício"]));
  });

  it("PDF válido, com várias páginas quando a tabela é longa", async () => {
    const r = await exportar(admin, "processos", "pdf", {}, prisma);
    expect(r.tipoMime).toBe("application/pdf");
    const pdf = await PDFDocument.load(r.conteudo);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(r.tabela.linhas.length > 40 ? 2 : 1);
    expect(pdf.getTitle()).toBe("Processos");
  });

  it("todos os relatórios exportam nos dois formatos", async () => {
    for (const tipo of ["indicadores", "status", "area", "parte-contraria", "tribunal-comarca", "prazos", "movimentacao", "resultados", "sobrestados", "cadastros-incompletos"]) {
      for (const formato of ["xlsx", "pdf"] as const) {
        const r = await exportar(admin, tipo, formato, lerFiltros({}) as never, prisma);
        expect(r.conteudo.length).toBeGreaterThan(500);
      }
    }
  });

  it("ficha do cliente: sem dados reservados e com registro de acesso", async () => {
    const antes = await prisma.registroAcesso.count({ where: { registroId: clienteId } });
    const r = await exportar(admin, "ficha-cliente", "pdf", { pessoaId: clienteId }, prisma);
    expect(r.tabela.resumo).toContainEqual({ rotulo: "CPF/CNPJ", valor: "não informado" });
    expect(r.tabela.linhas).toHaveLength(5);
    expect(r.tabela.linhas.some((l) => String(l.andamento).includes("Sentença fictícia"))).toBe(true);
    expect(await prisma.registroAcesso.count({ where: { registroId: clienteId } })).toBe(antes + 1);
  });

  it("caracteres fora da fonte do PDF não quebram a exportação", async () => {
    await salvarEscritorio(admin, { razaoSocial: "Escritório ≥ Fictício ✓ 漢字" }, null, prisma);
    const r = await exportar(admin, "status", "pdf", {}, prisma);
    expect((await PDFDocument.load(r.conteudo)).getPageCount()).toBe(1);
  });

  it("só administrador altera o cabeçalho", async () => {
    await expect(salvarEscritorio(advogada, { razaoSocial: "x" }, null, prisma)).rejects.toThrow(/permissão/);
  });
});

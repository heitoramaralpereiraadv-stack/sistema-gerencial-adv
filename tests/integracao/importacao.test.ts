// Importação ponta a ponta com a planilha fictícia (critério 8.2: importação e relatório).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UsuarioAtual } from "@/servidor/auth/usuario";
import { criarPrisma } from "@/servidor/db/prisma";
import { ProibidoError, RegraDeNegocioError } from "@/servidor/erros";
import { criarLote, gravarLote, obterLote, salvarDecisoes } from "@/servidor/servicos/importacao";
import { criarProcesso } from "@/servidor/servicos/processos";
import { carteiraPorArea, carteiraPorStatus, indicadores } from "@/servidor/relatorios/consultas";
import { lerFiltros } from "@/servidor/relatorios/tipos";
import { AJUSTES_FICTICIOS, planilhaFicticia } from "../apoio/planilha-ficticia";
import { criarUsuario } from "../apoio/fixtures";

const prisma = criarPrisma();
afterAll(() => prisma.$disconnect());

let admin: UsuarioAtual, assistente: UsuarioAtual, outroAdvogado: UsuarioAtual;
let loteId: string;
beforeAll(async () => {
  admin = await criarUsuario(prisma, "ADMINISTRADOR");
  assistente = await criarUsuario(prisma, "ASSISTENTE");
  outroAdvogado = await criarUsuario(prisma, "ADVOGADO");
});

describe("importação da planilha", () => {
  it("só administrador importa", async () => {
    await expect(
      criarLote(assistente, { nome: "x.xlsx", conteudo: await planilhaFicticia() }, null, prisma),
    ).rejects.toThrowError(ProibidoError);
  });

  it("arquivo inválido é recusado com mensagem clara", async () => {
    await expect(criarLote(admin, { nome: "x.xlsx", conteudo: Buffer.from("x") }, null, prisma)).rejects.toThrow(/não é uma planilha/);
    await expect(criarLote(admin, { nome: "x.xlsx", conteudo: await planilhaFicticia() }, "{ruim", prisma)).rejects.toThrow(/ajustes inválido/);
  });

  it("cria o lote em revisão, sem gravar nada", async () => {
    const antes = await prisma.processo.count();
    const lote = await criarLote(admin, { nome: "ficticia.xlsx", conteudo: await planilhaFicticia() }, JSON.stringify(AJUSTES_FICTICIOS), prisma);
    loteId = lote.id;
    expect(lote.situacao).toBe("EM_REVISAO");
    expect(await prisma.processo.count()).toBe(antes);
    const l = await obterLote(admin, loteId, prisma);
    expect(l.proposta.erros.length).toBeGreaterThan(0);
  });

  it("não grava antes da revisão", async () => {
    await expect(gravarLote(admin, loteId, prisma)).rejects.toThrowError(RegraDeNegocioError);
  });

  it("responsável precisa ser advogado ou sócio", async () => {
    await expect(
      salvarDecisoes(admin, loteId, { separacoes: {}, mesclagens: {}, responsaveis: { Silas: assistente.id } }, prisma),
    ).rejects.toThrow(/advogado ou sócio/);
  });

  it("recusa gravar quando um número da planilha já está cadastrado no sistema", async () => {
    const numero = "0009010-78.2026.8.09.0051";
    const area = await prisma.itemLista.findFirstOrThrow({ where: { lista: "AREA" } });
    const status = await prisma.statusProcesso.findFirstOrThrow({ where: { nome: "Em andamento" } });
    await criarProcesso(admin, { numeroCnj: numero, areaId: area.id, statusId: status.id, responsavelId: outroAdvogado.id }, [], prisma);
    const conflito = await criarLote(admin, { nome: "conflito.xlsx", conteudo: await planilhaFicticia({ P001: numero }) }, JSON.stringify(AJUSTES_FICTICIOS), prisma);
    await salvarDecisoes(admin, conflito.id, { separacoes: {}, mesclagens: {}, responsaveis: { Silas: admin.id } }, prisma);
    await expect(gravarLote(admin, conflito.id, prisma)).rejects.toThrow(`Já existem no sistema processos com estes números: ${numero}`);
    expect(await prisma.processo.count({ where: { codigoLegado: "P002" } })).toBe(0);
  });

  it("grava tudo após a revisão, com histórico e relatório", async () => {
    await salvarDecisoes(admin, loteId, { separacoes: {}, mesclagens: {}, responsaveis: { Silas: admin.id } }, prisma);
    const r = await gravarLote(admin, loteId, prisma);

    expect(r).toMatchObject({ processos: 10, processosRelacionados: 1, clientes: 5, vinculos: 1 });
    expect(r.mesclagens.cadastrosUnidos).toBeGreaterThanOrEqual(2); // Inbursa e Santander/Olé
    expect(r.conciliacao.sistema.porStatus).toEqual(r.conciliacao.planilha.porStatus);
    expect(r.pendentes.some((p) => p.codigo === "P003" && p.pendencias.includes("Sem número: juízo e comarca a informar"))).toBe(true);

    const p007 = await prisma.processo.findFirstOrThrow({
      where: { codigoLegado: "P007" },
      include: { partes: { include: { pessoa: true, qualificacoes: true } }, comarca: true, status: true },
    });
    expect(p007).toMatchObject({ numeroCnj: "0009007-26.2026.8.09.0051", grau: "RECURSAL", tribunalCodigo: "8.09", responsavelId: admin.id });
    expect(p007.comarca?.nome).toBe("Goiânia");
    expect(p007.partes.map((x) => [x.pessoa.nome, x.polo, x.qualificacoes.map((q) => q.valor).join("+")]).sort()).toEqual([
      ["Banco Inbursa S.A.", "PASSIVO", "Recorrido"],
      ["Fulano Teste da Silva", "ATIVO", "Recorrente"],
    ]);
    const p009 = await prisma.processo.findFirstOrThrow({ where: { codigoLegado: "P009" }, include: { status: true } });
    expect(p009).toMatchObject({ motivoSuspensao: "Tema 1414/STJ", cadastroIncompleto: true });
    expect(p009.status.nome).toBe("Sobrestado");

    const h = await prisma.historico.findFirst({ where: { entidade: "processo", registroId: p007.id, operacao: "CRIACAO" } });
    expect(h?.usuarioId).toBe(admin.id);

    const lote = await prisma.loteImportacao.findUniqueOrThrow({ where: { id: loteId } });
    expect(lote.situacao).toBe("GRAVADO");
  });

  it("critério A2: o painel mostra os mesmos totais da planilha (processos, status, área, sem número)", async () => {
    const lote = await obterLote(admin, loteId, prisma);
    const planilha = (lote.relatorio as unknown as { conciliacao: { planilha: { processos: number; semNumero: number; porStatus: Record<string, number>; porArea: Record<string, number> } } }).conciliacao.planilha;
    // Só os processos importados têm o administrador do teste como responsável (os relacionados também).
    const f = { ...lerFiltros({}), responsavelId: admin.id };
    const st = await carteiraPorStatus(admin, f, prisma);
    const ar = await carteiraPorArea(admin, f, prisma);
    const ind = await indicadores(admin, f, prisma);
    const porStatus = Object.fromEntries(st.linhas.filter((l) => Number(l.processos) > 0).map((l) => [l.status, l.processos]));
    const porArea = Object.fromEntries(ar.linhas.filter((l) => Number(l.processos) > 0).map((l) => [l.area, l.processos]));
    // O processo relacionado criado das observações (C4) entra como "Em andamento" na área do processo de origem.
    expect(ind.valores.processos).toBe(planilha.processos + 1);
    expect(porStatus).toEqual({ ...planilha.porStatus, "Em andamento": planilha.porStatus["Em andamento"]! + 1 });
    expect(porArea["Família e Sucessões"]).toBe(planilha.porArea["Família e Sucessões"]! + 1);
    expect(ind.valores.semNumero).toBe(planilha.semNumero);
  });

  it("a planilha não é importada duas vezes", async () => {
    const outro = await criarLote(admin, { nome: "de novo.xlsx", conteudo: await planilhaFicticia() }, JSON.stringify(AJUSTES_FICTICIOS), prisma);
    await salvarDecisoes(admin, outro.id, { separacoes: {}, mesclagens: {}, responsaveis: { Silas: admin.id } }, prisma);
    await expect(gravarLote(admin, outro.id, prisma)).rejects.toThrow(/já foi importada/);
  });
});

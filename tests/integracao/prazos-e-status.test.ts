// Regras de prazo e status no servidor, com dados fictícios e os feriados padrão (B11).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UsuarioAtual } from "@/servidor/auth/usuario";
import { comUsuario, criarPrisma } from "@/servidor/db/prisma";
import { ProibidoError, RegraDeNegocioError } from "@/servidor/erros";
import { criarAndamento } from "@/servidor/servicos/andamentos";
import { ajustarPrazo, alterarSituacaoPrazo, conferirPrazo, criarPrazo, cumprirPrazo, simularPrazo } from "@/servidor/servicos/prazos";
import { alterarStatus, criarProcesso } from "@/servidor/servicos/processos";
import { criarComarca } from "@/servidor/servicos/referencias";
import { criarUsuario } from "../apoio/fixtures";

const prisma = criarPrisma();
afterAll(() => prisma.$disconnect());

let admin: UsuarioAtual, advogado: UsuarioAtual, assistente: UsuarioAtual, restrito: UsuarioAtual;
let ids: { area: string; status: Record<string, string>; goiania: string; tipoAndamento: string };

beforeAll(async () => {
  admin = await criarUsuario(prisma, "ADMINISTRADOR");
  advogado = await criarUsuario(prisma, "ADVOGADO");
  assistente = await criarUsuario(prisma, "ASSISTENTE");
  restrito = await criarUsuario(prisma, "ADVOGADO", { veTodosProcessos: false });
  const status = await prisma.statusProcesso.findMany();
  ids = {
    area: (await prisma.itemLista.findFirstOrThrow({ where: { lista: "AREA", valor: "Cível" } })).id,
    status: Object.fromEntries(status.map((s) => [s.nome, s.id])),
    goiania: (await prisma.comarca.findFirstOrThrow({ where: { nome: "Goiânia" } })).id,
    tipoAndamento: (await prisma.itemLista.findFirstOrThrow({ where: { lista: "TIPO_ANDAMENTO", valor: "Publicação" } })).id,
  };
});

const novoProcesso = (extra: Record<string, unknown> = {}) =>
  criarProcesso(advogado, {
    areaId: ids.area,
    statusId: ids.status["Em andamento"],
    responsavelId: advogado.id,
    comarcaId: ids.goiania,
    numeroCnj: "",
    ...extra,
  }, [], prisma);

const prazoBase = (responsavelId: string) => ({
  descricao: "Manifestação fictícia",
  formaIntimacao: "DJE",
  dataReferencia: "2026-10-21",
  quantidadeDias: "5",
  tipoContagem: "UTEIS",
  emDobro: "",
  responsavelId,
});

describe("número CNJ no cadastro do processo", () => {
  it("válido preenche ano, segmento, origem e tribunal", async () => {
    const p = await novoProcesso({ numeroCnj: "00000019220268090051" });
    expect(p).toMatchObject({ numeroCnj: "0000001-92.2026.8.09.0051", cnjAno: 2026, cnjSegmento: "8", cnjOrigem: "0051", tribunalCodigo: "8.09" });
  });
  it("inválido não é salvo", async () => {
    await expect(novoProcesso({ numeroCnj: "0000001-93.2026.8.09.0051" })).rejects.toThrow(/Dígito verificador/);
  });
  it("tribunal fora da tabela é aceito com tribunal em branco", async () => {
    const p = await novoProcesso({ numeroCnj: "0000003-33.2026.8.30.0001" });
    expect(p.tribunalCodigo).toBeNull();
  });
  it("número repetido é recusado", async () => {
    await expect(novoProcesso({ numeroCnj: "0000001-92.2026.8.09.0051" })).rejects.toThrow(/Já existe processo/);
  });
  it("assistente não pode ser o responsável", async () => {
    await expect(novoProcesso({ responsavelId: assistente.id })).rejects.toThrow(/advogado ou sócio/);
  });
});

describe("status (4.3 e A4)", () => {
  it("Sobrestado exige motivo", async () => {
    const p = await novoProcesso();
    await expect(alterarStatus(advogado, p.id, { statusId: ids.status["Sobrestado"] }, prisma)).rejects.toThrow(/exige o motivo/);
    const r = await alterarStatus(advogado, p.id, { statusId: ids.status["Sobrestado"], motivoSuspensao: "Tema fictício" }, prisma);
    expect(r.motivoSuspensao).toBe("Tema fictício");
  });

  it("Acordo exige data da homologação e grava resultado ACORDO; processo segue aceitando prazos", async () => {
    const p = await novoProcesso();
    await expect(alterarStatus(advogado, p.id, { statusId: ids.status["Acordo"] }, prisma)).rejects.toThrow(/homologação/);
    const r = await alterarStatus(advogado, p.id, { statusId: ids.status["Acordo"], dataResultado: "2026-10-01" }, prisma);
    expect(r.resultado).toBe("ACORDO");
    await expect(criarPrazo(advogado, p.id, prazoBase(advogado.id), prisma)).resolves.toBeTruthy();
  });

  it("Encerrado exige data, bloqueia novos prazos e só administrador reabre", async () => {
    const p = await novoProcesso();
    await expect(alterarStatus(advogado, p.id, { statusId: ids.status["Encerrado — êxito"] }, prisma)).rejects.toThrow(/data de encerramento/);
    const r = await alterarStatus(advogado, p.id, { statusId: ids.status["Encerrado — êxito"], dataEncerramento: "2026-10-30" }, prisma);
    expect(r.resultado).toBe("EXITO");
    await expect(criarPrazo(advogado, p.id, prazoBase(advogado.id), prisma)).rejects.toThrow(/novos prazos bloqueados/);
    await expect(alterarStatus(advogado, p.id, { statusId: ids.status["Em andamento"] }, prisma)).rejects.toThrowError(ProibidoError);
    const reaberto = await alterarStatus(admin, p.id, { statusId: ids.status["Em andamento"] }, prisma);
    expect(reaberto).toMatchObject({ resultado: null, dataEncerramento: null });
  });
});

describe("prazos", () => {
  it("cálculo usa os feriados padrão: 02/11 (Finados) fica fora da contagem", async () => {
    const p = await novoProcesso();
    // Disp. qua 28/10 → publ. qui 29/10 → início sex 30/10: 30(1) [31,01, 02 Finados] 03(2) 04(3) 05(4) 06(5).
    const s = await simularPrazo(advogado, p.id, { ...prazoBase(advogado.id), dataReferencia: "2026-10-28" }, prisma);
    expect(s.tipo === "calculado" && s.resultado.dataFinal).toBe("2026-11-06");
    expect(s.tipo === "calculado" && s.resultado.memoria.diasExcluidos.find((d) => d.data === "2026-11-02")?.motivos).toEqual([
      "Feriado nacional: Finados",
    ]);
  });

  it("feriado municipal de Goiânia vale só para processo de Goiânia", async () => {
    const goiania = await novoProcesso();
    const outra = await novoProcesso({ comarcaId: "" });
    // Disp. ter 20/10 → publ. qua 21/10 → início qui 22/10: 22(1) 23(2) [24 Goiânia] … 26(3) 27(4) 28(5).
    const entrada = { ...prazoBase(advogado.id), dataReferencia: "2026-10-20" };
    const a = await simularPrazo(advogado, goiania.id, entrada, prisma);
    const b = await simularPrazo(advogado, outra.id, entrada, prisma);
    expect(a.tipo === "calculado" && a.resultado.dataFinal).toBe("2026-10-28");
    expect(b.tipo === "calculado" && b.resultado.dataFinal).toBe("2026-10-28");
    expect(a.tipo === "calculado" && a.resultado.memoria.diasExcluidos.find((d) => d.data === "2026-10-24")?.motivos).toEqual([
      "Sábado", "Feriado municipal: Feriado municipal de Goiânia (24 de outubro)",
    ]);
    expect(b.tipo === "calculado" && b.resultado.memoria.diasExcluidos.find((d) => d.data === "2026-10-24")?.motivos).toEqual(["Sábado"]);
  });

  it("B8: processo em 2º grau usa os feriados da sede do tribunal (Goiânia, para o TJGO)", async () => {
    const outra = await criarComarca(advogado, { nome: "Comarca Fictícia do Interior", uf: "GO" }, prisma);
    // 24/05/2027 (segunda) é feriado municipal de Goiânia. Intimação qua 19/05 → início qui 20/05.
    const entrada2027 = { ...prazoBase(advogado.id), formaIntimacao: "DATA_INFORMADA", dataReferencia: "2027-05-19" };
    const primeiroGrau = await novoProcesso({ numeroCnj: "", comarcaId: outra.id });
    const segundoGrau = await novoProcesso({ numeroCnj: "0000004-47.2026.8.09.0051", comarcaId: outra.id, grau: "SEGUNDO" });
    const a = await simularPrazo(advogado, primeiroGrau.id, entrada2027, prisma);
    const b = await simularPrazo(advogado, segundoGrau.id, entrada2027, prisma);
    // 1º grau no interior: 24/05 conta → 20(1) 21(2) 24(3) 25(4) 26(5).
    expect(a.tipo === "calculado" && a.resultado.dataFinal).toBe("2027-05-26");
    // 2º grau do TJGO: sede em Goiânia, 24/05 é feriado → 20(1) 21(2) 25(3) 26(4) 27(5).
    expect(b.tipo === "calculado" && b.resultado.dataFinal).toBe("2027-05-27");
  });

  it("B8: Justiça Federal segue só os feriados nacionais", async () => {
    const goiania = await prisma.comarca.findFirstOrThrow({ where: { nome: "Goiânia" } });
    const federal = await novoProcesso({ numeroCnj: "1000000-80.2026.4.01.3500", comarcaId: goiania.id });
    const estadual = await novoProcesso({ comarcaId: goiania.id });
    const entrada = { ...prazoBase(advogado.id), formaIntimacao: "DATA_INFORMADA", dataReferencia: "2027-05-19" };
    const f = await simularPrazo(advogado, federal.id, entrada, prisma);
    const e = await simularPrazo(advogado, estadual.id, entrada, prisma);
    expect(f.tipo === "calculado" && f.resultado.dataFinal).toBe("2027-05-26");
    expect(e.tipo === "calculado" && e.resultado.dataFinal).toBe("2027-05-27");
  });

  it("prazo automático grava memória, datas e data efetiva", async () => {
    const p = await novoProcesso();
    const prazo = await criarPrazo(advogado, p.id, prazoBase(advogado.id), prisma);
    expect(prazo.modoCalculo).toBe("AUTOMATICO");
    expect(prazo.dataFinalEfetiva).toEqual(prazo.dataFinalCalculada);
    expect((prazo.memoriaCalculo as { tipo: string }).tipo).toBe("automatica");
    expect(prazo.conferidoEm).toBeNull();
  });

  it("pendência de regra exige data manual (D11); justificativa é facultativa", async () => {
    const p = await novoProcesso();
    // Dias corridos (não criminal) vencendo num sábado: sem regra automática (B3).
    // Disp. qua 21/10 → publ. qui 22/10 → início sex 23/10; 2 dias corridos → sáb 24/10.
    const entrada = { ...prazoBase(advogado.id), tipoContagem: "CORRIDOS", quantidadeDias: "2" };
    await expect(criarPrazo(advogado, p.id, entrada, prisma)).rejects.toThrow(/\(B3\).*Informe a data final manualmente/);
    const prazo = await criarPrazo(advogado, p.id, { ...entrada, dataFinalManual: "2027-01-27" }, prisma);
    expect(prazo).toMatchObject({ modoCalculo: "MANUAL", pendenciaRegra: "B3", justificativaManual: null, dataFinalCalculada: null });
    expect(prazo.dataFinalEfetiva.toISOString().slice(0, 10)).toBe("2027-01-27");
    expect((prazo.memoriaCalculo as { tipo: string }).tipo).toBe("manual");
  });

  it("data manual é recusada quando o sistema calcula", async () => {
    const p = await novoProcesso();
    await expect(criarPrazo(advogado, p.id, { ...prazoBase(advogado.id), dataFinalManual: "2026-11-30" }, prisma)).rejects.toThrow(
      /calculou este prazo/,
    );
  });

  it("outras formas: data de intimação informada (B9)", async () => {
    const p = await novoProcesso();
    const prazo = await criarPrazo(
      advogado,
      p.id,
      { ...prazoBase(advogado.id), formaIntimacao: "DATA_INFORMADA", formaIntimacaoDetalhe: "oficial de justiça", dataReferencia: "2026-10-26" },
      prisma,
    );
    expect(prazo.dataIntimacao?.toISOString().slice(0, 10)).toBe("2026-10-26");
  });

  it("assistente não cria prazo, mas marca como cumprido (D9)", async () => {
    const p = await novoProcesso();
    await expect(criarPrazo(assistente, p.id, prazoBase(advogado.id), prisma)).rejects.toThrowError(ProibidoError);
    const prazo = await criarPrazo(advogado, p.id, prazoBase(advogado.id), prisma);
    const r = await cumprirPrazo(assistente, prazo.id, { cumpridoEm: "2026-10-27" }, prisma);
    expect(r.situacao).toBe("CUMPRIDO");
  });

  it("responsável sem acesso ao processo é recusado (D4)", async () => {
    const segredo = await novoProcesso({ segredoJustica: "on" });
    await expect(criarPrazo(advogado, segredo.id, prazoBase(assistente.id), prisma)).rejects.toThrow(/não tem acesso/);
    await expect(criarPrazo(advogado, segredo.id, prazoBase(restrito.id), prisma)).rejects.toThrow(/não tem acesso/);
  });

  it("só o responsável pelo prazo confere, qualquer que seja o perfil (D16)", async () => {
    const p = await novoProcesso();
    const prazo = await criarPrazo(advogado, p.id, prazoBase(assistente.id), prisma);
    await expect(conferirPrazo(advogado, prazo.id, prisma)).rejects.toThrow(/Somente o responsável/);
    await expect(conferirPrazo(admin, prazo.id, prisma)).rejects.toThrow(/Somente o responsável/);
    const r = await conferirPrazo(assistente, prazo.id, prisma);
    expect(r.conferidoPorId).toBe(assistente.id);
  });

  it("ajuste exige justificativa, só advogado/administrador, prevalece e desfaz a conferência (D17)", async () => {
    const p = await novoProcesso();
    const prazo = await criarPrazo(advogado, p.id, prazoBase(advogado.id), prisma);
    await conferirPrazo(advogado, prazo.id, prisma);
    await expect(ajustarPrazo(assistente, prazo.id, { dataFinalAjustada: "2026-11-20", justificativaAjuste: "x" }, prisma)).rejects.toThrowError(ProibidoError);
    await expect(ajustarPrazo(advogado, prazo.id, { dataFinalAjustada: "2026-11-20", justificativaAjuste: "" }, prisma)).rejects.toThrow(/justificativa/);
    const r = await ajustarPrazo(advogado, prazo.id, { dataFinalAjustada: "2026-11-25", justificativaAjuste: "Suspensão fictícia" }, prisma);
    expect(r.dataFinalEfetiva.toISOString().slice(0, 10)).toBe("2026-11-25");
    expect(r.conferidoEm).toBeNull();
  });

  it("banco recusa data ajustada sem justificativa, mesmo fora do serviço", async () => {
    const p = await novoProcesso();
    const prazo = await criarPrazo(advogado, p.id, prazoBase(advogado.id), prisma);
    await expect(
      comUsuario(admin.id, (tx) => tx.prazo.update({ where: { id: prazo.id }, data: { dataFinalAjustada: new Date("2026-12-01"), dataFinalEfetiva: new Date("2026-12-01") } }), prisma),
    ).rejects.toThrow(/prazo_ajuste_justificado/);
  });

  it("vencido não vira perdido sozinho; perdido é marcado manualmente (D13)", async () => {
    const p = await novoProcesso();
    const prazo = await criarPrazo(advogado, p.id, { ...prazoBase(advogado.id), dataReferencia: "2026-09-01" }, prisma);
    expect(prazo.situacao).toBe("ABERTO");
    expect((await alterarSituacaoPrazo(advogado, prazo.id, "PERDIDO", prisma)).situacao).toBe("PERDIDO");
    await expect(cumprirPrazo(advogado, prazo.id, { cumpridoEm: "2026-09-10" }, prisma)).rejects.toThrow(/não está aberto/);
    expect((await alterarSituacaoPrazo(advogado, prazo.id, "ABERTO", prisma)).situacao).toBe("ABERTO");
  });
});

describe("andamento com prazo no mesmo formulário (fluxo principal)", () => {
  it("grava os dois juntos, ligados", async () => {
    const p = await novoProcesso();
    const r = await criarAndamento(
      advogado,
      p.id,
      { data: "2026-10-21", tipoId: ids.tipoAndamento, descricao: "Intimação fictícia para manifestação" },
      prazoBase(advogado.id),
      prisma,
    );
    expect(r.prazo?.andamentoId).toBe(r.andamento.id);
  });

  it("se o prazo falha, o andamento também não é gravado", async () => {
    const p = await novoProcesso();
    await expect(
      criarAndamento(advogado, p.id, { data: "2026-10-21", tipoId: ids.tipoAndamento, descricao: "Não deve ficar" }, { ...prazoBase(advogado.id), tipoContagem: "CORRIDOS", quantidadeDias: "2" }, prisma),
    ).rejects.toThrowError(RegraDeNegocioError);
    expect(await prisma.andamento.count({ where: { processoId: p.id } })).toBe(0);
  });

  it("assistente registra andamento, mas não com prazo", async () => {
    const p = await novoProcesso();
    await expect(
      criarAndamento(assistente, p.id, { data: "2026-10-21", tipoId: ids.tipoAndamento, descricao: "Juntada fictícia" }, undefined, prisma),
    ).resolves.toBeTruthy();
    await expect(
      criarAndamento(assistente, p.id, { data: "2026-10-21", tipoId: ids.tipoAndamento, descricao: "x" }, prazoBase(advogado.id), prisma),
    ).rejects.toThrowError(ProibidoError);
  });
});

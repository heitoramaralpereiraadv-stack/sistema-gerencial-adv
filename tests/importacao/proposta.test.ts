// Importação da planilha (seção 8.1) com planilha fictícia no formato real.

import { beforeAll, describe, expect, it } from "vitest";
import { lerPlanilha, PlanilhaInvalidaError, type LinhasPlanilha } from "@/importacao/planilha";
import { conciliacao, decisoesVazias, montarProposta, type Decisoes, type Proposta } from "@/importacao/proposta";
import { cidadeDoJuizo, chaveEquivalencia, grauDoJuizo, papeis, sugerirSeparacao } from "@/importacao/regras";
import { AJUSTES_FICTICIOS, planilhaFicticia } from "../apoio/planilha-ficticia";

let linhas: LinhasPlanilha;
beforeAll(async () => {
  linhas = await lerPlanilha(await planilhaFicticia());
});

const revisadas = (extra: Partial<Decisoes> = {}): Decisoes => ({
  ...decisoesVazias(), responsaveis: { Silas: "usuario-ficticio" }, revisadoEm: "2026-11-04", ...extra,
});
const proc = (p: Proposta, codigo: string) => p.processos.find((x) => x.codigoLegado === codigo)!;
const pessoa = (p: Proposta, chave: string) => p.pessoas.find((x) => x.chave === chave)!;
const nomesDasPartes = (p: Proposta, codigo: string) =>
  proc(p, codigo).partes.map((pa) => [pessoa(p, pa.pessoa).nome, pa.polo, pa.qualificacoes.join("+"), pa.ehCliente]);

describe("leitura da planilha", () => {
  it("lê clientes e processos e ignora as colunas com fórmula", () => {
    expect(linhas.clientes).toHaveLength(5);
    expect(linhas.processos).toHaveLength(10);
    expect(linhas.processos[0]).toMatchObject({ codigo: "P001", numero: "0009001-19.2026.8.09.0051", responsavel: "Silas" });
  });

  it("recusa arquivo que não é a planilha esperada", async () => {
    await expect(lerPlanilha(Buffer.from("não é xlsx"))).rejects.toThrowError(PlanilhaInvalidaError);
  });
});

describe("regras", () => {
  it.each([
    ["5ª UPJ Varas Cíveis – Goiânia/GO", "Goiânia", "GO"],
    ["JEC – Aparecida de Goiânia/GO", "Aparecida de Goiânia", "GO"],
    ["Comarca de Rialma/GO", "Rialma", "GO"],
    ["3ª Vara do Trabalho – Uberlândia/MG", "Uberlândia", "MG"],
    ["Dourados/MS (conferir vara)", "Dourados", "MS"],
    ["24ª Vara Cível (2ª UPJ) – Goiânia/GO", "Goiânia", "GO"],
  ])("cidade do juízo: %s", (juizo, cidade, uf) => expect(cidadeDoJuizo(juizo)).toEqual({ cidade, uf }));

  it.each([["Turma Recursal – GO"], ["10ª Câmara Cível – TJGO"], ["Vara de Família"]])("sem cidade: %s", (j) =>
    expect(cidadeDoJuizo(j)).toBeNull(),
  );

  it("grau só quando explícito", () => {
    expect(grauDoJuizo("2ª Câmara Cível – TJGO", "TJGO")).toBe("SEGUNDO");
    expect(grauDoJuizo("TJGO", "TJGO")).toBe("SEGUNDO");
    expect(grauDoJuizo("Turma Recursal – GO", "TJGO")).toBe("RECURSAL");
    expect(grauDoJuizo("1º JEC – Rio Verde/GO", "TJGO")).toBe("PRIMEIRO");
    expect(grauDoJuizo("Goiânia/GO", "TJGO")).toBeNull();
  });

  it("C2: bancos ligados por '/' são o mesmo réu; demais compostos, separar", () => {
    expect(sugerirSeparacao("Banco Santander / Olé Consignado")).toMatchObject({ separar: false });
    expect(sugerirSeparacao("INSS e Banco Bradesco")).toMatchObject({ partes: ["INSS", "Banco Bradesco"], separar: true });
    expect(sugerirSeparacao("Banco Bradesco S.A.")).toBeNull();
    // Uma instituição só, com "e" no nome.
    expect(sugerirSeparacao("BRB Crédito, Financiamento e Investimento S.A.")).toMatchObject({ separar: false });
    // Mesmo nome com grafias diferentes; "Ind. e Com." não separa.
    expect(sugerirSeparacao("Inovvar / Innovar Ind. e Com. de Madeiras")).toEqual({
      partes: ["Inovvar", "Innovar Ind. e Com. de Madeiras"], separar: false,
    });
    // Pedaço de uma palavra só não vira parte; o caso vai à revisão sem sugestão de separar.
    expect(sugerirSeparacao("Produtos Fictícios e Ana e Bia")).toMatchObject({ separar: false });
    expect(sugerirSeparacao("Fulana Fictícia Aires e Hospital Fictício Vila Nova")).toEqual({
      partes: ["Fulana Fictícia Aires", "Hospital Fictício Vila Nova"], separar: true,
    });
    // Nomes diferentes ligados por "/": separar.
    expect(sugerirSeparacao("Argoficticia / Shopping Fictício Plaza")).toMatchObject({ separar: true });
  });

  it("nomes equivalentes de instituições têm a mesma chave", () => {
    expect(chaveEquivalencia("Banco Inbursa S.A.")).toBe(chaveEquivalencia("Inbursa"));
    expect(chaveEquivalencia("Banco Santander / Olé Consignado")).toBe(chaveEquivalencia("Banco Olé Consignado / Santander"));
    expect(chaveEquivalencia("Masterfix Transportes")).not.toBe(chaveEquivalencia("Banco Master S.A."));
  });

  it("polo: com o do cliente, a contraparte fica no oposto; em recurso contra banco, banco é requerido (C2)", () => {
    expect(papeis("Executado (avalista)", true)).toMatchObject({
      cliente: { polo: "PASSIVO", qualificacoes: ["Executado", "Avalista"] },
      contraparte: { polo: "ATIVO", qualificacoes: ["Exequente"] },
    });
    expect(papeis("Recorrente", true)).toMatchObject({
      cliente: { polo: "ATIVO", qualificacoes: ["Recorrente"] },
      contraparte: { polo: "PASSIVO", qualificacoes: ["Recorrido"] },
      pendencia: null,
    });
    expect(papeis("[confirmar]", false).pendencia).toMatch(/a confirmar/);
  });
});

describe("proposta", () => {
  it("separa clientes compostos conforme os ajustes (C1) e não cria pessoa para registro removido", () => {
    const p = montarProposta(linhas, AJUSTES_FICTICIOS, revisadas());
    const clientes = p.pessoas.filter((x) => x.ehCliente).map((x) => x.nome);
    expect(clientes).toEqual(["Fulano Teste da Silva", "Ana Teste Completa", "Bruno Teste Completo", "Cliente Duvidoso", "Mayra Exemplo e Silva"]);
    expect(pessoa(p, "C003").pendencias).toContain("Registro marcado [confirmar] na planilha");
    expect(p.alertas.some((a) => a.includes("Mayra Exemplo e Silva"))).toBe(true);
    expect(nomesDasPartes(p, "P004").slice(0, 2)).toEqual([
      ["Ana Teste Completa", "ATIVO", "Requerente", true],
      ["Bruno Teste Completo", "ATIVO", "Requerente", true],
    ]);
  });

  it("C2: bancos com '/' viram um réu só; INSS e banco são separados", () => {
    const p = montarProposta(linhas, AJUSTES_FICTICIOS, revisadas());
    expect(nomesDasPartes(p, "P008")).toEqual([
      ["Fulano Teste da Silva", "ATIVO", "Autor", true],
      ["INSS", "PASSIVO", "Réu", false],
      ["Banco Bradesco", "PASSIVO", "Réu", false],
    ]);
    expect(pessoa(p, proc(p, "P008").partes[1]!.pessoa).tipo).toBe("ENTE_PUBLICO");
  });

  it("mescla nomes equivalentes por padrão e respeita a recusa na revisão", () => {
    const p = montarProposta(linhas, AJUSTES_FICTICIOS, revisadas());
    const inbursa = p.mesclagens.find((m) => m.id.includes("inbursa"))!;
    expect(inbursa).toMatchObject({ aceita: true, nomeFinal: "Banco Inbursa S.A." });
    expect(proc(p, "P007").partes[1]!.pessoa).toBe(proc(p, "P009").partes[1]!.pessoa);

    const recusada = montarProposta(linhas, AJUSTES_FICTICIOS, revisadas({ mesclagens: { [inbursa.id]: { aceita: false } } }));
    expect(proc(recusada, "P007").partes[1]!.pessoa).not.toBe(proc(recusada, "P009").partes[1]!.pessoa);

    const renomeada = montarProposta(linhas, AJUSTES_FICTICIOS, revisadas({ mesclagens: { [inbursa.id]: { aceita: true, nome: "Banco Inbursa S/A" } } }));
    expect(pessoa(renomeada, proc(renomeada, "P009").partes[1]!.pessoa).nome).toBe("Banco Inbursa S/A");
  });

  it("nomes corrigidos na revisão substituem a sugestão", () => {
    const id = "inss e banco bradesco";
    const p = montarProposta(linhas, AJUSTES_FICTICIOS, revisadas({ partesSeparadas: { [id]: ["INSS", "Banco Bradesco S.A."] } }));
    expect(nomesDasPartes(p, "P008").map((x) => x[0])).toEqual(["Fulano Teste da Silva", "INSS", "Banco Bradesco S.A."]);
  });

  it("nome listado em naoMesclar deixa o grupo desmarcado por padrão", () => {
    const p = montarProposta(linhas, { ...AJUSTES_FICTICIOS, naoMesclar: ["Inbursa"] }, revisadas());
    expect(p.mesclagens.find((m) => m.id.includes("inbursa"))?.aceita).toBe(false);
  });

  it("separação recusada na revisão mantém o nome inteiro", () => {
    const id = "inss e banco bradesco";
    const p = montarProposta(linhas, AJUSTES_FICTICIOS, revisadas({ separacoes: { [id]: false } }));
    expect(nomesDasPartes(p, "P008").map((x) => x[0])).toEqual(["Fulano Teste da Silva", "INSS e Banco Bradesco"]);
  });

  it("C3 e C4: parte a completar, processo relacionado com os mesmos clientes e número incompleto como pendência", () => {
    const p = montarProposta(linhas, AJUSTES_FICTICIOS, revisadas());
    expect(pessoa(p, proc(p, "P003").partes[1]!.pessoa).pendencias).toContain("Parte a identificar");
    expect(nomesDasPartes(p, "P004")[2]).toEqual(["Fulana (curatelanda — nome a completar)", "OUTRO", "", false]);
    const rel = proc(p, "P004-R1");
    expect(rel).toMatchObject({ numeroCnj: "0009004-71.2026.8.09.0051", comarca: { nome: "Goiânia", uf: "GO" } });
    expect(rel.partes.map((x) => pessoa(p, x.pessoa).nome)).toEqual(["Ana Teste Completa", "Bruno Teste Completo"]);
    expect(p.vinculos).toContainEqual({ origem: "P004", destino: "P004-R1" });
    expect(proc(p, "P004").pendencias).toContain("Número incompleto nas observações: 5062943-75.2026");
  });

  it("C7: comarca vem do número (inclusive para Turma Recursal); sem número, a informar", () => {
    const p = montarProposta(linhas, AJUSTES_FICTICIOS, revisadas());
    expect(proc(p, "P007")).toMatchObject({ comarca: { nome: "Goiânia", uf: "GO", codigoOrigem: "0051" }, grau: "RECURSAL", tribunalCodigo: "8.09" });
    expect(proc(p, "P003").comarca).toBeNull();
    expect(proc(p, "P003").pendencias).toContain("Sem número: juízo e comarca a informar");
    expect(proc(p, "P005").pendencias).toContain('Juízo a conferir (planilha: "conferir")');
  });

  it("C5 e C6: repropositura e sobrestamento com motivo vindo da fase", () => {
    const p = montarProposta(linhas, AJUSTES_FICTICIOS, revisadas());
    expect(proc(p, "P009")).toMatchObject({ status: "Sobrestado", motivoSuspensao: "Tema 1414/STJ" });
    expect(proc(p, "P009").pendencias).toEqual(expect.arrayContaining(["Repropositura: informar a ação original (C5)", "Data do sobrestamento a informar"]));
  });

  it("ajuste de processo substitui as partes (escritório depositário, fictício)", () => {
    const p = montarProposta(linhas, AJUSTES_FICTICIOS, revisadas());
    expect(nomesDasPartes(p, "P010")).toEqual([
      ["Fulano Teste da Silva", "ATIVO", "Exequente", true],
      ["Escritório Fictício Sociedade de Advogados", "TERCEIRO", "Depositário", false],
    ]);
  });

  it("não deixa gravar sem revisão e sem mapear os responsáveis", () => {
    const p = montarProposta(linhas, AJUSTES_FICTICIOS, decisoesVazias());
    expect(p.erros).toEqual(expect.arrayContaining([
      'Escolha o usuário que corresponde ao responsável "Silas" da planilha.',
      "Revise as separações e mesclagens e salve a revisão antes de gravar.",
    ]));
    expect(montarProposta(linhas, AJUSTES_FICTICIOS, revisadas()).erros).toEqual([]);
  });

  it("conciliação: os totais de processos, status e áreas batem com a planilha (A2)", () => {
    const p = montarProposta(linhas, AJUSTES_FICTICIOS, revisadas());
    const c = conciliacao(linhas, p);
    expect(c.sistema.processos).toBe(c.planilha.processos);
    expect(c.sistema.semNumero).toBe(c.planilha.semNumero);
    expect(c.sistema.porStatus).toEqual(c.planilha.porStatus);
    expect(c.sistema.porArea).toEqual(c.planilha.porArea);
    expect(c.sistema.relacionados).toBe(1);
  });
});

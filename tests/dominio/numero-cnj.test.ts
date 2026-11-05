// Números fictícios; dígitos verificadores calculados à parte (módulo 97, Res. CNJ 65/2008).
import { describe, expect, it } from "vitest";
import { validarNumeroCnj } from "@/dominio/cnj/numero-cnj";

function valido(entrada: string) {
  const r = validarNumeroCnj(entrada);
  if (!r.valido) throw new Error(`esperava válido: ${entrada} (${r.erro})`);
  return r.numero;
}

describe("número CNJ — critério: válido preenche ano, segmento e tribunal", () => {
  it.each([
    ["0000001-92.2026.8.09.0051", 2026, "8", "Justiça Estadual", "TJGO", "0051"],
    ["1234567-72.2025.8.12.0001", 2025, "8", "Justiça Estadual", "TJMS", "0001"],
    ["7654321-29.2024.8.27.2722", 2024, "8", "Justiça Estadual", "TJTO", "2722"],
    ["0000100-70.2026.5.18.0016", 2026, "5", "Justiça do Trabalho", "TRT-18", "0016"],
    ["0012345-97.2025.5.03.0103", 2025, "5", "Justiça do Trabalho", "TRT-3", "0103"],
    ["1000000-80.2026.4.01.3500", 2026, "4", "Justiça Federal", "TRF-1", "3500"],
  ])("%s", (entrada, ano, segmento, nomeSegmento, sigla, origem) => {
    const n = valido(entrada);
    expect(n.formatado).toBe(entrada);
    expect(n.ano).toBe(ano);
    expect(n.segmento).toBe(segmento);
    expect(n.nomeSegmento).toBe(nomeSegmento);
    expect(n.tribunal?.sigla).toBe(sigla);
    expect(n.origem).toBe(origem);
  });

  it("aceita sem pontuação e grava formatado", () => {
    expect(valido("00000019220268090051").formatado).toBe("0000001-92.2026.8.09.0051");
  });

  it("ignora espaços nas pontas", () => {
    expect(valido("  0000001-92.2026.8.09.0051 ").formatado).toBe("0000001-92.2026.8.09.0051");
  });

  it("número válido de tribunal fora da tabela é aceito sem tribunal preenchido", () => {
    const n = valido("0000003-33.2026.8.30.0001");
    expect(n.tribunal).toBeNull();
    expect(n.codigoTribunal).toBe("8.30");
  });

  it("segmento fora da tabela (3 = STJ) é aceito sem nome de segmento", () => {
    const n = valido("0000002-05.2026.3.00.0000");
    expect(n.nomeSegmento).toBeNull();
  });
});

describe("número CNJ — critério: inválido é recusado", () => {
  it.each([
    ["dígito verificador errado", "0000001-93.2026.8.09.0051"],
    ["dígito errado sem pontuação", "00000019320268090051"],
    ["sequencial trocado", "0000010-92.2026.8.09.0051"],
    ["ano trocado", "0000001-92.2025.8.09.0051"],
    ["origem trocada", "0000001-92.2026.8.09.0052"],
    ["número incompleto (como nas observações da planilha)", "0000001-92.2026"],
    ["dígitos a menos", "0000001922026809005"],
    ["dígitos a mais", "000000192202680900510"],
    ["pontuação fora do padrão", "0000001-92.2026.809.0051"],
    ["letras", "0000001-92.2026.8.O9.0051"],
    ["vazio", ""],
  ])("%s", (_caso, entrada) => {
    const r = validarNumeroCnj(entrada);
    expect(r.valido).toBe(false);
  });

  it("explica o motivo da recusa", () => {
    const r = validarNumeroCnj("0000001-93.2026.8.09.0051");
    expect(r).toEqual({ valido: false, erro: expect.stringContaining("Dígito verificador") });
  });
});

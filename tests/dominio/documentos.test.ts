// Documentos fictícios; dígitos calculados à parte. 12ABC34501DE35 é o exemplo publicado
// pela Receita Federal para o CNPJ alfanumérico.
import { describe, expect, it } from "vitest";
import { validarCnpj, validarCpf, validarCpfCnpj } from "@/dominio/documentos/cpf-cnpj";

describe("CPF", () => {
  it.each(["123.456.789-09", "12345678909", "000.000.001-91"])("válido: %s", (c) => {
    expect(validarCpf(c)).toMatchObject({ valido: true, tipo: "CPF" });
  });
  it("formata", () => {
    expect(validarCpf("12345678909")).toMatchObject({ formatado: "123.456.789-09", normalizado: "12345678909" });
  });
  it.each(["123.456.789-00", "111.111.111-11", "1234567890", ""])("inválido: %j", (c) => {
    expect(validarCpf(c).valido).toBe(false);
  });
});

describe("CNPJ", () => {
  it.each(["11.222.333/0001-81", "11222333000181", "12.ABC.345/01DE-35", "12abc34501de35", "ABCDEFGH000195"])(
    "válido: %s",
    (c) => expect(validarCnpj(c)).toMatchObject({ valido: true, tipo: "CNPJ" }),
  );
  it("formata o alfanumérico em maiúsculas", () => {
    expect(validarCnpj("12abc34501de35")).toMatchObject({ formatado: "12.ABC.345/01DE-35" });
  });
  it.each(["11.222.333/0001-82", "12.ABC.345/01DE-36", "00.000.000/0000-00", "12.ABC.345/01DE-3A"])("inválido: %s", (c) => {
    expect(validarCnpj(c).valido).toBe(false);
  });
});

it("CPF ou CNPJ pelo tamanho", () => {
  expect(validarCpfCnpj("123.456.789-09")).toMatchObject({ tipo: "CPF" });
  expect(validarCpfCnpj("11.222.333/0001-81")).toMatchObject({ tipo: "CNPJ" });
});

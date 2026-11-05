import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { cifrar, decifrar, indiceBusca, mascarar } from "@/servidor/cripto/cifra";

beforeAll(() => {
  process.env.CHAVE_CIFRAGEM = randomBytes(32).toString("base64");
  process.env.CHAVE_INDICE = randomBytes(32).toString("base64");
});

describe("cifragem de dados críticos", () => {
  it("cifra e decifra", () => {
    const c = cifrar("123.456.789-09");
    expect(c.startsWith("v1.")).toBe(true);
    expect(c).not.toContain("123");
    expect(decifrar(c)).toBe("123.456.789-09");
  });

  it("o mesmo valor gera cifras diferentes", () => {
    expect(cifrar("x")).not.toBe(cifrar("x"));
  });

  it("dado adulterado é recusado", () => {
    const c = cifrar("dado reservado");
    const adulterado = c.slice(0, -2) + (c.endsWith("A") ? "BB" : "AA");
    expect(() => decifrar(adulterado)).toThrow();
  });

  it("índice de busca é estável e não revela o valor", () => {
    expect(indiceBusca("12345678909")).toBe(indiceBusca("12345678909"));
    expect(indiceBusca("12345678909")).not.toBe(indiceBusca("12345678900"));
    expect(indiceBusca("12345678909")).not.toContain("12345678909");
  });

  it("sem chave configurada, falha em vez de gravar em claro", () => {
    const guardada = process.env.CHAVE_CIFRAGEM;
    delete process.env.CHAVE_CIFRAGEM;
    expect(() => cifrar("x")).toThrow(/CHAVE_CIFRAGEM/);
    process.env.CHAVE_CIFRAGEM = guardada;
  });

  it("máscara mostra só o final", () => {
    expect(mascarar("123.456.789-09")).toBe("•••.•••.•89-09");
  });
});

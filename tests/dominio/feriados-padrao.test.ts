import { describe, expect, it } from "vitest";
import { feriadosPadrao, pascoa } from "@/dominio/prazos/feriados-padrao";

describe("feriados definidos pelos sócios (B11)", () => {
  it.each([
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2028, "2028-04-16"],
  ])("Páscoa de %i", (ano, data) => expect(pascoa(ano)).toBe(data));

  it("2026: nove nacionais fixos, Carnaval, Sexta-feira Santa e dois de Goiânia", () => {
    const f = feriadosPadrao(2026);
    expect(f.filter((x) => x.abrangencia === "NACIONAL" && x.natureza === "FERIADO").map((x) => x.data).sort()).toEqual([
      "2026-01-01", "2026-02-16", "2026-02-17", "2026-04-03", "2026-04-21", "2026-05-01", "2026-09-07",
      "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25",
    ]);
    const goiania = f.filter((x) => x.abrangencia === "MUNICIPAL");
    expect(goiania.map((x) => x.data)).toEqual(["2026-05-24", "2026-10-24"]);
    expect(goiania.every((x) => x.comarca?.nome === "Goiânia" && x.comarca.uf === "GO")).toBe(true);
  });

  it("Quarta-feira de Cinzas é expediente reduzido, não feriado (B13)", () => {
    expect(feriadosPadrao(2027).filter((x) => x.natureza === "EXPEDIENTE_REDUZIDO")).toEqual([
      expect.objectContaining({ data: "2027-02-10", descricao: "Quarta-feira de Cinzas" }),
    ]);
  });

  it("Sexta-feira Santa de 2027 é 26/03", () => {
    expect(feriadosPadrao(2027).find((x) => x.descricao.includes("Semana Santa"))?.data).toBe("2027-03-26");
  });
});

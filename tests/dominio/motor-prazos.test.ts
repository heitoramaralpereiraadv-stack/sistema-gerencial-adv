import { describe, expect, it } from "vitest";
import { Calendario, feriadosAplicaveis } from "@/dominio/prazos/calendario";
import {
  calcularPrazo,
  EntradaInvalida,
  memoriaEmTexto,
  PendenciaDeRegra,
  VERSAO_MOTOR,
  type EntradaPrazo,
} from "@/dominio/prazos/motor";
import { CASOS, FERIADOS_TESTE, LOCAL_TESTE } from "./casos-prazo";

const calendario = new Calendario(feriadosAplicaveis(FERIADOS_TESTE, LOCAL_TESTE));

describe("feriados aplicáveis ao processo (regra 6)", () => {
  const aplicaveis = feriadosAplicaveis(FERIADOS_TESTE, LOCAL_TESTE).map((f) => f.data);

  it("inclui nacionais, estaduais da UF, municipais da comarca e forenses do tribunal", () => {
    expect(aplicaveis).toEqual(
      expect.arrayContaining(["2026-04-03", "2026-11-13", "2026-03-19", "2026-11-16", "2026-03-10"]),
    );
  });

  it("exclui feriados de outra comarca, outra UF e outro tribunal", () => {
    expect(aplicaveis).not.toContain("2026-03-24");
    expect(aplicaveis).not.toContain("2026-03-25");
    expect(aplicaveis).not.toContain("2026-03-26");
  });

  it("Justiça Federal: só nacionais e registros do próprio tribunal (B8)", () => {
    const federal = feriadosAplicaveis(FERIADOS_TESTE, { ...LOCAL_TESTE, segmento: "4", tribunalCodigo: "4.01" }).map((f) => f.data);
    expect(federal).toContain("2026-04-03");
    expect(federal).not.toContain("2026-03-19"); // municipal
    expect(federal).not.toContain("2026-11-13"); // estadual
    expect(federal).not.toContain("2026-03-10"); // forense de outro tribunal
  });

  it("Justiça do Trabalho: todos os locais (B8)", () => {
    const trabalho = feriadosAplicaveis(FERIADOS_TESTE, { ...LOCAL_TESTE, segmento: "5" }).map((f) => f.data);
    expect(trabalho).toEqual(expect.arrayContaining(["2026-03-19", "2026-11-13"]));
  });

  it("feriado forense de comarca específica só vale naquela comarca", () => {
    const f = [{ data: "2026-05-04", abrangencia: "FORENSE" as const, natureza: "FERIADO" as const, tribunalCodigo: "8.09", comarcaId: "comarca-b", descricao: "x" }];
    expect(feriadosAplicaveis(f, LOCAL_TESTE)).toHaveLength(0);
    expect(feriadosAplicaveis(f, { ...LOCAL_TESTE, comarcaId: "comarca-b" })).toHaveLength(1);
  });
});

describe(`motor de prazos — ${CASOS.length} casos com contagem manual`, () => {
  it.each(CASOS.map((c) => [`${c.id} ${c.titulo}`, c] as const))("%s", (_nome, caso) => {
    const esperado = caso.esperado;
    if ("pendencia" in esperado) {
      expect(() => calcularPrazo(caso.entrada, calendario)).toThrowError(PendenciaDeRegra);
      try {
        calcularPrazo(caso.entrada, calendario);
      } catch (e) {
        expect((e as PendenciaDeRegra).codigo).toBe(esperado.pendencia);
      }
      return;
    }
    const r = calcularPrazo(caso.entrada, calendario);
    expect(r.dataIntimacao).toBe(esperado.dataIntimacao);
    expect(r.dataInicio).toBe(esperado.dataInicio);
    expect(r.dataFinal).toBe(esperado.dataFinal);
    expect(r.memoria.diasExcluidos.map((d) => d.data)).toEqual(esperado.excluidos);
  });

  it("cobre recesso, feriado municipal, intimação pelo portal e prazo em dobro", () => {
    const titulos = CASOS.map((c) => c.titulo.toLowerCase()).join(" | ");
    expect(titulos).toContain("recesso");
    expect(titulos).toContain("municipal");
    expect(titulos).toContain("portal");
    expect(titulos).toContain("dobro");
    expect(CASOS.filter((c) => !("pendencia" in c.esperado)).length).toBeGreaterThanOrEqual(20);
  });
});

describe("memória de cálculo (regra 9)", () => {
  const r = calcularPrazo(CASOS[0]!.entrada, calendario);

  it("traz data de início, cada dia excluído com motivo e a data final", () => {
    expect(r.memoria.dataInicio).toBe("2026-03-04");
    expect(r.memoria.dataFinal).toBe("2026-03-11");
    expect(r.memoria.diasExcluidos).toEqual([
      { data: "2026-03-07", fase: "contagem", motivos: ["Sábado"] },
      { data: "2026-03-08", fase: "contagem", motivos: ["Domingo"] },
      { data: "2026-03-10", fase: "contagem", motivos: ["Indisponibilidade do sistema: sistema fora do ar (fictício)"] },
    ]);
    expect(r.memoria.versaoMotor).toBe(VERSAO_MOTOR);
  });

  it("dia com mais de um motivo lista todos", () => {
    const recesso = calcularPrazo(CASOS.find((c) => c.id === "13")!.entrada, calendario);
    const dia20 = recesso.memoria.diasExcluidos.find((d) => d.data === "2026-12-20");
    expect(dia20?.motivos).toEqual(["Domingo", "Recesso de 20/12 a 20/01 (CPC, art. 220)"]);
  });

  it("em texto, cita o fundamento de cada passo", () => {
    const texto = memoriaEmTexto(r.memoria).join("\n");
    expect(texto).toContain("Disponibilização no Diário de Justiça eletrônico: 02/03/2026 (segunda-feira)");
    expect(texto).toContain("Lei 11.419/2006, art. 4º, §3º");
    expect(texto).toContain("CPC, art. 224");
    expect(texto).toContain("10/03/2026 (terça-feira) (durante a contagem): Indisponibilidade do sistema");
    expect(texto).toContain("Data final: 11/03/2026 (quarta-feira)");
    expect(texto).toContain("exige conferência do advogado");
  });

  it("prazo em dobro aparece na memória", () => {
    const dobro = calcularPrazo(CASOS.find((c) => c.id === "06")!.entrada, calendario);
    expect(memoriaEmTexto(dobro.memoria).join("\n")).toContain("Prazo em dobro marcado pelo usuário: 5 × 2 = 10 dias úteis");
  });

  it("pendência explica o motivo e manda contar manualmente", () => {
    expect(() => calcularPrazo(CASOS.find((c) => c.id === "24")!.entrada, calendario)).toThrowError(
      /vencimento cai em dia sem expediente.*\(B3\); conte este prazo manualmente/,
    );
  });

  it("10º dia não útil no portal: memória registra o recuo ao dia útil anterior (B4)", () => {
    const r = calcularPrazo(CASOS.find((c) => c.id === "22")!.entrada, calendario);
    expect(memoriaEmTexto(r.memoria).join("\n")).toContain("considera-se a intimação no dia útil anterior: 02/04/2026");
  });
});

describe("entrada inválida", () => {
  const base: EntradaPrazo = { formaIntimacao: "DJE", dataReferencia: "2026-03-02", quantidadeDias: 5, tipoContagem: "UTEIS", emDobro: false };

  it.each([0, -1, 2.5])("quantidade de dias %s é recusada", (q) => {
    expect(() => calcularPrazo({ ...base, quantidadeDias: q }, calendario)).toThrowError(EntradaInvalida);
  });

  it.each(["2026-02-30", "02/03/2026", ""])("data %j é recusada", (d) => {
    expect(() => calcularPrazo({ ...base, dataReferencia: d }, calendario)).toThrowError(EntradaInvalida);
  });
});

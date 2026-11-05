// Gera docs/casos-de-prazo.md a partir dos casos de teste, para conferência pelos advogados.
// As datas esperadas vêm da contagem manual do arquivo de casos; o motor só confirma.
import { writeFileSync } from "node:fs";
import { Calendario, feriadosAplicaveis } from "../src/dominio/prazos/calendario";
import { formatarData, formatarDataComDia } from "../src/dominio/prazos/data-civil";
import { calcularPrazo, PendenciaDeRegra } from "../src/dominio/prazos/motor";
import { CASOS, FERIADOS_TESTE, LOCAL_TESTE } from "../tests/dominio/casos-prazo";

const cal = new Calendario(feriadosAplicaveis(FERIADOS_TESTE, LOCAL_TESTE));
const FORMA = { DJE: "DJe", PORTAL_CONSULTA: "Portal (consulta)", PORTAL_TACITA: "Portal (sem consulta)", DATA_INFORMADA: "Data informada" };
const linhas = [
  "# Casos de teste do motor de prazos",
  "",
  "Calendário fictício. Processo de teste: comarca A, UF GO, tribunal 8.09. Para cada caso, confira a contagem manual e marque se concorda.",
  "",
  "## Feriados fictícios",
  "",
  "| Data | Abrangência | Descrição | Aplica-se ao processo de teste? |",
  "| --- | --- | --- | --- |",
  ...FERIADOS_TESTE.map((f) =>
    `| ${formatarDataComDia(f.data)} | ${f.abrangencia}${f.natureza === "INDISPONIBILIDADE" ? " (indisponibilidade)" : f.natureza === "EXPEDIENTE_REDUZIDO" ? " (expediente reduzido)" : ""} | ${f.descricao} | ${feriadosAplicaveis([f], LOCAL_TESTE).length ? "sim" : "não"} |`),
  "",
  "Recesso: 20/12 a 20/01, inclusive (CPC, art. 220).",
  "",
  "## Casos",
  "",
  "| # | Caso | Entrada | Contagem manual | Esperado | Motor | Confere? |",
  "| --- | --- | --- | --- | --- | --- | --- |",
];
for (const c of CASOS) {
  const e = c.entrada;
  const entrada = `${FORMA[e.formaIntimacao]}, ref. ${formatarData(e.dataReferencia)}, ${e.quantidadeDias} ${e.tipoContagem === "UTEIS" ? "úteis" : "corridos"}${e.emDobro ? ", em dobro" : ""}`;
  const esp = "pendencia" in c.esperado
    ? `pendência ${c.esperado.pendencia}`
    : `intimação ${formatarData(c.esperado.dataIntimacao)}; início ${formatarData(c.esperado.dataInicio)}; **final ${formatarData(c.esperado.dataFinal)}**`;
  let motor: string;
  try {
    const r = calcularPrazo(e, cal);
    motor = `final ${formatarData(r.dataFinal)}`;
  } catch (err) {
    motor = err instanceof PendenciaDeRegra ? `pendência ${err.codigo}` : `erro: ${(err as Error).message}`;
  }
  linhas.push(`| ${c.id} | ${c.titulo} | ${entrada} | ${c.contagemManual} | ${esp} | ${motor} | ☐ |`);
}
linhas.push("", "Pendências: B1 recesso como dia útil para publicação/início; B2 recesso em dias corridos; B3 início/vencimento em dia não útil na contagem corrida; B4 10º dia do portal em dia não útil; B5 consulta ao portal em dia não útil; B6 expediente reduzido no início ou no meio do prazo; B9 data de intimação informada em dia não útil.", "");
writeFileSync("docs/casos-de-prazo.md", linhas.join("\n"));
console.log(`docs/casos-de-prazo.md: ${CASOS.length} casos`);

// Casos de teste do motor de prazos com contagem manual (critério de aceite 8.2).
// Calendário e feriados FICTÍCIOS, criados só para os testes.
// As datas esperadas foram contadas à mão, dia a dia; não saem do motor.

import type { DiaNaoUtil, LocalProcesso } from "@/dominio/prazos/calendario";
import type { CodigoPendencia, EntradaPrazo } from "@/dominio/prazos/motor";

/** Processo fictício: comarca "A", UF GO, tribunal 8.09. */
export const LOCAL_TESTE: LocalProcesso = { uf: "GO", comarcaId: "comarca-a", tribunalCodigo: "8.09" };

export const FERIADOS_TESTE: DiaNaoUtil[] = [
  { data: "2026-03-10", abrangencia: "FORENSE", natureza: "INDISPONIBILIDADE", tribunalCodigo: "8.09", descricao: "sistema fora do ar (fictício)" },
  { data: "2026-03-19", abrangencia: "MUNICIPAL", natureza: "FERIADO", comarcaId: "comarca-a", descricao: "aniversário fictício da cidade A" },
  { data: "2026-04-03", abrangencia: "NACIONAL", natureza: "FERIADO", descricao: "feriado nacional fictício 1" },
  { data: "2026-04-21", abrangencia: "NACIONAL", natureza: "FERIADO", descricao: "feriado nacional fictício 2" },
  { data: "2026-11-02", abrangencia: "NACIONAL", natureza: "FERIADO", descricao: "feriado nacional fictício 3" },
  { data: "2026-11-13", abrangencia: "ESTADUAL", natureza: "FERIADO", uf: "GO", descricao: "feriado estadual fictício de GO" },
  { data: "2026-11-16", abrangencia: "FORENSE", natureza: "FERIADO", tribunalCodigo: "8.09", descricao: "feriado forense fictício do tribunal 8.09" },
  { data: "2026-11-20", abrangencia: "NACIONAL", natureza: "FERIADO", descricao: "feriado nacional fictício 4" },
  { data: "2027-02-08", abrangencia: "NACIONAL", natureza: "FERIADO", descricao: "feriado nacional fictício 5" },
  { data: "2027-02-09", abrangencia: "NACIONAL", natureza: "FERIADO", descricao: "feriado nacional fictício 6" },
  { data: "2026-05-13", abrangencia: "NACIONAL", natureza: "EXPEDIENTE_REDUZIDO", descricao: "expediente reduzido fictício" },
  // Não se aplicam ao processo de teste:
  { data: "2026-03-24", abrangencia: "MUNICIPAL", natureza: "FERIADO", comarcaId: "comarca-b", descricao: "feriado fictício da cidade B" },
  { data: "2026-03-25", abrangencia: "ESTADUAL", natureza: "FERIADO", uf: "MS", descricao: "feriado estadual fictício de MS" },
  { data: "2026-03-26", abrangencia: "FORENSE", natureza: "FERIADO", tribunalCodigo: "8.12", descricao: "feriado forense fictício do tribunal 8.12" },
];

export interface CasoPrazo {
  id: string;
  titulo: string;
  entrada: EntradaPrazo;
  /** Contagem manual, dia a dia. */
  contagemManual: string;
  esperado:
    | { dataIntimacao: string; dataInicio: string; dataFinal: string; excluidos: string[] }
    | { pendencia: CodigoPendencia };
}

const dje = (dataReferencia: string, quantidadeDias: number, extra: Partial<EntradaPrazo> = {}): EntradaPrazo => ({
  formaIntimacao: "DJE", dataReferencia, quantidadeDias, tipoContagem: "UTEIS", emDobro: false, ...extra,
});

export const CASOS: CasoPrazo[] = [
  {
    id: "01", titulo: "DJe simples com fim de semana e indisponibilidade",
    entrada: dje("2026-03-02", 5),
    contagemManual: "Disp. seg 02/03 → publ. ter 03/03 → início qua 04/03. 04(1) 05(2) 06(3) [07 sáb, 08 dom] 09(4) [10 indisponibilidade] 11(5).",
    esperado: { dataIntimacao: "2026-03-03", dataInicio: "2026-03-04", dataFinal: "2026-03-11", excluidos: ["2026-03-07", "2026-03-08", "2026-03-10"] },
  },
  {
    id: "02", titulo: "Feriado municipal; feriados de outra comarca, UF e tribunal não contam",
    entrada: dje("2026-03-06", 15),
    contagemManual: "Disp. sex 06/03 → [07, 08] → publ. seg 09/03 → [10 indisp.] → início qua 11/03. 11(1) 12(2) 13(3) [14,15] 16(4) 17(5) 18(6) [19 municipal] 20(7) [21,22] 23(8) 24(9) 25(10) 26(11) 27(12) [28,29] 30(13) 31(14) 01/04(15). 24, 25 e 26/03 são de outra comarca/UF/tribunal e contam.",
    esperado: { dataIntimacao: "2026-03-09", dataInicio: "2026-03-11", dataFinal: "2026-04-01", excluidos: ["2026-03-07", "2026-03-08", "2026-03-10", "2026-03-14", "2026-03-15", "2026-03-19", "2026-03-21", "2026-03-22", "2026-03-28", "2026-03-29"] },
  },
  {
    id: "03", titulo: "Disponibilização em feriado municipal",
    entrada: dje("2026-03-19", 5),
    contagemManual: "Disp. qui 19/03 (feriado) → publ. sex 20/03 → [21, 22] → início seg 23/03. 23(1) 24(2) 25(3) 26(4) 27(5).",
    esperado: { dataIntimacao: "2026-03-20", dataInicio: "2026-03-23", dataFinal: "2026-03-27", excluidos: ["2026-03-21", "2026-03-22"] },
  },
  {
    id: "04", titulo: "Início adiado por feriado nacional emendado ao fim de semana",
    entrada: dje("2026-04-01", 5),
    contagemManual: "Disp. qua 01/04 → publ. qui 02/04 → [03 feriado, 04, 05] → início seg 06/04. 06(1) 07(2) 08(3) 09(4) 10(5).",
    esperado: { dataIntimacao: "2026-04-02", dataInicio: "2026-04-06", dataFinal: "2026-04-10", excluidos: ["2026-04-03", "2026-04-04", "2026-04-05"] },
  },
  {
    id: "05", titulo: "Feriado nacional no meio da contagem",
    entrada: dje("2026-04-16", 5),
    contagemManual: "Disp. qui 16/04 → publ. sex 17/04 → [18, 19] → início seg 20/04. 20(1) [21 feriado] 22(2) 23(3) 24(4) [25,26] 27(5).",
    esperado: { dataIntimacao: "2026-04-17", dataInicio: "2026-04-20", dataFinal: "2026-04-27", excluidos: ["2026-04-18", "2026-04-19", "2026-04-21", "2026-04-25", "2026-04-26"] },
  },
  {
    id: "06", titulo: "Prazo em dobro (5 → 10 dias úteis)",
    entrada: dje("2026-03-02", 5, { emDobro: true }),
    contagemManual: "Como o caso 01, até 10 dias: 04(1) 05(2) 06(3) [07,08] 09(4) [10] 11(5) 12(6) 13(7) [14,15] 16(8) 17(9) 18(10).",
    esperado: { dataIntimacao: "2026-03-03", dataInicio: "2026-03-04", dataFinal: "2026-03-18", excluidos: ["2026-03-07", "2026-03-08", "2026-03-10", "2026-03-14", "2026-03-15"] },
  },
  {
    id: "07", titulo: "Prazo em dobro (15 → 30 dias úteis) com dois feriados nacionais",
    entrada: dje("2026-03-06", 15, { emDobro: true }),
    contagemManual: "Como o caso 02 até 01/04(15). 02(16) [03 feriado,04,05] 06(17) 07(18) 08(19) 09(20) 10(21) [11,12] 13(22) 14(23) 15(24) 16(25) 17(26) [18,19] 20(27) [21 feriado] 22(28) 23(29) 24(30).",
    esperado: { dataIntimacao: "2026-03-09", dataInicio: "2026-03-11", dataFinal: "2026-04-24", excluidos: ["2026-03-07", "2026-03-08", "2026-03-10", "2026-03-14", "2026-03-15", "2026-03-19", "2026-03-21", "2026-03-22", "2026-03-28", "2026-03-29", "2026-04-03", "2026-04-04", "2026-04-05", "2026-04-11", "2026-04-12", "2026-04-18", "2026-04-19", "2026-04-21"] },
  },
  {
    id: "08", titulo: "Portal com consulta em dia útil",
    entrada: { formaIntimacao: "PORTAL_CONSULTA", dataReferencia: "2026-03-11", quantidadeDias: 5, tipoContagem: "UTEIS", emDobro: false },
    contagemManual: "Consulta qua 11/03 = intimação → início qui 12/03. 12(1) 13(2) [14,15] 16(3) 17(4) 18(5).",
    esperado: { dataIntimacao: "2026-03-11", dataInicio: "2026-03-12", dataFinal: "2026-03-18", excluidos: ["2026-03-14", "2026-03-15"] },
  },
  {
    id: "09", titulo: "Portal com consulta; dia seguinte com indisponibilidade",
    entrada: { formaIntimacao: "PORTAL_CONSULTA", dataReferencia: "2026-03-09", quantidadeDias: 5, tipoContagem: "UTEIS", emDobro: false },
    contagemManual: "Consulta seg 09/03 → [10 indisp.] → início qua 11/03. 11(1) 12(2) 13(3) [14,15] 16(4) 17(5).",
    esperado: { dataIntimacao: "2026-03-09", dataInicio: "2026-03-11", dataFinal: "2026-03-17", excluidos: ["2026-03-10", "2026-03-14", "2026-03-15"] },
  },
  {
    id: "10", titulo: "Portal sem consulta: 10 dias corridos do envio, depois 15 úteis",
    entrada: { formaIntimacao: "PORTAL_TACITA", dataReferencia: "2026-03-02", quantidadeDias: 15, tipoContagem: "UTEIS", emDobro: false },
    contagemManual: "Envio seg 02/03 + 10 dias corridos = qui 12/03 (intimação) → início sex 13/03. 13(1) [14,15] 16(2) 17(3) 18(4) [19] 20(5) [21,22] 23(6) 24(7) 25(8) 26(9) 27(10) [28,29] 30(11) 31(12) 01/04(13) 02(14) [03,04,05] 06(15).",
    esperado: { dataIntimacao: "2026-03-12", dataInicio: "2026-03-13", dataFinal: "2026-04-06", excluidos: ["2026-03-14", "2026-03-15", "2026-03-19", "2026-03-21", "2026-03-22", "2026-03-28", "2026-03-29", "2026-04-03", "2026-04-04", "2026-04-05"] },
  },
  {
    id: "11", titulo: "Portal sem consulta, em dobro, com feriados estadual e forense",
    entrada: { formaIntimacao: "PORTAL_TACITA", dataReferencia: "2026-11-02", quantidadeDias: 5, tipoContagem: "UTEIS", emDobro: true },
    contagemManual: "Envio seg 02/11 + 10 = qui 12/11 (intimação) → [13 estadual, 14, 15, 16 forense] → início ter 17/11. 17(1) 18(2) 19(3) [20 feriado,21,22] 23(4) 24(5) 25(6) 26(7) 27(8) [28,29] 30(9) 01/12(10).",
    esperado: { dataIntimacao: "2026-11-12", dataInicio: "2026-11-17", dataFinal: "2026-12-01", excluidos: ["2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-28", "2026-11-29"] },
  },
  {
    id: "12", titulo: "Publicação adiada por feriados estadual e forense",
    entrada: dje("2026-11-12", 10),
    contagemManual: "Disp. qui 12/11 → [13 estadual, 14, 15, 16 forense] → publ. ter 17/11 → início qua 18/11. 18(1) 19(2) [20,21,22] 23(3) 24(4) 25(5) 26(6) 27(7) [28,29] 30(8) 01/12(9) 02/12(10).",
    esperado: { dataIntimacao: "2026-11-17", dataInicio: "2026-11-18", dataFinal: "2026-12-02", excluidos: ["2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-28", "2026-11-29"] },
  },
  {
    id: "13", titulo: "Recesso de fim de ano no meio da contagem",
    entrada: dje("2026-12-16", 5),
    contagemManual: "Disp. qua 16/12 → publ. qui 17/12 → início sex 18/12. 18(1) [19 sáb; 20/12 a 20/01 recesso] 21/01(2) 22/01(3) [23,24] 25/01(4) 26/01(5).",
    esperado: { dataIntimacao: "2026-12-17", dataInicio: "2026-12-18", dataFinal: "2027-01-26", excluidos: ["2026-12-19", ...intervalo("2026-12-20", "2027-01-20"), "2027-01-23", "2027-01-24"] },
  },
  {
    id: "14", titulo: "Disponibilização no último dia do recesso",
    entrada: dje("2027-01-20", 5),
    contagemManual: "Disp. qua 20/01 → publ. qui 21/01 (fora do recesso) → início sex 22/01. 22(1) [23,24] 25(2) 26(3) 27(4) 28(5).",
    esperado: { dataIntimacao: "2027-01-21", dataInicio: "2027-01-22", dataFinal: "2027-01-28", excluidos: ["2027-01-23", "2027-01-24"] },
  },
  {
    id: "15", titulo: "Feriados emendados (segunda e terça)",
    entrada: dje("2027-02-04", 5),
    contagemManual: "Disp. qui 04/02 → publ. sex 05/02 → [06, 07, 08 feriado, 09 feriado] → início qua 10/02. 10(1) 11(2) 12(3) [13,14] 15(4) 16(5).",
    esperado: { dataIntimacao: "2027-02-05", dataInicio: "2027-02-10", dataFinal: "2027-02-16", excluidos: ["2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09", "2027-02-13", "2027-02-14"] },
  },
  {
    id: "16", titulo: "Indisponibilidade no dia que seria o vencimento",
    entrada: dje("2026-03-04", 3),
    contagemManual: "Disp. qua 04/03 → publ. qui 05/03 → início sex 06/03. 06(1) [07,08] 09(2) [10 indisp.] 11(3).",
    esperado: { dataIntimacao: "2026-03-05", dataInicio: "2026-03-06", dataFinal: "2026-03-11", excluidos: ["2026-03-07", "2026-03-08", "2026-03-10"] },
  },
  {
    id: "17", titulo: "Prazo de 1 dia após feriado e fim de semana",
    entrada: dje("2026-04-02", 1),
    contagemManual: "Disp. qui 02/04 → [03 feriado, 04, 05] → publ. seg 06/04 → início ter 07/04 = dia 1 = vencimento.",
    esperado: { dataIntimacao: "2026-04-06", dataInicio: "2026-04-07", dataFinal: "2026-04-07", excluidos: ["2026-04-03", "2026-04-04", "2026-04-05"] },
  },
  {
    id: "18", titulo: "Dias corridos sem dia não útil no início e no fim",
    entrada: dje("2026-03-02", 10, { tipoContagem: "CORRIDOS" }),
    contagemManual: "Disp. seg 02/03 → publ. ter 03/03 → início qua 04/03. 10 dias corridos: 04 a 13/03 (sex).",
    esperado: { dataIntimacao: "2026-03-03", dataInicio: "2026-03-04", dataFinal: "2026-03-13", excluidos: [] },
  },
  {
    id: "19", titulo: "Dias corridos, em dobro",
    entrada: { formaIntimacao: "PORTAL_CONSULTA", dataReferencia: "2026-04-06", quantidadeDias: 5, tipoContagem: "CORRIDOS", emDobro: true },
    contagemManual: "Consulta seg 06/04 → início ter 07/04. 10 dias corridos: 07 a 16/04 (qui).",
    esperado: { dataIntimacao: "2026-04-06", dataInicio: "2026-04-07", dataFinal: "2026-04-16", excluidos: [] },
  },
  {
    id: "27", titulo: "Data de intimação informada pelo usuário (oficial de justiça)",
    entrada: { formaIntimacao: "DATA_INFORMADA", formaIntimacaoDetalhe: "oficial de justiça", dataReferencia: "2026-03-18", quantidadeDias: 5, tipoContagem: "UTEIS", emDobro: false },
    contagemManual: "Intimação informada qua 18/03 → [19 municipal] → início sex 20/03. 20(1) [21,22] 23(2) 24(3) 25(4) 26(5).",
    esperado: { dataIntimacao: "2026-03-18", dataInicio: "2026-03-20", dataFinal: "2026-03-26", excluidos: ["2026-03-19", "2026-03-21", "2026-03-22"] },
  },
  {
    id: "20", titulo: "Disponibilização antes do recesso: publicação depois dele (B1)",
    entrada: dje("2026-12-18", 5),
    contagemManual: "Disp. sex 18/12 → [19 sáb; 20/12 a 20/01 recesso, que não é dia útil] → publ. qui 21/01 → início sex 22/01. 22(1) [23,24] 25(2) 26(3) 27(4) 28(5).",
    esperado: { dataIntimacao: "2027-01-21", dataInicio: "2027-01-22", dataFinal: "2027-01-28", excluidos: ["2026-12-19", ...intervalo("2026-12-20", "2027-01-20"), "2027-01-23", "2027-01-24"] },
  },
  {
    id: "21", titulo: "Publicação antes do recesso: início depois dele (B1)",
    entrada: dje("2026-12-17", 5),
    contagemManual: "Disp. qui 17/12 → publ. sex 18/12 → [19 sáb; recesso] → início qui 21/01. 21(1) 22(2) [23,24] 25(3) 26(4) 27(5).",
    esperado: { dataIntimacao: "2026-12-18", dataInicio: "2027-01-21", dataFinal: "2027-01-27", excluidos: ["2026-12-19", ...intervalo("2026-12-20", "2027-01-20"), "2027-01-23", "2027-01-24"] },
  },
  {
    id: "22", titulo: "Portal sem consulta: 10º dia não útil → dia útil anterior (B4)",
    entrada: { formaIntimacao: "PORTAL_TACITA", dataReferencia: "2026-03-26", quantidadeDias: 5, tipoContagem: "UTEIS", emDobro: false },
    contagemManual: "Envio qui 26/03 + 10 = dom 05/04; recuando: sáb 04/04, sex 03/04 (feriado) → intimação qui 02/04 → [03, 04, 05] → início seg 06/04. 06(1) 07(2) 08(3) 09(4) 10(5).",
    esperado: { dataIntimacao: "2026-04-02", dataInicio: "2026-04-06", dataFinal: "2026-04-10", excluidos: ["2026-04-03", "2026-04-04", "2026-04-05"] },
  },
  {
    id: "23", titulo: "Portal: consulta em sábado vale no primeiro dia útil seguinte (B5)",
    entrada: { formaIntimacao: "PORTAL_CONSULTA", dataReferencia: "2026-03-07", quantidadeDias: 5, tipoContagem: "UTEIS", emDobro: false },
    contagemManual: "Consulta sáb 07/03 → [08 dom] → intimação seg 09/03 (Lei 11.419, art. 5º, §2º) → [10 indisp.] → início qua 11/03. 11(1) 12(2) 13(3) [14,15] 16(4) 17(5).",
    esperado: { dataIntimacao: "2026-03-09", dataInicio: "2026-03-11", dataFinal: "2026-03-17", excluidos: ["2026-03-08", "2026-03-10", "2026-03-14", "2026-03-15"] },
  },
  {
    id: "24", titulo: "Dias corridos (não criminal) com vencimento em sábado → contagem manual (B3)",
    entrada: dje("2026-03-02", 11, { tipoContagem: "CORRIDOS" }),
    contagemManual: "Início qua 04/03; 11 dias corridos terminam sáb 14/03: prazo não criminal, contagem manual.",
    esperado: { pendencia: "B3" },
  },
  {
    id: "32", titulo: "Dias corridos, criminal, vencimento em sábado → segunda-feira (B3)",
    entrada: dje("2026-03-02", 11, { tipoContagem: "CORRIDOS", criminal: true }),
    contagemManual: "Início qua 04/03; 11 dias corridos terminam sáb 14/03 → [14, 15] → vencimento seg 16/03.",
    esperado: { dataIntimacao: "2026-03-03", dataInicio: "2026-03-04", dataFinal: "2026-03-16", excluidos: ["2026-03-14", "2026-03-15"] },
  },
  {
    id: "25", titulo: "Dias corridos (não criminal) com início em sábado → contagem manual (B3)",
    entrada: { formaIntimacao: "PORTAL_CONSULTA", dataReferencia: "2026-03-13", quantidadeDias: 5, tipoContagem: "CORRIDOS", emDobro: false },
    contagemManual: "Consulta sex 13/03 → dia seguinte sáb 14/03: prazo não criminal, contagem manual.",
    esperado: { pendencia: "B3" },
  },
  {
    id: "33", titulo: "Dias corridos, criminal, início em sábado → segunda-feira (B3)",
    entrada: { formaIntimacao: "PORTAL_CONSULTA", dataReferencia: "2026-03-13", quantidadeDias: 5, tipoContagem: "CORRIDOS", emDobro: false, criminal: true },
    contagemManual: "Consulta sex 13/03 → [14, 15] → início seg 16/03. 16(1) 17(2) 18(3) 19(4) 20(5) → sex 20/03.",
    esperado: { dataIntimacao: "2026-03-13", dataInicio: "2026-03-16", dataFinal: "2026-03-20", excluidos: ["2026-03-14", "2026-03-15"] },
  },
  {
    id: "26", titulo: "Dias corridos atravessando o recesso: o recesso não é contado (B2)",
    entrada: dje("2026-12-07", 13, { tipoContagem: "CORRIDOS" }),
    contagemManual: "Disp. seg 07/12 → publ. ter 08/12 → início qua 09/12. 09 a 19/12 = 11 dias; [20/12 a 20/01 recesso]; 21/01(12) 22/01(13) → sex 22/01.",
    esperado: { dataIntimacao: "2026-12-08", dataInicio: "2026-12-09", dataFinal: "2027-01-22", excluidos: intervalo("2026-12-20", "2027-01-20") },
  },
  {
    id: "28", titulo: "Data de intimação informada em domingo → primeiro dia útil seguinte (B9)",
    entrada: { formaIntimacao: "DATA_INFORMADA", formaIntimacaoDetalhe: "correio", dataReferencia: "2026-03-08", quantidadeDias: 5, tipoContagem: "UTEIS", emDobro: false },
    contagemManual: "Intimação informada dom 08/03 → considerada seg 09/03 → [10 indisp.] → início qua 11/03. 11(1) 12(2) 13(3) [14,15] 16(4) 17(5).",
    esperado: { dataIntimacao: "2026-03-09", dataInicio: "2026-03-11", dataFinal: "2026-03-17", excluidos: ["2026-03-10", "2026-03-14", "2026-03-15"] },
  },
  {
    id: "29", titulo: "Vencimento em dia de expediente reduzido é prorrogado (regra 8)",
    entrada: dje("2026-05-06", 4),
    contagemManual: "Disp. qua 06/05 → publ. qui 07/05 → início sex 08/05. 08(1) [09,10] 11(2) 12(3) 13(4) — 13/05 tem expediente reduzido: vencimento prorrogado para qui 14/05.",
    esperado: { dataIntimacao: "2026-05-07", dataInicio: "2026-05-08", dataFinal: "2026-05-14", excluidos: ["2026-05-09", "2026-05-10", "2026-05-13"] },
  },
  {
    id: "30", titulo: "Expediente reduzido no meio do prazo conta como dia útil (B6)",
    entrada: dje("2026-05-06", 5),
    contagemManual: "Início sex 08/05. 08(1) [09,10] 11(2) 12(3) 13(4, expediente reduzido conta) 14(5).",
    esperado: { dataIntimacao: "2026-05-07", dataInicio: "2026-05-08", dataFinal: "2026-05-14", excluidos: ["2026-05-09", "2026-05-10"] },
  },
  {
    id: "31", titulo: "Expediente reduzido no primeiro dia do prazo conta como dia útil (B6)",
    entrada: dje("2026-05-11", 5),
    contagemManual: "Disp. seg 11/05 → publ. ter 12/05 → início qua 13/05 (expediente reduzido conta). 13(1) 14(2) 15(3) [16,17] 18(4) 19(5).",
    esperado: { dataIntimacao: "2026-05-12", dataInicio: "2026-05-13", dataFinal: "2026-05-19", excluidos: ["2026-05-16", "2026-05-17"] },
  },
];

function intervalo(de: string, ate: string): string[] {
  const dias: string[] = [];
  for (let d = new Date(`${de}T00:00:00Z`); d <= new Date(`${ate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    dias.push(d.toISOString().slice(0, 10));
  }
  return dias;
}

# Casos de teste do motor de prazos

Calendário fictício. Processo de teste: comarca A, UF GO, tribunal 8.09. Para cada caso, confira a contagem manual e marque se concorda.

## Feriados fictícios

| Data | Abrangência | Descrição | Aplica-se ao processo de teste? |
| --- | --- | --- | --- |
| 10/03/2026 (terça-feira) | FORENSE (indisponibilidade) | sistema fora do ar (fictício) | sim |
| 19/03/2026 (quinta-feira) | MUNICIPAL | aniversário fictício da cidade A | sim |
| 03/04/2026 (sexta-feira) | NACIONAL | feriado nacional fictício 1 | sim |
| 21/04/2026 (terça-feira) | NACIONAL | feriado nacional fictício 2 | sim |
| 02/11/2026 (segunda-feira) | NACIONAL | feriado nacional fictício 3 | sim |
| 13/11/2026 (sexta-feira) | ESTADUAL | feriado estadual fictício de GO | sim |
| 16/11/2026 (segunda-feira) | FORENSE | feriado forense fictício do tribunal 8.09 | sim |
| 20/11/2026 (sexta-feira) | NACIONAL | feriado nacional fictício 4 | sim |
| 08/02/2027 (segunda-feira) | NACIONAL | feriado nacional fictício 5 | sim |
| 09/02/2027 (terça-feira) | NACIONAL | feriado nacional fictício 6 | sim |
| 13/05/2026 (quarta-feira) | NACIONAL (expediente reduzido) | expediente reduzido fictício | sim |
| 24/03/2026 (terça-feira) | MUNICIPAL | feriado fictício da cidade B | não |
| 25/03/2026 (quarta-feira) | ESTADUAL | feriado estadual fictício de MS | não |
| 26/03/2026 (quinta-feira) | FORENSE | feriado forense fictício do tribunal 8.12 | não |

Recesso: 20/12 a 20/01, inclusive (CPC, art. 220).

## Casos

| # | Caso | Entrada | Contagem manual | Esperado | Motor | Confere? |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | DJe simples com fim de semana e indisponibilidade | DJe, ref. 02/03/2026, 5 úteis | Disp. seg 02/03 → publ. ter 03/03 → início qua 04/03. 04(1) 05(2) 06(3) [07 sáb, 08 dom] 09(4) [10 indisponibilidade] 11(5). | intimação 03/03/2026; início 04/03/2026; **final 11/03/2026** | final 11/03/2026 | ☐ |
| 02 | Feriado municipal; feriados de outra comarca, UF e tribunal não contam | DJe, ref. 06/03/2026, 15 úteis | Disp. sex 06/03 → [07, 08] → publ. seg 09/03 → [10 indisp.] → início qua 11/03. 11(1) 12(2) 13(3) [14,15] 16(4) 17(5) 18(6) [19 municipal] 20(7) [21,22] 23(8) 24(9) 25(10) 26(11) 27(12) [28,29] 30(13) 31(14) 01/04(15). 24, 25 e 26/03 são de outra comarca/UF/tribunal e contam. | intimação 09/03/2026; início 11/03/2026; **final 01/04/2026** | final 01/04/2026 | ☐ |
| 03 | Disponibilização em feriado municipal | DJe, ref. 19/03/2026, 5 úteis | Disp. qui 19/03 (feriado) → publ. sex 20/03 → [21, 22] → início seg 23/03. 23(1) 24(2) 25(3) 26(4) 27(5). | intimação 20/03/2026; início 23/03/2026; **final 27/03/2026** | final 27/03/2026 | ☐ |
| 04 | Início adiado por feriado nacional emendado ao fim de semana | DJe, ref. 01/04/2026, 5 úteis | Disp. qua 01/04 → publ. qui 02/04 → [03 feriado, 04, 05] → início seg 06/04. 06(1) 07(2) 08(3) 09(4) 10(5). | intimação 02/04/2026; início 06/04/2026; **final 10/04/2026** | final 10/04/2026 | ☐ |
| 05 | Feriado nacional no meio da contagem | DJe, ref. 16/04/2026, 5 úteis | Disp. qui 16/04 → publ. sex 17/04 → [18, 19] → início seg 20/04. 20(1) [21 feriado] 22(2) 23(3) 24(4) [25,26] 27(5). | intimação 17/04/2026; início 20/04/2026; **final 27/04/2026** | final 27/04/2026 | ☐ |
| 06 | Prazo em dobro (5 → 10 dias úteis) | DJe, ref. 02/03/2026, 5 úteis, em dobro | Como o caso 01, até 10 dias: 04(1) 05(2) 06(3) [07,08] 09(4) [10] 11(5) 12(6) 13(7) [14,15] 16(8) 17(9) 18(10). | intimação 03/03/2026; início 04/03/2026; **final 18/03/2026** | final 18/03/2026 | ☐ |
| 07 | Prazo em dobro (15 → 30 dias úteis) com dois feriados nacionais | DJe, ref. 06/03/2026, 15 úteis, em dobro | Como o caso 02 até 01/04(15). 02(16) [03 feriado,04,05] 06(17) 07(18) 08(19) 09(20) 10(21) [11,12] 13(22) 14(23) 15(24) 16(25) 17(26) [18,19] 20(27) [21 feriado] 22(28) 23(29) 24(30). | intimação 09/03/2026; início 11/03/2026; **final 24/04/2026** | final 24/04/2026 | ☐ |
| 08 | Portal com consulta em dia útil | Portal (consulta), ref. 11/03/2026, 5 úteis | Consulta qua 11/03 = intimação → início qui 12/03. 12(1) 13(2) [14,15] 16(3) 17(4) 18(5). | intimação 11/03/2026; início 12/03/2026; **final 18/03/2026** | final 18/03/2026 | ☐ |
| 09 | Portal com consulta; dia seguinte com indisponibilidade | Portal (consulta), ref. 09/03/2026, 5 úteis | Consulta seg 09/03 → [10 indisp.] → início qua 11/03. 11(1) 12(2) 13(3) [14,15] 16(4) 17(5). | intimação 09/03/2026; início 11/03/2026; **final 17/03/2026** | final 17/03/2026 | ☐ |
| 10 | Portal sem consulta: 10 dias corridos do envio, depois 15 úteis | Portal (sem consulta), ref. 02/03/2026, 15 úteis | Envio seg 02/03 + 10 dias corridos = qui 12/03 (intimação) → início sex 13/03. 13(1) [14,15] 16(2) 17(3) 18(4) [19] 20(5) [21,22] 23(6) 24(7) 25(8) 26(9) 27(10) [28,29] 30(11) 31(12) 01/04(13) 02(14) [03,04,05] 06(15). | intimação 12/03/2026; início 13/03/2026; **final 06/04/2026** | final 06/04/2026 | ☐ |
| 11 | Portal sem consulta, em dobro, com feriados estadual e forense | Portal (sem consulta), ref. 02/11/2026, 5 úteis, em dobro | Envio seg 02/11 + 10 = qui 12/11 (intimação) → [13 estadual, 14, 15, 16 forense] → início ter 17/11. 17(1) 18(2) 19(3) [20 feriado,21,22] 23(4) 24(5) 25(6) 26(7) 27(8) [28,29] 30(9) 01/12(10). | intimação 12/11/2026; início 17/11/2026; **final 01/12/2026** | final 01/12/2026 | ☐ |
| 12 | Publicação adiada por feriados estadual e forense | DJe, ref. 12/11/2026, 10 úteis | Disp. qui 12/11 → [13 estadual, 14, 15, 16 forense] → publ. ter 17/11 → início qua 18/11. 18(1) 19(2) [20,21,22] 23(3) 24(4) 25(5) 26(6) 27(7) [28,29] 30(8) 01/12(9) 02/12(10). | intimação 17/11/2026; início 18/11/2026; **final 02/12/2026** | final 02/12/2026 | ☐ |
| 13 | Recesso de fim de ano no meio da contagem | DJe, ref. 16/12/2026, 5 úteis | Disp. qua 16/12 → publ. qui 17/12 → início sex 18/12. 18(1) [19 sáb; 20/12 a 20/01 recesso] 21/01(2) 22/01(3) [23,24] 25/01(4) 26/01(5). | intimação 17/12/2026; início 18/12/2026; **final 26/01/2027** | final 26/01/2027 | ☐ |
| 14 | Disponibilização no último dia do recesso | DJe, ref. 20/01/2027, 5 úteis | Disp. qua 20/01 → publ. qui 21/01 (fora do recesso) → início sex 22/01. 22(1) [23,24] 25(2) 26(3) 27(4) 28(5). | intimação 21/01/2027; início 22/01/2027; **final 28/01/2027** | final 28/01/2027 | ☐ |
| 15 | Feriados emendados (segunda e terça) | DJe, ref. 04/02/2027, 5 úteis | Disp. qui 04/02 → publ. sex 05/02 → [06, 07, 08 feriado, 09 feriado] → início qua 10/02. 10(1) 11(2) 12(3) [13,14] 15(4) 16(5). | intimação 05/02/2027; início 10/02/2027; **final 16/02/2027** | final 16/02/2027 | ☐ |
| 16 | Indisponibilidade no dia que seria o vencimento | DJe, ref. 04/03/2026, 3 úteis | Disp. qua 04/03 → publ. qui 05/03 → início sex 06/03. 06(1) [07,08] 09(2) [10 indisp.] 11(3). | intimação 05/03/2026; início 06/03/2026; **final 11/03/2026** | final 11/03/2026 | ☐ |
| 17 | Prazo de 1 dia após feriado e fim de semana | DJe, ref. 02/04/2026, 1 úteis | Disp. qui 02/04 → [03 feriado, 04, 05] → publ. seg 06/04 → início ter 07/04 = dia 1 = vencimento. | intimação 06/04/2026; início 07/04/2026; **final 07/04/2026** | final 07/04/2026 | ☐ |
| 18 | Dias corridos sem dia não útil no início e no fim | DJe, ref. 02/03/2026, 10 corridos | Disp. seg 02/03 → publ. ter 03/03 → início qua 04/03. 10 dias corridos: 04 a 13/03 (sex). | intimação 03/03/2026; início 04/03/2026; **final 13/03/2026** | final 13/03/2026 | ☐ |
| 19 | Dias corridos, em dobro | Portal (consulta), ref. 06/04/2026, 5 corridos, em dobro | Consulta seg 06/04 → início ter 07/04. 10 dias corridos: 07 a 16/04 (qui). | intimação 06/04/2026; início 07/04/2026; **final 16/04/2026** | final 16/04/2026 | ☐ |
| 27 | Data de intimação informada pelo usuário (oficial de justiça) | Data informada, ref. 18/03/2026, 5 úteis | Intimação informada qua 18/03 → [19 municipal] → início sex 20/03. 20(1) [21,22] 23(2) 24(3) 25(4) 26(5). | intimação 18/03/2026; início 20/03/2026; **final 26/03/2026** | final 26/03/2026 | ☐ |
| 20 | Disponibilização antes do recesso: publicação depois dele (B1) | DJe, ref. 18/12/2026, 5 úteis | Disp. sex 18/12 → [19 sáb; 20/12 a 20/01 recesso, que não é dia útil] → publ. qui 21/01 → início sex 22/01. 22(1) [23,24] 25(2) 26(3) 27(4) 28(5). | intimação 21/01/2027; início 22/01/2027; **final 28/01/2027** | final 28/01/2027 | ☐ |
| 21 | Publicação antes do recesso: início depois dele (B1) | DJe, ref. 17/12/2026, 5 úteis | Disp. qui 17/12 → publ. sex 18/12 → [19 sáb; recesso] → início qui 21/01. 21(1) 22(2) [23,24] 25(3) 26(4) 27(5). | intimação 18/12/2026; início 21/01/2027; **final 27/01/2027** | final 27/01/2027 | ☐ |
| 22 | Portal sem consulta: 10º dia não útil → dia útil anterior (B4) | Portal (sem consulta), ref. 26/03/2026, 5 úteis | Envio qui 26/03 + 10 = dom 05/04; recuando: sáb 04/04, sex 03/04 (feriado) → intimação qui 02/04 → [03, 04, 05] → início seg 06/04. 06(1) 07(2) 08(3) 09(4) 10(5). | intimação 02/04/2026; início 06/04/2026; **final 10/04/2026** | final 10/04/2026 | ☐ |
| 23 | Portal: consulta em sábado vale no primeiro dia útil seguinte (B5) | Portal (consulta), ref. 07/03/2026, 5 úteis | Consulta sáb 07/03 → [08 dom] → intimação seg 09/03 (Lei 11.419, art. 5º, §2º) → [10 indisp.] → início qua 11/03. 11(1) 12(2) 13(3) [14,15] 16(4) 17(5). | intimação 09/03/2026; início 11/03/2026; **final 17/03/2026** | final 17/03/2026 | ☐ |
| 24 | Dias corridos (não criminal) com vencimento em sábado → contagem manual (B3) | DJe, ref. 02/03/2026, 11 corridos | Início qua 04/03; 11 dias corridos terminam sáb 14/03: prazo não criminal, contagem manual. | pendência B3 | pendência B3 | ☐ |
| 32 | Dias corridos, criminal, vencimento em sábado → segunda-feira (B3) | DJe, ref. 02/03/2026, 11 corridos | Início qua 04/03; 11 dias corridos terminam sáb 14/03 → [14, 15] → vencimento seg 16/03. | intimação 03/03/2026; início 04/03/2026; **final 16/03/2026** | final 16/03/2026 | ☐ |
| 25 | Dias corridos (não criminal) com início em sábado → contagem manual (B3) | Portal (consulta), ref. 13/03/2026, 5 corridos | Consulta sex 13/03 → dia seguinte sáb 14/03: prazo não criminal, contagem manual. | pendência B3 | pendência B3 | ☐ |
| 33 | Dias corridos, criminal, início em sábado → segunda-feira (B3) | Portal (consulta), ref. 13/03/2026, 5 corridos | Consulta sex 13/03 → [14, 15] → início seg 16/03. 16(1) 17(2) 18(3) 19(4) 20(5) → sex 20/03. | intimação 13/03/2026; início 16/03/2026; **final 20/03/2026** | final 20/03/2026 | ☐ |
| 26 | Dias corridos atravessando o recesso: o recesso não é contado (B2) | DJe, ref. 07/12/2026, 13 corridos | Disp. seg 07/12 → publ. ter 08/12 → início qua 09/12. 09 a 19/12 = 11 dias; [20/12 a 20/01 recesso]; 21/01(12) 22/01(13) → sex 22/01. | intimação 08/12/2026; início 09/12/2026; **final 22/01/2027** | final 22/01/2027 | ☐ |
| 28 | Data de intimação informada em domingo → primeiro dia útil seguinte (B9) | Data informada, ref. 08/03/2026, 5 úteis | Intimação informada dom 08/03 → considerada seg 09/03 → [10 indisp.] → início qua 11/03. 11(1) 12(2) 13(3) [14,15] 16(4) 17(5). | intimação 09/03/2026; início 11/03/2026; **final 17/03/2026** | final 17/03/2026 | ☐ |
| 29 | Vencimento em dia de expediente reduzido é prorrogado (regra 8) | DJe, ref. 06/05/2026, 4 úteis | Disp. qua 06/05 → publ. qui 07/05 → início sex 08/05. 08(1) [09,10] 11(2) 12(3) 13(4) — 13/05 tem expediente reduzido: vencimento prorrogado para qui 14/05. | intimação 07/05/2026; início 08/05/2026; **final 14/05/2026** | final 14/05/2026 | ☐ |
| 30 | Expediente reduzido no meio do prazo conta como dia útil (B6) | DJe, ref. 06/05/2026, 5 úteis | Início sex 08/05. 08(1) [09,10] 11(2) 12(3) 13(4, expediente reduzido conta) 14(5). | intimação 07/05/2026; início 08/05/2026; **final 14/05/2026** | final 14/05/2026 | ☐ |
| 31 | Expediente reduzido no primeiro dia do prazo conta como dia útil (B6) | DJe, ref. 11/05/2026, 5 úteis | Disp. seg 11/05 → publ. ter 12/05 → início qua 13/05 (expediente reduzido conta). 13(1) 14(2) 15(3) [16,17] 18(4) 19(5). | intimação 12/05/2026; início 13/05/2026; **final 19/05/2026** | final 19/05/2026 | ☐ |

Pendências: B1 recesso como dia útil para publicação/início; B2 recesso em dias corridos; B3 início/vencimento em dia não útil na contagem corrida; B4 10º dia do portal em dia não útil; B5 consulta ao portal em dia não útil; B6 expediente reduzido no início ou no meio do prazo; B9 data de intimação informada em dia não útil.

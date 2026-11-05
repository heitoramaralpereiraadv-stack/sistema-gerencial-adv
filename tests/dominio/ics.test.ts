// Leitura e geração de .ics (Google Agenda) com eventos fictícios.

import { describe, expect, it } from "vitest";
import { gerarIcs, IcsInvalidoError, lerIcs, numerosCnjNoTexto } from "@/dominio/agenda/ics";
import { calcularDigito } from "@/dominio/cnj/numero-cnj";

const cnj = (n: string, origem = "0051") => `${n}-${calcularDigito(n, "2026", "8", "09", origem)}.2026.8.09.${origem}`;
const A = cnj("0001234");
const B = cnj("0005678");

const ARQUIVO = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
  "BEGIN:VTIMEZONE",
  "TZID:America/Sao_Paulo",
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:-0300",
  "TZOFFSETTO:-0300",
  "END:STANDARD",
  "END:VTIMEZONE",
  "BEGIN:VEVENT",
  "DTSTART;TZID=America/Sao_Paulo:20261110T143000",
  "DTEND;TZID=America/Sao_Paulo:20261110T153000",
  "UID:evento-1@google.com",
  `SUMMARY:Audiência de conciliação\\, proc. ${A.replace(/\D/g, "")}`,
  "DESCRIPTION:Cliente fictício\\nSala 3\; levar documentos",
  "LOCATION:Fórum Fictício",
  "BEGIN:VALARM",
  "ACTION:DISPLAY",
  "DESCRIPTION:Lembrete",
  "TRIGGER:-P0DT0H30M0S",
  "END:VALARM",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20261112",
  "DTEND;VALUE=DATE:20261113",
  "UID:evento-2@google.com",
  "SUMMARY:Reunião sobre dois processos",
  `DESCRIPTION:${A} e ${B} e um número inválido 0001234-00.2026.8.09.0051 com t`,
  " exto dobrado",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261113T120000Z",
  "DURATION:PT2H",
  "UID:evento-3@google.com",
  "SUMMARY:Semanal",
  "RRULE:FREQ=WEEKLY",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261114T120000Z",
  "UID:evento-4@google.com",
  "SUMMARY:Cancelado",
  "STATUS:CANCELLED",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART;TZID=Fuso/Inexistente:20261116T090000",
  "UID:evento-5@google.com",
  "SUMMARY:Fuso estranho",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("lerIcs", () => {
  const eventos = lerIcs(ARQUIVO);

  it("lê eventos com fuso, dia inteiro, duração, série e cancelamento; ignora alarmes", () => {
    expect(eventos).toHaveLength(5);
    const [e1, e2, e3, e4, e5] = eventos;
    expect(e1).toMatchObject({
      uid: "evento-1@google.com",
      titulo: `Audiência de conciliação, proc. ${A.replace(/\D/g, "")}`,
      descricao: "Cliente fictício\nSala 3; levar documentos",
      local: "Fórum Fictício",
      diaInteiro: false,
      data: "2026-11-10",
      recorrente: false,
      cancelado: false,
    });
    expect(e1!.inicio.toISOString()).toBe("2026-11-10T17:30:00.000Z");
    expect(e1!.fim!.toISOString()).toBe("2026-11-10T18:30:00.000Z");
    expect(e2).toMatchObject({ diaInteiro: true, data: "2026-11-12" });
    expect(e2!.inicio.toISOString()).toBe("2026-11-12T03:00:00.000Z");
    expect(e2!.descricao).toContain("com texto dobrado");
    expect(e3).toMatchObject({ recorrente: true });
    expect(e3!.fim!.toISOString()).toBe("2026-11-13T14:00:00.000Z");
    expect(e4).toMatchObject({ cancelado: true });
    expect(e5!.avisoFuso).toMatch(/desconhecido/);
    expect(e5!.inicio.toISOString()).toBe("2026-11-16T12:00:00.000Z");
  });

  it("recusa arquivo que não é agenda", () => {
    expect(() => lerIcs("isto não é um ics")).toThrow(IcsInvalidoError);
  });
});

describe("numerosCnjNoTexto", () => {
  it("acha números com e sem pontuação, só com dígito verificador válido, sem repetir", () => {
    expect(numerosCnjNoTexto(`ver ${A.replace(/\D/g, "")}`, `${A}; ${B}`, "0001234-00.2026.8.09.0051", null)).toEqual([A, B]);
  });
});

describe("gerarIcs", () => {
  const agora = new Date("2026-11-05T12:00:00Z");
  const texto = gerarIcs(
    "Agenda fictícia",
    [
      { uid: "prazo-1@x", titulo: "Prazo: contestação, réplica; etc", descricao: `Processo ${A}\nCliente: Fulano Fictício`, data: "2026-11-20" },
      { uid: "aud-1@x", titulo: "Audiência", inicio: new Date("2026-11-10T17:30:00Z"), local: "Fórum" },
      { uid: "longo@x", titulo: "Á".repeat(80), data: "2026-12-31" },
    ],
    agora,
  );

  it("gera linhas válidas (CRLF, dobradas em 75 octetos) que voltam iguais na leitura", () => {
    for (const linha of texto.split("\r\n")) expect(Buffer.byteLength(linha)).toBeLessThanOrEqual(75);
    expect(texto).toContain("DTSTART;VALUE=DATE:20261120");
    expect(texto).toContain("DTEND;VALUE=DATE:20261121");
    expect(texto).toContain("DTEND;VALUE=DATE:20270101");
    expect(texto).toContain("DTSTART:20261110T173000Z");
    expect(texto).toContain("DTEND:20261110T183000Z");
    expect(texto).toContain("DTSTAMP:20261105T120000Z");
    const lidos = lerIcs(texto);
    expect(lidos.map((e) => e.titulo)).toEqual(["Prazo: contestação, réplica; etc", "Audiência", "Á".repeat(80)]);
    expect(lidos[0]).toMatchObject({ diaInteiro: true, data: "2026-11-20", descricao: `Processo ${A}\nCliente: Fulano Fictício` });
    expect(lidos[1]!.inicio.toISOString()).toBe("2026-11-10T17:30:00.000Z");
  });
});

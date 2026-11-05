// Arquivos iCalendar (RFC 5545) do Google Agenda: leitura do arquivo exportado e geração da
// agenda que o Google assina (G1–G4). Funções puras; nenhuma chamada de rede.

import { validarNumeroCnj } from "../cnj/numero-cnj";
import type { DataCivil } from "../prazos/data-civil";

export const FUSO_PADRAO = "America/Sao_Paulo";
/** Sufixo dos UIDs gerados pelo sistema: eventos com ele não são importados de volta. */
export const SUFIXO_UID = "@sistema-gerencial.medeirosebarbosa";

export interface EventoIcs {
  /** UID do evento; nas exceções de série, UID + RECURRENCE-ID. */
  uid: string;
  titulo: string;
  descricao: string | null;
  local: string | null;
  diaInteiro: boolean;
  /** Instante de início (dia inteiro: meia-noite de São Paulo do dia). */
  inicio: Date;
  fim: Date | null;
  /** Dia do início em São Paulo. */
  data: DataCivil;
  recorrente: boolean;
  cancelado: boolean;
  /** Fuso desconhecido (tratado como São Paulo). */
  avisoFuso: string | null;
}

export class IcsInvalidoError extends Error {}

// ───────────────────────── Fusos ─────────────────────────

function fusoValido(fuso: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

/** Diferença (minutos) entre a hora local do fuso e UTC num instante. */
function deslocamento(instante: number, fuso: string): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instante));
  const v = (t: string) => Number(partes.find((p) => p.type === t)!.value);
  return (Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second")) - instante) / 60000;
}

/** Hora de relógio num fuso → instante. */
export function instanteNoFuso(a: number, m: number, d: number, h: number, mi: number, s: number, fuso: string): Date {
  const comoUtc = Date.UTC(a, m - 1, d, h, mi, s);
  const primeira = comoUtc - deslocamento(comoUtc, fuso) * 60000;
  return new Date(comoUtc - deslocamento(primeira, fuso) * 60000);
}

export function dataNoFuso(instante: Date, fuso = FUSO_PADRAO): DataCivil {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(instante);
}

// ───────────────────────── Leitura ─────────────────────────

interface Propriedade {
  nome: string;
  parametros: Record<string, string>;
  valor: string;
}

function lerLinha(linha: string): Propriedade | null {
  let aspas = false;
  let fimNome = -1;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') aspas = !aspas;
    else if (c === ":" && !aspas) {
      fimNome = i;
      break;
    }
  }
  if (fimNome < 0) return null;
  const [nome, ...params] = linha.slice(0, fimNome).split(";");
  const parametros: Record<string, string> = {};
  for (const p of params) {
    const [k, ...v] = p.split("=");
    if (k) parametros[k.toUpperCase()] = v.join("=").replace(/^"|"$/g, "");
  }
  return { nome: nome!.toUpperCase(), parametros, valor: linha.slice(fimNome + 1) };
}

function desescapar(texto: string): string {
  return texto.replace(/\\([nN,;\\])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

const DATA = /^(\d{4})(\d{2})(\d{2})$/;
const DATA_HORA = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/;

function lerData(p: Propriedade): { instante: Date; diaInteiro: boolean; avisoFuso: string | null } {
  const valor = p.valor.trim();
  const d = DATA.exec(valor);
  if (d || p.parametros.VALUE === "DATE") {
    if (!d) throw new IcsInvalidoError(`Data inválida: ${valor}`);
    return { instante: instanteNoFuso(+d[1]!, +d[2]!, +d[3]!, 0, 0, 0, FUSO_PADRAO), diaInteiro: true, avisoFuso: null };
  }
  const m = DATA_HORA.exec(valor);
  if (!m) throw new IcsInvalidoError(`Data e hora inválidas: ${valor}`);
  const [a, mes, dia, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number) as [number, number, number, number, number, number];
  if (m[7] === "Z") return { instante: new Date(Date.UTC(a, mes - 1, dia, h, mi, s)), diaInteiro: false, avisoFuso: null };
  const tz = p.parametros.TZID;
  // Sem fuso ("hora flutuante") ou fuso desconhecido: hora de São Paulo.
  const usarTz = tz && fusoValido(tz) ? tz : FUSO_PADRAO;
  const avisoFuso = tz && usarTz !== tz ? `Fuso "${tz}" desconhecido; considerada a hora de Brasília.` : null;
  return { instante: instanteNoFuso(a, mes, dia, h, mi, s, usarTz), diaInteiro: false, avisoFuso };
}

/** Duração simples (RFC 5545): P1D, PT1H30M, P1W. */
function lerDuracao(valor: string): number | null {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(valor.trim());
  if (!m) return null;
  const [s, d, h, mi, se] = [m[1], m[2], m[3], m[4], m[5]].map((x) => Number(x ?? 0)) as number[];
  return ((((s! * 7 + d!) * 24 + h!) * 60 + mi!) * 60 + se!) * 1000;
}

/** Lê os eventos (VEVENT) de um arquivo .ics. Alarmes e fusos (VTIMEZONE) são ignorados. */
export function lerIcs(texto: string): EventoIcs[] {
  const linhas = texto.replace(/^\uFEFF/, "").replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  if (!linhas.some((l) => l.trim().toUpperCase() === "BEGIN:VCALENDAR")) {
    throw new IcsInvalidoError("O arquivo não é uma agenda (.ics): falta BEGIN:VCALENDAR.");
  }
  const eventos: EventoIcs[] = [];
  let atual: Propriedade[] | null = null;
  let aninhado = 0;
  for (const bruta of linhas) {
    const linha = bruta.trimEnd();
    if (!linha) continue;
    const maiuscula = linha.toUpperCase();
    if (maiuscula === "BEGIN:VEVENT") {
      atual = [];
      aninhado = 0;
      continue;
    }
    if (!atual) continue;
    if (maiuscula.startsWith("BEGIN:")) aninhado++;
    else if (maiuscula.startsWith("END:") && maiuscula !== "END:VEVENT") aninhado--;
    else if (maiuscula === "END:VEVENT") {
      eventos.push(montarEvento(atual));
      atual = null;
    } else if (aninhado === 0) {
      const p = lerLinha(linha);
      if (p) atual.push(p);
    }
  }
  return eventos;
}

function montarEvento(props: Propriedade[]): EventoIcs {
  const prop = (nome: string) => props.find((p) => p.nome === nome);
  const texto = (nome: string) => {
    const p = prop(nome);
    const v = p ? desescapar(p.valor).trim() : "";
    return v || null;
  };
  const dtStart = prop("DTSTART");
  if (!dtStart) throw new IcsInvalidoError("Evento sem data de início (DTSTART).");
  const inicio = lerData(dtStart);
  let fim: Date | null = null;
  const dtEnd = prop("DTEND");
  const duracao = prop("DURATION");
  if (dtEnd) fim = lerData(dtEnd).instante;
  else if (duracao) {
    const ms = lerDuracao(duracao.valor);
    if (ms !== null) fim = new Date(inicio.instante.getTime() + ms);
  }
  const recurrenceId = prop("RECURRENCE-ID");
  const uidBase = texto("UID") ?? `sem-uid-${dtStart.valor}-${texto("SUMMARY") ?? ""}`;
  return {
    uid: recurrenceId ? `${uidBase}#${recurrenceId.valor.trim()}` : uidBase,
    titulo: texto("SUMMARY") ?? "(sem título)",
    descricao: texto("DESCRIPTION"),
    local: texto("LOCATION"),
    diaInteiro: inicio.diaInteiro,
    inicio: inicio.instante,
    fim: fim && fim >= inicio.instante ? fim : null,
    data: dataNoFuso(inicio.instante),
    recorrente: Boolean(prop("RRULE") || prop("RDATE") || recurrenceId),
    cancelado: (texto("STATUS") ?? "").toUpperCase() === "CANCELLED",
    avisoFuso: inicio.avisoFuso,
  };
}

// ───────────────────────── Números CNJ no texto ─────────────────────────

const CANDIDATO_CNJ = /(?<!\d)\d{7}[-.\s]?\d{2}[.\s]?\d{4}[.\s]?\d[.\s]?\d{2}[.\s]?\d{4}(?!\d)/g;

/** Números CNJ válidos (dígito verificador conferido) citados no texto, já formatados. */
export function numerosCnjNoTexto(...textos: (string | null | undefined)[]): string[] {
  const achados = new Set<string>();
  for (const t of textos) {
    for (const m of (t ?? "").matchAll(CANDIDATO_CNJ)) {
      const r = validarNumeroCnj(m[0].replace(/\D/g, ""));
      if (r.valido) achados.add(r.numero.formatado);
    }
  }
  return [...achados];
}

// ───────────────────────── Geração ─────────────────────────

export type EventoSaida = {
  uid: string;
  titulo: string;
  descricao?: string | null;
  local?: string | null;
} & ({ data: DataCivil; inicio?: never; fim?: never } | { inicio: Date; fim?: Date | null; data?: never });

function escapar(texto: string): string {
  return texto.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Dobra linhas em 75 octetos (RFC 5545, 3.1), sem partir caracteres UTF-8. */
function dobrar(linha: string): string {
  const partes: string[] = [];
  let atual = "";
  let bytes = 0;
  for (const c of linha) {
    const n = Buffer.byteLength(c);
    const limite = partes.length === 0 ? 75 : 74;
    if (bytes + n > limite) {
      partes.push(atual);
      atual = "";
      bytes = 0;
    }
    atual += c;
    bytes += n;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dataIcs = (d: DataCivil) => d.replace(/-/g, "");
function diaSeguinte(d: DataCivil): DataCivil {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}

/** Agenda .ics completa. `agora` entra no DTSTAMP (fixo nos testes). */
export function gerarIcs(nome: string, eventos: EventoSaida[], agora = new Date()): string {
  const l: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Medeiros e Barbosa//Sistema Gerencial//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapar(nome)}`,
    `X-WR-TIMEZONE:${FUSO_PADRAO}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of eventos) {
    l.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${utc(agora)}`);
    if (e.data) l.push(`DTSTART;VALUE=DATE:${dataIcs(e.data)}`, `DTEND;VALUE=DATE:${dataIcs(diaSeguinte(e.data))}`, "TRANSP:TRANSPARENT");
    else {
      const inicio = e.inicio!;
      l.push(`DTSTART:${utc(inicio)}`);
      l.push(`DTEND:${utc(e.fim ?? new Date(inicio.getTime() + 60 * 60000))}`);
    }
    l.push(`SUMMARY:${escapar(e.titulo)}`);
    if (e.descricao) l.push(`DESCRIPTION:${escapar(e.descricao)}`);
    if (e.local) l.push(`LOCATION:${escapar(e.local)}`);
    l.push("END:VEVENT");
  }
  l.push("END:VCALENDAR");
  return l.map(dobrar).join("\r\n") + "\r\n";
}

// Data e hora de audiência, sempre no fuso de São Paulo, qualquer que seja o fuso do servidor.

const FUSO = "America/Sao_Paulo";

/** Diferença (minutos) entre o horário de São Paulo e UTC num instante. */
function deslocamento(instante: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(instante);
  const v = (t: string) => Number(partes.find((p) => p.type === t)!.value);
  const local = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"));
  return (local - instante.getTime()) / 60000;
}

/** "2026-11-10T14:30" (campo datetime-local) em São Paulo → Date. */
export function dataHoraDeSaoPaulo(local: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error(`Data e hora inválidas: ${local}`);
  const comoUtc = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  const primeira = comoUtc - deslocamento(new Date(comoUtc)) * 60000;
  return new Date(comoUtc - deslocamento(new Date(primeira)) * 60000);
}

/** Date → "2026-11-10T14:30" em São Paulo (valor de campo datetime-local). */
export function paraCampoDataHora(d: Date): string {
  return new Date(d.getTime() + deslocamento(d) * 60000).toISOString().slice(0, 16);
}

/** "10/11/2026 14:30" */
export function formatarDataHora(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" }).format(d);
}

/** Data (AAAA-MM-DD) do instante em São Paulo. */
export function dataEmSaoPaulo(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(d);
}

import type { DataCivil } from "@/dominio/prazos/data-civil";

/** Data de hoje no fuso de São Paulo (o servidor roda em UTC). */
export function hoje(agora = new Date()): DataCivil {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

/** Converte DateTime do Prisma (@db.Date, meia-noite UTC) em DataCivil. */
export function paraDataCivil(d: Date): DataCivil;
export function paraDataCivil(d: Date | null): DataCivil | null;
export function paraDataCivil(d: Date | null): DataCivil | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Converte DataCivil em Date para gravar em coluna @db.Date. */
export function paraDate(d: DataCivil): Date {
  return new Date(`${d}T00:00:00Z`);
}

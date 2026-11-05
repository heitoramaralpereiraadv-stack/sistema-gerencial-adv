// Selos de alerta (seção 4.4) e de situação.

import type { Alerta } from "@/servidor/servicos/agenda";

const TEXTO_ALERTA: Record<Alerta, string> = {
  vencido: "Vencido",
  vermelho: "Até 3 dias úteis",
  amarelo: "Até 10 dias úteis",
  nenhum: "",
};

export function SeloAlerta({ alerta, diasUteis }: { alerta: Alerta; diasUteis: number | null }) {
  if (alerta === "nenhum") return null;
  const texto =
    diasUteis === null ? "Vencido" : diasUteis === 0 ? "Vence hoje" : `${diasUteis} dia${diasUteis > 1 ? "s" : ""} úte${diasUteis > 1 ? "is" : "il"}`;
  return (
    <span className={`selo selo-${alerta}`} title={TEXTO_ALERTA[alerta]}>
      {texto}
    </span>
  );
}

export function Selo({ children, tipo = "neutro" }: { children: React.ReactNode; tipo?: "neutro" | "aviso" | "info" | "ok" }) {
  return <span className={`selo selo-${tipo}`}>{children}</span>;
}

// Memória gravada em todo prazo (regra 9). No modo manual (D11) registra por que o sistema
// não calculou e a data informada pelo usuário.

import { formatarDataComDia, type DataCivil } from "./data-civil";
import { memoriaEmTexto, VERSAO_MOTOR, type CodigoPendencia, type EntradaPrazo, type MemoriaCalculo } from "./motor";

export type MemoriaPrazo =
  | ({ tipo: "automatica" } & MemoriaCalculo)
  | {
      tipo: "manual";
      versaoMotor: string;
      entrada: EntradaPrazo;
      pendencia: { codigo: CodigoPendencia; mensagem: string };
      dataFinal: DataCivil;
      justificativa: string | null;
      informadoPor: string;
    };

export function memoriaManual(
  entrada: EntradaPrazo,
  pendencia: { codigo: CodigoPendencia; mensagem: string },
  dataFinal: DataCivil,
  justificativa: string | null,
  informadoPor: string,
): MemoriaPrazo {
  return { tipo: "manual", versaoMotor: VERSAO_MOTOR, entrada, pendencia, dataFinal, justificativa, informadoPor };
}

export function memoriaPrazoEmTexto(m: MemoriaPrazo): string[] {
  if (m.tipo === "automatica") return memoriaEmTexto(m);
  return [
    `Cálculo automático não realizado: ${m.pendencia.mensagem}`,
    `Data final informada manualmente por ${m.informadoPor}: ${formatarDataComDia(m.dataFinal)}`,
    m.justificativa ? `Justificativa: ${m.justificativa}` : "Sem justificativa informada.",
    "Prazo contado manualmente; exige conferência.",
  ];
}

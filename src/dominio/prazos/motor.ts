// Motor de contagem de prazos (requisitos, seção 4.2, e decisões B1–B13 em docs/decisoes.md).
//
// O resultado é uma sugestão: devolve as datas e a memória de cálculo para o advogado
// conferir. Onde a regra ainda não foi definida e a escolha muda o resultado, o motor
// não presume: lança PendenciaDeRegra e o prazo é lançado manualmente (D11).

import { Calendario, emRecesso } from "./calendario";
import { formatarDataComDia, somarDias, validarData, type DataCivil } from "./data-civil";

export const VERSAO_MOTOR = "2.0.0";

export type FormaIntimacao = "DJE" | "PORTAL_CONSULTA" | "PORTAL_TACITA" | "DATA_INFORMADA";
export type TipoContagem = "UTEIS" | "CORRIDOS";

export interface EntradaPrazo {
  formaIntimacao: FormaIntimacao;
  /**
   * Disponibilização (DJE), dia da consulta (PORTAL_CONSULTA), envio (PORTAL_TACITA) ou
   * data da intimação informada pelo usuário (DATA_INFORMADA).
   */
  dataReferencia: DataCivil;
  /** Para DATA_INFORMADA: oficial de justiça, correio, em audiência… */
  formaIntimacaoDetalhe?: string;
  quantidadeDias: number;
  tipoContagem: TipoContagem;
  emDobro: boolean;
  /** Prazo criminal: em dias corridos, início e vencimento vão para o dia útil seguinte (B3). */
  criminal?: boolean;
}

export type FaseExclusao = "publicacao" | "inicio" | "contagem";

export interface DiaExcluido {
  data: DataCivil;
  fase: FaseExclusao;
  motivos: string[];
}

export interface PassoCalculo {
  descricao: string;
  data?: DataCivil;
  fundamento?: string;
}

export interface MemoriaCalculo {
  versaoMotor: string;
  entrada: EntradaPrazo;
  passos: PassoCalculo[];
  diasExcluidos: DiaExcluido[];
  totalDias: number;
  dataIntimacao: DataCivil;
  dataInicio: DataCivil;
  dataFinal: DataCivil;
}

export interface ResultadoPrazo {
  dataIntimacao: DataCivil;
  dataInicio: DataCivil;
  dataFinal: DataCivil;
  memoria: MemoriaCalculo;
}

/** B3: dias corridos (não criminais) com início ou vencimento em dia não útil. */
export type CodigoPendencia = "B3";

/** Situação que a regra não resolve; o prazo deve ser contado manualmente. */
export class PendenciaDeRegra extends Error {
  constructor(
    readonly codigo: CodigoPendencia,
    mensagem: string,
  ) {
    super(`${mensagem} Sem regra automática para este caso (${codigo}); conte este prazo manualmente.`);
    this.name = "PendenciaDeRegra";
  }
}

export class EntradaInvalida extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "EntradaInvalida";
  }
}

const NOME_FORMA: Record<FormaIntimacao, string> = {
  DJE: "Publicação no Diário de Justiça eletrônico",
  PORTAL_CONSULTA: "Intimação pelo portal eletrônico, com consulta",
  PORTAL_TACITA: "Intimação pelo portal eletrônico, sem consulta",
  DATA_INFORMADA: "Data da intimação informada pelo usuário",
};

const PRAZO_CONSULTA_PORTAL = 10;

export function calcularPrazo(entrada: EntradaPrazo, calendario: Calendario): ResultadoPrazo {
  validarEntrada(entrada);
  const passos: PassoCalculo[] = [];
  const diasExcluidos: DiaExcluido[] = [];
  const excluir = (data: DataCivil, fase: FaseExclusao, ...extras: string[]) =>
    diasExcluidos.push({ data, fase, motivos: [...calendario.motivos(data), ...extras] });

  /**
   * Primeiro dia útil depois de `d` (regras 2 e 4). Recesso não é dia útil (B1);
   * expediente reduzido é (B6).
   */
  const proximoDiaUtil = (d: DataCivil, fase: FaseExclusao): DataCivil => {
    let dia = somarDias(d, 1);
    while (!calendario.ehDiaUtil(dia)) {
      excluir(dia, fase);
      dia = somarDias(dia, 1);
    }
    return dia;
  };

  /** Regra 8: o vencimento em dia sem expediente ou com expediente reduzido é prorrogado. */
  const prorrogarVencimento = (d: DataCivil): DataCivil => {
    let dia = d;
    while (!calendario.ehDiaUtil(dia) || calendario.expedienteReduzido(dia)) {
      const reduzido = calendario.expedienteReduzido(dia);
      excluir(dia, "contagem", ...(reduzido ? [reduzido] : []), "vencimento prorrogado");
      dia = somarDias(dia, 1);
    }
    if (dia !== d) {
      passos.push({
        descricao: `O vencimento cairia em ${formatarDataComDia(d)}, sem expediente normal, e é prorrogado para o primeiro dia útil seguinte`,
        data: dia,
        fundamento: "CPC, art. 224, §1º",
      });
    }
    return dia;
  };

  // 1. Data da intimação.
  const ref = entrada.dataReferencia;
  let dataIntimacao: DataCivil;
  const detalhe = entrada.formaIntimacaoDetalhe?.trim();
  passos.push({
    descricao: `Forma de intimação: ${NOME_FORMA[entrada.formaIntimacao]}${detalhe ? ` (${detalhe})` : ""}.`,
  });
  switch (entrada.formaIntimacao) {
    case "DJE":
      passos.push({ descricao: "Disponibilização no Diário de Justiça eletrônico", data: ref });
      dataIntimacao = proximoDiaUtil(ref, "publicacao");
      passos.push({
        descricao: "Considera-se publicada no primeiro dia útil seguinte à disponibilização",
        data: dataIntimacao,
        fundamento: "Lei 11.419/2006, art. 4º, §3º",
      });
      break;
    case "PORTAL_CONSULTA":
      passos.push({ descricao: "Consulta ao portal", data: ref });
      if (calendario.ehDiaUtil(ref)) {
        dataIntimacao = ref;
        passos.push({
          descricao: "Intimação considerada feita no dia da consulta",
          data: dataIntimacao,
          fundamento: "Lei 11.419/2006, art. 5º, §1º",
        });
      } else {
        // B5: consulta em dia não útil vale no primeiro dia útil seguinte.
        dataIntimacao = proximoDiaUtil(ref, "publicacao");
        passos.push({
          descricao: "Consulta em dia não útil: intimação considerada feita no primeiro dia útil seguinte",
          data: dataIntimacao,
          fundamento: "Lei 11.419/2006, art. 5º, §2º",
        });
      }
      break;
    case "PORTAL_TACITA": {
      passos.push({ descricao: "Envio da intimação pelo portal, sem consulta", data: ref });
      const decimoDia = somarDias(ref, PRAZO_CONSULTA_PORTAL);
      dataIntimacao = decimoDia;
      // B4: se o 10º dia não for útil, considera-se o dia útil anterior (por segurança).
      while (!calendario.ehDiaUtil(dataIntimacao)) dataIntimacao = somarDias(dataIntimacao, -1);
      passos.push(
        dataIntimacao === decimoDia
          ? {
              descricao: `Intimação considerada feita ao fim de ${PRAZO_CONSULTA_PORTAL} dias corridos do envio`,
              data: dataIntimacao,
              fundamento: "Lei 11.419/2006, art. 5º, §3º",
            }
          : {
              descricao: `O ${PRAZO_CONSULTA_PORTAL}º dia corrido do envio (${formatarDataComDia(decimoDia)}) não é útil; por segurança, considera-se a intimação no dia útil anterior`,
              data: dataIntimacao,
              fundamento: "Lei 11.419/2006, art. 5º, §3º; critério do escritório (B4)",
            },
      );
      break;
    }
    case "DATA_INFORMADA":
      passos.push({ descricao: "Data da intimação informada pelo usuário", data: ref });
      if (calendario.ehDiaUtil(ref)) {
        dataIntimacao = ref;
      } else {
        // B9: intimação em dia não útil considera-se feita no primeiro dia útil seguinte.
        dataIntimacao = proximoDiaUtil(ref, "publicacao");
        passos.push({
          descricao: "Data informada em dia não útil: intimação considerada no primeiro dia útil seguinte",
          data: dataIntimacao,
          fundamento: "Critério do escritório (B9)",
        });
      }
      break;
  }

  // 2. Quantidade de dias (regra 7: dobra só quando marcada).
  const totalDias = entrada.emDobro ? entrada.quantidadeDias * 2 : entrada.quantidadeDias;
  const unidade = entrada.tipoContagem === "UTEIS" ? "dias úteis" : "dias corridos";
  passos.push({
    descricao: entrada.emDobro
      ? `Prazo em dobro marcado pelo usuário: ${entrada.quantidadeDias} × 2 = ${totalDias} ${unidade}`
      : `Prazo de ${totalDias} ${unidade}${entrada.criminal ? " (criminal)" : ""}`,
    fundamento:
      entrada.tipoContagem === "UTEIS"
        ? "CPC, art. 219; Lei 9.099/1995, art. 12-A; CLT, art. 775"
        : "Contagem corrida escolhida pelo usuário; o recesso não é contado (B2)",
  });

  // 3. Início e vencimento.
  let dataInicio: DataCivil;
  let dataFinal: DataCivil;
  if (entrada.tipoContagem === "UTEIS") {
    dataInicio = proximoDiaUtil(dataIntimacao, "inicio");
    passos.push({
      descricao: "Exclui-se o dia do começo; o prazo começa no primeiro dia útil seguinte",
      data: dataInicio,
      fundamento: "CPC, art. 224",
    });
    dataFinal = dataInicio;
    for (let contados = 1; contados < totalDias; ) {
      dataFinal = somarDias(dataFinal, 1);
      if (calendario.ehDiaUtil(dataFinal)) contados++;
      else excluir(dataFinal, "contagem");
    }
    dataFinal = prorrogarVencimento(dataFinal);
  } else {
    // Dias corridos: o recesso não é contado (B2); dia não útil no início ou no vencimento
    // só tem regra automática em prazo criminal (B3).
    dataInicio = somarDias(dataIntimacao, 1);
    while (emRecesso(dataInicio)) {
      excluir(dataInicio, "inicio");
      dataInicio = somarDias(dataInicio, 1);
    }
    if (!calendario.ehDiaUtil(dataInicio)) {
      if (!entrada.criminal) {
        throw new PendenciaDeRegra("B3", `Em contagem corrida, o início cai em dia não útil (${calendario.descrever(dataInicio)}).`);
      }
      dataInicio = proximoDiaUtil(somarDias(dataInicio, -1), "inicio");
    }
    passos.push({
      descricao: entrada.criminal
        ? "Exclui-se o dia do começo; o prazo criminal começa no primeiro dia útil seguinte"
        : "Exclui-se o dia do começo; o prazo começa no dia seguinte",
      data: dataInicio,
      fundamento: "CPC, art. 224",
    });
    dataFinal = dataInicio;
    for (let contados = 1; contados < totalDias; ) {
      dataFinal = somarDias(dataFinal, 1);
      if (emRecesso(dataFinal)) excluir(dataFinal, "contagem");
      else contados++;
    }
    if (!calendario.ehDiaUtil(dataFinal) || calendario.expedienteReduzido(dataFinal)) {
      if (!entrada.criminal) {
        throw new PendenciaDeRegra(
          "B3",
          `Em contagem corrida, o vencimento cai em dia sem expediente normal (${formatarDataComDia(dataFinal)}).`,
        );
      }
      dataFinal = prorrogarVencimento(dataFinal);
    }
  }
  passos.push({
    descricao: "Vencimento (inclui-se o dia do vencimento)",
    data: dataFinal,
    fundamento: "CPC, art. 224, caput e §1º",
  });

  const memoria: MemoriaCalculo = {
    versaoMotor: VERSAO_MOTOR,
    entrada: { ...entrada },
    passos,
    diasExcluidos,
    totalDias,
    dataIntimacao,
    dataInicio,
    dataFinal,
  };
  return { dataIntimacao, dataInicio, dataFinal, memoria };
}

function validarEntrada(e: EntradaPrazo) {
  try {
    validarData(e.dataReferencia);
  } catch {
    throw new EntradaInvalida(`Data de referência inválida: ${e.dataReferencia}`);
  }
  if (!Number.isInteger(e.quantidadeDias) || e.quantidadeDias < 1) {
    throw new EntradaInvalida("A quantidade de dias deve ser um número inteiro maior que zero.");
  }
}

const ROTULO_FASE: Record<FaseExclusao, string> = {
  publicacao: "até a publicação ou intimação",
  inicio: "até o início",
  contagem: "durante a contagem",
};

/** Memória de cálculo em texto, para a tela e para o PDF (regra 9). */
export function memoriaEmTexto(m: MemoriaCalculo): string[] {
  const linhas = m.passos.map((p) => {
    let l = p.data ? `${p.descricao}: ${formatarDataComDia(p.data)}` : p.descricao;
    if (p.fundamento) l += ` — ${p.fundamento}`;
    return l;
  });
  if (m.diasExcluidos.length) {
    linhas.push("Dias excluídos:");
    for (const d of m.diasExcluidos) {
      linhas.push(`  ${formatarDataComDia(d.data)} (${ROTULO_FASE[d.fase]}): ${d.motivos.join("; ")}`);
    }
  } else {
    linhas.push("Nenhum dia excluído.");
  }
  linhas.push(`Data final: ${formatarDataComDia(m.dataFinal)}`);
  linhas.push(`Cálculo sugerido pelo sistema (motor ${m.versaoMotor}); exige conferência do advogado.`);
  return linhas;
}

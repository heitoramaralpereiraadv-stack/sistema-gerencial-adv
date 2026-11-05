// Leitura de Controle_Clientes_Processos.xlsx (seção 8.1). Só lê as colunas digitadas; as
// colunas calculadas (fórmulas) são ignoradas, porque o sistema recalcula tudo.

import ExcelJS from "exceljs";

export interface LinhaCliente {
  codigo: string; // C001
  nome: string;
  tipo: string | null;
  cpfCnpj: string | null;
  rgNascimento: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
  cidadeUf: string | null;
  areaPrincipal: string | null;
  responsavel: string | null;
  dataEntrada: string | null;
  situacao: string | null;
  observacoes: string | null;
}

export interface LinhaProcesso {
  codigo: string; // P001
  cliente: string;
  numero: string | null;
  poloCliente: string | null;
  parteContraria: string | null;
  tipoParteContraria: string | null;
  area: string | null;
  natureza: string | null;
  juizo: string | null;
  dataDistribuicao: string | null;
  dataCitacao: string | null;
  faseAtual: string | null;
  status: string | null;
  valorCausa: string | null;
  resultado: string | null;
  responsavel: string | null;
  observacoes: string | null;
}

export interface LinhasPlanilha {
  clientes: LinhaCliente[];
  processos: LinhaProcesso[];
}

export class PlanilhaInvalidaError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "PlanilhaInvalidaError";
  }
}

const CABECALHO_CLIENTES = ["ID", "Cliente", "Tipo", "CPF / CNPJ"];
const CABECALHO_PROCESSOS = ["ID", "ID cliente", "Cliente", "Nº do processo (CNJ)"];
const LINHA_CABECALHO = 4;

/** Valor da célula como texto; fórmulas e células vazias viram null; datas viram AAAA-MM-DD. */
function texto(valor: ExcelJS.CellValue): string | null {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === "object") {
    if ("formula" in valor || "sharedFormula" in valor) return null;
    if ("richText" in valor) return valor.richText.map((r) => r.text).join("").trim() || null;
    if ("text" in valor) return String(valor.text).trim() || null;
    if ("result" in valor) return null;
  }
  const t = String(valor).trim();
  return t === "" ? null : t;
}

function conferirCabecalho(aba: ExcelJS.Worksheet, esperado: string[]) {
  const linha = aba.getRow(LINHA_CABECALHO);
  esperado.forEach((rotulo, i) => {
    if (texto(linha.getCell(i + 1).value) !== rotulo) {
      throw new PlanilhaInvalidaError(`Aba "${aba.name}": cabeçalho inesperado na coluna ${i + 1} (esperado "${rotulo}").`);
    }
  });
}

function linhas(aba: ExcelJS.Worksheet, colunaObrigatoria: number): ExcelJS.Row[] {
  const resultado: ExcelJS.Row[] = [];
  aba.eachRow((linha, n) => {
    if (n > LINHA_CABECALHO && texto(linha.getCell(colunaObrigatoria).value)) resultado.push(linha);
  });
  return resultado;
}

export async function lerPlanilha(arquivo: ArrayBuffer | Buffer): Promise<LinhasPlanilha> {
  const livro = new ExcelJS.Workbook();
  try {
    await livro.xlsx.load(arquivo as ArrayBuffer);
  } catch {
    throw new PlanilhaInvalidaError("Arquivo não é uma planilha .xlsx válida.");
  }
  const abaClientes = livro.getWorksheet("Clientes");
  const abaProcessos = livro.getWorksheet("Processos");
  if (!abaClientes || !abaProcessos) throw new PlanilhaInvalidaError('A planilha precisa das abas "Clientes" e "Processos".');
  conferirCabecalho(abaClientes, CABECALHO_CLIENTES);
  conferirCabecalho(abaProcessos, CABECALHO_PROCESSOS);

  const clientes = linhas(abaClientes, 2).map((l): LinhaCliente => {
    const c = (n: number) => texto(l.getCell(n).value);
    return {
      codigo: c(1) ?? "", nome: c(2)!, tipo: c(3), cpfCnpj: c(4), rgNascimento: c(5), telefone: c(6), email: c(7),
      endereco: c(8), cidadeUf: c(9), areaPrincipal: c(10), responsavel: c(11), dataEntrada: c(12), situacao: c(13),
      observacoes: c(16),
    };
  });
  const processos = linhas(abaProcessos, 3).map((l): LinhaProcesso => {
    const c = (n: number) => texto(l.getCell(n).value);
    return {
      codigo: c(1) ?? "", cliente: c(3)!, numero: c(4), poloCliente: c(6), parteContraria: c(7), tipoParteContraria: c(8),
      area: c(9), natureza: c(10), juizo: c(11), dataDistribuicao: c(12), dataCitacao: c(13), faseAtual: c(14),
      status: c(15), valorCausa: c(19), resultado: c(21), responsavel: c(22), observacoes: c(23),
    };
  });
  return { clientes, processos };
}

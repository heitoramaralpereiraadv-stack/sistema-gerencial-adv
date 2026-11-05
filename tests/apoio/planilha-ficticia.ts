// Planilha FICTÍCIA no mesmo formato de Controle_Clientes_Processos.xlsx (título, instruções,
// cabeçalho na linha 4, colunas calculadas com fórmulas). Nenhum dado real.

import ExcelJS from "exceljs";
import type { Ajustes } from "@/importacao/proposta";

const CAB_CLIENTES = [
  "ID", "Cliente", "Tipo", "CPF / CNPJ", "RG / Data nasc.", "Telefone / WhatsApp", "E-mail", "Endereço", "Cidade/UF",
  "Área principal", "Responsável", "Data de entrada", "Situação", "Nº de processos", "Processos ativos", "Observações",
];
const CAB_PROCESSOS = [
  "ID", "ID cliente", "Cliente", "Nº do processo (CNJ)", "Ano (nº CNJ)", "Polo do cliente", "Parte contrária",
  "Tipo de parte contrária", "Área", "Natureza / Ação", "Juízo / Vara / Tribunal", "Data de distribuição",
  "Data de citação/ingresso", "Fase atual / último ato", "Status", "Próximo prazo", "Dias até o prazo",
  "Providência pendente", "Valor da causa (R$)", "Honorários contratuais (%)", "Resultado / decisão", "Responsável", "Observações",
];

// [ID, Cliente, Tipo, Cidade/UF]
export const CLIENTES_FICTICIOS: [string, string, string, string | null][] = [
  ["C001", "Fulano Teste da Silva", "PF", "Goiânia/GO"],
  ["C002", "Ana Teste e Bruno Teste", "PF", null],
  ["C003", "[confirmar] Cliente Duvidoso", "PF", null],
  ["C004", "[confirmar] Caso Fictício (escritório como depositário)", "—", null],
  ["C005", "Mayra Exemplo e Silva", "PF", "MS"],
];

// [ID, Cliente, Nº, Polo, Parte contrária, Tipo parte, Área, Natureza, Juízo, Fase, Status, Observações]
export const PROCESSOS_FICTICIOS: (string | null)[][] = [
  ["P001", "Fulano Teste da Silva", "0009001-19.2026.8.09.0051", "Autor", "Banco Santander / Olé Consignado", "Instituição financeira", "Bancário/Consumidor", "Consignado", "5ª UPJ Varas Cíveis – Goiânia/GO", null, "Em andamento", null],
  ["P002", "Fulano Teste da Silva", "0009002-10.2025.8.12.0001", "Autor", "Banco Olé Consignado / Santander", "Instituição financeira", "Bancário/Consumidor", "Consignado", "1ª Vara Cível – Campo Grande/MS", null, "Em andamento", null],
  ["P003", "Fulano Teste da Silva", null, "Autor", "Shopping (queda em escada rolante)", "Pessoa jurídica", "Responsabilidade Civil", "Ação indenizatória", null, "Preparando protocolo", "A protocolar", null],
  ["P004", "Ana Teste e Bruno Teste", "0009003-86.2026.8.09.0051", "Requerente", "— (curatela de Fulana)", null, "Família e Sucessões", "Curatela", "7ª Vara de Família – Goiânia/GO", null, "Em andamento", "Nº relacionado: 0009004-71.2026.8.09.0051 e 5062943-75.2026"],
  ["P005", "Fulano Teste da Silva", "0009005-25.2026.8.12.0002", "Executado (avalista)", "Banco do Brasil S.A.", "Instituição financeira", "Cível – Execução (defesa)", "Execução de CCB", "Dourados/MS (conferir vara)", null, "Em andamento", null],
  ["P006", "[confirmar] Cliente Duvidoso", "0009006-41.2026.8.09.0051", "[confirmar]", "[confirmar]", "Pessoa física", "Família e Sucessões", "Divórcio", null, null, "Em andamento", null],
  ["P007", "Fulano Teste da Silva", "0009007-26.2026.8.09.0051", "Recorrente", "Banco Inbursa S.A.", "Instituição financeira", "Bancário/Consumidor", "Consignado", "Turma Recursal – GO", "Recurso inominado", "Em grau de recurso", null],
  ["P008", "Fulano Teste da Silva", "0009008-98.2026.4.01.3500", "Autor", "INSS e Banco Bradesco", "Ente público", "Previdenciário", "BPC", "JEF Adjunto – Jataí/GO", null, "Em andamento", null],
  ["P009", "Mayra Exemplo e Silva", "0009009-64.2026.8.09.0093", "Autor", "Inbursa", "Instituição financeira", "Bancário/Consumidor", "Consignado (repropositura)", "2ª Vara Cível – Jataí/GO", "Tema 1414/STJ", "Sobrestado", null],
  ["P010", "[confirmar] Caso Fictício (escritório como depositário)", null, "Depositário judicial", null, null, "Cível – Execução", "Execução – safra fictícia", "Goiânia/GO", "Monitoramento de penhora", "Em andamento", null],
];

export const AJUSTES_FICTICIOS: Ajustes = {
  naoMesclar: [],
  clientes: {
    C002: { pessoas: [{ nome: "Ana Teste Completa", papel: "cliente" }, { nome: "Bruno Teste Completo", papel: "cliente" }] },
    C004: { remover: true },
  },
  processos: {
    P010: {
      partes: [
        { cliente: "C001", polo: "ATIVO", qualificacoes: ["Exequente"], ehCliente: true },
        { nome: "Escritório Fictício Sociedade de Advogados", tipo: "PJ", polo: "TERCEIRO", qualificacoes: ["Depositário"], ehCliente: false },
      ],
    },
  },
};

/** `numeros` troca o número de processos específicos (ex.: { P001: "…" }) para cenários de conflito. */
export async function planilhaFicticia(numeros: Record<string, string> = {}): Promise<Buffer> {
  const livro = new ExcelJS.Workbook();
  const clientes = livro.addWorksheet("Clientes");
  clientes.addRow(["CONTROLE DE CLIENTES — fictício"]);
  clientes.addRow(["Instruções"]);
  clientes.addRow([]);
  clientes.addRow(CAB_CLIENTES);
  for (const [id, nome, tipo, cidade] of CLIENTES_FICTICIOS) {
    const n = clientes.rowCount + 1;
    clientes.addRow([id, nome, tipo, null, null, null, null, null, cidade, "Cível", "Silas", null, "Ativo",
      { formula: `COUNTIF(Processos!$C$5:$C$500,B${n})` }, { formula: "1" }, null]);
  }
  const processos = livro.addWorksheet("Processos");
  processos.addRow(["CONTROLE DE PROCESSOS — fictício"]);
  processos.addRow(["Instruções"]);
  processos.addRow([]);
  processos.addRow(CAB_PROCESSOS);
  for (const [id, cliente, numero, polo, parte, tipoParte, area, natureza, juizo, fase, status, obs] of PROCESSOS_FICTICIOS) {
    const n = processos.rowCount + 1;
    processos.addRow([id, { formula: `INDEX(Clientes!A:A,1)` }, cliente, numeros[id!] ?? numero, { formula: `MID(D${n},12,4)` }, polo, parte, tipoParte,
      area, natureza, juizo, null, null, fase, status, null, { formula: `P${n}-TODAY()` }, null, null, null, null, "Silas", obs]);
  }
  livro.addWorksheet("Relatório").addRow(["RELATÓRIO"]);
  return Buffer.from(await livro.xlsx.writeBuffer());
}

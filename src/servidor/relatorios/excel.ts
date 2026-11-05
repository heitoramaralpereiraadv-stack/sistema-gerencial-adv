// Exportação em Excel (seção 6), com o cabeçalho do escritório.

import ExcelJS from "exceljs";
import { formatarDataHora } from "@/lib/data-hora";
import type { ContextoExportacao, Tabela } from "./tipos";

const AZUL = "FF1F3A5F";
const CINZA = "FFEAECF0";

export function linhaDoEscritorio(ctx: ContextoExportacao): string {
  const e = ctx.escritorio;
  return [e.cnpj && `CNPJ ${e.cnpj}`, e.registroOab && `OAB ${e.registroOab}`, e.endereco, e.telefone, e.email].filter(Boolean).join(" · ");
}

export async function gerarExcel(tabela: Tabela, ctx: ContextoExportacao): Promise<Buffer> {
  const livro = new ExcelJS.Workbook();
  livro.creator = ctx.escritorio.razaoSocial;
  livro.created = ctx.geradoEm;
  const aba = livro.addWorksheet(tabela.titulo.replace(/[\\/*?:[\]]/g, " ").slice(0, 31));
  const largura = Math.max(tabela.colunas.length, 2);

  const titulo = (texto: string, fonte: Partial<ExcelJS.Font>) => {
    const linha = aba.addRow([texto]);
    aba.mergeCells(linha.number, 1, linha.number, largura);
    linha.getCell(1).font = fonte;
  };
  if (ctx.escritorio.logoBase64 && ctx.escritorio.logoTipo) {
    const imagem = livro.addImage({ base64: ctx.escritorio.logoBase64, extension: ctx.escritorio.logoTipo === "image/png" ? "png" : "jpeg" });
    aba.addImage(imagem, { tl: { col: largura - 1, row: 0 }, ext: { width: 90, height: 45 } });
  }
  titulo(ctx.escritorio.razaoSocial, { bold: true, size: 13, color: { argb: AZUL } });
  const dados = linhaDoEscritorio(ctx);
  if (dados) titulo(dados, { size: 9, color: { argb: "FF5B6573" } });
  aba.addRow([]);
  titulo(tabela.titulo, { bold: true, size: 12 });
  for (const f of ctx.filtrosDescritos) titulo(f, { size: 9 });
  titulo(`Gerado em ${formatarDataHora(ctx.geradoEm)} por ${ctx.geradoPor}`, { size: 9, italic: true });

  if (tabela.resumo?.length) {
    aba.addRow([]);
    for (const r of tabela.resumo) {
      const l = aba.addRow([r.rotulo, r.valor]);
      l.getCell(1).font = { bold: true };
    }
  }
  aba.addRow([]);
  const cabecalho = aba.addRow(tabela.colunas.map((c) => c.titulo));
  cabecalho.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  tabela.linhas.forEach((linha, i) => {
    const l = aba.addRow(tabela.colunas.map((c) => linha[c.chave] ?? ""));
    l.alignment = { vertical: "top", wrapText: true };
    if (i % 2 === 1) l.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } }));
  });
  tabela.colunas.forEach((c, i) => {
    aba.getColumn(i + 1).width = Math.round(14 * (c.largura ?? 1));
    if (c.numero) aba.getColumn(i + 1).alignment = { horizontal: "right" };
  });
  aba.autoFilter = { from: { row: cabecalho.number, column: 1 }, to: { row: cabecalho.number, column: tabela.colunas.length } };
  aba.views = [{ state: "frozen", ySplit: cabecalho.number }];
  if (tabela.observacao) {
    aba.addRow([]);
    titulo(tabela.observacao, { size: 9, italic: true });
  }
  titulo("Documento interno — contém dados pessoais protegidos pela LGPD.", { size: 8, italic: true, color: { argb: "FF5B6573" } });
  return Buffer.from(await livro.xlsx.writeBuffer());
}

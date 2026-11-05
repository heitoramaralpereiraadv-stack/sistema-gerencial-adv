// Exportação em PDF (seção 6): A4 paisagem, cabeçalho do escritório em todas as páginas,
// tabela com quebra de linha e numeração de páginas. pdf-lib, sem dependências do sistema.

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { formatarDataHora } from "@/lib/data-hora";
import { linhasDoEscritorio } from "./excel";
import type { ContextoExportacao, Tabela } from "./tipos";

const A4_PAISAGEM: [number, number] = [841.89, 595.28];
const MARGEM = 36;
const AZUL = rgb(0.122, 0.227, 0.373);
const TEXTO = rgb(0.114, 0.145, 0.188);
const SUAVE = rgb(0.357, 0.396, 0.451);
const ZEBRA = rgb(0.957, 0.961, 0.969);
const CORPO = 8;
const ENTRELINHA = 10;

/** As fontes padrão do PDF (WinAnsi) não têm todos os caracteres: troca os que faltam. */
function limpar(fonte: PDFFont, texto: string): string {
  let saida = "";
  for (const c of texto.replace(/\s+/g, " ")) {
    try {
      fonte.encodeText(c);
      saida += c;
    } catch {
      saida += c === "≤" ? "<=" : c === "≥" ? ">=" : "?";
    }
  }
  return saida;
}

function quebrar(fonte: PDFFont, tamanho: number, texto: string, largura: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of limpar(fonte, texto).split(" ")) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) {
      atual = tentativa;
      continue;
    }
    if (atual) linhas.push(atual);
    // Palavra maior que a coluna: corta.
    let resto = palavra;
    while (fonte.widthOfTextAtSize(resto, tamanho) > largura && resto.length > 1) {
      let n = resto.length;
      while (n > 1 && fonte.widthOfTextAtSize(resto.slice(0, n), tamanho) > largura) n--;
      // Prefere quebrar depois de "/" ou "-" ("Bancário/ Consumidor").
      const corte = Math.max(resto.lastIndexOf("/", n - 1), resto.lastIndexOf("-", n - 1));
      if (corte > 0) n = corte + 1;
      linhas.push(resto.slice(0, n));
      resto = resto.slice(n);
    }
    atual = resto;
  }
  if (atual || linhas.length === 0) linhas.push(atual);
  return linhas;
}

export async function gerarPdf(tabela: Tabela, ctx: ContextoExportacao): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(tabela.titulo);
  pdf.setAuthor(ctx.escritorio.razaoSocial);
  pdf.setCreationDate(ctx.geradoEm);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  let logo: PDFImage | null = null;
  if (ctx.escritorio.logoBase64) {
    const bytes = Buffer.from(ctx.escritorio.logoBase64, "base64");
    logo = ctx.escritorio.logoTipo === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  }
  const [largura, altura] = A4_PAISAGEM;
  const util = largura - 2 * MARGEM;
  const texto = (p: PDFPage, t: string, x: number, y: number, fonte = normal, tamanho = CORPO, cor = TEXTO) =>
    p.drawText(limpar(fonte, t), { x, y, size: tamanho, font: fonte, color: cor });

  let pagina!: PDFPage;
  let y = 0;
  const novaPagina = () => {
    pagina = pdf.addPage(A4_PAISAGEM);
    y = altura - MARGEM;
    let xTexto = MARGEM;
    if (logo) {
      const escala = 32 / logo.height;
      pagina.drawImage(logo, { x: MARGEM, y: y - 32, width: logo.width * escala, height: 32 });
      xTexto += logo.width * escala + 10;
    }
    texto(pagina, ctx.escritorio.razaoSocial, xTexto, y - 11, negrito, 12, AZUL);
    linhasDoEscritorio(ctx).forEach((l, i) => {
      // Linha longa demais para a página: reduz a fonte em vez de passar da margem.
      const disponivel = largura - MARGEM - xTexto;
      const tamanho = Math.min(8, (8 * disponivel) / Math.max(1, normal.widthOfTextAtSize(limpar(normal, l), 8)));
      texto(pagina, l, xTexto, y - 23 - i * 10, normal, tamanho, SUAVE);
    });
    y -= 44;
    pagina.drawLine({ start: { x: MARGEM, y }, end: { x: largura - MARGEM, y }, thickness: 0.5, color: SUAVE });
    y -= 16;
  };
  const espaco = (necessario: number) => {
    if (y - necessario < MARGEM + 20) {
      novaPagina();
      return true;
    }
    return false;
  };

  novaPagina();
  texto(pagina, tabela.titulo, MARGEM, y, negrito, 14);
  y -= 16;
  for (const f of ctx.filtrosDescritos) {
    texto(pagina, f, MARGEM, y, normal, 9, SUAVE);
    y -= 12;
  }
  texto(pagina, `Gerado em ${formatarDataHora(ctx.geradoEm)} por ${ctx.geradoPor}`, MARGEM, y, normal, 8, SUAVE);
  y -= 18;

  for (const r of tabela.resumo ?? []) {
    espaco(ENTRELINHA * 2);
    const rotulo = `${r.rotulo}: `;
    texto(pagina, rotulo, MARGEM, y, negrito, 9);
    const linhas = quebrar(normal, 9, String(r.valor ?? ""), util - negrito.widthOfTextAtSize(limpar(negrito, rotulo), 9));
    linhas.forEach((l, i) => texto(pagina, l, MARGEM + negrito.widthOfTextAtSize(limpar(negrito, rotulo), 9), y - i * 11, normal, 9));
    y -= 11 * linhas.length + 2;
  }
  if (tabela.resumo?.length) y -= 8;

  // Tabela
  const pesos = tabela.colunas.map((c) => c.largura ?? 1);
  const soma = pesos.reduce((a, b) => a + b, 0);
  const larguras = pesos.map((p) => (p / soma) * util);
  const PAD = 3;
  const cabecalho = () => {
    const linhas = tabela.colunas.map((c, i) => quebrar(negrito, CORPO, c.titulo, larguras[i]! - 2 * PAD));
    const h = Math.max(...linhas.map((l) => l.length)) * ENTRELINHA + 2 * PAD;
    pagina.drawRectangle({ x: MARGEM, y: y - h, width: util, height: h, color: AZUL });
    let x = MARGEM;
    linhas.forEach((ls, i) => {
      ls.forEach((l, j) => texto(pagina, l, x + PAD, y - PAD - CORPO - j * ENTRELINHA + 1, negrito, CORPO, rgb(1, 1, 1)));
      x += larguras[i]!;
    });
    y -= h;
  };
  espaco(40);
  cabecalho();
  if (tabela.linhas.length === 0) {
    y -= 14;
    texto(pagina, "Nenhum registro para os filtros escolhidos.", MARGEM, y, normal, 9, SUAVE);
  }
  tabela.linhas.forEach((linha, n) => {
    const celulas = tabela.colunas.map((c, i) => {
      const v = linha[c.chave];
      return quebrar(normal, CORPO, v === null || v === undefined ? "" : String(v), larguras[i]! - 2 * PAD);
    });
    const h = Math.max(...celulas.map((l) => l.length)) * ENTRELINHA + 2 * PAD;
    if (espaco(h)) cabecalho();
    if (n % 2 === 1) pagina.drawRectangle({ x: MARGEM, y: y - h, width: util, height: h, color: ZEBRA });
    let x = MARGEM;
    celulas.forEach((ls, i) => {
      const col = tabela.colunas[i]!;
      ls.forEach((l, j) => {
        const xl = col.numero ? x + larguras[i]! - PAD - normal.widthOfTextAtSize(l, CORPO) : x + PAD;
        texto(pagina, l, xl, y - PAD - CORPO - j * ENTRELINHA + 1);
      });
      x += larguras[i]!;
    });
    y -= h;
  });
  if (tabela.observacao) {
    const ls = quebrar(normal, 8, tabela.observacao, util);
    espaco(ls.length * 10 + 12);
    y -= 12;
    ls.forEach((l, i) => texto(pagina, l, MARGEM, y - i * 10, normal, 8, SUAVE));
  }

  const paginas = pdf.getPages();
  paginas.forEach((p, i) => {
    texto(p, "Documento interno — contém dados pessoais protegidos pela LGPD.", MARGEM, MARGEM - 14, normal, 7, SUAVE);
    const rotulo = `Página ${i + 1} de ${paginas.length}`;
    texto(p, rotulo, largura - MARGEM - normal.widthOfTextAtSize(rotulo, 7), MARGEM - 14, normal, 7, SUAVE);
  });
  return pdf.save();
}

// Percorre as telas no navegador (celular e computador) com os dados fictícios de demonstração:
// erros de console, rolagem horizontal e o fluxo principal (andamento + prazo com prévia).
// Uso: servidor `next dev` com DEV_USUARIO_ID na porta 3200; node tests/telas/verificar-telas.mjs <pasta>
import { chromium } from "playwright-core";
const SAIDA = process.argv[2];
const base = "http://localhost:3200";
const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const problemas = [];
for (const [nome, largura, altura] of [["celular", 390, 844], ["computador", 1280, 900]]) {
  const pagina = await navegador.newPage({ viewport: { width: largura, height: altura } });
  pagina.on("console", (m) => {
    // Aviso conhecido do Prisma 7 (consultas paralelas na transação), repassado pelo servidor de desenvolvimento.
    if (m.type() === "error" && !m.text().includes("DeprecationWarning")) problemas.push(`${nome} console: ${m.text()}`);
  });
  pagina.on("pageerror", (e) => problemas.push(`${nome} erro: ${e.message}`));
  const verificar = async (rotulo) => {
    const excesso = await pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (excesso > 0) problemas.push(`${nome} ${rotulo}: rolagem horizontal de ${excesso}px`);
  };
  await pagina.goto(base + "/", { waitUntil: "networkidle" });
  await verificar("agenda");
  await pagina.screenshot({ path: `${SAIDA}/${nome}-agenda.png`, fullPage: true });

  await pagina.goto(base + "/processos", { waitUntil: "networkidle" });
  await pagina.locator(".lista-itens a").first().click();
  await pagina.waitForSelector("h1");
  await verificar("ficha do processo");
  await pagina.screenshot({ path: `${SAIDA}/${nome}-processo.png`, fullPage: true });

  // Fluxo principal: novo andamento com prazo, prévia do cálculo.
  await pagina.locator("summary", { hasText: "Novo andamento" }).click();
  const form = pagina.locator("details.painel[open] form");
  await form.locator('select[name="tipoId"]').selectOption({ label: "Publicação" });
  await form.locator('textarea[name="descricao"]').fill("Publicação fictícia para teste de tela");
  await form.locator('input[name="comPrazo"]').check();
  await form.locator('input[name="descricaoPrazo"]').fill("Contestação fictícia");
  await form.locator('input[name="dataReferencia"]').fill("2026-10-28");
  await form.locator('input[name="quantidadeDias"]').fill("15");
  await form.getByRole("button", { name: /Calcular/ }).click();
  await pagina.waitForSelector(".memoria");
  await verificar("prévia do prazo");
  await form.screenshot({ path: `${SAIDA}/${nome}-previa-prazo.png` });
  await form.getByRole("button", { name: /Salvar andamento e prazo/ }).click();
  await pagina.waitForFunction(() => document.body.innerText.includes("Contestação fictícia"), null, { timeout: 15000 });

  await pagina.locator(".grade-polos a").first().click();
  await pagina.waitForURL(/\/clientes\//);
  await pagina.waitForSelector("h2:has-text('Histórico')");
  await verificar("ficha do cliente");
  await pagina.screenshot({ path: `${SAIDA}/${nome}-cliente.png`, fullPage: true });

  for (const caminho of ["/painel", "/relatorios", "/relatorios/prazos", "/relatorios/parte-contraria", "/relatorios/cadastros-incompletos", "/configuracoes/escritorio", "/partes", "/configuracoes/usuarios", "/configuracoes/listas", "/configuracoes/status", "/configuracoes/feriados", "/configuracoes/comarcas", "/configuracoes/google-agenda"]) {
    await pagina.goto(base + caminho, { waitUntil: "networkidle" });
    await verificar(caminho);
    await pagina.screenshot({ path: `${SAIDA}/${nome}${caminho.replaceAll("/", "-")}.png`, fullPage: true });
  }
  for (const url of ["/relatorios/status/exportar?formato=xlsx", "/relatorios/prazos/exportar?formato=pdf", "/relatorios/processos/exportar?formato=pdf"]) {
    const r = await pagina.request.get(base + url);
    const tipo = r.headers()["content-type"] ?? "";
    if (r.status() !== 200 || !/pdf|spreadsheet/.test(tipo)) problemas.push(`${nome} exportação ${url}: ${r.status()} ${tipo}`);
  }
  await pagina.goto(base + "/clientes/novo", { waitUntil: "networkidle" });
  await verificar("novo cliente");
  await pagina.goto(base + "/processos/novo", { waitUntil: "networkidle" });
  await verificar("novo processo");
  await pagina.close();
}
await navegador.close();
console.log(problemas.length ? problemas.join("\n") : "Sem erros de console nem rolagem horizontal.");

// Fluxo de importação no navegador (celular), com a planilha FICTÍCIA:
// envio → revisão (responsável, separações, mesclagens) → gravar → relatório.
// Uso: servidor `next dev` com DEV_USUARIO_ID (administrador) na porta 3200;
// node tests/telas/verificar-importacao.mjs <pasta com planilha-ficticia.xlsx e ajustes-ficticios.json>
import { chromium } from "playwright-core";
const PASTA = process.argv[2];
const base = "http://localhost:3200";
const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 } });
const problemas = [];
pagina.on("pageerror", (e) => problemas.push(`erro: ${e.message}`));
const verificar = async (rotulo) => {
  const excesso = await pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (excesso > 0) problemas.push(`${rotulo}: rolagem horizontal de ${excesso}px`);
};
await pagina.goto(base + "/importacao", { waitUntil: "networkidle" });
await verificar("importação");
await pagina.setInputFiles('input[name="planilha"]', `${PASTA}/planilha-ficticia.xlsx`);
await pagina.setInputFiles('input[name="ajustes"]', `${PASTA}/ajustes-ficticios.json`);
await pagina.getByRole("button", { name: /Enviar e montar/ }).click();
await pagina.waitForURL(/\/importacao\/[0-9a-f-]{36}/, { timeout: 30000 });
await pagina.waitForSelector("text=Impede a gravação");
await verificar("revisão");
await pagina.locator('select[name="responsavel:Silas"]').selectOption({ index: 1 });
await pagina.getByRole("button", { name: /Salvar revisão/ }).click();
await pagina.waitForFunction(() => !document.body.innerText.includes("Impede a gravação"), null, { timeout: 30000 });
const escolhido = await pagina.locator('select[name="responsavel:Silas"]').inputValue();
if (!escolhido) problemas.push("revisão: responsável salvo não aparece selecionado depois de salvar");
await pagina.screenshot({ path: `${PASTA}/telas/celular-importacao-revisao.png`, fullPage: true });
if (process.argv[3] === "sem-gravar") {
  await navegador.close();
  console.log(problemas.length ? problemas.join("\n") : "Revisão salva e exibida corretamente.");
  process.exit(0);
}
pagina.once("dialog", (d) => d.accept());
await pagina.getByRole("button", { name: "Gravar no sistema" }).click();
await pagina.waitForSelector("text=Relatório da importação", { timeout: 60000 });
await verificar("relatório");
await pagina.screenshot({ path: `${PASTA}/telas/celular-importacao-relatorio.png`, fullPage: true });
await navegador.close();
console.log(problemas.length ? problemas.join("\n") : "Fluxo de importação concluído sem erros nem rolagem horizontal.");

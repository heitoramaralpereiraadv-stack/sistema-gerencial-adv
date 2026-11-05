// Cifragem dos dados críticos (D5), busca de pessoas e Agenda (seção 5, D12, 4.4).

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UsuarioAtual } from "@/servidor/auth/usuario";
import { criarPrisma } from "@/servidor/db/prisma";
import { obterAgenda } from "@/servidor/servicos/agenda";
import { atualizarPessoa, buscarPessoas, criarPessoa, obterFichaCliente } from "@/servidor/servicos/pessoas";
import { criarPrazo } from "@/servidor/servicos/prazos";
import { criarProcesso } from "@/servidor/servicos/processos";
import { criarUsuario } from "../apoio/fixtures";

const prisma = criarPrisma();
afterAll(() => prisma.$disconnect());

let advogado: UsuarioAtual, assistente: UsuarioAtual;
beforeAll(async () => {
  advogado = await criarUsuario(prisma, "ADVOGADO");
  assistente = await criarUsuario(prisma, "ASSISTENTE");
});

const pessoaFicticia = {
  tipo: "PF",
  nome: "Maria Fictícia de Teste",
  cpfCnpj: "123.456.789-09",
  rg: "1234567 SSP/GO",
  ehCliente: "on",
  informacoesReservadas: "Renda e dado de saúde fictícios",
  contatoTipo: ["TELEFONE", "EMAIL"],
  contatoValor: ["(62) 99999-0001", "maria@exemplo.invalid"],
  documentoTipo: ["NUMERO_BENEFICIO"],
  documentoNumero: ["123.456.789-0"],
  documentoDescricao: ["BPC fictício"],
};

describe("dados críticos cifrados (D5)", () => {
  let id: string;
  beforeAll(async () => {
    id = (await criarPessoa(assistente, pessoaFicticia, prisma)).id;
  });

  it("nada crítico fica em claro no banco, nem no histórico", async () => {
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    const linha = JSON.stringify((await c.query("SELECT * FROM pessoa WHERE id = $1", [id])).rows);
    const docs = JSON.stringify((await c.query('SELECT * FROM documento_pessoa WHERE "pessoaId" = $1', [id])).rows);
    const hist = JSON.stringify((await c.query("SELECT * FROM historico").then((r) => r.rows)));
    await c.end();
    for (const segredo of ["123.456.789-09", "12345678909", "1234567 SSP", "Renda e dado", "123.456.789-0"]) {
      expect(linha).not.toContain(segredo);
      expect(docs).not.toContain(segredo);
      expect(hist).not.toContain(segredo);
    }
  });

  it("a ficha decifra e registra o acesso", async () => {
    const f = await obterFichaCliente(advogado, id, prisma);
    expect(f).toMatchObject({ cpfCnpj: "123.456.789-09", rg: "1234567 SSP/GO", informacoesReservadas: "Renda e dado de saúde fictícios" });
    expect(f.documentos[0]).toMatchObject({ tipo: "NUMERO_BENEFICIO", numero: "123.456.789-0" });
    expect(await prisma.registroAcesso.count({ where: { registroId: id, usuarioId: advogado.id } })).toBe(1);
  });

  it("busca por CPF (com ou sem pontuação), telefone e nome", async () => {
    for (const termo of ["12345678909", "123.456.789-09", "99999-0001", "fictícia de"]) {
      expect((await buscarPessoas(termo, {}, prisma)).map((p) => p.id)).toContain(id);
    }
  });

  it("CPF inválido e CPF repetido são recusados", async () => {
    await expect(criarPessoa(assistente, { ...pessoaFicticia, cpfCnpj: "123.456.789-00" }, prisma)).rejects.toThrow(/CPF inválido/);
    await expect(criarPessoa(assistente, pessoaFicticia, prisma)).rejects.toThrow(/já cadastrado/);
  });

  it("salvar sem mudanças não gera histórico; mudar o telefone gera só a troca do contato", async () => {
    const antes = await prisma.historico.count();
    await atualizarPessoa(assistente, id, pessoaFicticia, prisma);
    expect(await prisma.historico.count()).toBe(antes);
    const ultimo = (await prisma.historico.findFirstOrThrow({ orderBy: { id: "desc" } })).id;
    await atualizarPessoa(assistente, id, { ...pessoaFicticia, contatoValor: ["(62) 99999-0002", "maria@exemplo.invalid"] }, prisma);
    const novos = await prisma.historico.findMany({ where: { id: { gt: ultimo } } });
    expect([...new Set(novos.map((h) => h.entidade))]).toEqual(["contato"]);
    expect(new Set(novos.map((h) => h.operacao))).toEqual(new Set(["CRIACAO", "EXCLUSAO"]));
  });

  it("CNPJ alfanumérico é aceito para PJ", async () => {
    const p = await criarPessoa(assistente, { tipo: "PJ", nome: "Empresa Fictícia", cpfCnpj: "12.ABC.345/01DE-35" }, prisma);
    expect(p.cpfCnpjHash).toBeTruthy();
  });
});

describe("Agenda", () => {
  it("separa vencidos, hoje e próximos 7 dias úteis, com alertas pelo calendário do processo", async () => {
    const area = await prisma.itemLista.findFirstOrThrow({ where: { lista: "AREA", valor: "Cível" } });
    const status = await prisma.statusProcesso.findFirstOrThrow({ where: { nome: "Em andamento" } });
    const goiania = await prisma.comarca.findFirstOrThrow({ where: { nome: "Goiânia" } });
    const p = await criarProcesso(advogado, { areaId: area.id, statusId: status.id, responsavelId: advogado.id, comarcaId: goiania.id }, [], prisma);
    const novo = (descricao: string, dataReferencia: string, quantidadeDias: number) =>
      criarPrazo(advogado, p.id, { descricao, formaIntimacao: "DATA_INFORMADA", dataReferencia, quantidadeDias, tipoContagem: "UTEIS", emDobro: false, responsavelId: advogado.id }, prisma);
    // "Hoje" fictício: seg 09/11/2026. Intimação qua 04/11 → início qui 05/11.
    await novo("Vencido", "2026-11-04", 2); // 05(1) 06(2) → venceu sex 06/11
    await novo("Hoje", "2026-11-04", 3); // … 09(3) → vence hoje
    await novo("Vermelho", "2026-11-04", 5); // 10(4) 11(5) → 2 dias úteis
    await novo("Amarelo", "2026-11-04", 9); // 12(6) 13(7) [14,15] 16(8) 17(9) → 6 dias úteis
    await novo("Fora", "2026-11-04", 15); // além de 7 dias úteis (15/11 domingo, 20/11 feriado)

    const a = await obterAgenda(advogado, "meus", "2026-11-09", prisma);
    const desc = (l: { descricao: string }[]) => l.map((x) => x.descricao);
    expect(desc(a.vencidos)).toEqual(["Vencido"]);
    expect(a.vencidos[0]?.alerta).toBe("vencido");
    expect(desc(a.deHoje)).toEqual(["Hoje"]);
    expect(a.deHoje[0]?.alerta).toBe("vermelho");
    expect(a.proximos.map((x) => [x.descricao, x.diasUteis, x.alerta])).toEqual([
      ["Vermelho", 2, "vermelho"],
      ["Amarelo", 6, "amarelo"],
    ]);

    // Filtro por responsável: outro usuário não vê os prazos do advogado em "meus".
    const outro = await obterAgenda(assistente, "meus", "2026-11-09", prisma);
    expect(outro.proximos.filter((x) => x.processo.id === p.id)).toHaveLength(0);
    const todos = await obterAgenda(assistente, "todos", "2026-11-09", prisma);
    expect(todos.proximos.filter((x) => x.processo.id === p.id)).toHaveLength(2);
  });
});

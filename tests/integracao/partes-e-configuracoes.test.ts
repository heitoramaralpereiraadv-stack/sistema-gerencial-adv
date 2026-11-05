// Mesclagem de partes duplicadas e configurações (somente administrador). Dados fictícios.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UsuarioAtual } from "@/servidor/auth/usuario";
import { criarPrisma } from "@/servidor/db/prisma";
import { ProibidoError } from "@/servidor/erros";
import {
  carregarFeriadosPadrao,
  criarFeriado,
  criarItem,
  editarItem,
  editarStatus,
  mesclarComarcas,
} from "@/servidor/servicos/configuracoes";
import { listarPartesContrarias, mesclarPessoas } from "@/servidor/servicos/partes";
import { criarPessoa } from "@/servidor/servicos/pessoas";
import { criarProcesso } from "@/servidor/servicos/processos";
import { criarComarca } from "@/servidor/servicos/referencias";
import { criarUsuario } from "../apoio/fixtures";

const prisma = criarPrisma();
afterAll(() => prisma.$disconnect());

let admin: UsuarioAtual, advogado: UsuarioAtual, assistente: UsuarioAtual;
let base: { areaId: string; statusId: string };
beforeAll(async () => {
  admin = await criarUsuario(prisma, "ADMINISTRADOR");
  advogado = await criarUsuario(prisma, "ADVOGADO");
  assistente = await criarUsuario(prisma, "ASSISTENTE");
  base = {
    areaId: (await prisma.itemLista.findFirstOrThrow({ where: { lista: "AREA" } })).id,
    statusId: (await prisma.statusProcesso.findFirstOrThrow({ where: { nome: "Em andamento" } })).id,
  };
});

describe("partes contrárias", () => {
  it("mescla duplicados: processos passam para o cadastro que fica e o duplicado é excluído", async () => {
    const certo = await criarPessoa(admin, { tipo: "PJ", nome: "Banco Duplicado Fictício S.A." }, prisma);
    const dup = await criarPessoa(admin, { tipo: "PJ", nome: "Duplicado Fictício", cpfCnpj: "11.222.333/0001-81",
      contatoTipo: ["TELEFONE"], contatoValor: ["(62) 3000-0000"] }, prisma);
    const cliente = await criarPessoa(admin, { tipo: "PF", nome: "Cliente Fictício da Mesclagem", ehCliente: "on" }, prisma);
    const p1 = await criarProcesso(advogado, { ...base, responsavelId: advogado.id }, [
      { pessoaId: cliente.id, polo: "ATIVO", qualificacaoIds: [], ehClienteDoEscritorio: "on" },
      { pessoaId: dup.id, polo: "PASSIVO", qualificacaoIds: [] },
    ], prisma);
    const p2 = await criarProcesso(advogado, { ...base, responsavelId: advogado.id }, [
      { pessoaId: certo.id, polo: "PASSIVO", qualificacaoIds: [] },
      { pessoaId: dup.id, polo: "PASSIVO", qualificacaoIds: [] },
    ], prisma);

    const antes = await listarPartesContrarias(admin, { termo: "Duplicado Fictício" }, prisma);
    expect(antes.map((p) => [p.nome, p.processos])).toEqual([
      ["Duplicado Fictício", 2],
      ["Banco Duplicado Fictício S.A.", 1],
    ]);

    await expect(mesclarPessoas(advogado, { manterId: certo.id, removerId: dup.id }, prisma)).rejects.toThrowError(ProibidoError);
    await mesclarPessoas(admin, { manterId: certo.id, removerId: dup.id }, prisma);

    const depois = await listarPartesContrarias(admin, { termo: "Duplicado Fictício" }, prisma);
    expect(depois.map((p) => [p.nome, p.processos])).toEqual([["Banco Duplicado Fictício S.A.", 2]]);
    expect(await prisma.parteProcesso.count({ where: { processoId: p2.id } })).toBe(1);
    expect(await prisma.parteProcesso.count({ where: { processoId: p1.id, pessoaId: certo.id } })).toBe(1);
    const final = await prisma.pessoa.findUniqueOrThrow({ where: { id: certo.id }, include: { contatos: true } });
    expect(final.cpfCnpjHash).toBeTruthy();
    expect(final.contatos.map((c) => c.valor)).toEqual(["(62) 3000-0000"]);
    expect((await prisma.pessoa.findUniqueOrThrow({ where: { id: dup.id } })).excluidoEm).toBeInstanceOf(Date);
  });

  it("recusa mesclar cadastros com CPF/CNPJ diferentes", async () => {
    const a = await criarPessoa(admin, { tipo: "PF", nome: "Pessoa A Fictícia", cpfCnpj: "000.000.001-91" }, prisma);
    const b = await criarPessoa(admin, { tipo: "PF", nome: "Pessoa B Fictícia", cpfCnpj: "529.982.247-25" }, prisma);
    await expect(mesclarPessoas(admin, { manterId: a.id, removerId: b.id }, prisma)).rejects.toThrow(/não são a mesma pessoa/);
  });
});

describe("configurações", () => {
  it("só administrador altera listas, status e feriados", async () => {
    for (const u of [advogado, assistente]) {
      await expect(criarItem(u, { lista: "TIPO_AUDIENCIA", valor: "x" }, prisma)).rejects.toThrowError(ProibidoError);
      await expect(carregarFeriadosPadrao(u, 2028, prisma)).rejects.toThrowError(ProibidoError);
    }
  });

  it("inclui tipo de audiência e desativa item sem apagar", async () => {
    const item = await criarItem(admin, { lista: "TIPO_AUDIENCIA", valor: "Instrução fictícia" }, prisma);
    await expect(criarItem(admin, { lista: "TIPO_AUDIENCIA", valor: "Instrução fictícia" }, prisma)).rejects.toThrow(/já existe/);
    const r = await editarItem(admin, item.id, { valor: "Instrução fictícia", ordem: 0, ativo: "" }, prisma);
    expect(r.ativo).toBe(false);
  });

  it("não desativa status em uso", async () => {
    await criarProcesso(advogado, { ...base, responsavelId: advogado.id }, [], prisma);
    await expect(editarStatus(admin, base.statusId, { nome: "Em andamento", ordem: 1, ativo: "" }, prisma)).rejects.toThrow(/Há processos/);
  });

  it("feriado municipal exige comarca; padrão de um ano não duplica", async () => {
    await expect(criarFeriado(admin, { data: "2028-03-01", abrangencia: "MUNICIPAL", natureza: "FERIADO", descricao: "x" }, prisma)).rejects.toThrow(/exige a comarca/);
    const n1 = await carregarFeriadosPadrao(admin, 2028, prisma);
    const n2 = await carregarFeriadosPadrao(admin, 2028, prisma);
    expect(n1).toBe(15); // 9 nacionais fixos + 2 Goiânia + 2 Carnaval + Cinzas + Sexta-feira Santa
    expect(n2).toBe(0);
  });

  it("mescla comarca duplicada: processos passam para a correta", async () => {
    const certa = await criarComarca(assistente, { nome: "Cidade Fictícia", uf: "GO" }, prisma);
    const errada = await criarComarca(advogado, { nome: "Cidade Ficticia", uf: "GO" }, prisma);
    const p = await criarProcesso(advogado, { ...base, responsavelId: advogado.id, comarcaId: errada.id }, [], prisma);
    await mesclarComarcas(admin, { manterId: certa.id, removerId: errada.id }, prisma);
    expect((await prisma.processo.findUniqueOrThrow({ where: { id: p.id } })).comarcaId).toBe(certa.id);
    expect(await prisma.comarca.count({ where: { id: errada.id } })).toBe(0);
  });
});

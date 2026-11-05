// Critério 8.2: "Toda alteração aparece no histórico com usuário e data".

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { comUsuario, criarPrisma } from "@/servidor/db/prisma";
import { comoSeed, criarUsuario } from "../apoio/fixtures";

const prisma = criarPrisma();
afterAll(() => prisma.$disconnect());

describe("histórico de alterações", () => {
  let usuarioId: string;
  beforeAll(async () => {
    usuarioId = (await criarUsuario(prisma, "ASSISTENTE")).id;
  });

  const historicoDe = (registroId: string) =>
    prisma.historico.findMany({ where: { registroId }, orderBy: { id: "asc" } });

  it("criação registra cada campo preenchido, com usuário e data", async () => {
    const antes = new Date();
    const p = await comUsuario(usuarioId, (tx) =>
      tx.pessoa.create({ data: { tipo: "PF", nome: "Fulana Fictícia", ehCliente: true } }),
      prisma,
    );
    const h = await historicoDe(p.id);
    expect(h.length).toBeGreaterThan(0);
    expect(h.every((l) => l.operacao === "CRIACAO" && l.usuarioId === usuarioId && l.entidade === "pessoa")).toBe(true);
    expect(h.every((l) => l.dataHora >= new Date(antes.getTime() - 1000))).toBe(true);
    expect(h.find((l) => l.campo === "nome")).toMatchObject({ valorAnterior: null, valorNovo: "Fulana Fictícia" });
  });

  it("alteração registra valor anterior e novo só dos campos alterados", async () => {
    const p = await comUsuario(usuarioId, (tx) => tx.pessoa.create({ data: { tipo: "PF", nome: "Nome Antigo" } }), prisma);
    await comUsuario(usuarioId, (tx) => tx.pessoa.update({ where: { id: p.id }, data: { nome: "Nome Novo" } }), prisma);
    const alteracoes = (await historicoDe(p.id)).filter((l) => l.operacao === "ALTERACAO");
    expect(alteracoes).toHaveLength(1);
    expect(alteracoes[0]).toMatchObject({ campo: "nome", valorAnterior: "Nome Antigo", valorNovo: "Nome Novo", usuarioId });
  });

  it("exclusão lógica aparece como EXCLUSAO", async () => {
    const p = await comUsuario(usuarioId, (tx) => tx.pessoa.create({ data: { tipo: "PF", nome: "Para Excluir" } }), prisma);
    await comUsuario(usuarioId, (tx) => tx.pessoa.update({ where: { id: p.id }, data: { excluidoEm: new Date() } }), prisma);
    const h = await historicoDe(p.id);
    expect(h.find((l) => l.operacao === "EXCLUSAO")).toMatchObject({ campo: "excluidoEm", usuarioId });
  });

  it("CPF e RG cifrados não aparecem no histórico", async () => {
    const p = await comUsuario(usuarioId, (tx) =>
      tx.pessoa.create({ data: { tipo: "PF", nome: "Com Documento", cpfCnpjCifrado: "cifra-ficticia", cpfCnpjHash: `hash-${Date.now()}` } }),
      prisma,
    );
    const h = await historicoDe(p.id);
    expect(h.find((l) => l.campo === "cpfCnpjCifrado")?.valorNovo).toBe("[protegido]");
    expect(h.find((l) => l.campo === "cpfCnpjHash")?.valorNovo).toBe("[protegido]");
  });

  it("recusa alteração sem usuário identificado (mesmo fora das telas)", async () => {
    await expect(prisma.pessoa.create({ data: { tipo: "PF", nome: "Sem Usuário" } })).rejects.toThrow(/sem usuário identificado/);
  });

  it("histórico não pode ser alterado nem apagado", async () => {
    const p = await comUsuario(usuarioId, (tx) => tx.pessoa.create({ data: { tipo: "PF", nome: "Imutável" } }), prisma);
    const [linha] = await historicoDe(p.id);
    await expect(prisma.historico.update({ where: { id: linha!.id }, data: { valorNovo: "x" } })).rejects.toThrow(/somente leitura/);
    await expect(prisma.historico.delete({ where: { id: linha!.id } })).rejects.toThrow(/somente leitura/);
    await expect(prisma.$executeRawUnsafe("TRUNCATE historico")).rejects.toThrow(/somente leitura/);
  });

  it("carga inicial (seed) é registrada sem usuário", async () => {
    const p = await comoSeed(prisma, (tx) => tx.pessoa.create({ data: { tipo: "PJ", nome: "Empresa Fictícia" } }));
    const h = await historicoDe(p.id);
    expect(h.length).toBeGreaterThan(0);
    expect(h.every((l) => l.usuarioId === null)).toBe(true);
  });
});

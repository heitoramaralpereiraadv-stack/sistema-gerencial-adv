// Segredo de justiça e "ver todos ou só os seus" (seções 2 e 7), aplicados na consulta.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UsuarioAtual } from "@/servidor/auth/usuario";
import { criarPrisma } from "@/servidor/db/prisma";
import { filtroProcessosVisiveis } from "@/servidor/permissoes/visibilidade";
import { criarProcesso, criarUsuario } from "../apoio/fixtures";

const prisma = criarPrisma();
afterAll(() => prisma.$disconnect());

let admin: UsuarioAtual, responsavel: UsuarioAtual, outroAdvogado: UsuarioAtual, restrito: UsuarioAtual, assistente: UsuarioAtual;
let comum: string, segredo: string, doRestrito: string;

beforeAll(async () => {
  admin = await criarUsuario(prisma, "ADMINISTRADOR");
  responsavel = await criarUsuario(prisma, "ADVOGADO");
  outroAdvogado = await criarUsuario(prisma, "ADVOGADO");
  restrito = await criarUsuario(prisma, "ADVOGADO", { veTodosProcessos: false });
  assistente = await criarUsuario(prisma, "ASSISTENTE");
  comum = (await criarProcesso(prisma, responsavel.id)).id;
  segredo = (await criarProcesso(prisma, responsavel.id, { segredoJustica: true })).id;
  doRestrito = (await criarProcesso(prisma, restrito.id)).id;
});

async function ve(usuario: UsuarioAtual) {
  const ids = [comum, segredo, doRestrito];
  const visiveis = await prisma.processo.findMany({
    where: { id: { in: ids }, AND: [filtroProcessosVisiveis(usuario)] },
    select: { id: true },
  });
  const v = new Set(visiveis.map((p) => p.id));
  return { comum: v.has(comum), segredo: v.has(segredo), doRestrito: v.has(doRestrito) };
}

describe("visibilidade de processos", () => {
  it("administrador vê todos, inclusive em segredo de justiça", async () => {
    expect(await ve(admin)).toEqual({ comum: true, segredo: true, doRestrito: true });
  });

  it("responsável vê o próprio processo em segredo", async () => {
    expect(await ve(responsavel)).toEqual({ comum: true, segredo: true, doRestrito: true });
  });

  it("outro advogado não vê processo em segredo", async () => {
    expect(await ve(outroAdvogado)).toEqual({ comum: true, segredo: false, doRestrito: true });
  });

  it("assistente não vê processo em segredo", async () => {
    expect(await ve(assistente)).toEqual({ comum: true, segredo: false, doRestrito: true });
  });

  it("advogado configurado para ver só os seus vê apenas aqueles de que é responsável", async () => {
    expect(await ve(restrito)).toEqual({ comum: false, segredo: false, doRestrito: true });
  });
});

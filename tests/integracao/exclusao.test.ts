// Critério 8.2: "Assistente não consegue excluir registro, nem por chamada direta ao servidor".

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { UsuarioAtual } from "@/servidor/auth/usuario";
import { comUsuario, criarPrisma } from "@/servidor/db/prisma";
import { ProibidoError } from "@/servidor/erros";
import { excluirRegistro } from "@/servidor/servicos/exclusao";
import { criarProcesso, criarUsuario } from "../apoio/fixtures";

// A Server Action é chamada diretamente, como faria um POST forjado; só a sessão é simulada.
const sessao = vi.hoisted(() => ({ usuario: null as UsuarioAtual | null }));
vi.mock("@/servidor/auth/sessao", () => ({ exigirUsuario: async () => sessao.usuario! }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
const { excluirRegistroAcao } = await import("@/app/acoes/registros");

const prisma = criarPrisma();
afterAll(() => prisma.$disconnect());

let admin: UsuarioAtual, advogado: UsuarioAtual, assistente: UsuarioAtual;
beforeAll(async () => {
  admin = await criarUsuario(prisma, "ADMINISTRADOR");
  advogado = await criarUsuario(prisma, "ADVOGADO");
  assistente = await criarUsuario(prisma, "ASSISTENTE");
});

let processoId: string;
beforeEach(async () => {
  processoId = (await criarProcesso(prisma, advogado.id)).id;
});

const excluido = async () => (await prisma.processo.findUniqueOrThrow({ where: { id: processoId } })).excluidoEm;

describe("exclusão de registros", () => {
  it("assistente: serviço recusa e o registro continua", async () => {
    await expect(excluirRegistro(assistente, "processo", processoId, prisma)).rejects.toThrowError(ProibidoError);
    expect(await excluido()).toBeNull();
  });

  it("assistente: chamada direta à Server Action é recusada", async () => {
    sessao.usuario = assistente;
    const r = await excluirRegistroAcao("processo", processoId);
    expect(r).toEqual({ ok: false, erro: "Seu perfil não tem permissão para esta ação." });
    expect(await excluido()).toBeNull();
  });

  it("assistente: recusado para todas as entidades", async () => {
    sessao.usuario = assistente;
    for (const entidade of ["pessoa", "processo", "andamento", "prazo", "audiencia"]) {
      expect((await excluirRegistroAcao(entidade, processoId)).ok).toBe(false);
    }
    expect(await excluido()).toBeNull();
  });

  it("advogado: recusado (exclusão só por administrador — pendência D1)", async () => {
    sessao.usuario = advogado;
    expect((await excluirRegistroAcao("processo", processoId)).ok).toBe(false);
    expect(await excluido()).toBeNull();
  });

  it("administrador: exclusão lógica, registro preservado e histórico gravado", async () => {
    sessao.usuario = admin;
    expect(await excluirRegistroAcao("processo", processoId)).toEqual({ ok: true, dados: undefined });
    expect(await excluido()).toBeInstanceOf(Date);
    const h = await prisma.historico.findFirst({ where: { registroId: processoId, operacao: "EXCLUSAO" } });
    expect(h?.usuarioId).toBe(admin.id);
  });

  it("entrada forjada (entidade ou id inválidos) é recusada", async () => {
    sessao.usuario = admin;
    expect((await excluirRegistroAcao("historico", processoId)).ok).toBe(false);
    expect((await excluirRegistroAcao("processo", "1 OR 1=1")).ok).toBe(false);
  });

  it("exclusão física é bloqueada no banco, mesmo para quem tem acesso direto", async () => {
    await expect(
      comUsuario(admin.id, (tx) => tx.processo.delete({ where: { id: processoId } }), prisma),
    ).rejects.toThrow(/Exclusão física de processo não permitida/);
    expect(await prisma.processo.count({ where: { id: processoId } })).toBe(1);
  });
});

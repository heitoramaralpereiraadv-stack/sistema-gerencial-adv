import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UsuarioAtual } from "@/servidor/auth/usuario";
import { criarPrisma } from "@/servidor/db/prisma";
import { ProibidoError } from "@/servidor/erros";
import { alterarUsuario, convidarUsuario, definirAtivo, type ProvedorAuth } from "@/servidor/servicos/usuarios";
import { comoSeed, criarUsuario } from "../apoio/fixtures";

const prisma = criarPrisma();
afterAll(() => prisma.$disconnect());

/** Provedor de autenticação falso: registra chamadas em vez de falar com o Supabase. */
function provedorFalso() {
  const chamadas: string[] = [];
  const provedor: ProvedorAuth = {
    convidar: async (email) => (chamadas.push(`convidar ${email}`), { id: randomUUID() }),
    bloquear: async (id) => void chamadas.push(`bloquear ${id}`),
    desbloquear: async (id) => void chamadas.push(`desbloquear ${id}`),
  };
  return { provedor, chamadas };
}

describe("gestão de usuários", () => {
  let admin: UsuarioAtual, advogado: UsuarioAtual;
  beforeAll(async () => {
    // Deixa um único administrador ativo neste banco de teste.
    await comoSeed(prisma, (tx) => tx.usuario.updateMany({ where: { perfil: "ADMINISTRADOR" }, data: { ativo: false } }));
    admin = await criarUsuario(prisma, "ADMINISTRADOR");
    advogado = await criarUsuario(prisma, "ADVOGADO");
  });

  it("só administrador convida; o convite cria o usuário com o perfil escolhido", async () => {
    const { provedor, chamadas } = provedorFalso();
    const dados = { nome: "Pessoa Convidada", email: "Convidada@Exemplo.invalid", perfil: "ASSISTENTE" as const };
    await expect(convidarUsuario(advogado, dados, provedor, prisma)).rejects.toThrowError(ProibidoError);
    expect(chamadas).toEqual([]);
    const u = await convidarUsuario(admin, dados, provedor, prisma);
    expect(u).toMatchObject({ email: "convidada@exemplo.invalid", perfil: "ASSISTENTE", ativo: true });
    expect(chamadas).toEqual(["convidar convidada@exemplo.invalid"]);
  });

  it("desativar bloqueia também no provedor de autenticação", async () => {
    const { provedor, chamadas } = provedorFalso();
    const alvo = await criarUsuario(prisma, "ASSISTENTE");
    await definirAtivo(admin, alvo.id, false, provedor, prisma);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: alvo.id } })).ativo).toBe(false);
    expect(chamadas).toEqual([`bloquear ${alvo.id}`]);
  });

  it("administrador não desativa a si mesmo", async () => {
    const { provedor } = provedorFalso();
    await expect(definirAtivo(admin, admin.id, false, provedor, prisma)).rejects.toThrow(/próprio acesso/);
  });

  it("o último administrador ativo não pode ser rebaixado", async () => {
    await expect(alterarUsuario(admin, admin.id, { perfil: "ADVOGADO" }, prisma)).rejects.toThrow(/pelo menos um administrador/);
  });

  it("mudança de perfil fica no histórico com quem alterou", async () => {
    const alvo = await criarUsuario(prisma, "ASSISTENTE");
    await alterarUsuario(admin, alvo.id, { perfil: "ADVOGADO" }, prisma);
    const h = await prisma.historico.findFirst({ where: { registroId: alvo.id, campo: "perfil" , operacao: "ALTERACAO" } });
    expect(h).toMatchObject({ valorAnterior: "ASSISTENTE", valorNovo: "ADVOGADO", usuarioId: admin.id });
  });
});

describe("API pública do Supabase fechada", () => {
  it.each(["anon", "authenticated"])("papel %s não lê nem grava nenhuma tabela", async (papel) => {
    const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await cliente.connect();
    try {
      const { rows } = await cliente.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
      );
      expect(rows.length).toBeGreaterThan(15);
      await cliente.query(`SET ROLE ${papel}`);
      for (const { tablename } of rows) {
        await expect(cliente.query(`SELECT 1 FROM public."${tablename}" LIMIT 1`)).rejects.toThrow(/permission denied/);
      }
    } finally {
      await cliente.end();
    }
  });

  it("RLS está ligado em todas as tabelas", async () => {
    const r = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity`;
    expect(Number(r[0]!.n)).toBe(0);
  });
});

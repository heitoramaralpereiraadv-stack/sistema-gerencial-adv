// Recria o banco de teste do zero e aplica as migrações, na ordem. Só dados fictícios.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

export default async function prepararBanco() {
  const url = process.env.DATABASE_URL_TESTE;
  if (!url) throw new Error("Defina DATABASE_URL_TESTE (Postgres local) para os testes de integração.");
  if (!/localhost|127\.0\.0\.1/.test(url)) throw new Error("DATABASE_URL_TESTE deve apontar para um banco local.");

  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  await cliente.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  // Papéis que o Supabase usa na API pública; aqui servem para provar que ficam sem acesso.
  for (const papel of ["anon", "authenticated"]) {
    await cliente.query(
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${papel}') THEN CREATE ROLE ${papel} NOLOGIN; END IF; END $$;`,
    );
    await cliente.query(`GRANT USAGE ON SCHEMA public TO ${papel}`);
    // Simula o privilégio padrão que o Supabase concede; a migração deve revogá-lo.
    await cliente.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${papel}`);
  }
  const pasta = join(process.cwd(), "prisma", "migrations");
  for (const migracao of readdirSync(pasta).filter((d) => /^\d/.test(d)).sort()) {
    await cliente.query(readFileSync(join(pasta, migracao, "migration.sql"), "utf8"));
  }
  await cliente.end();

  // Tabelas de referência (tribunais, listas, status, feriados padrão).
  const { criarPrisma } = await import("@/servidor/db/prisma");
  const { cargaInicial } = await import("@/servidor/seed/carga-inicial");
  const prisma = criarPrisma(url);
  await cargaInicial(prisma, [2026, 2027]);
  await prisma.$disconnect();
}

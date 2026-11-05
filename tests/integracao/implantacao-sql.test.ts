// A implantação por SQL puro (para o Supabase via HTTPS) deve deixar o banco igual ao
// `prisma migrate deploy` + carga inicial. Testado num banco local novo e vazio.

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lerMigracoes, SQL_TABELA_MIGRACOES, SQL_VERIFICACAO, sqlCargaInicial, sqlDaMigracao, sqlUsuario } from "@/servidor/implantacao/sql";

const BANCO = "sg_teste_implantacao";
const base = process.env.DATABASE_URL!;
let cliente: pg.Client;

beforeAll(async () => {
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${BANCO}`);
  await admin.query(`CREATE DATABASE ${BANCO}`);
  await admin.end();
  cliente = new pg.Client({ connectionString: base.replace(/\/[^/?]+(\?|$)/, `/${BANCO}$1`) });
  await cliente.connect();
  for (const papel of ["anon", "authenticated"]) {
    await cliente.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${papel}`);
  }
});

afterAll(async () => {
  await cliente.end();
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${BANCO}`);
  await admin.end();
});

const contar = async (tabela: string) => Number((await cliente.query(`SELECT count(*) FROM ${tabela}`)).rows[0].count);

describe("implantação por SQL", () => {
  it("aplica todas as migrações e registra cada uma em _prisma_migrations", async () => {
    await cliente.query(SQL_TABELA_MIGRACOES);
    const migracoes = lerMigracoes();
    for (const m of migracoes) await cliente.query(sqlDaMigracao(m));
    const registradas = await cliente.query(`SELECT migration_name, checksum FROM "_prisma_migrations" ORDER BY migration_name`);
    expect(registradas.rows.map((r) => r.migration_name)).toEqual(migracoes.map((m) => m.nome));
    expect(registradas.rows.map((r) => r.checksum)).toEqual(migracoes.map((m) => m.checksum));
  });

  it("carga inicial completa e idempotente", async () => {
    await cliente.query(sqlCargaInicial([2026, 2027]));
    const antes = await Promise.all(["tribunal", "item_lista", "status_processo", "comarca", "feriado", "configuracao_escritorio"].map(contar));
    expect(antes).toEqual([57, 42, 10, 1, 30, 1]);
    await cliente.query(sqlCargaInicial([2026, 2027]));
    expect(await Promise.all(["tribunal", "item_lista", "status_processo", "comarca", "feriado", "configuracao_escritorio"].map(contar))).toEqual(antes);
    const sede = await cliente.query(`SELECT "sedeCidade", "sedeUf" FROM tribunal WHERE codigo = '5.15'`);
    expect(sede.rows[0]).toEqual({ sedeCidade: "Campinas", sedeUf: "SP" });
    const escritorio = await cliente.query(`SELECT cnpj, "registroOab", telefone, "logoTipo", length("logoBase64") > 1000 AS com_logo FROM configuracao_escritorio`);
    expect(escritorio.rows[0]).toEqual({ cnpj: "24.605.755/0001-88", registroOab: "OAB/GO 001793", telefone: "(62) 3928-0055", logoTipo: "image/jpeg", com_logo: true });
  });

  it("cria usuário inicial com histórico de carga e passa na verificação", async () => {
    await cliente.query(sqlUsuario({ id: "00000000-0000-4000-8000-000000000001", nome: "Administrador Fictício", email: "Admin@Exemplo.invalid", perfil: "ADMINISTRADOR" }));
    const v = (await cliente.query(SQL_VERIFICACAO)).rows[0];
    expect(v).toMatchObject({ tabelas_sem_rls: "0", privilegios_publicos: "0", tribunais: "57", status: "10", feriados: "30", administradores: "1" });
    expect(Number(v.migracoes)).toBe(lerMigracoes().length);
    expect(Number(v.gatilhos_historico)).toBeGreaterThan(15);
    const h = await cliente.query(`SELECT count(*) FROM historico WHERE entidade = 'usuario'`);
    expect(Number(h.rows[0].count)).toBeGreaterThan(0);
  });

  it("texto com aspas não quebra o SQL", async () => {
    const { lit } = await import("@/servidor/implantacao/sql");
    expect(lit("Maria D'Ávila")).toBe("'Maria D''Ávila'");
    expect(lit(null)).toBe("NULL");
  });
});

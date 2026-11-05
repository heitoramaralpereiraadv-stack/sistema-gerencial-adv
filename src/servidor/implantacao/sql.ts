// Banco em SQL puro, para aplicar pelo endpoint HTTPS de consultas do Supabase quando não há
// acesso direto à porta do Postgres. Migrações ficam registradas em _prisma_migrations, como
// se tivessem sido aplicadas por `prisma migrate deploy`.

import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TRIBUNAIS } from "@/dominio/cnj/tribunais";
import { feriadosPadrao } from "@/dominio/prazos/feriados-padrao";
import { ESCRITORIO, LISTAS_INICIAIS, logoDoEscritorio, STATUS_INICIAIS } from "../seed/carga-inicial";

/** Literal SQL seguro (aspas simples duplicadas). */
export const lit = (v: string | number | boolean | null | undefined): string =>
  v === null || v === undefined ? "NULL" : typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v);

/** DDL que o Prisma usa para a tabela de controle de migrações. */
export const SQL_TABELA_MIGRACOES = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);`;

export interface Migracao {
  nome: string;
  sql: string;
  checksum: string;
}

export function lerMigracoes(pasta = join(process.cwd(), "prisma", "migrations")): Migracao[] {
  return readdirSync(pasta)
    .filter((d) => /^\d/.test(d))
    .sort()
    .map((nome) => {
      const sql = readFileSync(join(pasta, nome, "migration.sql"), "utf8");
      return { nome, sql, checksum: createHash("sha256").update(sql).digest("hex") };
    });
}

/** Uma migração e o seu registro, numa transação só. */
export function sqlDaMigracao(m: Migracao): string {
  return `BEGIN;
${m.sql}
INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count")
VALUES (${lit(randomUUID())}, ${lit(m.checksum)}, now(), ${lit(m.nome)}, now(), 1);
COMMIT;`;
}

/** Carga inicial (tribunais, listas, status, Goiânia, feriados padrão, escritório). Idempotente. */
export function sqlCargaInicial(anos: number[]): string {
  const linhas: string[] = ["BEGIN;", "SELECT set_config('app.origem', 'seed', true);"];
  for (const t of TRIBUNAIS) {
    const nome = `${t.segmento === "4" ? "Tribunal Regional Federal" : t.segmento === "5" ? "Tribunal Regional do Trabalho" : "Tribunal de Justiça"} — ${t.sigla}`;
    linhas.push(
      `INSERT INTO tribunal (codigo, sigla, nome, segmento, uf, "sedeCidade", "sedeUf") VALUES (${lit(t.codigo)}, ${lit(t.sigla)}, ${lit(nome)}, ${lit(t.segmento)}, ${lit(t.uf)}, ${lit(t.sede.cidade)}, ${lit(t.sede.uf)})` +
        ` ON CONFLICT (codigo) DO UPDATE SET "sedeCidade" = EXCLUDED."sedeCidade", "sedeUf" = EXCLUDED."sedeUf";`,
    );
  }
  for (const [lista, valores] of Object.entries(LISTAS_INICIAIS)) {
    valores.forEach((valor, ordem) =>
      linhas.push(
        `INSERT INTO item_lista (id, lista, valor, ordem, ativo) VALUES (gen_random_uuid(), ${lit(lista)}::"TipoLista", ${lit(valor)}, ${ordem}, true) ON CONFLICT (lista, valor) DO NOTHING;`,
      ),
    );
  }
  STATUS_INICIAIS.forEach((s, ordem) =>
    linhas.push(
      `INSERT INTO status_processo (id, nome, comportamento, resultado, ordem, ativo) VALUES (gen_random_uuid(), ${lit(s.nome)}, ${lit(s.comportamento)}::"ComportamentoStatus", ${"resultado" in s ? `${lit(s.resultado)}::"Resultado"` : "NULL"}, ${ordem}, true) ON CONFLICT (nome) DO NOTHING;`,
    ),
  );
  linhas.push(
    `INSERT INTO comarca (id, nome, uf, "tribunalCodigo", "codigoOrigem") VALUES (gen_random_uuid(), 'Goiânia', 'GO', '8.09', '0051') ON CONFLICT (nome, uf) DO NOTHING;`,
  );
  for (const ano of anos) {
    for (const f of feriadosPadrao(ano)) {
      const comarca = f.comarca ? `(SELECT id FROM comarca WHERE nome = ${lit(f.comarca.nome)} AND uf = ${lit(f.comarca.uf)})` : "NULL";
      if (f.comarca) {
        linhas.push(`INSERT INTO comarca (id, nome, uf) VALUES (gen_random_uuid(), ${lit(f.comarca.nome)}, ${lit(f.comarca.uf)}) ON CONFLICT (nome, uf) DO NOTHING;`);
      }
      linhas.push(
        `INSERT INTO feriado (id, data, abrangencia, natureza, uf, "comarcaId", descricao, fonte)` +
          ` SELECT gen_random_uuid(), ${lit(f.data)}::date, ${lit(f.abrangencia)}::"Abrangencia", ${lit(f.natureza)}::"NaturezaDia", ${lit(f.comarca?.uf ?? null)}, ${comarca}, ${lit(f.descricao)}, ${lit(f.fonte)}` +
          ` WHERE NOT EXISTS (SELECT 1 FROM feriado WHERE data = ${lit(f.data)}::date AND abrangencia = ${lit(f.abrangencia)}::"Abrangencia" AND "comarcaId" IS NOT DISTINCT FROM ${comarca});`,
      );
    }
  }
  const logo = logoDoEscritorio();
  linhas.push(
    `INSERT INTO configuracao_escritorio (id, "razaoSocial", cnpj, "registroOab", endereco, telefone, email, "logoBase64", "logoTipo", "atualizadoEm")` +
      ` VALUES (1, ${lit(ESCRITORIO.razaoSocial)}, ${lit(ESCRITORIO.cnpj)}, ${lit(ESCRITORIO.registroOab)}, ${lit(ESCRITORIO.endereco)}, ${lit(ESCRITORIO.telefone)}, ${lit(ESCRITORIO.email)}, ${lit(logo?.logoBase64)}, ${lit(logo?.logoTipo)}, now()) ON CONFLICT (id) DO NOTHING;`,
  );
  linhas.push("COMMIT;");
  return linhas.join("\n");
}

/** Usuário inicial (o id vem do convite no Supabase Auth). */
export function sqlUsuario(u: { id: string; nome: string; email: string; perfil: string }): string {
  return `BEGIN;
SELECT set_config('app.origem', 'seed', true);
INSERT INTO usuario (id, nome, email, perfil, "veTodosProcessos", ativo, "atualizadoEm")
VALUES (${lit(u.id)}::uuid, ${lit(u.nome)}, ${lit(u.email.toLowerCase())}, ${lit(u.perfil)}::"Perfil", true, true, now())
ON CONFLICT (id) DO NOTHING;
COMMIT;`;
}

/** Conferências pós-implantação: tudo deve vir zerado/verdadeiro. */
export const SQL_VERIFICACAO = `SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity) AS tabelas_sem_rls,
  (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')) AS privilegios_publicos,
  (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL) AS migracoes,
  (SELECT count(*) FROM tribunal) AS tribunais,
  (SELECT count(*) FROM status_processo) AS status,
  (SELECT count(*) FROM feriado) AS feriados,
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'auditar') AS gatilhos_historico,
  (SELECT count(*) FROM usuario WHERE perfil = 'ADMINISTRADOR' AND ativo) AS administradores;`;

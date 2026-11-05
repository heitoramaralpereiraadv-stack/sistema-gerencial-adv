# Sistema Gerencial — Medeiros e Barbosa Sociedade de Advogados

Next.js 16 (App Router, `src/proxy.ts`), TypeScript, Prisma 7 (adapter pg), PostgreSQL no
Supabase (sa-east-1), Supabase Auth com 2FA por aplicativo. Interface em pt-BR, responsiva.

## Antes de mexer
- Leia `docs/decisoes.md`: as respostas dos sócios (A…, B…, C…, D…) são regra. Nunca invente
  regra processual; se faltar, pergunte.
- Estado e pendências: `docs/estado-do-projeto.md`. Implantação: `docs/implantacao-supabase.md`.
- Dados reais de clientes nunca entram no repositório nem nos testes (`*.xlsx`, `*.local.json`,
  `.env*` são ignorados). Testes usam dados fictícios.
- Nenhum dado de cliente vai a serviço externo além de Supabase, hospedagem e e-mail.

## Organização
- `src/dominio/` — regras puras (número CNJ, motor de prazos, CPF/CNPJ, feriados padrão).
- `src/servidor/` — única porta para o banco. Toda escrita passa por `comUsuario()` (o gatilho
  de histórico recusa escrita sem usuário). Permissões em `permissoes/` (aplicadas no servidor).
- `src/importacao/` — leitura da planilha e proposta de importação (função pura).
- `src/servidor/relatorios/` — seção 6; a mesma tabela vira tela, Excel e PDF.
- `prisma/migrations/` — inclui SQL de RLS, gatilhos de histórico e CHECKs; não edite migrações
  aplicadas, crie novas (e repita RLS/gatilho para tabelas novas).

## Rodar
- Postgres local: `service postgresql start` (usuário `dev`/`dev`, bancos `sg_dev` e `sg_teste`).
- `npx vitest run` (unidade + integração), `npx tsc --noEmit`, `npx next build`.
- Telas sem Supabase: `npx tsx scripts/dados-demonstracao.ts` e `npm run dev` com o
  `DEV_USUARIO_ID` impresso (só em desenvolvimento). Verificação no navegador:
  `node tests/telas/verificar-telas.mjs <pasta>`.
- Motor de prazos: ao mudar regra, atualize `tests/dominio/casos-prazo.ts` com contagem manual e
  rode `npm run docs:casos`.
- Rede do ambiente: scripts que acessam serviços externos rodam com `NODE_USE_ENV_PROXY=1`.

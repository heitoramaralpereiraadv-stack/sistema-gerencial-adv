// Provisiona o projeto Supabase do escritório (região São Paulo) pela API de gerenciamento,
// tudo por HTTPS: configuração do Auth, banco (migrações + carga inicial), chaves, usuários
// iniciais e verificação final. Cada etapa pode ser repetida sem efeito colateral.
//
// Uso:  npm run supabase -- <etapa>      etapas: api, auth, banco, chaves, usuarios, verificar, tudo
//
// Variáveis (segredos do ambiente; nunca no código nem no chat):
//   SUPABASE_ACCESS_TOKEN   token pessoal (Account → Access Tokens)                  obrigatória
//   SUPABASE_PROJECT_REF    identificador do projeto (Project Settings → General)   obrigatória
//   SUPABASE_DB_PASSWORD    senha do banco definida na criação do projeto           para "chaves"
//   SITE_URL                endereço do sistema (ex.: https://….vercel.app)         para "auth"
//   SMTP_HOST, SMTP_PORT, SMTP_PASSWORD   e-mail do escritório na GoDaddy (D8)      para "auth"
// Arquivos locais (fora do repositório): usuarios-iniciais.local.json, .env.producao

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { feriadosPadrao } from "../../src/dominio/prazos/feriados-padrao";
import { lerMigracoes, lit, SQL_TABELA_MIGRACOES, SQL_VERIFICACAO, sqlCargaInicial, sqlDaMigracao, sqlUsuario } from "../../src/servidor/implantacao/sql";

const API = "https://api.supabase.com";
const REMETENTE = "escritorio@medeirosebarbosa.com.br";
const ARQUIVO_ENV = ".env.producao";
const ARQUIVO_USUARIOS = "usuarios-iniciais.local.json";

function exigir(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`Defina ${nome} nos segredos do ambiente.`);
  return v;
}
const ref = () => exigir("SUPABASE_PROJECT_REF");

/** fetch com mensagem clara quando a rede do ambiente bloqueia o domínio. */
async function buscar(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    const host = new URL(url).host;
    throw new Error(`Sem acesso a ${host} (${(e as Error).message}). Libere o domínio na política de rede do ambiente e rode de novo.`);
  }
}

async function api<T = unknown>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const r = await buscar(`${API}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${exigir("SUPABASE_ACCESS_TOKEN")}`, "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${metodo} ${caminho} → ${r.status}: ${texto.slice(0, 500)}`);
  return (texto ? JSON.parse(texto) : null) as T;
}

const sql = <T = Record<string, unknown>>(query: string) => api<T[]>("POST", `/v1/projects/${ref()}/database/query`, { query });

// ── api: confere o projeto e a especificação oficial antes de mexer em qualquer coisa ──

type Especificacao = { paths: Record<string, Record<string, unknown>>; components: { schemas: Record<string, { properties?: Record<string, unknown> }> } };
let especificacao: Especificacao | null = null;

async function lerEspecificacao(): Promise<Especificacao> {
  if (!especificacao) {
    const r = await buscar(`${API}/api/v1-json`);
    if (!r.ok) throw new Error(`Especificação da API indisponível (${r.status}).`);
    especificacao = (await r.json()) as Especificacao;
  }
  return especificacao;
}

/** Propriedades aceitas no corpo de uma operação, conforme a especificação publicada. */
async function propriedadesDoCorpo(caminho: string, metodo: string): Promise<Set<string>> {
  const e = await lerEspecificacao();
  const op = e.paths[caminho]?.[metodo] as { requestBody?: { content?: Record<string, { schema?: { $ref?: string; properties?: Record<string, unknown> } }> } } | undefined;
  if (!op) throw new Error(`A API não tem ${metodo.toUpperCase()} ${caminho}: o script precisa ser atualizado.`);
  const schema = op.requestBody?.content?.["application/json"]?.schema;
  const props = schema?.$ref ? e.components.schemas[schema.$ref.split("/").pop()!]?.properties : schema?.properties;
  return new Set(Object.keys(props ?? {}));
}

async function etapaApi() {
  const p = await api<{ name: string; region: string; status: string }>("GET", `/v1/projects/${ref()}`);
  console.log(`Projeto "${p.name}" — região ${p.region} — situação ${p.status}`);
  if (p.region !== "sa-east-1") throw new Error("O projeto deve estar na região São Paulo (sa-east-1), conforme a seção 7.");
  if (p.status !== "ACTIVE_HEALTHY") throw new Error("Projeto ainda não está ativo; aguarde e rode de novo.");
  for (const [c, m] of [["/v1/projects/{ref}/database/query", "post"], ["/v1/projects/{ref}/config/auth", "patch"], ["/v1/projects/{ref}/api-keys", "get"]] as const) {
    await propriedadesDoCorpo(c, m).catch((e) => {
      if (m !== "get") throw e;
    });
  }
  console.log("API de gerenciamento conferida com a especificação publicada.");
}

// ── auth: cadastro só por convite, 2FA por aplicativo, modelos de e-mail, SMTP ──

const MODELO = (titulo: string, texto: string, tipo: string) => `<h2>${titulo}</h2>
<p>${texto}</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${tipo}">Continuar</a></p>
<p style="color:#5b6573;font-size:12px">Medeiros e Barbosa Sociedade de Advogados — sistema gerencial interno. Se você não esperava esta mensagem, ignore-a.</p>`;

async function etapaAuth() {
  const desejado: Record<string, unknown> = {
    disable_signup: true, // seção 2: sem cadastro público, só convite
    external_email_enabled: true,
    mailer_autoconfirm: false,
    password_min_length: 12,
    mfa_totp_enroll_enabled: true, // A12: 2FA por aplicativo autenticador
    mfa_totp_verify_enabled: true,
    mfa_phone_enroll_enabled: false,
    mfa_phone_verify_enabled: false,
    mailer_subjects_invite: "Convite — Sistema Gerencial Medeiros e Barbosa",
    mailer_templates_invite_content: MODELO("Convite de acesso", "Você foi convidado para o sistema gerencial do escritório. Clique abaixo para definir sua senha e cadastrar o aplicativo autenticador.", "invite"),
    mailer_subjects_recovery: "Redefinição de senha — Sistema Gerencial Medeiros e Barbosa",
    mailer_templates_recovery_content: MODELO("Redefinir senha", "Recebemos um pedido para redefinir sua senha. Clique abaixo para criar uma nova.", "recovery"),
  };
  const site = process.env.SITE_URL?.replace(/\/$/, "");
  if (site) Object.assign(desejado, { site_url: site, uri_allow_list: `${site}/**` });
  else console.warn("SITE_URL não definida: endereço do sistema e URLs de retorno ficam para depois do deploy.");
  if (process.env.SMTP_PASSWORD) {
    Object.assign(desejado, {
      smtp_admin_email: REMETENTE,
      smtp_sender_name: "Medeiros e Barbosa",
      smtp_host: exigir("SMTP_HOST"),
      smtp_port: exigir("SMTP_PORT"),
      smtp_user: REMETENTE,
      smtp_pass: process.env.SMTP_PASSWORD,
    });
  } else console.warn("SMTP_PASSWORD não definida: o Supabase só envia convites para membros da equipe do projeto (limite baixo).");

  const aceitas = await propriedadesDoCorpo("/v1/projects/{ref}/config/auth", "patch");
  const desconhecidas = Object.keys(desejado).filter((k) => !aceitas.has(k));
  if (desconhecidas.length) throw new Error(`A API de configuração não aceita mais: ${desconhecidas.join(", ")}. Nada foi alterado.`);
  await api("PATCH", `/v1/projects/${ref()}/config/auth`, desejado);
  const atual = await api<Record<string, unknown>>("GET", `/v1/projects/${ref()}/config/auth`);
  const divergentes = Object.keys(desejado).filter((k) => k !== "smtp_pass" && JSON.stringify(atual[k]) !== JSON.stringify(desejado[k]));
  if (divergentes.length) throw new Error(`Configuração não ficou como pedido em: ${divergentes.join(", ")}.`);
  console.log(`Auth configurado: ${Object.keys(desejado).filter((k) => k !== "smtp_pass").join(", ")}.`);
}

// ── banco: migrações pendentes + carga inicial ──

async function etapaBanco() {
  await sql(SQL_TABELA_MIGRACOES);
  const aplicadas = new Set((await sql<{ migration_name: string }>(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`)).map((r) => r.migration_name));
  for (const m of lerMigracoes()) {
    if (aplicadas.has(m.nome)) continue;
    await sql(sqlDaMigracao(m));
    console.log(`Migração aplicada: ${m.nome}`);
  }
  const ano = new Date().getFullYear();
  await sql(sqlCargaInicial([ano - 1, ano, ano + 1]));
  console.log(`Carga inicial aplicada (feriados de ${ano - 1} a ${ano + 1}: ${feriadosPadrao(ano).length} por ano).`);
}

// ── chaves: monta .env.producao (local, fora do repositório) ──

function lerEnv(arquivo: string): Record<string, string> {
  if (!existsSync(arquivo)) return {};
  return Object.fromEntries(
    readFileSync(arquivo, "utf8").split("\n").filter((l) => /^\w+=/.test(l)).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
    }),
  );
}

async function etapaChaves() {
  const chaves = await api<{ name: string; type?: string; api_key?: string }[]>("GET", `/v1/projects/${ref()}/api-keys?reveal=true`);
  const publica = chaves.find((k) => k.type === "publishable") ?? chaves.find((k) => k.name === "anon");
  const secreta = chaves.find((k) => k.type === "secret") ?? chaves.find((k) => k.name === "service_role");
  if (!publica?.api_key || !secreta?.api_key) throw new Error("Chaves do projeto não encontradas (publishable/secret ou anon/service_role).");
  const atual = lerEnv(ARQUIVO_ENV);
  let banco = atual.DATABASE_URL;
  if (!banco && process.env.SUPABASE_DB_PASSWORD) {
    type Pooler = { connection_string?: string; pool_mode?: string };
    const pooler = await api<Pooler[] | Pooler>("GET", `/v1/projects/${ref()}/config/database/pooler`).catch(() => null);
    const lista: Pooler[] = Array.isArray(pooler) ? pooler : pooler ? [pooler] : [];
    const transacao = lista.find((p) => p.pool_mode === "transaction") ?? lista[0];
    if (transacao?.connection_string) {
      banco = transacao.connection_string.replace("[YOUR-PASSWORD]", encodeURIComponent(process.env.SUPABASE_DB_PASSWORD));
    }
  }
  const valores: Record<string, string> = {
    DATABASE_URL: banco ?? "COPIE de Project Settings → Database → Connection string (Transaction pooler)",
    NEXT_PUBLIC_SUPABASE_URL: `https://${ref()}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publica.api_key,
    SUPABASE_SECRET_KEY: secreta.api_key,
    NEXT_PUBLIC_SITE_URL: process.env.SITE_URL ?? atual.NEXT_PUBLIC_SITE_URL ?? "",
    // Geradas uma única vez: perder CHAVE_CIFRAGEM torna os dados cifrados ilegíveis.
    CHAVE_CIFRAGEM: atual.CHAVE_CIFRAGEM ?? randomBytes(32).toString("base64"),
    CHAVE_INDICE: atual.CHAVE_INDICE ?? randomBytes(32).toString("base64"),
  };
  writeFileSync(
    ARQUIVO_ENV,
    `# Variáveis de produção (Vercel). NÃO versionar. Guarde CHAVE_CIFRAGEM e CHAVE_INDICE com os sócios.\n` +
      Object.entries(valores).map(([k, v]) => `${k}="${v}"`).join("\n") + "\n",
    { mode: 0o600 },
  );
  console.log(`${ARQUIVO_ENV} gravado${atual.CHAVE_CIFRAGEM ? "" : " (chaves de cifragem geradas agora)"}.`);
}

// ── usuarios: convites pelo Supabase Auth + cadastro no sistema ──

async function etapaUsuarios() {
  if (!existsSync(ARQUIVO_USUARIOS)) throw new Error(`Crie ${ARQUIVO_USUARIOS} com nome, e-mail e perfil de cada usuário.`);
  const usuarios = JSON.parse(readFileSync(ARQUIVO_USUARIOS, "utf8")) as { nome: string; email: string; perfil: string }[];
  const env = lerEnv(ARQUIVO_ENV);
  if (!env.SUPABASE_SECRET_KEY) throw new Error('Rode a etapa "chaves" antes.');
  const admin = createClient(`https://${ref()}.supabase.co`, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const site = process.env.SITE_URL ?? env.NEXT_PUBLIC_SITE_URL;
  for (const u of usuarios) {
    const existe = await sql<{ id: string }>(`SELECT id FROM usuario WHERE email = ${lit(u.email.toLowerCase())}`);
    if (existe.length) {
      console.log(`Já cadastrado: ${u.nome}`);
      continue;
    }
    const { data, error } = await admin.auth.admin.inviteUserByEmail(u.email, site ? { redirectTo: `${site}/definir-senha` } : undefined);
    if (error || !data.user) throw new Error(`Convite para ${u.email} falhou: ${error?.message}`);
    await sql(sqlUsuario({ ...u, id: data.user.id }));
    console.log(`Convite enviado: ${u.nome} (${u.perfil})`);
  }
}

// ── verificar: segurança e carga, pelo banco e pela API pública ──

async function etapaVerificar() {
  const [v] = await sql(SQL_VERIFICACAO);
  console.table(v);
  const problemas: string[] = [];
  if (Number(v!.tabelas_sem_rls) !== 0) problemas.push("há tabelas sem RLS");
  if (Number(v!.privilegios_publicos) !== 0) problemas.push("anon/authenticated têm privilégios em tabelas");
  if (Number(v!.migracoes) !== lerMigracoes().length) problemas.push("migrações pendentes");
  const env = lerEnv(ARQUIVO_ENV);
  if (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    // A chave pública não pode ler nada pela API REST do Supabase (seção 7).
    for (const tabela of ["pessoa", "processo", "prazo", "historico", "usuario"]) {
      const r = await buscar(`https://${ref()}.supabase.co/rest/v1/${tabela}?select=*&limit=1`, {
        headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
      });
      const corpo = await r.text();
      const bloqueado = r.status === 401 || r.status === 403 || r.status === 404 || corpo.includes("permission denied");
      console.log(`API pública /${tabela}: ${r.status} ${bloqueado ? "bloqueada" : "ABERTA"}`);
      if (!bloqueado) problemas.push(`tabela ${tabela} acessível pela chave pública`);
    }
  }
  const auth = await api<Record<string, unknown>>("GET", `/v1/projects/${ref()}/config/auth`);
  if (auth.disable_signup !== true) problemas.push("cadastro público está ligado");
  if (auth.mfa_totp_enroll_enabled !== true) problemas.push("2FA por aplicativo está desligado");
  if (!auth.smtp_host) problemas.push("SMTP próprio não configurado (D8)");
  if (problemas.length) {
    console.error(`\nPROBLEMAS: ${problemas.join("; ")}`);
    process.exitCode = 1;
  } else console.log("\nVerificação concluída sem problemas.");
}

const ETAPAS: Record<string, () => Promise<void>> = {
  api: etapaApi, auth: etapaAuth, banco: etapaBanco, chaves: etapaChaves, usuarios: etapaUsuarios, verificar: etapaVerificar,
};

const pedida = process.argv[2] ?? "tudo";
const ordem = pedida === "tudo" ? ["api", "auth", "banco", "chaves", "usuarios", "verificar"] : [pedida];
try {
  for (const e of ordem) {
    if (!ETAPAS[e]) throw new Error(`Etapa desconhecida: ${e}. Use: ${Object.keys(ETAPAS).join(", ")}, tudo.`);
    console.log(`\n── ${e} ──`);
    await ETAPAS[e]!();
  }
} catch (e) {
  console.error(`\nInterrompido: ${(e as Error).message}`);
  process.exitCode = 1;
}

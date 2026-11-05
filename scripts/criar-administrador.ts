// Cria o primeiro administrador (antes de existir alguém para convidar pela tela).
// Uso: npx tsx scripts/criar-administrador.ts "Nome Completo" email@escritorio
// Envia o convite pelo Supabase Auth; o sócio define a senha e cadastra o autenticador.

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { criarPrisma } from "../src/servidor/db/prisma";

const [nome, email] = process.argv.slice(2);
if (!nome || !email) {
  console.error('Uso: npx tsx scripts/criar-administrador.ts "Nome" email');
  process.exit(1);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data, error } = await supabase.auth.admin.inviteUserByEmail(email.toLowerCase(), {
  redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/definir-senha`,
});
if (error || !data.user) {
  console.error(`Convite não enviado: ${error?.message}`);
  process.exit(1);
}

const prisma = criarPrisma();
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.origem', 'seed', true)`;
  await tx.usuario.create({
    data: { id: data.user.id, nome, email: email.toLowerCase(), perfil: "ADMINISTRADOR" },
  });
});
await prisma.$disconnect();
console.log(`Administrador ${nome} criado; convite enviado para ${email}.`);

import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function variavel(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`${nome} não configurada.`);
  return v;
}

/** Cliente do Supabase Auth com a sessão do usuário (cookies). Usado só para autenticação. */
export async function supabaseServidor() {
  const loja = await cookies();
  return createServerClient(
    variavel("NEXT_PUBLIC_SUPABASE_URL"),
    variavel("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => loja.getAll(),
        setAll: (lista) => {
          try {
            for (const { name, value, options } of lista) loja.set(name, value, options);
          } catch {
            // Chamado de um Server Component: o proxy renova os cookies.
          }
        },
      },
    },
  );
}

/** Cliente administrativo (chave secreta): convidar e desativar usuários. Nunca vai ao navegador. */
export function supabaseAdmin() {
  return createClient(variavel("NEXT_PUBLIC_SUPABASE_URL"), variavel("SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Só autenticação (senha, 2FA). Dados do sistema nunca são lidos pelo navegador direto do Supabase. */
export function supabaseNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

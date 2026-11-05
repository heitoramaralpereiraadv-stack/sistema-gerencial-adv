// Acesso de desenvolvimento: só com `next dev` (NODE_ENV=development), fora da Vercel, e com
// DEV_USUARIO_ID definido. Permite testar as telas localmente sem um projeto Supabase.
// Em produção (`next build`/`next start` ou Vercel) NODE_ENV é sempre "production".

export function usuarioDeDesenvolvimento(): string | null {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL) return null;
  return process.env.DEV_USUARIO_ID || null;
}

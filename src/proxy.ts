// Renova a sessão do Supabase a cada requisição e manda para /entrar quem não tem sessão.
// A autorização de verdade (2FA, perfil, permissões) é conferida no servidor por exigirUsuario.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { usuarioDeDesenvolvimento } from "./servidor/auth/desenvolvimento";

const PUBLICAS = ["/entrar", "/esqueci-senha", "/auth/confirm"];

export async function proxy(request: NextRequest) {
  if (usuarioDeDesenvolvimento()) return NextResponse.next({ request });
  let resposta = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (lista) => {
          for (const { name, value } of lista) request.cookies.set(name, value);
          resposta = NextResponse.next({ request });
          for (const { name, value, options } of lista) resposta.cookies.set(name, value, options);
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const caminho = request.nextUrl.pathname;
  if (!data.user && !PUBLICAS.some((p) => caminho === p || caminho.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return resposta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};

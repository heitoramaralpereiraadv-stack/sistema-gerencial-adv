// Destino dos links de convite e de redefinição de senha enviados por e-mail.
// Modelos de e-mail do Supabase: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
// (convite) e …&type=recovery (redefinição).

import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseServidor } from "@/servidor/auth/supabase";

const TIPOS: EmailOtpType[] = ["invite", "recovery"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const tipo = params.get("type") as EmailOtpType | null;
  const url = request.nextUrl.clone();
  url.search = "";

  if (tokenHash && tipo && TIPOS.includes(tipo)) {
    const supabase = await supabaseServidor();
    const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: tokenHash });
    if (!error) {
      url.pathname = "/definir-senha";
      return NextResponse.redirect(url);
    }
  }
  url.pathname = "/entrar";
  return NextResponse.redirect(url);
}

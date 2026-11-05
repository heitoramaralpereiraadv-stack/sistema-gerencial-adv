// Agenda assinada pelo Google Agenda (G3). Sem sessão: o token do endereço é a autorização.
// Token errado ou assinatura desligada → 404, sem dizer qual dos dois.

import { NextResponse } from "next/server";
import { enderecoDoSistema } from "@/lib/endereco";
import { icsDaAssinatura } from "@/servidor/servicos/google-agenda";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ics = await icsDaAssinatura(token.replace(/\.ics$/, ""), await enderecoDoSistema());
  if (!ics) return new NextResponse("Não encontrado.", { status: 404 });
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}

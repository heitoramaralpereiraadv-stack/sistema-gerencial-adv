// Arquivo .ics para importar uma vez no Google Agenda (só administrador).

import { NextResponse, type NextRequest } from "next/server";
import { enderecoDoSistema } from "@/lib/endereco";
import { hoje } from "@/lib/hoje";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { NaoAutenticadoError, ProibidoError, SegundoFatorPendenteError } from "@/servidor/erros";
import { icsParaDownload } from "@/servidor/servicos/google-agenda";

export async function GET(request: NextRequest) {
  try {
    const ics = await icsParaDownload(await exigirUsuario(), await enderecoDoSistema());
    return new NextResponse(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="agenda-medeiros-barbosa-${hoje()}.ics"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof NaoAutenticadoError || e instanceof SegundoFatorPendenteError) return NextResponse.redirect(new URL("/entrar", request.url));
    if (e instanceof ProibidoError) return new NextResponse(e.message, { status: 403 });
    throw e;
  }
}

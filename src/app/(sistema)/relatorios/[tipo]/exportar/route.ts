// Exportação de relatório em Excel ou PDF (seção 6). A permissão e a visibilidade são
// aplicadas nas consultas, como na tela.

import { NextResponse, type NextRequest } from "next/server";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { NaoAutenticadoError, NaoEncontradoError, SegundoFatorPendenteError } from "@/servidor/erros";
import { exportar } from "@/servidor/relatorios/exportacao";

export async function GET(request: NextRequest, { params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const p = Object.fromEntries(request.nextUrl.searchParams.entries());
  const formato = p.formato === "xlsx" ? "xlsx" : "pdf";
  try {
    const usuario = await exigirUsuario();
    const r = await exportar(usuario, tipo, formato, p);
    return new NextResponse(Buffer.from(r.conteudo), {
      headers: {
        "Content-Type": r.tipoMime,
        "Content-Disposition": `attachment; filename="${r.nome}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof NaoAutenticadoError || e instanceof SegundoFatorPendenteError) {
      return NextResponse.redirect(new URL("/entrar", request.url));
    }
    if (e instanceof NaoEncontradoError) return new NextResponse(e.message, { status: 404 });
    throw e;
  }
}

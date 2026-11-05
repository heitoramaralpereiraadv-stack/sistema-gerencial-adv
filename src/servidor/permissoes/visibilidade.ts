// Quais processos cada usuário enxerga (seções 2 e 7). Aplicado em toda consulta de processo
// e de tudo o que pertence a um processo (andamentos, prazos, audiências).

import type { Prisma } from "@/generated/prisma/client";
import type { UsuarioAtual } from "../auth/usuario";

export function filtroProcessosVisiveis(usuario: UsuarioAtual): Prisma.ProcessoWhereInput {
  if (usuario.perfil === "ADMINISTRADOR") return {};
  const proprio: Prisma.ProcessoWhereInput = { responsavelId: usuario.id };
  // Segredo de justiça: só o responsável e os administradores.
  const semSegredo: Prisma.ProcessoWhereInput = { OR: [{ segredoJustica: false }, proprio] };
  // Advogado configurado para ver só os seus ("seus" = responsável; pendência D2).
  if (usuario.perfil === "ADVOGADO" && !usuario.veTodosProcessos) return proprio;
  return semSegredo;
}

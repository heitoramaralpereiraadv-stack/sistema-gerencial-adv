import "server-only";
import { ZodError } from "zod";
import {
  NaoAutenticadoError,
  NaoEncontradoError,
  ProibidoError,
  RegraDeNegocioError,
  SegundoFatorPendenteError,
} from "./erros";

export type ResultadoAcao<T = void> = { ok: true; dados: T } | { ok: false; erro: string };

/**
 * Envolve uma Server Action: erros conhecidos viram mensagem para a tela; os demais são
 * relançados (e registrados pelo Next) sem expor detalhes ao navegador.
 */
export async function executarAcao<T>(fn: () => Promise<T>): Promise<ResultadoAcao<T>> {
  try {
    return { ok: true, dados: await fn() };
  } catch (e) {
    if (
      e instanceof ProibidoError ||
      e instanceof RegraDeNegocioError ||
      e instanceof NaoEncontradoError ||
      e instanceof NaoAutenticadoError ||
      e instanceof SegundoFatorPendenteError
    ) {
      return { ok: false, erro: e.message };
    }
    if (e instanceof ZodError) {
      return { ok: false, erro: e.issues.map((i) => i.message).join(" ") };
    }
    throw e;
  }
}

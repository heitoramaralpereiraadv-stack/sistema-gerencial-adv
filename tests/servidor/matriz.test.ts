import { describe, expect, it } from "vitest";
import { ProibidoError } from "@/servidor/erros";
import { exigirPermissao, pode, type Acao, type Perfil } from "@/servidor/permissoes/matriz";

const TODAS: Acao[] = [
  "pessoa.editar", "processo.editar", "andamento.editar", "prazo.editar", "prazo.cumprir",
  "audiencia.editar", "comarca.cadastrar", "registro.excluir", "processo.reabrir", "parte.mesclar", "usuario.gerenciar",
  "configuracao.gerenciar", "importacao.executar", "compromisso.editar", "agenda.google",
];

const esperado: Record<Perfil, Acao[]> = {
  ADMINISTRADOR: TODAS,
  ADVOGADO: ["pessoa.editar", "processo.editar", "andamento.editar", "prazo.editar", "prazo.cumprir", "audiencia.editar", "compromisso.editar", "comarca.cadastrar"],
  ASSISTENTE: ["pessoa.editar", "processo.editar", "andamento.editar", "prazo.cumprir", "comarca.cadastrar"],
};

describe("matriz de permissões (seção 2)", () => {
  for (const [perfil, permitidas] of Object.entries(esperado) as [Perfil, Acao[]][]) {
    it.each(TODAS)(`${perfil}: %s`, (acao) => {
      expect(pode(perfil, acao)).toBe(permitidas.includes(acao));
    });
  }

  it("só o administrador exclui registros", () => {
    expect(() => exigirPermissao({ perfil: "ASSISTENTE" }, "registro.excluir")).toThrowError(ProibidoError);
    expect(() => exigirPermissao({ perfil: "ADVOGADO" }, "registro.excluir")).toThrowError(ProibidoError);
    expect(() => exigirPermissao({ perfil: "ADMINISTRADOR" }, "registro.excluir")).not.toThrow();
  });
});

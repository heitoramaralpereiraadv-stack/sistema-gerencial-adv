// Erros que o servidor devolve às telas com mensagem em português.

export class NaoAutenticadoError extends Error {
  constructor(mensagem = "Sessão expirada ou inexistente. Entre novamente.") {
    super(mensagem);
    this.name = "NaoAutenticadoError";
  }
}

/** Senha conferida, mas o segundo fator ainda não foi cadastrado ou verificado. */
export class SegundoFatorPendenteError extends Error {
  constructor(readonly etapa: "cadastrar" | "verificar") {
    super("Autenticação em dois fatores pendente.");
    this.name = "SegundoFatorPendenteError";
  }
}

export class ProibidoError extends Error {
  constructor(mensagem = "Seu perfil não tem permissão para esta ação.") {
    super(mensagem);
    this.name = "ProibidoError";
  }
}

export class NaoEncontradoError extends Error {
  constructor(mensagem = "Registro não encontrado.") {
    super(mensagem);
    this.name = "NaoEncontradoError";
  }
}

/** Regra de negócio violada (ex.: novo prazo em processo encerrado). */
export class RegraDeNegocioError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "RegraDeNegocioError";
  }
}

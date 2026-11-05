// Rótulos em português para os valores gravados no banco.

export const POLO = { ATIVO: "Polo ativo", PASSIVO: "Polo passivo", TERCEIRO: "Terceiros", OUTRO: "Outros" } as const;
export const TIPO_PESSOA = { PF: "Pessoa física", PJ: "Pessoa jurídica", ESPOLIO: "Espólio", ENTE_PUBLICO: "Ente público" } as const;
export const SITUACAO_PESSOA = { ATIVO: "Ativo", INATIVO: "Inativo", PROSPECCAO: "Prospecção" } as const;
export const GRAU = { PRIMEIRO: "1º grau", SEGUNDO: "2º grau", RECURSAL: "Turma Recursal", SUPERIOR: "Tribunal superior" } as const;
export const MODALIDADE = { PRESENCIAL: "Presencial", VIRTUAL: "Virtual" } as const;
export const QUALIDADE = {
  CURADOR: "Curador(a)", INVENTARIANTE: "Inventariante", REPRESENTANTE_LEGAL: "Representante legal", SOCIO: "Sócio(a)",
} as const;
export const TIPO_VINCULO = {
  RECURSO: "Recurso", CUMPRIMENTO_SENTENCA: "Cumprimento de sentença", INCIDENTE: "Incidente",
  CONEXO: "Conexo", REPROPOSITURA: "Repropositura", APENSO: "Apenso",
} as const;
export const FORMA_INTIMACAO = {
  DJE: "Publicação no DJe (informar a disponibilização)",
  PORTAL_CONSULTA: "Portal eletrônico — com consulta (informar o dia da consulta)",
  PORTAL_TACITA: "Portal eletrônico — sem consulta (informar o envio)",
  DATA_INFORMADA: "Outra forma (informar a data da intimação)",
} as const;
/** Sugestões para "outra forma" (B9); o usuário pode escrever outra. */
export const OUTRAS_FORMAS = ["Oficial de justiça", "Correio (AR)", "Em audiência", "Domicílio Judicial Eletrônico", "Carga / vista dos autos"];
export const SITUACAO_PRAZO = { ABERTO: "Aberto", CUMPRIDO: "Cumprido", PERDIDO: "Perdido", CANCELADO: "Cancelado" } as const;
export const TIPO_CONTATO = { TELEFONE: "Telefone", WHATSAPP: "WhatsApp", EMAIL: "E-mail" } as const;
export const TIPO_DOCUMENTO = {
  CNH: "CNH", CTPS: "CTPS", PIS_NIT_PASEP: "PIS/NIT/PASEP", TITULO_ELEITOR: "Título de eleitor", PASSAPORTE: "Passaporte",
  CERTIDAO: "Certidão (nascimento/casamento)", NUMERO_BENEFICIO: "Número de benefício (INSS)",
  INSCRICAO_ESTADUAL: "Inscrição estadual", INSCRICAO_MUNICIPAL: "Inscrição municipal", OUTRO: "Outro",
} as const;
export const OPERACAO = { CRIACAO: "Criação", ALTERACAO: "Alteração", EXCLUSAO: "Exclusão" } as const;
export const ENTIDADE = {
  pessoa: "Cadastro", contato: "Contato", documento_pessoa: "Documento", representante: "Representante",
  processo: "Processo", prazo: "Prazo", andamento: "Andamento", audiencia: "Audiência",
} as Record<string, string>;

export function rotulo<T extends Record<string, string>>(tabela: T, valor: string | null | undefined): string {
  return valor ? ((tabela as Record<string, string>)[valor] ?? valor) : "—";
}

/** Nomes dos campos no histórico. */
export const CAMPO: Record<string, string> = {
  nome: "Nome", tipo: "Tipo", categoriaId: "Categoria", cpfCnpjCifrado: "CPF/CNPJ", rgCifrado: "RG",
  informacoesReservadasCifrado: "Informações reservadas", numeroCifrado: "Número", dataNascimento: "Nascimento",
  endereco: "Endereço", cidade: "Cidade", uf: "UF", ehCliente: "É cliente", situacao: "Situação",
  dataEntrada: "Data de entrada", responsavelId: "Responsável", observacoes: "Observações",
  cadastroIncompleto: "Cadastro incompleto", pendencias: "Pendências", valor: "Valor", principal: "Principal",
  descricao: "Descrição", qualidade: "Qualidade", excluidoEm: "Excluído em",
};
/** Campos que guardam identificadores internos: o histórico mostra só que mudaram. */
export const CAMPOS_ID = new Set(["responsavelId", "categoriaId"]);

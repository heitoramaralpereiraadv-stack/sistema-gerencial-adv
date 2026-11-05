// Perfis e permissões (requisitos, seção 2). Toda ação do servidor passa por exigirPermissao;
// esconder botões na tela é só conveniência.

import { ProibidoError } from "../erros";

export type Perfil = "ADMINISTRADOR" | "ADVOGADO" | "ASSISTENTE";

export type Acao =
  | "pessoa.editar"           // criar e editar clientes e partes
  | "processo.editar"         // criar e editar dados do processo, partes e vínculos
  | "andamento.editar"
  | "prazo.editar"            // criar e editar prazos, ajustar a data final (D17)
  | "prazo.cumprir"           // marcar prazo como cumprido (D9)
  | "audiencia.editar"
  | "compromisso.editar"      // compromissos da Agenda, ligados ou não a processo (G2)
  | "comarca.cadastrar"       // incluir comarca nova ao cadastrar processo (D14)
  | "registro.excluir"        // exclusão lógica de qualquer registro
  | "processo.reabrir"        // sair de Encerrado/Arquivado (4.3)
  | "parte.mesclar"           // mesclar cadastros duplicados (seção 5)
  | "usuario.gerenciar"
  | "configuracao.gerenciar"  // listas de domínio, status, feriados, comarcas
  | "importacao.executar"
  | "agenda.google";          // importar do Google Agenda e enviar a ele (G3, G4: administrador)

const PERMISSOES: Record<Perfil, ReadonlySet<Acao>> = {
  // Sócios: tudo.
  ADMINISTRADOR: new Set<Acao>([
    "pessoa.editar", "processo.editar", "andamento.editar", "prazo.editar", "prazo.cumprir",
    "audiencia.editar", "comarca.cadastrar", "registro.excluir", "processo.reabrir", "parte.mesclar", "usuario.gerenciar",
    "configuracao.gerenciar", "importacao.executar", "compromisso.editar", "agenda.google",
  ]),
  // Criar e editar clientes, processos, andamentos, prazos e audiências (D9).
  // Exclusão só com administrador (pendência D1).
  ADVOGADO: new Set<Acao>([
    "pessoa.editar", "processo.editar", "andamento.editar", "prazo.editar", "prazo.cumprir",
    "audiencia.editar", "compromisso.editar", "comarca.cadastrar",
  ]),
  // Dados cadastrais e andamentos; marca prazo como cumprido (D9); não exclui.
  ASSISTENTE: new Set<Acao>([
    "pessoa.editar", "processo.editar", "andamento.editar", "prazo.cumprir", "comarca.cadastrar",
  ]),
};

// A conferência do prazo não é ação de perfil: cabe ao responsável pelo prazo (D16).

export function pode(perfil: Perfil, acao: Acao): boolean {
  return PERMISSOES[perfil].has(acao);
}

export function exigirPermissao(usuario: { perfil: Perfil }, acao: Acao): void {
  if (!pode(usuario.perfil, acao)) throw new ProibidoError();
}

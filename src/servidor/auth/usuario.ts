import type { Perfil } from "../permissoes/matriz";

/** Usuário autenticado (senha + 2FA) e ativo, como os serviços o recebem. */
export interface UsuarioAtual {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  veTodosProcessos: boolean;
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { pode } from "@/servidor/permissoes/matriz";

const ABAS = [
  ["usuarios", "Usuários"],
  ["listas", "Listas"],
  ["status", "Status"],
  ["feriados", "Feriados"],
  ["comarcas", "Comarcas"],
  ["escritorio", "Escritório"],
  ["google-agenda", "Google Agenda"],
] as const;

/** Somente administrador (seção 5). Cada ação confere de novo no servidor. */
export default async function LayoutConfiguracoes({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario();
  if (!pode(usuario.perfil, "configuracao.gerenciar")) redirect("/");
  return (
    <>
      <h1>Configurações</h1>
      <nav className="abas" aria-label="Configurações">
        {ABAS.map(([caminho, rotulo]) => (
          <Link key={caminho} href={`/configuracoes/${caminho}`}>{rotulo}</Link>
        ))}
        <Link href="/importacao">Importação da planilha</Link>
      </nav>
      {children}
    </>
  );
}

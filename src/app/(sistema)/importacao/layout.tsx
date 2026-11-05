import { redirect } from "next/navigation";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { pode } from "@/servidor/permissoes/matriz";

/** Somente administrador; cada ação confere de novo no servidor. */
export default async function LayoutImportacao({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario();
  if (!pode(usuario.perfil, "importacao.executar")) redirect("/");
  return children;
}

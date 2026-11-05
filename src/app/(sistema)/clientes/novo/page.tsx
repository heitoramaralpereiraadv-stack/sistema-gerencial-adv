import Link from "next/link";
import { redirect } from "next/navigation";
import { criarPessoaAcao } from "@/app/acoes/pessoas";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { pode } from "@/servidor/permissoes/matriz";
import { FormularioPessoa } from "../formulario-pessoa";

export default async function NovoCliente() {
  const usuario = await exigirUsuario();
  if (!pode(usuario.perfil, "pessoa.editar")) redirect("/clientes");
  return (
    <>
      <p className="suave">
        <Link href="/clientes">Clientes</Link> /
      </p>
      <h1>Novo cliente</h1>
      <FormularioPessoa acao={criarPessoaAcao} />
    </>
  );
}

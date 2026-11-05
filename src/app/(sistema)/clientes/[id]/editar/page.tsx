import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { atualizarPessoaAcao } from "@/app/acoes/pessoas";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { NaoEncontradoError } from "@/servidor/erros";
import { pode } from "@/servidor/permissoes/matriz";
import { obterPessoaParaEdicao } from "@/servidor/servicos/pessoas";
import { FormularioPessoa } from "../../formulario-pessoa";

export default async function EditarCliente({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await exigirUsuario();
  const { id } = await params;
  if (!pode(usuario.perfil, "pessoa.editar")) redirect(`/clientes/${id}`);
  const pessoa = await obterPessoaParaEdicao(usuario, id).catch((e) => {
    if (e instanceof NaoEncontradoError) notFound();
    throw e;
  });
  return (
    <>
      <p className="suave">
        <Link href={`/clientes/${id}`}>{pessoa.nome}</Link> /
      </p>
      <h1>Editar cadastro</h1>
      <FormularioPessoa acao={atualizarPessoaAcao.bind(null, id)} pessoa={pessoa} />
    </>
  );
}

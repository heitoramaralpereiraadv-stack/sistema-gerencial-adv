import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { atualizarProcessoAcao } from "@/app/acoes/processos";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { prisma } from "@/servidor/db/prisma";
import { pode } from "@/servidor/permissoes/matriz";
import { filtroProcessosVisiveis } from "@/servidor/permissoes/visibilidade";
import { FormularioProcesso } from "../../formulario-processo";

export default async function EditarProcesso({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await exigirUsuario();
  const { id } = await params;
  if (!pode(usuario.perfil, "processo.editar")) redirect(`/processos/${id}`);
  const processo = await prisma().processo.findFirst({ where: { id, excluidoEm: null, AND: [filtroProcessosVisiveis(usuario)] } });
  if (!processo) notFound();
  return (
    <>
      <p className="suave">
        <Link href={`/processos/${id}`}>{processo.numeroCnj ?? "Processo sem número"}</Link> /
      </p>
      <h1>Editar processo</h1>
      <FormularioProcesso
        acao={atualizarProcessoAcao.bind(null, id)}
        processo={processo}
        responsavelPadrao={processo.responsavelId}
        podeCadastrarComarca={pode(usuario.perfil, "comarca.cadastrar")}
      />
    </>
  );
}

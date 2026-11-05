import Link from "next/link";
import { redirect } from "next/navigation";
import { criarProcessoAcao } from "@/app/acoes/processos";
import { Selecao, opcoesDe } from "@/componentes/campos";
import { POLO } from "@/lib/rotulos";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { prisma } from "@/servidor/db/prisma";
import { pode } from "@/servidor/permissoes/matriz";
import { itensDaLista } from "@/servidor/servicos/referencias";
import { FormularioProcesso } from "../formulario-processo";

export default async function NovoProcesso({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const usuario = await exigirUsuario();
  if (!pode(usuario.perfil, "processo.editar")) redirect("/processos");
  const { cliente: clienteId } = await searchParams;
  const cliente = clienteId
    ? await prisma().pessoa.findFirst({ where: { id: clienteId, excluidoEm: null }, select: { id: true, nome: true } })
    : null;
  const qualificacoes = cliente ? await itensDaLista("QUALIFICACAO_PARTE") : [];

  // "Novo processo para este cliente" (ficha do cliente): o cliente entra como parte.
  const extra = cliente && (
    <fieldset>
      <legend>Cliente</legend>
      <input type="hidden" name="clienteId" value={cliente.id} />
      <p>
        <strong>{cliente.nome}</strong>
      </p>
      <Selecao rotulo="Polo do cliente" nome="clientePolo" obrigatorio vazio={null} opcoes={opcoesDe(POLO)} />
      <div className="opcoes-multiplas">
        {qualificacoes.map((q) => (
          <label key={q.id} className="marcador">
            <input type="checkbox" name="clienteQualificacaoIds" value={q.id} /> {q.valor}
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <>
      <p className="suave">
        <Link href={cliente ? `/clientes/${cliente.id}` : "/processos"}>{cliente ? cliente.nome : "Processos"}</Link> /
      </p>
      <h1>Novo processo</h1>
      <FormularioProcesso
        acao={criarProcessoAcao}
        responsavelPadrao={usuario.perfil === "ASSISTENTE" ? "" : usuario.id}
        extra={extra}
        podeCadastrarComarca={pode(usuario.perfil, "comarca.cadastrar")}
      />
    </>
  );
}

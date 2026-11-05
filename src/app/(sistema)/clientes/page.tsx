// Lista de clientes (seção 5): busca por nome, CPF/CNPJ ou telefone; processos ativos.

import Link from "next/link";
import { Selo } from "@/componentes/selos";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { prisma } from "@/servidor/db/prisma";
import { pode } from "@/servidor/permissoes/matriz";
import { filtroProcessosVisiveis } from "@/servidor/permissoes/visibilidade";
import { buscarPessoas } from "@/servidor/servicos/pessoas";

export default async function ListaClientes({ searchParams }: { searchParams: Promise<{ termo?: string; todos?: string }> }) {
  const usuario = await exigirUsuario();
  const { termo = "", todos } = await searchParams;
  const pessoas = await buscarPessoas(termo, { somenteClientes: !todos });
  // Processos ativos = visíveis, não excluídos e sem status de encerramento.
  const ativos = await prisma().parteProcesso.groupBy({
    by: ["pessoaId"],
    where: {
      pessoaId: { in: pessoas.map((p) => p.id) },
      processo: { excluidoEm: null, status: { comportamento: { not: "ENCERRADO_EXIGE_DATA" } }, AND: [filtroProcessosVisiveis(usuario)] },
    },
    _count: { _all: true },
  });
  const contagem = new Map(ativos.map((a) => [a.pessoaId, a._count._all]));

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Clientes</h1>
        {pode(usuario.perfil, "pessoa.editar") && <Link className="botao" href="/clientes/novo">Novo cliente</Link>}
      </div>
      <form className="filtros" method="get">
        <label className="largo">
          Buscar
          <input type="search" name="termo" defaultValue={termo} placeholder="Nome, CPF/CNPJ ou telefone" />
        </label>
        <label className="marcador">
          <input type="checkbox" name="todos" defaultChecked={!!todos} /> Incluir partes que não são clientes
        </label>
        <button className="secundario">Buscar</button>
      </form>
      <p className="suave">{pessoas.length === 100 ? "Mostrando 100; refine a busca." : `${pessoas.length} cadastro(s).`}</p>
      <ul className="lista-itens">
        {pessoas.map((p) => (
          <li key={p.id} className="item">
            <div className="item-topo">
              <Link href={`/clientes/${p.id}`}><strong>{p.nome}</strong></Link>
              {p.cadastroIncompleto && <Selo tipo="aviso">Incompleto</Selo>}
              {!p.ehCliente && <Selo>{p.categoria?.valor ?? "Parte"}</Selo>}
            </div>
            <p className="item-linha suave">
              {contagem.get(p.id) ?? 0} processo(s) ativo(s)
              {p.contatos[0] && ` · ${p.contatos[0].valor}`}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

// Partes contrárias (seção 5): instituições e pessoas com contagem de processos; mesclagem
// de cadastros duplicados (administrador).

import Link from "next/link";
import { mesclarPessoasForm } from "@/app/acoes/configuracoes";
import { BuscaPessoa } from "@/componentes/busca-pessoa";
import { Formulario, Painel } from "@/componentes/formulario";
import { Selo } from "@/componentes/selos";
import { TIPO_PESSOA, rotulo } from "@/lib/rotulos";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { pode } from "@/servidor/permissoes/matriz";
import { listarPartesContrarias } from "@/servidor/servicos/partes";
import { itensDaLista } from "@/servidor/servicos/referencias";

export default async function PartesContrarias({ searchParams }: { searchParams: Promise<{ termo?: string; categoriaId?: string }> }) {
  const usuario = await exigirUsuario();
  const f = await searchParams;
  const [partes, categorias] = await Promise.all([listarPartesContrarias(usuario, f), itensDaLista("CATEGORIA_PARTE")]);

  return (
    <>
      <h1>Partes contrárias</h1>
      <form className="filtros" method="get">
        <label className="largo">
          Buscar
          <input type="search" name="termo" defaultValue={f.termo} placeholder="Nome da instituição ou pessoa" />
        </label>
        <label>
          Categoria
          <select name="categoriaId" defaultValue={f.categoriaId ?? ""}>
            <option value="">Todas</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.valor}</option>)}
          </select>
        </label>
        <button className="secundario">Filtrar</button>
      </form>

      {pode(usuario.perfil, "parte.mesclar") && (
        <Painel titulo="Mesclar cadastros duplicados">
          <Formulario acao={mesclarPessoasForm} rotulo="Mesclar" aoConcluir="fechar"
            confirmar="Os processos, contatos e documentos do cadastro duplicado passam para o que fica, e o duplicado é excluído. Confirma?">
            <p className="dica">Ex.: “Banco Inbursa S.A.” e “Inbursa”. Escolha primeiro o cadastro correto, depois o duplicado.</p>
            <fieldset><legend>Cadastro que fica</legend><BuscaPessoa nome="manterId" categorias={categorias} /></fieldset>
            <fieldset><legend>Cadastro duplicado (será excluído)</legend><BuscaPessoa nome="removerId" categorias={categorias} /></fieldset>
          </Formulario>
        </Painel>
      )}

      <p className="suave">{partes.length} parte(s).</p>
      <ul className="lista-itens">
        {partes.map((p) => (
          <li key={p.id} className="item">
            <div className="item-topo">
              <Link href={`/clientes/${p.id}`}><strong>{p.nome}</strong></Link>
              <Selo>{p.categoria?.valor ?? rotulo(TIPO_PESSOA, p.tipo)}</Selo>
            </div>
            <p className="item-linha suave">
              <Link href={`/processos?parteId=${p.id}`}>{p.processos} processo(s)</Link>
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

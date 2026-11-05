import { editarComarcaForm, mesclarComarcasForm } from "@/app/acoes/configuracoes";
import { Campo, Selecao } from "@/componentes/campos";
import { Formulario, Painel } from "@/componentes/formulario";
import { comarcasComUso } from "@/servidor/servicos/configuracoes";
import { tribunais } from "@/servidor/servicos/referencias";

export default async function Comarcas() {
  const [lista, listaTribunais] = await Promise.all([comarcasComUso(), tribunais()]);
  const opcoes = lista.map((c) => ({ valor: c.id, rotulo: `${c.nome}/${c.uf}` }));
  return (
    <section className="secao">
      <Painel titulo="Mesclar comarcas duplicadas">
        <Formulario acao={mesclarComarcasForm} rotulo="Mesclar" aoConcluir="fechar" confirmar="Processos e feriados da duplicada passam para a que fica. Confirma?">
          <Selecao rotulo="Comarca que fica" nome="manterId" obrigatorio opcoes={opcoes} />
          <Selecao rotulo="Comarca duplicada (será removida)" nome="removerId" obrigatorio opcoes={opcoes} />
        </Formulario>
      </Painel>
      <p className="dica">Advogados e assistentes incluem comarcas ao cadastrar processos; aqui o administrador corrige e mescla.</p>
      <ul className="lista-itens">
        {lista.map((c) => (
          <li key={c.id} className="item">
            <div className="item-topo">
              <strong>{c.nome}/{c.uf}</strong>
              <span className="suave">{c._count.processos} processo(s) · {c._count.feriados} feriado(s)</span>
            </div>
            <Painel titulo="Editar">
              <Formulario acao={editarComarcaForm.bind(null, c.id)} aoConcluir="fechar">
                <div className="grade-2">
                  <Campo rotulo="Nome" nome="nome" valor={c.nome} obrigatorio />
                  <Campo rotulo="UF" nome="uf" valor={c.uf} obrigatorio maxLength={2} />
                  <Selecao rotulo="Tribunal" nome="tribunalCodigo" valor={c.tribunalCodigo} opcoes={listaTribunais.map((t) => ({ valor: t.codigo, rotulo: t.sigla }))} />
                  <Campo rotulo="Código de origem CNJ (OOOO)" nome="codigoOrigem" valor={c.codigoOrigem} maxLength={4} />
                </div>
              </Formulario>
            </Painel>
          </li>
        ))}
      </ul>
    </section>
  );
}

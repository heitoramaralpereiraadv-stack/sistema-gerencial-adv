import { criarItemForm, editarItemForm } from "@/app/acoes/configuracoes";
import { Campo, Marcador, Selecao } from "@/componentes/campos";
import { Formulario, Painel } from "@/componentes/formulario";
import { Selo } from "@/componentes/selos";
import { todosOsItens } from "@/servidor/servicos/configuracoes";

const NOMES = {
  AREA: "Áreas",
  CLASSE: "Classes / naturezas",
  TIPO_ANDAMENTO: "Tipos de andamento",
  CATEGORIA_PARTE: "Categorias de parte (PJ)",
  QUALIFICACAO_PARTE: "Qualificações de parte",
  TIPO_AUDIENCIA: "Tipos de audiência",
} as const;

export default async function Listas() {
  const itens = await todosOsItens();
  return (
    <section className="secao">
      <Painel titulo="Incluir valor">
        <Formulario acao={criarItemForm} rotulo="Incluir" aoConcluir="limpar">
          <Selecao rotulo="Lista" nome="lista" obrigatorio vazio={null} opcoes={Object.entries(NOMES).map(([valor, rotulo]) => ({ valor, rotulo }))} />
          <Campo rotulo="Valor" nome="valor" obrigatorio />
        </Formulario>
      </Painel>
      <p className="dica">Valores em uso não são apagados: desative-os para que deixem de aparecer nos formulários.</p>
      {(Object.keys(NOMES) as (keyof typeof NOMES)[]).map((lista) => {
        const daLista = itens.filter((i) => i.lista === lista);
        return (
          <details key={lista} className="painel">
            <summary>
              {NOMES[lista]} <span className="contagem">{daLista.filter((i) => i.ativo).length}</span>
            </summary>
            <div className="painel-corpo">
              {daLista.length === 0 && <p className="suave">Lista vazia.</p>}
              <ul className="lista-simples">
                {daLista.map((i) => (
                  <li key={i.id}>
                    <Formulario acao={editarItemForm.bind(null, i.id)} rotulo="Salvar" classe="linha-acao">
                      <input name="valor" defaultValue={i.valor} aria-label="Valor" required />
                      <input name="ordem" type="number" min={0} defaultValue={i.ordem} aria-label="Ordem" className="campo-curto" />
                      <Marcador rotulo="Ativo" nome="ativo" marcado={i.ativo} />
                    </Formulario>
                    {!i.ativo && <Selo>Inativo</Selo>}
                  </li>
                ))}
              </ul>
            </div>
          </details>
        );
      })}
    </section>
  );
}

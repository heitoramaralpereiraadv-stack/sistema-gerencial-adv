// Tabela Feriado (seção 3; regras 6 e 8): feriados, indisponibilidades e expediente reduzido.

import Link from "next/link";
import { carregarFeriadosPadraoForm, criarFeriadoForm, removerFeriadoForm } from "@/app/acoes/configuracoes";
import { Campo, Selecao } from "@/componentes/campos";
import { Formulario, Painel } from "@/componentes/formulario";
import { Selo } from "@/componentes/selos";
import { formatarDataComDia } from "@/dominio/prazos/data-civil";
import { hoje, paraDataCivil } from "@/lib/hoje";
import { feriadosDoAno } from "@/servidor/servicos/configuracoes";
import { comarcas, tribunais } from "@/servidor/servicos/referencias";

const ABRANGENCIA = { NACIONAL: "Nacional", ESTADUAL: "Estadual", MUNICIPAL: "Municipal (comarca)", FORENSE: "Forense (tribunal)" };
const NATUREZA = { FERIADO: "Feriado", INDISPONIBILIDADE: "Indisponibilidade do sistema", EXPEDIENTE_REDUZIDO: "Expediente reduzido" };

export default async function Feriados({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const atual = Number(hoje().slice(0, 4));
  const ano = Number((await searchParams).ano) || atual;
  const [lista, listaComarcas, listaTribunais] = await Promise.all([feriadosDoAno(ano), comarcas(), tribunais()]);

  return (
    <section className="secao">
      <nav className="abas" aria-label="Ano">
        {[atual - 1, atual, atual + 1].map((a) => (
          <Link key={a} href={`/configuracoes/feriados?ano=${a}`} aria-current={a === ano ? "page" : undefined}>{a}</Link>
        ))}
      </nav>
      <div className="acoes">
        <Painel titulo="Incluir feriado, indisponibilidade ou expediente reduzido">
          <Formulario acao={criarFeriadoForm} rotulo="Incluir" aoConcluir="limpar">
            <div className="grade-2">
              <Campo rotulo="Data" nome="data" tipo="date" obrigatorio />
              <Selecao rotulo="Natureza" nome="natureza" obrigatorio vazio={null} opcoes={Object.entries(NATUREZA).map(([valor, rotulo]) => ({ valor, rotulo }))} />
              <Selecao rotulo="Abrangência" nome="abrangencia" obrigatorio vazio={null} opcoes={Object.entries(ABRANGENCIA).map(([valor, rotulo]) => ({ valor, rotulo }))} />
              <Campo rotulo="UF (estadual)" nome="uf" maxLength={2} />
              <Selecao rotulo="Comarca (municipal; forense de uma comarca)" nome="comarcaId" opcoes={listaComarcas.map((c) => ({ valor: c.id, rotulo: `${c.nome}/${c.uf}` }))} />
              <Selecao rotulo="Tribunal (forense)" nome="tribunalCodigo" opcoes={listaTribunais.map((t) => ({ valor: t.codigo, rotulo: t.sigla }))} />
            </div>
            <Campo rotulo="Descrição" nome="descricao" obrigatorio />
            <Campo rotulo="Fonte (portaria, lei)" nome="fonte" />
          </Formulario>
        </Painel>
        <Formulario acao={carregarFeriadosPadraoForm.bind(null, ano)} rotulo={`Carregar feriados padrão de ${ano}`} classe="inline" />
      </div>
      <p className="suave">{lista.length} registro(s) em {ano}.</p>
      <ul className="lista-itens">
        {lista.map((f) => (
          <li key={f.id} className="item">
            <div className="item-topo">
              <strong>{formatarDataComDia(paraDataCivil(f.data))}</strong>
              <Selo tipo={f.natureza === "FERIADO" ? "info" : "aviso"}>{NATUREZA[f.natureza]}</Selo>
              <Selo>
                {ABRANGENCIA[f.abrangencia]}
                {f.abrangencia === "ESTADUAL" && ` · ${f.uf}`}
                {f.comarca && ` · ${f.comarca.nome}/${f.comarca.uf}`}
                {f.tribunal && ` · ${f.tribunal.sigla}`}
              </Selo>
            </div>
            <p className="item-linha">{f.descricao}</p>
            {f.fonte && <p className="item-linha suave">{f.fonte}</p>}
            <Formulario acao={removerFeriadoForm.bind(null, f.id)} rotulo="Remover" classe="inline" confirmar="Remover este registro? Prazos já calculados não mudam." />
          </li>
        ))}
      </ul>
    </section>
  );
}

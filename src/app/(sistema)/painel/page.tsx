// Painel (seções 5 e 6): indicadores gerais e carteira por status e por área. Cada número
// abre a lista filtrada.

import Link from "next/link";
import { Barras, FiltrosRelatorio } from "@/componentes/relatorio";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { carteiraPorArea, carteiraPorStatus, indicadores } from "@/servidor/relatorios/consultas";
import { lerFiltros } from "@/servidor/relatorios/tipos";
import { opcoesDeFiltro } from "../relatorios/apoio";

export default async function Painel({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const usuario = await exigirUsuario();
  const f = lerFiltros(await searchParams);
  const [ind, status, areas, opcoes] = await Promise.all([
    indicadores(usuario, f),
    carteiraPorStatus(usuario, f),
    carteiraPorArea(usuario, f),
    opcoesDeFiltro(),
  ]);
  const DESTAQUE = new Set(["Prazos vencidos"]);
  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Painel</h1>
        <Link className="botao secundario" href="/relatorios">Relatórios</Link>
      </div>
      <FiltrosRelatorio filtros={f} periodo={false} {...opcoes} />
      <ul className="indicadores">
        {ind.tabela.linhas.map((l, i) => (
          <li key={String(l.indicador)} className={DESTAQUE.has(String(l.indicador)) && Number(l.valor) > 0 ? "indicador-alerta" : undefined}>
            <Link href={ind.tabela.links![i]!}>
              <span className="indicador-valor">{l.valor}</span>
              <span className="indicador-rotulo">{l.indicador}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="grade-polos">
        <section className="cartao">
          <h2>Carteira por status</h2>
          <Barras tabela={status} chaveRotulo="status" chaveValor="processos" />
        </section>
        <section className="cartao">
          <h2>Carteira por área</h2>
          <Barras tabela={areas} chaveRotulo="area" chaveValor="processos" />
        </section>
      </div>
    </>
  );
}

// Peças de tela dos relatórios: filtros, tabela, botões de exportação e barras.

import Link from "next/link";
import type { Filtros, Tabela } from "@/servidor/relatorios/tipos";

type Opcao = { id: string; nome: string };

export function FiltrosRelatorio({
  filtros,
  periodo,
  responsaveis,
  areas,
  status,
}: {
  filtros: Filtros;
  periodo: boolean;
  responsaveis: Opcao[];
  areas: Opcao[];
  status: Opcao[];
}) {
  const selecao = (nome: string, rotulo: string, opcoes: Opcao[], valor?: string) => (
    <label>
      {rotulo}
      <select name={nome} defaultValue={valor ?? ""}>
        <option value="">Todos</option>
        {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
      </select>
    </label>
  );
  return (
    <form className="filtros" method="get">
      {periodo && (
        <>
          <label>De<input type="date" name="inicio" defaultValue={filtros.inicio} /></label>
          <label>Até<input type="date" name="fim" defaultValue={filtros.fim} /></label>
        </>
      )}
      {selecao("responsavelId", "Responsável", responsaveis, filtros.responsavelId)}
      {selecao("areaId", "Área", areas, filtros.areaId)}
      {selecao("statusId", "Status", status, filtros.statusId)}
      <button className="secundario">Filtrar</button>
    </form>
  );
}

export function BotoesExportar({ tipo, parametros }: { tipo: string; parametros: Record<string, string | undefined> }) {
  const qs = (formato: string) =>
    new URLSearchParams({ ...Object.fromEntries(Object.entries(parametros).filter((e): e is [string, string] => !!e[1])), formato }).toString();
  return (
    <div className="botoes">
      <a className="botao secundario" href={`/relatorios/${tipo}/exportar?${qs("xlsx")}`}>Exportar Excel</a>
      <a className="botao secundario" href={`/relatorios/${tipo}/exportar?${qs("pdf")}`}>Exportar PDF</a>
    </div>
  );
}

export function TabelaRelatorio({ tabela }: { tabela: Tabela }) {
  return (
    <>
      {tabela.resumo && tabela.resumo.length > 0 && (
        <dl className="dados cartao">
          {tabela.resumo.map((r) => (
            <div key={r.rotulo}><dt>{r.rotulo}</dt><dd>{r.valor}</dd></div>
          ))}
        </dl>
      )}
      <p className="suave">{tabela.linhas.length} linha(s).</p>
      <div className="tabela-rolavel">
        <table className="tabela">
          <thead>
            <tr>{tabela.colunas.map((c) => <th key={c.chave} className={c.numero ? "numero" : undefined}>{c.titulo}</th>)}</tr>
          </thead>
          <tbody>
            {tabela.linhas.length === 0 && (
              <tr><td colSpan={tabela.colunas.length} className="suave">Nenhum registro para os filtros escolhidos.</td></tr>
            )}
            {tabela.linhas.map((l, i) => (
              <tr key={i}>
                {tabela.colunas.map((c, j) => {
                  const v = l[c.chave] ?? "";
                  const link = j === 0 ? tabela.links?.[i] : null;
                  return <td key={c.chave} className={c.numero ? "numero" : undefined}>{link ? <Link href={link}>{v}</Link> : v}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tabela.observacao && <p className="dica">{tabela.observacao}</p>}
    </>
  );
}

/**
 * Barras horizontais de uma série (contagem por categoria). Uma cor só; o valor vem escrito
 * ao lado, e cada barra leva à lista filtrada.
 */
export function Barras({ tabela, chaveRotulo, chaveValor }: { tabela: Tabela; chaveRotulo: string; chaveValor: string }) {
  const maximo = Math.max(1, ...tabela.linhas.map((l) => Number(l[chaveValor] ?? 0)));
  return (
    <ul className="barras">
      {tabela.linhas.map((l, i) => {
        const valor = Number(l[chaveValor] ?? 0);
        const conteudo = (
          <>
            <span className="barras-rotulo">{l[chaveRotulo]}</span>
            <span className="barras-trilho" aria-hidden="true">
              {valor > 0 && <span className="barras-barra" style={{ width: `${(valor / maximo) * 100}%` }} />}
            </span>
            <span className="barras-valor">{valor}</span>
          </>
        );
        const link = tabela.links?.[i];
        return (
          <li key={String(l[chaveRotulo])} title={`${l[chaveRotulo]}: ${valor}`}>
            {link ? <Link href={link}>{conteudo}</Link> : conteudo}
          </li>
        );
      })}
    </ul>
  );
}

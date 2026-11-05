// Revisão da importação (seção 8.1): separações e mesclagens sugeridas são decididas aqui,
// antes de gravar. Depois de gravado, mostra o relatório final.

import Link from "next/link";
import { notFound } from "next/navigation";
import { descartarLoteAcao, gravarLoteAcao, salvarRevisaoAcao } from "@/app/acoes/importacao";
import { Formulario, Painel } from "@/componentes/formulario";
import { Selo } from "@/componentes/selos";
import { formatarDataHora } from "@/lib/data-hora";
import { TIPO_PESSOA, rotulo } from "@/lib/rotulos";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { NaoEncontradoError } from "@/servidor/erros";
import { obterLote, type RelatorioImportacao } from "@/servidor/servicos/importacao";
import { usuariosAtivos } from "@/servidor/servicos/referencias";

type Conciliacao = Awaited<ReturnType<typeof obterLote>>["conciliacao"];

function TabelaConciliacao({ c }: { c: Conciliacao }) {
  const linha = (rotuloLinha: string, planilha: number, sistema: number) => (
    <tr key={rotuloLinha}>
      <td>{rotuloLinha}</td>
      <td>{planilha}</td>
      <td>{sistema}</td>
      <td>{planilha === sistema ? <Selo tipo="ok">Confere</Selo> : <Selo tipo="aviso">Diferente</Selo>}</td>
    </tr>
  );
  const status = [...new Set([...Object.keys(c.planilha.porStatus), ...Object.keys(c.sistema.porStatus)])];
  const areas = [...new Set([...Object.keys(c.planilha.porArea), ...Object.keys(c.sistema.porArea)])];
  return (
    <div className="tabela-rolavel">
      <table className="tabela">
        <thead><tr><th>Indicador</th><th>Planilha</th><th>Sistema</th><th></th></tr></thead>
        <tbody>
          {linha("Processos", c.planilha.processos, c.sistema.processos)}
          {linha("Processos sem número", c.planilha.semNumero, c.sistema.semNumero)}
          {status.map((s) => linha(`Status: ${s}`, c.planilha.porStatus[s] ?? 0, c.sistema.porStatus[s] ?? 0))}
          {areas.map((a) => linha(`Área: ${a}`, c.planilha.porArea[a] ?? 0, c.sistema.porArea[a] ?? 0))}
          <tr><td>Clientes (linhas da planilha × pessoas)</td><td>{c.planilha.clientes}</td><td>{c.sistema.clientes}</td><td><Selo>Clientes compostos separados (C1)</Selo></td></tr>
          <tr><td>Processos relacionados criados das observações (C4)</td><td>—</td><td>{c.sistema.relacionados}</td><td></td></tr>
        </tbody>
      </table>
    </div>
  );
}

function Relatorio({ r }: { r: RelatorioImportacao }) {
  return (
    <>
      <section className="cartao">
        <h2>Relatório da importação</h2>
        <dl className="dados">
          <div><dt>Gravado em</dt><dd>{formatarDataHora(new Date(r.gravadoEm))}</dd></div>
          <div><dt>Processos da planilha</dt><dd>{r.processos}</dd></div>
          <div><dt>Processos relacionados (observações)</dt><dd>{r.processosRelacionados}</dd></div>
          <div><dt>Clientes</dt><dd>{r.clientes}</dd></div>
          <div><dt>Demais partes</dt><dd>{r.demaisPartes}</dd></div>
          <div><dt>Comarcas</dt><dd>{r.comarcas}</dd></div>
          <div><dt>Mesclagens</dt><dd>{r.mesclagens.grupos} grupo(s), {r.mesclagens.cadastrosUnidos} cadastro(s) unido(s)</dd></div>
          <div><dt>Nomes separados</dt><dd>{r.separacoes}</dd></div>
          <div><dt>Registros pendentes</dt><dd>{r.pendentes.length}</dd></div>
        </dl>
      </section>
      <section className="secao">
        <h2>Conferência com a planilha</h2>
        <TabelaConciliacao c={r.conciliacao} />
      </section>
      <section className="secao">
        <h2>Pendentes <span className="contagem">{r.pendentes.length}</span></h2>
        <ul className="lista-itens">
          {r.pendentes.map((p) => (
            <li key={`${p.tipo}-${p.codigo}-${p.nome}`} className="item">
              <div className="item-topo"><strong>{p.codigo}</strong> <span>{p.nome}</span> <Selo>{p.tipo}</Selo></div>
              <ul>{p.pendencias.map((x) => <li key={x}>{x}</li>)}</ul>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export default async function RevisaoImportacao({ params }: { params: Promise<{ id: string }> }) {
  const admin = await exigirUsuario();
  const { id } = await params;
  const l = await obterLote(admin, id).catch((e) => {
    if (e instanceof NaoEncontradoError) notFound();
    throw e;
  });
  const cabecalho = (
    <>
      <p className="suave"><Link href="/importacao">Importação</Link> /</p>
      <h1>{l.arquivo}</h1>
    </>
  );
  if (l.situacao === "GRAVADO") return <>{cabecalho}<Relatorio r={l.relatorio as unknown as RelatorioImportacao} /></>;
  if (l.situacao === "DESCARTADO") return <>{cabecalho}<p>Lote descartado.</p></>;

  const { proposta: p, decisoes } = l;
  const advogados = (await usuariosAtivos()).filter((u) => u.perfil !== "ASSISTENTE");
  const clientes = p.pessoas.filter((x) => x.ehCliente);
  const pendentes = p.processos.filter((x) => x.pendencias.length);
  const nomePessoa = new Map(p.pessoas.map((x) => [x.chave, x.nome]));

  return (
    <>
      {cabecalho}
      <section className="cartao">
        <dl className="dados">
          <div><dt>Processos</dt><dd>{p.processos.length} (com {p.processos.filter((x) => x.codigoLegado.includes("-R")).length} relacionados)</dd></div>
          <div><dt>Clientes</dt><dd>{clientes.length}</dd></div>
          <div><dt>Demais partes</dt><dd>{p.pessoas.length - clientes.length}</dd></div>
          <div><dt>Mesclagens sugeridas</dt><dd>{p.mesclagens.length}</dd></div>
          <div><dt>Separações sugeridas</dt><dd>{p.separacoes.length}</dd></div>
          <div><dt>Processos com pendência</dt><dd>{pendentes.length}</dd></div>
          <div><dt>Revisão salva</dt><dd>{decisoes.revisadoEm ? formatarDataHora(new Date(decisoes.revisadoEm)) : "ainda não"}</dd></div>
        </dl>
      </section>

      {p.erros.length > 0 && (
        <section className="secao">
          <h2>Impede a gravação</h2>
          <ul className="lista-simples">{p.erros.map((e) => <li key={e} className="erro">{e}</li>)}</ul>
        </section>
      )}
      {p.alertas.length > 0 && (
        <section className="secao">
          <h2>Conferir</h2>
          <ul className="lista-simples">{p.alertas.map((a) => <li key={a}><Selo tipo="aviso">Atenção</Selo> {a}</li>)}</ul>
        </section>
      )}

      {/* A chave recria o formulário a cada revisão salva, para mostrar as decisões gravadas. */}
      <Formulario key={decisoes.revisadoEm ?? "nova"} acao={salvarRevisaoAcao.bind(null, l.id)} rotulo="Salvar revisão e recalcular">
        <fieldset>
          <legend>Responsáveis da planilha</legend>
          {p.responsaveis.map((nome) => (
            <label key={nome}>
              “{nome}” na planilha corresponde a
              <input type="hidden" name="responsavel" value={nome} />
              <select name={`responsavel:${nome}`} defaultValue={decisoes.responsaveis[nome] ?? ""} required>
                <option value="">Escolha</option>
                {advogados.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Separação de nomes compostos ({p.separacoes.length})</legend>
          <p className="dica">Marcado: cada nome vira uma parte. Desmarcado: é uma parte só (ex.: banco e nome comercial — C2).</p>
          {p.separacoes.map((s) => (
            <div key={s.id} className="item">
              <input type="hidden" name="separacao" value={s.id} />
              <label className="marcador">
                <input type="checkbox" name={`separar:${s.id}`} defaultChecked={s.separar} />
                <span><strong>{s.texto}</strong></span>
              </label>
              <label>
                Nomes separados (separe com ponto e vírgula)
                <input name={`partes:${s.id}`} defaultValue={s.partes.join("; ")} />
              </label>
              <p className="item-linha suave">{s.processos.join(", ")} · sugestão: {s.sugerido ? "separar" : "manter junto"}</p>
            </div>
          ))}
        </fieldset>

        <fieldset>
          <legend>Mesclagem de nomes equivalentes ({p.mesclagens.length})</legend>
          <p className="dica">Marcado: os cadastros viram um só, com o nome indicado. Confira cada grupo.</p>
          {p.mesclagens.map((m) => (
            <div key={m.id} className="item">
              <input type="hidden" name="mesclagem" value={m.id} />
              <label className="marcador">
                <input type="checkbox" name={`mesclar:${m.id}`} defaultChecked={m.aceita} />
                Mesclar
              </label>
              <ul className="lista-simples">
                {m.nomes.map((n) => <li key={n.nome}>{n.nome} <span className="suave">({n.processos.join(", ")})</span></li>)}
              </ul>
              <label>
                Nome final
                <input name={`nome:${m.id}`} defaultValue={m.nomeFinal} />
              </label>
            </div>
          ))}
        </fieldset>
      </Formulario>

      <section className="secao">
        <h2>Conferência com a planilha (prévia)</h2>
        <TabelaConciliacao c={l.conciliacao} />
      </section>

      <section className="secao">
        <Painel titulo={`Clientes (${clientes.length})`}>
          <ul className="lista-simples">
            {clientes.map((c) => (
              <li key={c.chave}>
                <strong>{c.codigoLegado}</strong> {c.nome} <Selo>{rotulo(TIPO_PESSOA, c.tipo)}</Selo>
                {c.pendencias.map((x) => <Selo key={x} tipo="aviso">{x}</Selo>)}
              </li>
            ))}
          </ul>
        </Painel>
        <Painel titulo={`Processos com pendência (${pendentes.length})`}>
          <ul className="lista-itens">
            {pendentes.map((x) => (
              <li key={x.codigoLegado} className="item">
                <div className="item-topo"><strong>{x.codigoLegado}</strong> {x.numeroCnj ?? "sem número"}</div>
                <p className="item-linha suave">{x.partes.map((pa) => nomePessoa.get(pa.pessoa)).join(" × ")}</p>
                <ul>{x.pendencias.map((y) => <li key={y}>{y}</li>)}</ul>
              </li>
            ))}
          </ul>
        </Painel>
      </section>

      <section className="secao acoes">
        <Formulario
          acao={gravarLoteAcao.bind(null, l.id)}
          rotulo="Gravar no sistema"
          confirmar="Gravar a importação? Ela é feita uma única vez e fica registrada no histórico."
        />
        <Formulario acao={descartarLoteAcao.bind(null, l.id)} rotulo="Descartar lote" classe="inline" confirmar="Descartar este lote?" />
      </section>
    </>
  );
}

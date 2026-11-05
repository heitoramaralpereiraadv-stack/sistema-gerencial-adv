// Revisão da importação do Google Agenda, evento a evento (G2). Sem escolha, cada evento vira
// compromisso ligado a cada processo citado; sem processo, compromisso avulso.

import Link from "next/link";
import { notFound } from "next/navigation";
import { descartarLoteAgendaAcao, gravarLoteAgendaAcao, salvarRevisaoAgendaAcao } from "@/app/acoes/agenda";
import { opcoesDe, Selecao } from "@/componentes/campos";
import { Formulario } from "@/componentes/formulario";
import { Selo } from "@/componentes/selos";
import { formatarData } from "@/dominio/prazos/data-civil";
import { formatarDataHora } from "@/lib/data-hora";
import { MODALIDADE } from "@/lib/rotulos";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { NaoEncontradoError } from "@/servidor/erros";
import { modalidadeSugerida, obterLoteAgenda, SITUACAO_EVENTO, type EventoLote, type SituacaoEvento } from "@/servidor/servicos/google-agenda";

const TIPOS = { COMPROMISSO: "Compromisso (padrão)", AUDIENCIA: "Audiência", IGNORAR: "Não importar" };
const quando = (e: Pick<EventoLote, "diaInteiro" | "data" | "inicio">) =>
  e.diaInteiro ? `${formatarData(e.data)} (dia inteiro)` : formatarDataHora(new Date(e.inicio));

export default async function RevisaoAgenda({ params }: { params: Promise<{ id: string }> }) {
  const admin = await exigirUsuario();
  const { id } = await params;
  const l = await obterLoteAgenda(admin, id).catch((e) => {
    if (e instanceof NaoEncontradoError) notFound();
    throw e;
  });
  const emRevisao = l.situacao === "EM_REVISAO";
  const relatorio = l.relatorio as { compromissos: number; audiencias: number; ignorados: number; jaExistentes: number } | null;
  const comProblema = l.revisados.filter((r) => r.problemas.length).length;

  return (
    <>
      <p className="suave">
        <Link href="/configuracoes/google-agenda">Google Agenda</Link> / {l.arquivo}
      </p>
      <section className="cartao">
        <dl className="dados">
          {(Object.keys(SITUACAO_EVENTO) as SituacaoEvento[]).map((s) => (
            <div key={s}><dt>{SITUACAO_EVENTO[s]}</dt><dd>{l.contagem[s] ?? 0}</dd></div>
          ))}
        </dl>
      </section>

      {relatorio && (
        <p className="destaque-ok" role="status">
          Gravado: {relatorio.compromissos} compromisso(s), {relatorio.audiencias} audiência(s); {relatorio.ignorados} não importado(s)
          {relatorio.jaExistentes > 0 && `; ${relatorio.jaExistentes} já existiam`}.
        </p>
      )}
      {l.situacao === "DESCARTADO" && <p className="destaque-vencidos">Importação descartada.</p>}

      {emRevisao && l.revisados.length > 0 && (
        <Formulario key={l.revisadoEm?.toISOString() ?? "nova"} acao={salvarRevisaoAgendaAcao.bind(null, l.id)} rotulo="Salvar revisão">
          <p className="dica">
            Escreva os números dos processos separados por ponto e vírgula. Compromisso com vários números entra em cada processo. Audiência
            exige um único processo e o tipo. O responsável será você ({admin.nome}).
          </p>
          <ul className="lista-itens">
            {l.revisados.map((e) => (
              <li key={e.uid} className={`item ${e.problemas.length ? "alerta-vermelho" : ""}`}>
                <input type="hidden" name="evento" value={e.indice} />
                <input type="hidden" name={`uid:${e.indice}`} value={e.uid} />
                <div className="item-topo">
                  <strong>{quando(e)}</strong>
                  {e.processosAchados.map((p) => <Selo key={p.id} tipo="info">{p.numeroCnj}</Selo>)}
                </div>
                <p className="item-titulo">{e.titulo}</p>
                {e.local && <p className="item-linha suave">{e.local}</p>}
                {e.descricao && <p className="item-linha texto suave">{e.descricao.slice(0, 400)}{e.descricao.length > 400 && "…"}</p>}
                <div className="grade-2">
                  <Selecao rotulo="Importar como" nome={`tipo:${e.indice}`} valor={e.decisao.tipo} vazio={null} opcoes={opcoesDe(TIPOS)} />
                  <label>
                    Processo(s)
                    <input name={`processos:${e.indice}`} defaultValue={e.decisao.processos} placeholder="Sem processo: compromisso avulso" />
                  </label>
                </div>
                <div className="grade-2">
                  <Selecao
                    rotulo="Tipo de audiência (se audiência)"
                    nome={`tipoAudienciaId:${e.indice}`}
                    valor={e.decisao.tipoAudienciaId}
                    opcoes={l.tiposAudiencia.map((t) => ({ valor: t.id, rotulo: t.valor }))}
                  />
                  <Selecao
                    rotulo="Modalidade (se audiência)"
                    nome={`modalidade:${e.indice}`}
                    valor={e.decisao.modalidade ?? modalidadeSugerida(e)}
                    vazio={null}
                    opcoes={opcoesDe(MODALIDADE)}
                  />
                </div>
                {e.problemas.map((p) => <p key={p} className="erro">{p}</p>)}
                {e.avisos.map((a) => <p key={a} className="dica">{a}</p>)}
              </li>
            ))}
          </ul>
        </Formulario>
      )}
      {emRevisao && l.revisados.length === 0 && <p className="suave">Nenhum evento novo para importar.</p>}

      {emRevisao && (
        <section className="secao botoes">
          {l.podeGravar ? (
            <Formulario acao={gravarLoteAgendaAcao.bind(null, l.id)} rotulo={`Gravar ${l.revisados.length} evento(s)`} classe="inline" confirmar="Gravar a importação conforme a revisão salva?" />
          ) : (
            <p className="destaque-vencidos">{comProblema} evento(s) com pendência. Corrija e salve a revisão para poder gravar.</p>
          )}
          <Formulario acao={descartarLoteAgendaAcao.bind(null, l.id)} rotulo="Descartar" classe="inline" confirmar="Descartar esta importação?" />
        </section>
      )}

      {l.outros.length > 0 && (
        <section className="secao">
          <h2>Não entram nesta importação</h2>
          <ul className="lista-itens">
            {l.outros.map((e) => (
              <li key={e.uid} className="item">
                <div className="item-topo">
                  <strong>{quando(e)}</strong>
                  <Selo>{SITUACAO_EVENTO[e.situacao]}</Selo>
                </div>
                <p className="item-linha">{e.titulo}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

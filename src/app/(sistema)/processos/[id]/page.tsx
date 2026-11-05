// Ficha do processo (seção 5): cabeçalho, partes por polo, vinculados, linha do tempo de
// andamentos, prazos (com memória de cálculo) e audiências.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  adicionarParteAcao,
  alterarStatusAcao,
  criarAndamentoAcao,
  desvincularProcessoAcao,
  editarAndamentoAcao,
  removerParteAcao,
  salvarAudienciaAcao,
  vincularProcessoAcao,
} from "@/app/acoes/processos";
import { ajustarPrazoAcao, conferirPrazoAcao, criarPrazoAcao, cumprirPrazoAcao, situacaoPrazoAcao } from "@/app/acoes/prazos";
import { salvarCompromissoAcao } from "@/app/acoes/agenda";
import { excluirRegistroAcao } from "@/app/acoes/registros";
import { BuscaPessoa } from "@/componentes/busca-pessoa";
import { AreaTexto, Campo, Marcador, Selecao, opcoesDe } from "@/componentes/campos";
import { CamposPrazo } from "@/componentes/campos-prazo";
import { Formulario, Painel } from "@/componentes/formulario";
import { FormularioAndamento } from "@/componentes/formulario-andamento";
import { FormularioCompromisso } from "@/componentes/formulario-compromisso";
import { Selo } from "@/componentes/selos";
import { formatarData } from "@/dominio/prazos/data-civil";
import { memoriaPrazoEmTexto, type MemoriaPrazo } from "@/dominio/prazos/memoria";
import { dataEmSaoPaulo, formatarDataHora, paraCampoDataHora } from "@/lib/data-hora";
import { hoje, paraDataCivil } from "@/lib/hoje";
import { GRAU, MODALIDADE, POLO, SITUACAO_PRAZO, TIPO_VINCULO, rotulo } from "@/lib/rotulos";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { NaoEncontradoError } from "@/servidor/erros";
import { pode } from "@/servidor/permissoes/matriz";
import { enxergaProcesso } from "@/servidor/servicos/comum";
import { descreverDataEfetiva } from "@/servidor/servicos/prazos";
import { obterFichaProcesso } from "@/servidor/servicos/processos";
import { itensDaLista, statusAtivos, usuariosAtivos } from "@/servidor/servicos/referencias";

const data = (d: Date | null) => (d ? formatarData(paraDataCivil(d)) : "—");
const moeda = (v: { toString(): string } | null) =>
  v ? Number(v.toString()).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

export default async function FichaProcesso({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await exigirUsuario();
  const { id } = await params;
  const p = await obterFichaProcesso(usuario, id).catch((e) => {
    if (e instanceof NaoEncontradoError) notFound();
    throw e;
  });
  const [tiposAndamento, tiposAudiencia, qualificacoes, categorias, status, usuarios] = await Promise.all([
    itensDaLista("TIPO_ANDAMENTO"),
    itensDaLista("TIPO_AUDIENCIA"),
    itensDaLista("QUALIFICACAO_PARTE"),
    itensDaLista("CATEGORIA_PARTE"),
    statusAtivos(),
    usuariosAtivos(),
  ]);
  // D4: só quem enxerga o processo pode ser responsável por prazo ou audiência dele.
  const responsaveis = usuarios.filter((u) => enxergaProcesso(u, p));
  const responsavelPadrao = responsaveis.some((u) => u.id === usuario.id) ? usuario.id : p.responsavelId;
  const encerrado = p.status.comportamento === "ENCERRADO_EXIGE_DATA";
  const pd = {
    editar: pode(usuario.perfil, "processo.editar"),
    andamento: pode(usuario.perfil, "andamento.editar"),
    prazo: pode(usuario.perfil, "prazo.editar"),
    cumprir: pode(usuario.perfil, "prazo.cumprir"),
    audiencia: pode(usuario.perfil, "audiencia.editar"),
    compromisso: pode(usuario.perfil, "compromisso.editar"),
    excluir: pode(usuario.perfil, "registro.excluir"),
  };
  const polos = (["ATIVO", "PASSIVO", "TERCEIRO", "OUTRO"] as const)
    .map((polo) => ({ polo, partes: p.partes.filter((x) => x.polo === polo) }))
    .filter((g) => g.partes.length > 0);

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <p className="suave">
            <Link href="/processos">Processos</Link> /
          </p>
          <h1>{p.numeroCnj ?? "Processo sem número"}</h1>
          <div className="selos">
            <Selo tipo={encerrado ? "neutro" : "info"}>{p.status.nome}</Selo>
            {p.segredoJustica && <Selo tipo="aviso">Segredo de justiça</Selo>}
            {p.cadastroIncompleto && <Selo tipo="aviso">Cadastro incompleto</Selo>}
          </div>
        </div>
        {pd.editar && (
          <Link className="botao secundario" href={`/processos/${p.id}/editar`}>
            Editar dados
          </Link>
        )}
      </div>

      <section className="cartao">
        <dl className="dados">
          <div><dt>Tribunal</dt><dd>{p.tribunal?.sigla ?? "—"}</dd></div>
          <div><dt>Grau</dt><dd>{rotulo(GRAU, p.grau)}</dd></div>
          <div><dt>Órgão julgador</dt><dd>{p.orgaoJulgador ?? "—"}</dd></div>
          <div><dt>Comarca</dt><dd>{p.comarca ? `${p.comarca.nome}/${p.comarca.uf}` : "—"}</dd></div>
          <div><dt>Área</dt><dd>{p.area.valor}</dd></div>
          <div><dt>Classe</dt><dd>{p.classe?.valor ?? "—"}</dd></div>
          <div className="largo"><dt>Assunto</dt><dd>{p.assunto ?? "—"}</dd></div>
          <div className="largo"><dt>Fase atual</dt><dd>{p.faseAtual ?? "—"}</dd></div>
          <div><dt>Distribuição</dt><dd>{data(p.dataDistribuicao)}</dd></div>
          <div><dt>Citação</dt><dd>{data(p.dataCitacao)}</dd></div>
          <div><dt>Valor da causa</dt><dd>{moeda(p.valorCausa)}</dd></div>
          <div><dt>Responsável</dt><dd>{p.responsavel.nome}</dd></div>
          {p.motivoSuspensao && <div className="largo"><dt>Motivo da suspensão</dt><dd>{p.motivoSuspensao} {p.dataSuspensao && `(desde ${data(p.dataSuspensao)})`}</dd></div>}
          {p.dataEncerramento && <div><dt>Encerramento</dt><dd>{data(p.dataEncerramento)}</dd></div>}
          {p.dataResultado && <div><dt>{p.resultado === "ACORDO" ? "Homologação do acordo" : "Data do resultado"}</dt><dd>{data(p.dataResultado)}</dd></div>}
          {p.pendencias && <div className="largo"><dt>Pendências do cadastro</dt><dd>{p.pendencias}</dd></div>}
          {p.observacoes && <div className="largo"><dt>Observações</dt><dd className="texto">{p.observacoes}</dd></div>}
        </dl>
      </section>

      <section className="acoes">
        {pd.andamento && (
          <Painel titulo="Novo andamento">
            <FormularioAndamento
              acao={criarAndamentoAcao.bind(null, p.id)}
              processoId={p.id}
              tipos={tiposAndamento}
              responsaveis={responsaveis}
              responsavelPadrao={responsavelPadrao}
              hoje={hoje()}
              podeCriarPrazo={pd.prazo && !encerrado}
            />
          </Painel>
        )}
        {pd.prazo && !encerrado && (
          <Painel titulo="Novo prazo">
            <Formulario acao={criarPrazoAcao.bind(null, p.id)} rotulo="Salvar prazo" aoConcluir="limpar">
              <CamposPrazo processoId={p.id} responsaveis={responsaveis} responsavelPadrao={responsavelPadrao} />
              <AreaTexto rotulo="Observações" nome="observacoes" linhas={2} />
            </Formulario>
          </Painel>
        )}
        {pd.audiencia && (
          <Painel titulo="Nova audiência">
            <FormAudiencia acao={salvarAudienciaAcao.bind(null, p.id, null)} tipos={tiposAudiencia} responsaveis={responsaveis} responsavelPadrao={responsavelPadrao} />
          </Painel>
        )}
        {pd.compromisso && (
          <Painel titulo="Novo compromisso">
            <FormularioCompromisso acao={salvarCompromissoAcao.bind(null, p.id, null)} responsaveis={responsaveis} responsavelPadrao={responsavelPadrao} />
          </Painel>
        )}
        {pd.editar && (
          <Painel titulo="Alterar status">
            <Formulario acao={alterarStatusAcao.bind(null, p.id)} aoConcluir="fechar">
              <Selecao rotulo="Novo status" nome="statusId" valor={p.statusId} obrigatorio vazio={null}
                opcoes={status.map((s) => ({ valor: s.id, rotulo: s.nome }))} />
              <Campo rotulo="Motivo (Sobrestado/Suspenso)" nome="motivoSuspensao" valor={p.motivoSuspensao} dica='Obrigatório para Sobrestado e Suspenso. Ex.: "Tema 1414/STJ".' />
              <Campo rotulo="Desde" nome="dataSuspensao" tipo="date" valor={p.dataSuspensao && paraDataCivil(p.dataSuspensao)} />
              <Campo rotulo="Data de encerramento" nome="dataEncerramento" tipo="date" valor={p.dataEncerramento && paraDataCivil(p.dataEncerramento)} dica="Obrigatória para Encerrado e Arquivado; bloqueia novos prazos." />
              <Campo rotulo="Data da sentença / homologação do acordo" nome="dataResultado" tipo="date" valor={p.dataResultado && paraDataCivil(p.dataResultado)} dica="Obrigatória para Acordo." />
              {encerrado && !pode(usuario.perfil, "processo.reabrir") && (
                <p className="dica">Somente um administrador pode reabrir este processo.</p>
              )}
            </Formulario>
          </Painel>
        )}
      </section>

      <section className="secao">
        <h2>Partes</h2>
        {polos.length === 0 && <p className="suave">Nenhuma parte cadastrada.</p>}
        <div className="grade-polos">
          {polos.map((g) => (
            <div key={g.polo} className="cartao">
              <h3>{POLO[g.polo]}</h3>
              <ul className="lista-simples">
                {g.partes.map((x) => (
                  <li key={x.id}>
                    <Link href={`/clientes/${x.pessoa.id}`}>{x.pessoa.nome}</Link>
                    {x.ehClienteDoEscritorio && <> <Selo tipo="ok">Cliente</Selo></>}
                    {x.qualificacoes.length > 0 && <span className="suave"> · {x.qualificacoes.map((q) => q.valor).join(", ")}</span>}
                    {pd.editar && (
                      <Formulario acao={removerParteAcao.bind(null, p.id, x.id)} rotulo="Remover" classe="inline" confirmar={`Remover ${x.pessoa.nome} deste processo?`} />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {pd.editar && (
          <Painel titulo="Adicionar parte">
            <Formulario acao={adicionarParteAcao.bind(null, p.id)} rotulo="Adicionar" aoConcluir="fechar">
              <BuscaPessoa categorias={categorias} />
              <Selecao rotulo="Polo" nome="polo" obrigatorio vazio={null} opcoes={opcoesDe(POLO)} />
              <fieldset>
                <legend>Qualificação</legend>
                <div className="opcoes-multiplas">
                  {qualificacoes.map((q) => (
                    <label key={q.id} className="marcador">
                      <input type="checkbox" name="qualificacaoIds" value={q.id} /> {q.valor}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Marcador rotulo="É cliente do escritório neste processo" nome="ehClienteDoEscritorio" />
            </Formulario>
          </Painel>
        )}
      </section>

      <section className="secao">
        <h2>Processos vinculados</h2>
        {p.vinculos.length === 0 ? (
          <p className="suave">Nenhum processo vinculado.</p>
        ) : (
          <ul className="lista-simples">
            {p.vinculos.map((v) => (
              <li key={v.id}>
                <Selo>{rotulo(TIPO_VINCULO, v.tipo)}</Selo> <Link href={`/processos/${v.processo.id}`}>{v.processo.numeroCnj ?? "sem número"}</Link>
                <span className="suave"> · {v.processo.status.nome}{v.processo.assunto ? ` · ${v.processo.assunto}` : ""}</span>
                {pd.editar && <Formulario acao={desvincularProcessoAcao.bind(null, p.id, v.id)} rotulo="Desvincular" classe="inline" confirmar="Desfazer este vínculo?" />}
              </li>
            ))}
          </ul>
        )}
        {pd.editar && (
          <Painel titulo="Vincular processo">
            <Formulario acao={vincularProcessoAcao.bind(null, p.id)} rotulo="Vincular" aoConcluir="limpar">
              <Campo rotulo="Número CNJ do outro processo" nome="numeroCnj" obrigatorio />
              <Selecao rotulo="Tipo de vínculo" nome="tipo" obrigatorio vazio={null} opcoes={opcoesDe(TIPO_VINCULO)} />
            </Formulario>
          </Painel>
        )}
      </section>

      <section className="secao">
        <h2>Prazos</h2>
        {p.prazos.length === 0 ? (
          <p className="suave">Nenhum prazo.</p>
        ) : (
          <ul className="lista-itens">
            {p.prazos.map((z) => {
              const aberto = z.situacao === "ABERTO";
              return (
                <li key={z.id} className={`item${aberto ? "" : " item-fechado"}`}>
                  <div className="item-topo">
                    <strong>{descreverDataEfetiva(z)}</strong>
                    <Selo tipo={aberto ? "info" : "neutro"}>{rotulo(SITUACAO_PRAZO, z.situacao)}</Selo>
                    {z.conferidoEm ? <Selo tipo="ok">Conferido por {z.conferidoPor?.nome}</Selo> : <Selo tipo="aviso">Não conferido</Selo>}
                  </div>
                  <p className="item-titulo">{z.descricao}</p>
                  <p className="item-linha suave">
                    Responsável: {z.responsavel.nome}
                    {z.cumpridoEm && ` · cumprido em ${data(z.cumpridoEm)}`}
                    {z.dataFinalAjustada && ` · ajustado: ${z.justificativaAjuste}`}
                  </p>
                  <details className="memoria-detalhe">
                    <summary>Memória de cálculo</summary>
                    <ul>
                      {memoriaPrazoEmTexto(z.memoriaCalculo as unknown as MemoriaPrazo).map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </details>
                  <div className="acoes-item">
                    {aberto && !z.conferidoEm && z.responsavelId === usuario.id && (
                      <Formulario acao={conferirPrazoAcao.bind(null, p.id, z.id)} rotulo="Conferi a contagem" classe="inline" />
                    )}
                    {aberto && pd.cumprir && (
                      <Formulario acao={cumprirPrazoAcao.bind(null, p.id, z.id)} rotulo="Cumprido" classe="linha-acao">
                        <label className="compacto">
                          Em
                          <input type="date" name="cumpridoEm" defaultValue={hoje()} max={hoje()} required />
                        </label>
                      </Formulario>
                    )}
                    {aberto && pd.prazo && (
                      <Painel titulo="Ajustar data final">
                        <Formulario acao={ajustarPrazoAcao.bind(null, p.id, z.id)} rotulo="Ajustar" aoConcluir="fechar">
                          <Campo rotulo="Nova data final" nome="dataFinalAjustada" tipo="date" obrigatorio />
                          <Campo rotulo="Justificativa" nome="justificativaAjuste" obrigatorio />
                          <p className="dica">A data ajustada prevalece e o prazo volta a "não conferido".</p>
                        </Formulario>
                      </Painel>
                    )}
                    {pd.prazo && aberto && (
                      <>
                        <Formulario acao={situacaoPrazoAcao.bind(null, p.id, z.id, "PERDIDO")} rotulo="Marcar perdido" classe="inline" confirmar="Marcar este prazo como perdido?" />
                        <Formulario acao={situacaoPrazoAcao.bind(null, p.id, z.id, "CANCELADO")} rotulo="Cancelar" classe="inline" confirmar="Cancelar este prazo?" />
                      </>
                    )}
                    {pd.prazo && !aberto && (
                      <Formulario acao={situacaoPrazoAcao.bind(null, p.id, z.id, "ABERTO")} rotulo="Reabrir" classe="inline" />
                    )}
                    {pd.excluir && (
                      <Formulario acao={excluirAcao("prazo", z.id)} rotulo="Excluir" classe="inline" confirmar="Excluir este prazo? (exclusão lógica)" />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="secao">
        <h2>Audiências</h2>
        {p.audiencias.length === 0 ? (
          <p className="suave">Nenhuma audiência.</p>
        ) : (
          <ul className="lista-itens">
            {p.audiencias.map((a) => (
              <li key={a.id} className="item">
                <div className="item-topo">
                  <strong>{formatarDataHora(a.dataHora)}</strong>
                  <Selo tipo="info">{a.tipo.valor}</Selo>
                  <Selo>{rotulo(MODALIDADE, a.modalidade)}</Selo>
                </div>
                {a.localOuLink && <p className="item-linha">{a.localOuLink}</p>}
                <p className="item-linha suave">Responsável: {a.responsavel.nome}</p>
                {a.resultado && <p className="item-linha">Resultado: {a.resultado}</p>}
                {pd.audiencia && (
                  <Painel titulo="Editar / registrar resultado">
                    <FormAudiencia acao={salvarAudienciaAcao.bind(null, p.id, a.id)} tipos={tiposAudiencia} responsaveis={responsaveis} responsavelPadrao={a.responsavelId} audiencia={a} />
                  </Painel>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="secao">
        <h2>Compromissos</h2>
        {p.compromissos.length === 0 ? (
          <p className="suave">Nenhum compromisso.</p>
        ) : (
          <ul className="lista-itens">
            {p.compromissos.map((c) => (
              <li key={c.id} className="item">
                <div className="item-topo">
                  <strong>{c.diaInteiro ? formatarData(dataEmSaoPaulo(c.inicio)) : formatarDataHora(c.inicio)}</strong>
                  {c.diaInteiro && <Selo>Dia inteiro</Selo>}
                  {c.uidExterno && <Selo tipo="info">Google Agenda</Selo>}
                </div>
                <p className="item-titulo">{c.titulo}</p>
                {c.local && <p className="item-linha">{c.local}</p>}
                {c.descricao && <p className="item-linha texto suave">{c.descricao}</p>}
                <p className="item-linha suave">Responsável: {c.responsavel.nome}</p>
                {pd.compromisso && (
                  <Painel titulo="Editar">
                    <FormularioCompromisso acao={salvarCompromissoAcao.bind(null, p.id, c.id)} responsaveis={responsaveis} responsavelPadrao={c.responsavelId} compromisso={c} />
                  </Painel>
                )}
                {pd.excluir && (
                  <Formulario acao={excluirAcao("compromisso", c.id)} rotulo="Excluir" classe="inline" confirmar="Excluir este compromisso?" />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="secao">
        <h2>Andamentos</h2>
        {p.andamentos.length === 0 ? (
          <p className="suave">Nenhum andamento registrado.</p>
        ) : (
          <ol className="linha-do-tempo">
            {p.andamentos.map((a) => (
              <li key={a.id}>
                <div className="item-topo">
                  <strong>{data(a.data)}</strong>
                  <Selo>{a.tipo.valor}</Selo>
                  <span className="suave">por {a.usuario.nome}</span>
                </div>
                <p className="texto">{a.descricao}</p>
                {pd.andamento && (
                  <Painel titulo="Editar">
                    <Formulario acao={editarAndamentoAcao.bind(null, p.id, a.id)} aoConcluir="fechar">
                      <Campo rotulo="Data" nome="data" tipo="date" valor={paraDataCivil(a.data)} obrigatorio />
                      <Selecao rotulo="Tipo" nome="tipoId" valor={a.tipoId} obrigatorio vazio={null} opcoes={tiposAndamento.map((t) => ({ valor: t.id, rotulo: t.valor }))} />
                      <AreaTexto rotulo="Texto" nome="descricao" valor={a.descricao} obrigatorio linhas={5} />
                    </Formulario>
                  </Painel>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {pd.excluir && (
        <section className="secao zona-perigo">
          <Formulario acao={excluirAcao("processo", p.id)} rotulo="Excluir processo" classe="inline" confirmar="Excluir este processo? Ele sai das listas, mas fica guardado (exclusão lógica)." />
        </section>
      )}
    </>
  );
}

/** Exclusão lógica pelo botão (só aparece para administrador; o servidor confere de novo). */
function excluirAcao(entidade: string, id: string) {
  return async () => {
    "use server";
    const r = await excluirRegistroAcao(entidade, id);
    if (r.ok && entidade === "processo") redirect("/processos");
    return r;
  };
}

function FormAudiencia({
  acao,
  tipos,
  responsaveis,
  responsavelPadrao,
  audiencia,
}: {
  acao: Parameters<typeof Formulario>[0]["acao"];
  tipos: { id: string; valor: string }[];
  responsaveis: { id: string; nome: string }[];
  responsavelPadrao: string;
  audiencia?: { dataHora: Date; tipoId: string; modalidade: string; localOuLink: string | null; resultado: string | null };
}) {
  if (tipos.length === 0) {
    return <p className="dica">Nenhum tipo de audiência cadastrado. Um administrador deve incluir os tipos em Configurações.</p>;
  }
  return (
    <Formulario acao={acao} aoConcluir={audiencia ? "fechar" : "limpar"}>
      <div className="grade-2">
        <Campo rotulo="Data e hora" nome="dataHora" tipo="datetime-local" valor={audiencia && paraCampoDataHora(audiencia.dataHora)} obrigatorio />
        <Selecao rotulo="Tipo" nome="tipoId" valor={audiencia?.tipoId} obrigatorio opcoes={tipos.map((t) => ({ valor: t.id, rotulo: t.valor }))} />
      </div>
      <div className="grade-2">
        <Selecao rotulo="Modalidade" nome="modalidade" valor={audiencia?.modalidade} obrigatorio vazio={null} opcoes={opcoesDe(MODALIDADE)} />
        <Selecao rotulo="Responsável" nome="responsavelId" valor={responsavelPadrao} obrigatorio vazio={null} opcoes={responsaveis.map((u) => ({ valor: u.id, rotulo: u.nome }))} />
      </div>
      <Campo rotulo="Local ou link" nome="localOuLink" valor={audiencia?.localOuLink} />
      {audiencia && <AreaTexto rotulo="Resultado" nome="resultado" valor={audiencia.resultado} linhas={2} />}
    </Formulario>
  );
}

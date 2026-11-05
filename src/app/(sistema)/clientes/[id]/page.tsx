// Ficha do cliente (seção 5): dados cadastrais, representantes, processos (com status e
// próximo prazo) e histórico. Cada abertura fica no registro de acessos (seção 7).

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adicionarRepresentanteAcao, removerRepresentanteAcao } from "@/app/acoes/pessoas";
import { excluirRegistroAcao } from "@/app/acoes/registros";
import { BuscaPessoa } from "@/componentes/busca-pessoa";
import { Campo, Selecao, opcoesDe } from "@/componentes/campos";
import { Formulario, Painel } from "@/componentes/formulario";
import { Selo } from "@/componentes/selos";
import { formatarData } from "@/dominio/prazos/data-civil";
import { formatarDataHora } from "@/lib/data-hora";
import { hoje, paraDataCivil } from "@/lib/hoje";
import { CAMPO, CAMPOS_ID, ENTIDADE, OPERACAO, QUALIDADE, SITUACAO_PESSOA, TIPO_CONTATO, TIPO_DOCUMENTO, TIPO_PESSOA, rotulo } from "@/lib/rotulos";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { mascarar } from "@/servidor/cripto/cifra";
import { NaoEncontradoError } from "@/servidor/erros";
import { pode } from "@/servidor/permissoes/matriz";
import { obterFichaCliente } from "@/servidor/servicos/pessoas";
import { itensDaLista } from "@/servidor/servicos/referencias";

const data = (d: Date | null) => (d ? formatarData(paraDataCivil(d)) : "—");

/** Campos técnicos que não interessam no histórico mostrado ao usuário. */
const OCULTOS = new Set(["id", "pessoaId", "representadoId", "valorBusca", "numeroHash", "cpfCnpjHash"]);

export default async function FichaCliente({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await exigirUsuario();
  const { id } = await params;
  const c = await obterFichaCliente(usuario, id).catch((e) => {
    if (e instanceof NaoEncontradoError) notFound();
    throw e;
  });
  const categorias = await itensDaLista("CATEGORIA_PARTE");
  const pd = { editar: pode(usuario.perfil, "pessoa.editar"), processo: pode(usuario.perfil, "processo.editar"), excluir: pode(usuario.perfil, "registro.excluir") };
  const historico = resumirHistorico(c.historico.filter((h) => !h.campo || !OCULTOS.has(h.campo)));

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <p className="suave">
            <Link href="/clientes">Clientes</Link> /
          </p>
          <h1>{c.nome}</h1>
          <div className="selos">
            <Selo>{rotulo(TIPO_PESSOA, c.tipo)}</Selo>
            {c.categoria && <Selo>{c.categoria.valor}</Selo>}
            {c.ehCliente && <Selo tipo="ok">Cliente · {rotulo(SITUACAO_PESSOA, c.situacao)}</Selo>}
            {c.cadastroIncompleto && <Selo tipo="aviso">Cadastro incompleto</Selo>}
          </div>
        </div>
        <div className="botoes">
          {pd.editar && <Link className="botao secundario" href={`/clientes/${c.id}/editar`}>Editar</Link>}
          <a className="botao secundario" href={`/relatorios/ficha-cliente/exportar?formato=pdf&pessoaId=${c.id}`}>Ficha em PDF</a>
          {pd.processo && <Link className="botao" href={`/processos/novo?cliente=${c.id}`}>Novo processo para este cliente</Link>}
        </div>
      </div>

      <section className="cartao">
        <dl className="dados">
          <div><dt>CPF / CNPJ</dt><dd>{c.cpfCnpj ? mascarar(c.cpfCnpj) : "—"}</dd></div>
          <div><dt>RG</dt><dd>{c.rg ? mascarar(c.rg) : "—"}</dd></div>
          <div><dt>Nascimento</dt><dd>{data(c.dataNascimento)}</dd></div>
          <div><dt>Entrada</dt><dd>{data(c.dataEntrada)}</dd></div>
          <div><dt>Responsável</dt><dd>{c.responsavel?.nome ?? "—"}</dd></div>
          <div className="largo"><dt>Endereço</dt><dd>{[c.endereco, c.cidade && `${c.cidade}${c.uf ? `/${c.uf}` : ""}`].filter(Boolean).join(" — ") || (c.uf ?? "—")}</dd></div>
          <div className="largo">
            <dt>Contatos</dt>
            <dd>
              {c.contatos.length === 0 ? "—" : (
                <ul className="lista-simples">
                  {c.contatos.map((x) => (
                    <li key={x.id}>
                      {rotulo(TIPO_CONTATO, x.tipo)}:{" "}
                      {x.tipo === "EMAIL" ? <a href={`mailto:${x.valor}`}>{x.valor}</a> : <a href={`tel:${x.valor.replace(/\D/g, "")}`}>{x.valor}</a>}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          {c.pendencias && <div className="largo"><dt>Pendências do cadastro</dt><dd>{c.pendencias}</dd></div>}
          {c.observacoes && <div className="largo"><dt>Observações</dt><dd className="texto">{c.observacoes}</dd></div>}
        </dl>
        {(c.documentos.length > 0 || c.informacoesReservadas || c.cpfCnpj || c.rg) && (
          <details className="reservado">
            <summary>Mostrar dados reservados (acesso registrado)</summary>
            <dl className="dados">
              {c.cpfCnpj && <div><dt>CPF / CNPJ</dt><dd>{c.cpfCnpj}</dd></div>}
              {c.rg && <div><dt>RG</dt><dd>{c.rg}</dd></div>}
              {c.documentos.map((x) => (
                <div key={x.id}><dt>{rotulo(TIPO_DOCUMENTO, x.tipo)}</dt><dd>{x.numero}{x.descricao && ` (${x.descricao})`}</dd></div>
              ))}
              {c.informacoesReservadas && <div className="largo"><dt>Informações reservadas</dt><dd className="texto">{c.informacoesReservadas}</dd></div>}
            </dl>
          </details>
        )}
      </section>

      <section className="secao">
        <h2>Representantes</h2>
        {c.representantes.length === 0 && c.representa.length === 0 && <p className="suave">Nenhum.</p>}
        <ul className="lista-simples">
          {c.representantes.map((r) => (
            <li key={r.id}>
              <Link href={`/clientes/${r.pessoa.id}`}>{r.pessoa.nome}</Link> <span className="suave">— {rotulo(QUALIDADE, r.qualidade)}</span>
              {pd.editar && <Formulario acao={removerRepresentanteAcao.bind(null, c.id, r.id)} rotulo="Remover" classe="inline" confirmar="Remover este representante?" />}
            </li>
          ))}
          {c.representa.map((r) => (
            <li key={r.id}>
              Representa <Link href={`/clientes/${r.representado.id}`}>{r.representado.nome}</Link> <span className="suave">como {rotulo(QUALIDADE, r.qualidade)}</span>
            </li>
          ))}
        </ul>
        {pd.editar && (
          <Painel titulo="Adicionar representante">
            <Formulario acao={adicionarRepresentanteAcao.bind(null, c.id)} rotulo="Adicionar" aoConcluir="fechar">
              <BuscaPessoa categorias={categorias} />
              <Selecao rotulo="Qualidade" nome="qualidade" obrigatorio vazio={null} opcoes={opcoesDe(QUALIDADE)} />
              <Campo rotulo="Observações" nome="observacoes" />
            </Formulario>
          </Painel>
        )}
      </section>

      <section className="secao">
        <h2>Processos <span className="contagem">{c.participacoes.length}</span></h2>
        {c.participacoes.length === 0 ? (
          <p className="suave">Nenhum processo visível para você.</p>
        ) : (
          <ul className="lista-itens">
            {c.participacoes.map(({ processo: p, qualificacoes }) => {
              const proximo = p.prazos[0];
              return (
                <li key={p.id} className="item">
                  <div className="item-topo">
                    <Link href={`/processos/${p.id}`}><strong>{p.numeroCnj ?? "Sem número"}</strong></Link>
                    <Selo tipo="info">{p.status.nome}</Selo>
                  </div>
                  <p className="item-linha">
                    {p.area.valor}
                    {qualificacoes.length > 0 && ` · ${qualificacoes.map((q) => q.valor).join(", ")}`}
                    {p.partes.length > 0 && <span className="suave"> · com {p.partes.map((x) => x.pessoa.nome).join(", ")}</span>}
                  </p>
                  <p className="item-linha suave">
                    Próximo prazo:{" "}
                    {proximo ? (
                      <>
                        {data(proximo.dataFinalEfetiva)} — {proximo.descricao}
                        {paraDataCivil(proximo.dataFinalEfetiva) < hoje() && <> <Selo tipo="aviso">Vencido</Selo></>}
                      </>
                    ) : (
                      "nenhum"
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="secao">
        <h2>Histórico</h2>
        {historico.length === 0 ? (
          <p className="suave">Sem registros.</p>
        ) : (
          <ol className="historico">
            {historico.map((h) => (
              <li key={h.chave}>
                <p className="suave">
                  {formatarDataHora(h.dataHora)} · {h.usuario}
                </p>
                <p>
                  <strong>{h.descricao}</strong>
                </p>
                {h.antes && <p className="historico-valor">Antes: {h.antes}</p>}
                {h.depois && <p className="historico-valor">{h.antes ? "Depois" : "Dados"}: {h.depois}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {pd.excluir && (
        <section className="secao zona-perigo">
          <Formulario
            acao={async () => {
              "use server";
              const r = await excluirRegistroAcao("pessoa", id);
              if (r.ok) redirect("/clientes");
              return r;
            }}
            rotulo="Excluir cadastro"
            classe="inline"
            confirmar="Excluir este cadastro? Ele sai das listas, mas fica guardado (exclusão lógica)."
          />
        </section>
      )}
    </>
  );
}

type LinhaHistorico = {
  id: bigint;
  dataHora: Date;
  entidade: string;
  registroId: string;
  operacao: string;
  campo: string | null;
  valorAnterior: string | null;
  valorNovo: string | null;
  usuario: { nome: string } | null;
};

/**
 * Uma linha por criação ou exclusão (com os campos preenchidos) e uma por campo alterado.
 * Identificadores internos aparecem só como "alterado".
 */
function resumirHistorico(linhas: LinhaHistorico[]) {
  const grupos = new Map<string, LinhaHistorico[]>();
  const saida: { chave: string; dataHora: Date; usuario: string; descricao: string; antes: string; depois: string }[] = [];
  const valor = (campo: string | null, v: string | null) => (v && campo && CAMPOS_ID.has(campo) ? "(alterado)" : (v ?? ""));
  for (const h of linhas) {
    const quem = h.usuario?.nome ?? "Carga inicial";
    const entidade = ENTIDADE[h.entidade] ?? h.entidade;
    if (h.operacao === "ALTERACAO" && h.campo !== "excluidoEm") {
      saida.push({
        chave: h.id.toString(), dataHora: h.dataHora, usuario: quem,
        descricao: `${entidade}: ${CAMPO[h.campo ?? ""] ?? h.campo}`,
        antes: valor(h.campo, h.valorAnterior), depois: valor(h.campo, h.valorNovo),
      });
      continue;
    }
    const chave = `${h.operacao}|${h.entidade}|${h.registroId}|${h.dataHora.getTime()}`;
    if (!grupos.has(chave)) {
      grupos.set(chave, []);
      saida.push({ chave, dataHora: h.dataHora, usuario: quem, descricao: `${rotulo(OPERACAO, h.operacao)} · ${entidade}`, antes: "", depois: "" });
    }
    grupos.get(chave)!.push(h);
  }
  for (const linha of saida) {
    const g = grupos.get(linha.chave);
    if (!g) continue;
    const resumo = g
      .filter((h) => h.campo && h.campo !== "excluidoEm")
      .map((h) => `${CAMPO[h.campo!] ?? h.campo}: ${valor(h.campo, h.operacao === "CRIACAO" ? h.valorNovo : h.valorAnterior)}`)
      .join("; ");
    if (g[0]!.operacao === "CRIACAO") linha.depois = resumo;
    else linha.antes = resumo;
  }
  return saida;
}

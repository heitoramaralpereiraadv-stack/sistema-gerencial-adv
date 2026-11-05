// Agenda (tela inicial, seção 5): vencidos, hoje e próximos 7 dias úteis, por responsável.

import Link from "next/link";
import { cumprirPrazoAcao } from "@/app/acoes/prazos";
import { Formulario } from "@/componentes/formulario";
import { Selo, SeloAlerta } from "@/componentes/selos";
import { formatarDataComDia } from "@/dominio/prazos/data-civil";
import { formatarDataHora } from "@/lib/data-hora";
import { hoje } from "@/lib/hoje";
import { rotulo, MODALIDADE } from "@/lib/rotulos";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { pode } from "@/servidor/permissoes/matriz";
import { DIAS_UTEIS_AGENDA, obterAgenda } from "@/servidor/servicos/agenda";
import { descreverDataEfetiva } from "@/servidor/servicos/prazos";
import { usuariosAtivos } from "@/servidor/servicos/referencias";

type Agenda = Awaited<ReturnType<typeof obterAgenda>>;
type ItemPrazo = Agenda["proximos"][number];

function identificacao(p: ItemPrazo["processo"]) {
  const clientes = p.partes.map((x) => x.pessoa.nome).join(", ");
  return (
    <>
      <Link href={`/processos/${p.id}`}>{p.numeroCnj ?? "Processo sem número"}</Link>
      {clientes && <span className="suave"> · {clientes}</span>}
    </>
  );
}

function CartaoPrazo({ prazo, podeCumprir }: { prazo: ItemPrazo; podeCumprir: boolean }) {
  return (
    <li className={`item alerta-${prazo.alerta}`}>
      <div className="item-topo">
        <SeloAlerta alerta={prazo.alerta} diasUteis={prazo.diasUteis} />
        <strong>{descreverDataEfetiva(prazo)}</strong>
        {!prazo.conferidoEm && <Selo tipo="aviso">Não conferido</Selo>}
      </div>
      <p className="item-titulo">{prazo.descricao}</p>
      <p className="item-linha">{identificacao(prazo.processo)}</p>
      <p className="item-linha suave">Responsável: {prazo.responsavel.nome}</p>
      {podeCumprir && (
        <Formulario acao={cumprirPrazoAcao.bind(null, prazo.processo.id, prazo.id)} rotulo="Marcar como cumprido" classe="linha-acao">
          <label className="compacto">
            Cumprido em
            <input type="date" name="cumpridoEm" defaultValue={hoje()} max={hoje()} required />
          </label>
        </Formulario>
      )}
    </li>
  );
}

function Secao({ titulo, itens, vazio, podeCumprir }: { titulo: string; itens: ItemPrazo[]; vazio: string; podeCumprir: boolean }) {
  return (
    <section className="secao">
      <h2>
        {titulo} <span className="contagem">{itens.length}</span>
      </h2>
      {itens.length === 0 ? (
        <p className="suave">{vazio}</p>
      ) : (
        <ul className="lista-itens">
          {itens.map((p) => (
            <CartaoPrazo key={p.id} prazo={p} podeCumprir={podeCumprir} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function PaginaAgenda({ searchParams }: { searchParams: Promise<{ responsavel?: string }> }) {
  const usuario = await exigirUsuario();
  const { responsavel = "meus" } = await searchParams;
  const [agenda, usuarios] = await Promise.all([obterAgenda(usuario, responsavel), usuariosAtivos()]);
  const podeCumprir = pode(usuario.perfil, "prazo.cumprir");

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Agenda</h1>
        <p className="suave">{formatarDataComDia(agenda.hoje)}</p>
      </div>
      <form className="filtros" method="get">
        <label>
          Responsável
          <select name="responsavel" defaultValue={responsavel}>
            <option value="meus">Meus prazos e audiências</option>
            <option value="todos">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </label>
        <button className="secundario">Filtrar</button>
      </form>

      {agenda.vencidos.length > 0 && (
        <div className="destaque-vencidos" role="alert">
          {agenda.vencidos.length} prazo{agenda.vencidos.length > 1 ? "s" : ""} vencido{agenda.vencidos.length > 1 ? "s" : ""} sem
          marcação de cumprimento.
        </div>
      )}
      <Secao titulo="Vencidos" itens={agenda.vencidos} vazio="Nenhum prazo vencido." podeCumprir={podeCumprir} />
      <Secao titulo="Vencem hoje" itens={agenda.deHoje} vazio="Nenhum prazo vence hoje." podeCumprir={podeCumprir} />
      <Secao
        titulo={`Próximos ${DIAS_UTEIS_AGENDA} dias úteis`}
        itens={agenda.proximos}
        vazio="Nenhum prazo nos próximos dias úteis."
        podeCumprir={podeCumprir}
      />

      <section className="secao">
        <h2>
          Audiências <span className="contagem">{agenda.audiencias.length}</span>
        </h2>
        {agenda.audiencias.length === 0 ? (
          <p className="suave">Nenhuma audiência hoje ou nos próximos {DIAS_UTEIS_AGENDA} dias úteis.</p>
        ) : (
          <ul className="lista-itens">
            {agenda.audiencias.map((a) => (
              <li key={a.id} className="item">
                <div className="item-topo">
                  <strong>{formatarDataHora(a.dataHora)}</strong>
                  <Selo tipo="info">{a.tipo.valor}</Selo>
                  <Selo>{rotulo(MODALIDADE, a.modalidade)}</Selo>
                </div>
                <p className="item-linha">{identificacao(a.processo)}</p>
                {a.localOuLink && <p className="item-linha suave">{a.localOuLink}</p>}
                <p className="item-linha suave">Responsável: {a.responsavel.nome}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

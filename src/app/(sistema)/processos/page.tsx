// Lista de processos (seção 5): busca por número, cliente ou parte contrária; filtros.
// Exportação da lista filtrada: etapa 7.

import Link from "next/link";
import { Selo } from "@/componentes/selos";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { pode } from "@/servidor/permissoes/matriz";
import { BotoesExportar } from "@/componentes/relatorio";
import { buscarProcessos, type FiltrosProcessos } from "@/servidor/servicos/processos";
import { itensDaLista, statusAtivos, tribunais, usuariosAtivos } from "@/servidor/servicos/referencias";

type Filtros = FiltrosProcessos;
const MANTIDOS = ["parteId", "comarcaId", "situacao", "semNumero", "semComarca"] as const;

export default async function ListaProcessos({ searchParams }: { searchParams: Promise<Filtros> }) {
  const usuario = await exigirUsuario();
  const f = await searchParams;
  const [processos, areas, status, listaTribunais, usuarios] = await Promise.all([
    buscarProcessos(usuario, f),
    itensDaLista("AREA"),
    statusAtivos(),
    tribunais(),
    usuariosAtivos(),
  ]);
  const usados = new Set(processos.map((p) => p.tribunalCodigo));
  const opcoesTribunal = listaTribunais.filter((t) => usados.has(t.codigo) || t.codigo === f.tribunalCodigo);

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Processos</h1>
        <div className="botoes">
          <BotoesExportar tipo="processos" parametros={{ ...f }} />
          {pode(usuario.perfil, "processo.editar") && (
            <Link className="botao" href="/processos/novo">
              Novo processo
            </Link>
          )}
        </div>
      </div>
      <form className="filtros" method="get">
        <label className="largo">
          Buscar
          <input type="search" name="termo" defaultValue={f.termo} placeholder="Número, cliente ou parte contrária" />
        </label>
        <label>
          Área
          <select name="areaId" defaultValue={f.areaId ?? ""}>
            <option value="">Todas</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.valor}</option>)}
          </select>
        </label>
        <label>
          Status
          <select name="statusId" defaultValue={f.statusId ?? ""}>
            <option value="">Todos</option>
            {status.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </label>
        <label>
          Tribunal
          <select name="tribunalCodigo" defaultValue={f.tribunalCodigo ?? ""}>
            <option value="">Todos</option>
            {opcoesTribunal.map((t) => <option key={t.codigo} value={t.codigo}>{t.sigla}</option>)}
          </select>
        </label>
        <label>
          Responsável
          <select name="responsavelId" defaultValue={f.responsavelId ?? ""}>
            <option value="">Todos</option>
            {usuarios.filter((u) => u.perfil !== "ASSISTENTE").map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </label>
        {MANTIDOS.map((k) => f[k] && <input key={k} type="hidden" name={k} value={f[k]} />)}
        <button className="secundario">Filtrar</button>
      </form>
      {MANTIDOS.some((k) => f[k]) && (
        <p className="dica">
          Lista filtrada a partir do painel ou dos relatórios. <Link href="/processos">Limpar filtros</Link>
        </p>
      )}
      <p className="suave">{processos.length === 200 ? "Mostrando os 200 mais recentes; refine a busca." : `${processos.length} processo(s).`}</p>
      <ul className="lista-itens">
        {processos.map((p) => {
          const clientes = p.partes.filter((x) => x.ehClienteDoEscritorio).map((x) => x.pessoa.nome);
          const contrarias = p.partes.filter((x) => !x.ehClienteDoEscritorio).map((x) => x.pessoa.nome);
          return (
            <li key={p.id} className="item">
              <div className="item-topo">
                <Link href={`/processos/${p.id}`}>
                  <strong>{p.numeroCnj ?? "Sem número"}</strong>
                </Link>
                <Selo tipo="info">{p.status.nome}</Selo>
                {p.cadastroIncompleto && <Selo tipo="aviso">Incompleto</Selo>}
              </div>
              <p className="item-linha">{clientes.join(", ") || "—"}{contrarias.length > 0 && <span className="suave"> × {contrarias.join(", ")}</span>}</p>
              <p className="item-linha suave">
                {p.area.valor}
                {p.tribunal && ` · ${p.tribunal.sigla}`}
                {p.comarca && ` · ${p.comarca.nome}/${p.comarca.uf}`} · {p.responsavel.nome}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

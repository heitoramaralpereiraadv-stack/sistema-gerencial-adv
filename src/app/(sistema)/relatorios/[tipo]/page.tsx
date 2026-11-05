import Link from "next/link";
import { notFound } from "next/navigation";
import { BotoesExportar, FiltrosRelatorio, TabelaRelatorio } from "@/componentes/relatorio";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { ehTipoRelatorio, RELATORIOS } from "@/servidor/relatorios/consultas";
import { lerFiltros } from "@/servidor/relatorios/tipos";
import { opcoesDeFiltro, parametrosDeFiltro } from "../apoio";

export default async function Relatorio({
  params,
  searchParams,
}: {
  params: Promise<{ tipo: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const usuario = await exigirUsuario();
  const { tipo } = await params;
  if (!ehTipoRelatorio(tipo)) notFound();
  const def = RELATORIOS[tipo];
  const f = lerFiltros(await searchParams);
  const [tabela, opcoes] = await Promise.all([def.gerar(usuario, f), opcoesDeFiltro()]);
  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <p className="suave"><Link href="/relatorios">Relatórios</Link> /</p>
          <h1>{def.titulo}</h1>
          <p className="suave">{def.descricao}</p>
        </div>
        <BotoesExportar tipo={tipo} parametros={parametrosDeFiltro(f, def.periodo)} />
      </div>
      <FiltrosRelatorio filtros={f} periodo={def.periodo} {...opcoes} />
      {!def.periodo && <p className="dica">Este relatório mostra a situação atual; o filtro de período não se aplica.</p>}
      <TabelaRelatorio tabela={tabela} />
    </>
  );
}

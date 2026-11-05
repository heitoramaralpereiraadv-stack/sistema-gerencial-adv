import { editarStatusForm } from "@/app/acoes/configuracoes";
import { Marcador } from "@/componentes/campos";
import { Formulario } from "@/componentes/formulario";
import { Selo } from "@/componentes/selos";
import { prisma } from "@/servidor/db/prisma";

const COMPORTAMENTO = {
  ATIVO: "Ativo",
  SUSPENSO_EXIGE_MOTIVO: "Suspenso — exige motivo",
  CONCLUIDO_NAO_DEFINITIVO: "Concluído, não definitivo — exige data da homologação",
  ENCERRADO_EXIGE_DATA: "Encerrado — exige data e bloqueia prazos",
} as const;

export default async function Status() {
  const status = await prisma().statusProcesso.findMany({ orderBy: { ordem: "asc" } });
  return (
    <section className="secao">
      <p className="dica">O nome e a ordem podem ser mudados; o comportamento de cada status é fixo (seção 4.3).</p>
      <ul className="lista-itens">
        {status.map((s) => (
          <li key={s.id} className={`item${s.ativo ? "" : " item-fechado"}`}>
            <div className="item-topo">
              <Selo tipo="info">{COMPORTAMENTO[s.comportamento]}</Selo>
            </div>
            <Formulario acao={editarStatusForm.bind(null, s.id)} rotulo="Salvar" classe="linha-acao">
              <input name="nome" defaultValue={s.nome} aria-label="Nome" required />
              <input name="ordem" type="number" min={0} defaultValue={s.ordem} aria-label="Ordem" className="campo-curto" />
              <Marcador rotulo="Ativo" nome="ativo" marcado={s.ativo} />
            </Formulario>
          </li>
        ))}
      </ul>
    </section>
  );
}

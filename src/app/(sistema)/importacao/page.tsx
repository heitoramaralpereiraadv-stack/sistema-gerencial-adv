// Importação da planilha (seção 8.1): envio do arquivo e lista de lotes.

import Link from "next/link";
import { enviarPlanilhaAcao } from "@/app/acoes/importacao";
import { Formulario } from "@/componentes/formulario";
import { Selo } from "@/componentes/selos";
import { formatarDataHora } from "@/lib/data-hora";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { listarLotes } from "@/servidor/servicos/importacao";

const SITUACAO = { EM_REVISAO: "Em revisão", GRAVADO: "Gravado", DESCARTADO: "Descartado" } as const;

export default async function Importacao() {
  const lotes = await listarLotes(await exigirUsuario());
  const gravado = lotes.some((l) => l.situacao === "GRAVADO");
  return (
    <>
      <h1>Importação da planilha</h1>
      <p className="suave">
        Envie <code>Controle_Clientes_Processos.xlsx</code> e, se houver, o arquivo de ajustes (<code>.json</code>) com as separações de
        clientes compostos. Nada é gravado antes da revisão.
      </p>
      {gravado ? (
        <p className="destaque-vencidos">A planilha já foi importada. A importação é feita uma única vez.</p>
      ) : (
        <section className="cartao">
          <Formulario acao={enviarPlanilhaAcao} rotulo="Enviar e montar a proposta">
            <label>
              Planilha (.xlsx) *
              <input type="file" name="planilha" accept=".xlsx" required />
            </label>
            <label>
              Ajustes (.json, opcional)
              <input type="file" name="ajustes" accept=".json,application/json" />
            </label>
          </Formulario>
        </section>
      )}
      <section className="secao">
        <h2>Lotes</h2>
        {lotes.length === 0 && <p className="suave">Nenhum lote.</p>}
        <ul className="lista-itens">
          {lotes.map((l) => (
            <li key={l.id} className="item">
              <div className="item-topo">
                <Link href={`/importacao/${l.id}`}><strong>{l.arquivo}</strong></Link>
                <Selo tipo={l.situacao === "GRAVADO" ? "ok" : l.situacao === "EM_REVISAO" ? "aviso" : "neutro"}>{SITUACAO[l.situacao]}</Selo>
              </div>
              <p className="item-linha suave">
                Enviado em {formatarDataHora(l.criadoEm)} por {l.criadoPor.nome}
                {l.gravadoEm && ` · gravado em ${formatarDataHora(l.gravadoEm)}`}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

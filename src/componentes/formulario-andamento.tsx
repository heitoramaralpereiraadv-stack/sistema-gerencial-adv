"use client";

// Fluxo principal (seção 5): registrar o andamento e, se houver, o prazo no mesmo formulário.

import { useState } from "react";
import { CamposPrazo } from "./campos-prazo";
import { Formulario, type AcaoFormulario } from "./formulario";

export function FormularioAndamento({
  acao,
  processoId,
  tipos,
  responsaveis,
  responsavelPadrao,
  hoje,
  podeCriarPrazo,
}: {
  acao: AcaoFormulario;
  processoId: string;
  tipos: { id: string; valor: string }[];
  responsaveis: { id: string; nome: string }[];
  responsavelPadrao: string;
  hoje: string;
  podeCriarPrazo: boolean;
}) {
  const [comPrazo, setComPrazo] = useState(false);
  return (
    <Formulario acao={acao} rotulo={comPrazo ? "Salvar andamento e prazo" : "Salvar andamento"} aoConcluir="limpar">
      <div className="grade-2">
        <label>
          Data *
          <input type="date" name="data" defaultValue={hoje} required />
        </label>
        <label>
          Tipo *
          <select name="tipoId" required defaultValue="">
            <option value="" disabled>
              Escolha
            </option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.valor}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Texto da publicação / andamento *
        <textarea name="descricao" rows={5} required />
      </label>
      {podeCriarPrazo && (
        <label className="marcador">
          <input type="checkbox" name="comPrazo" checked={comPrazo} onChange={(e) => setComPrazo(e.target.checked)} />
          Este andamento abre prazo
        </label>
      )}
      {comPrazo && (
        <fieldset>
          <legend>Prazo</legend>
          <CamposPrazo
            processoId={processoId}
            responsaveis={responsaveis}
            responsavelPadrao={responsavelPadrao}
            nomeDescricao="descricaoPrazo"
          />
        </fieldset>
      )}
    </Formulario>
  );
}

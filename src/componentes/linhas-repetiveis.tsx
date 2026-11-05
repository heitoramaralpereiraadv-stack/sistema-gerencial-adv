"use client";

// Linhas que o usuário acrescenta ou remove (telefones, e-mails, documentos).

import { useState } from "react";

export interface ColunaLinha {
  nome: string;
  rotulo: string;
  opcoes?: Record<string, string>;
  tipo?: string;
}

export function LinhasRepetiveis({
  titulo,
  colunas,
  iniciais,
  rotuloNovo,
}: {
  titulo: string;
  colunas: ColunaLinha[];
  iniciais: Record<string, string>[];
  rotuloNovo: string;
}) {
  const [linhas, setLinhas] = useState(() => iniciais.map((v, i) => ({ chave: i, v })));
  const [proxima, setProxima] = useState(iniciais.length);
  return (
    <fieldset>
      <legend>{titulo}</legend>
      {linhas.map(({ chave, v }) => (
        <div key={chave} className="linha-repetivel">
          {colunas.map((c) => (
            <label key={c.nome}>
              {c.rotulo}
              {c.opcoes ? (
                <select name={c.nome} defaultValue={v[c.nome] ?? Object.keys(c.opcoes)[0]}>
                  {Object.entries(c.opcoes).map(([valor, r]) => (
                    <option key={valor} value={valor}>
                      {r}
                    </option>
                  ))}
                </select>
              ) : (
                <input name={c.nome} type={c.tipo ?? "text"} defaultValue={v[c.nome] ?? ""} />
              )}
            </label>
          ))}
          <button type="button" className="secundario" onClick={() => setLinhas((l) => l.filter((x) => x.chave !== chave))} aria-label="Remover linha">
            Remover
          </button>
        </div>
      ))}
      <button
        type="button"
        className="link"
        onClick={() => {
          setLinhas((l) => [...l, { chave: proxima, v: {} }]);
          setProxima((n) => n + 1);
        }}
      >
        + {rotuloNovo}
      </button>
    </fieldset>
  );
}

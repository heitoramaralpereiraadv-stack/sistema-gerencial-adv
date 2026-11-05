"use client";

// Campos do prazo com prévia do cálculo (fluxo principal, passo 4): o sistema calcula e mostra
// a memória; se a regra não está definida (pendências B), pede a data final manual (D11).
// Ao gravar, o servidor refaz o cálculo; a prévia é só para conferência.

import { useRef, useState } from "react";
import { simularPrazoAcao, type Previa } from "@/app/acoes/prazos";
import { FORMA_INTIMACAO, OUTRAS_FORMAS } from "@/lib/rotulos";

export function CamposPrazo({
  processoId,
  responsaveis,
  responsavelPadrao,
  nomeDescricao = "descricao",
}: {
  processoId: string;
  responsaveis: { id: string; nome: string }[];
  responsavelPadrao: string;
  /** No formulário de andamento o campo "descricao" já é o texto do andamento. */
  nomeDescricao?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [forma, setForma] = useState("DJE");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [calculando, setCalculando] = useState(false);

  async function calcular() {
    const form = ref.current?.closest("form");
    if (!form) return;
    const dados = Object.fromEntries(new FormData(form).entries());
    setCalculando(true);
    setErro(null);
    const r = await simularPrazoAcao(processoId, dados);
    setCalculando(false);
    if (r.ok) setPrevia(r.dados);
    else {
      setPrevia(null);
      setErro(r.erro);
    }
  }

  const rotuloData = {
    DJE: "Data da disponibilização no DJe",
    PORTAL_CONSULTA: "Dia da consulta ao portal",
    PORTAL_TACITA: "Data do envio pelo portal",
    DATA_INFORMADA: "Data da intimação",
  }[forma];

  return (
    <div ref={ref} className="pilha" onChange={() => setPrevia(null)}>
      <label>
        Descrição do prazo *
        <input name={nomeDescricao} required placeholder="Ex.: manifestação sobre o laudo" />
      </label>
      <label>
        Forma de intimação *
        <select name="formaIntimacao" value={forma} onChange={(e) => setForma(e.target.value)}>
          {Object.entries(FORMA_INTIMACAO).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </select>
      </label>
      {forma === "DATA_INFORMADA" && (
        <label>
          Qual forma
          <input name="formaIntimacaoDetalhe" list="outras-formas" placeholder="Ex.: oficial de justiça" />
          <datalist id="outras-formas">
            {OUTRAS_FORMAS.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
      )}
      <div className="grade-2">
        <label>
          {rotuloData} *
          <input type="date" name="dataReferencia" required />
        </label>
        <label>
          Quantidade de dias *
          <input type="number" name="quantidadeDias" min={1} max={3650} required inputMode="numeric" />
        </label>
      </div>
      <div className="grade-2">
        <label>
          Contagem *
          <select name="tipoContagem" defaultValue="UTEIS">
            <option value="UTEIS">Dias úteis (prazo processual)</option>
            <option value="CORRIDOS">Dias corridos</option>
          </select>
        </label>
        <label>
          Responsável *
          <select name="responsavelId" defaultValue={responsavelPadrao} required>
            {responsaveis.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="marcador">
        <input type="checkbox" name="emDobro" />
        Prazo em dobro (marcar só quando cabível; o sistema não presume)
      </label>
      <label className="marcador">
        <input type="checkbox" name="criminal" />
        Prazo criminal (em dias corridos, início e vencimento em dia não útil passam para o dia útil seguinte)
      </label>

      <button type="button" className="secundario" onClick={calcular} disabled={calculando}>
        {calculando ? "Calculando…" : "Calcular e ver memória de cálculo"}
      </button>
      {erro && <p className="erro">{erro}</p>}
      {previa?.tipo === "calculado" && (
        <div className="memoria" aria-live="polite">
          <p>
            <strong>Data final sugerida: {previa.dataFinal}</strong>
          </p>
          <ul>
            {previa.memoria.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      )}
      {previa?.tipo === "pendencia" && (
        <div className="memoria memoria-pendencia" aria-live="polite">
          <p>{previa.mensagem}</p>
          <label>
            Data final (contagem manual) *
            <input type="date" name="dataFinalManual" required />
          </label>
          <label>
            Justificativa (facultativa)
            <input name="justificativaManual" />
          </label>
        </div>
      )}
    </div>
  );
}

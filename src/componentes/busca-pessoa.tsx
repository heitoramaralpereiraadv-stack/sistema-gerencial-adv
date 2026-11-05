"use client";

// Escolha de pessoa para parte ou representante: busca por nome, CPF/CNPJ ou telefone, com
// cadastro rápido quando a pessoa ainda não existe (ex.: parte contrária nova).

import { useEffect, useState } from "react";
import { buscarPessoasAcao, criarPessoaRapidaAcao } from "@/app/acoes/pessoas";
import { TIPO_PESSOA } from "@/lib/rotulos";

type Achado = { id: string; nome: string; ehCliente?: boolean };

export function BuscaPessoa({ nome = "pessoaId", categorias }: { nome?: string; categorias: { id: string; valor: string }[] }) {
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<Achado[]>([]);
  const [escolhida, setEscolhida] = useState<Achado | null>(null);
  const [nova, setNova] = useState(false);
  const [tipo, setTipo] = useState("PJ");
  const [novoNome, setNovoNome] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (termo.trim().length < 2) return setAchados([]);
    const t = setTimeout(async () => {
      const r = await buscarPessoasAcao(termo);
      setAchados(r.ok ? r.dados : []);
    }, 300);
    return () => clearTimeout(t);
  }, [termo]);

  async function cadastrar(dados: Record<string, string>) {
    setErro(null);
    const r = await criarPessoaRapidaAcao(dados);
    if (!r.ok) return setErro(r.erro);
    setEscolhida(r.dados);
    setNova(false);
  }

  if (escolhida) {
    return (
      <div className="pessoa-escolhida">
        <input type="hidden" name={nome} value={escolhida.id} />
        <strong>{escolhida.nome}</strong>
        <button type="button" className="secundario" onClick={() => setEscolhida(null)}>
          Trocar
        </button>
      </div>
    );
  }

  return (
    <div className="pilha">
      <label>
        Pessoa *
        <input
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Nome, CPF/CNPJ ou telefone"
          autoComplete="off"
        />
      </label>
      {achados.length > 0 && (
        <ul className="resultados">
          {achados.map((a) => (
            <li key={a.id}>
              <button type="button" className="secundario" onClick={() => setEscolhida(a)}>
                {a.nome}
                {a.ehCliente ? " (cliente)" : ""}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!nova ? (
        <button type="button" className="link" onClick={() => (setNova(true), setNovoNome(termo))}>
          Não encontrou? Cadastrar nova pessoa
        </button>
      ) : (
        <div className="subpainel pilha">
          <label>
            Nome *
            <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
          </label>
          <label>
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {Object.entries(TIPO_PESSOA).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {tipo === "PJ" && (
            <label>
              Categoria
              <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                <option value="">—</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.valor}
                  </option>
                ))}
              </select>
            </label>
          )}
          {erro && <p className="erro">{erro}</p>}
          <button
            type="button"
            onClick={() => cadastrar({ nome: novoNome, tipo, categoriaId: tipo === "PJ" ? categoriaId : "" })}
          >
            Cadastrar e escolher
          </button>
        </div>
      )}
    </div>
  );
}

// Campos de formulário reutilizados (componentes de servidor, sem estado).

export function Campo({
  rotulo,
  nome,
  tipo = "text",
  valor,
  obrigatorio,
  dica,
  ...resto
}: {
  rotulo: string;
  nome: string;
  tipo?: string;
  valor?: string | number | null;
  obrigatorio?: boolean;
  dica?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "type" | "defaultValue">) {
  return (
    <label>
      {rotulo}
      {obrigatorio && <span aria-hidden="true"> *</span>}
      <input name={nome} type={tipo} defaultValue={valor ?? undefined} required={obrigatorio} {...resto} />
      {dica && <small className="dica">{dica}</small>}
    </label>
  );
}

export function AreaTexto({
  rotulo,
  nome,
  valor,
  obrigatorio,
  dica,
  linhas = 3,
}: {
  rotulo: string;
  nome: string;
  valor?: string | null;
  obrigatorio?: boolean;
  dica?: string;
  linhas?: number;
}) {
  return (
    <label>
      {rotulo}
      {obrigatorio && <span aria-hidden="true"> *</span>}
      <textarea name={nome} defaultValue={valor ?? undefined} required={obrigatorio} rows={linhas} />
      {dica && <small className="dica">{dica}</small>}
    </label>
  );
}

export function Selecao({
  rotulo,
  nome,
  opcoes,
  valor,
  obrigatorio,
  vazio = "—",
  dica,
}: {
  rotulo: string;
  nome: string;
  opcoes: { valor: string; rotulo: string }[];
  valor?: string | null;
  obrigatorio?: boolean;
  /** Texto da opção vazia; null = sem opção vazia. */
  vazio?: string | null;
  dica?: string;
}) {
  return (
    <label>
      {rotulo}
      {obrigatorio && <span aria-hidden="true"> *</span>}
      <select name={nome} defaultValue={valor ?? ""} required={obrigatorio}>
        {vazio !== null && <option value="">{vazio}</option>}
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      {dica && <small className="dica">{dica}</small>}
    </label>
  );
}

export function Marcador({ rotulo, nome, marcado }: { rotulo: string; nome: string; marcado?: boolean }) {
  return (
    <label className="marcador">
      <input type="checkbox" name={nome} defaultChecked={marcado} />
      {rotulo}
    </label>
  );
}

export const opcoesDe = (tabela: Record<string, string>) =>
  Object.entries(tabela).map(([valor, rotulo]) => ({ valor, rotulo }));

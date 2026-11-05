"use client";

// Formulário ligado a uma Server Action: mostra o erro devolvido pelo servidor e, ao concluir,
// limpa os campos ou fecha o painel. O servidor confere tudo de novo; a tela só ajuda.

import { useActionState, useEffect, useRef } from "react";
import type { ResultadoAcao } from "@/servidor/acao";

export type AcaoFormulario = (estado: ResultadoAcao<unknown> | null, form: FormData) => Promise<ResultadoAcao<unknown>>;

export function Formulario({
  acao,
  children,
  rotulo = "Salvar",
  classe = "pilha",
  aoConcluir,
  confirmar,
}: {
  acao: AcaoFormulario;
  children?: React.ReactNode;
  rotulo?: string;
  classe?: string;
  aoConcluir?: "limpar" | "fechar";
  /** Pergunta de confirmação antes de enviar. */
  confirmar?: string;
}) {
  const [estado, enviar, pendente] = useActionState(acao, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!estado?.ok || !ref.current) return;
    if (aoConcluir === "limpar") ref.current.reset();
    if (aoConcluir === "fechar") ref.current.closest("details")?.removeAttribute("open");
  }, [estado, aoConcluir]);

  return (
    <form
      ref={ref}
      action={enviar}
      className={classe}
      onSubmit={(e) => {
        if (confirmar && !window.confirm(confirmar)) e.preventDefault();
      }}
    >
      {children}
      {estado && !estado.ok && (
        <p className="erro" role="alert">
          {estado.erro}
        </p>
      )}
      <button disabled={pendente}>{pendente ? "Salvando…" : rotulo}</button>
    </form>
  );
}

/** Painel recolhível com um formulário dentro (ações da ficha). */
export function Painel({ titulo, children, aberto }: { titulo: string; children: React.ReactNode; aberto?: boolean }) {
  return (
    <details className="painel" open={aberto}>
      <summary>{titulo}</summary>
      <div className="painel-corpo">{children}</div>
    </details>
  );
}

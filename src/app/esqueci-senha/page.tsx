"use client";

import Link from "next/link";
import { useState } from "react";
import { supabaseNavegador } from "@/componentes/supabase-navegador";

export default function EsqueciSenha() {
  const [enviado, setEnviado] = useState(false);

  async function enviar(form: FormData) {
    await supabaseNavegador().auth.resetPasswordForEmail(String(form.get("email")), {
      redirectTo: `${window.location.origin}/auth/confirm?next=/definir-senha`,
    });
    // Mesma resposta exista ou não o e-mail, para não revelar quem tem acesso.
    setEnviado(true);
  }

  return (
    <main className="cartao-central">
      <div className="cartao">
        <h1>Redefinir senha</h1>
        {enviado ? (
          <p className="subtitulo">Se o e-mail tiver acesso ao sistema, você receberá um link para criar nova senha.</p>
        ) : (
          <form className="pilha" action={enviar}>
            <label>
              E-mail
              <input name="email" type="email" autoComplete="username" required />
            </label>
            <button>Enviar link</button>
          </form>
        )}
        <p><Link href="/entrar">Voltar</Link></p>
      </div>
    </main>
  );
}

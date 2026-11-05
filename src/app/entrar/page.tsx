"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseNavegador } from "@/componentes/supabase-navegador";

export default function Entrar() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(form: FormData) {
    setEnviando(true);
    setErro(null);
    const { error } = await supabaseNavegador().auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("senha")),
    });
    setEnviando(false);
    if (error) return setErro("E-mail ou senha incorretos.");
    router.replace("/2fa");
  }

  return (
    <main className="cartao-central">
      <div className="cartao">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-medeiros-barbosa.jpg" alt="Medeiros e Barbosa Sociedade de Advogados" width={231} height={80} className="logo-entrada" />
        <p className="subtitulo">Sistema gerencial — acesso restrito</p>
        <form className="pilha" action={enviar}>
          <label>
            E-mail
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Senha
            <input name="senha" type="password" autoComplete="current-password" required />
          </label>
          {erro && <p className="erro" role="alert">{erro}</p>}
          <button disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
          <Link href="/esqueci-senha">Esqueci a senha</Link>
        </form>
      </div>
    </main>
  );
}

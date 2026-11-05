"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseNavegador } from "@/componentes/supabase-navegador";

const MINIMO = 12;

export default function DefinirSenha() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabaseNavegador().auth.mfa.getAuthenticatorAssuranceLevel();
      if (!data) return router.replace("/entrar");
      // Quem já tem autenticador cadastrado confirma o código antes de trocar a senha.
      if (data.nextLevel === "aal2" && data.currentLevel !== "aal2") {
        return router.replace("/2fa?next=/definir-senha");
      }
      setPronto(true);
    })();
  }, [router]);

  async function enviar(form: FormData) {
    const senha = String(form.get("senha"));
    if (senha.length < MINIMO) return setErro(`A senha deve ter pelo menos ${MINIMO} caracteres.`);
    if (senha !== form.get("confirmacao")) return setErro("As senhas não conferem.");
    const { error } = await supabaseNavegador().auth.updateUser({ password: senha });
    if (error) return setErro("Não foi possível salvar a senha. Tente outra.");
    router.replace("/2fa");
  }

  if (!pronto) return null;
  return (
    <main className="cartao-central">
      <div className="cartao">
        <h1>Definir senha</h1>
        <p className="subtitulo">Mínimo de {MINIMO} caracteres. Em seguida você cadastra o autenticador.</p>
        <form className="pilha" action={enviar}>
          <label>
            Nova senha
            <input name="senha" type="password" autoComplete="new-password" minLength={MINIMO} required />
          </label>
          <label>
            Repita a senha
            <input name="confirmacao" type="password" autoComplete="new-password" required />
          </label>
          {erro && <p className="erro" role="alert">{erro}</p>}
          <button>Salvar senha</button>
        </form>
      </div>
    </main>
  );
}

"use client";

// Segundo fator obrigatório (seção 2): quem ainda não tem aplicativo autenticador cadastrado
// cadastra agora; quem já tem informa o código. Sem isso o servidor recusa qualquer dado.

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { supabaseNavegador } from "@/componentes/supabase-navegador";

type Etapa =
  | { tipo: "carregando" }
  | { tipo: "cadastrar"; fatorId: string; qr: string; segredo: string }
  | { tipo: "verificar"; fatorId: string };

function SegundoFator() {
  const router = useRouter();
  const destino = useSearchParams().get("next") ?? "/";
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "carregando" });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    (async () => {
      const auth = supabaseNavegador().auth;
      const { data: nivel } = await auth.mfa.getAuthenticatorAssuranceLevel();
      if (!nivel) return router.replace("/entrar");
      if (nivel.currentLevel === "aal2") return router.replace(destino);

      const { data: fatores } = await auth.mfa.listFactors();
      const verificado = fatores?.totp.find((f) => f.status === "verified");
      if (verificado) return setEtapa({ tipo: "verificar", fatorId: verificado.id });

      // Remove cadastros iniciados e não concluídos antes de gerar um novo QR code.
      for (const f of fatores?.all ?? []) {
        if (f.status === "unverified") await auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await auth.mfa.enroll({ factorType: "totp", friendlyName: "Autenticador" });
      if (error || !data) return setErro("Não foi possível iniciar o cadastro do autenticador.");
      setEtapa({ tipo: "cadastrar", fatorId: data.id, qr: data.totp.qr_code, segredo: data.totp.secret });
    })();
  }, [router, destino]);

  async function confirmar(form: FormData) {
    if (etapa.tipo === "carregando") return;
    setEnviando(true);
    setErro(null);
    const { error } = await supabaseNavegador().auth.mfa.challengeAndVerify({
      factorId: etapa.fatorId,
      code: String(form.get("codigo")).replace(/\D/g, ""),
    });
    setEnviando(false);
    if (error) return setErro("Código inválido ou expirado. Tente o código atual do aplicativo.");
    router.replace(destino);
    router.refresh();
  }

  return (
    <main className="cartao-central">
      <div className="cartao">
        <h1>Verificação em dois fatores</h1>
        {etapa.tipo === "carregando" && !erro && <p className="subtitulo">Carregando…</p>}
        {etapa.tipo === "cadastrar" && (
          <>
            <p className="subtitulo">
              O acesso exige um aplicativo autenticador (Google Authenticator, Microsoft
              Authenticator ou similar). Leia o QR code e informe o código de 6 dígitos.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="qr" src={etapa.qr} alt="QR code para o aplicativo autenticador" />
            <p className="subtitulo">
              Sem câmera? Digite a chave: <span className="codigo-manual">{etapa.segredo}</span>
            </p>
          </>
        )}
        {etapa.tipo === "verificar" && (
          <p className="subtitulo">Informe o código de 6 dígitos do seu aplicativo autenticador.</p>
        )}
        {etapa.tipo !== "carregando" && (
          <form className="pilha" action={confirmar}>
            <label>
              Código
              <input name="codigo" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus />
            </label>
            <button disabled={enviando}>{enviando ? "Conferindo…" : "Confirmar"}</button>
          </form>
        )}
        {erro && <p className="erro" role="alert">{erro}</p>}
      </div>
    </main>
  );
}

export default function Pagina() {
  return (
    <Suspense>
      <SegundoFator />
    </Suspense>
  );
}

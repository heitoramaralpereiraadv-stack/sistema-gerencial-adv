import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { NaoAutenticadoError, SegundoFatorPendenteError } from "@/servidor/erros";
import type { UsuarioAtual } from "@/servidor/auth/usuario";

const ROTULO_PERFIL = { ADMINISTRADOR: "Administrador", ADVOGADO: "Advogado", ASSISTENTE: "Assistente" };

async function usuarioOuRedirecionar(): Promise<UsuarioAtual> {
  try {
    return await exigirUsuario();
  } catch (e) {
    if (e instanceof SegundoFatorPendenteError) redirect("/2fa");
    if (e instanceof NaoAutenticadoError) redirect("/entrar");
    throw e;
  }
}

export default async function LayoutSistema({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioOuRedirecionar();
  return (
    <>
      <header className="topo">
        <nav aria-label="Principal">
          <Link href="/">Agenda</Link>
          <Link href="/painel">Painel</Link>
          <Link href="/processos">Processos</Link>
          <Link href="/clientes">Clientes</Link>
          <Link href="/partes">Partes contrárias</Link>
          <Link href="/relatorios">Relatórios</Link>
          {usuario.perfil === "ADMINISTRADOR" && <Link href="/configuracoes">Configurações</Link>}
        </nav>
        <form action="/sair" method="post">
          <span>{usuario.nome} · {ROTULO_PERFIL[usuario.perfil]} </span>
          <button className="secundario">Sair</button>
        </form>
      </header>
      <main className="conteudo">{children}</main>
    </>
  );
}

import { alterarUsuarioForm, convidarUsuarioForm, definirAtivoForm } from "@/app/acoes/configuracoes";
import { Campo, Marcador, Selecao } from "@/componentes/campos";
import { Formulario, Painel } from "@/componentes/formulario";
import { Selo } from "@/componentes/selos";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { listarUsuarios } from "@/servidor/servicos/usuarios";

const PERFIS = [
  { valor: "ADMINISTRADOR", rotulo: "Administrador (sócio)" },
  { valor: "ADVOGADO", rotulo: "Advogado" },
  { valor: "ASSISTENTE", rotulo: "Assistente" },
];

export default async function Usuarios() {
  const admin = await exigirUsuario();
  const usuarios = await listarUsuarios(admin);
  return (
    <section className="secao">
      <Painel titulo="Convidar usuário">
        <Formulario acao={convidarUsuarioForm} rotulo="Enviar convite" aoConcluir="limpar">
          <Campo rotulo="Nome" nome="nome" obrigatorio />
          <Campo rotulo="E-mail" nome="email" tipo="email" obrigatorio />
          <Selecao rotulo="Perfil" nome="perfil" obrigatorio vazio={null} valor="ADVOGADO" opcoes={PERFIS} />
          <Marcador rotulo="Vê todos os processos (desmarcado: só aqueles de que é responsável — vale para advogado)" nome="veTodosProcessos" marcado />
          <p className="dica">O convite chega por e-mail; a pessoa define a senha e cadastra o aplicativo autenticador.</p>
        </Formulario>
      </Painel>
      <ul className="lista-itens">
        {usuarios.map((u) => (
          <li key={u.id} className={`item${u.ativo ? "" : " item-fechado"}`}>
            <div className="item-topo">
              <strong>{u.nome}</strong>
              <Selo tipo="info">{PERFIS.find((p) => p.valor === u.perfil)?.rotulo}</Selo>
              {!u.ativo && <Selo>Inativo</Selo>}
              {u.perfil === "ADVOGADO" && !u.veTodosProcessos && <Selo tipo="aviso">Só os seus processos</Selo>}
            </div>
            <p className="item-linha suave">{u.email}</p>
            <div className="acoes-item">
              <Painel titulo="Editar">
                <Formulario acao={alterarUsuarioForm.bind(null, u.id)} aoConcluir="fechar">
                  <Campo rotulo="Nome" nome="nome" valor={u.nome} obrigatorio />
                  <Selecao rotulo="Perfil" nome="perfil" obrigatorio vazio={null} valor={u.perfil} opcoes={PERFIS} />
                  <Marcador rotulo="Vê todos os processos" nome="veTodosProcessos" marcado={u.veTodosProcessos} />
                </Formulario>
              </Painel>
              {u.id !== admin.id && (
                <Formulario
                  acao={definirAtivoForm.bind(null, u.id, !u.ativo)}
                  rotulo={u.ativo ? "Desativar acesso" : "Reativar acesso"}
                  classe="inline"
                  confirmar={u.ativo ? `Desativar o acesso de ${u.nome}? O efeito é imediato.` : undefined}
                />
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

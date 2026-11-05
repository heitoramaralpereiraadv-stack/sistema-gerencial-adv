// Cabeçalho dos relatórios exportados (D7).

import { salvarEscritorioForm } from "@/app/acoes/configuracoes";
import { Campo, Marcador } from "@/componentes/campos";
import { Formulario } from "@/componentes/formulario";
import { obterEscritorio, pendenciasDoCabecalho } from "@/servidor/servicos/escritorio";

export default async function Escritorio() {
  const e = await obterEscritorio();
  const faltam = pendenciasDoCabecalho(e);
  return (
    <section className="secao">
      <p className="dica">Estes dados formam o cabeçalho de todo relatório exportado em Excel e PDF.</p>
      {faltam.length > 0 && <p className="destaque-vencidos">Ainda faltam: {faltam.join(", ")}.</p>}
      <Formulario acao={salvarEscritorioForm} rotulo="Salvar">
        <Campo rotulo="Razão social" nome="razaoSocial" valor={e.razaoSocial} obrigatorio />
        <div className="grade-2">
          <Campo rotulo="CNPJ" nome="cnpj" valor={e.cnpj} />
          <Campo rotulo="Registro da sociedade na OAB" nome="registroOab" valor={e.registroOab} />
          <Campo rotulo="Telefone" nome="telefone" valor={e.telefone} />
          <Campo rotulo="E-mail" nome="email" valor={e.email} />
        </div>
        <Campo rotulo="Endereço" nome="endereco" valor={e.endereco} />
        <label>
          Logotipo (PNG ou JPEG, até 200 KB)
          <input type="file" name="logo" accept="image/png,image/jpeg" />
        </label>
        {e.logoBase64 && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:${e.logoTipo};base64,${e.logoBase64}`} alt="Logotipo atual" style={{ maxHeight: 60, maxWidth: 200 }} />
            <Marcador rotulo="Remover o logotipo atual" nome="removerLogo" />
          </>
        )}
      </Formulario>
    </section>
  );
}

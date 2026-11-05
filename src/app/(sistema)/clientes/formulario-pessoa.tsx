// Cadastro de pessoa (cliente ou parte). Dados críticos vão cifrados (D5).

import { AreaTexto, Campo, Marcador, Selecao, opcoesDe } from "@/componentes/campos";
import { Formulario, type AcaoFormulario } from "@/componentes/formulario";
import { LinhasRepetiveis } from "@/componentes/linhas-repetiveis";
import { paraDataCivil } from "@/lib/hoje";
import { SITUACAO_PESSOA, TIPO_CONTATO, TIPO_DOCUMENTO, TIPO_PESSOA } from "@/lib/rotulos";
import { itensDaLista, usuariosAtivos } from "@/servidor/servicos/referencias";

type Pessoa = {
  tipo: string;
  nome: string;
  categoriaId: string | null;
  cpfCnpj: string | null;
  rg: string | null;
  dataNascimento: Date | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  ehCliente: boolean;
  situacao: string | null;
  dataEntrada: Date | null;
  responsavelId: string | null;
  observacoes: string | null;
  informacoesReservadas: string | null;
  cadastroIncompleto: boolean;
  pendencias: string | null;
  contatos: { tipo: string; valor: string }[];
  documentos: { tipo: string; numero: string; descricao: string | null }[];
};

export async function FormularioPessoa({ acao, pessoa }: { acao: AcaoFormulario; pessoa?: Pessoa }) {
  const [categorias, usuarios] = await Promise.all([itensDaLista("CATEGORIA_PARTE"), usuariosAtivos()]);
  return (
    <Formulario acao={acao} rotulo={pessoa ? "Salvar alterações" : "Cadastrar"}>
      <fieldset>
        <legend>Identificação</legend>
        <div className="grade-2">
          <Selecao rotulo="Tipo" nome="tipo" valor={pessoa?.tipo ?? "PF"} obrigatorio vazio={null} opcoes={opcoesDe(TIPO_PESSOA)} />
          <Selecao rotulo="Categoria (só PJ)" nome="categoriaId" valor={pessoa?.categoriaId} opcoes={categorias.map((c) => ({ valor: c.id, rotulo: c.valor }))} />
        </div>
        <Campo rotulo="Nome / razão social" nome="nome" valor={pessoa?.nome} obrigatorio />
        <div className="grade-2">
          <Campo rotulo="CPF / CNPJ" nome="cpfCnpj" valor={pessoa?.cpfCnpj} dica="Validado e guardado cifrado. Aceita o CNPJ alfanumérico." />
          <Campo rotulo="RG" nome="rg" valor={pessoa?.rg} dica="Guardado cifrado." />
          <Campo rotulo="Data de nascimento" nome="dataNascimento" tipo="date" valor={pessoa?.dataNascimento && paraDataCivil(pessoa.dataNascimento)} />
        </div>
      </fieldset>

      <LinhasRepetiveis
        titulo="Telefones e e-mails"
        rotuloNovo="Adicionar contato"
        colunas={[
          { nome: "contatoTipo", rotulo: "Tipo", opcoes: TIPO_CONTATO },
          { nome: "contatoValor", rotulo: "Número ou e-mail" },
        ]}
        iniciais={(pessoa?.contatos.length ? pessoa.contatos : [{ tipo: "TELEFONE", valor: "" }]).map((c) => ({ contatoTipo: c.tipo, contatoValor: c.valor }))}
      />

      <fieldset>
        <legend>Endereço</legend>
        <Campo rotulo="Endereço" nome="endereco" valor={pessoa?.endereco} />
        <div className="grade-2">
          <Campo rotulo="Cidade" nome="cidade" valor={pessoa?.cidade} />
          <Campo rotulo="UF" nome="uf" valor={pessoa?.uf} maxLength={2} />
        </div>
      </fieldset>

      <fieldset>
        <legend>Relação com o escritório</legend>
        <Marcador rotulo="É cliente do escritório" nome="ehCliente" marcado={pessoa?.ehCliente ?? true} />
        <div className="grade-2">
          <Selecao rotulo="Situação" nome="situacao" valor={pessoa?.situacao} opcoes={opcoesDe(SITUACAO_PESSOA)} />
          <Campo rotulo="Data de entrada" nome="dataEntrada" tipo="date" valor={pessoa?.dataEntrada && paraDataCivil(pessoa.dataEntrada)} />
          <Selecao rotulo="Responsável" nome="responsavelId" valor={pessoa?.responsavelId} opcoes={usuarios.map((u) => ({ valor: u.id, rotulo: u.nome }))} />
        </div>
      </fieldset>

      <LinhasRepetiveis
        titulo="Outros documentos (cifrados)"
        rotuloNovo="Adicionar documento"
        colunas={[
          { nome: "documentoTipo", rotulo: "Tipo", opcoes: TIPO_DOCUMENTO },
          { nome: "documentoNumero", rotulo: "Número" },
          { nome: "documentoDescricao", rotulo: "Complemento" },
        ]}
        iniciais={(pessoa?.documentos ?? []).map((x) => ({ documentoTipo: x.tipo, documentoNumero: x.numero, documentoDescricao: x.descricao ?? "" }))}
      />

      <fieldset>
        <legend>Observações</legend>
        <AreaTexto rotulo="Informações reservadas (cifradas)" nome="informacoesReservadas" valor={pessoa?.informacoesReservadas}
          dica="Dados fiscais e de caráter personalíssimo (saúde, renda, situação familiar sensível). Não aparecem em buscas." />
        <AreaTexto rotulo="Observações gerais" nome="observacoes" valor={pessoa?.observacoes}
          dica="Pesquisáveis e não cifradas: não registre aqui dados críticos." />
        <Marcador rotulo="Cadastro incompleto" nome="cadastroIncompleto" marcado={pessoa?.cadastroIncompleto} />
        <Campo rotulo="Pendências do cadastro" nome="pendencias" valor={pessoa?.pendencias} />
      </fieldset>
    </Formulario>
  );
}

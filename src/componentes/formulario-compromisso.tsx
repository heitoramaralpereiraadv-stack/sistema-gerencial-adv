// Compromisso (G2): sem hora de início, é de dia inteiro.

import { dataEmSaoPaulo, paraCampoDataHora } from "@/lib/data-hora";
import { AreaTexto, Campo, Selecao } from "./campos";
import { Formulario, type AcaoFormulario } from "./formulario";

export function FormularioCompromisso({
  acao,
  responsaveis,
  responsavelPadrao,
  compromisso,
  pedirProcesso,
}: {
  acao: AcaoFormulario;
  responsaveis: { id: string; nome: string }[];
  responsavelPadrao: string;
  compromisso?: { titulo: string; inicio: Date; fim: Date | null; diaInteiro: boolean; local: string | null; descricao: string | null; responsavelId: string };
  /** Na Agenda: campo para ligar o compromisso a um processo pelo número. */
  pedirProcesso?: boolean;
}) {
  const hora = (d: Date | null | undefined) => (d && compromisso && !compromisso.diaInteiro ? paraCampoDataHora(d).slice(11) : undefined);
  return (
    <Formulario acao={acao} aoConcluir={compromisso ? "fechar" : "limpar"}>
      <Campo rotulo="Título" nome="titulo" valor={compromisso?.titulo} obrigatorio />
      <div className="grade-3">
        <Campo rotulo="Data" nome="data" tipo="date" valor={compromisso && dataEmSaoPaulo(compromisso.inicio)} obrigatorio />
        <Campo rotulo="Início" nome="horaInicio" tipo="time" valor={hora(compromisso?.inicio)} dica="Vazio: dia inteiro" />
        <Campo rotulo="Término" nome="horaFim" tipo="time" valor={hora(compromisso?.fim)} />
      </div>
      <div className="grade-2">
        <Campo rotulo="Local ou link" nome="local" valor={compromisso?.local} />
        <Selecao
          rotulo="Responsável"
          nome="responsavelId"
          valor={compromisso?.responsavelId ?? responsavelPadrao}
          obrigatorio
          vazio={null}
          opcoes={responsaveis.map((u) => ({ valor: u.id, rotulo: u.nome }))}
        />
      </div>
      {pedirProcesso && <Campo rotulo="Número do processo (opcional)" nome="numeroProcesso" dica="Com ou sem pontuação" />}
      <AreaTexto rotulo="Descrição" nome="descricao" valor={compromisso?.descricao} linhas={2} />
    </Formulario>
  );
}

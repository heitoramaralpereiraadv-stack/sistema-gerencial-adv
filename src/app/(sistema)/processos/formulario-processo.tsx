// Campos do processo, usados em "novo" e "editar".

import { criarComarcaAcao } from "@/app/acoes/processos";
import { AreaTexto, Campo, Marcador, Selecao, opcoesDe } from "@/componentes/campos";
import { Formulario, Painel, type AcaoFormulario } from "@/componentes/formulario";
import { paraDataCivil } from "@/lib/hoje";
import { GRAU } from "@/lib/rotulos";
import { comarcas, itensDaLista, statusAtivos, usuariosAtivos } from "@/servidor/servicos/referencias";

type Processo = {
  numeroCnj: string | null;
  grau: string | null;
  orgaoJulgador: string | null;
  comarcaId: string | null;
  areaId: string;
  classeId: string | null;
  assunto: string | null;
  dataDistribuicao: Date | null;
  dataCitacao: Date | null;
  valorCausa: { toString(): string } | null;
  statusId: string;
  faseAtual: string | null;
  motivoSuspensao: string | null;
  dataSuspensao: Date | null;
  dataEncerramento: Date | null;
  dataResultado: Date | null;
  segredoJustica: boolean;
  responsavelId: string;
  observacoes: string | null;
  cadastroIncompleto: boolean;
  pendencias: string | null;
};

const d = (v: Date | null | undefined) => (v ? paraDataCivil(v) : undefined);

export async function FormularioProcesso({
  acao,
  processo,
  responsavelPadrao,
  extra,
  podeCadastrarComarca,
}: {
  acao: AcaoFormulario;
  processo?: Processo;
  responsavelPadrao: string;
  extra?: React.ReactNode;
  podeCadastrarComarca: boolean;
}) {
  const [areas, classes, status, listaComarcas, usuarios] = await Promise.all([
    itensDaLista("AREA"),
    itensDaLista("CLASSE"),
    statusAtivos(),
    comarcas(),
    usuariosAtivos(),
  ]);
  const advogados = usuarios.filter((u) => u.perfil !== "ASSISTENTE");
  const statusPadrao = status.find((s) => s.nome === "Em andamento")?.id;

  return (
    <>
      <Formulario acao={acao} rotulo={processo ? "Salvar alterações" : "Cadastrar processo"}>
        {extra}
        <fieldset>
          <legend>Identificação</legend>
          <Campo rotulo="Número CNJ" nome="numeroCnj" valor={processo?.numeroCnj}
            dica="Com ou sem pontuação. Deixe em branco se ainda não foi distribuído (A protocolar). Ano, segmento e tribunal são preenchidos pelo número." />
          <div className="grade-2">
            <Selecao rotulo="Grau" nome="grau" valor={processo?.grau} opcoes={opcoesDe(GRAU)} />
            <Selecao rotulo="Comarca" nome="comarcaId" valor={processo?.comarcaId}
              opcoes={listaComarcas.map((c) => ({ valor: c.id, rotulo: `${c.nome}/${c.uf}` }))}
              dica="Usada para os feriados municipais no cálculo de prazos." />
          </div>
          <Campo rotulo="Órgão julgador (vara, câmara, turma)" nome="orgaoJulgador" valor={processo?.orgaoJulgador} />
        </fieldset>
        <fieldset>
          <legend>Classificação</legend>
          <div className="grade-2">
            <Selecao rotulo="Área" nome="areaId" valor={processo?.areaId} obrigatorio opcoes={areas.map((a) => ({ valor: a.id, rotulo: a.valor }))} />
            <Selecao rotulo="Classe / natureza" nome="classeId" valor={processo?.classeId} opcoes={classes.map((a) => ({ valor: a.id, rotulo: a.valor }))}
              dica={classes.length === 0 ? "Lista vazia: o administrador inclui as classes em Configurações." : undefined} />
          </div>
          <Campo rotulo="Assunto" nome="assunto" valor={processo?.assunto} />
        </fieldset>
        <fieldset>
          <legend>Andamento</legend>
          <div className="grade-2">
            <Selecao rotulo="Status" nome="statusId" valor={processo?.statusId ?? statusPadrao} obrigatorio vazio={null}
              opcoes={status.map((s) => ({ valor: s.id, rotulo: s.nome }))} />
            <Selecao rotulo="Advogado responsável" nome="responsavelId" valor={processo?.responsavelId ?? responsavelPadrao} obrigatorio vazio={null}
              opcoes={advogados.map((u) => ({ valor: u.id, rotulo: u.nome }))} />
          </div>
          <Campo rotulo="Fase atual / último ato" nome="faseAtual" valor={processo?.faseAtual} />
          <div className="grade-2">
            <Campo rotulo="Motivo (Sobrestado/Suspenso)" nome="motivoSuspensao" valor={processo?.motivoSuspensao} />
            <Campo rotulo="Suspenso desde" nome="dataSuspensao" tipo="date" valor={d(processo?.dataSuspensao)} />
            <Campo rotulo="Data de encerramento" nome="dataEncerramento" tipo="date" valor={d(processo?.dataEncerramento)} />
            <Campo rotulo="Data da sentença / homologação" nome="dataResultado" tipo="date" valor={d(processo?.dataResultado)} />
          </div>
        </fieldset>
        <fieldset>
          <legend>Datas e valores</legend>
          <div className="grade-2">
            <Campo rotulo="Distribuição" nome="dataDistribuicao" tipo="date" valor={d(processo?.dataDistribuicao)} />
            <Campo rotulo="Citação / ingresso" nome="dataCitacao" tipo="date" valor={d(processo?.dataCitacao)} />
          </div>
          <Campo rotulo="Valor da causa (R$)" nome="valorCausa" valor={processo?.valorCausa?.toString().replace(".", ",")} inputMode="decimal" placeholder="0,00" />
        </fieldset>
        <fieldset>
          <legend>Outros</legend>
          <Marcador rotulo="Segredo de justiça (visível só ao responsável e aos administradores)" nome="segredoJustica" marcado={processo?.segredoJustica} />
          <Marcador rotulo="Cadastro incompleto" nome="cadastroIncompleto" marcado={processo?.cadastroIncompleto} />
          <Campo rotulo="Pendências do cadastro" nome="pendencias" valor={processo?.pendencias} />
          <AreaTexto rotulo="Observações" nome="observacoes" valor={processo?.observacoes} />
        </fieldset>
      </Formulario>
      {podeCadastrarComarca && (
        <Painel titulo="Comarca não está na lista? Cadastrar comarca">
          <Formulario acao={criarComarcaAcao} rotulo="Cadastrar comarca" aoConcluir="limpar">
            <div className="grade-2">
              <Campo rotulo="Nome" nome="nome" obrigatorio />
              <Campo rotulo="UF" nome="uf" obrigatorio maxLength={2} />
            </div>
          </Formulario>
        </Painel>
      )}
    </>
  );
}

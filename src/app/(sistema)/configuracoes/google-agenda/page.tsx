// Google Agenda (G1–G4): enviar ao Google por assinatura e importar o arquivo exportado.
// Somente administrador, que centraliza a agenda do escritório.

import Link from "next/link";
import { desligarAssinaturaAcao, enviarAgendaGoogleAcao, gerarAssinaturaAcao } from "@/app/acoes/agenda";
import { Formulario } from "@/componentes/formulario";
import { Selo } from "@/componentes/selos";
import { formatarDataHora } from "@/lib/data-hora";
import { enderecoDoSistema } from "@/lib/endereco";
import { exigirUsuario } from "@/servidor/auth/sessao";
import { listarLotesAgenda, obterAssinatura, urlDaAssinatura } from "@/servidor/servicos/google-agenda";

const SITUACAO = { EM_REVISAO: "Em revisão", GRAVADO: "Gravado", DESCARTADO: "Descartado" } as const;

export default async function GoogleAgenda() {
  const admin = await exigirUsuario();
  const [assinatura, lotes, base] = await Promise.all([obterAssinatura(admin), listarLotesAgenda(admin), enderecoDoSistema()]);
  const url = assinatura && urlDaAssinatura(base, assinatura.token);

  return (
    <>
      <section className="secao">
        <h2>Enviar ao Google Agenda</h2>
        <p className="dica">
          O Google assina um endereço privado do sistema com os prazos em aberto, as audiências e os compromissos de todo o escritório. Os
          eventos que vieram do Google não voltam para lá. Em processos com segredo de justiça não vão nomes de partes.
        </p>
        {url ? (
          <div className="cartao pilha">
            <p>
              <Selo tipo="ok">Assinatura ligada</Selo>{" "}
              {assinatura.criadoEm && <span className="suave">endereço gerado em {formatarDataHora(assinatura.criadoEm)}</span>}
            </p>
            <label>
              Endereço da agenda (não compartilhe: quem tiver o endereço vê a agenda)
              <input className="campo-url" readOnly value={url} />
            </label>
            <ol className="passos">
              <li>No Google Agenda, no computador, clique no “+” ao lado de <strong>Outras agendas</strong> e escolha <strong>Do URL</strong>.</li>
              <li>Cole o endereço acima e clique em <strong>Adicionar agenda</strong>.</li>
              <li>A agenda aparece no celular também, com o nome “Medeiros e Barbosa — prazos e audiências”.</li>
            </ol>
            <p className="destaque-vencidos">
              O próprio Google decide quando atualiza a agenda assinada (costuma levar algumas horas). Use a Agenda do sistema como referência
              para prazos; o Google é uma cópia de consulta.
            </p>
            <div className="botoes">
              <Formulario acao={gerarAssinaturaAcao} rotulo="Gerar novo endereço" classe="inline" confirmar="O endereço atual deixa de funcionar. Será preciso adicionar o novo no Google. Continuar?" />
              <Formulario acao={desligarAssinaturaAcao} rotulo="Desligar o envio" classe="inline" confirmar="O Google deixa de receber a agenda. Continuar?" />
            </div>
          </div>
        ) : (
          <div className="cartao pilha">
            <p><Selo>Assinatura desligada</Selo></p>
            <Formulario acao={gerarAssinaturaAcao} rotulo="Ligar o envio ao Google" classe="inline" />
          </div>
        )}
        <p>
          <a className="botao secundario" href="/configuracoes/google-agenda/exportar">Baixar agora (.ics)</a>{" "}
          <span className="suave">para importar uma vez no Google, em Configurações › Importar e exportar.</span>
        </p>
      </section>

      <section className="secao">
        <h2>Importar do Google Agenda</h2>
        <ol className="passos">
          <li>No Google Agenda, no computador: <strong>Configurações › Importar e exportar › Exportar</strong>. O Google baixa um arquivo .zip.</li>
          <li>Envie o .zip aqui (ou só o .ics da agenda do escritório, de dentro do .zip).</li>
          <li>Revise cada evento: compromisso (padrão, ligado a cada processo citado), audiência ou não importar. Nada é gravado antes da revisão.</li>
        </ol>
        <p className="dica">
          Entram os eventos de hoje em diante. Eventos repetidos (séries), cancelados, já importados e os enviados pelo próprio sistema são
          separados e não entram.
        </p>
        <section className="cartao">
          <Formulario acao={enviarAgendaGoogleAcao} rotulo="Enviar e revisar">
            <label>
              Arquivo do Google Agenda (.zip ou .ics) *
              <input type="file" name="arquivo" accept=".ics,.zip,text/calendar,application/zip" required />
            </label>
          </Formulario>
        </section>
        <h3>Importações</h3>
        {lotes.length === 0 && <p className="suave">Nenhuma importação.</p>}
        <ul className="lista-itens">
          {lotes.map((l) => (
            <li key={l.id} className="item">
              <div className="item-topo">
                <Link href={`/configuracoes/google-agenda/${l.id}`}><strong>{l.arquivo}</strong></Link>
                <Selo tipo={l.situacao === "GRAVADO" ? "ok" : l.situacao === "EM_REVISAO" ? "aviso" : "neutro"}>{SITUACAO[l.situacao]}</Selo>
              </div>
              <p className="item-linha suave">
                Enviado em {formatarDataHora(l.criadoEm)} por {l.criadoPor.nome}
                {l.gravadoEm && ` · gravado em ${formatarDataHora(l.gravadoEm)}`}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

// Google Agenda (G1–G4) com eventos e processos fictícios: importação revisada evento a evento
// e envio ao Google pelo endereço de assinatura.

import { randomInt } from "node:crypto";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lerIcs } from "@/dominio/agenda/ics";
import { calcularDigito } from "@/dominio/cnj/numero-cnj";
import { hoje } from "@/lib/hoje";
import type { UsuarioAtual } from "@/servidor/auth/usuario";
import { criarPrisma } from "@/servidor/db/prisma";
import { ProibidoError } from "@/servidor/erros";
import { obterAgenda } from "@/servidor/servicos/agenda";
import { salvarCompromisso } from "@/servidor/servicos/compromissos";
import { excluirRegistro } from "@/servidor/servicos/exclusao";
import {
  criarLoteAgenda,
  desligarAssinatura,
  gerarAssinatura,
  gravarLoteAgenda,
  icsDaAssinatura,
  lerArquivoAgenda,
  obterLoteAgenda,
  salvarDecisoesAgenda,
} from "@/servidor/servicos/google-agenda";
import { criarPrazo } from "@/servidor/servicos/prazos";
import { comoSeed, criarUsuario, referencias } from "../apoio/fixtures";

const prisma = criarPrisma();
afterAll(() => prisma.$disconnect());

const BASE = "https://sistema.exemplo.invalid";
const HOJE = "2026-11-05";
const novoCnj = () => {
  const n = String(randomInt(1_000_000, 9_999_999));
  return `${n}-${calcularDigito(n, "2026", "8", "09", "0051")}.2026.8.09.0051`;
};
const A = novoCnj();
const B = novoCnj();
const SEM_CADASTRO = novoCnj();

let admin: UsuarioAtual, advogado: UsuarioAtual, assistente: UsuarioAtual;
let processoA: string, processoB: string, tipoAudiencia: string;

beforeAll(async () => {
  admin = await criarUsuario(prisma, "ADMINISTRADOR");
  advogado = await criarUsuario(prisma, "ADVOGADO");
  assistente = await criarUsuario(prisma, "ASSISTENTE");
  const { areaId, statusId } = await referencias(prisma);
  [processoA, processoB, tipoAudiencia] = await comoSeed(prisma, async (tx) => {
    const cliente = await tx.pessoa.create({ data: { tipo: "PF", nome: "Cliente Fictício da Agenda", ehCliente: true } });
    const a = await tx.processo.create({ data: { numeroCnj: A, areaId, statusId, responsavelId: advogado.id, partes: { create: { pessoaId: cliente.id, polo: "ATIVO", ehClienteDoEscritorio: true } } } });
    const b = await tx.processo.create({ data: { numeroCnj: B, areaId, statusId, responsavelId: advogado.id, segredoJustica: true, partes: { create: { pessoaId: cliente.id, polo: "ATIVO", ehClienteDoEscritorio: true } } } });
    const t = await tx.itemLista.upsert({
      where: { lista_valor: { lista: "TIPO_AUDIENCIA", valor: "Conciliação fictícia" } },
      update: {},
      create: { lista: "TIPO_AUDIENCIA", valor: "Conciliação fictícia" },
    });
    return [a.id, b.id, t.id];
  });
});

const evento = (uid: string, inicio: string, titulo: string, extra: string[] = []) =>
  ["BEGIN:VEVENT", `UID:${uid}`, inicio, `SUMMARY:${titulo}`, ...extra, "END:VEVENT"];
const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  ...evento("g-1@google.com", "DTSTART;TZID=America/Sao_Paulo:20261110T143000", `Audiência ${A}`, ["DTEND;TZID=America/Sao_Paulo:20261110T153000", "LOCATION:https://meet.google.com/xxx"]),
  ...evento("g-2@google.com", "DTSTART;VALUE=DATE:20261112", "Reunião sobre os dois processos", [`DESCRIPTION:${A} e ${B.replace(/\D/g, "")}`]),
  ...evento("g-3@google.com", "DTSTART:20261113T120000Z", "Compromisso pessoal fictício"),
  ...evento("g-4@google.com", "DTSTART:20261114T120000Z", `Diligência ${SEM_CADASTRO}`),
  ...evento("g-5@google.com", "DTSTART:20261001T120000Z", "Evento antigo"),
  ...evento("g-6@google.com", "DTSTART:20261116T120000Z", "Série semanal", ["RRULE:FREQ=WEEKLY"]),
  ...evento("prazo-x@sistema-gerencial.medeirosebarbosa", "DTSTART;VALUE=DATE:20261120", "Veio do sistema"),
  "END:VCALENDAR",
].join("\r\n");
const arquivo = { nome: "agenda-ficticia.ics", conteudo: Buffer.from(ICS) };

describe("importação do Google Agenda", () => {
  let loteId: string;

  it("só o administrador importa", async () => {
    await expect(criarLoteAgenda(advogado, arquivo, HOJE, prisma)).rejects.toThrow(ProibidoError);
    await expect(criarLoteAgenda(assistente, arquivo, HOJE, prisma)).rejects.toThrow(ProibidoError);
  });

  it("separa o que entra; sem escolha, todo evento é compromisso ligado a cada processo citado", async () => {
    loteId = (await criarLoteAgenda(admin, arquivo, HOJE, prisma)).id;
    const l = await obterLoteAgenda(admin, loteId, prisma);
    expect(l.contagem).toMatchObject({ novo: 4, passado: 1, recorrente: 1, do_sistema: 1, ja_importado: 0 });
    expect(l.revisados.map((e) => e.decisao.tipo)).toEqual(["COMPROMISSO", "COMPROMISSO", "COMPROMISSO", "COMPROMISSO"]);
    const [e1, e2, e3, e4] = l.revisados;
    expect(e1!.processosAchados.map((p) => p.id)).toEqual([processoA]);
    expect(e2!.processosAchados.map((p) => p.id)).toEqual([processoA, processoB]);
    expect(e2!.avisos.join()).toMatch(/cada um dos 2 processos/);
    expect(e3!.avisos.join()).toMatch(/avulso/);
    expect(e4!.problemas.join()).toMatch(/não cadastrado/);
    expect(l.podeGravar).toBe(false);
    await expect(gravarLoteAgenda(admin, loteId, prisma)).rejects.toThrow(/pendência/);
  });

  it("audiência exige um processo e o tipo; com a revisão corrigida, grava tudo de uma vez", async () => {
    const decisoes = {
      "g-1@google.com": { tipo: "AUDIENCIA", processos: A },
      "g-4@google.com": { tipo: "COMPROMISSO", processos: SEM_CADASTRO },
    };
    await salvarDecisoesAgenda(admin, loteId, decisoes, prisma);
    let l = await obterLoteAgenda(admin, loteId, prisma);
    expect(l.revisados[0]!.problemas).toEqual(["Audiência: escolha o tipo."]);

    await salvarDecisoesAgenda(admin, loteId, {
      "g-1@google.com": { tipo: "AUDIENCIA", processos: A, tipoAudienciaId: tipoAudiencia },
      "g-2@google.com": { tipo: "COMPROMISSO", processos: `${A}; ${B}` },
      "g-3@google.com": { tipo: "COMPROMISSO", processos: "" },
      "g-4@google.com": { tipo: "IGNORAR", processos: SEM_CADASTRO },
    }, prisma);
    l = await obterLoteAgenda(admin, loteId, prisma);
    expect(l.podeGravar).toBe(true);
    expect(await gravarLoteAgenda(admin, loteId, prisma)).toEqual({ compromissos: 3, audiencias: 1, ignorados: 1, jaExistentes: 0 });

    const aud = await prisma.audiencia.findFirstOrThrow({ where: { uidExterno: "g-1@google.com" } });
    expect(aud).toMatchObject({ processoId: processoA, modalidade: "VIRTUAL", responsavelId: admin.id, localOuLink: "https://meet.google.com/xxx" });
    expect(aud.dataHora.toISOString()).toBe("2026-11-10T17:30:00.000Z");
    const comp = await prisma.compromisso.findMany({ where: { uidExterno: { in: ["g-2@google.com", "g-3@google.com"] } }, orderBy: { titulo: "asc" } });
    expect(comp.map((c) => c.processoId).sort()).toEqual([null, processoA, processoB].sort());
    expect(comp.find((c) => c.uidExterno === "g-2@google.com")).toMatchObject({ diaInteiro: true });
    // Histórico com o administrador que importou.
    const h = await prisma.historico.findMany({ where: { entidade: "compromisso", usuarioId: admin.id, operacao: "CRIACAO" }, distinct: ["registroId"] });
    expect(h.map((x) => x.registroId).sort()).toEqual(comp.map((c) => c.id).sort());
  });

  it("importar o mesmo arquivo de novo não duplica", async () => {
    const l = await obterLoteAgenda(admin, (await criarLoteAgenda(admin, arquivo, HOJE, prisma)).id, prisma);
    expect(l.contagem).toMatchObject({ ja_importado: 3, novo: 1 });
    expect(l.revisados.map((e) => e.uid)).toEqual(["g-4@google.com"]);
  });

  it("aceita o .zip que o Google exporta (uma agenda .ics por arquivo)", async () => {
    const zip = new JSZip();
    zip.file("escritorio@exemplo.invalid.ics", ICS);
    zip.file("feriados.ics", ["BEGIN:VCALENDAR", ...evento("f-1@google.com", "DTSTART;VALUE=DATE:20261225", "Feriado fictício"), "END:VCALENDAR"].join("\r\n"));
    zip.file("leia-me.txt", "ignorado");
    const eventos = await lerArquivoAgenda("agenda.zip", await zip.generateAsync({ type: "nodebuffer" }));
    expect(eventos.map((e) => e.uid)).toContain("f-1@google.com");
    expect(eventos).toHaveLength(8);
    await expect(lerArquivoAgenda("x.zip", Buffer.from("PK nada"))).rejects.toThrow(/zip/);
  });

  it("arquivo que não é agenda é recusado com mensagem clara", async () => {
    await expect(criarLoteAgenda(admin, { nome: "x.ics", conteudo: Buffer.from("texto qualquer") }, HOJE, prisma)).rejects.toThrow(/não é uma agenda/);
  });
});

describe("compromissos", () => {
  it("advogado lança com e sem processo; assistente não; aparece na Agenda", async () => {
    const dia = hoje();
    await salvarCompromisso(advogado, processoA, { titulo: "Reunião fictícia", data: dia, horaInicio: "23:00", horaFim: "23:30", responsavelId: advogado.id }, undefined, prisma);
    const avulso = await salvarCompromisso(advogado, null, { titulo: "Avulso fictício", data: dia, responsavelId: advogado.id }, undefined, prisma);
    expect(avulso).toMatchObject({ processoId: null, diaInteiro: true });
    const ligado = await salvarCompromisso(advogado, null, { titulo: "Pelo número", data: dia, responsavelId: advogado.id, numeroProcesso: A.replace(/\D/g, "") }, undefined, prisma);
    expect(ligado.processoId).toBe(processoA);
    await expect(salvarCompromisso(advogado, null, { titulo: "x", data: dia, responsavelId: advogado.id, numeroProcesso: SEM_CADASTRO }, undefined, prisma)).rejects.toThrow(/não cadastrado/);
    await expect(salvarCompromisso(advogado, null, { titulo: "x", data: dia, horaInicio: "10:00", horaFim: "09:00", responsavelId: advogado.id }, undefined, prisma)).rejects.toThrow(/término/);
    await expect(salvarCompromisso(assistente, null, { titulo: "x", data: dia, responsavelId: assistente.id }, undefined, prisma)).rejects.toThrow(ProibidoError);

    const agenda = await obterAgenda(advogado, "meus", dia, prisma);
    expect(agenda.compromissos.map((c) => c.titulo)).toEqual(expect.arrayContaining(["Reunião fictícia", "Avulso fictício", "Pelo número"]));

    await expect(excluirRegistro(advogado, "compromisso", avulso.id, prisma)).rejects.toThrow(ProibidoError);
    await excluirRegistro(admin, "compromisso", avulso.id, prisma);
    expect((await obterAgenda(advogado, "meus", dia, prisma)).compromissos.map((c) => c.titulo)).not.toContain("Avulso fictício");
  });
});

describe("envio ao Google (assinatura)", () => {
  it("só o endereço com o token certo devolve a agenda; desligar e gerar outro invalida o antigo", async () => {
    await criarPrazo(advogado, processoA, { descricao: "Contestação fictícia", formaIntimacao: "DATA_INFORMADA", dataReferencia: hoje(), quantidadeDias: 5, tipoContagem: "UTEIS", emDobro: false, responsavelId: advogado.id }, prisma);
    await criarPrazo(advogado, processoB, { descricao: "Prazo em segredo", formaIntimacao: "DATA_INFORMADA", dataReferencia: hoje(), quantidadeDias: 5, tipoContagem: "UTEIS", emDobro: false, responsavelId: advogado.id }, prisma);
    await expect(gerarAssinatura(advogado, prisma)).rejects.toThrow(ProibidoError);

    const token = await gerarAssinatura(admin, prisma);
    expect(await icsDaAssinatura("token-errado-com-tamanho-ok", BASE, prisma)).toBeNull();
    const ics = (await icsDaAssinatura(token, BASE, prisma))!;
    const eventos = lerIcs(ics);
    const titulos = eventos.map((e) => e.titulo);
    expect(titulos).toContain(`Prazo (não conferido): Contestação fictícia — ${A}`);
    expect(titulos.some((t) => t.startsWith("Reunião fictícia"))).toBe(true);
    // O que veio do Google não volta para lá.
    expect(titulos.some((t) => t.startsWith("Audiência") || t.startsWith("Reunião sobre"))).toBe(false);
    const contestacao = eventos.find((e) => e.titulo.includes("Contestação"))!;
    expect(contestacao.descricao).toContain("Cliente: Cliente Fictício da Agenda");
    expect(contestacao.descricao).toContain(`${BASE}/processos/${processoA}`);
    const segredo = eventos.find((e) => e.titulo.includes("Prazo em segredo"))!;
    expect(segredo.descricao).toContain("Segredo de justiça");
    expect(segredo.descricao).not.toContain("Cliente Fictício");
    // O token não fica em claro no banco nem no histórico.
    const linha = JSON.stringify(await prisma.configuracaoEscritorio.findUnique({ where: { id: 1 } }));
    const hist = JSON.stringify(await prisma.historico.findMany({ where: { entidade: "configuracao_escritorio" }, select: { valorAnterior: true, valorNovo: true } }));
    expect(linha).not.toContain(token);
    expect(hist).not.toContain(token);

    const novo = await gerarAssinatura(admin, prisma);
    expect(await icsDaAssinatura(token, BASE, prisma)).toBeNull();
    expect(await icsDaAssinatura(novo, BASE, prisma)).not.toBeNull();
    await desligarAssinatura(admin, prisma);
    expect(await icsDaAssinatura(novo, BASE, prisma)).toBeNull();
  });
});

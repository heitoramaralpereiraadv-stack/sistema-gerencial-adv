// Monta a tabela de um relatório a partir da URL e exporta em Excel ou PDF (seção 6).

import type { PrismaClient } from "@/generated/prisma/client";
import { formatarData } from "@/dominio/prazos/data-civil";
import type { UsuarioAtual } from "../auth/usuario";
import { prisma } from "../db/prisma";
import { NaoEncontradoError } from "../erros";
import { obterEscritorio } from "../servicos/escritorio";
import type { FiltrosProcessos } from "../servicos/processos";
import { ehTipoRelatorio, fichaDoCliente, listaDeProcessos, RELATORIOS } from "./consultas";
import { gerarExcel } from "./excel";
import { gerarPdf } from "./pdf";
import { lerFiltros, type ContextoExportacao, type Filtros, type Tabela } from "./tipos";

type Parametros = Record<string, string | string[] | undefined>;
const um = (p: Parametros, k: string) => (Array.isArray(p[k]) ? p[k][0] : p[k]) || undefined;

/** Filtros em palavras, para o cabeçalho do arquivo. */
export async function descreverFiltros(f: Partial<Filtros> & FiltrosProcessos, comPeriodo: boolean, cliente: PrismaClient = prisma()) {
  const partes: string[] = [];
  if (comPeriodo && f.inicio && f.fim) partes.push(`Período: ${formatarData(f.inicio)} a ${formatarData(f.fim)}`);
  const [resp, area, status, comarca, parte, tribunal] = await Promise.all([
    f.responsavelId ? cliente.usuario.findUnique({ where: { id: f.responsavelId }, select: { nome: true } }) : null,
    f.areaId ? cliente.itemLista.findUnique({ where: { id: f.areaId }, select: { valor: true } }) : null,
    f.statusId ? cliente.statusProcesso.findUnique({ where: { id: f.statusId }, select: { nome: true } }) : null,
    f.comarcaId ? cliente.comarca.findUnique({ where: { id: f.comarcaId }, select: { nome: true, uf: true } }) : null,
    f.parteId ? cliente.pessoa.findUnique({ where: { id: f.parteId }, select: { nome: true } }) : null,
    f.tribunalCodigo ? cliente.tribunal.findUnique({ where: { codigo: f.tribunalCodigo }, select: { sigla: true } }) : null,
  ]);
  if (resp) partes.push(`Responsável: ${resp.nome}`);
  if (area) partes.push(`Área: ${area.valor}`);
  if (status) partes.push(`Status: ${status.nome}`);
  if (tribunal) partes.push(`Tribunal: ${tribunal.sigla}`);
  if (comarca) partes.push(`Comarca: ${comarca.nome}/${comarca.uf}`);
  if (parte) partes.push(`Parte: ${parte.nome}`);
  if (f.termo) partes.push(`Busca: "${f.termo}"`);
  if (f.situacao === "ativos") partes.push("Somente processos ativos");
  if (f.semNumero) partes.push("Somente processos sem número");
  if (f.semComarca) partes.push("Somente processos sem comarca");
  return [partes.length ? partes.join(" · ") : "Sem filtros"];
}

export async function montarTabela(usuario: UsuarioAtual, tipo: string, p: Parametros, cliente: PrismaClient = prisma()) {
  if (tipo === "processos") {
    const filtros: FiltrosProcessos = Object.fromEntries(
      ["termo", "areaId", "statusId", "tribunalCodigo", "comarcaId", "responsavelId", "parteId", "situacao", "semNumero", "semComarca"].map((k) => [k, um(p, k)]),
    );
    return { tabela: await listaDeProcessos(usuario, filtros, cliente), filtros: await descreverFiltros(filtros, false, cliente) };
  }
  if (tipo === "ficha-cliente") {
    const pessoaId = um(p, "pessoaId");
    if (!pessoaId) throw new NaoEncontradoError("Informe o cliente.");
    return { tabela: await fichaDoCliente(usuario, pessoaId, cliente), filtros: [] };
  }
  if (!ehTipoRelatorio(tipo)) throw new NaoEncontradoError("Relatório não encontrado.");
  const def = RELATORIOS[tipo];
  const f = lerFiltros(p);
  return { tabela: await def.gerar(usuario, f, cliente), filtros: await descreverFiltros(f, def.periodo, cliente) };
}

export async function exportar(
  usuario: UsuarioAtual,
  tipo: string,
  formato: "xlsx" | "pdf",
  p: Parametros,
  cliente: PrismaClient = prisma(),
): Promise<{ conteudo: Uint8Array; nome: string; tipoMime: string; tabela: Tabela }> {
  const { tabela, filtros } = await montarTabela(usuario, tipo, p, cliente);
  const ctx: ContextoExportacao = {
    escritorio: await obterEscritorio(cliente),
    filtrosDescritos: filtros,
    geradoPor: usuario.nome,
    geradoEm: new Date(),
  };
  const data = new Date().toISOString().slice(0, 10);
  if (formato === "xlsx") {
    return {
      conteudo: await gerarExcel(tabela, ctx),
      nome: `${tipo}-${data}.xlsx`,
      tipoMime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      tabela,
    };
  }
  return { conteudo: await gerarPdf(tabela, ctx), nome: `${tipo}-${data}.pdf`, tipoMime: "application/pdf", tabela };
}

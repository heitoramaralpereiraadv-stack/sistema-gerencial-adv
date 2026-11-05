// Pessoas: clientes e partes (seção 3). Dados críticos cifrados (D5): CPF/CNPJ, RG, demais
// documentos e informações reservadas (fiscais e de caráter personalíssimo).

import { z } from "zod";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { normalizarDocumento, validarCnpj, validarCpf, validarCpfCnpj } from "@/dominio/documentos/cpf-cnpj";
import { paraDate } from "@/lib/hoje";
import type { UsuarioAtual } from "../auth/usuario";
import { cifrar, cifrarOpcional, decifrar, decifrarOpcional, indiceBusca } from "../cripto/cifra";
import { comUsuario, prisma, type Transacao } from "../db/prisma";
import { NaoEncontradoError, RegraDeNegocioError } from "../erros";
import { exigirPermissao } from "../permissoes/matriz";
import { filtroProcessosVisiveis } from "../permissoes/visibilidade";
import { registrarAcesso } from "./acessos";
import { booleano, dataOpcional, idOpcional, lista, textoObrigatorio, textoOpcional } from "./comum";

const TIPOS_DOCUMENTO = [
  "CNH", "CTPS", "PIS_NIT_PASEP", "TITULO_ELEITOR", "PASSAPORTE", "CERTIDAO", "NUMERO_BENEFICIO",
  "INSCRICAO_ESTADUAL", "INSCRICAO_MUNICIPAL", "OUTRO",
] as const;

export const esquemaPessoa = z
  .object({
    tipo: z.enum(["PF", "PJ", "ESPOLIO", "ENTE_PUBLICO"]),
    nome: textoObrigatorio("o nome"),
    categoriaId: idOpcional,
    cpfCnpj: textoOpcional,
    rg: textoOpcional,
    dataNascimento: dataOpcional,
    endereco: textoOpcional,
    cidade: textoOpcional,
    uf: z.preprocess((v) => (v === "" ? undefined : v), z.string().length(2).toUpperCase().optional()),
    ehCliente: booleano,
    situacao: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["ATIVO", "INATIVO", "PROSPECCAO"]).optional()),
    dataEntrada: dataOpcional,
    responsavelId: idOpcional,
    observacoes: textoOpcional,
    informacoesReservadas: textoOpcional,
    cadastroIncompleto: booleano,
    pendencias: textoOpcional,
    contatoTipo: lista(z.enum(["TELEFONE", "WHATSAPP", "EMAIL"])),
    contatoValor: lista(z.string()),
    documentoTipo: lista(z.enum(TIPOS_DOCUMENTO)),
    documentoNumero: lista(z.string()),
    documentoDescricao: lista(z.string()),
  })
  .transform((d, ctx) => {
    // CPF para pessoa física; CNPJ para PJ e ente público; espólio aceita um ou outro.
    let documento: { normalizado: string; formatado: string } | null = null;
    if (d.cpfCnpj) {
      const r = d.tipo === "PF" ? validarCpf(d.cpfCnpj) : d.tipo === "ESPOLIO" ? validarCpfCnpj(d.cpfCnpj) : validarCnpj(d.cpfCnpj);
      if (!r.valido) ctx.addIssue({ code: "custom", message: r.erro, path: ["cpfCnpj"] });
      else documento = r;
    }
    const contatos = d.contatoTipo
      .map((tipo, i) => ({ tipo, valor: (d.contatoValor[i] ?? "").trim() }))
      .filter((c) => c.valor);
    for (const c of contatos) {
      if (c.tipo === "EMAIL" && !z.email().safeParse(c.valor).success) {
        ctx.addIssue({ code: "custom", message: `E-mail inválido: ${c.valor}`, path: ["contatoValor"] });
      }
    }
    const documentos = d.documentoTipo
      .map((tipo, i) => ({ tipo, numero: (d.documentoNumero[i] ?? "").trim(), descricao: d.documentoDescricao[i]?.trim() || null }))
      .filter((x) => x.numero);
    return { ...d, documento, contatos, documentos, categoriaId: d.tipo === "PJ" ? d.categoriaId : undefined };
  });

type DadosPessoa = z.infer<typeof esquemaPessoa>;

function camposPessoa(d: DadosPessoa) {
  return {
    tipo: d.tipo,
    nome: d.nome,
    categoriaId: d.categoriaId ?? null,
    dataNascimento: d.dataNascimento ? paraDate(d.dataNascimento) : null,
    endereco: d.endereco ?? null,
    cidade: d.cidade ?? null,
    uf: d.uf ?? null,
    ehCliente: d.ehCliente,
    situacao: d.situacao ?? (d.ehCliente ? "ATIVO" : null),
    dataEntrada: d.dataEntrada ? paraDate(d.dataEntrada) : null,
    responsavelId: d.responsavelId ?? null,
    observacoes: d.observacoes ?? null,
    cadastroIncompleto: d.cadastroIncompleto,
    pendencias: d.pendencias ?? null,
  };
}

const soDigitos = (v: string) => v.replace(/\D/g, "");

function traduzirUnicidade(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    throw new RegraDeNegocioError("CPF/CNPJ já cadastrado para outra pessoa.");
  }
  throw e;
}

/**
 * Grava contatos e documentos comparando com os atuais: o que não mudou fica como está,
 * para o histórico registrar só o que de fato foi incluído ou removido (D10).
 */
async function sincronizarListas(tx: Transacao, pessoaId: string, d: DadosPessoa) {
  const contatos = await tx.contato.findMany({ where: { pessoaId } });
  const chaveContato = (c: { tipo: string; valor: string }) => `${c.tipo}|${c.valor}`;
  const novos = new Set(d.contatos.map(chaveContato));
  for (const c of contatos) if (!novos.has(chaveContato(c))) await tx.contato.delete({ where: { id: c.id } });
  const atuais = new Set(contatos.map(chaveContato));
  for (const [i, c] of d.contatos.entries()) {
    if (atuais.has(chaveContato(c))) continue;
    await tx.contato.create({
      data: { pessoaId, tipo: c.tipo, valor: c.valor, valorBusca: c.tipo === "EMAIL" ? c.valor.toLowerCase() : soDigitos(c.valor), principal: i === 0 },
    });
  }

  const documentos = await tx.documentoPessoa.findMany({ where: { pessoaId } });
  const chaveDoc = (tipo: string, hash: string, descricao: string | null) => `${tipo}|${hash}|${descricao ?? ""}`;
  const desejados = d.documentos.map((x) => ({ ...x, hash: indiceBusca(`${x.tipo}:${normalizarDocumento(x.numero)}`) }));
  const chavesDesejadas = new Set(desejados.map((x) => chaveDoc(x.tipo, x.hash, x.descricao)));
  for (const doc of documentos) {
    if (!chavesDesejadas.has(chaveDoc(doc.tipo, doc.numeroHash, doc.descricao))) await tx.documentoPessoa.delete({ where: { id: doc.id } });
  }
  const chavesAtuais = new Set(documentos.map((x) => chaveDoc(x.tipo, x.numeroHash, x.descricao)));
  for (const x of desejados) {
    if (chavesAtuais.has(chaveDoc(x.tipo, x.hash, x.descricao))) continue;
    await tx.documentoPessoa.create({
      data: { pessoaId, tipo: x.tipo, numeroCifrado: cifrar(x.numero), numeroHash: x.hash, descricao: x.descricao },
    });
  }
}

export async function criarPessoa(usuario: UsuarioAtual, entrada: unknown, cliente: PrismaClient = prisma()) {
  exigirPermissao(usuario, "pessoa.editar");
  const d = esquemaPessoa.parse(entrada);
  return comUsuario(
    usuario.id,
    async (tx) => {
      const pessoa = await tx.pessoa.create({
        data: {
          ...camposPessoa(d),
          cpfCnpjCifrado: d.documento ? cifrar(d.documento.formatado) : null,
          cpfCnpjHash: d.documento ? indiceBusca(d.documento.normalizado) : null,
          rgCifrado: cifrarOpcional(d.rg),
          informacoesReservadasCifrado: cifrarOpcional(d.informacoesReservadas),
        },
      });
      await sincronizarListas(tx, pessoa.id, d);
      return pessoa;
    },
    cliente,
  ).catch(traduzirUnicidade);
}

export async function atualizarPessoa(usuario: UsuarioAtual, id: string, entrada: unknown, cliente: PrismaClient = prisma()) {
  exigirPermissao(usuario, "pessoa.editar");
  const d = esquemaPessoa.parse(entrada);
  return comUsuario(
    usuario.id,
    async (tx) => {
      const atual = await tx.pessoa.findFirst({ where: { id, excluidoEm: null } });
      if (!atual) throw new NaoEncontradoError("Pessoa não encontrada.");
      // Só recifra o que mudou; cifra nova a cada gravação poluiria o histórico.
      const hash = d.documento ? indiceBusca(d.documento.normalizado) : null;
      const rgAtual = decifrarOpcional(atual.rgCifrado);
      const reservadasAtuais = decifrarOpcional(atual.informacoesReservadasCifrado);
      const pessoa = await tx.pessoa.update({
        where: { id },
        data: {
          ...camposPessoa(d),
          ...(hash !== atual.cpfCnpjHash && {
            cpfCnpjHash: hash,
            cpfCnpjCifrado: d.documento ? cifrar(d.documento.formatado) : null,
          }),
          ...((d.rg ?? null) !== rgAtual && { rgCifrado: cifrarOpcional(d.rg) }),
          ...((d.informacoesReservadas ?? null) !== reservadasAtuais && {
            informacoesReservadasCifrado: cifrarOpcional(d.informacoesReservadas),
          }),
        },
      });
      await sincronizarListas(tx, id, d);
      return pessoa;
    },
    cliente,
  ).catch(traduzirUnicidade);
}

/** Dados decifrados para o formulário de edição. */
export async function obterPessoaParaEdicao(usuario: UsuarioAtual, id: string, cliente: PrismaClient = prisma()) {
  exigirPermissao(usuario, "pessoa.editar");
  const p = await cliente.pessoa.findFirst({ where: { id, excluidoEm: null }, include: { contatos: true, documentos: true } });
  if (!p) throw new NaoEncontradoError("Pessoa não encontrada.");
  await registrarAcesso(usuario, "pessoa", id, cliente);
  return decifrarPessoa(p);
}

function decifrarPessoa<
  D extends { numeroCifrado: string },
  T extends {
    cpfCnpjCifrado: string | null;
    rgCifrado: string | null;
    informacoesReservadasCifrado: string | null;
    documentos: D[];
  },
>(p: T & { documentos: D[] }) {
  const { cpfCnpjCifrado, rgCifrado, informacoesReservadasCifrado, documentos, ...resto } = p;
  return {
    ...resto,
    cpfCnpj: decifrarOpcional(cpfCnpjCifrado),
    rg: decifrarOpcional(rgCifrado),
    informacoesReservadas: decifrarOpcional(informacoesReservadasCifrado),
    documentos: documentos.map(({ numeroCifrado, ...d }) => ({ ...(d as Omit<D, "numeroCifrado">), numero: decifrar(numeroCifrado) })),
  };
}

const ENTIDADES_DA_PESSOA = ["contato", "documento_pessoa", "representante"];

/** Ficha do cliente (seção 5): dados, representantes, processos visíveis, histórico. */
export async function obterFichaCliente(usuario: UsuarioAtual, id: string, cliente: PrismaClient = prisma()) {
  const p = await cliente.pessoa.findFirst({
    where: { id, excluidoEm: null },
    include: {
      categoria: true,
      responsavel: { select: { nome: true } },
      contatos: { orderBy: { principal: "desc" } },
      documentos: true,
      representantes: { include: { pessoa: { select: { id: true, nome: true } } } },
      representa: { include: { representado: { select: { id: true, nome: true } } } },
    },
  });
  if (!p) throw new NaoEncontradoError("Pessoa não encontrada.");
  await registrarAcesso(usuario, "pessoa", id, cliente);

  const participacoes = await cliente.parteProcesso.findMany({
    where: { pessoaId: id, processo: { excluidoEm: null, AND: [filtroProcessosVisiveis(usuario)] } },
    include: {
      qualificacoes: true,
      processo: {
        include: {
          status: true,
          area: true,
          prazos: { where: { situacao: "ABERTO", excluidoEm: null }, orderBy: { dataFinalEfetiva: "asc" }, take: 1 },
          partes: { where: { pessoaId: { not: id } }, include: { pessoa: { select: { nome: true } } } },
        },
      },
    },
  });

  // Histórico da pessoa e dos registros ligados a ela (contatos, documentos, representantes).
  const ligados = await cliente.historico.findMany({
    where: {
      entidade: { in: ENTIDADES_DA_PESSOA },
      campo: { in: ["pessoaId", "representadoId"] },
      OR: [{ valorNovo: id }, { valorAnterior: id }],
    },
    select: { registroId: true },
  });
  const historico = await cliente.historico.findMany({
    where: {
      OR: [
        { entidade: "pessoa", registroId: id },
        { entidade: { in: ENTIDADES_DA_PESSOA }, registroId: { in: [...new Set(ligados.map((l) => l.registroId))] } },
      ],
    },
    include: { usuario: { select: { nome: true } } },
    orderBy: { id: "desc" },
    take: 300,
  });

  return { ...decifrarPessoa(p), participacoes, historico };
}

/** Busca por nome, CPF/CNPJ ou telefone (lista de clientes e escolha de partes). */
export async function buscarPessoas(
  termo: string,
  opcoes: { somenteClientes?: boolean } = {},
  cliente: PrismaClient = prisma(),
) {
  const t = termo.trim();
  const ou: Prisma.PessoaWhereInput[] = [];
  if (t) {
    ou.push({ nome: { contains: t, mode: "insensitive" } });
    const normalizado = normalizarDocumento(t);
    if (normalizado.length === 11 || normalizado.length === 14) ou.push({ cpfCnpjHash: indiceBusca(normalizado) });
    const digitos = soDigitos(t);
    if (digitos.length >= 4) ou.push({ contatos: { some: { valorBusca: { contains: digitos } } } });
  }
  return cliente.pessoa.findMany({
    where: { excluidoEm: null, ...(opcoes.somenteClientes && { ehCliente: true }), ...(ou.length && { OR: ou }) },
    include: { contatos: { where: { principal: true }, take: 1 }, categoria: true },
    orderBy: { nome: "asc" },
    take: 100,
  });
}

export const esquemaRepresentante = z.object({
  pessoaId: z.uuid("Escolha o representante."),
  qualidade: z.enum(["CURADOR", "INVENTARIANTE", "REPRESENTANTE_LEGAL", "SOCIO"]),
  observacoes: textoOpcional,
});

export async function adicionarRepresentante(usuario: UsuarioAtual, representadoId: string, entrada: unknown, cliente: PrismaClient = prisma()) {
  exigirPermissao(usuario, "pessoa.editar");
  const d = esquemaRepresentante.parse(entrada);
  if (d.pessoaId === representadoId) throw new RegraDeNegocioError("A pessoa não pode representar a si mesma.");
  return comUsuario(usuario.id, (tx) => tx.representante.create({ data: { ...d, representadoId } }), cliente).catch((e) => {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new RegraDeNegocioError("Este representante já está cadastrado com essa qualidade.");
    }
    throw e;
  });
}

export async function removerRepresentante(usuario: UsuarioAtual, id: string, cliente: PrismaClient = prisma()) {
  exigirPermissao(usuario, "pessoa.editar");
  return comUsuario(usuario.id, (tx) => tx.representante.delete({ where: { id } }), cliente);
}

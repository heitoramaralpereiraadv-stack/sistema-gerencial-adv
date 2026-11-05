// Carga inicial das tabelas de referência. Idempotente: pode rodar de novo sem duplicar.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@/generated/prisma/client";
import { TRIBUNAIS } from "@/dominio/cnj/tribunais";
import { feriadosPadrao } from "@/dominio/prazos/feriados-padrao";
import { paraDate } from "@/lib/hoje";
import type { Transacao } from "../db/prisma";

// Valores iniciais = aba Listas da planilha e seção 3 dos requisitos (A5, A6, A7, A15).
export const LISTAS_INICIAIS = {
  AREA: [
    "Bancário/Consumidor", "Previdenciário", "Família e Sucessões", "Cível", "Cível – Execução (defesa)",
    "Cível – Execução", "Execução Fiscal", "Trabalhista", "Agrário/Imobiliário", "Responsabilidade Civil",
    "Saúde", "Canônico (TEI-GO)",
  ],
  CATEGORIA_PARTE: ["Instituição financeira", "Seguradora", "Empresa"],
  QUALIFICACAO_PARTE: [
    "Autor", "Réu", "Exequente", "Executado", "Avalista", "Fiador", "Embargante", "Apelante", "Apelado",
    "Inventariante", "Depositário", "Requerente", "Reclamante", "Recorrente", "Arrendador",
    // Contrapartes, para a parte contrária na importação (C2: banco ou INSS é requerido).
    "Requerido", "Reclamado", "Recorrido", "Embargado", "Arrendatário",
  ],
  TIPO_ANDAMENTO: ["Publicação", "Intimação", "Decisão", "Sentença", "Audiência", "Juntada", "Outro"],
  CLASSE: [],
  TIPO_AUDIENCIA: [],
} as const;

export const STATUS_INICIAIS = [
  { nome: "A protocolar", comportamento: "ATIVO" },
  { nome: "Em andamento", comportamento: "ATIVO" },
  { nome: "Em grau de recurso", comportamento: "ATIVO" },
  { nome: "Cumprimento de sentença", comportamento: "ATIVO" },
  { nome: "Sobrestado", comportamento: "SUSPENSO_EXIGE_MOTIVO" },
  { nome: "Suspenso", comportamento: "SUSPENSO_EXIGE_MOTIVO" },
  { nome: "Acordo", comportamento: "CONCLUIDO_NAO_DEFINITIVO", resultado: "ACORDO" },
  { nome: "Encerrado — êxito", comportamento: "ENCERRADO_EXIGE_DATA", resultado: "EXITO" },
  { nome: "Encerrado — improcedente", comportamento: "ENCERRADO_EXIGE_DATA", resultado: "IMPROCEDENTE" },
  { nome: "Arquivado", comportamento: "ENCERRADO_EXIGE_DATA" },
] as const;

/** Dados informados pelos sócios (D7, 04 e 05/11/2026). */
export const ESCRITORIO = {
  razaoSocial: "Medeiros e Barbosa Sociedade de Advogados",
  cnpj: "24.605.755/0001-88",
  registroOab: "OAB/GO 001793",
  endereco: "Av. T-7, nº 371, Sala 1208, Ed. Lourenço Office, Setor Oeste, Goiânia/GO, CEP 74140-110",
  telefone: "(62) 3928-0055",
  email: "escritorio@medeirosebarbosa.com.br",
};

/** Logotipo enviado pelos sócios (public/logo-medeiros-barbosa.jpg), para o cabeçalho dos relatórios. */
export function logoDoEscritorio(): { logoBase64: string; logoTipo: string } | null {
  const arquivo = join(process.cwd(), "public", "logo-medeiros-barbosa.jpg");
  return existsSync(arquivo) ? { logoBase64: readFileSync(arquivo).toString("base64"), logoTipo: "image/jpeg" } : null;
}

const NOMES_TRIBUNAIS: Record<string, string> = { "4": "Tribunal Regional Federal", "5": "Tribunal Regional do Trabalho", "8": "Tribunal de Justiça" };

export async function cargaInicial(prisma: PrismaClient, anosFeriados: number[]) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.origem', 'seed', true)`;
      for (const t of TRIBUNAIS) {
        const nome = `${NOMES_TRIBUNAIS[t.segmento]} — ${t.sigla}`;
        const sede = { sedeCidade: t.sede.cidade, sedeUf: t.sede.uf };
        await tx.tribunal.upsert({
          where: { codigo: t.codigo },
          update: sede,
          create: { codigo: t.codigo, sigla: t.sigla, segmento: t.segmento, uf: t.uf, nome, ...sede },
        });
      }
      for (const [lista, valores] of Object.entries(LISTAS_INICIAIS)) {
        for (const [ordem, valor] of valores.entries()) {
          await tx.itemLista.upsert({
            where: { lista_valor: { lista: lista as keyof typeof LISTAS_INICIAIS, valor } },
            update: {},
            create: { lista: lista as keyof typeof LISTAS_INICIAIS, valor, ordem },
          });
        }
      }
      for (const [ordem, s] of STATUS_INICIAIS.entries()) {
        await tx.statusProcesso.upsert({ where: { nome: s.nome }, update: {}, create: { ...s, ordem } });
      }
      // Goiânia: código de origem 0051 do TJGO, conforme os números da planilha.
      await tx.comarca.upsert({
        where: { nome_uf: { nome: "Goiânia", uf: "GO" } },
        update: {},
        create: { nome: "Goiânia", uf: "GO", tribunalCodigo: "8.09", codigoOrigem: "0051" },
      });
      for (const ano of anosFeriados) await carregarFeriados(tx, ano);
      // Cabeçalho dos relatórios (D7): só cria; edições posteriores ficam em Configurações.
      await tx.configuracaoEscritorio.upsert({ where: { id: 1 }, update: {}, create: { id: 1, ...ESCRITORIO, ...logoDoEscritorio() } });
    },
    { timeout: 60_000 },
  );
}

/** Feriados padrão de um ano (B11). Não duplica nem altera os já cadastrados. */
export async function carregarFeriados(tx: Transacao, ano: number): Promise<number> {
  let incluidos = 0;
  for (const f of feriadosPadrao(ano)) {
    const comarca = f.comarca
      ? await tx.comarca.upsert({
          where: { nome_uf: f.comarca },
          update: {},
          create: f.comarca,
        })
      : null;
    const existe = await tx.feriado.findFirst({
      where: { data: paraDate(f.data), abrangencia: f.abrangencia, comarcaId: comarca?.id ?? null },
    });
    if (existe) continue;
    await tx.feriado.create({
      data: {
        data: paraDate(f.data),
        abrangencia: f.abrangencia,
        natureza: f.natureza,
        comarcaId: comarca?.id ?? null,
        uf: comarca ? f.comarca!.uf : null,
        descricao: f.descricao,
        fonte: f.fonte,
      },
    });
    incluidos++;
  }
  return incluidos;
}

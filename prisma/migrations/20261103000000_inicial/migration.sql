-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ADMINISTRADOR', 'ADVOGADO', 'ASSISTENTE');

-- CreateEnum
CREATE TYPE "TipoLista" AS ENUM ('AREA', 'CLASSE', 'TIPO_ANDAMENTO', 'CATEGORIA_PARTE', 'QUALIFICACAO_PARTE');

-- CreateEnum
CREATE TYPE "ComportamentoStatus" AS ENUM ('ATIVO', 'SUSPENSO_EXIGE_MOTIVO', 'CONCLUIDO_NAO_DEFINITIVO', 'ENCERRADO_EXIGE_DATA');

-- CreateEnum
CREATE TYPE "Resultado" AS ENUM ('EXITO', 'IMPROCEDENTE', 'ACORDO');

-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('PF', 'PJ', 'ESPOLIO', 'ENTE_PUBLICO');

-- CreateEnum
CREATE TYPE "SituacaoPessoa" AS ENUM ('ATIVO', 'INATIVO', 'PROSPECCAO');

-- CreateEnum
CREATE TYPE "TipoContato" AS ENUM ('TELEFONE', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "QualidadeRepresentacao" AS ENUM ('CURADOR', 'INVENTARIANTE', 'REPRESENTANTE_LEGAL', 'SOCIO');

-- CreateEnum
CREATE TYPE "Grau" AS ENUM ('PRIMEIRO', 'SEGUNDO', 'RECURSAL', 'SUPERIOR');

-- CreateEnum
CREATE TYPE "Polo" AS ENUM ('ATIVO', 'PASSIVO', 'TERCEIRO', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoVinculo" AS ENUM ('RECURSO', 'CUMPRIMENTO_SENTENCA', 'INCIDENTE', 'CONEXO', 'REPROPOSITURA', 'APENSO');

-- CreateEnum
CREATE TYPE "OrigemAndamento" AS ENUM ('MANUAL', 'DATAJUD');

-- CreateEnum
CREATE TYPE "FormaIntimacao" AS ENUM ('DJE', 'PORTAL_CONSULTA', 'PORTAL_TACITA');

-- CreateEnum
CREATE TYPE "TipoContagem" AS ENUM ('UTEIS', 'CORRIDOS');

-- CreateEnum
CREATE TYPE "SituacaoPrazo" AS ENUM ('ABERTO', 'CUMPRIDO', 'PERDIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "ModalidadeAudiencia" AS ENUM ('PRESENCIAL', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "Abrangencia" AS ENUM ('NACIONAL', 'ESTADUAL', 'MUNICIPAL', 'FORENSE');

-- CreateEnum
CREATE TYPE "NaturezaDia" AS ENUM ('FERIADO', 'INDISPONIBILIDADE');

-- CreateEnum
CREATE TYPE "Operacao" AS ENUM ('CRIACAO', 'ALTERACAO', 'EXCLUSAO');

-- CreateEnum
CREATE TYPE "SituacaoLote" AS ENUM ('EM_REVISAO', 'GRAVADO', 'DESCARTADO');

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL,
    "veTodosProcessos" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_lista" (
    "id" UUID NOT NULL,
    "lista" "TipoLista" NOT NULL,
    "valor" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "item_lista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_processo" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "comportamento" "ComportamentoStatus" NOT NULL,
    "resultado" "Resultado",
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "status_processo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tribunal" (
    "codigo" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "segmento" TEXT NOT NULL,
    "uf" CHAR(2),

    CONSTRAINT "tribunal_pkey" PRIMARY KEY ("codigo")
);

-- CreateTable
CREATE TABLE "comarca" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "tribunalCodigo" TEXT,
    "codigoOrigem" TEXT,

    CONSTRAINT "comarca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoa" (
    "id" UUID NOT NULL,
    "tipo" "TipoPessoa" NOT NULL,
    "nome" TEXT NOT NULL,
    "categoriaId" UUID,
    "cpfCnpjCifrado" TEXT,
    "cpfCnpjHash" TEXT,
    "rgCifrado" TEXT,
    "dataNascimento" DATE,
    "endereco" TEXT,
    "cidade" TEXT,
    "uf" CHAR(2),
    "ehCliente" BOOLEAN NOT NULL DEFAULT false,
    "situacao" "SituacaoPessoa",
    "dataEntrada" DATE,
    "responsavelId" UUID,
    "observacoes" TEXT,
    "cadastroIncompleto" BOOLEAN NOT NULL DEFAULT false,
    "pendencias" TEXT,
    "codigoLegado" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "excluidoEm" TIMESTAMPTZ(3),

    CONSTRAINT "pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contato" (
    "id" UUID NOT NULL,
    "pessoaId" UUID NOT NULL,
    "tipo" "TipoContato" NOT NULL,
    "valor" TEXT NOT NULL,
    "valorBusca" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "contato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "representante" (
    "id" UUID NOT NULL,
    "pessoaId" UUID NOT NULL,
    "representadoId" UUID NOT NULL,
    "qualidade" "QualidadeRepresentacao" NOT NULL,
    "observacoes" TEXT,

    CONSTRAINT "representante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processo" (
    "id" UUID NOT NULL,
    "numeroCnj" TEXT,
    "cnjAno" INTEGER,
    "cnjSegmento" CHAR(1),
    "cnjOrigem" CHAR(4),
    "tribunalCodigo" TEXT,
    "grau" "Grau",
    "orgaoJulgador" TEXT,
    "comarcaId" UUID,
    "areaId" UUID NOT NULL,
    "classeId" UUID,
    "assunto" TEXT,
    "dataDistribuicao" DATE,
    "dataCitacao" DATE,
    "valorCausa" DECIMAL(15,2),
    "statusId" UUID NOT NULL,
    "faseAtual" TEXT,
    "motivoSuspensao" TEXT,
    "dataSuspensao" DATE,
    "dataEncerramento" DATE,
    "resultado" "Resultado",
    "dataResultado" DATE,
    "segredoJustica" BOOLEAN NOT NULL DEFAULT false,
    "responsavelId" UUID NOT NULL,
    "observacoes" TEXT,
    "cadastroIncompleto" BOOLEAN NOT NULL DEFAULT false,
    "pendencias" TEXT,
    "codigoLegado" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "excluidoEm" TIMESTAMPTZ(3),

    CONSTRAINT "processo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parte_processo" (
    "id" UUID NOT NULL,
    "processoId" UUID NOT NULL,
    "pessoaId" UUID NOT NULL,
    "polo" "Polo" NOT NULL,
    "ehClienteDoEscritorio" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "parte_processo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vinculo_processo" (
    "id" UUID NOT NULL,
    "processoOrigemId" UUID NOT NULL,
    "processoVinculadoId" UUID NOT NULL,
    "tipo" "TipoVinculo" NOT NULL,
    "observacoes" TEXT,

    CONSTRAINT "vinculo_processo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "andamento" (
    "id" UUID NOT NULL,
    "processoId" UUID NOT NULL,
    "data" DATE NOT NULL,
    "tipoId" UUID NOT NULL,
    "descricao" TEXT NOT NULL,
    "origem" "OrigemAndamento" NOT NULL DEFAULT 'MANUAL',
    "usuarioId" UUID NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "excluidoEm" TIMESTAMPTZ(3),

    CONSTRAINT "andamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prazo" (
    "id" UUID NOT NULL,
    "processoId" UUID NOT NULL,
    "andamentoId" UUID,
    "descricao" TEXT NOT NULL,
    "dataReferencia" DATE NOT NULL,
    "formaIntimacao" "FormaIntimacao" NOT NULL,
    "quantidadeDias" INTEGER NOT NULL,
    "tipoContagem" "TipoContagem" NOT NULL,
    "emDobro" BOOLEAN NOT NULL DEFAULT false,
    "dataIntimacao" DATE NOT NULL,
    "dataInicio" DATE NOT NULL,
    "dataFinalCalculada" DATE NOT NULL,
    "dataFinalAjustada" DATE,
    "justificativaAjuste" TEXT,
    "memoriaCalculo" JSONB NOT NULL,
    "versaoMotor" TEXT NOT NULL,
    "conferidoPorId" UUID,
    "conferidoEm" TIMESTAMPTZ(3),
    "responsavelId" UUID NOT NULL,
    "situacao" "SituacaoPrazo" NOT NULL DEFAULT 'ABERTO',
    "cumpridoEm" DATE,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "excluidoEm" TIMESTAMPTZ(3),

    CONSTRAINT "prazo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audiencia" (
    "id" UUID NOT NULL,
    "processoId" UUID NOT NULL,
    "dataHora" TIMESTAMPTZ(3) NOT NULL,
    "tipo" TEXT NOT NULL,
    "modalidade" "ModalidadeAudiencia" NOT NULL,
    "localOuLink" TEXT,
    "responsavelId" UUID NOT NULL,
    "resultado" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "excluidoEm" TIMESTAMPTZ(3),

    CONSTRAINT "audiencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feriado" (
    "id" UUID NOT NULL,
    "data" DATE NOT NULL,
    "abrangencia" "Abrangencia" NOT NULL,
    "natureza" "NaturezaDia" NOT NULL DEFAULT 'FERIADO',
    "uf" CHAR(2),
    "comarcaId" UUID,
    "tribunalCodigo" TEXT,
    "descricao" TEXT NOT NULL,
    "fonte" TEXT,

    CONSTRAINT "feriado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico" (
    "id" BIGSERIAL NOT NULL,
    "entidade" TEXT NOT NULL,
    "registroId" TEXT NOT NULL,
    "operacao" "Operacao" NOT NULL,
    "campo" TEXT,
    "valorAnterior" TEXT,
    "valorNovo" TEXT,
    "usuarioId" UUID,
    "dataHora" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registro_acesso" (
    "id" BIGSERIAL NOT NULL,
    "usuarioId" UUID NOT NULL,
    "entidade" TEXT NOT NULL,
    "registroId" TEXT NOT NULL,
    "dataHora" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_acesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lote_importacao" (
    "id" UUID NOT NULL,
    "arquivo" TEXT NOT NULL,
    "hashArquivo" TEXT NOT NULL,
    "situacao" "SituacaoLote" NOT NULL DEFAULT 'EM_REVISAO',
    "proposta" JSONB NOT NULL,
    "relatorio" JSONB,
    "criadoPorId" UUID NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gravadoEm" TIMESTAMPTZ(3),

    CONSTRAINT "lote_importacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ParteQualificacao" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ParteQualificacao_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "item_lista_lista_valor_key" ON "item_lista"("lista", "valor");

-- CreateIndex
CREATE UNIQUE INDEX "status_processo_nome_key" ON "status_processo"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "tribunal_sigla_key" ON "tribunal"("sigla");

-- CreateIndex
CREATE UNIQUE INDEX "comarca_nome_uf_key" ON "comarca"("nome", "uf");

-- CreateIndex
CREATE UNIQUE INDEX "pessoa_cpfCnpjHash_key" ON "pessoa"("cpfCnpjHash");

-- CreateIndex
CREATE INDEX "pessoa_nome_idx" ON "pessoa"("nome");

-- CreateIndex
CREATE INDEX "pessoa_ehCliente_situacao_idx" ON "pessoa"("ehCliente", "situacao");

-- CreateIndex
CREATE INDEX "contato_valorBusca_idx" ON "contato"("valorBusca");

-- CreateIndex
CREATE UNIQUE INDEX "representante_pessoaId_representadoId_qualidade_key" ON "representante"("pessoaId", "representadoId", "qualidade");

-- CreateIndex
CREATE UNIQUE INDEX "processo_numeroCnj_key" ON "processo"("numeroCnj");

-- CreateIndex
CREATE INDEX "processo_statusId_idx" ON "processo"("statusId");

-- CreateIndex
CREATE INDEX "processo_areaId_idx" ON "processo"("areaId");

-- CreateIndex
CREATE INDEX "processo_responsavelId_idx" ON "processo"("responsavelId");

-- CreateIndex
CREATE INDEX "processo_tribunalCodigo_comarcaId_idx" ON "processo"("tribunalCodigo", "comarcaId");

-- CreateIndex
CREATE INDEX "parte_processo_pessoaId_idx" ON "parte_processo"("pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "parte_processo_processoId_pessoaId_polo_key" ON "parte_processo"("processoId", "pessoaId", "polo");

-- CreateIndex
CREATE UNIQUE INDEX "vinculo_processo_processoOrigemId_processoVinculadoId_tipo_key" ON "vinculo_processo"("processoOrigemId", "processoVinculadoId", "tipo");

-- CreateIndex
CREATE INDEX "andamento_processoId_data_idx" ON "andamento"("processoId", "data" DESC);

-- CreateIndex
CREATE INDEX "prazo_responsavelId_situacao_dataFinalCalculada_idx" ON "prazo"("responsavelId", "situacao", "dataFinalCalculada");

-- CreateIndex
CREATE INDEX "prazo_processoId_idx" ON "prazo"("processoId");

-- CreateIndex
CREATE INDEX "audiencia_responsavelId_dataHora_idx" ON "audiencia"("responsavelId", "dataHora");

-- CreateIndex
CREATE INDEX "feriado_data_idx" ON "feriado"("data");

-- CreateIndex
CREATE INDEX "historico_entidade_registroId_dataHora_idx" ON "historico"("entidade", "registroId", "dataHora" DESC);

-- CreateIndex
CREATE INDEX "registro_acesso_entidade_registroId_idx" ON "registro_acesso"("entidade", "registroId");

-- CreateIndex
CREATE INDEX "_ParteQualificacao_B_index" ON "_ParteQualificacao"("B");

-- AddForeignKey
ALTER TABLE "comarca" ADD CONSTRAINT "comarca_tribunalCodigo_fkey" FOREIGN KEY ("tribunalCodigo") REFERENCES "tribunal"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoa" ADD CONSTRAINT "pessoa_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "item_lista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoa" ADD CONSTRAINT "pessoa_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contato" ADD CONSTRAINT "contato_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "representante" ADD CONSTRAINT "representante_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "representante" ADD CONSTRAINT "representante_representadoId_fkey" FOREIGN KEY ("representadoId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processo" ADD CONSTRAINT "processo_tribunalCodigo_fkey" FOREIGN KEY ("tribunalCodigo") REFERENCES "tribunal"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processo" ADD CONSTRAINT "processo_comarcaId_fkey" FOREIGN KEY ("comarcaId") REFERENCES "comarca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processo" ADD CONSTRAINT "processo_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "item_lista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processo" ADD CONSTRAINT "processo_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "item_lista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processo" ADD CONSTRAINT "processo_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "status_processo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processo" ADD CONSTRAINT "processo_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parte_processo" ADD CONSTRAINT "parte_processo_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parte_processo" ADD CONSTRAINT "parte_processo_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculo_processo" ADD CONSTRAINT "vinculo_processo_processoOrigemId_fkey" FOREIGN KEY ("processoOrigemId") REFERENCES "processo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculo_processo" ADD CONSTRAINT "vinculo_processo_processoVinculadoId_fkey" FOREIGN KEY ("processoVinculadoId") REFERENCES "processo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "andamento" ADD CONSTRAINT "andamento_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "andamento" ADD CONSTRAINT "andamento_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "item_lista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "andamento" ADD CONSTRAINT "andamento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prazo" ADD CONSTRAINT "prazo_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prazo" ADD CONSTRAINT "prazo_andamentoId_fkey" FOREIGN KEY ("andamentoId") REFERENCES "andamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prazo" ADD CONSTRAINT "prazo_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prazo" ADD CONSTRAINT "prazo_conferidoPorId_fkey" FOREIGN KEY ("conferidoPorId") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audiencia" ADD CONSTRAINT "audiencia_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audiencia" ADD CONSTRAINT "audiencia_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feriado" ADD CONSTRAINT "feriado_comarcaId_fkey" FOREIGN KEY ("comarcaId") REFERENCES "comarca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feriado" ADD CONSTRAINT "feriado_tribunalCodigo_fkey" FOREIGN KEY ("tribunalCodigo") REFERENCES "tribunal"("codigo") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico" ADD CONSTRAINT "historico_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_acesso" ADD CONSTRAINT "registro_acesso_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_importacao" ADD CONSTRAINT "lote_importacao_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ParteQualificacao" ADD CONSTRAINT "_ParteQualificacao_A_fkey" FOREIGN KEY ("A") REFERENCES "item_lista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ParteQualificacao" ADD CONSTRAINT "_ParteQualificacao_B_fkey" FOREIGN KEY ("B") REFERENCES "parte_processo"("id") ON DELETE CASCADE ON UPDATE CASCADE;


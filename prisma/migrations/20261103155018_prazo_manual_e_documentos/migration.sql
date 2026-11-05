/*
  Warnings:

  - Added the required column `dataFinalEfetiva` to the `prazo` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('CNH', 'CTPS', 'PIS_NIT_PASEP', 'TITULO_ELEITOR', 'PASSAPORTE', 'CERTIDAO', 'NUMERO_BENEFICIO', 'INSCRICAO_ESTADUAL', 'INSCRICAO_MUNICIPAL', 'OUTRO');

-- CreateEnum
CREATE TYPE "ModoCalculo" AS ENUM ('AUTOMATICO', 'MANUAL');

-- AlterEnum
ALTER TYPE "FormaIntimacao" ADD VALUE 'DATA_INFORMADA';

-- DropIndex
DROP INDEX "prazo_responsavelId_situacao_dataFinalCalculada_idx";

-- AlterTable
ALTER TABLE "pessoa" ADD COLUMN     "informacoesReservadasCifrado" TEXT;

-- AlterTable
ALTER TABLE "prazo" ADD COLUMN     "dataFinalEfetiva" DATE NOT NULL,
ADD COLUMN     "dataFinalManual" DATE,
ADD COLUMN     "formaIntimacaoDetalhe" TEXT,
ADD COLUMN     "justificativaManual" TEXT,
ADD COLUMN     "modoCalculo" "ModoCalculo" NOT NULL DEFAULT 'AUTOMATICO',
ADD COLUMN     "pendenciaRegra" TEXT,
ALTER COLUMN "dataIntimacao" DROP NOT NULL,
ALTER COLUMN "dataInicio" DROP NOT NULL,
ALTER COLUMN "dataFinalCalculada" DROP NOT NULL;

-- CreateTable
CREATE TABLE "documento_pessoa" (
    "id" UUID NOT NULL,
    "pessoaId" UUID NOT NULL,
    "tipo" "TipoDocumento" NOT NULL,
    "numeroCifrado" TEXT NOT NULL,
    "numeroHash" TEXT NOT NULL,
    "descricao" TEXT,

    CONSTRAINT "documento_pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documento_pessoa_numeroHash_idx" ON "documento_pessoa"("numeroHash");

-- CreateIndex
CREATE INDEX "prazo_responsavelId_situacao_dataFinalEfetiva_idx" ON "prazo"("responsavelId", "situacao", "dataFinalEfetiva");

-- AddForeignKey
ALTER TABLE "documento_pessoa" ADD CONSTRAINT "documento_pessoa_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Segurança e auditoria da nova tabela (mesmas regras da migração seguranca_auditoria).
ALTER TABLE "documento_pessoa" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON "documento_pessoa" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON "documento_pessoa" FROM authenticated; END IF;
END $$;
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON "documento_pessoa"
  FOR EACH ROW EXECUTE FUNCTION auditar();

-- Prazo automático tem data calculada; prazo manual tem data informada (D11).
ALTER TABLE prazo ADD CONSTRAINT prazo_modo_calculo CHECK (
  ("modoCalculo" = 'AUTOMATICO' AND "dataFinalCalculada" IS NOT NULL)
  OR ("modoCalculo" = 'MANUAL' AND "dataFinalManual" IS NOT NULL)
);
-- A data efetiva é sempre a de maior precedência: ajustada, manual, calculada.
ALTER TABLE prazo ADD CONSTRAINT prazo_data_efetiva CHECK (
  "dataFinalEfetiva" = coalesce("dataFinalAjustada", "dataFinalManual", "dataFinalCalculada")
);

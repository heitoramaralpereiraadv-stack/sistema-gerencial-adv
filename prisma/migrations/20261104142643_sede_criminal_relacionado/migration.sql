-- AlterEnum
ALTER TYPE "TipoVinculo" ADD VALUE 'RELACIONADO';

-- AlterTable
ALTER TABLE "prazo" ADD COLUMN     "criminal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tribunal" ADD COLUMN     "sedeCidade" TEXT,
ADD COLUMN     "sedeUf" CHAR(2);

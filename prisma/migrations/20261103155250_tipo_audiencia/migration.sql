/*
  Warnings:

  - You are about to drop the column `tipo` on the `audiencia` table. All the data in the column will be lost.
  - Added the required column `tipoId` to the `audiencia` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "TipoLista" ADD VALUE 'TIPO_AUDIENCIA';

-- AlterTable
ALTER TABLE "audiencia" DROP COLUMN "tipo",
ADD COLUMN     "tipoId" UUID NOT NULL;

-- AddForeignKey
ALTER TABLE "audiencia" ADD CONSTRAINT "audiencia_tipoId_fkey" FOREIGN KEY ("tipoId") REFERENCES "item_lista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

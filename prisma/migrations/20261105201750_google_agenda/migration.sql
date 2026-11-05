-- AlterTable
ALTER TABLE "audiencia" ADD COLUMN     "uidExterno" TEXT;

-- AlterTable
ALTER TABLE "configuracao_escritorio" ADD COLUMN     "agendaTokenCifrado" TEXT,
ADD COLUMN     "agendaTokenCriadoEm" TIMESTAMPTZ(3),
ADD COLUMN     "agendaTokenHash" TEXT;

-- CreateTable
CREATE TABLE "compromisso" (
    "id" UUID NOT NULL,
    "processoId" UUID,
    "titulo" TEXT NOT NULL,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fim" TIMESTAMPTZ(3),
    "diaInteiro" BOOLEAN NOT NULL DEFAULT false,
    "local" TEXT,
    "descricao" TEXT,
    "responsavelId" UUID NOT NULL,
    "uidExterno" TEXT,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,
    "excluidoEm" TIMESTAMPTZ(3),

    CONSTRAINT "compromisso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lote_agenda" (
    "id" UUID NOT NULL,
    "arquivo" TEXT NOT NULL,
    "situacao" "SituacaoLote" NOT NULL DEFAULT 'EM_REVISAO',
    "eventos" JSONB NOT NULL,
    "decisoes" JSONB,
    "revisadoEm" TIMESTAMPTZ(3),
    "relatorio" JSONB,
    "criadoPorId" UUID NOT NULL,
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gravadoEm" TIMESTAMPTZ(3),

    CONSTRAINT "lote_agenda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compromisso_responsavelId_inicio_idx" ON "compromisso"("responsavelId", "inicio");

-- CreateIndex
CREATE INDEX "compromisso_processoId_idx" ON "compromisso"("processoId");

-- CreateIndex
CREATE INDEX "compromisso_uidExterno_idx" ON "compromisso"("uidExterno");

-- CreateIndex
CREATE INDEX "audiencia_uidExterno_idx" ON "audiencia"("uidExterno");

-- AddForeignKey
ALTER TABLE "compromisso" ADD CONSTRAINT "compromisso_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "processo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compromisso" ADD CONSTRAINT "compromisso_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lote_agenda" ADD CONSTRAINT "lote_agenda_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Segurança (como nas demais tabelas): RLS sem políticas e nenhum privilégio para a API pública.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['compromisso', 'lote_agenda'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon', t); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t); END IF;
  END LOOP;
END $$;

-- Histórico de toda alteração e exclusão física bloqueada (só exclusão lógica).
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON "compromisso"
  FOR EACH ROW EXECUTE FUNCTION auditar();
CREATE TRIGGER bloquear_exclusao_fisica BEFORE DELETE ON "compromisso"
  FOR EACH ROW EXECUTE FUNCTION bloquear_exclusao_fisica();

ALTER TABLE "compromisso" ADD CONSTRAINT compromisso_fim_depois_do_inicio CHECK ("fim" IS NULL OR "fim" >= "inicio");

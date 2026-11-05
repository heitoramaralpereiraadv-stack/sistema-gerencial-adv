-- CreateTable
CREATE TABLE "configuracao_escritorio" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "razaoSocial" TEXT NOT NULL DEFAULT 'Medeiros e Barbosa Sociedade de Advogados',
    "cnpj" TEXT,
    "registroOab" TEXT,
    "endereco" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "logoBase64" TEXT,
    "logoTipo" TEXT,
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "configuracao_escritorio_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "configuracao_escritorio" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON "configuracao_escritorio" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON "configuracao_escritorio" FROM authenticated; END IF;
END $$;
ALTER TABLE "configuracao_escritorio" ADD CONSTRAINT configuracao_unica CHECK (id = 1);
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON "configuracao_escritorio"
  FOR EACH ROW EXECUTE FUNCTION auditar();

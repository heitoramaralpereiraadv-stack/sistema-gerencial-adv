-- Segurança e auditoria (requisitos, seções 2 e 7).
--
-- 1. Nenhum acesso pela API pública do Supabase: RLS ligado sem políticas e privilégios
--    revogados de anon/authenticated. Os dados só passam pelo servidor da aplicação.
-- 2. Histórico gravado por trigger: toda criação, alteração e exclusão, com usuário e data,
--    inclusive alterações que não venham das telas. Escrita sem usuário identificado é recusada.
-- 3. Histórico e registro de acessos são somente leitura.
-- 4. Exclusão física de pessoa, processo, andamento, prazo e audiência é bloqueada
--    (exclusão é lógica); só passa com autorização explícita de exclusão LGPD.
-- 5. Data final ajustada exige justificativa.

-- 1. API pública fechada ------------------------------------------------------------------

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated;
  END IF;
END $$;

-- 2. Histórico ---------------------------------------------------------------------------

-- A aplicação informa o usuário em cada transação: set_config('app.usuario_id', <uuid>, true).
-- Cargas iniciais sem usuário (seed) informam set_config('app.origem', 'seed', true).
CREATE OR REPLACE FUNCTION auditar() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_usuario uuid := nullif(current_setting('app.usuario_id', true), '')::uuid;
  v_origem  text := nullif(current_setting('app.origem', true), '');
  v_antigo  jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_novo    jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  v_linha   jsonb := coalesce(v_novo, v_antigo);
  v_registro text;
  v_operacao "Operacao";
  v_campo   text;
  v_anterior text;
  v_atual   text;
BEGIN
  IF v_usuario IS NULL AND v_origem IS NULL THEN
    RAISE EXCEPTION 'Alteração em % sem usuário identificado', TG_TABLE_NAME
      USING ERRCODE = 'P0001', HINT = 'Use comUsuario() no servidor.';
  END IF;

  v_registro := coalesce(v_linha ->> 'id', concat_ws(':', v_linha ->> 'A', v_linha ->> 'B'));
  v_operacao := CASE
    WHEN TG_OP = 'INSERT' THEN 'CRIACAO'
    WHEN TG_OP = 'DELETE' THEN 'EXCLUSAO'
    WHEN v_antigo ->> 'excluidoEm' IS NULL AND v_novo ->> 'excluidoEm' IS NOT NULL THEN 'EXCLUSAO'
    ELSE 'ALTERACAO'
  END::"Operacao";

  FOR v_campo IN SELECT jsonb_object_keys(v_linha) LOOP
    CONTINUE WHEN v_campo IN ('criadoEm', 'atualizadoEm');
    v_anterior := v_antigo ->> v_campo;
    v_atual := v_novo ->> v_campo;
    CONTINUE WHEN TG_OP = 'UPDATE' AND v_anterior IS NOT DISTINCT FROM v_atual;
    CONTINUE WHEN TG_OP = 'INSERT' AND v_atual IS NULL;
    CONTINUE WHEN TG_OP = 'DELETE' AND v_anterior IS NULL;
    -- Campos cifrados (CPF, RG…) não vão para o histórico em claro nem cifrados.
    IF v_campo LIKE '%Cifrado' OR v_campo LIKE '%Hash' THEN
      v_anterior := CASE WHEN v_anterior IS NULL THEN NULL ELSE '[protegido]' END;
      v_atual := CASE WHEN v_atual IS NULL THEN NULL ELSE '[protegido]' END;
    END IF;
    INSERT INTO historico (entidade, "registroId", operacao, campo, "valorAnterior", "valorNovo", "usuarioId")
    VALUES (TG_TABLE_NAME, v_registro, v_operacao, v_campo, v_anterior, v_atual, v_usuario);
  END LOOP;
  RETURN NULL;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'usuario', 'item_lista', 'status_processo', 'tribunal', 'comarca', 'pessoa', 'contato',
    'representante', 'processo', 'parte_processo', '_ParteQualificacao', 'vinculo_processo',
    'andamento', 'prazo', 'audiencia', 'feriado'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION auditar()', t);
  END LOOP;
END $$;

-- 3. Histórico e acessos somente leitura ------------------------------------------------

CREATE OR REPLACE FUNCTION somente_leitura() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% é somente leitura', TG_TABLE_NAME USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER somente_leitura BEFORE UPDATE OR DELETE ON historico
  FOR EACH ROW EXECUTE FUNCTION somente_leitura();
CREATE TRIGGER somente_leitura BEFORE UPDATE OR DELETE ON registro_acesso
  FOR EACH ROW EXECUTE FUNCTION somente_leitura();
CREATE TRIGGER somente_leitura_truncate BEFORE TRUNCATE ON historico
  FOR EACH STATEMENT EXECUTE FUNCTION somente_leitura();
CREATE TRIGGER somente_leitura_truncate BEFORE TRUNCATE ON registro_acesso
  FOR EACH STATEMENT EXECUTE FUNCTION somente_leitura();

-- 4. Exclusão física bloqueada ------------------------------------------------------------

CREATE OR REPLACE FUNCTION bloquear_exclusao_fisica() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.exclusao_fisica', true) IS DISTINCT FROM 'lgpd' THEN
    RAISE EXCEPTION 'Exclusão física de % não permitida: use a exclusão lógica', TG_TABLE_NAME
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pessoa', 'processo', 'andamento', 'prazo', 'audiencia'] LOOP
    EXECUTE format(
      'CREATE TRIGGER bloquear_exclusao_fisica BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION bloquear_exclusao_fisica()', t);
  END LOOP;
END $$;

-- 5. Data final ajustada exige justificativa (seção 3) ------------------------------------

ALTER TABLE prazo ADD CONSTRAINT prazo_ajuste_justificado
  CHECK ("dataFinalAjustada" IS NULL OR length(btrim(coalesce("justificativaAjuste", ''))) > 0);

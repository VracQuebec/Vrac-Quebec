
CREATE OR REPLACE FUNCTION public.jsc_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_changed text[] := '{}';
  v_old_diff jsonb := '{}'::jsonb;
  v_new_diff jsonb := '{}'::jsonb;
  v_action text := lower(TG_OP);
  v_key text;
  v_record_id uuid;
  v_company uuid;
  v_label text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_key IN ('updated_at') THEN CONTINUE; END IF;
      IF (v_old -> v_key) IS DISTINCT FROM (v_new -> v_key) THEN
        v_changed := v_changed || v_key;
        v_old_diff := v_old_diff || jsonb_build_object(v_key, v_old -> v_key);
        v_new_diff := v_new_diff || jsonb_build_object(v_key, v_new -> v_key);
      END IF;
    END LOOP;
    IF array_length(v_changed, 1) IS NULL THEN
      RETURN NEW;
    END IF;
    IF v_old ? 'archived_at' THEN
      IF (v_old ->> 'archived_at') IS NULL AND (v_new ->> 'archived_at') IS NOT NULL THEN
        v_action := 'archive';
      ELSIF (v_old ->> 'archived_at') IS NOT NULL AND (v_new ->> 'archived_at') IS NULL THEN
        v_action := 'restore';
      END IF;
    END IF;
  ELSE
    v_old_diff := v_old;
    v_new_diff := v_new;
  END IF;

  v_record_id := NULLIF(COALESCE(v_new ->> 'id', v_old ->> 'id'), '')::uuid;
  BEGIN
    v_company := NULLIF(COALESCE(v_new ->> 'company_id', v_old ->> 'company_id'), '')::uuid;
  EXCEPTION WHEN others THEN v_company := NULL;
  END;
  v_label := COALESCE(
    v_new ->> 'name', v_old ->> 'name',
    v_new ->> 'key', v_old ->> 'key',
    v_new ->> 'title', v_old ->> 'title',
    v_new ->> 'request_number', v_old ->> 'request_number',
    v_new ->> 'quote_number', v_old ->> 'quote_number',
    v_new ->> 'order_number', v_old ->> 'order_number',
    v_new ->> 'invoice_number', v_old ->> 'invoice_number',
    NULLIF(trim(COALESCE(v_new ->> 'first_name', v_old ->> 'first_name', '') || ' ' ||
                COALESCE(v_new ->> 'last_name', v_old ->> 'last_name', '')), ''),
    v_new ->> 'description', v_old ->> 'description'
  );

  INSERT INTO public.jsc_audit_log (
    company_id, table_name, record_id, record_label, action,
    actor_id, actor_email, changed_fields, old_values, new_values,
    entity_type, entity_id
  ) VALUES (
    v_company, TG_TABLE_NAME, v_record_id, v_label, v_action,
    auth.uid(), NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email',
    v_changed, v_old_diff, v_new_diff,
    TG_TABLE_NAME, v_record_id
  );

  RETURN COALESCE(NEW, OLD);
END $function$;

REVOKE EXECUTE ON FUNCTION public.jsc_next_number(uuid, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.jsc_assign_number() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.jsc_log_event(text, text, uuid, text, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.jsc_log_event(text, text, uuid, text, jsonb) TO authenticated, service_role;

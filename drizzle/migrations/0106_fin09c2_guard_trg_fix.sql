-- FIN-09C2 : le déclencheur commun ne lit status que sur les notes de crédit (les encaissements n'ont pas cette colonne).
CREATE OR REPLACE FUNCTION public.fin_retention_guard_trg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'fin_credit_notes' THEN
    IF to_jsonb(NEW)->>'status' IS DISTINCT FROM 'emise' THEN RETURN NEW; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM fin_retentions WHERE invoice_id = NEW.invoice_id AND status = 'active') THEN
    PERFORM public.fin_retention_check(NEW.invoice_id);
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.fin_retention_guard_trg() FROM PUBLIC, anon, authenticated;

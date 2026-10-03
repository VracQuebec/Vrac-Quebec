CREATE OR REPLACE FUNCTION public.fin_transfers_done_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.gl_entry_id IS NOT NULL AND (NEW.amount IS DISTINCT FROM OLD.amount OR NEW.from_account IS DISTINCT FROM OLD.from_account OR NEW.to_account IS DISTINCT FROM OLD.to_account OR NEW.archived_at IS DISTINCT FROM OLD.archived_at OR NEW.gl_entry_id IS DISTINCT FROM OLD.gl_entry_id OR NEW.done_on IS DISTINCT FROM OLD.done_on) THEN
    RAISE EXCEPTION 'Virement effectué et comptabilisé : correction par contrepassation de l''écriture' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fin_transfers_done_guard ON public.fin_transfers;
CREATE TRIGGER fin_transfers_done_guard BEFORE UPDATE ON public.fin_transfers FOR EACH ROW EXECUTE FUNCTION public.fin_transfers_done_guard();
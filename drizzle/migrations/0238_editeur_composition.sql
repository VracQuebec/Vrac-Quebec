-- PREPARED ONLY. Load before INSTALLATION-NON-APPLIQUEE.sql.
-- Exact columns/states from prepared/exec01b/coordination.sql; no new capacity ledger.
CREATE FUNCTION public.workbench_invalidate_reservations(_id uuid,_company uuid,_operation uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record;
BEGIN
 IF auth.uid() IS NULL OR NOT public.workbench_manager(_company) THEN RAISE EXCEPTION 'Entreprise non autorisée' USING ERRCODE='42501';END IF;
 -- Lock both endpoints in UUID order: editing a source also invalidates its offer agreements.
 FOR r IN SELECT id FROM public.submissions WHERE id=_id OR id IN (
   SELECT submission_id FROM public.submission_reception_reservations WHERE origin_submission_id=_id
 ) ORDER BY id LOOP PERFORM 1 FROM public.submissions WHERE id=r.id FOR UPDATE; END LOOP;
 FOR r IN SELECT * FROM public.submission_reception_reservations
   WHERE (submission_id=_id OR origin_submission_id=_id) AND state IN ('pending','reserved','counter') ORDER BY id FOR UPDATE LOOP
   INSERT INTO public.ent_crm_history(company_id,entity,entity_id,action,before,after,actor_id,origin)
   VALUES(_company,'submission_reservation',_id,'accord_a_revalider',to_jsonb(r),jsonb_build_object('reservation_id',r.id,'operation',_operation,'state','exception'),auth.uid(),'entrepreneur');
   -- exception is non-reservable/non-deliverable until a new explicit proposal;
   -- remaining and measured/debited quantity are NEVER changed here.
   UPDATE public.submission_reception_reservations SET state='exception',
     accepted_history=accepted_history||CASE WHEN conditions_snapshot IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(conditions_snapshot) END,
     accepted_at=NULL,conditions_snapshot=NULL WHERE id=r.id;
   PERFORM public.exec02_exception(r.submission_id,'Demande modifiée après proposition ou accord','Requalifier et obtenir une nouvelle proposition explicite',r.id);
 END LOOP;
END$$;
REVOKE ALL ON FUNCTION public.workbench_invalidate_reservations(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workbench_invalidate_reservations(uuid,uuid,uuid) TO service_role;
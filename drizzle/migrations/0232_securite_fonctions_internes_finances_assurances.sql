-- Aides internes : appelées seulement par d'autres fonctions privilégiées (exécutées par leur propriétaire). Aucun écran, règle d'accès ni fonction appelante ne dépend du droit client.
REVOKE EXECUTE ON FUNCTION public.fin_credit_refunded(uuid), public.fin_scr_avail(uuid), public.fin_credit_allocated(uuid), public.fin_exp_member(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_credit_refunded(uuid), public.fin_scr_avail(uuid), public.fin_credit_allocated(uuid), public.fin_exp_member(uuid,uuid) TO service_role;

-- Continuité d'assurance : lecture limitée aux personnes autorisées sur l'entreprise de la période.
CREATE OR REPLACE FUNCTION public.asr_continuity(_period uuid)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE o asr_periods; n asr_periods;
BEGIN
  SELECT * INTO o FROM asr_periods WHERE id=_period;
  IF o.id IS NULL OR NOT public.asr_can_read(o.company_id) THEN RETURN NULL; END IF;
  SELECT * INTO n FROM asr_periods WHERE previous_id=_period AND confirmed_at IS NOT NULL ORDER BY effective_from NULLS LAST LIMIT 1;
  IF n.id IS NULL THEN RETURN 'non_documentee'; END IF;
  IF o.expires_on IS NULL OR n.effective_from IS NULL THEN RETURN 'a_confirmer'; END IF;
  IF n.effective_from < o.expires_on THEN RETURN 'documentee'; END IF;
  IF n.effective_from > o.expires_on THEN RETURN 'intervalle'; END IF;
  IF o.expires_time IS NULL OR n.effective_time IS NULL THEN RETURN 'a_confirmer'; END IF;
  RETURN CASE WHEN n.effective_time <= o.expires_time THEN 'documentee' ELSE 'intervalle' END;
END $function$;
REVOKE EXECUTE ON FUNCTION public.asr_continuity(uuid), public.asr_driver_doc_ok(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asr_continuity(uuid), public.asr_driver_doc_ok(uuid) TO authenticated, service_role;
-- PRÉPARÉE UNIQUEMENT. Prérequis : M1 guard_* et M2 colonnes/index.
-- RPC distincte : les anciens appelants de guard_claim restent inchangés.
-- Une réservation non résolue reste une barrière, même après 30 minutes.
-- Le temps écoulé ne constitue jamais une preuve de non-insertion.
CREATE OR REPLACE FUNCTION public.guard_claim_durable(
 p_scope text,p_identity text,p_fingerprint text,p_payload jsonb DEFAULT '{}'::jsonb,
 p_dedupe_minutes integer DEFAULT 30,p_pending_seconds integer DEFAULT 600
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; v_id uuid;
BEGIN
 PERFORM public.guard_validate_params(p_scope,p_identity,p_fingerprint,p_dedupe_minutes);
 IF p_pending_seconds IS NULL OR p_pending_seconds<10 OR p_pending_seconds>3600
 OR (p_payload IS NOT NULL AND jsonb_typeof(p_payload)<>'object') THEN
  RAISE EXCEPTION 'guard: paramètres invalides' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_scope||'|'||p_fingerprint,0));
 SELECT id,payload,created_at INTO r FROM public.public_request_guard
 WHERE scope=p_scope AND fingerprint=p_fingerprint AND payload->>'state'='pending'
 ORDER BY created_at ASC,id ASC LIMIT 1;
 IF FOUND THEN
  RETURN jsonb_build_object('state','in_progress','claim_id',r.id,
   'stale_claim_id',CASE WHEN r.created_at<=now()-make_interval(secs=>p_pending_seconds) THEN r.id ELSE NULL END,
   'stale_at',r.created_at);
 END IF;
 SELECT id,payload,created_at INTO r FROM public.public_request_guard
 WHERE scope=p_scope AND fingerprint=p_fingerprint AND payload->>'state'='done'
 AND created_at>=now()-make_interval(mins=>p_dedupe_minutes)
 ORDER BY created_at DESC,id DESC LIMIT 1;
 IF FOUND THEN
  RETURN jsonb_build_object('state','duplicate','claim_id',r.id,'result',r.payload->'result');
 END IF;
 INSERT INTO public.public_request_guard(scope,identity,fingerprint,payload)
 VALUES(p_scope,p_identity,p_fingerprint,coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('state','pending'))
 RETURNING id INTO v_id;
 RETURN jsonb_build_object('state','new','claim_id',v_id);
END $$;
REVOKE ALL ON FUNCTION public.guard_claim_durable(text,text,text,jsonb,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_claim_durable(text,text,text,jsonb,integer,integer) TO service_role;
-- Retour opérationnel : ancien paquet de code, conserver M1/M2 et cette RPC.
-- Aucune suppression de fonction, index, réservation ou dossier dans ce lot.
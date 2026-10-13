
ALTER TABLE public.seo_pipeline_runs ADD COLUMN IF NOT EXISTS pause_reason text;
ALTER TABLE public.seo_pipeline_runs ADD COLUMN IF NOT EXISTS credits_at_start numeric;
ALTER TABLE public.seo_page_tasks ADD COLUMN IF NOT EXISTS outcome text;

-- Une seule tâche par combinaison et par traitement automatique (aucun doublon, reprise sûre).
CREATE UNIQUE INDEX IF NOT EXISTS seo_page_tasks_auto_unique
  ON public.seo_page_tasks (run_id, city_slug, coalesce(material_slug,''), coalesce(service_slug,''))
  WHERE kind LIKE 'auto_%';

-- Verrou global conservé : seul START (ou Reprendre du traitement automatique) peut le franchir, pour le mode « complete ».
CREATE OR REPLACE FUNCTION public.seo_pipeline_runs_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('queued','running')
     AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('queued','running'))
     AND EXISTS (SELECT 1 FROM public.seo_pipeline_guard WHERE global_disabled)
     AND NOT (NEW.mode = 'complete' AND current_setting('seo.autopilot_ok', true) = 'on') THEN
    RAISE EXCEPTION 'Génération globale désactivée : démarrage, reprise et relance refusés (autorisation explicite requise).';
  END IF;
  RETURN NEW;
END $function$;

-- Résumé du travail prévu (lecture seule).
CREATE OR REPLACE FUNCTION public.seo_autopilot_preview()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '60s'
AS $function$
DECLARE _r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  WITH c AS (
    SELECT s.*, p.status AS page_status, p.noindex_volontaire
    FROM public.seo_city_slots_catalog(NULL) s
    LEFT JOIN LATERAL (
      SELECT p.status, p.noindex_volontaire FROM public.seo_pages p
       WHERE p.city_slug = s.city_slug AND p.material_slug IS NOT DISTINCT FROM s.material_slug
         AND p.service_slug IS NOT DISTINCT FROM s.service_slug
       ORDER BY (p.status = 'published') DESC, p.updated_at DESC LIMIT 1) p ON true
    WHERE public.seo_city_is_generable(s.city_slug)
  )
  SELECT jsonb_build_object(
    'cities', count(DISTINCT city_slug),
    'combinations', count(*),
    'published', count(*) FILTER (WHERE page_status = 'published'),
    'to_generate', count(*) FILTER (WHERE page_status IS NULL AND availability = 'confirmee'),
    'drafts_to_finish', count(*) FILTER (WHERE page_status IS NOT NULL AND page_status <> 'published' AND availability = 'confirmee'),
    'drafts_waiting', count(*) FILTER (WHERE page_status IS NOT NULL AND page_status <> 'published' AND availability <> 'confirmee'),
    'waiting_evidence', count(*) FILTER (WHERE page_status IS NULL AND availability = 'inconnue'),
    'excluded', count(*) FILTER (WHERE page_status IS NULL AND availability = 'exclue'),
    'global_locked', EXISTS (SELECT 1 FROM public.seo_pipeline_guard WHERE global_disabled)
  ) INTO _r FROM c;
  RETURN _r;
END $function$;

-- START : seule voie de lancement du traitement automatique, après confirmation explicite.
CREATE OR REPLACE FUNCTION public.seo_autopilot_start(_confirm boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _run uuid; _existing uuid; _slugs text[];
BEGIN
  IF NOT public.has_role(_uid, 'admin'::app_role) THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  IF _confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirmation explicite requise'; END IF;
  SELECT id INTO _existing FROM public.seo_pipeline_runs WHERE status IN ('queued','running','paused') ORDER BY created_at DESC LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('created', false, 'run_id', _existing, 'reason', 'Un traitement existe déjà (en cours ou en pause) : reprenez-le ou arrêtez-le.');
  END IF;
  SELECT array_agg(DISTINCT s.city_slug ORDER BY s.city_slug) INTO _slugs
    FROM public.seo_city_slots_catalog(NULL) s WHERE public.seo_city_is_generable(s.city_slug);
  IF coalesce(array_length(_slugs,1),0) = 0 THEN RETURN jsonb_build_object('created', false, 'reason', 'Aucune ville active'); END IF;
  PERFORM set_config('seo.autopilot_ok', 'on', true);
  INSERT INTO public.seo_pipeline_runs(mode,status,city_slugs,qa_threshold,force_regenerate,created_by,started_at,last_progress_at,credits_at_start)
  VALUES ('complete','queued',_slugs,90,false,_uid,now(),now(),(SELECT coalesce(sum(estimated_credits),0) FROM public.ai_call_log))
  RETURNING id INTO _run;
  INSERT INTO public.seo_city_batches(run_id,city_slug,sort_order,status)
  SELECT _run, s, ord, 'queued' FROM unnest(_slugs) WITH ORDINALITY AS t(s,ord);
  RETURN jsonb_build_object('created', true, 'run_id', _run, 'cities', array_length(_slugs,1));
END $function$;

CREATE OR REPLACE FUNCTION public.seo_autopilot_control(_run_id uuid, _action text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  IF _action = 'pause' THEN
    UPDATE public.seo_pipeline_runs SET status='paused', pause_reason='Mis en pause par un administrateur', last_progress_at=now()
     WHERE id=_run_id AND mode='complete' AND status IN ('queued','running');
  ELSIF _action = 'resume' THEN
    PERFORM set_config('seo.autopilot_ok', 'on', true);
    UPDATE public.seo_pipeline_runs SET status='running', pause_reason=NULL, last_progress_at=now()
     WHERE id=_run_id AND mode='complete' AND status='paused';
  ELSIF _action = 'stop' THEN
    UPDATE public.seo_pipeline_runs SET status='cancelled', finished_at=now(), pause_reason='Arrêté par un administrateur'
     WHERE id=_run_id AND mode='complete' AND status IN ('queued','running','paused');
    UPDATE public.seo_page_tasks SET status='cancelled', step='arrêté', finished_at=now()
     WHERE run_id=_run_id AND status='queued';
    UPDATE public.seo_city_batches SET status='cancelled', finished_at=now()
     WHERE run_id=_run_id AND status IN ('queued','running','paused');
  ELSE RAISE EXCEPTION 'Action inconnue';
  END IF;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'action', _action);
END $function$;

-- Suivi en temps réel (lecture seule).
CREATE OR REPLACE FUNCTION public.seo_autopilot_status()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _run record; _r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  SELECT * INTO _run FROM public.seo_pipeline_runs WHERE mode='complete' ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('run', null); END IF;
  SELECT jsonb_build_object(
    'run', jsonb_build_object('id',_run.id,'status',_run.status,'pause_reason',_run.pause_reason,'started_at',_run.started_at,
           'finished_at',_run.finished_at,'current_city_slug',_run.current_city_slug,'created_by',_run.created_by),
    'cities_total', (SELECT count(*) FROM seo_city_batches b WHERE b.run_id=_run.id),
    'cities_done', (SELECT count(*) FROM seo_city_batches b WHERE b.run_id=_run.id AND b.status IN ('completed','failed')),
    'tasks_queued', (SELECT count(*) FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.status IN ('queued','running')),
    'generated', (SELECT count(*) FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.outcome IN ('generated','generated_published')),
    'fixed', (SELECT count(*) FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.outcome IN ('fixed','fixed_published')),
    'published', (SELECT count(*) FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.outcome LIKE '%published'),
    'not_published', (SELECT count(*) FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.outcome = 'kept_draft'),
    'waiting_evidence', (SELECT count(*) FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.outcome = 'waiting_evidence'),
    'excluded', (SELECT count(*) FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.outcome = 'excluded'),
    'errors', (SELECT count(*) FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.status = 'needs_retry' AND coalesce(t.outcome,'') NOT IN ('waiting_evidence','excluded')),
    'credits', greatest(0, (SELECT coalesce(sum(estimated_credits),0) FROM ai_call_log WHERE created_at >= _run.started_at) ),
    'recent_issues', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'at' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('city',t.city_slug,'material',t.material_slug,'service',t.service_slug,'outcome',t.outcome,'reason',t.last_error,'at',t.updated_at) x
          FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.last_error IS NOT NULL ORDER BY t.updated_at DESC LIMIT 200) s)
  ) INTO _r;
  RETURN _r;
END $function$;

-- Publication par le traitement automatique : mêmes contrôles que la publication validée; service uniquement.
CREATE OR REPLACE FUNCTION public.seo_autopilot_publish(_page_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _p seo_pages; _issues text[]; _n int; _av text; _q record;
BEGIN
  SELECT * INTO _p FROM seo_pages WHERE id = _page_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'issues', ARRAY['Page introuvable']); END IF;
  IF _p.status = 'published' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  _av := public.seo_slot_availability(_p.city_slug, _p.material_slug, _p.service_slug);
  IF _av IS DISTINCT FROM 'confirmee' THEN
    RETURN jsonb_build_object('ok', false, 'issues', ARRAY['Disponibilité ' || coalesce(_av,'inconnue') || ' — publication refusée']);
  END IF;
  SELECT q.score, q.content_hash, q.blockers INTO _q FROM seo_qa_reports q WHERE q.page_id = _page_id ORDER BY q.checked_at DESC LIMIT 1;
  IF _q.score IS NULL THEN RETURN jsonb_build_object('ok', false, 'issues', ARRAY['Note de qualité absente']); END IF;
  IF _q.content_hash IS DISTINCT FROM public.seo_page_content_hash(_page_id) THEN
    RETURN jsonb_build_object('ok', false, 'issues', ARRAY['Note de qualité périmée']); END IF;
  IF _q.score < 90 THEN RETURN jsonb_build_object('ok', false, 'issues', ARRAY['Note ' || _q.score || '/100 inférieure à 90']); END IF;
  IF coalesce(array_length(_q.blockers,1),0) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'issues', ARRAY['Contrôle bloquant : ' || array_to_string(_q.blockers, ', ')]); END IF;
  IF _p.noindex_volontaire THEN RETURN jsonb_build_object('ok', false, 'issues', ARRAY['Noindex volontaire — conservé, non publiée']); END IF;
  _issues := public.seo_validate_page_fields(_p.meta_title, _p.meta_description, _p.h1, _p.content_html,
              _p.slug, _p.city_slug, (SELECT count(*) FROM seo_pages d WHERE d.slug = _p.slug) > 1);
  IF coalesce(array_length(_issues,1),0) > 0 THEN RETURN jsonb_build_object('ok', false, 'issues', _issues); END IF;
  UPDATE seo_pages SET status='published', published_at=coalesce(published_at, now()), updated_at=now(), noindex=false
   WHERE id=_page_id AND status <> 'published';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN jsonb_build_object('ok', _n = 1);
END $function$;

REVOKE ALL ON FUNCTION public.seo_autopilot_publish(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seo_autopilot_publish(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.seo_autopilot_preview() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.seo_autopilot_start(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.seo_autopilot_control(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.seo_autopilot_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seo_autopilot_preview() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seo_autopilot_start(boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seo_autopilot_control(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seo_autopilot_status() TO authenticated, service_role;

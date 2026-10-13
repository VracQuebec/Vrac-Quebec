-- START : liste des villes lue directement du registre (même règle que seo_city_is_generable),
-- sans évaluer tout le catalogue — le calcul complet dépassait le délai de 8 s des sessions.
CREATE OR REPLACE FUNCTION public.seo_autopilot_start(_confirm boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public' SET statement_timeout TO '30s'
AS $function$
DECLARE _uid uuid := auth.uid(); _run uuid; _existing uuid; _slugs text[];
BEGIN
  IF NOT public.has_role(_uid, 'admin'::app_role) THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  IF _confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirmation explicite requise'; END IF;
  SELECT id INTO _existing FROM public.seo_pipeline_runs WHERE status IN ('queued','running','paused') ORDER BY created_at DESC LIMIT 1;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('created', false, 'run_id', _existing, 'reason', 'Un traitement existe déjà (en cours ou en pause) : reprenez-le ou arrêtez-le.');
  END IF;
  SELECT array_agg(DISTINCT c.slug ORDER BY c.slug) INTO _slugs
    FROM public.geo_territories g JOIN public.seo_cities c ON c.slug = g.seo_city_slug AND c.active = true
   WHERE g.type = 'municipalite' AND g.status = 'active';
  IF coalesce(array_length(_slugs,1),0) = 0 THEN RETURN jsonb_build_object('created', false, 'reason', 'Aucune ville active'); END IF;
  PERFORM set_config('seo.autopilot_ok', 'on', true);
  INSERT INTO public.seo_pipeline_runs(mode,status,city_slugs,qa_threshold,force_regenerate,created_by,started_at,last_progress_at,credits_at_start)
  VALUES ('complete','queued',_slugs,90,false,_uid,now(),now(),(SELECT coalesce(sum(estimated_credits),0) FROM public.ai_call_log))
  RETURNING id INTO _run;
  INSERT INTO public.seo_city_batches(run_id,city_slug,sort_order,status)
  SELECT _run, s, ord, 'queued' FROM unnest(_slugs) WITH ORDINALITY AS t(s,ord);
  RETURN jsonb_build_object('created', true, 'run_id', _run, 'cities', array_length(_slugs,1));
END $function$;

-- Suivi : ajoute l'avancement réel par tâche et l'étape en cours (lecture seule).
CREATE OR REPLACE FUNCTION public.seo_autopilot_status()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public' SET statement_timeout TO '20s'
AS $function$
DECLARE _run record; _r jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Réservé aux administrateurs'; END IF;
  SELECT * INTO _run FROM public.seo_pipeline_runs WHERE mode='complete' ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('run', null); END IF;
  SELECT jsonb_build_object(
    'run', jsonb_build_object('id',_run.id,'status',_run.status,'pause_reason',_run.pause_reason,'started_at',_run.started_at,
           'finished_at',_run.finished_at,'current_city_slug',_run.current_city_slug,'created_by',_run.created_by,
           'last_progress_at',_run.last_progress_at),
    'current_step', (SELECT b.current_step FROM seo_city_batches b WHERE b.run_id=_run.id AND b.status='running' ORDER BY b.sort_order LIMIT 1),
    'cities_total', (SELECT count(*) FROM seo_city_batches b WHERE b.run_id=_run.id),
    'cities_done', (SELECT count(*) FROM seo_city_batches b WHERE b.run_id=_run.id AND b.status IN ('completed','failed')),
    'tasks_total', (SELECT count(*) FROM seo_page_tasks t WHERE t.run_id=_run.id),
    'tasks_done', (SELECT count(*) FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.status NOT IN ('queued','running')),
    'tasks_queued', (SELECT count(*) FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.status IN ('queued','running')),
    'generated', (SELECT count(*) FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.outcome IN ('generated','generated_published')),
    'fixed', (SELECT count(*) FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.outcome IN ('fixed','fixed_published')),
    'published', (SELECT count(*) FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.outcome LIKE '%published'),
    'not_published', (SELECT count(*) FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.outcome = 'kept_draft'),
    'waiting_evidence', (SELECT count(*) FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.outcome = 'waiting_evidence'),
    'excluded', (SELECT count(*) FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.outcome = 'excluded'),
    'errors', (SELECT count(*) FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.status = 'needs_retry' AND coalesce(t.outcome,'') NOT IN ('waiting_evidence','excluded')),
    'credits', greatest(0, (SELECT coalesce(sum(estimated_credits),0) FROM ai_call_log WHERE created_at >= _run.started_at
                              AND (_run.finished_at IS NULL OR created_at <= _run.finished_at))),
    'recent_issues', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'at' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('city',t.city_slug,'material',t.material_slug,'service',t.service_slug,'outcome',t.outcome,'reason',t.last_error,'at',t.updated_at) x
          FROM seo_page_tasks t WHERE t.run_id=_run.id AND t.last_error IS NOT NULL ORDER BY t.updated_at DESC LIMIT 200) s)
  ) INTO _r;
  RETURN _r;
END $function$;
WITH r AS (
  INSERT INTO public.seo_optimization_runs (status, concurrency, force_all, qa_skip_above, actions, filter, total, created_at, last_progress_at)
  SELECT 'queued', 2, true, 101,
    ARRAY['enrich_content','add_internal_links','rewrite_meta_title','rewrite_meta_description','fix_h1','rewrite_open_graph','generate_keywords']::text[],
    '{"wave":"qualitative-12","source":"diagnostic-wave1"}'::jsonb,
    (SELECT count(*) FROM public.seo_wave2_before_20260909),
    now() - interval '2 minutes', now() - interval '2 minutes'
  RETURNING id
)
INSERT INTO public.seo_optimization_tasks (run_id, page_id, qa_before)
SELECT r.id, w.id, w.seo_score FROM r CROSS JOIN public.seo_wave2_before_20260909 w;
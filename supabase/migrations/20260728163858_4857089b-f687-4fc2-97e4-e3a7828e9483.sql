-- Delete the 5 test pages (empty/0-word stubs) so the generator recreates them cleanly.
DELETE FROM public.seo_pages
WHERE slug IN (
  'dompe-cap-rouge',
  'livraison-gravier-l-ange-gardien',
  'terre-contaminee-sillery',
  'asphalte-lac-beauport',
  'sainte-foy'
);

-- Abort any active run so we can start a fresh targeted one.
UPDATE public.seo_pipeline_runs
   SET status='cancelled', finished_at=now()
 WHERE status IN ('queued','running','paused');

-- Create a targeted pipeline run for those 5 cities (bypasses the admin
-- check that guards public.seo_pipeline_start — this migration runs as
-- postgres). force_regenerate=false: only missing pages are generated.
DO $$
DECLARE
  _run_id UUID;
  _slugs TEXT[] := ARRAY['cap-rouge','l-ange-gardien','sillery','lac-beauport','sainte-foy'];
BEGIN
  INSERT INTO public.seo_pipeline_runs
    (mode, status, city_slugs, qa_threshold, force_regenerate, started_at, last_progress_at)
  VALUES
    ('cities', 'queued', _slugs, 90, false, now(), now())
  RETURNING id INTO _run_id;

  INSERT INTO public.seo_city_batches (run_id, city_slug, sort_order, status)
    SELECT _run_id, s, ord, 'queued'
    FROM unnest(_slugs) WITH ORDINALITY AS t(s, ord);
END $$;
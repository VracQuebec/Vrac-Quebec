
-- 1. Enrich seo_cities
ALTER TABLE public.seo_cities
  ADD COLUMN IF NOT EXISTS arrondissement text,
  ADD COLUMN IF NOT EXISTS mrc text,
  ADD COLUMN IF NOT EXISTS region_admin text,
  ADD COLUMN IF NOT EXISTS province text NOT NULL DEFAULT 'QC',
  ADD COLUMN IF NOT EXISTS territory_type text NOT NULL DEFAULT 'ville',
  ADD COLUMN IF NOT EXISTS parent_slug text,
  ADD COLUMN IF NOT EXISTS seo_priority integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS served boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_generated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_seo_cities_priority ON public.seo_cities (active, served, seo_priority DESC);
CREATE INDEX IF NOT EXISTS idx_seo_cities_parent ON public.seo_cities (parent_slug);

-- 2. Ingest full municipality coverage (idempotent upsert)
INSERT INTO public.seo_cities
  (slug, name, region, region_admin, mrc, territory_type, parent_slug, seo_priority, served, active, sort_order, population)
VALUES
  -- Ville de Québec + arrondissements (parent = quebec)
  ('quebec',                     'Québec',                     'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'ville',           NULL,      100, true, true, 10, 549459),
  ('la-cite-limoilou',           'La Cité-Limoilou',           'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'arrondissement',  'quebec',  95,  true, true, 11, 108000),
  ('les-rivieres',               'Les Rivières',               'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'arrondissement',  'quebec',  90,  true, true, 12, 71000),
  ('sainte-foy-sillery-cap-rouge','Sainte-Foy–Sillery–Cap-Rouge','Capitale-Nationale', 'Capitale-Nationale', 'Québec',              'arrondissement',  'quebec',  95,  true, true, 13, 105000),
  ('charlesbourg',               'Charlesbourg',               'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'arrondissement',  'quebec',  90,  true, true, 14, 80000),
  ('beauport',                   'Beauport',                   'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'arrondissement',  'quebec',  90,  true, true, 15, 82000),
  ('la-haute-saint-charles',     'La Haute-Saint-Charles',     'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'arrondissement',  'quebec',  90,  true, true, 16, 87000),
  -- Quartiers/secteurs de Québec
  ('limoilou',                   'Limoilou',                   'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'quartier', 'la-cite-limoilou', 85, true, true, 20, 44000),
  ('saint-sauveur',              'Saint-Sauveur',              'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'quartier', 'la-cite-limoilou', 80, true, true, 21, 12000),
  ('montcalm',                   'Montcalm',                   'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'quartier', 'la-cite-limoilou', 80, true, true, 22, 12000),
  ('vanier',                     'Vanier',                     'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'quartier', 'les-rivieres',     80, true, true, 23, 11000),
  ('duberger',                   'Duberger',                   'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'quartier', 'les-rivieres',     80, true, true, 24, 20000),
  ('neufchatel',                 'Neufchâtel',                 'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'quartier', 'les-rivieres',     80, true, true, 25, 25000),
  ('sainte-foy',                 'Sainte-Foy',                 'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'quartier', 'sainte-foy-sillery-cap-rouge', 85, true, true, 26, 82000),
  ('sillery',                    'Sillery',                    'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'quartier', 'sainte-foy-sillery-cap-rouge', 80, true, true, 27, 13000),
  ('cap-rouge',                  'Cap-Rouge',                  'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'quartier', 'sainte-foy-sillery-cap-rouge', 80, true, true, 28, 15000),
  ('val-belair',                 'Val-Bélair',                 'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'quartier', 'la-haute-saint-charles', 80, true, true, 29, 27000),
  ('loretteville',               'Loretteville',               'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'quartier', 'la-haute-saint-charles', 80, true, true, 30, 17000),
  ('lac-saint-charles',          'Lac-Saint-Charles',          'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'quartier', 'la-haute-saint-charles', 75, true, true, 31, 12000),
  ('saint-emile',                'Saint-Émile',                'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'quartier', 'la-haute-saint-charles', 75, true, true, 32, 12000),
  -- Enclaves
  ('l-ancienne-lorette',         'L''Ancienne-Lorette',        'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'ville',    NULL, 80, true, true, 40, 17000),
  ('wendake',                    'Wendake',                    'Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'ville',    NULL, 70, true, true, 41, 2000),
  ('saint-augustin-de-desmaures','Saint-Augustin-de-Desmaures','Capitale-Nationale', 'Capitale-Nationale', 'Québec',               'ville',    NULL, 80, true, true, 42, 20000),

  -- Ville de Lévis + secteurs
  ('levis',                      'Lévis',                      'Chaudière-Appalaches','Chaudière-Appalaches','Lévis',              'ville',    NULL, 95, true, true, 100, 149683),
  ('charny',                     'Charny',                     'Chaudière-Appalaches','Chaudière-Appalaches','Lévis',              'secteur', 'levis', 80, true, true, 101, 11000),
  ('saint-romuald',              'Saint-Romuald',              'Chaudière-Appalaches','Chaudière-Appalaches','Lévis',              'secteur', 'levis', 80, true, true, 102, 12000),
  ('saint-nicolas',              'Saint-Nicolas',              'Chaudière-Appalaches','Chaudière-Appalaches','Lévis',              'secteur', 'levis', 80, true, true, 103, 18000),
  ('pintendre',                  'Pintendre',                  'Chaudière-Appalaches','Chaudière-Appalaches','Lévis',              'secteur', 'levis', 75, true, true, 104, 8000),
  ('breakeyville',               'Breakeyville',               'Chaudière-Appalaches','Chaudière-Appalaches','Lévis',              'secteur', 'levis', 70, true, true, 105, 4000),
  ('saint-jean-chrysostome',     'Saint-Jean-Chrysostome',     'Chaudière-Appalaches','Chaudière-Appalaches','Lévis',              'secteur', 'levis', 75, true, true, 106, 15000),
  ('saint-etienne-de-lauzon',    'Saint-Étienne-de-Lauzon',    'Chaudière-Appalaches','Chaudière-Appalaches','Lévis',              'secteur', 'levis', 72, true, true, 107, 10000),
  ('lauzon',                     'Lauzon',                     'Chaudière-Appalaches','Chaudière-Appalaches','Lévis',              'secteur', 'levis', 72, true, true, 108, 14000),

  -- Ceinture Côte-de-Beaupré
  ('boischatel',                 'Boischatel',                 'Capitale-Nationale', 'Capitale-Nationale', 'La Côte-de-Beaupré',   'ville', NULL, 75, true, true, 200, 8000),
  ('l-ange-gardien',             'L''Ange-Gardien',            'Capitale-Nationale', 'Capitale-Nationale', 'La Côte-de-Beaupré',   'ville', NULL, 70, true, true, 201, 4000),
  ('chateau-richer',             'Château-Richer',             'Capitale-Nationale', 'Capitale-Nationale', 'La Côte-de-Beaupré',   'ville', NULL, 65, true, true, 202, 4000),
  ('sainte-anne-de-beaupre',     'Sainte-Anne-de-Beaupré',     'Capitale-Nationale', 'Capitale-Nationale', 'La Côte-de-Beaupré',   'ville', NULL, 65, true, true, 203, 3000),
  ('beaupre',                    'Beaupré',                    'Capitale-Nationale', 'Capitale-Nationale', 'La Côte-de-Beaupré',   'ville', NULL, 65, true, true, 204, 3400),
  ('saint-ferreol-les-neiges',   'Saint-Ferréol-les-Neiges',   'Capitale-Nationale', 'Capitale-Nationale', 'La Côte-de-Beaupré',   'ville', NULL, 60, true, true, 205, 2900),

  -- Jacques-Cartier
  ('stoneham-et-tewkesbury',     'Stoneham-et-Tewkesbury',     'Capitale-Nationale', 'Capitale-Nationale', 'La Jacques-Cartier',   'ville', NULL, 75, true, true, 300, 9000),
  ('lac-beauport',               'Lac-Beauport',               'Capitale-Nationale', 'Capitale-Nationale', 'La Jacques-Cartier',   'ville', NULL, 75, true, true, 301, 8000),
  ('lac-delage',                 'Lac-Delage',                 'Capitale-Nationale', 'Capitale-Nationale', 'La Jacques-Cartier',   'ville', NULL, 55, true, true, 302, 500),
  ('sainte-brigitte-de-laval',   'Sainte-Brigitte-de-Laval',   'Capitale-Nationale', 'Capitale-Nationale', 'La Jacques-Cartier',   'ville', NULL, 72, true, true, 303, 8000),
  ('shannon',                    'Shannon',                    'Capitale-Nationale', 'Capitale-Nationale', 'La Jacques-Cartier',   'ville', NULL, 70, true, true, 304, 6800),
  ('saint-gabriel-de-valcartier','Saint-Gabriel-de-Valcartier','Capitale-Nationale', 'Capitale-Nationale', 'La Jacques-Cartier',   'ville', NULL, 60, true, true, 305, 3200),
  ('fossambault-sur-le-lac',     'Fossambault-sur-le-Lac',     'Capitale-Nationale', 'Capitale-Nationale', 'La Jacques-Cartier',   'ville', NULL, 60, true, true, 306, 1900),
  ('sainte-catherine-de-la-jacques-cartier','Sainte-Catherine-de-la-Jacques-Cartier','Capitale-Nationale', 'Capitale-Nationale', 'La Jacques-Cartier', 'ville', NULL, 68, true, true, 307, 8600),
  ('lac-saint-joseph',           'Lac-Saint-Joseph',           'Capitale-Nationale', 'Capitale-Nationale', 'La Jacques-Cartier',   'ville', NULL, 55, true, true, 308, 300),

  -- Portneuf
  ('donnacona',                  'Donnacona',                  'Capitale-Nationale', 'Capitale-Nationale', 'Portneuf',             'ville', NULL, 70, true, true, 400, 6300),
  ('pont-rouge',                 'Pont-Rouge',                 'Capitale-Nationale', 'Capitale-Nationale', 'Portneuf',             'ville', NULL, 70, true, true, 401, 10000),
  ('neuville',                   'Neuville',                   'Capitale-Nationale', 'Capitale-Nationale', 'Portneuf',             'ville', NULL, 65, true, true, 402, 4400),
  ('saint-raymond',              'Saint-Raymond',              'Capitale-Nationale', 'Capitale-Nationale', 'Portneuf',             'ville', NULL, 68, true, true, 403, 10400),
  ('portneuf',                   'Portneuf',                   'Capitale-Nationale', 'Capitale-Nationale', 'Portneuf',             'ville', NULL, 62, true, true, 404, 3200),
  ('cap-sante',                  'Cap-Santé',                  'Capitale-Nationale', 'Capitale-Nationale', 'Portneuf',             'ville', NULL, 58, true, true, 405, 3000),

  -- Lotbinière / Nouvelle-Beauce (Chaudière-Appalaches sud)
  ('saint-apollinaire',          'Saint-Apollinaire',          'Chaudière-Appalaches','Chaudière-Appalaches','Lotbinière',        'ville', NULL, 65, true, true, 500, 6800),
  ('saint-lambert-de-lauzon',    'Saint-Lambert-de-Lauzon',    'Chaudière-Appalaches','Chaudière-Appalaches','La Nouvelle-Beauce','ville', NULL, 65, true, true, 501, 6500),
  ('laurier-station',            'Laurier-Station',            'Chaudière-Appalaches','Chaudière-Appalaches','Lotbinière',        'ville', NULL, 60, true, true, 502, 3000)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  region            = COALESCE(public.seo_cities.region, EXCLUDED.region),
  region_admin      = EXCLUDED.region_admin,
  mrc               = EXCLUDED.mrc,
  territory_type    = EXCLUDED.territory_type,
  parent_slug       = EXCLUDED.parent_slug,
  seo_priority      = GREATEST(public.seo_cities.seo_priority, EXCLUDED.seo_priority),
  served            = true,
  active            = true,
  population        = COALESCE(public.seo_cities.population, EXCLUDED.population);

-- 3. Update pipeline start to honor served + priority order
CREATE OR REPLACE FUNCTION public.seo_pipeline_start(_mode text DEFAULT 'all_cities'::text, _city_slugs text[] DEFAULT NULL::text[], _qa_threshold integer DEFAULT 90, _force_regenerate boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _run_id UUID;
  _slugs TEXT[];
  _uid UUID := auth.uid();
BEGIN
  IF NOT public.has_role(_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  IF EXISTS (SELECT 1 FROM public.seo_pipeline_runs
              WHERE status IN ('queued','running','paused')) THEN
    RAISE EXCEPTION 'Un lancement est déjà en cours. Arrêtez-le avant d''en démarrer un autre.';
  END IF;

  IF _city_slugs IS NOT NULL AND array_length(_city_slugs, 1) > 0 THEN
    _slugs := _city_slugs;
  ELSE
    SELECT array_agg(slug ORDER BY seo_priority DESC, COALESCE(population, 0) DESC, name)
      INTO _slugs
      FROM public.seo_cities
      WHERE active = true AND served = true;
  END IF;

  IF _slugs IS NULL OR array_length(_slugs, 1) = 0 THEN
    RAISE EXCEPTION 'Aucune ville active desservie';
  END IF;

  INSERT INTO public.seo_pipeline_runs
    (mode, status, city_slugs, qa_threshold, force_regenerate, created_by, started_at, last_progress_at)
  VALUES
    (_mode, 'queued', _slugs, COALESCE(_qa_threshold, 90), COALESCE(_force_regenerate, false), _uid, now(), now())
  RETURNING id INTO _run_id;

  INSERT INTO public.seo_city_batches (run_id, city_slug, sort_order, status)
    SELECT _run_id, s, ord, 'queued'
    FROM unnest(_slugs) WITH ORDINALITY AS t(s, ord);

  RETURN _run_id;
END $function$;

-- 4. Territorial coverage RPC
CREATE OR REPLACE FUNCTION public.seo_territorial_coverage()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _out jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  SELECT jsonb_build_object(
    'computed_at', now(),
    'totals', (
      SELECT jsonb_build_object(
        'municipalites',   COUNT(*) FILTER (WHERE territory_type IN ('ville','municipalite')),
        'arrondissements', COUNT(*) FILTER (WHERE territory_type = 'arrondissement'),
        'quartiers',       COUNT(*) FILTER (WHERE territory_type = 'quartier'),
        'secteurs',        COUNT(*) FILTER (WHERE territory_type = 'secteur'),
        'served',          COUNT(*) FILTER (WHERE served = true AND active = true),
        'total',           COUNT(*)
      )
      FROM public.seo_cities
    ),
    'pages', (
      SELECT jsonb_build_object(
        'total',       COUNT(*),
        'published',   COUNT(*) FILTER (WHERE status='published'),
        'draft',       COUNT(*) FILTER (WHERE status='draft'),
        'indexable',   COUNT(*) FILTER (WHERE status='published' AND word_count >= 800),
        'thin',        COUNT(*) FILTER (WHERE word_count < 800),
        'qa_avg',      COALESCE(ROUND(AVG(qa_last_score)::numeric, 1), 0),
        'words_avg',   COALESCE(ROUND(AVG(word_count)::numeric, 0), 0)
      )
      FROM public.seo_pages
    ),
    'by_city', (
      SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.seo_priority DESC, t.name), '[]'::jsonb) FROM (
        SELECT c.slug, c.name, c.territory_type, c.parent_slug, c.mrc, c.region_admin,
               c.seo_priority, c.population, c.last_generated_at,
               COUNT(p.id)                                       AS pages_total,
               COUNT(p.id) FILTER (WHERE p.status='published')   AS pages_published,
               COUNT(p.id) FILTER (WHERE p.status='draft')       AS pages_draft,
               COUNT(p.id) FILTER (WHERE p.word_count < 800)     AS pages_thin,
               COALESCE(ROUND(AVG(p.qa_last_score)::numeric, 1), 0) AS qa_avg,
               COALESCE(ROUND(AVG(p.word_count)::numeric, 0), 0)     AS words_avg
        FROM public.seo_cities c
        LEFT JOIN public.seo_pages p ON p.city_slug = c.slug
        WHERE c.active = true AND c.served = true
        GROUP BY c.slug, c.name, c.territory_type, c.parent_slug, c.mrc, c.region_admin, c.seo_priority, c.population, c.last_generated_at
      ) t
    ),
    'active_run', (
      SELECT to_jsonb(r) FROM public.seo_pipeline_runs r
       WHERE status IN ('queued','running','paused')
       ORDER BY created_at DESC LIMIT 1
    ),
    'economy', public.ai_economy_stats(30)
  ) INTO _out;

  RETURN _out;
END $function$;

-- 5. Final report RPC (per run or latest completed)
CREATE OR REPLACE FUNCTION public.seo_final_report(_run_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _rid UUID := _run_id;
  _run public.seo_pipeline_runs%ROWTYPE;
  _out jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  IF _rid IS NULL THEN
    SELECT id INTO _rid FROM public.seo_pipeline_runs
      ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF _rid IS NULL THEN RETURN jsonb_build_object('error','Aucun run'); END IF;

  SELECT * INTO _run FROM public.seo_pipeline_runs WHERE id = _rid;

  SELECT jsonb_build_object(
    'run', to_jsonb(_run),
    'territories', (
      SELECT jsonb_build_object(
        'municipalites',   COUNT(*) FILTER (WHERE territory_type IN ('ville','municipalite')),
        'arrondissements', COUNT(*) FILTER (WHERE territory_type = 'arrondissement'),
        'quartiers',       COUNT(*) FILTER (WHERE territory_type = 'quartier'),
        'secteurs',        COUNT(*) FILTER (WHERE territory_type = 'secteur'),
        'covered',         COUNT(*) FILTER (WHERE slug = ANY(_run.city_slugs))
      ) FROM public.seo_cities
    ),
    'tasks', (
      SELECT jsonb_build_object(
        'total',     COUNT(*),
        'completed', COUNT(*) FILTER (WHERE status='completed'),
        'failed',    COUNT(*) FILTER (WHERE status='failed'),
        'skipped',   COUNT(*) FILTER (WHERE status='skipped'),
        'pending',   COUNT(*) FILTER (WHERE status IN ('pending','queued','processing','claimed')),
        'duration_ms_avg', COALESCE(ROUND(AVG(duration_ms))::int, 0)
      ) FROM public.seo_page_tasks WHERE run_id = _rid
    ),
    'pages', (
      SELECT jsonb_build_object(
        'total',      COUNT(*),
        'published',  COUNT(*) FILTER (WHERE status='published'),
        'indexable',  COUNT(*) FILTER (WHERE status='published' AND word_count >= 800),
        'thin',       COUNT(*) FILTER (WHERE word_count < 800),
        'qa_avg',     COALESCE(ROUND(AVG(qa_last_score)::numeric, 1), 0),
        'words_avg',  COALESCE(ROUND(AVG(word_count)::numeric, 0), 0),
        'with_meta_title',       COUNT(*) FILTER (WHERE meta_title IS NOT NULL AND btrim(meta_title) <> ''),
        'with_meta_description', COUNT(*) FILTER (WHERE meta_description IS NOT NULL AND btrim(meta_description) <> ''),
        'with_faq',              COUNT(*) FILTER (WHERE faq IS NOT NULL AND jsonb_array_length(faq) > 0)
      ) FROM public.seo_pages
      WHERE city_slug = ANY(_run.city_slugs)
    ),
    'errors', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'city_slug', city_slug, 'material_slug', material_slug, 'service_slug', service_slug,
        'attempts', attempts, 'last_error', last_error, 'step', step
      )), '[]'::jsonb)
      FROM public.seo_page_tasks
      WHERE run_id = _rid AND status = 'failed'
      LIMIT 50
    ),
    'duplicates', (
      SELECT COUNT(*) FROM (
        SELECT slug FROM public.seo_pages GROUP BY slug HAVING COUNT(*) > 1
      ) d
    )
  ) INTO _out;
  RETURN _out;
END $function$;

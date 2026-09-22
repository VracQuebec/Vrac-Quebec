CREATE TABLE public.seo_publish_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL,
  slug text NOT NULL,
  city_slug text,
  topic text,
  status_before text,
  status_after text,
  success boolean NOT NULL DEFAULT false,
  outcome text NOT NULL DEFAULT 'published',
  error_message text,
  run_id uuid,
  batch_index integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.seo_publish_log TO authenticated;
GRANT ALL ON public.seo_publish_log TO service_role;

ALTER TABLE public.seo_publish_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read publish log" ON public.seo_publish_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins write publish log" ON public.seo_publish_log
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Une seule publication réussie enregistrée par page : protection contre les doublons.
CREATE UNIQUE INDEX seo_publish_log_page_success_uidx
  ON public.seo_publish_log (page_id) WHERE success;

CREATE INDEX seo_publish_log_created_idx ON public.seo_publish_log (created_at DESC);
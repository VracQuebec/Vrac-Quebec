
CREATE TABLE public.seo_page_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('view','phone_click','whatsapp_click','submission','cta_click')),
  session_id text,
  user_agent text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.seo_page_events TO anon, authenticated;
GRANT SELECT, DELETE ON public.seo_page_events TO authenticated;
GRANT ALL ON public.seo_page_events TO service_role;
ALTER TABLE public.seo_page_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can log page events"
  ON public.seo_page_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    page_slug IS NOT NULL
    AND btrim(page_slug) <> ''
    AND length(page_slug) <= 200
    AND event_type IN ('view','phone_click','whatsapp_click','submission','cta_click')
  );

CREATE POLICY "Admins can read page events"
  ON public.seo_page_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete page events"
  ON public.seo_page_events FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_seo_page_events_slug_time
  ON public.seo_page_events (page_slug, event_type, occurred_at DESC);
CREATE INDEX idx_seo_page_events_time
  ON public.seo_page_events (occurred_at DESC);

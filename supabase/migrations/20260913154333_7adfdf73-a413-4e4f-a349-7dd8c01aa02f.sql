CREATE TABLE IF NOT EXISTS public.parcours_preview_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key text NOT NULL,
  event_name text NOT NULL,
  step text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.parcours_preview_events TO authenticated;
GRANT ALL ON public.parcours_preview_events TO service_role;

ALTER TABLE public.parcours_preview_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parcours preview events insert"
  ON public.parcours_preview_events FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "parcours preview events admin read"
  ON public.parcours_preview_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS parcours_preview_events_created_idx
  ON public.parcours_preview_events (created_at DESC);

INSERT INTO public.matching_settings (key, value, description)
VALUES (
  'public_matching_preview',
  '{"enabled": true, "scope": "admin_preview", "public": false}'::jsonb,
  'Aperçu interne du futur parcours public. Réservé à l''administration; le matching public reste inactif.'
)
ON CONFLICT (key) DO NOTHING;
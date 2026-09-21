-- Journal d'exécution des opportunités SEO (additif, aucune donnée supprimée)
CREATE TABLE IF NOT EXISTS public.seo_opportunity_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES public.seo_opportunities(id) ON DELETE CASCADE,
  action_key text,
  action_kind text,
  action_type text NOT NULL,
  capability text,
  status text NOT NULL DEFAULT 'started',
  page_id uuid,
  page_slug text,
  before_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  error text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.seo_opportunity_actions TO authenticated;
GRANT ALL ON public.seo_opportunity_actions TO service_role;

ALTER TABLE public.seo_opportunity_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read seo_opportunity_actions" ON public.seo_opportunity_actions;
CREATE POLICY "Admins can read seo_opportunity_actions"
  ON public.seo_opportunity_actions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert seo_opportunity_actions" ON public.seo_opportunity_actions;
CREATE POLICY "Admins can insert seo_opportunity_actions"
  ON public.seo_opportunity_actions FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can update seo_opportunity_actions" ON public.seo_opportunity_actions;
CREATE POLICY "Admins can update seo_opportunity_actions"
  ON public.seo_opportunity_actions FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS seo_opportunity_actions_opp_idx ON public.seo_opportunity_actions (opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS seo_opportunity_actions_key_idx ON public.seo_opportunity_actions (action_key, created_at DESC);

-- Colonnes additives sur les opportunités : suivi du cycle de vie
ALTER TABLE public.seo_opportunities ADD COLUMN IF NOT EXISTS work_started_at timestamptz;
ALTER TABLE public.seo_opportunities ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.seo_opportunities ADD COLUMN IF NOT EXISTS dismiss_reason text;
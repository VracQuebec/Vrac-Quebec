CREATE TABLE IF NOT EXISTS public.seo_pipeline_guard (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  global_disabled boolean NOT NULL DEFAULT true,
  reason text NOT NULL DEFAULT 'Génération globale désactivée — autorisation explicite requise.',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.seo_pipeline_guard TO authenticated;
GRANT ALL ON public.seo_pipeline_guard TO service_role;
ALTER TABLE public.seo_pipeline_guard ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins lisent le verrou de génération globale" ON public.seo_pipeline_guard
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
INSERT INTO public.seo_pipeline_guard (id, global_disabled, reason)
VALUES (true, true, 'Génération globale désactivée le 2026-10-13 : reprise du 2026-10-12 vers 18 h 05 UTC non attribuable — autorisation explicite requise.')
ON CONFLICT (id) DO NOTHING;
COMMENT ON TABLE public.seo_pipeline_guard IS 'Verrou unique : tant que global_disabled, aucune génération globale ne peut être créée, reprise ou relancée (trigger seo_pipeline_runs_guard). Levée seulement par migration explicite.';

CREATE OR REPLACE FUNCTION public.seo_pipeline_runs_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('queued','running')
     AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('queued','running'))
     AND EXISTS (SELECT 1 FROM public.seo_pipeline_guard WHERE global_disabled) THEN
    RAISE EXCEPTION 'Génération globale désactivée : démarrage, reprise et relance refusés (autorisation explicite requise).';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS seo_pipeline_runs_guard ON public.seo_pipeline_runs;
CREATE TRIGGER seo_pipeline_runs_guard BEFORE INSERT OR UPDATE OF status ON public.seo_pipeline_runs
  FOR EACH ROW EXECUTE FUNCTION public.seo_pipeline_runs_guard();
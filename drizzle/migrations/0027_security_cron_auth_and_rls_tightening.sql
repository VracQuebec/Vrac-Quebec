-- 1) Secret interne partagé avec le planificateur (pg_cron) : l'en-tête
--    « Lovable-Context: cron » ne prouvait rien, il est rejouable.
CREATE TABLE IF NOT EXISTS public.cron_auth (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  secret text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.cron_auth TO service_role;
ALTER TABLE public.cron_auth ENABLE ROW LEVEL SECURITY;
-- Aucune politique : seul le rôle de service (et le planificateur) y accède.
INSERT INTO public.cron_auth (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- 2) Paramètres internes : lecture réservée aux administrateurs.
DROP POLICY IF EXISTS "ai_settings read auth" ON public.ai_settings;
CREATE POLICY "ai_settings admin read" ON public.ai_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "dr read all" ON public.dispatch_rules;
CREATE POLICY "dispatch_rules admin read" ON public.dispatch_rules
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "mkt_settings_read" ON public.mkt_settings;
CREATE POLICY "mkt_settings admin read" ON public.mkt_settings
  FOR SELECT TO authenticated
  USING (public.mkt_is_admin());

-- 3) Catalogue des rôles applicatifs : réservé aux membres d'une entreprise.
DROP POLICY IF EXISTS "roles readable by authenticated" ON public.jsc_roles;
CREATE POLICY "jsc_roles members read" ON public.jsc_roles
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.jsc_company_members m
      WHERE m.user_id = auth.uid()
    )
  );

-- 4) Événements d'aperçu de parcours : chaque ligne appartient à son auteur.
ALTER TABLE public.parcours_preview_events
  ADD COLUMN IF NOT EXISTS user_id uuid DEFAULT auth.uid();
DROP POLICY IF EXISTS "parcours preview events insert" ON public.parcours_preview_events;
CREATE POLICY "parcours preview events owner insert" ON public.parcours_preview_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 5) Fichiers du blogue : plus de lecture anonyme de tout le bucket.
--    Les images publiques sont servies par URL signée ; seuls les
--    administrateurs lisent les objets directement.
DROP POLICY IF EXISTS "blog-media public read" ON storage.objects;
CREATE POLICY "blog-media admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'blog-media' AND public.has_role(auth.uid(), 'admin'::app_role));
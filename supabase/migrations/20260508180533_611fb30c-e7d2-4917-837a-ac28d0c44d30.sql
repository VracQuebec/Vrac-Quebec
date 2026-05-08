CREATE TABLE public.lead_statuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  text_color TEXT NOT NULL DEFAULT '#ffffff',
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage lead_statuses"
  ON public.lead_statuses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Authenticated can read lead_statuses"
  ON public.lead_statuses FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.touch_lead_statuses_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_lead_statuses_updated_at
  BEFORE UPDATE ON public.lead_statuses
  FOR EACH ROW EXECUTE FUNCTION public.touch_lead_statuses_updated_at();

INSERT INTO public.lead_statuses (value, label, color, text_color, sort_order) VALUES
  ('nouveau', 'Nouveau', '#f97316', '#ffffff', 10),
  ('à rappeler', 'À rappeler', '#f59e0b', '#ffffff', 20),
  ('message texte envoyé', 'Message texte envoyé', '#0ea5e9', '#ffffff', 30),
  ('soumission envoyée', 'Soumission envoyée', '#6366f1', '#ffffff', 40),
  ('soumission acceptée', 'Soumission acceptée', '#8b5cf6', '#ffffff', 50),
  ('en attente de livraison', 'En attente de livraison', '#3b82f6', '#ffffff', 60),
  ('en attente de paiement', 'En attente de paiement', '#0d9488', '#ffffff', 70),
  ('paiement effectué', 'Paiement effectué', '#059669', '#ffffff', 80),
  ('perdu', 'Perdu', '#e11d48', '#ffffff', 90),
  ('archivé', 'Archivé', '#64748b', '#ffffff', 100);
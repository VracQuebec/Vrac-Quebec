
CREATE TABLE public.entrepreneur_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  -- Tarification
  price_6w NUMERIC,
  price_10w NUMERIC,
  price_12w NUMERIC,
  price_semi NUMERIC,
  price_trailer_2 NUMERIC,
  price_trailer_3 NUMERIC,
  price_trailer_4 NUMERIC,
  wait_time_price NUMERIC,
  distance_surcharge NUMERIC,
  -- Équipements (array of keys)
  equipment TEXT[] NOT NULL DEFAULT '{}',
  -- Méta admin
  internal_notes TEXT NOT NULL DEFAULT '',
  partner_status TEXT NOT NULL DEFAULT 'actif',
  average_volume TEXT NOT NULL DEFAULT '',
  materials_transported TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.entrepreneur_profiles TO authenticated;
GRANT ALL ON public.entrepreneur_profiles TO service_role;

ALTER TABLE public.entrepreneur_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage entrepreneur_profiles"
ON public.entrepreneur_profiles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Entrepreneurs read own profile"
ON public.entrepreneur_profiles
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER trg_entrepreneur_profiles_updated
BEFORE UPDATE ON public.entrepreneur_profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_lead_statuses_updated_at();

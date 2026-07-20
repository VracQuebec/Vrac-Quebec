
-- SEO Services table
CREATE TABLE IF NOT EXISTS public.seo_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_name TEXT,
  description TEXT DEFAULT '',
  keywords TEXT[] DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seo_services TO anon, authenticated;
GRANT ALL ON public.seo_services TO service_role;
ALTER TABLE public.seo_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads active services" ON public.seo_services FOR SELECT USING (active = true OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage services" ON public.seo_services FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_seo_services_updated_at BEFORE UPDATE ON public.seo_services FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- SEO Pages (generated landing pages)
CREATE TABLE IF NOT EXISTS public.seo_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  city_slug TEXT NOT NULL,
  material_slug TEXT,
  service_slug TEXT,
  title TEXT NOT NULL DEFAULT '',
  meta_title TEXT,
  meta_description TEXT,
  h1 TEXT,
  intro TEXT,
  content_html TEXT NOT NULL DEFAULT '',
  faq JSONB NOT NULL DEFAULT '[]'::jsonb,
  cover_image_url TEXT,
  cover_image_prompt TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  ai_model TEXT,
  view_count INT NOT NULL DEFAULT 0,
  last_generated_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT seo_pages_combo_unique UNIQUE (city_slug, material_slug, service_slug)
);
GRANT SELECT ON public.seo_pages TO anon, authenticated;
GRANT ALL ON public.seo_pages TO service_role;
ALTER TABLE public.seo_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public reads published pages" ON public.seo_pages FOR SELECT USING (status = 'published' OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage seo pages" ON public.seo_pages FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_seo_pages_updated_at BEFORE UPDATE ON public.seo_pages FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_seo_pages_city ON public.seo_pages(city_slug);
CREATE INDEX IF NOT EXISTS idx_seo_pages_material ON public.seo_pages(material_slug);
CREATE INDEX IF NOT EXISTS idx_seo_pages_service ON public.seo_pages(service_slug);
CREATE INDEX IF NOT EXISTS idx_seo_pages_status ON public.seo_pages(status);

-- SEO Generation jobs
CREATE TABLE IF NOT EXISTS public.seo_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'queued',
  combinations JSONB NOT NULL DEFAULT '[]'::jsonb,
  total INT NOT NULL DEFAULT 0,
  done INT NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_generation_jobs TO authenticated;
GRANT ALL ON public.seo_generation_jobs TO service_role;
ALTER TABLE public.seo_generation_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage jobs" ON public.seo_generation_jobs FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_seo_jobs_updated_at BEFORE UPDATE ON public.seo_generation_jobs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed services
INSERT INTO public.seo_services (slug, name, short_name, description, keywords, sort_order) VALUES
  ('transport-vrac','Transport en vrac','Transport vrac','Transport de matériaux en vrac par camion 6, 10 ou 12 roues.','{"transport vrac","camion benne","transport matériaux"}',10),
  ('dompe','Dompe','Dompe','Service de dompe pour matériaux d''excavation et de démolition.','{"dompe","site de dépôt","décharge matériaux"}',20),
  ('recherche-point-de-depot','Recherche de point de dépôt','Point de dépôt','Nous trouvons un point de dépôt local pour vos surplus de chantier.','{"point de dépôt","où domper","site dépôt terre"}',30),
  ('livraison-terre','Livraison de terre','Livraison terre','Livraison de terre propre, tamisée ou végétale.','{"livraison terre","terre livrée"}',40),
  ('livraison-sable','Livraison de sable','Livraison sable','Livraison de sable naturel, sable de tranchée, coussin.','{"livraison sable"}',50),
  ('livraison-gravier','Livraison de gravier','Livraison gravier','Livraison de gravier concassé pour entrées et bases.','{"livraison gravier","gravier livré"}',60),
  ('livraison-pierre','Livraison de pierre','Livraison pierre','Livraison de pierre concassée ou nette pour drainage.','{"livraison pierre","pierre concassée livrée"}',70),
  ('excavation','Excavation','Excavation','Services d''excavation résidentielle et commerciale.','{"excavation","creusage","excavateur"}',80),
  ('nivellement','Nivellement','Nivellement','Nivellement de terrain avant aménagement ou construction.','{"nivellement terrain","niveler terrain"}',90),
  ('courtage-materiaux','Courtage de matériaux','Courtage','Mise en relation entre fournisseurs, entrepreneurs et clients.','{"courtage matériaux","broker matériaux vrac"}',100)
ON CONFLICT (slug) DO NOTHING;

-- Seed missing materials from the requested list (only if not present)
INSERT INTO public.seo_materials (slug, name, short_name, keywords, use_cases, delivery_unit, related_materials, description, active, sort_order) VALUES
  ('terre-contaminee','Terre contaminée','Terre contaminée','{"terre contaminée","sol contaminé","décontamination"}','{"Élimination de sol contaminé selon la classification","Transport vers un site autorisé","Suivi environnemental de chantier"}','tonne','{"terre-remplissage"}','Sol classé contaminé (A, B, C) qui doit être transporté vers un site autorisé selon la réglementation québécoise.',true,120),
  ('gravier','Gravier','Gravier','{"gravier","gravier concassé","gravier naturel"}','{"Base d''entrée de garage","Chemin d''accès de chantier","Drainage"}','tonne','{"gravier-0-3-4","mg-20","mg-56"}','Gravier concassé toutes catégories confondues, livré selon le calibre requis pour votre projet.',true,130),
  ('pierre','Pierre','Pierre','{"pierre","pierre concassée","pierre nette"}','{"Drainage","Décoration paysagère","Fondation"}','tonne','{"pierre-concassee","pierre-nette","poussiere-de-pierre"}','Pierre concassée ou nette selon l''usage : drainage, fondation ou finition.',true,140),
  ('roche','Roche','Roche','{"roche","gros cailloux","enrochement","roche brisée"}','{"Enrochement rive","Muret décoratif","Stabilisation talus"}','tonne','{"pierre"}','Roche brute pour enrochement, muret ou stabilisation de talus.',true,150),
  ('beton','Béton','Béton','{"béton","béton recyclé","concassé béton"}','{"Récupération de dalle de béton","Fondation recyclée","Chargement de démolition"}','tonne','{"asphalte","pierre-concassee"}','Béton neuf ou recyclé, récupéré ou livré selon les besoins du chantier.',true,160),
  ('asphalte','Asphalte','Asphalte','{"asphalte","pavage recyclé","asphalte concassé"}','{"Récupération d''asphalte de démolition","Base d''entrée d''asphalte recyclée","Chargement de pavage"}','tonne','{"beton","mg-20"}','Asphalte neuf ou recyclé pour bases d''entrée, chemins et cours.',true,170),
  ('brique','Brique','Brique','{"brique","brique recyclée","concassé brique"}','{"Récupération de brique de démolition","Chargement chantier","Concassé décoratif"}','tonne','{"beton"}','Brique récupérée ou concassée pour usages divers.',true,180),
  ('neige','Neige','Neige','{"transport neige","déneigement commercial","site de dépôt neige"}','{"Transport de neige commercial","Déneigement de stationnement","Site de dépôt de neige autorisé"}','tonne','{}','Transport de neige et service de site de dépôt pour opérateurs commerciaux.',true,190)
ON CONFLICT (slug) DO NOTHING;

-- Seed the cities requested (arrondissements + secteurs) if missing
INSERT INTO public.seo_cities (slug, name, region, latitude, longitude, neighbors, active, sort_order) VALUES
  ('la-cite-limoilou','La Cité-Limoilou','Ville de Québec',46.82,-71.22,'{"quebec","limoilou","vanier","beauport"}',true,200),
  ('les-rivieres','Les Rivières','Ville de Québec',46.85,-71.30,'{"quebec","vanier","charlesbourg","l-ancienne-lorette"}',true,210),
  ('la-haute-saint-charles','La Haute-Saint-Charles','Ville de Québec',46.88,-71.42,'{"val-belair","saint-emile","wendake","charlesbourg"}',true,220),
  ('sainte-foy-sillery-cap-rouge','Sainte-Foy–Sillery–Cap-Rouge','Ville de Québec',46.77,-71.30,'{"sainte-foy","sillery","cap-rouge","l-ancienne-lorette"}',true,230),
  ('saint-jean-chrysostome','Saint-Jean-Chrysostome','Lévis',46.7167,-71.15,'{"pintendre","charny","levis","breakeyville"}',true,240)
ON CONFLICT (slug) DO NOTHING;


-- =========================================================
-- Phase 1 – Fondation SEO administrable
-- =========================================================

-- ---------- SEO CITIES ----------
CREATE TABLE public.seo_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  region text NOT NULL DEFAULT '',
  latitude double precision,
  longitude double precision,
  population integer,
  intro text,
  neighbors text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.seo_cities TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_cities TO authenticated;
GRANT ALL ON public.seo_cities TO service_role;

ALTER TABLE public.seo_cities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active cities" ON public.seo_cities
  FOR SELECT USING (active = true);
CREATE POLICY "Admins can read all cities" ON public.seo_cities
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert cities" ON public.seo_cities
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update cities" ON public.seo_cities
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete cities" ON public.seo_cities
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER seo_cities_touch BEFORE UPDATE ON public.seo_cities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ---------- SEO MATERIALS ----------
CREATE TABLE public.seo_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  short_name text NOT NULL DEFAULT '',
  keywords text[] NOT NULL DEFAULT '{}',
  use_cases text[] NOT NULL DEFAULT '{}',
  pricing_hint text NOT NULL DEFAULT '',
  delivery_unit text NOT NULL DEFAULT 'verge cube',
  related_materials text[] NOT NULL DEFAULT '{}',
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.seo_materials TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_materials TO authenticated;
GRANT ALL ON public.seo_materials TO service_role;

ALTER TABLE public.seo_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active materials" ON public.seo_materials
  FOR SELECT USING (active = true);
CREATE POLICY "Admins can read all materials" ON public.seo_materials
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert materials" ON public.seo_materials
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update materials" ON public.seo_materials
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete materials" ON public.seo_materials
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER seo_materials_touch BEFORE UPDATE ON public.seo_materials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ---------- SEO MATERIAL USES ----------
CREATE TABLE public.seo_material_uses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  material_slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.seo_material_uses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_material_uses TO authenticated;
GRANT ALL ON public.seo_material_uses TO service_role;

ALTER TABLE public.seo_material_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active uses" ON public.seo_material_uses
  FOR SELECT USING (active = true);
CREATE POLICY "Admins can read all uses" ON public.seo_material_uses
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can insert uses" ON public.seo_material_uses
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update uses" ON public.seo_material_uses
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete uses" ON public.seo_material_uses
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER seo_material_uses_touch BEFORE UPDATE ON public.seo_material_uses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- =========================================================
-- SEED : villes actuelles (34)
-- =========================================================
INSERT INTO public.seo_cities (slug, name, region, latitude, longitude, population, intro, neighbors, sort_order) VALUES
('quebec','Québec','Capitale-Nationale',46.8139,-71.208,542298,'Cœur de la région, la Ville de Québec regroupe les plus grands chantiers résidentiels et commerciaux du territoire desservi.',ARRAY['levis','beauport','charlesbourg','sainte-foy','l-ancienne-lorette'],10),
('levis','Lévis','Chaudière-Appalaches',46.7382,-71.2465,149683,'Deuxième pôle du territoire, Lévis regroupe plusieurs secteurs en développement rapide (Saint-Rédempteur, Saint-Nicolas, Pintendre).',ARRAY['saint-nicolas','saint-romuald','charny','pintendre','quebec'],20),
('beauport','Beauport','Ville de Québec',46.8747,-71.1968,NULL,NULL,ARRAY['quebec','charlesbourg','boischatel','l-ange-gardien'],30),
('charlesbourg','Charlesbourg','Ville de Québec',46.859,-71.2687,NULL,NULL,ARRAY['quebec','beauport','lac-beauport','saint-emile'],40),
('sainte-foy','Sainte-Foy','Ville de Québec',46.7841,-71.288,NULL,NULL,ARRAY['quebec','sillery','cap-rouge','l-ancienne-lorette'],50),
('limoilou','Limoilou','Ville de Québec',46.828,-71.226,NULL,NULL,ARRAY['quebec','beauport','charlesbourg','vanier'],60),
('saint-emile','Saint-Émile','Ville de Québec',46.8853,-71.3372,NULL,NULL,ARRAY['val-belair','charlesbourg','wendake','l-ancienne-lorette'],70),
('val-belair','Val-Bélair','Ville de Québec',46.8531,-71.4736,NULL,NULL,ARRAY['saint-emile','l-ancienne-lorette','sainte-catherine-de-la-jacques-cartier','shannon'],80),
('cap-rouge','Cap-Rouge','Ville de Québec',46.7511,-71.3506,NULL,NULL,ARRAY['sainte-foy','l-ancienne-lorette','saint-augustin-de-desmaures','sillery'],90),
('sillery','Sillery','Ville de Québec',46.7708,-71.2519,NULL,NULL,ARRAY['sainte-foy','quebec','cap-rouge'],100),
('vanier','Vanier','Ville de Québec',46.8362,-71.2739,NULL,NULL,ARRAY['quebec','limoilou','charlesbourg','l-ancienne-lorette'],110),
('l-ancienne-lorette','L''Ancienne-Lorette','Ville de Québec',46.8,-71.35,NULL,NULL,ARRAY['sainte-foy','cap-rouge','val-belair','saint-augustin-de-desmaures'],120),
('wendake','Wendake','Wendake',46.8778,-71.354,NULL,NULL,ARRAY['saint-emile','charlesbourg','l-ancienne-lorette'],130),
('saint-augustin-de-desmaures','Saint-Augustin-de-Desmaures','Capitale-Nationale',46.7386,-71.4425,NULL,NULL,ARRAY['cap-rouge','l-ancienne-lorette','neuville','sainte-catherine-de-la-jacques-cartier'],140),
('boischatel','Boischatel','Côte-de-Beaupré',46.9,-71.15,NULL,NULL,ARRAY['beauport','l-ange-gardien','chateau-richer','quebec'],150),
('l-ange-gardien','L''Ange-Gardien','Côte-de-Beaupré',46.9231,-71.0844,NULL,NULL,ARRAY['boischatel','chateau-richer','beauport'],160),
('chateau-richer','Château-Richer','Côte-de-Beaupré',46.9614,-71.03,NULL,NULL,ARRAY['l-ange-gardien','boischatel'],170),
('sainte-brigitte-de-laval','Sainte-Brigitte-de-Laval','Capitale-Nationale',46.9436,-71.2233,NULL,NULL,ARRAY['beauport','lac-beauport','boischatel'],180),
('lac-beauport','Lac-Beauport','Jacques-Cartier',46.9333,-71.2833,NULL,NULL,ARRAY['charlesbourg','stoneham-et-tewkesbury','sainte-brigitte-de-laval'],190),
('stoneham-et-tewkesbury','Stoneham-et-Tewkesbury','Jacques-Cartier',47.0333,-71.35,NULL,NULL,ARRAY['lac-beauport','shannon','saint-gabriel-de-valcartier'],200),
('shannon','Shannon','Jacques-Cartier',46.8833,-71.5167,NULL,NULL,ARRAY['saint-gabriel-de-valcartier','val-belair','stoneham-et-tewkesbury'],210),
('saint-gabriel-de-valcartier','Saint-Gabriel-de-Valcartier','Jacques-Cartier',46.9333,-71.4667,NULL,NULL,ARRAY['shannon','stoneham-et-tewkesbury'],220),
('saint-nicolas','Saint-Nicolas','Lévis',46.7,-71.35,NULL,NULL,ARRAY['levis','charny','saint-romuald','saint-lambert-de-lauzon'],230),
('charny','Charny','Lévis',46.7167,-71.2667,NULL,NULL,ARRAY['saint-nicolas','saint-romuald','breakeyville','levis'],240),
('saint-romuald','Saint-Romuald','Lévis',46.75,-71.2333,NULL,NULL,ARRAY['charny','saint-nicolas','levis','breakeyville'],250),
('breakeyville','Breakeyville','Lévis',46.6667,-71.2333,NULL,NULL,ARRAY['charny','saint-lambert-de-lauzon','saint-romuald'],260),
('pintendre','Pintendre','Lévis',46.7167,-71.1333,NULL,NULL,ARRAY['levis','saint-romuald'],270),
('saint-lambert-de-lauzon','Saint-Lambert-de-Lauzon','Chaudière-Appalaches',46.5833,-71.2,NULL,NULL,ARRAY['breakeyville','saint-nicolas','saint-apollinaire'],280),
('saint-apollinaire','Saint-Apollinaire','Chaudière-Appalaches',46.6167,-71.5167,NULL,NULL,ARRAY['laurier-station','saint-lambert-de-lauzon','saint-nicolas'],290),
('laurier-station','Laurier-Station','Chaudière-Appalaches',46.55,-71.6333,NULL,NULL,ARRAY['saint-apollinaire'],300),
('pont-rouge','Pont-Rouge','Portneuf',46.7539,-71.6947,NULL,NULL,ARRAY['donnacona','neuville','sainte-catherine-de-la-jacques-cartier'],310),
('donnacona','Donnacona','Portneuf',46.6772,-71.7331,NULL,NULL,ARRAY['pont-rouge','neuville'],320),
('neuville','Neuville','Portneuf',46.6853,-71.5789,NULL,NULL,ARRAY['pont-rouge','donnacona','saint-augustin-de-desmaures'],330),
('sainte-catherine-de-la-jacques-cartier','Sainte-Catherine-de-la-Jacques-Cartier','Jacques-Cartier',46.8461,-71.6236,NULL,NULL,ARRAY['pont-rouge','val-belair','saint-augustin-de-desmaures','shannon'],340);


-- =========================================================
-- SEED : matériaux actuels (10)
-- =========================================================
INSERT INTO public.seo_materials (slug, name, short_name, keywords, use_cases, pricing_hint, delivery_unit, related_materials, description, sort_order) VALUES
('terre-remplissage','Terre de remplissage','Terre de remplissage',
  ARRAY['terre de remplissage','terre remblai','terre propre','remblai terre'],
  ARRAY['Remplir un trou ou un fond de piscine démolie','Niveler un terrain avant l''aménagement paysager','Créer une pente pour drainer un terrain','Combler une excavation résidentielle ou commerciale'],
  'à partir de 15 $ / verge cube livrée','verge cube',
  ARRAY['remblai','terre-tamisee','sable'],
  'Terre propre, exempte de débris, idéale pour remplir, niveler ou combler un terrain avant l''aménagement final.',10),
('terre-tamisee','Terre tamisée','Terre tamisée',
  ARRAY['terre tamisée','terre à jardin','terre noire','terre végétale'],
  ARRAY['Semer une pelouse neuve','Préparer un potager ou une plate-bande','Rehausser un terrain avant le gazon'],
  'à partir de 35 $ / verge cube livrée','verge cube',
  ARRAY['terre-remplissage','sable'],
  'Terre criblée fine et enrichie, prête pour la pelouse, les plates-bandes et les projets d''aménagement paysager.',20),
('sable','Sable','Sable',
  ARRAY['sable de remplissage','sable naturel','sable de tranchée','sable pour patio'],
  ARRAY['Coussin de pavé-uni ou de dalles','Remplissage de tranchée d''aqueduc ou d''égout','Base compactée pour un abri, un cabanon ou un patio'],
  'à partir de 30 $ / tonne livrée','tonne',
  ARRAY['gravier-0-3-4','poussiere-de-pierre','mg-20'],
  'Sable naturel utilisé pour les tranchées, les coussins de pavés et la base des ouvrages compactés.',30),
('gravier-0-3-4','Gravier 0-3/4','Gravier 0-3/4',
  ARRAY['gravier 0-3/4','gravier concassé','gravier de base','0-3/4'],
  ARRAY['Fondation d''entrée de garage ou de stationnement','Base compactée sous une dalle de béton','Chemin d''accès temporaire de chantier'],
  'à partir de 32 $ / tonne livrée','tonne',
  ARRAY['mg-20','mg-56','pierre-concassee'],
  'Gravier concassé polyvalent, calibre 0 à 3/4 pouce, utilisé comme base compactée pour la plupart des ouvrages résidentiels.',40),
('mg-20','MG-20','MG-20',
  ARRAY['MG-20','MG20','concassé MG-20','criblé MG-20'],
  ARRAY['Base de rue, d''entrée ou de stationnement asphalté','Assise sous un pavé-uni de grande surface','Fondation approuvée pour un ouvrage municipal'],
  'à partir de 34 $ / tonne livrée','tonne',
  ARRAY['gravier-0-3-4','mg-56','pierre-concassee'],
  'Concassé calibré 0 à 20 mm conforme aux normes MTQ, idéal comme fondation supérieure sous asphalte ou pavé.',50),
('mg-56','MG-56','MG-56',
  ARRAY['MG-56','MG56','sous-fondation','concassé MG-56'],
  ARRAY['Sous-fondation d''un stationnement ou d''une rue','Chemin d''accès de chantier avec charges lourdes','Élévation avant la couche de MG-20'],
  'à partir de 30 $ / tonne livrée','tonne',
  ARRAY['mg-20','gravier-0-3-4'],
  'Concassé calibré 0 à 56 mm, utilisé comme sous-fondation pour supporter les couches supérieures et les charges lourdes.',60),
('pierre-concassee','Pierre concassée','Pierre concassée',
  ARRAY['pierre concassée','pierre 3/4','pierre nette','concassé'],
  ARRAY['Drainage autour d''une fondation','Puits de captage ou drain français','Contour de piscine ou de patio'],
  'à partir de 40 $ / tonne livrée','tonne',
  ARRAY['pierre-nette','gravier-0-3-4','poussiere-de-pierre'],
  'Pierre concassée résistante utilisée pour le drainage, les fondations et tous les usages où la portance et le drainage comptent.',70),
('pierre-nette','Pierre nette','Pierre nette',
  ARRAY['pierre nette','pierre lavée','pierre 3/4 nette','drainage'],
  ARRAY['Drain français autour d''une fondation','Lit filtrant sous une installation septique','Contour de piscine creusée'],
  'à partir de 45 $ / tonne livrée','tonne',
  ARRAY['pierre-concassee','gravier-0-3-4'],
  'Pierre lavée sans fines, spécialement conçue pour le drainage et les zones où l''écoulement de l''eau est essentiel.',80),
('poussiere-de-pierre','Poussière de pierre','Poussière de pierre',
  ARRAY['poussière de pierre','poussière 0-1/4','criblure'],
  ARRAY['Coussin fin sous un pavé-uni','Nivellement de surface pour patio','Finition de sentier ou d''allée'],
  'à partir de 32 $ / tonne livrée','tonne',
  ARRAY['sable','gravier-0-3-4'],
  'Poussière de pierre calibrée 0 à 1/4 pouce, idéale comme coussin fin sous pavé-uni ou pour parfaire un nivellement.',90),
('remblai','Remblai','Remblai',
  ARRAY['remblai','remblai propre','matériel de remblayage','remblaiement'],
  ARRAY['Combler une excavation résidentielle','Remplir une fosse septique désaffectée','Relever le niveau d''un terrain avant construction'],
  'livraison à partir de 15 $ / verge cube','verge cube',
  ARRAY['terre-remplissage','sable','gravier-0-3-4'],
  'Matériel de remblayage propre, livré rapidement pour combler, niveler ou relever un terrain avant la suite des travaux.',100);

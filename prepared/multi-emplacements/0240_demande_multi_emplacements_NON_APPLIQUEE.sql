-- NON APPLIQUÉE — proposition additive (demande principale + emplacements).
-- Principe : chaque emplacement reste UNE ligne `submissions` (sa dompe, son
-- numéro `Dompe N` via le trigger zzz_assign_dompe_number existant, ses
-- coordonnées, son statut). La carte, le CRM et les statuts restent donc
-- par emplacement sans changement. Une nouvelle table regroupe les lignes.
-- Les anciennes demandes ont request_group_id NULL : aucune conversion.

CREATE TABLE public.submission_request_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text UNIQUE,              -- numéro de demande principale, compteur distinct
  client_email text NOT NULL,
  client_name text,
  client_phone text,
  location_count integer NOT NULL DEFAULT 0,
  idempotency_key text UNIQUE,             -- anti-doublon (même clé = même demande)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.submission_request_groups TO service_role;
GRANT SELECT ON public.submission_request_groups TO authenticated;
ALTER TABLE public.submission_request_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins lisent les demandes principales" ON public.submission_request_groups
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Compteur à une ligne, préfixe distinct des dompes (aucun chevauchement).
CREATE TABLE public.submission_request_group_counter (id boolean PRIMARY KEY DEFAULT true CHECK (id), last_value bigint NOT NULL DEFAULT 0);
GRANT ALL ON public.submission_request_group_counter TO service_role;
ALTER TABLE public.submission_request_group_counter ENABLE ROW LEVEL SECURITY;
INSERT INTO public.submission_request_group_counter DEFAULT VALUES;

CREATE OR REPLACE FUNCTION public.assign_request_group_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint;
BEGIN
  IF NEW.request_number IS NULL OR btrim(NEW.request_number) = '' THEN
    UPDATE submission_request_group_counter SET last_value = last_value + 1 WHERE id RETURNING last_value INTO n;
    NEW.request_number := 'DR-' || lpad(n::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.assign_request_group_number() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER zzz_assign_request_group_number BEFORE INSERT ON public.submission_request_groups
  FOR EACH ROW EXECUTE FUNCTION public.assign_request_group_number();

ALTER TABLE public.submissions
  ADD COLUMN request_group_id uuid REFERENCES public.submission_request_groups(id),
  ADD COLUMN location_index smallint,      -- 1 = A, 2 = B…
  ADD COLUMN location_label text;
CREATE UNIQUE INDEX submissions_group_location_uq ON public.submissions(request_group_id, location_index)
  WHERE request_group_id IS NOT NULL;

-- Création atomique : groupe + N emplacements dans une seule transaction.
-- Toute erreur (adresse non géolocalisée, limite) annule tout : aucun numéro orphelin
-- de demande; les numéros de dompe consommés par nextval ne sont pas réutilisés.
CREATE OR REPLACE FUNCTION public.create_multi_location_request(p_group jsonb, p_locations jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g_id uuid; g_num text; loc jsonb; i int := 0; s_id uuid; out jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_locations) <> 'array' OR jsonb_array_length(p_locations) NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'locations_count' USING ERRCODE = '22023';
  END IF;
  SELECT id, request_number INTO g_id, g_num FROM submission_request_groups WHERE idempotency_key = p_group->>'idempotency_key';
  IF g_id IS NOT NULL THEN
    RETURN jsonb_build_object('group_id', g_id, 'request_number', g_num, 'replay', true,
      'locations', (SELECT jsonb_agg(jsonb_build_object('id', id, 'dompe_number', dompe_number, 'index', location_index) ORDER BY location_index) FROM submissions WHERE request_group_id = g_id));
  END IF;
  INSERT INTO submission_request_groups(client_email, client_name, client_phone, location_count, idempotency_key)
  VALUES (p_group->>'email', p_group->>'name', p_group->>'phone', jsonb_array_length(p_locations), p_group->>'idempotency_key')
  RETURNING id, request_number INTO g_id, g_num;
  FOR loc IN SELECT * FROM jsonb_array_elements(p_locations) LOOP
    i := i + 1;
    IF (loc->>'latitude') IS NULL OR (loc->>'longitude') IS NULL THEN
      RAISE EXCEPTION 'location_% not geocoded', i USING ERRCODE = '22023';
    END IF;
    -- Insertion déléguée au même chemin que submit-parcours (colonnes existantes);
    -- la liste exacte des colonnes est composée et vérifiée avant activation.
    INSERT INTO submissions(request_group_id, location_index, location_label, address, latitude, longitude,
      materials, quantity, accessibility, access_details, name, email, phone, notes)
    VALUES (g_id, i, chr(64 + i), loc->>'address', (loc->>'latitude')::float8, (loc->>'longitude')::float8,
      ARRAY(SELECT jsonb_array_elements_text(coalesce(loc->'materials','[]'))), loc->>'quantity',
      ARRAY(SELECT jsonb_array_elements_text(coalesce(loc->'vehicles','[]'))), coalesce(loc->'access_details','{}'),
      p_group->>'name', p_group->>'email', p_group->>'phone', loc->>'notes')
    RETURNING id INTO s_id;
    out := out || jsonb_build_object('id', s_id, 'index', i, 'dompe_number', (SELECT dompe_number FROM submissions WHERE id = s_id));
  END LOOP;
  RETURN jsonb_build_object('group_id', g_id, 'request_number', g_num, 'replay', false, 'locations', out);
END $$;
REVOKE EXECUTE ON FUNCTION public.create_multi_location_request(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_multi_location_request(jsonb, jsonb) TO service_role;

-- Retour arrière (additif) : désactiver l'appel; conserver tables/colonnes.

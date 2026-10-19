-- PREPARED ONLY. No requests, offers or CRM dossiers duplicated.
CREATE FUNCTION public.exec03_valid_sector(s jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE a jsonb; p jsonb; k text;
BEGIN
 IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR coalesce(s->>'mode','') NOT IN ('quebec','places','radius','polygon') OR jsonb_typeof(s->'address') IS DISTINCT FROM 'string' OR length(s->>'address')>500 THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['cities','regions'] LOOP
  a:=s->k; IF jsonb_typeof(a) IS DISTINCT FROM 'array' OR jsonb_array_length(a)>100 THEN RETURN false; END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(a) LOOP IF jsonb_typeof(p)<>'string' OR length(p#>>'{}')>150 THEN RETURN false; END IF; END LOOP;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['radiusKm','maxRoadKm','maxMinutes'] LOOP
  p:=s->k; IF p IS NULL THEN RETURN false; END IF;
  IF p<>'null'::jsonb AND (jsonb_typeof(p)<>'number' OR (p#>>'{}')::numeric<=0) THEN RETURN false; END IF;
 END LOOP;
 a:=s->'polygon'; IF jsonb_typeof(a) IS DISTINCT FROM 'array' OR jsonb_array_length(a)>200 THEN RETURN false; END IF;
 IF s->>'mode'='polygon' AND jsonb_array_length(a)<3 THEN RETURN false; END IF;
 IF s->'center' IS NULL THEN RETURN false; END IF;
 IF s->>'mode'='radius' AND (s->'center'='null'::jsonb OR s->'radiusKm'='null'::jsonb) THEN RETURN false; END IF;
 IF s->'center'<>'null'::jsonb THEN a:=a||jsonb_build_array(s->'center'); END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(a) LOOP
  IF jsonb_typeof(p)<>'object' OR jsonb_typeof(p->'lat') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'lng') IS DISTINCT FROM 'number' OR abs((p->>'lat')::numeric)>90 OR abs((p->>'lng')::numeric)>180 THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.exec03_valid_sector(jsonb) FROM PUBLIC;
CREATE TABLE public.entrepreneur_search_preferences (
 user_id uuid NOT NULL,
 company_id uuid NOT NULL REFERENCES public.jsc_companies(id),
 sector jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,company_id),
 CHECK (jsonb_typeof(sector)='object' AND sector->>'mode' IN ('quebec','places','radius','polygon'))
);
GRANT SELECT ON public.entrepreneur_search_preferences TO authenticated;
GRANT ALL ON public.entrepreneur_search_preferences TO service_role;
ALTER TABLE public.entrepreneur_search_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_sector ON public.entrepreneur_search_preferences FOR SELECT TO authenticated
USING (user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.jsc_company_members m WHERE m.user_id=auth.uid() AND m.company_id=entrepreneur_search_preferences.company_id AND m.is_active AND m.archived_at IS NULL));
CREATE FUNCTION public.exec03_sector_preference(_company_id uuid,_sector jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor uuid:=auth.uid(); saved jsonb;
BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.jsc_company_members WHERE user_id=actor AND company_id=_company_id AND is_active AND archived_at IS NULL) THEN RAISE EXCEPTION 'Unauthorized company' USING ERRCODE='42501'; END IF;
 IF _sector IS NOT NULL THEN
  IF jsonb_typeof(_sector)<>'object' OR coalesce(_sector->>'mode','') NOT IN ('quebec','places','radius','polygon') OR octet_length(_sector::text)>65536 THEN RAISE EXCEPTION 'Invalid sector'; END IF;
  IF NOT public.exec03_valid_sector(_sector) THEN RAISE EXCEPTION 'Invalid geometry or limits'; END IF;
  INSERT INTO public.entrepreneur_search_preferences(user_id,company_id,sector) VALUES(actor,_company_id,_sector)
  ON CONFLICT(user_id,company_id) DO UPDATE SET sector=EXCLUDED.sector,updated_at=now();
 END IF;
 SELECT sector INTO saved FROM public.entrepreneur_search_preferences WHERE user_id=actor AND company_id=_company_id;
 RETURN jsonb_build_object('sector',saved);
END $$;
REVOKE ALL ON FUNCTION public.exec03_sector_preference(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.exec03_sector_preference(uuid,jsonb) TO authenticated,service_role;
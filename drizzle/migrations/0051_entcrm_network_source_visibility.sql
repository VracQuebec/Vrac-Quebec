CREATE OR REPLACE FUNCTION public.entcrm_network_source(_type text, _id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE j jsonb;
BEGIN
  -- Même règle que le moteur de dompes entrepreneur : seule une demande admissible est lisible.
  -- Aucune adresse ni coordonnée réelle n'est renvoyée.
  IF _type = 'submission' THEN
    SELECT jsonb_build_object('number', s.dompe_number, 'city', s.city, 'status', s.status, 'materials', s.materials, 'tonnage', s.tonnage)
      INTO j FROM submissions s
     WHERE s.id = _id AND public.is_entrepreneur_visible_dompe(s)
       AND (public.has_role(auth.uid(), 'entrepreneur') OR public.has_role(auth.uid(), 'admin'));
  END IF;
  RETURN j;
END $function$;
REVOKE ALL ON FUNCTION public.entcrm_network_source(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entcrm_network_source(text, uuid) TO authenticated;
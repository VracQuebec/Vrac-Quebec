-- Rattache un entrepreneur approuvé à SA propre entreprise de flotte (création au besoin).
-- Réutilise jsc_companies / jsc_company_members / trucks et leurs RLS existantes.
CREATE OR REPLACE FUNCTION public.fleet_ensure_my_company()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _company uuid;
  _name text;
  _email text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;
  IF NOT public.is_approved_entrepreneur(_uid) THEN
    RAISE EXCEPTION 'Réservé aux entrepreneurs approuvés';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('fleet_ensure_my_company:' || _uid::text));

  SELECT m.company_id INTO _company
  FROM public.jsc_company_members m
  JOIN public.jsc_companies c ON c.id = m.company_id AND c.archived_at IS NULL
  WHERE m.user_id = _uid AND m.is_active AND m.archived_at IS NULL
  ORDER BY (m.role = 'proprietaire') DESC, m.created_at
  LIMIT 1;
  IF _company IS NOT NULL THEN
    RETURN _company;
  END IF;

  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  SELECT NULLIF(btrim(coalesce(e.company, e.name)), '') INTO _name
  FROM public.entrepreneurs e WHERE e.user_id = _uid
  ORDER BY e.created_at LIMIT 1;

  -- availability = 'indisponible' : une entreprise d'entrepreneur n'est jamais
  -- proposée comme transporteur par les moteurs de répartition.
  INSERT INTO public.jsc_companies (name, code, email, availability, is_default, is_active)
  VALUES (
    coalesce(_name, 'Entreprise de ' || coalesce(_email, 'entrepreneur')),
    'ENT-' || upper(left(replace(_uid::text, '-', ''), 10)),
    _email, 'indisponible', false, true
  )
  RETURNING id INTO _company;

  INSERT INTO public.jsc_company_members (company_id, user_id, email, role, is_active)
  VALUES (_company, _uid, _email, 'proprietaire', true);

  RETURN _company;
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_ensure_my_company() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_ensure_my_company() TO authenticated;
CREATE OR REPLACE FUNCTION public.fin05_same_company() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int; j jsonb := to_jsonb(NEW);
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.company_id <> OLD.company_id THEN RAISE EXCEPTION 'Entreprise non modifiable' USING ERRCODE = '42501'; END IF;
  FOR r IN SELECT * FROM (VALUES
    ('fin_accounts', j->>'account_id'), ('fin_accounts', j->>'from_account'), ('fin_accounts', j->>'to_account'),
    ('fin_categories', j->>'category_id'), ('jsc_trucks', j->>'truck_id'),
    ('ent_crm_projects', j->>'project_id'), ('fin_obligations', j->>'obligation_id')) v(tbl, rid)
  WHERE rid IS NOT NULL LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE id = $1 AND company_id = $2', r.tbl) INTO n USING r.rid::uuid, NEW.company_id;
    IF n = 0 THEN RAISE EXCEPTION 'Référence hors entreprise' USING ERRCODE = '42501'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
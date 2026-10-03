CREATE TABLE public.pun_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'travail' CHECK (kind IN ('travail','pause')),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  place_type text NOT NULL DEFAULT 'bureau' CHECK (place_type IN ('bureau','chantier','route','atelier','autre')),
  site_label text,
  client_id uuid REFERENCES public.ent_crm_clients(id) ON DELETE SET NULL,
  note text,
  geo_consent boolean NOT NULL DEFAULT false,
  start_lat double precision, start_lng double precision, start_acc double precision,
  end_lat double precision, end_lng double precision, end_acc double precision,
  source text NOT NULL DEFAULT 'punch' CHECK (source IN ('punch','manuel')),
  status text NOT NULL DEFAULT 'ouvert' CHECK (status IN ('ouvert','soumis','approuve','refuse')),
  decided_by uuid, decided_at timestamptz, decision_reason text,
  archived_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at > started_at)
);
CREATE UNIQUE INDEX pun_one_open ON public.pun_entries(user_id, company_id, kind) WHERE ended_at IS NULL AND archived_at IS NULL;
CREATE INDEX pun_company_time ON public.pun_entries(company_id, started_at);
CREATE TABLE public.pun_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.pun_entries(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  actor uuid DEFAULT auth.uid(),
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pun_entries, public.pun_log TO authenticated;
GRANT ALL ON public.pun_entries, public.pun_log TO service_role;
ALTER TABLE public.pun_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pun_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY r ON public.pun_entries FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.entcrm_can_write(company_id) OR public.entcrm_can_finance(company_id));
CREATE POLICY r ON public.pun_log FOR SELECT TO authenticated USING (public.entcrm_can_write(company_id) OR public.entcrm_can_finance(company_id) OR EXISTS (SELECT 1 FROM public.pun_entries e WHERE e.id = entry_id AND e.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.pun_in(_company uuid, _place text, _site text, _client uuid, _note text, _consent boolean, _lat double precision, _lng double precision, _acc double precision)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF public.entcrm_role(_company) IS NULL OR public.entcrm_role(_company) = 'lecture' THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _client IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ent_crm_clients WHERE id=_client AND company_id=_company) THEN RAISE EXCEPTION 'Client hors entreprise'; END IF;
  SELECT id INTO v FROM pun_entries WHERE user_id=auth.uid() AND company_id=_company AND kind='travail' AND ended_at IS NULL AND archived_at IS NULL;
  IF v IS NOT NULL THEN RETURN v; END IF; -- double clic : même entrée
  INSERT INTO pun_entries(company_id,user_id,started_at,place_type,site_label,client_id,note,geo_consent,start_lat,start_lng,start_acc)
  VALUES (_company,auth.uid(),now(),coalesce(_place,'bureau'),nullif(trim(_site),''),_client,nullif(trim(_note),''),coalesce(_consent,false),
    CASE WHEN _consent THEN _lat END, CASE WHEN _consent THEN _lng END, CASE WHEN _consent THEN _acc END)
  RETURNING id INTO v;
  INSERT INTO pun_log(entry_id,company_id,action,detail) VALUES (v,_company,'entree',jsonb_build_object('lieu',_place,'position',_consent));
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.pun_out(_company uuid, _lat double precision, _lng double precision, _acc double precision)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e pun_entries; t timestamptz := now();
BEGIN
  SELECT * INTO e FROM pun_entries WHERE user_id=auth.uid() AND company_id=_company AND kind='travail' AND ended_at IS NULL AND archived_at IS NULL FOR UPDATE;
  IF e.id IS NULL THEN RETURN NULL; END IF;
  UPDATE pun_entries SET ended_at=t WHERE user_id=auth.uid() AND company_id=_company AND kind='pause' AND ended_at IS NULL AND archived_at IS NULL;
  UPDATE pun_entries SET ended_at=t, status='soumis',
    end_lat=CASE WHEN geo_consent THEN _lat END, end_lng=CASE WHEN geo_consent THEN _lng END, end_acc=CASE WHEN geo_consent THEN _acc END
  WHERE id=e.id;
  INSERT INTO pun_log(entry_id,company_id,action) VALUES (e.id,_company,'sortie');
  RETURN e.id;
END $$;

CREATE OR REPLACE FUNCTION public.pun_break(_company uuid, _start boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w uuid; p uuid;
BEGIN
  SELECT id INTO w FROM pun_entries WHERE user_id=auth.uid() AND company_id=_company AND kind='travail' AND ended_at IS NULL AND archived_at IS NULL;
  IF w IS NULL THEN RAISE EXCEPTION 'Aucun quart en cours'; END IF;
  SELECT id INTO p FROM pun_entries WHERE user_id=auth.uid() AND company_id=_company AND kind='pause' AND ended_at IS NULL AND archived_at IS NULL;
  IF _start THEN
    IF p IS NOT NULL THEN RETURN p; END IF;
    INSERT INTO pun_entries(company_id,user_id,kind,started_at,place_type,status) VALUES (_company,auth.uid(),'pause',now(),'autre','soumis') RETURNING id INTO p;
    INSERT INTO pun_log(entry_id,company_id,action) VALUES (p,_company,'pause_debut');
  ELSIF p IS NOT NULL THEN
    UPDATE pun_entries SET ended_at=now() WHERE id=p;
    INSERT INTO pun_log(entry_id,company_id,action) VALUES (p,_company,'pause_fin');
  END IF;
  RETURN p;
END $$;

-- Saisie manuelle / correction : l'employé soumet pour lui; un gestionnaire peut saisir pour un employé. Toujours un motif.
CREATE OR REPLACE FUNCTION public.pun_manual(_company uuid, _user uuid, _kind text, _start timestamptz, _end timestamptz, _place text, _site text, _client uuid, _reason text, _replace uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid; mgr boolean := public.entcrm_can_write(_company); old pun_entries;
BEGIN
  IF public.entcrm_role(_company) IS NULL OR public.entcrm_role(_company)='lecture' THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _user <> auth.uid() AND NOT mgr THEN RAISE EXCEPTION 'Seul un gestionnaire saisit pour un autre employé' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsc_company_members WHERE company_id=_company AND user_id=_user AND is_active AND archived_at IS NULL) THEN RAISE EXCEPTION 'Employé hors entreprise'; END IF;
  IF length(coalesce(trim(_reason),'')) < 3 THEN RAISE EXCEPTION 'Motif requis'; END IF;
  IF _end IS NULL OR _end <= _start THEN RAISE EXCEPTION 'Heures invalides'; END IF;
  IF _end > now() + interval '5 minutes' THEN RAISE EXCEPTION 'Heure de fin dans le futur'; END IF;
  IF _end - _start > interval '24 hours' THEN RAISE EXCEPTION 'Durée supérieure à 24 h'; END IF;
  IF _replace IS NOT NULL THEN
    SELECT * INTO old FROM pun_entries WHERE id=_replace AND company_id=_company AND archived_at IS NULL FOR UPDATE;
    IF old.id IS NULL THEN RAISE EXCEPTION 'Entrée introuvable'; END IF;
    IF old.status='approuve' AND NOT mgr THEN RAISE EXCEPTION 'Entrée approuvée : correction par un gestionnaire'; END IF;
    IF old.user_id <> _user THEN RAISE EXCEPTION 'Employé différent'; END IF;
    IF old.ended_at IS NULL THEN RAISE EXCEPTION 'Quart en cours : faire la sortie d''abord'; END IF;
    UPDATE pun_entries SET archived_at=now() WHERE id=old.id;
    INSERT INTO pun_log(entry_id,company_id,action,detail) VALUES (old.id,_company,'remplacee',jsonb_build_object('motif',_reason));
  END IF;
  IF EXISTS (SELECT 1 FROM pun_entries WHERE user_id=_user AND company_id=_company AND kind=coalesce(_kind,'travail') AND archived_at IS NULL
     AND tstzrange(started_at, coalesce(ended_at, now())) && tstzrange(_start,_end)) THEN RAISE EXCEPTION 'Chevauche une autre entrée'; END IF;
  INSERT INTO pun_entries(company_id,user_id,kind,started_at,ended_at,place_type,site_label,client_id,source,status,note)
  VALUES (_company,_user,coalesce(_kind,'travail'),_start,_end,coalesce(_place,'bureau'),nullif(trim(_site),''),_client,'manuel','soumis',_reason)
  RETURNING id INTO v;
  INSERT INTO pun_log(entry_id,company_id,action,detail) VALUES (v,_company,'saisie_manuelle',jsonb_build_object('motif',_reason,'remplace',_replace));
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.pun_decide(_company uuid, _ids uuid[], _approve boolean, _reason text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT public.entcrm_can_write(_company) THEN RAISE EXCEPTION 'Réservé aux gestionnaires' USING ERRCODE='42501'; END IF;
  IF NOT _approve AND length(coalesce(trim(_reason),'')) < 3 THEN RAISE EXCEPTION 'Motif requis pour refuser'; END IF;
  WITH u AS (
    UPDATE pun_entries SET status=CASE WHEN _approve THEN 'approuve' ELSE 'refuse' END, decided_by=auth.uid(), decided_at=now(), decision_reason=nullif(trim(_reason),'')
    WHERE id = ANY(_ids) AND company_id=_company AND archived_at IS NULL AND ended_at IS NOT NULL AND status IN ('soumis','refuse','approuve')
    RETURNING id)
  INSERT INTO pun_log(entry_id,company_id,action,detail) SELECT id,_company,CASE WHEN _approve THEN 'approuvee' ELSE 'refusee' END,jsonb_build_object('motif',_reason) FROM u;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Heures prêtes pour la paie : travail − pauses, semaine de 40 h (Loi sur les normes du travail, seuil paramétrable).
CREATE OR REPLACE FUNCTION public.pun_summary(_company uuid, _from date, _to date, _ot_hours numeric DEFAULT 40)
RETURNS TABLE(user_id uuid, full_name text, week date, work_min numeric, break_min numeric, net_min numeric, approved_min numeric, pending_min numeric, regular_min numeric, overtime_min numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (
    SELECT p.user_id, date_trunc('week', p.started_at AT TIME ZONE 'America/Toronto')::date wk, p.kind, p.status,
      extract(epoch FROM (p.ended_at - p.started_at))/60 m
    FROM pun_entries p
    WHERE p.company_id=_company AND p.archived_at IS NULL AND p.ended_at IS NOT NULL AND p.status <> 'refuse'
      AND (p.started_at AT TIME ZONE 'America/Toronto')::date BETWEEN _from AND _to
      AND (public.entcrm_can_write(_company) OR public.entcrm_can_finance(_company) OR p.user_id = auth.uid())),
  a AS (
    SELECT user_id, wk,
      sum(m) FILTER (WHERE kind='travail') w, coalesce(sum(m) FILTER (WHERE kind='pause'),0) b,
      coalesce(sum(m) FILTER (WHERE kind='travail' AND status='approuve'),0) - coalesce(sum(m) FILTER (WHERE kind='pause' AND status='approuve'),0) ap
    FROM e GROUP BY user_id, wk)
  SELECT a.user_id, m.full_name, a.wk, round(coalesce(a.w,0)), round(a.b), round(greatest(coalesce(a.w,0)-a.b,0)), round(greatest(a.ap,0)),
    round(greatest(coalesce(a.w,0)-a.b,0) - greatest(a.ap,0)),
    round(least(greatest(coalesce(a.w,0)-a.b,0), _ot_hours*60)), round(greatest(greatest(coalesce(a.w,0)-a.b,0) - _ot_hours*60, 0))
  FROM a LEFT JOIN jsc_company_members m ON m.company_id=_company AND m.user_id=a.user_id
  ORDER BY m.full_name, a.wk
$$;
REVOKE EXECUTE ON FUNCTION public.pun_in, public.pun_out, public.pun_break, public.pun_manual, public.pun_decide, public.pun_summary FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pun_in, public.pun_out, public.pun_break, public.pun_manual, public.pun_decide, public.pun_summary TO authenticated;
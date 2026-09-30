
CREATE TABLE public.fin_reminder_settings (
  company_id uuid PRIMARY KEY REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  stages int[] NOT NULL DEFAULT '{30,14,7,3,1,0}',
  overdue_every_days int NOT NULL DEFAULT 7 CHECK (overdue_every_days BETWEEN 1 AND 90),
  renewal_days int NOT NULL DEFAULT 30 CHECK (renewal_days BETWEEN 1 AND 365),
  missing_docs boolean NOT NULL DEFAULT true,
  cash_alert boolean NOT NULL DEFAULT true,
  cash_threshold numeric NOT NULL DEFAULT 0,
  cash_horizon_days int NOT NULL DEFAULT 30 CHECK (cash_horizon_days BETWEEN 7 AND 365),
  recipients uuid[],
  channels text[] NOT NULL DEFAULT '{app}',
  digest text NOT NULL DEFAULT 'individuel' CHECK (digest IN ('individuel','quotidien','hebdomadaire')),
  quiet_start int NOT NULL DEFAULT 21 CHECK (quiet_start BETWEEN 0 AND 23),
  quiet_end int NOT NULL DEFAULT 7 CHECK (quiet_end BETWEEN 0 AND 23),
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fin_reminder_overrides (
  obligation_id uuid PRIMARY KEY REFERENCES public.fin_obligations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  muted boolean NOT NULL DEFAULT false,
  stages int[],
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fin_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('a_venir','retard','renouvellement','preavis','piece_manquante','tresorerie')),
  obligation_id uuid REFERENCES public.fin_obligations(id) ON DELETE SET NULL,
  occurrence_id uuid REFERENCES public.fin_occurrences(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.fin_payments(id) ON DELETE SET NULL,
  event_date date NOT NULL,
  stage text NOT NULL,
  amount_known numeric,
  remaining numeric,
  reason text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'a_venir' CHECK (status IN ('a_venir','a_traiter','reporte','resolu')),
  snoozed_until timestamptz,
  resolved_at timestamptz, resolved_reason text,
  history jsonb NOT NULL DEFAULT '[]',
  dedupe_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fin_reminders_company_idx ON public.fin_reminders(company_id, status, event_date);
CREATE INDEX fin_reminders_occ_idx ON public.fin_reminders(occurrence_id) WHERE status <> 'resolu';
CREATE TABLE public.fin_reminder_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id uuid NOT NULL REFERENCES public.fin_reminders(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.jsc_companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('app','courriel','texto')),
  state text NOT NULL DEFAULT 'en_attente' CHECK (state IN ('en_attente','simule','accepte','livre','echoue','annule')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error text,
  sent_at timestamptz, read_at timestamptz,
  history jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reminder_id, user_id, channel)
);
CREATE INDEX fin_rdel_pending_idx ON public.fin_reminder_deliveries(next_attempt_at) WHERE state = 'en_attente';
CREATE INDEX fin_rdel_user_idx ON public.fin_reminder_deliveries(user_id, read_at);

GRANT SELECT ON public.fin_reminder_settings, public.fin_reminder_overrides, public.fin_reminders, public.fin_reminder_deliveries TO authenticated;
GRANT ALL ON public.fin_reminder_settings, public.fin_reminder_overrides, public.fin_reminders, public.fin_reminder_deliveries TO service_role;
ALTER TABLE public.fin_reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_reminder_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_reminder_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lecture finances" ON public.fin_reminder_settings FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY "lecture finances" ON public.fin_reminder_overrides FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY "lecture finances" ON public.fin_reminders FOR SELECT TO authenticated USING (public.fin_can_read(company_id));
CREATE POLICY "ses envois ou gestion" ON public.fin_reminder_deliveries FOR SELECT TO authenticated
  USING (public.fin_can_read(company_id) AND (user_id = auth.uid() OR public.fin_can_write(company_id)));

-- Destinataire encore autorisé (sans auth.uid : utilisable par le traitement planifié)
CREATE OR REPLACE FUNCTION public.fin_member_can_read(_company uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM jsc_company_members m WHERE m.company_id=_company AND m.user_id=_user
    AND m.is_active AND m.archived_at IS NULL AND m.role IN ('proprietaire','gestionnaire','comptabilite','lecture'))
$$;
REVOKE EXECUTE ON FUNCTION public.fin_member_can_read(uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_quiet_until(_now timestamptz, _qs int, _qe int)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE loc timestamp := _now AT TIME ZONE 'America/Toronto'; h int := extract(hour FROM loc); q boolean; e timestamp;
BEGIN
  IF _qs = _qe THEN RETURN NULL; END IF;
  q := CASE WHEN _qs > _qe THEN (h >= _qs OR h < _qe) ELSE (h >= _qs AND h < _qe) END;
  IF NOT q THEN RETURN NULL; END IF;
  e := date_trunc('day', loc) + make_interval(hours => _qe);
  IF e <= loc THEN e := e + interval '1 day'; END IF;
  RETURN e AT TIME ZONE 'America/Toronto';
END $$;

CREATE OR REPLACE FUNCTION public.fin_digest_at(_now timestamptz, _digest text)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE loc timestamp := _now AT TIME ZONE 'America/Toronto'; t timestamp;
BEGIN
  IF _digest = 'individuel' THEN RETURN _now; END IF;
  t := date_trunc('day', loc) + interval '8 hours';
  IF t <= loc THEN t := t + interval '1 day'; END IF;
  IF _digest = 'hebdomadaire' THEN
    WHILE extract(isodow FROM t) <> 1 LOOP t := t + interval '1 day'; END LOOP;
  END IF;
  RETURN t AT TIME ZONE 'America/Toronto';
END $$;

CREATE OR REPLACE FUNCTION public.fin_rem_upsert(_company uuid, _kind text, _obl uuid, _occ uuid, _pay uuid, _date date, _stage text,
  _amount numeric, _remaining numeric, _reason text, _meta jsonb, _key text, _status text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO fin_reminders(company_id, kind, obligation_id, occurrence_id, payment_id, event_date, stage, amount_known, remaining, reason, meta, dedupe_key, status, history)
  VALUES (_company, _kind, _obl, _occ, _pay, _date, _stage, _amount, _remaining, _reason, coalesce(_meta,'{}'), _key, _status,
          jsonb_build_array(jsonb_build_object('at', now(), 'action', 'cree')))
  ON CONFLICT (dedupe_key) DO UPDATE SET
    remaining = EXCLUDED.remaining, amount_known = EXCLUDED.amount_known, reason = EXCLUDED.reason, meta = EXCLUDED.meta,
    status = CASE WHEN fin_reminders.status IN ('resolu') THEN fin_reminders.status
                  WHEN fin_reminders.snoozed_until > now() THEN 'reporte' ELSE EXCLUDED.status END,
    history = CASE WHEN fin_reminders.remaining IS DISTINCT FROM EXCLUDED.remaining AND fin_reminders.status <> 'resolu'
                   THEN fin_reminders.history || jsonb_build_object('at', now(), 'action', 'solde_actualise', 'avant', fin_reminders.remaining, 'apres', EXCLUDED.remaining)
                   ELSE fin_reminders.history END,
    updated_at = now()
$$;
REVOKE EXECUTE ON FUNCTION public.fin_rem_upsert(uuid,text,uuid,uuid,uuid,date,text,numeric,numeric,text,jsonb,text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fin_rem_resolve(_id uuid, _why text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE fin_reminders SET status='resolu', resolved_at=now(), resolved_reason=_why, updated_at=now(),
    history = history || jsonb_build_object('at', now(), 'action', 'resolu', 'motif', _why)
  WHERE id=_id AND status <> 'resolu';
  UPDATE fin_reminder_deliveries SET state='annule', next_attempt_at=NULL,
    history = history || jsonb_build_object('at', now(), 'etat', 'annule', 'motif', _why)
  WHERE reminder_id=_id AND state='en_attente';
$$;
REVOKE EXECUTE ON FUNCTION public.fin_rem_resolve(uuid,text) FROM PUBLIC, anon, authenticated;

-- Traitement planifié : génération, résolution automatique, distribution (mode test)
CREATE OR REPLACE FUNCTION public.fin_reminders_sweep(_company uuid DEFAULT NULL, _now timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record; s record; r record; d record;
  today date := (_now AT TIME ZONE 'America/Toronto')::date;
  st int; days int; n int; stg int[]; qu timestamptz; addr text; allowed boolean;
  created int := 0; resolved int := 0; delivered int := 0; failed int := 0;
  bal numeric; partial boolean; run numeric; short_date date; short_amt numeric; reasons text[];
BEGIN
  FOR c IN SELECT DISTINCT o.company_id FROM fin_obligations o WHERE (_company IS NULL OR o.company_id=_company) AND o.status <> 'archived'
           UNION SELECT company_id FROM fin_reminder_settings WHERE _company IS NULL OR company_id=_company LOOP
    SELECT * INTO s FROM fin_reminder_settings WHERE company_id=c.company_id;
    IF NOT FOUND THEN
      INSERT INTO fin_reminder_settings(company_id) VALUES (c.company_id) ON CONFLICT DO NOTHING;
      SELECT * INTO s FROM fin_reminder_settings WHERE company_id=c.company_id;
    END IF;

    -- 1. Échéances : solde restant = montant − versements validés non annulés
    FOR r IN
      SELECT oc.id, oc.obligation_id, oc.planned_date, oc.amount, oc.status, oc.settle_confirmed_at, ob.label, ob.status AS ostatus,
             ov.muted, ov.stages AS ostages,
             coalesce((SELECT sum(a.amount) FROM fin_allocations a JOIN fin_payments p ON p.id=a.payment_id
                       WHERE a.occurrence_id=oc.id AND a.reversed_at IS NULL AND p.status='validated' AND p.voided_at IS NULL),0) AS paid
      FROM fin_occurrences oc JOIN fin_obligations ob ON ob.id=oc.obligation_id
      LEFT JOIN fin_reminder_overrides ov ON ov.obligation_id=ob.id
      WHERE oc.company_id=c.company_id AND oc.planned_date <= today + 400
        AND (oc.planned_date >= today - 400)
    LOOP
      -- paiement complet, annulation ou exception « muet » : rappels ouverts résolus
      IF r.status <> 'active' OR r.settle_confirmed_at IS NOT NULL OR (r.amount IS NOT NULL AND r.amount - r.paid <= 0.005) OR coalesce(r.muted,false) THEN
        FOR d IN SELECT id FROM fin_reminders WHERE occurrence_id=r.id AND status<>'resolu' LOOP
          PERFORM fin_rem_resolve(d.id, CASE WHEN coalesce(r.muted,false) THEN 'exception_obligation' WHEN r.status<>'active' THEN 'echeance_annulee' ELSE 'paye' END);
          resolved := resolved + 1;
        END LOOP;
        CONTINUE;
      END IF;
      -- date déplacée : anciens rappels remplacés, jamais réexpédiés
      FOR d IN SELECT id FROM fin_reminders WHERE occurrence_id=r.id AND status<>'resolu' AND kind IN ('a_venir','retard') AND event_date <> r.planned_date LOOP
        PERFORM fin_rem_resolve(d.id, 'date_modifiee'); resolved := resolved + 1;
      END LOOP;
      days := r.planned_date - today;
      IF days >= 0 THEN
        stg := coalesce(r.ostages, s.stages);
        SELECT min(x) INTO st FROM unnest(stg) x WHERE x >= days;
        IF st IS NOT NULL THEN
          FOR d IN SELECT id FROM fin_reminders WHERE occurrence_id=r.id AND status<>'resolu' AND kind='a_venir' AND stage <> 'J-'||st LOOP
            PERFORM fin_rem_resolve(d.id, 'etape_suivante');
          END LOOP;
          PERFORM fin_rem_upsert(c.company_id, 'a_venir', r.obligation_id, r.id, NULL, r.planned_date, 'J-'||st, r.amount,
            CASE WHEN r.amount IS NULL THEN NULL ELSE r.amount - r.paid END,
            'Paiement prévu : '||r.label, jsonb_build_object('label', r.label, 'paid', r.paid),
            c.company_id||'|a_venir|'||r.id||'|'||r.planned_date||'|J-'||st, CASE WHEN days=0 THEN 'a_traiter' ELSE 'a_venir' END);
          created := created + 1;
        END IF;
      ELSE
        n := (-days) / s.overdue_every_days;
        FOR d IN SELECT id FROM fin_reminders WHERE occurrence_id=r.id AND status<>'resolu' AND (kind='a_venir' OR (kind='retard' AND stage <> 'R'||n)) LOOP
          PERFORM fin_rem_resolve(d.id, 'remplace_par_retard');
        END LOOP;
        PERFORM fin_rem_upsert(c.company_id, 'retard', r.obligation_id, r.id, NULL, r.planned_date, 'R'||n, r.amount,
          CASE WHEN r.amount IS NULL THEN NULL ELSE r.amount - r.paid END,
          'Paiement en retard : '||r.label, jsonb_build_object('label', r.label, 'paid', r.paid, 'jours_retard', -days),
          c.company_id||'|retard|'||r.id||'|'||r.planned_date||'|R'||n, 'a_traiter');
        created := created + 1;
      END IF;
    END LOOP;

    -- 2. Renouvellements et préavis (seulement si la date existe)
    FOR r IN SELECT ob.id, ob.label, ob.renewal_date, ob.notice_date FROM fin_obligations ob
             LEFT JOIN fin_reminder_overrides ov ON ov.obligation_id=ob.id
             WHERE ob.company_id=c.company_id AND ob.status='active' AND NOT coalesce(ov.muted,false) LOOP
      IF r.renewal_date IS NOT NULL AND r.renewal_date BETWEEN today AND today + s.renewal_days THEN
        PERFORM fin_rem_upsert(c.company_id, 'renouvellement', r.id, NULL, NULL, r.renewal_date, 'unique', NULL, NULL,
          'Renouvellement : '||r.label, jsonb_build_object('label', r.label), c.company_id||'|renouvellement|'||r.id||'|'||r.renewal_date,
          CASE WHEN r.renewal_date - today <= 7 THEN 'a_traiter' ELSE 'a_venir' END);
      END IF;
      IF r.notice_date IS NOT NULL AND r.notice_date BETWEEN today AND today + s.renewal_days THEN
        PERFORM fin_rem_upsert(c.company_id, 'preavis', r.id, NULL, NULL, r.notice_date, 'unique', NULL, NULL,
          'Date limite de préavis : '||r.label, jsonb_build_object('label', r.label), c.company_id||'|preavis|'||r.id||'|'||r.notice_date,
          CASE WHEN r.notice_date - today <= 7 THEN 'a_traiter' ELSE 'a_venir' END);
      END IF;
    END LOOP;
    FOR d IN SELECT fr.id FROM fin_reminders fr JOIN fin_obligations ob ON ob.id=fr.obligation_id
             WHERE fr.company_id=c.company_id AND fr.status<>'resolu' AND fr.kind IN ('renouvellement','preavis')
               AND (fr.event_date < today OR fr.event_date IS DISTINCT FROM CASE fr.kind WHEN 'renouvellement' THEN ob.renewal_date ELSE ob.notice_date END OR ob.status<>'active') LOOP
      PERFORM fin_rem_resolve(d.id, 'date_passee_ou_modifiee');
    END LOOP;

    -- 3. Pièces justificatives manquantes
    IF s.missing_docs THEN
      FOR r IN SELECT p.id, p.amount, p.paid_on, p.payee_name FROM fin_payments p
               WHERE p.company_id=c.company_id AND p.status='validated' AND p.voided_at IS NULL
                 AND p.paid_on BETWEEN today - 90 AND today - 2
                 AND NOT EXISTS (SELECT 1 FROM fin_payment_files f WHERE f.payment_id=p.id) LOOP
        PERFORM fin_rem_upsert(c.company_id, 'piece_manquante', NULL, NULL, r.id, r.paid_on, 'unique', r.amount, NULL,
          'Pièce justificative manquante : règlement à '||coalesce(r.payee_name,'bénéficiaire'), jsonb_build_object('label', r.payee_name),
          c.company_id||'|piece|'||r.id, 'a_traiter');
      END LOOP;
    END IF;
    FOR d IN SELECT fr.id FROM fin_reminders fr LEFT JOIN fin_payments p ON p.id=fr.payment_id
             WHERE fr.company_id=c.company_id AND fr.kind='piece_manquante' AND fr.status<>'resolu'
               AND (NOT s.missing_docs OR p.id IS NULL OR p.voided_at IS NOT NULL OR EXISTS (SELECT 1 FROM fin_payment_files f WHERE f.payment_id=p.id)) LOOP
      PERFORM fin_rem_resolve(d.id, 'piece_recue_ou_sans_objet');
    END LOOP;

    -- 4. Manque de trésorerie prévu (scénario de base, sans hypothèse)
    short_date := NULL;
    IF s.cash_alert THEN
      reasons := '{}';
      SELECT coalesce(sum(b.amount),0), bool_or(b.amount IS NULL) INTO bal, partial FROM (
        SELECT (SELECT fb.amount FROM fin_balances fb WHERE fb.account_id=a.id ORDER BY fb.as_of DESC, fb.created_at DESC LIMIT 1) AS amount
        FROM fin_accounts a WHERE a.company_id=c.company_id AND a.archived_at IS NULL AND a.included AND a.kind IN ('bank','cash') AND a.currency='CAD') b;
      IF bal IS NULL THEN bal := 0; END IF;
      IF coalesce(partial,false) THEN reasons := reasons || 'solde inconnu pour au moins un compte'; END IF;
      IF NOT EXISTS (SELECT 1 FROM fin_accounts a WHERE a.company_id=c.company_id AND a.archived_at IS NULL AND a.included AND a.kind IN ('bank','cash')) THEN
        partial := true; reasons := reasons || 'aucun compte bancaire saisi';
      END IF;
      IF EXISTS (SELECT 1 FROM fin_occurrences oc WHERE oc.company_id=c.company_id AND oc.status='active' AND oc.amount IS NULL
                 AND oc.planned_date BETWEEN today AND today + s.cash_horizon_days) THEN
        partial := true; reasons := reasons || 'montants inconnus';
      END IF;
      run := bal;
      FOR r IN
        SELECT dte, sum(v) AS v FROM (
          SELECT greatest(oc.planned_date, today) AS dte,
                 -(oc.amount - coalesce((SELECT sum(a.amount) FROM fin_allocations a JOIN fin_payments p ON p.id=a.payment_id
                   WHERE a.occurrence_id=oc.id AND a.reversed_at IS NULL AND p.status='validated' AND p.voided_at IS NULL),0)) AS v
          FROM fin_occurrences oc WHERE oc.company_id=c.company_id AND oc.status='active' AND oc.amount IS NOT NULL
            AND oc.settle_confirmed_at IS NULL AND oc.planned_date <= today + s.cash_horizon_days AND oc.planned_date >= today - 400
          UNION ALL
          SELECT greatest(e.expected_on, today), e.amount - coalesce(e.received,0)
          FROM fin_expected_inflows e WHERE e.company_id=c.company_id AND e.archived_at IS NULL AND e.certainty IN ('certain','probable')
            AND e.expected_on <= today + s.cash_horizon_days AND e.amount - coalesce(e.received,0) > 0
        ) m WHERE v <> 0 GROUP BY dte ORDER BY dte
      LOOP
        run := run + r.v;
        IF run < s.cash_threshold THEN short_date := r.dte; short_amt := run; EXIT; END IF;
      END LOOP;
      IF short_date IS NOT NULL THEN
        FOR d IN SELECT id FROM fin_reminders WHERE company_id=c.company_id AND kind='tresorerie' AND status<>'resolu'
                 AND dedupe_key <> c.company_id||'|tresorerie|'||to_char(short_date,'IYYY-IW') LOOP
          PERFORM fin_rem_resolve(d.id, 'prevision_recalculee');
        END LOOP;
        PERFORM fin_rem_upsert(c.company_id, 'tresorerie', NULL, NULL, NULL, short_date, to_char(short_date,'IYYY-IW'), NULL, short_amt,
          'Manque de trésorerie prévu (prévision, aucun paiement effectué)',
          jsonb_build_object('scenario', 'Base (sans hypothèse)', 'calcule_le', _now, 'partiel', coalesce(partial,false),
                             'raisons_partiel', to_jsonb(reasons), 'seuil', s.cash_threshold, 'solde_depart', bal),
          c.company_id||'|tresorerie|'||to_char(short_date,'IYYY-IW'), 'a_traiter');
      END IF;
    END IF;
    IF short_date IS NULL THEN
      FOR d IN SELECT id FROM fin_reminders WHERE company_id=c.company_id AND kind='tresorerie' AND status<>'resolu' LOOP
        PERFORM fin_rem_resolve(d.id, 'plus_de_manque_prevu');
      END LOOP;
    END IF;

    -- 5. Reports échus : retour dans la liste
    UPDATE fin_reminders SET status = CASE WHEN event_date <= today OR kind IN ('retard','piece_manquante','tresorerie') THEN 'a_traiter' ELSE 'a_venir' END,
      snoozed_until = NULL, history = history || jsonb_build_object('at', _now, 'action', 'report_termine')
    WHERE company_id=c.company_id AND status='reporte' AND snoozed_until <= _now;

    -- 6. File de distribution (dédupliquée par rappel, destinataire, canal)
    INSERT INTO fin_reminder_deliveries(reminder_id, company_id, user_id, channel, next_attempt_at, history)
    SELECT fr.id, fr.company_id, m.user_id, ch, fin_digest_at(_now, s.digest), jsonb_build_array(jsonb_build_object('at', _now, 'etat', 'en_attente'))
    FROM fin_reminders fr
    CROSS JOIN unnest(s.channels) ch
    JOIN jsc_company_members m ON m.company_id=fr.company_id AND m.is_active AND m.archived_at IS NULL
      AND ((s.recipients IS NULL AND m.role IN ('proprietaire','comptabilite'))
        OR (s.recipients IS NOT NULL AND m.user_id = ANY(s.recipients) AND m.role IN ('proprietaire','gestionnaire','comptabilite','lecture')))
    WHERE fr.company_id=c.company_id AND fr.status IN ('a_venir','a_traiter')
    ON CONFLICT (reminder_id, user_id, channel) DO NOTHING;
  END LOOP;

  -- 7. Distribution : revérification juste avant, reprises limitées, aucun envoi externe
  FOR d IN SELECT dl.*, fr.status AS rstatus, fr.snoozed_until, fr.kind AS rkind
           FROM fin_reminder_deliveries dl JOIN fin_reminders fr ON fr.id=dl.reminder_id
           WHERE dl.state='en_attente' AND dl.next_attempt_at <= _now AND (_company IS NULL OR dl.company_id=_company)
           ORDER BY dl.next_attempt_at LIMIT 500 FOR UPDATE OF dl SKIP LOCKED LOOP
    SELECT * INTO s FROM fin_reminder_settings WHERE company_id=d.company_id;
    IF d.rstatus='resolu' THEN
      UPDATE fin_reminder_deliveries SET state='annule', next_attempt_at=NULL, history=history||jsonb_build_object('at',_now,'etat','annule','motif','rappel_resolu') WHERE id=d.id; CONTINUE;
    END IF;
    IF d.snoozed_until > _now THEN
      UPDATE fin_reminder_deliveries SET next_attempt_at=d.snoozed_until WHERE id=d.id; CONTINUE;
    END IF;
    allowed := fin_member_can_read(d.company_id, d.user_id);
    IF NOT allowed OR NOT (d.channel = ANY(s.channels)) OR (s.recipients IS NOT NULL AND NOT d.user_id = ANY(s.recipients)) THEN
      UPDATE fin_reminder_deliveries SET state='annule', next_attempt_at=NULL, history=history||jsonb_build_object('at',_now,'etat','annule','motif','droits_ou_preferences') WHERE id=d.id; CONTINUE;
    END IF;
    qu := fin_quiet_until(_now, s.quiet_start, s.quiet_end);
    IF qu IS NOT NULL AND d.channel <> 'app' THEN
      UPDATE fin_reminder_deliveries SET next_attempt_at=qu, history=history||jsonb_build_object('at',_now,'etat','en_attente','motif','heures_calmes') WHERE id=d.id; CONTINUE;
    END IF;
    IF d.channel='app' THEN
      UPDATE fin_reminder_deliveries SET state='livre', sent_at=_now, next_attempt_at=NULL, history=history||jsonb_build_object('at',_now,'etat','livre') WHERE id=d.id;
      delivered := delivered + 1; CONTINUE;
    END IF;
    addr := CASE d.channel
      WHEN 'courriel' THEN (SELECT coalesce(nullif(m.email,''), (SELECT u.email FROM auth.users u WHERE u.id=d.user_id)) FROM jsc_company_members m WHERE m.company_id=d.company_id AND m.user_id=d.user_id LIMIT 1)
      ELSE (SELECT nullif(e.phone,'') FROM entrepreneurs e WHERE e.user_id=d.user_id LIMIT 1) END;
    IF addr IS NULL THEN
      UPDATE fin_reminder_deliveries SET attempts=attempts+1, last_error='adresse_absente',
        state = CASE WHEN attempts+1 >= 3 THEN 'echoue' ELSE 'en_attente' END,
        next_attempt_at = CASE WHEN attempts+1 >= 3 THEN NULL ELSE _now + make_interval(mins => 30*(attempts+1)) END,
        history=history||jsonb_build_object('at',_now,'etat',CASE WHEN attempts+1>=3 THEN 'echoue' ELSE 'reprise_prevue' END,'motif','adresse_absente','essai',attempts+1)
      WHERE id=d.id;
      failed := failed + 1; CONTINUE;
    END IF;
    -- Mode test : aucun prestataire configuré, aucun appel externe. Simulé ≠ livré.
    UPDATE fin_reminder_deliveries SET state='simule', sent_at=_now, next_attempt_at=NULL, attempts=attempts+1,
      history=history||jsonb_build_object('at',_now,'etat','simule','prestataire','non_configure') WHERE id=d.id;
    delivered := delivered + 1;
  END LOOP;

  RETURN jsonb_build_object('rappels', created, 'resolus', resolved, 'distribues', delivered, 'echecs', failed, 'at', _now);
END $$;
REVOKE EXECUTE ON FUNCTION public.fin_reminders_sweep(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- Actions utilisateur
CREATE OR REPLACE FUNCTION public.fin_reminders_run(_company uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  RETURN fin_reminders_sweep(_company, now());
END $$;

CREATE OR REPLACE FUNCTION public.fin_reminder_mark_read(_reminder uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c uuid;
BEGIN
  SELECT company_id INTO c FROM fin_reminders WHERE id=_reminder;
  IF c IS NULL OR NOT fin_can_read(c) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  -- lire ne règle pas la dette : seul l'accusé de lecture change
  UPDATE fin_reminder_deliveries SET read_at=coalesce(read_at, now()) WHERE reminder_id=_reminder AND user_id=auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.fin_reminder_snooze(_reminder uuid, _until timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c uuid;
BEGIN
  SELECT company_id INTO c FROM fin_reminders WHERE id=_reminder AND status<>'resolu';
  IF c IS NULL OR NOT fin_can_write(c) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _until <= now() OR _until > now() + interval '90 days' THEN RAISE EXCEPTION 'Date de report invalide'; END IF;
  UPDATE fin_reminders SET status='reporte', snoozed_until=_until, updated_at=now(),
    history = history || jsonb_build_object('at', now(), 'action', 'reporte', 'jusqua', _until, 'par', auth.uid())
  WHERE id=_reminder;
END $$;

CREATE OR REPLACE FUNCTION public.fin_reminder_prefs_save(_company uuid, _p jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rec uuid[]; ch text[]; stg int[];
BEGIN
  IF NOT fin_can_write(_company) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF _p ? 'recipients' AND jsonb_typeof(_p->'recipients')='array' THEN
    SELECT array_agg(x::uuid) INTO rec FROM jsonb_array_elements_text(_p->'recipients') x;
    IF EXISTS (SELECT 1 FROM unnest(coalesce(rec,'{}')) u WHERE NOT fin_member_can_read(_company, u)) THEN
      RAISE EXCEPTION 'Destinataire non autorisé pour cette entreprise';
    END IF;
  END IF;
  SELECT array_agg(x) INTO ch FROM jsonb_array_elements_text(coalesce(_p->'channels','["app"]')) x WHERE x IN ('app','courriel','texto');
  SELECT array_agg(DISTINCT x::int ORDER BY x::int DESC) INTO stg FROM jsonb_array_elements_text(coalesce(_p->'stages','[30,14,7,3,1,0]')) x WHERE x::int IN (30,14,7,3,1,0);
  INSERT INTO fin_reminder_settings(company_id, stages, overdue_every_days, renewal_days, missing_docs, cash_alert, cash_threshold, cash_horizon_days,
    recipients, channels, digest, quiet_start, quiet_end, updated_by, updated_at)
  VALUES (_company, coalesce(stg,'{}'), coalesce((_p->>'overdue_every_days')::int,7), coalesce((_p->>'renewal_days')::int,30),
    coalesce((_p->>'missing_docs')::boolean,true), coalesce((_p->>'cash_alert')::boolean,true), coalesce((_p->>'cash_threshold')::numeric,0),
    coalesce((_p->>'cash_horizon_days')::int,30), CASE WHEN jsonb_typeof(_p->'recipients')='array' THEN coalesce(rec,'{}') END,
    coalesce(ch,'{app}'), coalesce(_p->>'digest','individuel'), coalesce((_p->>'quiet_start')::int,21), coalesce((_p->>'quiet_end')::int,7), auth.uid(), now())
  ON CONFLICT (company_id) DO UPDATE SET stages=EXCLUDED.stages, overdue_every_days=EXCLUDED.overdue_every_days, renewal_days=EXCLUDED.renewal_days,
    missing_docs=EXCLUDED.missing_docs, cash_alert=EXCLUDED.cash_alert, cash_threshold=EXCLUDED.cash_threshold, cash_horizon_days=EXCLUDED.cash_horizon_days,
    recipients=EXCLUDED.recipients, channels=EXCLUDED.channels, digest=EXCLUDED.digest, quiet_start=EXCLUDED.quiet_start, quiet_end=EXCLUDED.quiet_end,
    updated_by=EXCLUDED.updated_by, updated_at=now();
END $$;

CREATE OR REPLACE FUNCTION public.fin_reminder_override_save(_obligation uuid, _muted boolean, _stages int[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c uuid;
BEGIN
  SELECT company_id INTO c FROM fin_obligations WHERE id=_obligation;
  IF c IS NULL OR NOT fin_can_write(c) THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF NOT coalesce(_muted,false) AND _stages IS NULL THEN DELETE FROM fin_reminder_overrides WHERE obligation_id=_obligation; RETURN; END IF;
  INSERT INTO fin_reminder_overrides(obligation_id, company_id, muted, stages, updated_by)
  VALUES (_obligation, c, coalesce(_muted,false), _stages, auth.uid())
  ON CONFLICT (obligation_id) DO UPDATE SET muted=EXCLUDED.muted, stages=EXCLUDED.stages, updated_by=EXCLUDED.updated_by, updated_at=now();
END $$;

REVOKE EXECUTE ON FUNCTION public.fin_reminders_run(uuid), public.fin_reminder_mark_read(uuid), public.fin_reminder_snooze(uuid,timestamptz),
  public.fin_reminder_prefs_save(uuid,jsonb), public.fin_reminder_override_save(uuid,boolean,int[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_reminders_run(uuid), public.fin_reminder_mark_read(uuid), public.fin_reminder_snooze(uuid,timestamptz),
  public.fin_reminder_prefs_save(uuid,jsonb), public.fin_reminder_override_save(uuid,boolean,int[]) TO authenticated;

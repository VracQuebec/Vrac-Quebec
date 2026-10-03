CREATE OR REPLACE FUNCTION public.obl_reminders_sweep(_today date DEFAULT NULL, _company uuid DEFAULT NULL) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t date := coalesce(_today, obl_today()); it obl_items; o jsonb; th date; best date; step text; w int; n int := 0; r record; ch text; st text;
BEGIN
  FOR it IN SELECT * FROM obl_items WHERE status='ouvert' AND applicability='applicable' AND due_date IS NOT NULL AND (snooze_until IS NULL OR snooze_until <= t)
            AND (_company IS NULL OR company_id=_company) LOOP
    best := NULL; step := NULL;
    FOR o IN SELECT * FROM jsonb_array_elements(it.reminder_offsets) LOOP
      th := CASE WHEN o ? 'months' THEN (it.due_date - make_interval(months => (o->>'months')::int))::date ELSE it.due_date - coalesce((o->>'days')::int, 0) END;
      IF th <= t AND (best IS NULL OR th > best) THEN best := th; step := coalesce(o->>'k', 'r'||(it.due_date - th)); END IF;
    END LOOP;
    IF it.late_weekly AND t > it.due_date THEN
      w := (t - it.due_date) / 7;
      IF w >= 1 THEN step := 'retard_s'||w; END IF;
    END IF;
    CONTINUE WHEN step IS NULL;
    FOR r IN
      SELECT m.user_id, m.email FROM jsc_company_members m
       WHERE m.company_id=it.company_id AND m.is_active AND m.archived_at IS NULL AND m.user_id IS NOT NULL
         AND (m.user_id = it.responsible_user OR (it.responsible_user IS NULL AND m.role IN ('proprietaire','gestionnaire')))
    LOOP
      FOREACH ch IN ARRAY ARRAY['app','email'] LOOP
        st := CASE WHEN ch='app' THEN 'livre'
                   WHEN r.email IS NULL THEN 'sans_adresse'
                   WHEN r.email ~* '(\.invalid|\.test|\.example|@example\.com)$' THEN 'bloque_test'
                   ELSE 'simule' END;
        INSERT INTO obl_deliveries(item_id, company_id, period_year, due_date, step, user_id, channel, state)
        VALUES (it.id, it.company_id, it.period_year, it.due_date, step, r.user_id, ch, st) ON CONFLICT DO NOTHING;
        IF FOUND THEN n := n + 1; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.obl_reminders_sweep(date, uuid) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.obl_reminders_sweep(date);

-- Simulation datée réservée au super admin, entreprises TEST seulement.
CREATE OR REPLACE FUNCTION public.obl_sweep_simulate(_company uuid, _today date) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Accès refusé' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsc_companies WHERE id=_company AND name LIKE 'TEST%') THEN RAISE EXCEPTION 'Simulation réservée aux entreprises TEST'; END IF;
  RETURN public.obl_reminders_sweep(_today, _company);
END $$;
GRANT EXECUTE ON FUNCTION public.obl_sweep_simulate(uuid,date) TO authenticated;
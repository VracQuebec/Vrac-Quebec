DO $m$
DECLARE src text;
BEGIN
  src := pg_get_functiondef('public.fin_reminders_sweep(uuid,timestamptz)'::regprocedure);
  IF position('coordonnees_a_completer' IN src) = 0 THEN
    src := replace(src, 'IF addr IS NULL THEN',
      'IF addr IS NULL THEN
      -- erreur permanente : aucune reprise, coordonnées du destinataire à compléter
      UPDATE fin_reminder_deliveries SET attempts=attempts+1, last_error=''coordonnees_a_completer'', state=''echoue'', next_attempt_at=NULL,
        history=history||jsonb_build_object(''at'',_now,''etat'',''echoue'',''motif'',''coordonnees_a_completer'',''permanent'',true) WHERE id=d.id;
      failed := failed + 1; CONTINUE;');
    EXECUTE src;
  END IF;
END $m$;
REVOKE EXECUTE ON FUNCTION public.fin_reminders_sweep(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

-- Cloche : lecture des rappels « application » déjà distribués, droits revérifiés à chaque lecture
CREATE OR REPLACE FUNCTION public.fin_my_bell(_limit int DEFAULT 30)
RETURNS TABLE(reminder_id uuid, company_id uuid, company_name text, kind text, reason text, event_date date, remaining numeric, read_at timestamptz, created_at timestamptz, scenario text, partial boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.company_id, c.name, r.kind, r.reason, r.event_date, r.remaining, d.read_at, coalesce(d.sent_at, d.created_at),
         r.meta->>'scenario', coalesce((r.meta->>'partiel')::boolean, false)
  FROM fin_reminder_deliveries d
  JOIN fin_reminders r ON r.id = d.reminder_id
  JOIN jsc_companies c ON c.id = r.company_id
  WHERE d.user_id = auth.uid() AND d.channel = 'app' AND d.state = 'livre'
    AND r.status IN ('a_venir','a_traiter')
    AND (r.snoozed_until IS NULL OR r.snoozed_until <= now())
    AND public.fin_can_read(r.company_id)
  ORDER BY coalesce(d.sent_at, d.created_at) DESC
  LIMIT least(greatest(_limit,1),100)
$$;
REVOKE EXECUTE ON FUNCTION public.fin_my_bell(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_my_bell(int) TO authenticated;
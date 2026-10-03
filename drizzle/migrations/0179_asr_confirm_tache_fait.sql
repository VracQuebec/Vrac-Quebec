DO $$ DECLARE def text; BEGIN
  def := pg_get_functiondef('public.asr_renewal_confirm(uuid,text,jsonb,uuid)'::regprocedure);
  def := replace(def, 'SET status=''termine''', 'SET status=''fait''');
  def := replace(def, 'EXCEPTION WHEN check_violation THEN RAISE EXCEPTION ''Dates invalides : l''''échéance doit suivre la prise d''''effet'';', '');
  def := replace(def, 'SELECT * INTO o FROM asr_periods WHERE id=r.period_id;', 'IF (_f->>''expires_on'')::date <= (_f->>''effective_from'')::date THEN RAISE EXCEPTION ''Dates invalides : l''''échéance doit suivre la prise d''''effet''; END IF;
  SELECT * INTO o FROM asr_periods WHERE id=r.period_id;');
  EXECUTE def;
END $$;
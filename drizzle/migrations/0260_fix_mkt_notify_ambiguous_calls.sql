-- Les appels à 9 arguments de mkt_notify étaient ambigus (3 surcharges avec valeurs par défaut) :
-- invitations, soumissions, attributions et automatisations échouaient. On cible explicitement la version à 11 arguments.
DO $mig$
DECLARE f text; d text; n int;
BEGIN
  FOREACH f IN ARRAY array['mkt_notify_invitation_trg','mkt_notify_bid_trg','mkt_notify_award_trg','mkt_run_automations'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p WHERE p.proname = f AND p.pronamespace = 'public'::regnamespace;
    d := regexp_replace(d, '(''/[a-z/-]+'', ''(info|succes|warning)'')\)', '\1, NULL::text, ''{}''::jsonb)', 'g');
    EXECUTE d;
  END LOOP;
END
$mig$;
CREATE OR REPLACE FUNCTION public.mkt_notify_request_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Appel complet (11 arguments) : évite l'ambiguïté entre les surcharges de mkt_notify
  -- qui faisait échouer toute nouvelle demande de services.
  PERFORM public.mkt_notify('admin'::text,'nouvelle_demande'::text,'Nouvelle demande '||coalesce(NEW.request_number,''),
    NEW.title, NULL::uuid, NULL::uuid, NEW.id, '/admin/marche/soumissions'::text, 'info'::text,
    'mkt:req:new:'||NEW.id::text, '{}'::jsonb);
  IF NEW.client_user_id IS NOT NULL THEN
    PERFORM public.mkt_notify('client'::text,'demande_recue'::text,'Votre demande a été reçue'::text,
      'Vrac Québec recherche les entreprises partenaires les mieux adaptées à votre projet.'::text,
      NEW.client_user_id, NULL::uuid, NEW.id, '/mes-soumissions'::text, 'info'::text,
      'mkt:req:recue:'||NEW.id::text, '{}'::jsonb);
  END IF;
  RETURN NEW;
END $function$;
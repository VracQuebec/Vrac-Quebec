CREATE OR REPLACE FUNCTION public.entr_notify_submission()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE lnk text; ctx text; st text; mat text;
BEGIN
  IF NEW.created_by IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  lnk := '/entrepreneur/demandes?demande=' || NEW.id::text;
  mat := coalesce(nullif(NEW.quote_material,''), nullif(array_to_string(NEW.materials, ', '),''), nullif(NEW.other_material,''));
  ctx := nullif(concat_ws(' — ', mat, nullif(NEW.city,'')), '');
  st := public.entr_status_label(NEW.status);
  PERFORM public.mkt_notify('client','demande_statut',
    CASE NEW.status
      WHEN 'acceptee' THEN 'Votre demande a été acceptée'
      WHEN 'refusee' THEN 'Votre demande a été refusée'
      WHEN 'terminee' THEN 'Votre demande est complétée'
      WHEN 'annulee' THEN 'Votre demande a été annulée'
      ELSE 'Mise à jour de votre demande'
    END,
    concat_ws(' · ', 'Nouveau statut : '||st, ctx),
    NEW.created_by, NULL, NULL, lnk,
    CASE WHEN NEW.status IN ('refusee','annulee') THEN 'alerte'
         WHEN NEW.status IN ('acceptee','terminee') THEN 'succes' ELSE 'info' END,
    'entr:sub:statut:'||NEW.id::text||':'||NEW.status,
    jsonb_build_object('source','submission','request_id',NEW.id));
  RETURN NEW;
END $function$;
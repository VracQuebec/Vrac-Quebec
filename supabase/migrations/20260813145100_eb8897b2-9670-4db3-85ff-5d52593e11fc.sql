CREATE OR REPLACE FUNCTION public.log_transport_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.transport_request_history (request_id, field_key, old_value, new_value, user_id, user_email)
  VALUES (
    NEW.id,
    'created',
    NULL,
    to_jsonb(COALESCE(NEW.request_number, NEW.id::text)),
    NEW.user_id,
    NEW.client_email
  );
  RETURN NEW;
END;
$function$;
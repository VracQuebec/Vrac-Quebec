CREATE OR REPLACE FUNCTION public.drv_mission_end(_mission uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM drv_missions WHERE id=_mission AND requisition_id IS NOT NULL) AND NOT public.driver_mission_access(_mission,true) THEN RAISE EXCEPTION 'Accès mission retiré' USING ERRCODE='42501'; END IF;
  UPDATE drv_missions SET ended_at=now() WHERE id=_mission AND user_id=auth.uid() AND ended_at IS NULL;
END $function$

CREATE OR REPLACE FUNCTION public.drv_mission_point(_mission uuid, _lat double precision, _lng double precision, _acc double precision, _at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM drv_missions WHERE id=_mission AND requisition_id IS NOT NULL) AND NOT public.driver_mission_access(_mission,true) THEN RAISE EXCEPTION 'Accès mission retiré' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM drv_missions WHERE id=_mission AND user_id=auth.uid() AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'Mission inactive' USING ERRCODE='42501'; END IF;
  IF _lat NOT BETWEEN -90 AND 90 OR _lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'Position invalide'; END IF;
  INSERT INTO drv_points(mission_id, lat, lng, accuracy, recorded_at) VALUES (_mission, _lat, _lng, _acc, least(coalesce(_at, now()), now()));
END $function$

CREATE OR REPLACE FUNCTION public.drv_mission_start(_sub uuid, _driver text, _truck text, _consent boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE='42501'; END IF;
  IF NOT coalesce(_consent,false) THEN RAISE EXCEPTION 'Activation explicite du suivi requise'; END IF;
  SELECT id INTO _id FROM drv_missions WHERE user_id=auth.uid() AND ended_at IS NULL;
  IF FOUND THEN RETURN _id; END IF;
  INSERT INTO drv_missions(user_id, entrepreneur_id, submission_id, driver_label, truck_label, consent_at)
  VALUES (auth.uid(), cpn_my_entrepreneur(), _sub, nullif(trim(_driver),''), nullif(trim(_truck),''), now()) RETURNING id INTO _id;
  RETURN _id;
END $function$

CREATE OR REPLACE FUNCTION public.entcrm_can_write(_company_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT coalesce(public.entcrm_role(_company_id) IN ('support','proprietaire','gestionnaire'), false)
     AND public.entcrm_paid(_company_id)
$function$

CREATE OR REPLACE FUNCTION public.entcrm_role(_company_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN public.has_role(auth.uid(),'admin') THEN 'support'
  ELSE (SELECT m.role FROM public.jsc_company_members m WHERE m.company_id=_company_id AND m.user_id=auth.uid() AND m.is_active AND m.archived_at IS NULL LIMIT 1) END
$function$

CREATE OR REPLACE FUNCTION public.workbench_manager(_company uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT auth.uid() IS NOT NULL AND (public.has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM public.jsc_company_members m WHERE m.company_id=_company AND m.user_id=auth.uid() AND m.is_active AND m.archived_at IS NULL AND m.role IN ('proprietaire','gestionnaire') AND public.entcrm_can_write(_company)))
$function$


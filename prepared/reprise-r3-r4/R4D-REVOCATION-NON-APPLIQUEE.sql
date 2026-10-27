-- Corrigé 2026-10-27 : les missions sans réquisition (suivi entrepreneur existant) gardent leurs règles actuelles.
-- Additive scope for existing GPS missions; old unbound rows stay unavailable to drivers.
ALTER TABLE public.drv_missions ADD COLUMN company_id uuid;
ALTER TABLE public.drv_missions ADD COLUMN requisition_id uuid REFERENCES public.transport_requests(id);
CREATE FUNCTION public.driver_company_active(c uuid,u uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM jsc_drivers d JOIN jsc_company_members m ON m.company_id=d.company_id AND m.user_id=d.user_id WHERE d.company_id=c AND d.user_id=u AND d.is_active AND d.archived_at IS NULL AND m.is_active AND m.archived_at IS NULL AND m.role='chauffeur');
$$;
CREATE FUNCTION public.driver_notification_access(c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM jsc_company_members m WHERE m.company_id=c AND m.user_id=auth.uid() AND m.is_active AND m.archived_at IS NULL)
 AND (NOT EXISTS(SELECT 1 FROM jsc_drivers d WHERE d.company_id=c AND d.user_id=auth.uid()) OR driver_company_active(c));
$$;
CREATE FUNCTION public.driver_mission_access(mid uuid,writing boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM drv_missions m JOIN transport_requests t ON t.id=m.requisition_id WHERE m.id=mid AND m.company_id=t.requisition_company_id AND m.user_id=auth.uid() AND driver_company_active(m.company_id) AND requisition_access(t)='driver' AND (NOT writing OR (m.ended_at IS NULL AND t.requisition_state IN ('accepted','running'))));
$$;
REVOKE ALL ON FUNCTION public.driver_company_active(uuid,uuid),public.driver_mission_access(uuid,boolean),public.driver_notification_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.driver_company_active(uuid,uuid),public.driver_mission_access(uuid,boolean),public.driver_notification_access(uuid) TO authenticated;
ALTER POLICY "Admins manage notifications" ON public.jsc_notifications USING(jsc_can_manage(auth.uid()) OR (user_id=auth.uid() AND driver_company_active(company_id))) WITH CHECK(jsc_can_manage(auth.uid()));
ALTER POLICY "portal reads own notifications" ON public.jsc_notifications USING(user_id=auth.uid() AND driver_notification_access(company_id));
ALTER POLICY "portal updates own notifications" ON public.jsc_notifications USING(user_id=auth.uid() AND driver_notification_access(company_id)) WITH CHECK(user_id=auth.uid() AND driver_notification_access(company_id));
ALTER POLICY "missions read" ON public.drv_missions USING(has_role(auth.uid(),'admin') OR (user_id=auth.uid() AND (requisition_id IS NULL OR driver_mission_access(id))) OR entrepreneur_id=cpn_my_entrepreneur());
ALTER POLICY "points read" ON public.drv_points USING(EXISTS(SELECT 1 FROM drv_missions m WHERE m.id=mission_id AND (has_role(auth.uid(),'admin') OR (m.user_id=auth.uid() AND (m.requisition_id IS NULL OR driver_mission_access(m.id))) OR m.entrepreneur_id=cpn_my_entrepreneur())));

-- Guard existing SECURITY DEFINER point/end/batch writes too: cannot bypass via old RPC.
CREATE FUNCTION public.driver_tracking_write_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT has_role(auth.uid(),'admin') THEN
  IF TG_TABLE_NAME='drv_points' THEN IF EXISTS(SELECT 1 FROM drv_missions WHERE id=NEW.mission_id AND requisition_id IS NOT NULL) AND NOT driver_mission_access(NEW.mission_id,true) THEN RAISE EXCEPTION 'Accès mission retiré' USING ERRCODE='42501'; END IF;
  ELSE
   IF NEW.requisition_id IS NULL AND (TG_OP='INSERT' OR OLD.requisition_id IS NULL) THEN NULL; -- mission entrepreneur historique : règles existantes inchangées
   ELSIF TG_OP='INSERT' THEN
    IF NOT EXISTS(SELECT 1 FROM transport_requests t WHERE t.id=NEW.requisition_id AND t.requisition_company_id=NEW.company_id AND requisition_access(t)='driver' AND t.requisition_state IN ('accepted','running') AND NEW.user_id=auth.uid()) THEN RAISE EXCEPTION 'Mission autorisée requise' USING ERRCODE='42501'; END IF;
   ELSIF NOT driver_mission_access(OLD.id,true) THEN RAISE EXCEPTION 'Accès mission retiré' USING ERRCODE='42501'; END IF;
  END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER driver_tracking_write_guard BEFORE INSERT OR UPDATE ON public.drv_points FOR EACH ROW EXECUTE FUNCTION driver_tracking_write_guard();
CREATE TRIGGER driver_mission_write_guard BEFORE INSERT OR UPDATE ON public.drv_missions FOR EACH ROW EXECUTE FUNCTION driver_tracking_write_guard();

-- Versioned personal mission starts from assigned request, not supplied driver/truck labels.
CREATE FUNCTION public.driver_tracking_start(rid uuid,consent boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t transport_requests; mid uuid;
BEGIN
 SELECT * INTO t FROM transport_requests WHERE id=rid FOR UPDATE;
 IF NOT coalesce(consent,false) OR requisition_access(t) IS DISTINCT FROM 'driver' OR t.requisition_state NOT IN ('accepted','running') THEN RAISE EXCEPTION 'Mission non autorisée' USING ERRCODE='42501'; END IF;
 SELECT id INTO mid FROM drv_missions WHERE requisition_id=rid AND user_id=auth.uid() AND ended_at IS NULL;
 IF mid IS NOT NULL THEN RETURN mid; END IF;
 -- INSERT trigger accepts only the exact assigned request bound below.
 INSERT INTO drv_missions(user_id,company_id,requisition_id,submission_id,consent_at) VALUES(auth.uid(),t.requisition_company_id,t.id,t.origin_submission_id,now()) RETURNING id INTO mid;
 RETURN mid;
END $$;
REVOKE ALL ON FUNCTION public.driver_tracking_start(uuid,boolean),public.driver_tracking_write_guard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.driver_tracking_start(uuid,boolean) TO authenticated;

-- Delivery RLS already delegates identity to jsc_my_driver_ids; preserve the existing
-- protected-column trigger and add a current identity guard covering SECURITY DEFINER writes.
CREATE FUNCTION public.driver_delivery_access_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT jsc_can_manage(auth.uid()) AND (NOT driver_company_active(OLD.company_id) OR OLD.driver_id NOT IN(SELECT jsc_my_driver_ids()) OR (NEW.company_id,NEW.driver_id) IS DISTINCT FROM (OLD.company_id,OLD.driver_id)) THEN RAISE EXCEPTION 'Accès livraison retiré' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER driver_delivery_access_guard BEFORE UPDATE ON public.jsc_deliveries FOR EACH ROW EXECUTE FUNCTION driver_delivery_access_guard();
REVOKE ALL ON FUNCTION public.driver_delivery_access_guard() FROM PUBLIC,anon;
DO $$BEGIN
 IF md5(pg_get_functiondef('public.jsc_my_driver_ids()'::regprocedure))<>'0a2c44196ce3066892e94e223a22d165' THEN RAISE EXCEPTION 'Définition chauffeur divergente : arrêt'; END IF;
 IF md5(pg_get_functiondef('public.jsc_driver_portal(date,date)'::regprocedure))<>'0acb8294ceb292b0069c8be7a1b37e2d' THEN RAISE EXCEPTION 'Portail chauffeur divergent : arrêt'; END IF;
END$$;

CREATE OR REPLACE FUNCTION public.jsc_my_driver_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT d.id FROM public.jsc_drivers d
 JOIN public.jsc_company_members m ON m.company_id=d.company_id AND m.user_id=d.user_id
 WHERE d.user_id=auth.uid() AND d.is_active AND d.archived_at IS NULL
   AND m.is_active AND m.archived_at IS NULL AND m.role='chauffeur';
$$;

CREATE OR REPLACE FUNCTION public.jsc_driver_portal(_from date DEFAULT NULL,_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH ids AS (SELECT jsc_my_driver_ids() AS id), selected_driver AS (
  SELECT d.* FROM jsc_drivers d JOIN ids ON ids.id=d.id ORDER BY d.id LIMIT 1
 )
 SELECT jsonb_build_object(
  'driver',(SELECT to_jsonb(d)-'internal_notes'-'hourly_cost' FROM selected_driver d),
  'truck',(SELECT jsonb_build_object('id',t.id,'company_id',t.company_id,'name',t.name) FROM jsc_trucks t JOIN selected_driver d ON t.id=d.default_truck_id AND t.company_id=d.company_id WHERE t.is_active AND t.archived_at IS NULL),
  'deliveries',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id',d.id,'delivery_number',d.delivery_number,'status',d.status,
   'scheduled_date',d.scheduled_date,'scheduled_time',d.scheduled_time,
   'delivery_address',d.delivery_address,'city',d.city,'postal_code',d.postal_code,
   'latitude',d.latitude,'longitude',d.longitude,'quantity',d.quantity,'quantity_unit',d.quantity_unit,'distance_km',d.distance_km,
   'notes',d.notes,'driver_notes',d.driver_notes,'signature_name',d.signature_name,'proof_photos',d.proof_photos,
   'material',(SELECT m.name FROM jsc_materials m WHERE m.id=d.material_id),
   'pickup',(SELECT p.name FROM jsc_pickup_locations p WHERE p.id=d.pickup_location_id),
   'client',(SELECT c.name FROM jsc_clients c WHERE c.id=d.client_id)
  ) ORDER BY d.scheduled_date,d.scheduled_time)
  FROM jsc_deliveries d JOIN jsc_drivers owner_driver ON owner_driver.id=d.driver_id AND owner_driver.company_id=d.company_id
  WHERE d.driver_id IN(SELECT id FROM ids) AND d.archived_at IS NULL AND (_from IS NULL OR d.scheduled_date>=_from) AND (_to IS NULL OR d.scheduled_date<=_to)),'[]'::jsonb),
  'generated_at',now());
$$;

ALTER POLICY "portal driver reads own file" ON public.jsc_drivers
 USING(user_id=auth.uid() AND id IN(SELECT public.jsc_my_driver_ids()));

CREATE OR REPLACE FUNCTION public.driver_company_active(c uuid,u uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM jsc_drivers d JOIN jsc_company_members m ON m.company_id=d.company_id AND m.user_id=d.user_id WHERE d.company_id=c AND d.user_id=u AND d.is_active AND d.archived_at IS NULL AND m.is_active AND m.archived_at IS NULL AND m.role='chauffeur');
$$;
-- Vrai si l'utilisateur n'est pas chauffeur lié dans cette entreprise, ou s'il l'est encore activement.
CREATE OR REPLACE FUNCTION public.driver_identity_current(c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM jsc_drivers WHERE company_id=c AND user_id=auth.uid()) OR public.driver_company_active(c);
$$;
-- Notifications sans entreprise : un utilisateur chauffeur entièrement révoqué (aucune identité active) les perd; les autres utilisateurs ne changent pas.
CREATE OR REPLACE FUNCTION public.driver_user_current() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT NOT EXISTS(SELECT 1 FROM jsc_drivers WHERE user_id=auth.uid())
  OR EXISTS(SELECT 1 FROM jsc_drivers d WHERE d.user_id=auth.uid() AND public.driver_company_active(d.company_id))
  OR EXISTS(SELECT 1 FROM jsc_company_members m WHERE m.user_id=auth.uid() AND m.is_active AND m.archived_at IS NULL AND m.role<>'chauffeur');
$$;
REVOKE ALL ON FUNCTION public.driver_company_active(uuid,uuid),public.driver_identity_current(uuid),public.driver_user_current() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.driver_company_active(uuid,uuid),public.driver_identity_current(uuid),public.driver_user_current() TO authenticated;

ALTER POLICY "Admins manage notifications" ON public.jsc_notifications
 USING(jsc_can_manage(auth.uid()) OR (user_id=auth.uid() AND CASE WHEN company_id IS NULL THEN public.driver_user_current() ELSE public.driver_identity_current(company_id) END))
 WITH CHECK(jsc_can_manage(auth.uid()));
ALTER POLICY "portal reads own notifications" ON public.jsc_notifications
 USING(user_id=auth.uid() AND CASE WHEN company_id IS NULL THEN public.driver_user_current() ELSE public.driver_identity_current(company_id) END);
ALTER POLICY "portal updates own notifications" ON public.jsc_notifications
 USING(user_id=auth.uid() AND CASE WHEN company_id IS NULL THEN public.driver_user_current() ELSE public.driver_identity_current(company_id) END)
 WITH CHECK(user_id=auth.uid() AND CASE WHEN company_id IS NULL THEN public.driver_user_current() ELSE public.driver_identity_current(company_id) END);

ALTER POLICY "ecd_read" ON public.ent_company_documents USING(entcrm_can_read(company_id) AND public.driver_identity_current(company_id));
ALTER POLICY "company_docs_read" ON storage.objects USING(bucket_id='company-docs' AND entcrm_can_read(((storage.foldername(name))[1])::uuid) AND public.driver_identity_current(((storage.foldername(name))[1])::uuid));
ALTER POLICY "asr_files_read" ON storage.objects USING(bucket_id='asr-files' AND public.driver_identity_current(((storage.foldername(name))[1])::uuid) AND (asr_can_read(((storage.foldername(name))[1])::uuid) OR EXISTS(SELECT 1 FROM asr_documents d WHERE d.storage_path=objects.name AND asr_driver_doc_ok(d.id))));
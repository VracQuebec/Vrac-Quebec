-- Pinned existing portal, targeted correction only. Helper correction must precede this file.
DO $$BEGIN
 IF md5(pg_get_functiondef('public.jsc_driver_portal(date,date)'::regprocedure))<>'0acb8294ceb292b0069c8be7a1b37e2d' THEN RAISE EXCEPTION 'Portail chauffeur divergent : arrêt'; END IF;
END$$;
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
-- CREATE OR REPLACE preserves the existing ACL. No extra general CRM/finance grants.
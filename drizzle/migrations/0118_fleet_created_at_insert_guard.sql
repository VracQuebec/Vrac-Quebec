-- Flotte : horodatage d'inscription fixé par le serveur à la création (le client ne peut pas l'antidater); l'immuabilité en modification existe déjà (fleet_keep_created_at).
-- Les traitements serveur (service_role / propriétaire) conservent leur valeur explicite (imports déjà autorisés). Aucune donnée existante modifiée.
CREATE OR REPLACE FUNCTION public.fleet_stamp_created_at()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') OR NEW.created_at IS NULL THEN NEW.created_at := now(); END IF;
  RETURN NEW;
END $function$;
DO $d$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['trucks','fleet_costs','fleet_expenses','fleet_inspection_templates','fleet_inspections','fleet_maintenance','fleet_meter_readings','fleet_part_refs','fleet_parts','fleet_repairs','fleet_service_programs','fleet_work_items'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_stamp_created_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_stamp_created_at BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fleet_stamp_created_at()', t);
  END LOOP;
END $d$;
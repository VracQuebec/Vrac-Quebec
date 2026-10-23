-- PREPARED ONLY: additive extension. No historical association/backfill or hosted activation.
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS edit_company_id uuid REFERENCES public.jsc_companies(id);
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS edit_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.submissions ADD COLUMN IF NOT EXISTS edit_details jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.transport_requests ADD COLUMN IF NOT EXISTS requisition_company_id uuid REFERENCES public.jsc_companies(id);
ALTER TABLE public.transport_requests ADD COLUMN IF NOT EXISTS requisition_driver_id uuid REFERENCES public.jsc_drivers(id);
ALTER TABLE public.transport_requests ADD COLUMN IF NOT EXISTS requisition_truck_id uuid REFERENCES public.jsc_trucks(id);
ALTER TABLE public.transport_requests ADD COLUMN IF NOT EXISTS requisition_state text;
ALTER TABLE public.transport_requests ADD COLUMN IF NOT EXISTS requisition_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.transport_requests ADD COLUMN IF NOT EXISTS requisition_details jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.transport_requests ADD COLUMN IF NOT EXISTS requisition_accepted_snapshot jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS submission_edit_operation ON public.ent_crm_history(actor_id,(after->>'operation')) WHERE entity='submission_edit' AND after ? 'operation';
CREATE UNIQUE INDEX IF NOT EXISTS requisition_operation ON public.transport_request_events(actor_id,(details->>'operation')) WHERE action LIKE 'requisition_%' AND details ? 'operation';

CREATE FUNCTION public.workbench_manager(_company uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (public.has_role(auth.uid(),'admin') OR EXISTS(SELECT 1 FROM public.jsc_company_members m WHERE m.company_id=_company AND m.user_id=auth.uid() AND m.is_active AND m.archived_at IS NULL AND m.role IN ('proprietaire','gestionnaire') AND public.entcrm_can_write(_company)))
$$;
REVOKE ALL ON FUNCTION public.workbench_manager(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.workbench_manager(uuid) TO authenticated,service_role;

CREATE FUNCTION public.submission_edit_values(s public.submissions) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT jsonb_build_object('address',coalesce(s.formatted_address,s.address),'materials',to_jsonb(s.materials),'material_description',coalesce(s.edit_details->>'material_description',s.description,''),'quantity_value',s.quantity_value,'quantity_unit',coalesce(s.quantity_unit,'inconnu'),'desired_date',s.desired_date,'desired_time',s.edit_details->>'desired_time','truck_type_key',s.truck_type_key,'access_instructions',coalesce(s.edit_details->>'access_instructions',s.access_details->>'commentaire',''))
$$;
REVOKE ALL ON FUNCTION public.submission_edit_values(public.submissions) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submission_edit_values(public.submissions) TO service_role;

CREATE FUNCTION public.submission_edit_read(_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.submissions; allowed boolean;
BEGIN
 SELECT * INTO s FROM public.submissions WHERE id=_id;
 IF s.id IS NULL OR s.edit_company_id IS NULL OR NOT public.workbench_manager(s.edit_company_id) OR (s.created_by IS DISTINCT FROM auth.uid() AND NOT public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Dossier ou entreprise non autorisés' USING ERRCODE='42501'; END IF;
 allowed:=s.status NOT IN ('termine','terminee','annule','annulee','refuse','refusee','en_cours') AND s.availability_status IS DISTINCT FROM 'owner_closed';
 RETURN jsonb_build_object('id',s.id,'company_id',s.edit_company_id,'version',s.edit_version,'editable',allowed,'reason',CASE WHEN NOT allowed THEN 'Demande close ou en cours : contacter la coordination.' END,'values',public.submission_edit_values(s),'history',coalesce((SELECT jsonb_agg(jsonb_build_object('action',h.action,'version',h.after->'version','created_at',h.created_at,'details',h.after) ORDER BY h.created_at DESC) FROM public.ent_crm_history h WHERE h.company_id=s.edit_company_id AND h.entity='submission_edit' AND h.entity_id=s.id),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.submission_edit_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submission_edit_read(uuid) TO authenticated,service_role;

CREATE FUNCTION public.submission_edit_save(_id uuid,_company uuid,_version integer,_changes jsonb,_operation uuid,_confirmed boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.submissions; oldvalues jsonb; newvalues jsonb; prior jsonb; changed text[]; response jsonb; critical boolean; k text;
BEGIN
 IF NOT coalesce(_confirmed,false) OR _operation IS NULL THEN RAISE EXCEPTION 'Confirmation requise'; END IF;
 PERFORM set_config('vq.workbench','on',true);
 SELECT * INTO s FROM public.submissions WHERE id=_id FOR UPDATE;
 IF s.id IS NULL OR s.edit_company_id IS DISTINCT FROM _company OR NOT public.workbench_manager(_company) OR (s.created_by IS DISTINCT FROM auth.uid() AND NOT public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Dossier ou entreprise non autorisés' USING ERRCODE='42501'; END IF;
 SELECT h.after INTO prior FROM public.ent_crm_history h WHERE h.entity='submission_edit' AND h.actor_id=auth.uid() AND h.after->>'operation'=_operation::text;
 IF FOUND THEN IF prior->>'id'<>_id::text OR prior->'changes' IS DISTINCT FROM _changes THEN RAISE EXCEPTION 'Rejeu incompatible'; END IF; RETURN prior->'result'; END IF;
 IF s.edit_version<>_version THEN RAISE EXCEPTION 'Le dossier a changé : relisez-le' USING ERRCODE='P0409'; END IF;
 IF s.status IN ('termine','terminee','annule','annulee','refuse','refusee','en_cours') OR s.availability_status='owner_closed' THEN RAISE EXCEPTION 'Demande non modifiable'; END IF;
 IF jsonb_typeof(_changes) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Changements invalides'; END IF;
 FOR k IN SELECT jsonb_object_keys(_changes) LOOP IF k NOT IN ('address','materials','material_description','quantity_value','quantity_unit','desired_date','desired_time','truck_type_key','access_instructions') THEN RAISE EXCEPTION 'Champ interdit : %',k; END IF; END LOOP;
 oldvalues:=public.submission_edit_values(s); newvalues:=oldvalues||_changes;
 IF newvalues->>'address' IS NULL OR newvalues->'materials' IS NULL OR newvalues->'materials'='null' OR newvalues->'quantity_value' IS NULL OR length(trim(newvalues->>'address'))<5 OR length(newvalues->>'address')>500 OR jsonb_typeof(newvalues->'materials')<>'array' OR jsonb_array_length(newvalues->'materials') NOT BETWEEN 1 AND 15 THEN RAISE EXCEPTION 'Adresse ou matériaux invalides'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(newvalues->'materials') v WHERE jsonb_typeof(v)<>'string' OR length(trim(v#>>'{}')) NOT BETWEEN 1 AND 120) THEN RAISE EXCEPTION 'Matériau invalide'; END IF;
 IF newvalues->'quantity_value'<>'null' AND (jsonb_typeof(newvalues->'quantity_value')<>'number' OR (newvalues->>'quantity_value')::numeric<=0) THEN RAISE EXCEPTION 'Quantité invalide'; END IF;
 IF length(coalesce(newvalues->>'quantity_unit','')) NOT BETWEEN 1 AND 40 OR length(coalesce(newvalues->>'material_description',''))>4000 OR length(coalesce(newvalues->>'access_instructions',''))>4000 OR length(coalesce(newvalues->>'truck_type_key',''))>120 THEN RAISE EXCEPTION 'Détails invalides'; END IF;
 IF newvalues->>'desired_date' IS NOT NULL THEN PERFORM (newvalues->>'desired_date')::date; END IF;
 IF newvalues->>'desired_time' IS NOT NULL THEN PERFORM (newvalues->>'desired_time')::time; END IF;
 SELECT array_agg(keys.field) INTO changed FROM jsonb_object_keys(_changes) AS keys(field) WHERE oldvalues->keys.field IS DISTINCT FROM newvalues->keys.field;
 IF changed IS NULL THEN RETURN jsonb_build_object('id',s.id,'version',s.edit_version,'revalidation',false); END IF;
 PERFORM 1 FROM public.transport_requests WHERE origin_submission_id=s.id ORDER BY id FOR UPDATE;
 -- Agreements are never overwritten: unsafe operational execution blocks the edit.
 IF EXISTS(SELECT 1 FROM public.transport_requests t WHERE t.origin_submission_id=s.id AND (t.lifecycle_status IN ('prete_transport','en_cours','terminee') OR t.driver_id IS NOT NULL OR t.truck_id IS NOT NULL OR t.requisition_state IN ('running','completed'))) THEN RAISE EXCEPTION 'Transport affecté ou en cours : coordination requise'; END IF;
 IF EXISTS(SELECT 1 FROM public.trips t WHERE t.submission_id=s.id AND t.status::text NOT IN ('demande','soumission_envoyee','accepte','annule')) THEN RAISE EXCEPTION 'Voyage opérationnel : coordination requise'; END IF;
 -- EXEC-02 remains uninstalled: refuse rather than bypass its capacity ledger if present.
 IF to_regclass('public.submission_reception_reservations') IS NOT NULL THEN
   EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.submission_reception_reservations WHERE (submission_id=$1 OR origin_submission_id=$1) AND state IN (''pending'',''reserved''))' INTO critical USING s.id;
   IF critical THEN RAISE EXCEPTION 'Réservation engagée : revalidation de capacité par EXEC-02 requise avant modification'; END IF;
 END IF;
 critical:=EXISTS(SELECT 1 FROM public.submission_site_decisions WHERE submission_id=s.id AND status='approuvee') OR EXISTS(SELECT 1 FROM public.transport_requests WHERE origin_submission_id=s.id AND lifecycle_status IN ('confirmee','attente_confirmation_dompe'));
 UPDATE public.submissions SET address=newvalues->>'address',formatted_address=CASE WHEN 'address'=ANY(changed) THEN NULL ELSE formatted_address END,
   latitude=CASE WHEN 'address'=ANY(changed) THEN NULL ELSE latitude END,longitude=CASE WHEN 'address'=ANY(changed) THEN NULL ELSE longitude END,place_id=CASE WHEN 'address'=ANY(changed) THEN NULL ELSE place_id END,
   materials=ARRAY(SELECT jsonb_array_elements_text(newvalues->'materials')),quantity_value=(newvalues->>'quantity_value')::numeric,quantity_unit=newvalues->>'quantity_unit',
   quantity=CASE WHEN 'quantity_value'=ANY(changed) OR 'quantity_unit'=ANY(changed) THEN concat(newvalues->>'quantity_value',' ',newvalues->>'quantity_unit') ELSE quantity END,
   desired_date=(newvalues->>'desired_date')::date,truck_type_key=newvalues->>'truck_type_key',edit_details=edit_details||jsonb_build_object('material_description',newvalues->'material_description','desired_time',newvalues->'desired_time','access_instructions',newvalues->'access_instructions'),
   edit_version=edit_version+1,exec01_version=exec01_version+1,revalidation_requested_at=now(),exec01_owner_confirmed_at=NULL,site_validated_at=NULL,updated_at=now() WHERE id=s.id;
 -- Retain accepted decisions and snapshot history; access is disabled pending a new explicit decision.
 INSERT INTO public.ent_crm_history(company_id,entity,entity_id,action,before,after,actor_id,origin)
 SELECT _company,'submission_agreement',s.id,'revalidation_requise',to_jsonb(d),jsonb_build_object('operation',_operation),auth.uid(),'entrepreneur' FROM public.submission_site_decisions d WHERE d.submission_id=s.id AND d.status='approuvee';
 UPDATE public.submission_site_decisions SET status='en_attente',decision_note='Conditions modifiées : nouvelle validation requise',updated_at=now() WHERE submission_id=s.id AND status='approuvee';
 PERFORM set_config('vq.lifecycle','on',true);
 UPDATE public.transport_requests SET lifecycle_status='revalidation_requise',updated_at=now(),requisition_state=CASE WHEN requisition_state IN ('accepted','transmitted') THEN 'revalidation' ELSE requisition_state END WHERE origin_submission_id=s.id AND lifecycle_status IN ('confirmee','attente_confirmation_dompe');
 response:=jsonb_build_object('id',s.id,'version',s.edit_version+1,'revalidation',true);
 INSERT INTO public.ent_crm_history(company_id,entity,entity_id,action,before,after,actor_id,origin) VALUES(_company,'submission_edit',s.id,'demande_modifiee',oldvalues,jsonb_build_object('id',s.id,'operation',_operation,'changes',_changes,'changed',changed,'version',s.edit_version+1,'result',response,'values',newvalues),auth.uid(),'entrepreneur');
 PERFORM public.crm_notify('submission-edit:'||s.id||':'||_operation,'demandes','demande_modifiee','haute','Demande modifiée — revalidation requise',array_to_string(changed,', '),'submission',s.id,'/admin/centre-controle',NULL,s.submission_number::text,NULL,jsonb_build_object('company_id',_company,'version',s.edit_version+1),false);
 RETURN response;
END $$;
REVOKE ALL ON FUNCTION public.submission_edit_save(uuid,uuid,integer,jsonb,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submission_edit_save(uuid,uuid,integer,jsonb,uuid,boolean) TO authenticated,service_role;

CREATE FUNCTION public.requisition_access(t public.transport_requests) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN public.workbench_manager(t.requisition_company_id) THEN 'manager' WHEN EXISTS(SELECT 1 FROM public.jsc_drivers d JOIN public.jsc_company_members m ON m.company_id=d.company_id AND m.user_id=d.user_id WHERE d.id=t.requisition_driver_id AND d.company_id=t.requisition_company_id AND d.user_id=auth.uid() AND d.is_active AND d.archived_at IS NULL AND m.is_active AND m.archived_at IS NULL AND m.role='chauffeur') THEN 'driver' END
$$;
REVOKE ALL ON FUNCTION public.requisition_access(public.transport_requests) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.requisition_access(public.transport_requests) TO authenticated,service_role;

CREATE FUNCTION public.requisition_read(_company uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'request_number',t.request_number,'company_id',t.requisition_company_id,'version',t.requisition_version,'state',t.requisition_state,'values',t.requisition_details,'destination',t.dump_name,'actions',CASE WHEN public.requisition_access(t)='manager' THEN CASE t.requisition_state WHEN 'prepared' THEN jsonb_build_array('transmit','cancel') WHEN 'revalidation' THEN jsonb_build_array('transmit','cancel') WHEN 'cancelled' THEN '[]'::jsonb WHEN 'completed' THEN '[]'::jsonb ELSE jsonb_build_array('cancel') END ELSE CASE t.requisition_state WHEN 'transmitted' THEN jsonb_build_array('accept','refuse') WHEN 'accepted' THEN jsonb_build_array('start','incident') WHEN 'running' THEN jsonb_build_array('loading','arrival','unloading','complete','incident') ELSE '[]'::jsonb END END,'history',coalesce((SELECT jsonb_agg(jsonb_build_object('action',e.action,'created_at',e.created_at,'reason',e.reason) ORDER BY e.created_at) FROM public.transport_request_events e WHERE e.request_id=t.id AND e.action LIKE 'requisition_%'),'[]'))) FROM public.transport_requests t WHERE t.requisition_company_id=_company AND t.requisition_state IS NOT NULL AND public.requisition_access(t) IS NOT NULL),'[]');
END $$;
REVOKE ALL ON FUNCTION public.requisition_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.requisition_read(uuid) TO authenticated,service_role;

CREATE FUNCTION public.requisition_assign(_id uuid,_company uuid,_version integer,_values jsonb,_operation uuid,_confirmed boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.transport_requests; s public.submissions; prior jsonb; response jsonb;
BEGIN
 IF NOT public.workbench_manager(_company) OR NOT coalesce(_confirmed,false) OR _operation IS NULL THEN RAISE EXCEPTION 'Affectation non autorisée' USING ERRCODE='42501'; END IF;
 PERFORM set_config('vq.workbench','on',true);
 SELECT * INTO t FROM public.transport_requests WHERE id=_id FOR UPDATE;
 SELECT * INTO s FROM public.submissions WHERE id=t.origin_submission_id FOR UPDATE;
 IF t.id IS NULL OR s.edit_company_id IS DISTINCT FROM _company OR t.requisition_company_id IS NOT NULL AND t.requisition_company_id<>_company THEN RAISE EXCEPTION 'Dossier non rattaché explicitement à cette entreprise' USING ERRCODE='42501'; END IF;
 SELECT details INTO prior FROM public.transport_request_events WHERE actor_id=auth.uid() AND details->>'operation'=_operation::text AND action='requisition_assign';
 IF FOUND THEN IF prior->>'id'<>t.id::text OR prior->'values' IS DISTINCT FROM _values THEN RAISE EXCEPTION 'Rejeu incompatible'; END IF;RETURN prior->'result';END IF;
 IF t.requisition_version<>_version THEN RAISE EXCEPTION 'Version périmée' USING ERRCODE='P0409'; END IF;
 IF t.lifecycle_status IN ('en_cours','terminee','annulee','refusee','expiree') OR t.requisition_state IN ('running','completed','cancelled') THEN RAISE EXCEPTION 'Réquisition non modifiable'; END IF;
 IF jsonb_typeof(_values) IS DISTINCT FROM 'object' OR _values->>'request_id'<>t.id::text OR _values->>'company_id'<>_company::text OR (SELECT count(*) FROM jsonb_object_keys(_values))<>10 OR NOT (_values ?& ARRAY['company_id','request_id','driver_id','truck_id','destination_id','material','quantity','unit','starts_at','instructions']) OR jsonb_typeof(_values->'quantity') IS DISTINCT FROM 'number' OR _values->>'starts_at' IS NULL THEN RAISE EXCEPTION 'Affectation invalide'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.jsc_drivers d JOIN public.jsc_company_members m ON m.company_id=d.company_id AND m.user_id=d.user_id WHERE d.id=(_values->>'driver_id')::uuid AND d.company_id=_company AND d.is_active AND d.archived_at IS NULL AND m.is_active AND m.archived_at IS NULL AND m.role='chauffeur') THEN RAISE EXCEPTION 'Chauffeur ou accès révoqué' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.jsc_trucks WHERE id=(_values->>'truck_id')::uuid AND company_id=_company AND is_active AND archived_at IS NULL) THEN RAISE EXCEPTION 'Camion non autorisé' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.submission_site_decisions WHERE submission_id=s.id AND site_id=(_values->>'destination_id')::uuid AND status='approuvee') OR s.revalidation_requested_at IS NOT NULL THEN RAISE EXCEPTION 'Destination non autorisée ou à revalider' USING ERRCODE='42501'; END IF;
 IF (_values->>'quantity')::numeric<=0 OR length(coalesce(_values->>'unit','')) NOT BETWEEN 1 AND 40 OR length(coalesce(_values->>'material','')) NOT BETWEEN 1 AND 120 OR length(coalesce(_values->>'instructions',''))>4000 THEN RAISE EXCEPTION 'Matériau ou quantité invalide'; END IF;
 PERFORM (_values->>'starts_at')::timestamptz;
 UPDATE public.transport_requests SET requisition_company_id=_company,requisition_driver_id=(_values->>'driver_id')::uuid,requisition_truck_id=(_values->>'truck_id')::uuid,requisition_details=_values,requisition_state=CASE WHEN requisition_accepted_snapshot IS NOT NULL THEN 'revalidation' ELSE 'prepared' END,requisition_version=requisition_version+1,updated_at=now() WHERE id=t.id;
 response:=jsonb_build_object('id',t.id,'version',t.requisition_version+1,'state',CASE WHEN t.requisition_accepted_snapshot IS NOT NULL THEN 'revalidation' ELSE 'prepared' END);
 INSERT INTO public.transport_request_events(request_id,action,version,details,actor_id,actor_role,origin) VALUES(t.id,'requisition_assign',t.requisition_version+1,jsonb_build_object('id',t.id,'operation',_operation,'values',_values,'result',response,'previous_accepted',t.requisition_accepted_snapshot),auth.uid(),'manager','entreprise');
 RETURN response;
END $$;
REVOKE ALL ON FUNCTION public.requisition_assign(uuid,uuid,integer,jsonb,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.requisition_assign(uuid,uuid,integer,jsonb,uuid,boolean) TO authenticated,service_role;

CREATE FUNCTION public.requisition_action(_id uuid,_company uuid,_version integer,_action text,_reason text,_operation uuid,_confirmed boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.transport_requests; role_name text; next_state text; prior jsonb; response jsonb; d public.jsc_drivers;
BEGIN
 PERFORM set_config('vq.workbench','on',true);
 SELECT * INTO t FROM public.transport_requests WHERE id=_id FOR UPDATE;
 role_name:=public.requisition_access(t);
 IF t.id IS NULL OR t.requisition_company_id IS DISTINCT FROM _company OR role_name IS NULL OR NOT coalesce(_confirmed,false) OR _operation IS NULL THEN RAISE EXCEPTION 'Mission non autorisée' USING ERRCODE='42501'; END IF;
 SELECT details INTO prior FROM public.transport_request_events WHERE actor_id=auth.uid() AND details->>'operation'=_operation::text AND action LIKE 'requisition_%';
 IF FOUND THEN IF prior->>'id'<>t.id::text OR prior->>'action'<>_action OR prior->>'reason' IS DISTINCT FROM coalesce(_reason,'') THEN RAISE EXCEPTION 'Rejeu incompatible';END IF;RETURN prior->'result';END IF;
 IF t.requisition_version<>_version THEN RAISE EXCEPTION 'Version périmée' USING ERRCODE='P0409';END IF;
 IF _action IN ('refuse','cancel','incident') AND length(trim(coalesce(_reason,'')))<3 THEN RAISE EXCEPTION 'Motif requis';END IF;
 next_state:=CASE
 WHEN role_name='manager' AND _action='transmit' AND t.requisition_state IN ('prepared','revalidation') THEN 'transmitted'
 WHEN role_name='manager' AND _action='cancel' AND t.requisition_state NOT IN ('completed','cancelled') THEN 'cancelled'
 WHEN role_name='driver' AND _action='accept' AND t.requisition_state='transmitted' THEN 'accepted'
 WHEN role_name='driver' AND _action='refuse' AND t.requisition_state='transmitted' THEN 'refused'
 WHEN role_name='driver' AND _action='start' AND t.requisition_state='accepted' THEN 'running'
 WHEN role_name='driver' AND _action='complete' AND t.requisition_state='running' THEN 'completed'
 WHEN role_name='driver' AND _action='incident' AND t.requisition_state IN ('accepted','running') THEN 'incident'
 WHEN role_name='driver' AND _action IN ('loading','arrival','unloading') AND t.requisition_state='running' THEN 'running' END;
 IF next_state IS NULL THEN RAISE EXCEPTION 'Transition interdite';END IF;
 IF _action IN ('transmit','accept','start') AND NOT EXISTS(SELECT 1 FROM public.jsc_drivers d JOIN public.jsc_company_members m ON m.company_id=d.company_id AND m.user_id=d.user_id WHERE d.id=t.requisition_driver_id AND d.is_active AND d.archived_at IS NULL AND m.is_active AND m.archived_at IS NULL AND m.role='chauffeur') THEN RAISE EXCEPTION 'Accès chauffeur révoqué' USING ERRCODE='42501';END IF;
 IF _action IN ('transmit','accept','start') AND NOT EXISTS(SELECT 1 FROM public.submission_site_decisions sd JOIN public.submissions s ON s.id=sd.submission_id WHERE sd.submission_id=t.origin_submission_id AND sd.site_id=(t.requisition_details->>'destination_id')::uuid AND sd.status='approuvee' AND s.revalidation_requested_at IS NULL) THEN RAISE EXCEPTION 'Destination à revalider' USING ERRCODE='42501';END IF;
 UPDATE public.transport_requests SET requisition_state=next_state,requisition_version=requisition_version+1,requisition_accepted_snapshot=CASE WHEN _action='accept' THEN requisition_details||jsonb_build_object('accepted_by',auth.uid(),'accepted_at',now(),'version',requisition_version) ELSE requisition_accepted_snapshot END,updated_at=now() WHERE id=t.id;
 response:=jsonb_build_object('id',t.id,'version',t.requisition_version+1,'state',next_state);
 INSERT INTO public.transport_request_events(request_id,action,version,reason,details,actor_id,actor_role,origin) VALUES(t.id,'requisition_'||_action,t.requisition_version+1,_reason,jsonb_build_object('id',t.id,'action',_action,'reason',coalesce(_reason,''),'operation',_operation,'result',response,'accepted_snapshot',t.requisition_accepted_snapshot),auth.uid(),role_name,'entreprise');
 IF _action='transmit' THEN
   SELECT * INTO d FROM public.jsc_drivers WHERE id=t.requisition_driver_id;
   INSERT INTO public.jsc_notifications(company_id,audience,user_id,channel,title,body,entity_type,entity_id,status) VALUES(_company,'driver',d.user_id,'in_app','Réquisition à examiner',t.request_number,'transport_request',t.id,'pending');
 END IF;
 IF _action IN ('refuse','incident','cancel') THEN PERFORM public.crm_notify('requisition:'||t.id||':'||_operation,'demandes','requisition_exception','haute','Réquisition à vérifier',_reason,'transport_request',t.id,'/admin/demandes-acces',NULL,t.request_number,NULL,jsonb_build_object('company_id',_company,'state',next_state),false);END IF;
 RETURN response;
END $$;
REVOKE ALL ON FUNCTION public.requisition_action(uuid,uuid,integer,text,text,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.requisition_action(uuid,uuid,integer,text,text,uuid,boolean) TO authenticated,service_role;
CREATE FUNCTION public.workbench_write_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF coalesce(current_setting('vq.workbench',true),'')<>'on' THEN
  IF TG_TABLE_NAME='submissions' AND (NEW.edit_company_id IS DISTINCT FROM OLD.edit_company_id OR NEW.edit_version IS DISTINCT FROM OLD.edit_version OR NEW.edit_details IS DISTINCT FROM OLD.edit_details) THEN RAISE EXCEPTION 'Écriture par RPC obligatoire'; END IF;
  IF TG_TABLE_NAME='transport_requests' AND (NEW.requisition_company_id IS DISTINCT FROM OLD.requisition_company_id OR NEW.requisition_driver_id IS DISTINCT FROM OLD.requisition_driver_id OR NEW.requisition_truck_id IS DISTINCT FROM OLD.requisition_truck_id OR NEW.requisition_state IS DISTINCT FROM OLD.requisition_state OR NEW.requisition_version IS DISTINCT FROM OLD.requisition_version OR NEW.requisition_details IS DISTINCT FROM OLD.requisition_details OR NEW.requisition_accepted_snapshot IS DISTINCT FROM OLD.requisition_accepted_snapshot) THEN RAISE EXCEPTION 'Écriture par RPC obligatoire'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workbench_submission_guard BEFORE UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.workbench_write_guard();
CREATE TRIGGER workbench_requisition_guard BEFORE UPDATE ON public.transport_requests FOR EACH ROW EXECUTE FUNCTION public.workbench_write_guard();
REVOKE ALL ON FUNCTION public.workbench_write_guard() FROM PUBLIC,anon,authenticated;

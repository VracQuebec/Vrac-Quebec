-- Additive wrapper: preserves installed request_update(uuid,jsonb), existing version/event logic.
CREATE FUNCTION public.request_update_versioned(_id uuid,_version integer,_changes jsonb,_operation uuid,_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.transport_requests; result jsonb; prior jsonb; c uuid;
BEGIN
 IF NOT coalesce(_confirmed,false) OR _operation IS NULL OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Confirmation requise';END IF;
 SELECT origin_submission_id INTO c FROM public.transport_requests WHERE id=_id;
 -- Dossier first, as in assignment/action; no inferred ownership.
 PERFORM 1 FROM public.submissions WHERE id=c FOR UPDATE;
 SELECT * INTO t FROM public.transport_requests WHERE id=_id FOR UPDATE;
 IF t.id IS NULL OR public.trq_actor_role(_id) IS NULL THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';END IF;
 IF t.requisition_company_id IS NOT NULL AND NOT public.workbench_manager(t.requisition_company_id) THEN RAISE EXCEPTION 'Entreprise révoquée' USING ERRCODE='42501';END IF;
 SELECT details INTO prior FROM public.transport_request_events WHERE action='requisition_transport_edit' AND actor_id=auth.uid() AND details->>'operation'=_operation::text;
 IF FOUND THEN
  IF prior->>'id' IS DISTINCT FROM _id::text OR prior->'changes' IS DISTINCT FROM _changes THEN RAISE EXCEPTION 'Rejeu incompatible';END IF;
  RETURN prior->'result';
 END IF;
 IF t.current_version IS DISTINCT FROM _version THEN RAISE EXCEPTION 'Version périmée' USING ERRCODE='P0409';END IF;
 IF t.requisition_state IN ('running','completed') THEN RAISE EXCEPTION 'Mission en cours : coordination requise';END IF;
 PERFORM set_config('vq.workbench','on',true);
 result:=public.request_update(_id,_changes);
 IF result->>'changed'='false' THEN RETURN result||jsonb_build_object('id',_id,'version',_version);END IF;
 -- Every edit gets a frozen version, even noncritical notes (legacy only versions critical fields).
 IF (SELECT current_version FROM public.transport_requests WHERE id=_id)=_version THEN
  PERFORM set_config('vq.lifecycle','on',true);
  UPDATE public.transport_requests SET current_version=current_version+1,updated_at=now() WHERE id=_id;
  INSERT INTO public.transport_request_versions(request_id,version,snapshot,changed_fields,created_by)
  SELECT id,current_version,to_jsonb(r),ARRAY(SELECT jsonb_object_keys(_changes)),auth.uid() FROM public.transport_requests r WHERE id=_id;
 END IF;
 IF t.requisition_state IN ('prepared','transmitted','accepted','incident','revalidation') THEN
  PERFORM set_config('vq.lifecycle','on',true);
  UPDATE public.transport_requests SET requisition_state='revalidation',requisition_version=requisition_version+1,lifecycle_status='revalidation_requise' WHERE id=_id;
  IF c IS NOT NULL THEN PERFORM public.workbench_invalidate_reservations(c,t.requisition_company_id,_operation);END IF;
 END IF;
 result:=result||jsonb_build_object('id',_id,'version',(SELECT current_version FROM public.transport_requests WHERE id=_id),'status',(SELECT lifecycle_status FROM public.transport_requests WHERE id=_id));
 INSERT INTO public.transport_request_events(request_id,action,version,details,actor_id,actor_role,origin)
 VALUES(_id,'requisition_transport_edit',(result->>'version')::integer,jsonb_build_object('id',_id,'operation',_operation,'changes',_changes,'result',result,'previous_accepted',t.requisition_accepted_snapshot),auth.uid(),public.trq_actor_role(_id),'entreprise');
 PERFORM public.crm_notify('transport-edit:'||_id||':'||_operation,'demandes','demande_modifiee','haute','Demande de transport modifiée',NULL,'transport_request',_id,'/admin/demandes-acces',NULL,t.request_number,NULL,jsonb_build_object('version',result->'version'),false);
 RETURN result;
END$$;
REVOKE ALL ON FUNCTION public.request_update_versioned(uuid,integer,jsonb,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_update_versioned(uuid,integer,jsonb,uuid,boolean) TO authenticated,service_role;

-- Older callers cannot silently edit accepted/new requisitions through request_update.
CREATE FUNCTION public.workbench_legacy_transport_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF OLD.requisition_state IS NOT NULL AND coalesce(current_setting('vq.workbench',true),'')<>'on'
 AND (to_jsonb(NEW)-ARRAY['updated_at','lifecycle_status','current_version','cancelled_at','cancel_reason'])
 IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['updated_at','lifecycle_status','current_version','cancelled_at','cancel_reason'])
 THEN RAISE EXCEPTION 'Réquisition liée : utiliser la modification versionnée';END IF;
 RETURN NEW;
END$$;
REVOKE ALL ON FUNCTION public.workbench_legacy_transport_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER workbench_legacy_transport_guard BEFORE UPDATE ON public.transport_requests FOR EACH ROW EXECUTE FUNCTION public.workbench_legacy_transport_guard();
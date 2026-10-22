CREATE OR REPLACE FUNCTION public.exec01_projection(_id uuid, _crm boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 SELECT jsonb_build_object('id',s.id,'reference','Demande #'||coalesce(s.submission_number::text,'TEST'),
 'name',s.name,'city',s.city,'status',s.status,'version',s.exec01_version,
 'availability',CASE WHEN s.availability_status IN ('suspended','owner_closed') THEN s.availability_status
 WHEN s.revalidation_requested_at IS NOT NULL OR s.exec01_owner_confirmed_at IS NULL OR s.availability_status<>'available' THEN 'a_confirmer' ELSE 'available' END,
 'lastConfirmed',CASE WHEN s.revalidation_requested_at IS NULL THEN s.exec01_owner_confirmed_at ELSE NULL END,
 'conditions',p.reception_conditions,
 'legacy',jsonb_build_object('quantity_value',s.quantity_value,'quantity_unit',s.quantity_unit,'opening_hours',s.opening_hours,'capacity_kind',p.capacity_kind,'capacity_value',p.capacity_value,'capacity_unit',p.capacity_unit,'access_notes',p.access_notes),
 'proposals',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'label','Voyage proposé','status',t.status)) FROM trips t WHERE t.submission_id=s.id AND t.status::text IN ('demande','soumission_envoyee','accepte')),'[]'::jsonb),
 'deliveries',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'label','Voyage lié','status',t.status)) FROM trips t WHERE t.submission_id=s.id AND t.status::text NOT IN ('demande','soumission_envoyee','accepte','annule')),'[]'::jsonb),
 'operationalState','Voyages explicitement liés seulement; une planification ne confirme pas une réception. EXEC-02 : compatibilité et autorisation de livraison.',
 'receivedEvidence',coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'date',t.trip_date,'count',t.count,'kind',t.kind)) FROM cpn_trips t WHERE t.submission_id=s.id AND t.side='recu' AND t.voided_at IS NULL),'[]'::jsonb)) ||
 CASE WHEN _crm THEN jsonb_build_object('history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'action',action,'at',created_at,'version',version) ORDER BY created_at) FROM public.submission_portal_events WHERE submission_id=_id),'[]'::jsonb)) ELSE '{}'::jsonb END
 FROM public.submissions s LEFT JOIN public.submission_fill_profile p ON p.submission_id=s.id WHERE s.id=_id
$function$

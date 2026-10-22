-- PREPARED ONLY: run on disposable LOCAL fixture after EXEC01 schema.
-- No new columns, tables, indexes, grants or RLS changes. No backfill.
-- This transforms the installed projection/dispatcher, preserving unrelated link logic.
-- STOP on unrecognized function text; deployment fingerprint must be pinned after authorized review.
DO $patch$
DECLARE projection text; dispatcher text;
BEGIN
 projection:=pg_get_functiondef('public.exec01_projection(uuid,boolean)'::regprocedure);
 dispatcher:=pg_get_functiondef('public.exec01_dispatch(jsonb)'::regprocedure);
 IF position('''publicForm''' in projection)>0 OR position('a=''modifier'' AND p ? ''publicForm''' in dispatcher)>0
 OR position('''conditions'',p.reception_conditions,' in projection)=0
 OR position('IF a=''modifier'' THEN' in dispatcher)=0
 OR position('''conditions'',(SELECT reception_conditions FROM submission_fill_profile WHERE submission_id=s.id)' in dispatcher)=0
 THEN RAISE EXCEPTION 'unexpected_reference_STOP'; END IF;
 projection:=replace(projection,'''conditions'',p.reception_conditions,',$insert$
 'conditions',p.reception_conditions,
 'publicForm',jsonb_build_object(
 'address',s.address,'postalCode',coalesce(to_jsonb(s)->>'postal_code',''),'lat',to_jsonb(s)->'latitude','lng',to_jsonb(s)->'longitude',
 'quantityValue',coalesce(s.quantity_value::text,''),'quantityUnit',coalesce(s.quantity_unit,'inconnu'),'quantityUnknown',s.quantity_value IS NULL OR s.quantity_unit='inconnu',
 'projectUsage',CASE WHEN s.property_type='Remplissage / remblai' THEN '' ELSE s.property_type END,
 'materials',to_jsonb(s.materials),'otherMaterial',coalesce(to_jsonb(s)->>'other_material',''),
 'materialDescription','','refusedMaterials','[]'::jsonb,'soilCharacterized','','soilCharacterizedDetails','',
 'truckType',coalesce(to_jsonb(s)->>'truck_type_key',''),'desiredDate',coalesce(to_jsonb(s)->>'desired_date',''),'timeframe',coalesce(to_jsonb(s)->>'delivery_timeframe',''),
 'accessHeavyTruck',coalesce(to_jsonb(s)->>'access_heavy_truck',''),
 'accessDetails',coalesce(nullif(to_jsonb(s)->'access_criteria','null'::jsonb),s.access_details->'criteres','[]'::jsonb),
 'photos',coalesce(nullif(to_jsonb(s)->'photos_meta','null'::jsonb),s.access_details->'photos',
 (SELECT jsonb_agg(jsonb_build_object('url',x,'category','autre')) FROM jsonb_array_elements_text(coalesce(nullif(to_jsonb(s)->'photos','null'::jsonb),'[]'::jsonb)) x),'[]'::jsonb),
 'name',s.name,'phone',coalesce(to_jsonb(s)->>'phone',''),'email',s.email,
 'notes',CASE WHEN position('Notes du demandeur : ' in coalesce(to_jsonb(s)->>'description',''))>0
 THEN substring(to_jsonb(s)->>'description' from position('Notes du demandeur : ' in to_jsonb(s)->>'description')+length('Notes du demandeur : ')) ELSE '' END),
 $insert$);
 EXECUTE projection;
 dispatcher:=replace(dispatcher,'''conditions'',(SELECT reception_conditions FROM submission_fill_profile WHERE submission_id=s.id)',
 '''publicForm'',public.exec01_projection(s.id)->''publicForm'',''conditions'',(SELECT reception_conditions FROM submission_fill_profile WHERE submission_id=s.id)');
 dispatcher:=replace(dispatcher,'IF a=''modifier'' THEN',$edit$
 IF a='modifier' AND p ? 'publicForm' THEN
  c:=p->'publicForm';
  -- Endpoint applies strict Zod allowlist. RPC independently protects the identity email.
  IF c->>'email' IS DISTINCT FROM s.email OR length(trim(c->>'address'))<5
   OR length(trim(c->>'name'))<2 OR jsonb_array_length(c->'materials')<1
   OR length(regexp_replace(c->>'phone','[^0-9]','','g'))<10 THEN RETURN jsonb_build_object('denied',true); END IF;
  UPDATE public.submissions SET address=c->>'address',postal_code=c->>'postalCode',
   name=c->>'name',phone=c->>'phone',
   quantity_value=CASE WHEN (c->>'quantityUnknown')::boolean OR c->>'quantityValue'='' THEN NULL ELSE replace(c->>'quantityValue',',','.')::numeric END,
   quantity_unit=CASE WHEN (c->>'quantityUnknown')::boolean THEN 'inconnu' ELSE c->>'quantityUnit' END,
   quantity=CASE WHEN (c->>'quantityUnknown')::boolean OR c->>'quantityValue'='' THEN 'Je ne sais pas' ELSE (c->>'quantityValue')||' '||(CASE c->>'quantityUnit' WHEN 'voyages' THEN 'voyages de camion' WHEN 'verges3' THEN 'verges³' WHEN 'm3' THEN 'm³' ELSE c->>'quantityUnit' END) END,
   property_type=CASE WHEN c->>'projectUsage'='' THEN 'Remplissage / remblai' ELSE c->>'projectUsage' END,
   materials=ARRAY(SELECT jsonb_array_elements_text(c->'materials')),other_material=nullif(c->>'otherMaterial',''),
   access_heavy_truck=nullif(c->>'accessHeavyTruck',''),access_criteria=ARRAY(SELECT jsonb_array_elements_text(c->'accessDetails')),
   access_details=coalesce(s.access_details,'{}'::jsonb)||jsonb_build_object('criteres',c->'accessDetails','photos',c->'photos'),
   photos_meta=c->'photos',photos=ARRAY(SELECT x->>'url' FROM jsonb_array_elements(c->'photos') x),
   -- Preserve the unparsed description prefix (including older intake summaries).
   description=CASE WHEN position('Notes du demandeur : ' in coalesce(s.description,''))>0
    THEN left(s.description,position('Notes du demandeur : ' in s.description)-1)
    ELSE coalesce(s.description,'')||E'\n' END ||'Notes du demandeur : '||(c->>'notes'),
   latitude=CASE WHEN c->>'address'=s.address THEN s.latitude ELSE NULL END,
   longitude=CASE WHEN c->>'address'=s.address THEN s.longitude ELSE NULL END,
   formatted_address=CASE WHEN c->>'address'=s.address THEN s.formatted_address ELSE NULL END,
   city=CASE WHEN c->>'address'=s.address THEN s.city ELSE NULL END,
   geocoding_status=CASE WHEN c->>'address'=s.address THEN s.geocoding_status ELSE 'pending' END,
   exec01_owner_confirmed_at=NULL,availability_status='unavailable',revalidation_requested_at=now(),availability_source='owner_portal'
  WHERE id=s.id;
 ELSIF a='modifier' THEN
 $edit$);
 EXECUTE dispatcher;
END $patch$;
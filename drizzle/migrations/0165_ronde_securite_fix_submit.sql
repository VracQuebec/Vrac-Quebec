create or replace function public.rds_submit(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare _company uuid := (p->>'company_id')::uuid; _vehicle uuid := (p->>'vehicle_id')::uuid; rid uuid; d jsonb; _at timestamptz; _defs jsonb := coalesce(p->'defects','[]'::jsonb); v record; parent record; _pid uuid; _pver int := 0;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not fleet_can_access(_company) then raise exception 'Accès refusé' using errcode='42501'; end if;
  if (p->>'client_key') is not null then perform pg_advisory_xact_lock(hashtext(p->>'client_key')); end if;
  if (p->>'client_key') is not null then select id into rid from rds_reports where client_key=(p->>'client_key')::uuid; if rid is not null then return rid; end if; end if;
  select * into v from trucks where id=_vehicle and company_id=_company;
  if not found then raise exception 'Véhicule hors entreprise'; end if;
  _at := (p->>'performed_at')::timestamptz;
  if _at is null or _at > now() + interval '5 minutes' then raise exception 'Date et heure de la ronde invalides'; end if;
  if coalesce(trim(p->>'place'),'')='' then raise exception 'Lieu de la ronde requis'; end if;
  if coalesce(trim(p->>'inspector_name'),'')='' then raise exception 'Nom lisible requis'; end if;
  if coalesce((p->>'declaration')::boolean,false) is not true then raise exception 'Déclaration requise'; end if;
  if coalesce(trim(p->>'signature'),'')='' then raise exception 'Signature requise'; end if;
  if (p->>'no_defect')::boolean and jsonb_array_length(_defs)>0 then raise exception 'Défauts présents : la mention « aucune défectuosité » est impossible'; end if;
  if not coalesce((p->>'no_defect')::boolean,false) and jsonb_array_length(_defs)=0 then raise exception 'Indiquer les défauts ou « aucune défectuosité »'; end if;
  if (p->>'parent_id') is not null then
    select * into parent from rds_reports where id=(p->>'parent_id')::uuid and company_id=_company for update;
    if not found or parent.status<>'signe' then raise exception 'Rapport à corriger introuvable ou déjà remplacé'; end if;
    if coalesce(length(trim(p->>'correction_reason')),0)<3 then raise exception 'Motif de correction requis'; end if;
    _pid := parent.id; _pver := parent.version;
  end if;
  insert into rds_reports(company_id, vehicle_id, unit_ids, list_no, version, parent_id, correction_reason, performed_at, place, odometer_km, operator_name, plate,
     inspector_id, inspector_name, inspector_role, declaration, signature, checks, no_defect, client_key)
  values (_company, _vehicle, coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p->'unit_ids') x),'{}'), coalesce((p->>'list_no')::smallint, v.rds_list, 1),
     _pver+1, _pid, nullif(p->>'correction_reason',''), _at, trim(p->>'place'), nullif(p->>'odometer_km','')::numeric,
     coalesce(nullif(trim(p->>'operator_name'),''),(select name from jsc_companies where id=_company)), coalesce(nullif(v.plate,''), v.unit_number, v.name),
     auth.uid(), trim(p->>'inspector_name'), nullif(p->>'inspector_role',''), true, trim(p->>'signature'), coalesce(p->'checks','{}'::jsonb),
     coalesce((p->>'no_defect')::boolean,false), (p->>'client_key')::uuid)
  returning id into rid;
  if _pid is not null then update rds_reports set status='remplace' where id=_pid; end if;
  for d in select * from jsonb_array_elements(_defs) loop
    perform _rds_add_defect(_company, rid, coalesce((d->>'vehicle_id')::uuid,_vehicle), d, _at, false);
  end loop;
  insert into rds_events(company_id, report_id, action, actor, detail) values (_company, rid, case when _pid is null then 'ronde_signee' else 'correction_signee' end, auth.uid(),
    jsonb_build_object('version', _pver+1, 'defauts', jsonb_array_length(_defs), 'synchro_differee', coalesce((p->>'offline')::boolean,false)));
  return rid;
end $$;
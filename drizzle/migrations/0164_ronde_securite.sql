
-- Référentiel officiel (lecture seule)
create table public.rds_categories(no smallint primary key, label text not null, verify text not null default '');
create table public.rds_codes(code text primary key, cat_no smallint not null references public.rds_categories(no), severity text not null check (severity in ('mineur','majeur')), text text not null, lists smallint[] not null, ord int not null);
grant select on public.rds_categories, public.rds_codes to authenticated;
grant all on public.rds_categories, public.rds_codes to service_role;
alter table public.rds_categories enable row level security;
alter table public.rds_codes enable row level security;
create policy rds_cat_read on public.rds_categories for select to authenticated using (true);
create policy rds_codes_read on public.rds_codes for select to authenticated using (true);

-- Profil de ronde du véhicule
alter table public.trucks add column if not exists pnbv_kg numeric, add column if not exists rds_list smallint, add column if not exists rds_profile jsonb not null default '{}'::jsonb;

-- Rapports (figés après signature; écritures par fonctions seulement)
create table public.rds_reports(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.jsc_companies(id),
  vehicle_id uuid not null references public.trucks(id),
  unit_ids uuid[] not null default '{}',
  list_no smallint not null,
  version int not null default 1,
  parent_id uuid references public.rds_reports(id),
  status text not null default 'signe' check (status in ('signe','remplace')),
  correction_reason text,
  performed_at timestamptz not null,
  place text not null,
  odometer_km numeric,
  operator_name text not null,
  plate text not null,
  inspector_id uuid not null,
  inspector_name text not null,
  inspector_role text,
  declaration boolean not null,
  signature text not null,
  signed_at timestamptz not null default now(),
  checks jsonb not null default '{}'::jsonb,
  no_defect boolean not null,
  client_key uuid unique,
  transmitted_at timestamptz not null default now(),
  operator_signed_by uuid, operator_signed_name text, operator_signed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.rds_reports(company_id, vehicle_id, performed_at desc);

create table public.rds_defects(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.jsc_companies(id),
  report_id uuid references public.rds_reports(id),
  vehicle_id uuid not null references public.trucks(id),
  code text not null references public.rds_codes(code),
  severity text not null,
  location text,
  details jsonb not null default '{}'::jsonb,
  description text,
  photo_path text,
  en_route boolean not null default false,
  found_at timestamptz not null,
  found_by uuid not null,
  found_by_name text,
  due_at timestamptz,
  status text not null default 'ouvert' check (status in ('ouvert','repare','valide')),
  repair_id uuid references public.fleet_repairs(id),
  repaired_at timestamptz, repaired_by uuid, repair_notes text, repair_proof text,
  validated_at timestamptz, validated_by uuid,
  client_key uuid unique,
  created_at timestamptz not null default now()
);
create index on public.rds_defects(company_id, vehicle_id, status);

create table public.rds_countersigns(
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.rds_reports(id),
  company_id uuid not null,
  user_id uuid not null, name text not null, signed_at timestamptz not null default now(),
  unique(report_id, user_id)
);
create table public.rds_events(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, report_id uuid, defect_id uuid,
  action text not null, actor uuid, detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
grant select on public.rds_reports, public.rds_defects, public.rds_countersigns, public.rds_events to authenticated;
grant all on public.rds_reports, public.rds_defects, public.rds_countersigns, public.rds_events to service_role;
alter table public.rds_reports enable row level security;
alter table public.rds_defects enable row level security;
alter table public.rds_countersigns enable row level security;
alter table public.rds_events enable row level security;
create policy rds_r_read on public.rds_reports for select to authenticated using (public.fleet_can_access(company_id));
create policy rds_d_read on public.rds_defects for select to authenticated using (public.fleet_can_access(company_id));
create policy rds_c_read on public.rds_countersigns for select to authenticated using (public.fleet_can_access(company_id));
create policy rds_e_read on public.rds_events for select to authenticated using (public.fleet_can_access(company_id));

create or replace function public.rds_my_name() returns text language sql stable security definer set search_path=public as $$
  select coalesce((select nullif(trim(coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name','')),'') from auth.users where id=auth.uid()),
                  (select email from auth.users where id=auth.uid()))
$$;

-- Ajout d'un défaut (interne)
create or replace function public._rds_add_defect(_company uuid, _report uuid, _vehicle uuid, d jsonb, _found timestamptz, _en_route boolean)
returns uuid language plpgsql security definer set search_path=public as $$
declare c record; did uuid; rid uuid; vname text;
begin
  select * into c from rds_codes where code = d->>'code';
  if not found then raise exception 'Code de défectuosité inconnu : %', d->>'code'; end if;
  if (d->>'client_key') is not null then
    select id into did from rds_defects where client_key = (d->>'client_key')::uuid;
    if did is not null then return did; end if;
  end if;
  if not exists(select 1 from trucks where id=_vehicle and company_id=_company) then raise exception 'Véhicule hors entreprise'; end if;
  select coalesce(unit_number, name) into vname from trucks where id=_vehicle;
  insert into fleet_repairs(company_id, vehicle_id, problem, reported_on, description, priority, status, created_by)
  values (_company, _vehicle, 'Ronde '||c.code||' — '||left(c.text,120), (_found at time zone 'America/Toronto')::date,
          concat_ws(' · ', nullif(d->>'location',''), nullif(d->>'description','')),
          case when c.severity='majeur' then 'urgente' else 'elevee' end, 'a_planifier', auth.uid())
  returning id into rid;
  insert into rds_defects(company_id, report_id, vehicle_id, code, severity, location, details, description, photo_path, en_route, found_at, found_by, found_by_name, due_at, repair_id, client_key)
  values (_company, _report, _vehicle, c.code, c.severity, nullif(d->>'location',''), coalesce(d->'details','{}'::jsonb), nullif(d->>'description',''), nullif(d->>'photo_path',''),
          _en_route, _found, auth.uid(), rds_my_name(), case when c.severity='mineur' then _found + interval '48 hours' end, rid, (d->>'client_key')::uuid)
  returning id into did;
  insert into rds_events(company_id, report_id, defect_id, action, actor, detail) values (_company, _report, did, 'defaut_constate', auth.uid(), jsonb_build_object('code',c.code,'severite',c.severity,'en_route',_en_route));
  if c.severity='majeur' then
    begin
      perform crm_notify('rds-majeur-'||did, 'flotte', 'rds_majeur', 'urgente', 'Défectuosité majeure — départ interdit', vname||' : '||c.code||' '||left(c.text,140),
        'rds_defect', did, '/entrepreneur/flotte?onglet=ronde', null, null, null, jsonb_build_object('company_id',_company), false);
    exception when others then null; end;
  end if;
  return did;
end $$;

-- Soumission d'une ronde signée (atomique, idempotente)
create or replace function public.rds_submit(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare _company uuid := (p->>'company_id')::uuid; _vehicle uuid := (p->>'vehicle_id')::uuid; rid uuid; d jsonb; _at timestamptz; _defs jsonb := coalesce(p->'defects','[]'::jsonb); v record; parent record;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not fleet_can_access(_company) then raise exception 'Accès refusé' using errcode='42501'; end if;
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
  end if;
  insert into rds_reports(company_id, vehicle_id, unit_ids, list_no, version, parent_id, correction_reason, performed_at, place, odometer_km, operator_name, plate,
     inspector_id, inspector_name, inspector_role, declaration, signature, checks, no_defect, client_key)
  values (_company, _vehicle, coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(p->'unit_ids') x),'{}'), coalesce((p->>'list_no')::smallint, v.rds_list, 1),
     coalesce(parent.version,0)+1, parent.id, nullif(p->>'correction_reason',''), _at, trim(p->>'place'), nullif(p->>'odometer_km','')::numeric,
     coalesce(nullif(trim(p->>'operator_name'),''),(select name from jsc_companies where id=_company)), coalesce(nullif(v.plate,''), v.unit_number, v.name),
     auth.uid(), trim(p->>'inspector_name'), nullif(p->>'inspector_role',''), true, trim(p->>'signature'), coalesce(p->'checks','{}'::jsonb),
     coalesce((p->>'no_defect')::boolean,false), (p->>'client_key')::uuid)
  returning id into rid;
  if parent.id is not null then update rds_reports set status='remplace' where id=parent.id; end if;
  for d in select * from jsonb_array_elements(_defs) loop
    perform _rds_add_defect(_company, rid, coalesce((d->>'vehicle_id')::uuid,_vehicle), d, _at, false);
  end loop;
  insert into rds_events(company_id, report_id, action, actor, detail) values (_company, rid, case when parent.id is null then 'ronde_signee' else 'correction_signee' end, auth.uid(),
    jsonb_build_object('version', coalesce(parent.version,0)+1, 'defauts', jsonb_array_length(_defs), 'synchro_differee', coalesce((p->>'offline')::boolean,false)));
  return rid;
end $$;

-- Défaut constaté en cours de route
create or replace function public.rds_report_en_route(p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare _company uuid := (p->>'company_id')::uuid; r record;
begin
  if not fleet_can_access(_company) then raise exception 'Accès refusé' using errcode='42501'; end if;
  if (p->>'report_id') is not null then
    select * into r from rds_reports where id=(p->>'report_id')::uuid and company_id=_company;
    if not found then raise exception 'Rapport introuvable'; end if;
  end if;
  return _rds_add_defect(_company, r.id, (p->>'vehicle_id')::uuid, p, coalesce((p->>'found_at')::timestamptz, now()), true);
end $$;

create or replace function public.rds_countersign(_report uuid) returns void language plpgsql security definer set search_path=public as $$
declare r record;
begin
  select * into r from rds_reports where id=_report;
  if not found or not fleet_can_access(r.company_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
  if r.status<>'signe' then raise exception 'Rapport remplacé : contresigner la version courante'; end if;
  if r.inspector_id = auth.uid() then raise exception 'Vous avez déjà signé ce rapport'; end if;
  insert into rds_countersigns(report_id, company_id, user_id, name) values (_report, r.company_id, auth.uid(), rds_my_name()) on conflict do nothing;
  insert into rds_events(company_id, report_id, action, actor) values (r.company_id, _report, 'contresignature', auth.uid());
end $$;

create or replace function public.rds_operator_sign(_report uuid) returns void language plpgsql security definer set search_path=public as $$
declare r record;
begin
  select * into r from rds_reports where id=_report for update;
  if not found or not fleet_can_manage(r.company_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
  if r.operator_signed_at is not null then return; end if;
  update rds_reports set operator_signed_by=auth.uid(), operator_signed_name=rds_my_name(), operator_signed_at=now() where id=_report;
  insert into rds_events(company_id, report_id, action, actor) values (r.company_id, _report, 'signature_exploitant', auth.uid());
end $$;

create or replace function public.rds_repair_done(_defect uuid, _notes text, _proof text) returns void language plpgsql security definer set search_path=public as $$
declare d record;
begin
  select * into d from rds_defects where id=_defect for update;
  if not found or not fleet_can_manage(d.company_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
  if d.status<>'ouvert' then return; end if;
  if coalesce(length(trim(_notes)),0)<3 then raise exception 'Décrire les travaux réalisés'; end if;
  update rds_defects set status='repare', repaired_at=now(), repaired_by=auth.uid(), repair_notes=trim(_notes), repair_proof=nullif(trim(_proof),'') where id=_defect;
  if d.repair_id is not null then update fleet_repairs set status='terminee', completed_date=(now() at time zone 'America/Toronto')::date, notes=concat_ws(E'\n', notes, trim(_notes)) where id=d.repair_id; end if;
  insert into rds_events(company_id, report_id, defect_id, action, actor, detail) values (d.company_id, d.report_id, _defect, 'reparation', auth.uid(), jsonb_build_object('notes',trim(_notes)));
end $$;

create or replace function public.rds_repair_validate(_defect uuid) returns void language plpgsql security definer set search_path=public as $$
declare d record;
begin
  select * into d from rds_defects where id=_defect for update;
  if not found or not fleet_can_manage(d.company_id) then raise exception 'Accès refusé' using errcode='42501'; end if;
  if d.status='valide' then return; end if;
  if d.status<>'repare' then raise exception 'La réparation doit être inscrite avant la validation'; end if;
  update rds_defects set status='valide', validated_at=now(), validated_by=auth.uid() where id=_defect;
  insert into rds_events(company_id, report_id, defect_id, action, actor) values (d.company_id, d.report_id, _defect, 'reparation_validee', auth.uid());
end $$;

-- État de circulation par véhicule (classement et statut séparés)
create or replace function public.rds_fleet_status(_company uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not fleet_can_access(_company) then raise exception 'Accès refusé' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(x order by x->>'name') from (
    select jsonb_build_object(
      'vehicle_id', t.id, 'name', coalesce(t.unit_number, t.name), 'plate', t.plate, 'list_no', t.rds_list, 'pnbv_kg', t.pnbv_kg,
      'last_report_id', lr.id, 'last_at', lr.performed_at, 'valid_until', lr.performed_at + interval '24 hours',
      'ronde_valide', lr.performed_at is not null and lr.performed_at + interval '24 hours' > now(),
      'majeures', (select count(*) from rds_defects d where d.vehicle_id=t.id and d.status<>'valide' and d.severity='majeur'),
      'mineures', (select count(*) from rds_defects d where d.vehicle_id=t.id and d.status<>'valide' and d.severity='mineur'),
      'mineures_echues', (select count(*) from rds_defects d where d.vehicle_id=t.id and d.status<>'valide' and d.severity='mineur' and d.due_at <= now()),
      'prochaine_echeance', (select min(due_at) from rds_defects d where d.vehicle_id=t.id and d.status<>'valide' and d.severity='mineur' and d.due_at > now()),
      'a_valider', (select count(*) from rds_defects d where d.vehicle_id=t.id and d.status='repare')
    ) x
    from trucks t
    left join lateral (select id, performed_at from rds_reports r where r.vehicle_id=t.id and r.status='signe' order by performed_at desc limit 1) lr on true
    where t.company_id=_company and t.archived_at is null
  ) s), '[]'::jsonb);
end $$;

revoke all on function public._rds_add_defect(uuid,uuid,uuid,jsonb,timestamptz,boolean) from public, anon, authenticated;
revoke all on function public.rds_submit(jsonb), public.rds_report_en_route(jsonb), public.rds_countersign(uuid), public.rds_operator_sign(uuid),
  public.rds_repair_done(uuid,text,text), public.rds_repair_validate(uuid), public.rds_fleet_status(uuid), public.rds_my_name() from public, anon;
grant execute on function public.rds_submit(jsonb), public.rds_report_en_route(jsonb), public.rds_countersign(uuid), public.rds_operator_sign(uuid),
  public.rds_repair_done(uuid,text,text), public.rds_repair_validate(uuid), public.rds_fleet_status(uuid) to authenticated;

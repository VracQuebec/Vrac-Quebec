
-- ============ PHASE A : structures additives ============
create or replace function public.material_normalize_text(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(
    btrim(regexp_replace(
      lower(translate(coalesce(p,''),
        'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖòóôõöÙÚÛÜùúûü',
        'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOoooooUUUUuuuu')),
      '[^a-z0-9/]+', ' ', 'g')),
  '');
$$;

create table public.material_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_fr text not null,
  family text not null,
  description text,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.material_catalog to authenticated;
grant all on public.material_catalog to service_role;
alter table public.material_catalog enable row level security;
create policy "material_catalog_read" on public.material_catalog for select to authenticated using (true);
create policy "material_catalog_admin" on public.material_catalog for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.material_aliases (
  id uuid primary key default gen_random_uuid(),
  alias_raw text not null,
  alias_norm text not null,
  material_id uuid not null references public.material_catalog(id) on delete restrict,
  match_type text not null default 'orthographic' check (match_type in ('exact','orthographic','composite','semantic')),
  confidence text not null default 'high' check (confidence in ('high','medium','low')),
  is_active boolean not null default true,
  source text not null default 'seed',
  human_validated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (alias_norm, material_id)
);
create index material_aliases_norm_idx on public.material_aliases(alias_norm) where is_active;
grant select on public.material_aliases to authenticated;
grant all on public.material_aliases to service_role;
alter table public.material_aliases enable row level security;
create policy "material_aliases_read" on public.material_aliases for select to authenticated using (true);
create policy "material_aliases_admin" on public.material_aliases for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- Termes volontairement NON convertis en matériau (usage, imprécision)
create table public.material_review_terms (
  id uuid primary key default gen_random_uuid(),
  term_raw text not null,
  term_norm text not null unique,
  reason text not null,
  created_at timestamptz not null default now()
);
grant select on public.material_review_terms to authenticated;
grant all on public.material_review_terms to service_role;
alter table public.material_review_terms enable row level security;
create policy "material_review_terms_read" on public.material_review_terms for select to authenticated using (true);
create policy "material_review_terms_admin" on public.material_review_terms for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.submission_accepted_materials (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  material_id uuid not null references public.material_catalog(id) on delete restrict,
  stance text not null default 'accepted' check (stance in ('accepted','refused','unknown')),
  source text not null check (source in ('historical_selection','historical_alias','explicit_free_text','owner_confirmation','admin_confirmation','imported','other')),
  confidence text not null default 'high' check (confidence in ('high','medium','low')),
  confirmation_status text not null check (confirmation_status in ('confirmed','inherited','inferred_high_confidence','needs_review')),
  rule_applied text,
  original_value text,
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, material_id)
);
create index submission_accepted_materials_material_idx on public.submission_accepted_materials(material_id);
grant select, insert, update, delete on public.submission_accepted_materials to authenticated;
grant all on public.submission_accepted_materials to service_role;
alter table public.submission_accepted_materials enable row level security;
create policy "sam_admin" on public.submission_accepted_materials for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.material_review_queue (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  source_field text not null,
  original_text text not null,
  suggestions jsonb not null default '[]'::jsonb,
  confidence text not null default 'medium' check (confidence in ('high','medium','low')),
  status text not null default 'pending' check (status in ('pending','confirmed','modified','ignored')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index material_review_queue_status_idx on public.material_review_queue(status);
grant select, insert, update, delete on public.material_review_queue to authenticated;
grant all on public.material_review_queue to service_role;
alter table public.material_review_queue enable row level security;
create policy "mrq_admin" on public.material_review_queue for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.submission_material_conditions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  condition_key text not null,
  stance text not null default 'unknown' check (stance in ('accepted','forbidden','unknown')),
  detail text,
  original_text text,
  source text not null default 'suggested',
  confidence text not null default 'medium' check (confidence in ('high','medium','low')),
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, condition_key)
);
grant select, insert, update, delete on public.submission_material_conditions to authenticated;
grant all on public.submission_material_conditions to service_role;
alter table public.submission_material_conditions enable row level security;
create policy "smc_admin" on public.submission_material_conditions for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.submission_environmental_info (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions(id) on delete cascade,
  characterization_available text not null default 'unknown' check (characterization_available in ('yes','no','unknown')),
  soil_quality text,
  contamination_known text not null default 'unknown' check (contamination_known in ('yes','no','unknown')),
  documents jsonb not null default '[]'::jsonb,
  provenance text,
  restrictions text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.submission_environmental_info to authenticated;
grant all on public.submission_environmental_info to service_role;
alter table public.submission_environmental_info enable row level security;
create policy "sei_admin" on public.submission_environmental_info for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.material_action_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  submission_id uuid,
  action text not null,
  actor_id uuid default auth.uid(),
  actor_email text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.material_action_log to authenticated;
grant all on public.material_action_log to service_role;
alter table public.material_action_log enable row level security;
create policy "mal_admin" on public.material_action_log for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- touch updated_at
create or replace function public.material_touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create trigger t_material_catalog_touch before update on public.material_catalog for each row execute function public.material_touch_updated_at();
create trigger t_material_aliases_touch before update on public.material_aliases for each row execute function public.material_touch_updated_at();
create trigger t_sam_touch before update on public.submission_accepted_materials for each row execute function public.material_touch_updated_at();
create trigger t_mrq_touch before update on public.material_review_queue for each row execute function public.material_touch_updated_at();
create trigger t_smc_touch before update on public.submission_material_conditions for each row execute function public.material_touch_updated_at();
create trigger t_sei_touch before update on public.submission_environmental_info for each row execute function public.material_touch_updated_at();

-- alias_norm toujours calculé
create or replace function public.material_alias_set_norm()
returns trigger language plpgsql set search_path = public as $$
begin new.alias_norm = public.material_normalize_text(new.alias_raw); return new; end $$;
create trigger t_material_alias_norm before insert or update on public.material_aliases for each row execute function public.material_alias_set_norm();

-- ============ PHASE B : catalogue canonique ============
insert into public.material_catalog (slug, name_fr, family, display_order) values
  ('terre','Terre','TERRE',10),
  ('terre-melangee','Terre mélangée','TERRE',20),
  ('terre-tamisee','Terre tamisée','TERRE',30),
  ('sable','Sable','SABLE',40),
  ('sable-compaction','Sable de compaction','SABLE',50),
  ('gravier','Gravier','GRANULATS',60),
  ('pierre','Pierre','GRANULATS',70),
  ('pierre-concassee-0-3-4','Pierre concassée 0-3/4','GRANULATS',80),
  ('pierre-3-4-net','Pierre 3/4 net','GRANULATS',90),
  ('poussiere-de-pierre','Poussière de pierre','GRANULATS',100),
  ('roches','Roches','ROCHE',110),
  ('roches-concassees','Roches concassées','ROCHE',120),
  ('beton','Béton','BETON',130),
  ('asphalte','Asphalte','ASPHALTE',140),
  ('souches','Souches','ORGANIQUE',150);

-- ============ PHASE C : alias haute confiance ============
insert into public.material_aliases (alias_raw, alias_norm, material_id, match_type, confidence, source, human_validated)
select a.raw, public.material_normalize_text(a.raw), c.id, a.mtype, 'high', 'seed', false
from (values
  ('Terre','terre','exact'),
  ('terre','terre','orthographic'),
  ('Terre mélangée','terre-melangee','exact'),
  ('Terre mélangé','terre-melangee','orthographic'),
  ('terre mélangé','terre-melangee','orthographic'),
  ('terre melangé','terre-melangee','orthographic'),
  ('terre mélangée','terre-melangee','orthographic'),
  ('terre melangee','terre-melangee','orthographic'),
  ('terre mélamgé','terre-melangee','orthographic'),
  ('terre mélanger','terre-melangee','orthographic'),
  ('Terre tamisée','terre-tamisee','exact'),
  ('terre tamisee','terre-tamisee','orthographic'),
  ('Sable','sable','exact'),
  ('sable','sable','orthographic'),
  ('Sable de compaction','sable-compaction','exact'),
  ('Gravier','gravier','exact'),
  ('gravier','gravier','orthographic'),
  ('Pierre','pierre','exact'),
  ('pierre','pierre','orthographic'),
  ('Pierre concassée 0-3/4','pierre-concassee-0-3-4','exact'),
  ('pierre concassee 0-3/4','pierre-concassee-0-3-4','orthographic'),
  ('0-3/4','pierre-concassee-0-3-4','orthographic'),
  ('Pierre concassée 3/4 net','pierre-3-4-net','exact'),
  ('pierre concassee 3/4 net','pierre-3-4-net','orthographic'),
  ('3/4 net','pierre-3-4-net','orthographic'),
  ('Poussière de pierre','poussiere-de-pierre','exact'),
  ('poussiere de pierre','poussiere-de-pierre','orthographic'),
  ('Roches','roches','exact'),
  ('roches','roches','orthographic'),
  ('Roche','roches','orthographic'),
  ('roche','roches','orthographic'),
  ('Roches concassées','roches-concassees','exact'),
  ('roches concassées','roches-concassees','orthographic'),
  ('roches concassée','roches-concassees','orthographic'),
  ('Roches concassée','roches-concassees','orthographic'),
  ('roche concassée','roches-concassees','orthographic'),
  ('roche-concassee','roches-concassees','orthographic'),
  ('Roches concasées','roches-concassees','orthographic'),
  ('roches concasées','roches-concassees','orthographic'),
  ('roches concassees','roches-concassees','orthographic'),
  ('Béton','beton','exact'),
  ('béton','beton','orthographic'),
  ('beton','beton','orthographic'),
  ('Asphalte','asphalte','exact'),
  ('asphalte','asphalte','orthographic'),
  ('asphaltes','asphalte','orthographic'),
  ('Souches','souches','exact'),
  ('souches','souches','orthographic'),
  ('souche','souches','orthographic')
) as a(raw, slug, mtype)
join public.material_catalog c on c.slug = a.slug
on conflict (alias_norm, material_id) do nothing;

-- composites explicites et non ambigus
insert into public.material_aliases (alias_raw, alias_norm, material_id, match_type, confidence, source, human_validated)
select a.raw, public.material_normalize_text(a.raw), c.id, 'composite', 'high', 'seed_composite', false
from (values
  ('Roche roches concassées','roches'),
  ('Roche roches concassées','roches-concassees'),
  ('Poussière de pierre et 0-3/4','poussiere-de-pierre'),
  ('Poussière de pierre et 0-3/4','pierre-concassee-0-3-4')
) as a(raw, slug)
join public.material_catalog c on c.slug = a.slug
on conflict (alias_norm, material_id) do nothing;

-- termes volontairement laissés à la validation humaine
insert into public.material_review_terms (term_raw, term_norm, reason) values
  ('Autre','autre','Imprécis — validation humaine'),
  ('autre','autre2','placeholder')
on conflict (term_norm) do nothing;
delete from public.material_review_terms where term_norm = 'autre2';

insert into public.material_review_terms (term_raw, term_norm, reason)
select t.raw, public.material_normalize_text(t.raw), t.reason
from (values
  ('Je ne suis pas certain','Incertitude explicite'),
  ('ne-sais-pas','Incertitude explicite'),
  ('remplissage','Usage, pas un matériau'),
  ('Remblai','Usage, pas un matériau'),
  ('Remblais','Usage, pas un matériau'),
  ('Matériel de remplissage','Usage, pas un matériau'),
  ('mélangé','Trop vague'),
  ('Tout ce qu''on a en option','Trop vague'),
  ('N''importe quoi','Trop vague'),
  ('Pas mal tous','Trop vague'),
  ('There','Valeur incompréhensible'),
  ('Juste pas de glaise','Condition, pas un matériau')
) as t(raw, reason)
on conflict (term_norm) do nothing;

-- ============ Résolution + simulation (lecture seule) ============
create or replace function public.material_resolve(p_raw text)
returns table (material_id uuid, slug text, name_fr text, match_type text, confidence text, rule_applied text)
language sql stable security definer set search_path = public as $$
  select a.material_id, c.slug, c.name_fr, a.match_type, a.confidence,
         case when a.match_type = 'composite' then 'composite_alias' else 'alias_'||a.match_type end
  from public.material_aliases a
  join public.material_catalog c on c.id = a.material_id
  where a.is_active and a.alias_norm = public.material_normalize_text(p_raw);
$$;
revoke all on function public.material_resolve(text) from public, anon;
grant execute on function public.material_resolve(text) to authenticated, service_role;

create or replace function public.material_normalization_preview()
returns table (
  submission_id uuid,
  submission_number text,
  original_value text,
  material_id uuid,
  slug text,
  name_fr text,
  match_type text,
  confidence text,
  rule_applied text,
  outcome text
)
language sql stable security definer set search_path = public as $$
  with src as (
    select s.id, s.submission_number, btrim(m) as raw
    from public.submissions s, unnest(coalesce(s.materials,'{}'::text[])) m
    where public.is_fill_request_type(s.request_type) and btrim(m) <> ''
  )
  select src.id, src.submission_number, src.raw, r.material_id, r.slug, r.name_fr,
         r.match_type, r.confidence, r.rule_applied,
         case
           when r.material_id is not null then 'normalized'
           when exists (select 1 from public.material_review_terms t
                        where t.term_norm = public.material_normalize_text(src.raw)) then 'needs_human_review'
           else 'unmapped'
         end
  from src
  left join lateral public.material_resolve(src.raw) r on true;
$$;
revoke all on function public.material_normalization_preview() from public, anon;
grant execute on function public.material_normalization_preview() to authenticated, service_role;

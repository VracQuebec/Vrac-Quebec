
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
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.has_role(auth.uid(),'admin') or auth.role() = 'service_role') then
    return;
  end if;
  return query
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
end $$;
revoke all on function public.material_normalization_preview() from public, anon;
grant execute on function public.material_normalization_preview() to authenticated, service_role;

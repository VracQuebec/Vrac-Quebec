-- Rollback d'une optimisation SEO à partir de l'historique (admin uniquement).
create or replace function public.seo_page_rollback(_improvement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  k text;
  v jsonb;
  sets text[] := '{}';
  sql text;
begin
  if not has_role(auth.uid(), 'admin') then
    raise exception 'Réservé aux administrateurs';
  end if;

  select * into rec from seo_page_improvements where id = _improvement_id;
  if not found then
    raise exception 'Historique introuvable';
  end if;
  if rec.applied is not true then
    return jsonb_build_object('ok', false, 'message', 'Cette entrée a déjà été annulée.');
  end if;

  for k, v in select * from jsonb_each(coalesce(rec.before_snapshot, '{}'::jsonb)) loop
    if k in ('meta_title','meta_description','h1','title','intro','content_html','og_title','og_description') then
      sets := sets || format('%I = %L', k, nullif(v #>> '{}', ''));
    elsif k in ('keywords','faq','internal_links') then
      sets := sets || format('%I = %L::jsonb', k, coalesce(v::text, 'null'));
    end if;
  end loop;

  if array_length(sets, 1) is null then
    return jsonb_build_object('ok', false, 'message', 'Aucun champ restaurable dans cet historique.');
  end if;

  sql := format('update seo_pages set %s, updated_at = now() where id = %L', array_to_string(sets, ', '), rec.page_id);
  execute sql;

  update seo_page_improvements
     set applied = false,
         notes = coalesce(notes, '') || ' · Annulé le ' || to_char(now(), 'YYYY-MM-DD HH24:MI')
   where id = _improvement_id;

  return jsonb_build_object('ok', true, 'page_id', rec.page_id, 'restored_fields', array_to_string(sets, ', '));
end;
$$;

revoke all on function public.seo_page_rollback(uuid) from public, anon;
grant execute on function public.seo_page_rollback(uuid) to authenticated;
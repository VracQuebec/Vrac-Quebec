create or replace function public.mkt_partners_verified_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Fonctions serveur (clé de service) et administrateurs : seuls autorisés à attribuer/retirer « vérifié ».
  if auth.uid() is null and coalesce(current_setting('request.jwt.claim.role', true), current_user) in ('service_role','postgres','supabase_admin') then
    return new;
  end if;
  if public.mkt_is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    if coalesce(new.is_verified, false) then
      raise exception 'Seul un administrateur peut marquer une entreprise comme vérifiée' using errcode = '42501';
    end if;
  elsif new.is_verified is distinct from old.is_verified then
    raise exception 'Seul un administrateur peut modifier le statut vérifié' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.mkt_partners_verified_guard() from public, anon, authenticated;
drop trigger if exists mkt_partners_verified_guard on public.mkt_partners;
create trigger mkt_partners_verified_guard before insert or update on public.mkt_partners
for each row execute function public.mkt_partners_verified_guard();
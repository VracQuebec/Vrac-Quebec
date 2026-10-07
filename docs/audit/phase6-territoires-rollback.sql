-- Retour arrière Phase 6 (à exécuter seulement après avoir vérifié :
--   select count(*) from public.mkt_partner_territories where territory_id is not null;  -- doit être 0)
-- 1) Restaurer mkt_partner_public : territoires = concat_ws(' — ', city, region) (version d'origine,
--    voir la définition complète dans l'historique de migration précédent).
drop function if exists public.mkt_search_territories(text);
drop index if exists public.mkt_partner_territories_company_territory_uniq;
drop index if exists public.mkt_partner_territories_territory_idx;
alter table public.mkt_partner_territories drop column if exists territory_id;

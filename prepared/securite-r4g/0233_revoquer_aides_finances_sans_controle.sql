-- PRÉPARÉ, NON INSTALLÉ. Correctif additif (droits seulement, aucune donnée touchée).
-- Défaut démontré : ces aides SECURITY DEFINER étaient exécutables par tout compte connecté
-- et ne vérifient ni entreprise ni appartenance : montants d'avances/allocations et existence
-- de comptes financiers d'une autre entreprise lisibles par UUID.
-- Tous les appelants sont eux-mêmes SECURITY DEFINER (exécutés comme propriétaire) : non impactés.
REVOKE EXECUTE ON FUNCTION public.fin_exp_adv_avail(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_exp_alloc_sum(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_bank_account_ok(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_pay_account_check(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_exp_adv_avail(uuid), public.fin_exp_alloc_sum(uuid),
  public.fin_bank_account_ok(uuid, uuid), public.fin_pay_account_check(uuid, uuid) TO service_role;
-- Retour arrière : GRANT EXECUTE ON FUNCTION <les quatre> TO authenticated;

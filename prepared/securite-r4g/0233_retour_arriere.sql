-- Retour arrière exact vers l'état archivé (preuves/0233-droits-avant.txt) : authenticated + service_role + postgres.
GRANT EXECUTE ON FUNCTION public.fin_exp_adv_avail(uuid), public.fin_exp_alloc_sum(uuid),
  public.fin_bank_account_ok(uuid, uuid), public.fin_pay_account_check(uuid, uuid, text) TO authenticated;

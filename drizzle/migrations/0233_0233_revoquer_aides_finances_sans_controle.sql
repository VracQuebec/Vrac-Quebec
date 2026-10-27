REVOKE EXECUTE ON FUNCTION public.fin_exp_adv_avail(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_exp_alloc_sum(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_bank_account_ok(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fin_pay_account_check(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fin_exp_adv_avail(uuid), public.fin_exp_alloc_sum(uuid),
  public.fin_bank_account_ok(uuid, uuid), public.fin_pay_account_check(uuid, uuid, text) TO service_role;
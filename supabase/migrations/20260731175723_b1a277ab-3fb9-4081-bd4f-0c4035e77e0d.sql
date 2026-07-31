create or replace function public.jsc_intel_predict(_company_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _n int;
begin
  if auth.uid() is not null and not public.jsc_can_manage(auth.uid()) then
    raise exception 'Accès admin requis';
  end if;

  delete from public.jsc_intel_predictions where company_id is not distinct from _company_id;

  create temp table _mf on commit drop as
    select date_trunc('month', occurred_on)::date m,
           sum(total) revenue, sum(quantity) volume, count(*) orders,
           sum(gross_margin) margin
    from public.jsc_bi_order_facts(_company_id, (now() - interval '18 months')::date, now()::date)
    group by 1 order by 1;

  insert into public.jsc_intel_predictions (company_id, metric, period_month, predicted, low, high, confidence, method, basis)
  with s as (select m, revenue, volume, orders, margin, row_number() over (order by m) i from _mf),
  metrics as (
    select 'revenue' k, i, revenue v from s union all
    select 'volume', i, volume from s union all
    select 'orders', i, orders::numeric from s union all
    select 'margin', i, margin from s
  ),
  reg as (
    select k, regr_slope(v, i) sl, regr_intercept(v, i) ic, count(*) n,
           coalesce(stddev_samp(v),0) sd, avg(v) av, max(i) mx,
           coalesce(corr(v, i),0) r
    from metrics group by k
  ),
  horizon as (select generate_series(1,3) h)
  select _company_id, k,
    (date_trunc('month', now())::date + ((h) || ' month')::interval)::date,
    round(greatest(0, ic + sl * (mx + h))::numeric, 2),
    round(greatest(0, ic + sl * (mx + h) - sd)::numeric, 2),
    round((ic + sl * (mx + h) + sd)::numeric, 2),
    round(least(0.95, greatest(0.1, (least(1, n::numeric / 12) * 0.6) + abs(r) * 0.4))::numeric, 2),
    'regression_lineaire',
    jsonb_build_object('months', n, 'avg', round(av::numeric,2), 'slope', round(sl::numeric,2), 'corr', round(r::numeric,2))
  from reg cross join horizon where n >= 2;

  insert into public.jsc_intel_predictions (company_id, metric, period_month, predicted, confidence, method, basis)
  select _company_id, 'cash_in', d.mois, round(sum(d.balance)::numeric,2), 0.9, 'echeancier_factures',
         jsonb_build_object('invoices', count(*))
  from (
    select date_trunc('month', coalesce(due_at, issued_at, created_at::date))::date mois, balance
    from public.jsc_invoices
    where archived_at is null and coalesce(balance,0) > 0
      and (_company_id is null or company_id = _company_id)
      and coalesce(due_at, issued_at, created_at::date) >= date_trunc('month', now())::date
  ) d
  group by d.mois;

  select count(*) into _n from public.jsc_intel_predictions where company_id is not distinct from _company_id;
  return jsonb_build_object('ok', true, 'rows', _n);
end $$;

grant execute on function public.jsc_intel_predict(uuid) to authenticated, service_role;
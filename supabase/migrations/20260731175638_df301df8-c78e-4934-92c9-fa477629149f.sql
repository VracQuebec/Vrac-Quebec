
-- ============ Sprint Production 6 — Intelligence autonome ============

create table public.jsc_intel_learning (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  topic text not null,
  subject_type text,
  subject_id uuid,
  subject_label text,
  metrics jsonb not null default '{}'::jsonb,
  samples integer not null default 0,
  confidence numeric not null default 0,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
grant select on public.jsc_intel_learning to authenticated;
grant all on public.jsc_intel_learning to service_role;
alter table public.jsc_intel_learning enable row level security;
create policy "intel_learning_admin" on public.jsc_intel_learning for all to authenticated
  using (public.jsc_can_manage(auth.uid())) with check (public.jsc_can_manage(auth.uid()));

create table public.jsc_intel_scores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  entity_type text not null,
  entity_id uuid not null,
  label text,
  score numeric not null default 0,
  grade text,
  factors jsonb not null default '{}'::jsonb,
  samples integer not null default 0,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
grant select on public.jsc_intel_scores to authenticated;
grant all on public.jsc_intel_scores to service_role;
alter table public.jsc_intel_scores enable row level security;
create policy "intel_scores_admin" on public.jsc_intel_scores for all to authenticated
  using (public.jsc_can_manage(auth.uid())) with check (public.jsc_can_manage(auth.uid()));

create table public.jsc_intel_predictions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  metric text not null,
  period_month date not null,
  predicted numeric not null default 0,
  low numeric,
  high numeric,
  confidence numeric not null default 0,
  method text not null default 'regression_lineaire',
  basis jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select on public.jsc_intel_predictions to authenticated;
grant all on public.jsc_intel_predictions to service_role;
alter table public.jsc_intel_predictions enable row level security;
create policy "intel_predictions_admin" on public.jsc_intel_predictions for all to authenticated
  using (public.jsc_can_manage(auth.uid())) with check (public.jsc_can_manage(auth.uid()));

create table public.jsc_intel_anomalies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  code text not null,
  severity text not null default 'medium',
  title text not null,
  detail text,
  entity_type text,
  entity_id uuid,
  metrics jsonb not null default '{}'::jsonb,
  impact_amount numeric,
  status text not null default 'open',
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, update on public.jsc_intel_anomalies to authenticated;
grant all on public.jsc_intel_anomalies to service_role;
alter table public.jsc_intel_anomalies enable row level security;
create policy "intel_anomalies_admin" on public.jsc_intel_anomalies for all to authenticated
  using (public.jsc_can_manage(auth.uid())) with check (public.jsc_can_manage(auth.uid()));

create table public.jsc_intel_optimizations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  kind text not null,
  title text not null,
  rationale text,
  entity_type text,
  entity_id uuid,
  current_state jsonb not null default '{}'::jsonb,
  proposed_state jsonb not null default '{}'::jsonb,
  estimated_saving numeric not null default 0,
  confidence numeric not null default 0,
  status text not null default 'pending',
  decided_by uuid,
  decided_at timestamptz,
  applied_at timestamptz,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, update on public.jsc_intel_optimizations to authenticated;
grant all on public.jsc_intel_optimizations to service_role;
alter table public.jsc_intel_optimizations enable row level security;
create policy "intel_optim_admin" on public.jsc_intel_optimizations for all to authenticated
  using (public.jsc_can_manage(auth.uid())) with check (public.jsc_can_manage(auth.uid()));

create table public.jsc_intel_memory (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  kind text not null,
  reference_type text,
  reference_id uuid,
  title text not null,
  context jsonb not null default '{}'::jsonb,
  outcome text,
  performance numeric,
  lesson text,
  created_at timestamptz not null default now()
);
grant select on public.jsc_intel_memory to authenticated;
grant all on public.jsc_intel_memory to service_role;
alter table public.jsc_intel_memory enable row level security;
create policy "intel_memory_admin" on public.jsc_intel_memory for all to authenticated
  using (public.jsc_can_manage(auth.uid())) with check (public.jsc_can_manage(auth.uid()));

create table public.jsc_intel_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid,
  scope text not null default 'daily',
  report_date date not null default (now() at time zone 'America/Toronto')::date,
  summary text,
  metrics jsonb not null default '{}'::jsonb,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);
grant select on public.jsc_intel_reports to authenticated;
grant all on public.jsc_intel_reports to service_role;
alter table public.jsc_intel_reports enable row level security;
create policy "intel_reports_admin" on public.jsc_intel_reports for all to authenticated
  using (public.jsc_can_manage(auth.uid())) with check (public.jsc_can_manage(auth.uid()));

create index idx_intel_scores_lookup on public.jsc_intel_scores (company_id, entity_type, score desc);
create index idx_intel_anom_open on public.jsc_intel_anomalies (company_id, status, created_at desc);
create index idx_intel_optim_status on public.jsc_intel_optimizations (company_id, status, created_at desc);
create index idx_intel_pred on public.jsc_intel_predictions (company_id, metric, period_month);
create index idx_intel_learning on public.jsc_intel_learning (company_id, topic);

-- ============ 1. Apprentissage continu ============
create or replace function public.jsc_intel_learn(_company_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _from date := (now() - interval '365 days')::date; _to date := now()::date; _n int;
begin
  if auth.uid() is not null and not public.jsc_can_manage(auth.uid()) then
    raise exception 'Accès admin requis';
  end if;

  delete from public.jsc_intel_learning where company_id is not distinct from _company_id;

  create temp table _facts on commit drop as
    select * from public.jsc_bi_order_facts(_company_id, _from, _to);

  -- Matériaux : prix moyen réel, marge réelle, volume
  insert into public.jsc_intel_learning (company_id, topic, subject_type, subject_id, subject_label, metrics, samples, confidence)
  select _company_id, 'materials', 'material', material_id, coalesce(material_name,'—'),
    jsonb_build_object(
      'orders', count(*), 'quantity', round(sum(quantity)::numeric,2), 'revenue', round(sum(total)::numeric,2),
      'avg_unit_price', round((sum(total) / nullif(sum(quantity),0))::numeric,2),
      'avg_margin_pct', round((100 * sum(gross_margin) / nullif(sum(subtotal),0))::numeric,2)),
    count(*)::int, least(1, count(*)::numeric / 20)
  from _facts where material_id is not null group by material_id, material_name;

  -- Fournisseurs
  insert into public.jsc_intel_learning (company_id, topic, subject_type, subject_id, subject_label, metrics, samples, confidence)
  select _company_id, 'suppliers', 'supplier', supplier_id, coalesce(supplier_name,'—'),
    jsonb_build_object(
      'orders', count(*), 'revenue', round(sum(total)::numeric,2),
      'material_cost', round(sum(material_cost)::numeric,2),
      'avg_unit_cost', round((sum(material_cost) / nullif(sum(quantity),0))::numeric,2),
      'avg_margin_pct', round((100 * sum(gross_margin) / nullif(sum(subtotal),0))::numeric,2)),
    count(*)::int, least(1, count(*)::numeric / 15)
  from _facts where supplier_id is not null group by supplier_id, supplier_name;

  -- Transporteurs
  insert into public.jsc_intel_learning (company_id, topic, subject_type, subject_id, subject_label, metrics, samples, confidence)
  select _company_id, 'carriers', 'carrier', carrier_id, coalesce(carrier_name,'—'),
    jsonb_build_object(
      'orders', count(*), 'transport_cost', round(sum(transport_cost)::numeric,2),
      'revenue', round(sum(total)::numeric,2),
      'avg_margin_pct', round((100 * sum(gross_margin) / nullif(sum(subtotal),0))::numeric,2)),
    count(*)::int, least(1, count(*)::numeric / 15)
  from _facts where carrier_id is not null group by carrier_id, carrier_name;

  -- Clients : habitudes
  insert into public.jsc_intel_learning (company_id, topic, subject_type, subject_id, subject_label, metrics, samples, confidence)
  select _company_id, 'clients', 'client', client_id, coalesce(client_name,'—'),
    jsonb_build_object(
      'orders', count(*), 'revenue', round(sum(total)::numeric,2),
      'avg_order', round(avg(total)::numeric,2),
      'last_order', max(occurred_on), 'days_since', (current_date - max(occurred_on)),
      'avg_days_between', case when count(*) > 1
        then round(((max(occurred_on) - min(occurred_on))::numeric / (count(*) - 1)),1) else null end),
    count(*)::int, least(1, count(*)::numeric / 6)
  from _facts where client_id is not null group by client_id, client_name;

  -- Saisonnalité
  insert into public.jsc_intel_learning (company_id, topic, subject_type, subject_id, subject_label, metrics, samples, confidence)
  select _company_id, 'seasonality', 'month', null, to_char(occurred_on,'MM'),
    jsonb_build_object('orders', count(*), 'revenue', round(sum(total)::numeric,2),
      'quantity', round(sum(quantity)::numeric,2)),
    count(*)::int, least(1, count(*)::numeric / 10)
  from _facts group by to_char(occurred_on,'MM');

  -- Prix acceptés / refusés (soumissions)
  insert into public.jsc_intel_learning (company_id, topic, subject_type, subject_id, subject_label, metrics, samples, confidence)
  select _company_id, 'pricing', 'quote', null, 'soumissions',
    jsonb_build_object(
      'accepted', count(*) filter (where status = 'accepted'),
      'refused', count(*) filter (where status = 'refused'),
      'win_rate_pct', round((100.0 * count(*) filter (where status='accepted')
        / nullif(count(*) filter (where status in ('accepted','refused')),0))::numeric,1),
      'avg_accepted', round(avg(total) filter (where status='accepted')::numeric,2),
      'avg_refused', round(avg(total) filter (where status='refused')::numeric,2)),
    count(*)::int, least(1, count(*)::numeric / 20)
  from public.jsc_quotes
  where archived_at is null and created_at >= _from
    and (_company_id is null or company_id = _company_id);

  -- Délais réels de livraison
  insert into public.jsc_intel_learning (company_id, topic, subject_type, subject_id, subject_label, metrics, samples, confidence)
  select _company_id, 'delays', 'delivery', null, 'livraisons',
    jsonb_build_object(
      'delivered', count(*),
      'on_time_pct', round((100.0 * count(*) filter (where delivered_at::date <= scheduled_date)
        / nullif(count(*),0))::numeric,1),
      'avg_delay_days', round(avg(delivered_at::date - scheduled_date)::numeric,2)),
    count(*)::int, least(1, count(*)::numeric / 20)
  from public.jsc_deliveries
  where archived_at is null and delivered_at is not null and scheduled_date is not null
    and delivered_at >= _from and (_company_id is null or company_id = _company_id);

  select count(*) into _n from public.jsc_intel_learning where company_id is not distinct from _company_id;
  perform public.jsc_log_event('intel_learn','intelligence', null, 'Apprentissage continu', jsonb_build_object('rows', _n));
  return jsonb_build_object('ok', true, 'rows', _n, 'from', _from, 'to', _to);
end $$;

-- ============ 2. Scores dynamiques ============
create or replace function public.jsc_intel_score_all(_company_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _from date := (now() - interval '365 days')::date; _n int;
begin
  if auth.uid() is not null and not public.jsc_can_manage(auth.uid()) then
    raise exception 'Accès admin requis';
  end if;

  delete from public.jsc_intel_scores where company_id is not distinct from _company_id;

  create temp table _f on commit drop as
    select * from public.jsc_bi_order_facts(_company_id, _from, now()::date);

  -- Clients, matériaux, fournisseurs, transporteurs, projets (volume + marge + récence)
  insert into public.jsc_intel_scores (company_id, entity_type, entity_id, label, score, factors, samples)
  with base as (
    select 'client' as t, client_id as id, client_name as label, count(*) n,
           sum(total) rev, sum(gross_margin) marg, sum(subtotal) sub, max(occurred_on) last_on
    from _f where client_id is not null group by client_id, client_name
    union all
    select 'material', material_id, material_name, count(*), sum(total), sum(gross_margin), sum(subtotal), max(occurred_on)
    from _f where material_id is not null group by material_id, material_name
    union all
    select 'supplier', supplier_id, supplier_name, count(*), sum(total), sum(gross_margin), sum(subtotal), max(occurred_on)
    from _f where supplier_id is not null group by supplier_id, supplier_name
    union all
    select 'carrier', carrier_id, carrier_name, count(*), sum(total), sum(gross_margin), sum(subtotal), max(occurred_on)
    from _f where carrier_id is not null group by carrier_id, carrier_name
    union all
    select 'truck', truck_id, null, count(*), sum(total), sum(gross_margin), sum(subtotal), max(occurred_on)
    from _f where truck_id is not null group by truck_id
    union all
    select 'project', project_id, null, count(*), sum(total), sum(gross_margin), sum(subtotal), max(occurred_on)
    from _f where project_id is not null group by project_id
  ), norm as (
    select b.*, max(rev) over (partition by t) max_rev, max(n) over (partition by t) max_n from base b
  )
  select _company_id, t, id, label,
    round(least(100, greatest(0,
      40 * coalesce(rev,0) / nullif(max_rev,0)
      + 30 * coalesce(n,0)::numeric / nullif(max_n,0)
      + 20 * least(1, greatest(0, coalesce(marg,0) / nullif(sub,0)) / 0.25)
      + 10 * greatest(0, 1 - (current_date - last_on)::numeric / 365)
    ))::numeric, 1),
    jsonb_build_object('revenue', round(coalesce(rev,0)::numeric,2), 'orders', n,
      'margin_pct', round((100 * coalesce(marg,0) / nullif(sub,0))::numeric,1),
      'days_since', current_date - last_on),
    n::int
  from norm;

  -- Chauffeurs : ponctualité et volume de livraisons
  insert into public.jsc_intel_scores (company_id, entity_type, entity_id, label, score, factors, samples)
  with d as (
    select driver_id, count(*) n,
      count(*) filter (where delivered_at::date <= scheduled_date) ontime
    from public.jsc_deliveries
    where driver_id is not null and delivered_at is not null and archived_at is null
      and delivered_at >= _from and (_company_id is null or company_id = _company_id)
    group by driver_id
  ), m as (select max(n) mx from d)
  select _company_id, 'driver', d.driver_id,
    (select trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) from public.jsc_drivers dr where dr.id = d.driver_id),
    round(least(100, 60 * ontime::numeric / nullif(n,0) + 40 * n::numeric / nullif(m.mx,0))::numeric,1),
    jsonb_build_object('deliveries', n, 'on_time', ontime,
      'on_time_pct', round((100.0 * ontime / nullif(n,0))::numeric,1)),
    n::int
  from d cross join m;

  update public.jsc_intel_scores set grade = case
    when score >= 80 then 'A' when score >= 60 then 'B' when score >= 40 then 'C'
    when score >= 20 then 'D' else 'E' end
  where company_id is not distinct from _company_id;

  select count(*) into _n from public.jsc_intel_scores where company_id is not distinct from _company_id;
  perform public.jsc_log_event('intel_score','intelligence', null, 'Scores dynamiques', jsonb_build_object('rows', _n));
  return jsonb_build_object('ok', true, 'rows', _n);
end $$;

-- ============ 3. Prédictions ============
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

  -- Trésorerie : soldes de factures à échoir par mois
  insert into public.jsc_intel_predictions (company_id, metric, period_month, predicted, confidence, method, basis)
  select _company_id, 'cash_in', date_trunc('month', coalesce(due_at, issued_at, created_at::date))::date,
    round(sum(balance)::numeric,2), 0.9, 'echeancier_factures',
    jsonb_build_object('invoices', count(*))
  from public.jsc_invoices
  where archived_at is null and coalesce(balance,0) > 0
    and (_company_id is null or company_id = _company_id)
    and coalesce(due_at, issued_at, created_at::date) >= date_trunc('month', now())::date
  group by 2;

  select count(*) into _n from public.jsc_intel_predictions where company_id is not distinct from _company_id;
  return jsonb_build_object('ok', true, 'rows', _n);
end $$;

-- ============ 4. Détection d'anomalies ============
create or replace function public.jsc_intel_detect_anomalies(_company_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _n int;
begin
  if auth.uid() is not null and not public.jsc_can_manage(auth.uid()) then
    raise exception 'Accès admin requis';
  end if;

  create temp table _new (code text, severity text, title text, detail text,
    entity_type text, entity_id uuid, metrics jsonb, impact numeric) on commit drop;

  -- Prix inhabituel (écart > 40 % du prix unitaire moyen du matériau)
  insert into _new
  with f as (select * from public.jsc_bi_order_facts(_company_id, (now()-interval '365 days')::date, now()::date)),
  avgp as (select material_id, sum(total)/nullif(sum(quantity),0) p, count(*) n from f
           where quantity > 0 group by material_id having count(*) >= 5)
  select 'price_outlier',
    case when abs(f.total/nullif(f.quantity,0) - a.p) / nullif(a.p,0) > 0.8 then 'high' else 'medium' end,
    'Prix inhabituel — ' || coalesce(f.material_name,'matériau'),
    'Prix unitaire ' || round((f.total/nullif(f.quantity,0))::numeric,2) || ' $ contre une moyenne de ' || round(a.p::numeric,2) || ' $.',
    'order', f.order_id,
    jsonb_build_object('unit_price', round((f.total/nullif(f.quantity,0))::numeric,2), 'avg_unit_price', round(a.p::numeric,2)),
    abs(f.total - a.p * f.quantity)
  from f join avgp a on a.material_id = f.material_id
  where f.quantity > 0 and abs(f.total/nullif(f.quantity,0) - a.p) / nullif(a.p,0) > 0.4
    and f.occurred_on >= (now() - interval '90 days')::date;

  -- Marge trop faible
  insert into _new
  select 'low_margin', case when gross_margin < 0 then 'high' else 'medium' end,
    'Marge faible — commande ' || coalesce(client_name,''),
    'Marge de ' || round((100 * gross_margin / nullif(subtotal,0))::numeric,1) || ' % sur ' || round(subtotal::numeric,2) || ' $.',
    'order', order_id,
    jsonb_build_object('margin_pct', round((100 * gross_margin / nullif(subtotal,0))::numeric,1), 'subtotal', round(subtotal::numeric,2)),
    greatest(0, subtotal * 0.05 - gross_margin)
  from public.jsc_bi_order_facts(_company_id, (now()-interval '90 days')::date, now()::date)
  where subtotal > 0 and (gross_margin / nullif(subtotal,0)) < 0.05;

  -- Délais anormaux
  insert into _new
  select 'abnormal_delay', case when (delivered_at::date - scheduled_date) > 5 then 'high' else 'medium' end,
    'Livraison en retard — ' || coalesce(delivery_number,''),
    'Livrée ' || (delivered_at::date - scheduled_date) || ' jour(s) après la date planifiée.',
    'delivery', id,
    jsonb_build_object('delay_days', delivered_at::date - scheduled_date), null
  from public.jsc_deliveries
  where archived_at is null and delivered_at is not null and scheduled_date is not null
    and delivered_at >= (now() - interval '60 days') and (delivered_at::date - scheduled_date) > 2
    and (_company_id is null or company_id = _company_id);

  -- Erreurs de saisie
  insert into _new
  select 'data_error', 'medium', 'Donnée incohérente — commande ' || coalesce(order_number,''),
    'Quantité ou montant invalide.', 'order', id,
    jsonb_build_object('total', total, 'delivered_quantity', delivered_quantity), null
  from public.jsc_orders
  where archived_at is null and created_at >= now() - interval '120 days'
    and (coalesce(total,0) <= 0 or coalesce(delivered_quantity,0) < 0)
    and (_company_id is null or company_id = _company_id);

  -- Doublons de demandes
  insert into _new
  select 'duplicate_request', 'low', 'Demandes possiblement en double',
    count(*) || ' demandes identiques (même client, matériau et ville) le même jour.',
    'client', client_id,
    jsonb_build_object('count', count(*), 'day', created_at::date), null
  from public.jsc_requests
  where archived_at is null and created_at >= now() - interval '90 days'
    and (_company_id is null or company_id = _company_id)
  group by client_id, material_id, city, created_at::date
  having count(*) > 1 and client_id is not null;

  -- Fournisseurs inactifs
  insert into _new
  select 'inactive_supplier', 'low', 'Fournisseur inactif — ' || s.name,
    'Aucune commande depuis plus de 180 jours.', 'supplier', s.id,
    jsonb_build_object('last_order', (select max(created_at)::date from public.jsc_orders o where o.supplier_id = s.id)), null
  from public.jsc_suppliers s
  where s.archived_at is null and coalesce(s.is_active, true)
    and (_company_id is null or s.company_id = _company_id)
    and not exists (select 1 from public.jsc_orders o
      where o.supplier_id = s.id and o.created_at >= now() - interval '180 days');

  -- Transporteurs sous-utilisés
  insert into _new
  select 'underused_carrier', 'low', 'Camion sous-utilisé — ' || t.name,
    'Aucune livraison depuis plus de 60 jours.', 'truck', t.id,
    jsonb_build_object('status', t.operational_status), null
  from public.jsc_trucks t
  where t.archived_at is null and coalesce(t.is_active, true)
    and (_company_id is null or t.company_id = _company_id)
    and not exists (select 1 from public.jsc_deliveries d
      where d.truck_id = t.id and d.created_at >= now() - interval '60 days');

  insert into public.jsc_intel_anomalies (company_id, code, severity, title, detail, entity_type, entity_id, metrics, impact_amount)
  select _company_id, n.code, n.severity, n.title, n.detail, n.entity_type, n.entity_id, n.metrics, n.impact
  from _new n
  where not exists (
    select 1 from public.jsc_intel_anomalies a
    where a.company_id is not distinct from _company_id and a.code = n.code
      and a.entity_id is not distinct from n.entity_id and a.status = 'open');

  get diagnostics _n = row_count;
  perform public.jsc_log_event('intel_anomalies','intelligence', null, 'Détection d''anomalies', jsonb_build_object('new', _n));
  return jsonb_build_object('ok', true, 'new', _n);
end $$;

-- ============ 5. Optimisation automatique ============
create or replace function public.jsc_intel_optimize(_company_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _n int;
begin
  if auth.uid() is not null and not public.jsc_can_manage(auth.uid()) then
    raise exception 'Accès admin requis';
  end if;

  create temp table _p (kind text, title text, rationale text, entity_type text, entity_id uuid,
    cur jsonb, prop jsonb, saving numeric, conf numeric) on commit drop;

  -- Fournisseur moins cher pour un matériau déjà utilisé
  insert into _p
  with used as (
    select material_id, supplier_id, sum(quantity) qty, sum(material_cost)/nullif(sum(quantity),0) unit_cost
    from public.jsc_bi_order_facts(_company_id, (now()-interval '365 days')::date, now()::date)
    where material_id is not null and supplier_id is not null and quantity > 0
    group by material_id, supplier_id
  ), best as (
    select mp.material_id, mp.supplier_id, min(mp.purchase_price) price
    from public.jsc_material_prices mp
    where mp.is_active and mp.archived_at is null and coalesce(mp.purchase_price,0) > 0
      and (_company_id is null or mp.company_id = _company_id)
    group by mp.material_id, mp.supplier_id
  ), pick as (
    select u.material_id, u.supplier_id, u.unit_cost, u.qty,
      (select b.supplier_id from best b where b.material_id = u.material_id order by b.price limit 1) alt_id,
      (select b.price from best b where b.material_id = u.material_id order by b.price limit 1) alt_price
    from used u
  )
  select 'cheaper_supplier',
    'Fournisseur moins cher — ' || coalesce(m.name, 'matériau'),
    'Coût unitaire actuel ' || round(p.unit_cost::numeric,2) || ' $ contre ' || round(p.alt_price::numeric,2) || ' $ chez ' || coalesce(sa.name,'un autre fournisseur') || '.',
    'material', p.material_id,
    jsonb_build_object('supplier_id', p.supplier_id, 'supplier', ss.name, 'unit_cost', round(p.unit_cost::numeric,2)),
    jsonb_build_object('supplier_id', p.alt_id, 'supplier', sa.name, 'unit_cost', round(p.alt_price::numeric,2)),
    round(((p.unit_cost - p.alt_price) * p.qty)::numeric, 2), 0.7
  from pick p
  left join public.jsc_materials m on m.id = p.material_id
  left join public.jsc_suppliers ss on ss.id = p.supplier_id
  left join public.jsc_suppliers sa on sa.id = p.alt_id
  where p.alt_id is not null and p.alt_id <> p.supplier_id and p.alt_price < p.unit_cost * 0.95;

  -- Matériaux à faible rentabilité : ajustement du prix de vente
  insert into _p
  select 'material_price',
    'Rentabilité faible — ' || m.name,
    'Marge réelle de ' || round(((l.metrics->>'avg_margin_pct')::numeric),1) || ' % sur ' || (l.metrics->>'orders') || ' commande(s).',
    'material', m.id,
    jsonb_build_object('selling_price', m.selling_price, 'purchase_price', m.purchase_price),
    jsonb_build_object('selling_price', round((greatest(m.purchase_price, coalesce(m.selling_price,0)) * 1.10)::numeric, 2)),
    round((coalesce(m.selling_price,0) * 0.10 * coalesce((l.metrics->>'quantity')::numeric,0))::numeric,2),
    least(0.9, coalesce(l.confidence,0.3))
  from public.jsc_intel_learning l
  join public.jsc_materials m on m.id = l.subject_id
  where l.topic = 'materials' and l.company_id is not distinct from _company_id
    and coalesce((l.metrics->>'avg_margin_pct')::numeric, 0) < 10
    and coalesce(m.selling_price,0) > 0 and m.archived_at is null;

  -- Regroupement de livraisons (même ville, même journée)
  insert into _p
  select 'consolidation',
    'Regroupement possible — ' || coalesce(city,'—') || ' le ' || scheduled_date,
    count(*) || ' livraisons planifiées la même journée dans la même ville avec des camions différents.',
    'city', null,
    jsonb_build_object('deliveries', count(*), 'trucks', count(distinct truck_id), 'city', city, 'date', scheduled_date),
    jsonb_build_object('action', 'regrouper', 'suggested_trucks', greatest(1, count(distinct truck_id) - 1)),
    round((sum(coalesce(estimated_cost,0)) * 0.15)::numeric,2), 0.6
  from public.jsc_deliveries
  where archived_at is null and delivered_at is null and scheduled_date >= current_date
    and city is not null and (_company_id is null or company_id = _company_id)
  group by city, scheduled_date
  having count(*) > 1;

  -- Camions inactifs : coût dormant
  insert into _p
  select 'idle_truck', 'Camion inutilisé — ' || t.name,
    'Aucune livraison planifiée ni réalisée depuis 30 jours.', 'truck', t.id,
    jsonb_build_object('hourly_rate', t.hourly_rate, 'status', t.operational_status),
    jsonb_build_object('action', 'reaffecter_ou_sous_traiter'),
    0, 0.5
  from public.jsc_trucks t
  where t.archived_at is null and coalesce(t.is_active,true)
    and (_company_id is null or t.company_id = _company_id)
    and not exists (select 1 from public.jsc_deliveries d where d.truck_id = t.id
      and d.created_at >= now() - interval '30 days');

  insert into public.jsc_intel_optimizations
    (company_id, kind, title, rationale, entity_type, entity_id, current_state, proposed_state, estimated_saving, confidence)
  select _company_id, p.kind, p.title, p.rationale, p.entity_type, p.entity_id, p.cur, p.prop,
         coalesce(p.saving,0), p.conf
  from _p p
  where not exists (
    select 1 from public.jsc_intel_optimizations o
    where o.company_id is not distinct from _company_id and o.kind = p.kind
      and o.entity_id is not distinct from p.entity_id and o.title = p.title and o.status = 'pending');

  get diagnostics _n = row_count;
  perform public.jsc_log_event('intel_optimize','intelligence', null, 'Optimisation automatique', jsonb_build_object('new', _n));
  return jsonb_build_object('ok', true, 'new', _n);
end $$;

-- ============ 6. Application contrôlée d'une proposition ============
create or replace function public.jsc_intel_apply_optimization(_id uuid, _decision text default 'approved')
returns jsonb language plpgsql security definer set search_path = public as $$
declare o public.jsc_intel_optimizations; _res jsonb := '{}'::jsonb;
begin
  if not public.jsc_can_manage(auth.uid()) then raise exception 'Accès admin requis'; end if;
  select * into o from public.jsc_intel_optimizations where id = _id;
  if not found then raise exception 'Proposition introuvable'; end if;
  if o.status <> 'pending' then raise exception 'Proposition déjà traitée'; end if;

  if _decision = 'rejected' then
    update public.jsc_intel_optimizations
      set status = 'rejected', decided_by = auth.uid(), decided_at = now(), updated_at = now()
      where id = _id;
    insert into public.jsc_intel_memory (company_id, kind, reference_type, reference_id, title, context, outcome, lesson)
    values (o.company_id, 'optimization', 'optimization', o.id, o.title,
      jsonb_build_object('kind', o.kind, 'proposed', o.proposed_state), 'rejected',
      'Proposition refusée par la direction.');
    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  if o.kind = 'material_price' and o.entity_id is not null
     and (o.proposed_state ? 'selling_price') then
    update public.jsc_materials
      set selling_price = (o.proposed_state->>'selling_price')::numeric, updated_at = now()
      where id = o.entity_id;
    _res := jsonb_build_object('applied', 'selling_price');
  else
    _res := jsonb_build_object('applied', 'manuel', 'note', 'Proposition validée : exécution opérationnelle requise.');
  end if;

  update public.jsc_intel_optimizations
    set status = 'applied', decided_by = auth.uid(), decided_at = now(),
        applied_at = now(), result = _res, updated_at = now()
    where id = _id;

  insert into public.jsc_intel_memory (company_id, kind, reference_type, reference_id, title, context, outcome, performance, lesson)
  values (o.company_id, 'optimization', 'optimization', o.id, o.title,
    jsonb_build_object('kind', o.kind, 'current', o.current_state, 'proposed', o.proposed_state,
      'estimated_saving', o.estimated_saving), 'applied', o.estimated_saving,
    'Proposition appliquée — gain estimé ' || round(coalesce(o.estimated_saving,0),2) || ' $.');

  perform public.jsc_log_event('intel_apply','optimization', o.id, o.title, _res);
  return jsonb_build_object('ok', true, 'status', 'applied', 'result', _res);
end $$;

-- ============ 7. Tableau de bord IA ============
create or replace function public.jsc_intel_dashboard(_company_id uuid default null)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare r jsonb;
begin
  if not public.jsc_can_manage(auth.uid()) then raise exception 'Accès admin requis'; end if;

  select jsonb_build_object(
    'generated_at', now(),
    'learning', (select jsonb_build_object(
        'rows', count(*), 'topics', count(distinct topic),
        'avg_confidence', round(coalesce(avg(confidence),0)::numeric,2),
        'last_run', max(computed_at))
      from public.jsc_intel_learning where company_id is not distinct from _company_id),
    'learning_topics', (select coalesce(jsonb_agg(t), '[]'::jsonb) from (
        select topic, count(*) rows, round(avg(confidence)::numeric,2) confidence, sum(samples) samples
        from public.jsc_intel_learning where company_id is not distinct from _company_id
        group by topic order by topic) t),
    'scores', (select coalesce(jsonb_agg(s), '[]'::jsonb) from (
        select entity_type, count(*) count, round(avg(score)::numeric,1) avg_score
        from public.jsc_intel_scores where company_id is not distinct from _company_id
        group by entity_type order by entity_type) s),
    'top_scores', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select entity_type, entity_id, label, score, grade, factors
        from public.jsc_intel_scores where company_id is not distinct from _company_id
        order by score desc limit 12) x),
    'weak_scores', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select entity_type, entity_id, label, score, grade, factors
        from public.jsc_intel_scores where company_id is not distinct from _company_id
          and samples > 0 order by score asc limit 8) x),
    'anomalies', (select jsonb_build_object(
        'open', count(*) filter (where status = 'open'),
        'high', count(*) filter (where status = 'open' and severity = 'high'),
        'impact', round(coalesce(sum(impact_amount) filter (where status='open'),0)::numeric,2))
      from public.jsc_intel_anomalies where company_id is not distinct from _company_id),
    'optimizations', (select jsonb_build_object(
        'pending', count(*) filter (where status='pending'),
        'applied', count(*) filter (where status='applied'),
        'potential_gain', round(coalesce(sum(estimated_saving) filter (where status='pending'),0)::numeric,2),
        'realized_gain', round(coalesce(sum(estimated_saving) filter (where status='applied'),0)::numeric,2))
      from public.jsc_intel_optimizations where company_id is not distinct from _company_id),
    'predictions', (select coalesce(jsonb_agg(p order by p.metric, p.period_month), '[]'::jsonb) from (
        select metric, period_month, predicted, low, high, confidence, method
        from public.jsc_intel_predictions where company_id is not distinct from _company_id) p),
    'memory', (select jsonb_build_object('entries', count(*),
        'avg_performance', round(coalesce(avg(performance),0)::numeric,2))
      from public.jsc_intel_memory where company_id is not distinct from _company_id),
    'last_report', (select to_jsonb(x) from (
        select report_date, summary, created_at from public.jsc_intel_reports
        where company_id is not distinct from _company_id order by created_at desc limit 1) x)
  ) into r;
  return r;
end $$;

grant execute on function public.jsc_intel_learn(uuid) to authenticated, service_role;
grant execute on function public.jsc_intel_score_all(uuid) to authenticated, service_role;
grant execute on function public.jsc_intel_predict(uuid) to authenticated, service_role;
grant execute on function public.jsc_intel_detect_anomalies(uuid) to authenticated, service_role;
grant execute on function public.jsc_intel_optimize(uuid) to authenticated, service_role;
grant execute on function public.jsc_intel_apply_optimization(uuid, text) to authenticated, service_role;
grant execute on function public.jsc_intel_dashboard(uuid) to authenticated, service_role;

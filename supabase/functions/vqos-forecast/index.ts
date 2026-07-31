// Vrac Québec OS — moteur de prévision (ventes, matériaux, livraisons, camions, chauffeurs).
// Méthode : tendance linéaire + saisonnalité mensuelle calculées sur l'historique réel.
import { adminClient, corsHeaders, json, requireAdmin } from '../_shared/vqos-intel.ts';

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

function project(series: Map<string, number>, months: number) {
  const keys = [...series.keys()].sort();
  const values = keys.map((k) => series.get(k) ?? 0);
  const n = values.length;
  if (!n) return [];

  // Régression linéaire simple sur l'historique.
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  values.forEach((y, x) => { num += (x - xMean) * (y - yMean); den += (x - xMean) ** 2; });
  const slope = den ? num / den : 0;
  const intercept = yMean - slope * xMean;

  // Saisonnalité : ratio moyen par mois civil.
  const byMonth = new Map<number, number[]>();
  keys.forEach((k, i) => {
    const m = Number(k.slice(5, 7));
    byMonth.set(m, [...(byMonth.get(m) ?? []), values[i]]);
  });
  const seasonal = new Map<number, number>();
  byMonth.forEach((arr, m) => {
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    seasonal.set(m, yMean > 0 ? avg / yMean : 1);
  });

  const variance = values.reduce((s, y, x) => s + (y - (intercept + slope * x)) ** 2, 0) / Math.max(n, 1);
  const stdev = Math.sqrt(variance);
  const confidence = Math.max(20, Math.min(95, Math.round(100 - (yMean > 0 ? (stdev / yMean) * 100 : 60))));

  const out: { period_month: string; predicted: number; low: number; high: number; confidence: number }[] = [];
  const start = new Date();
  for (let i = 1; i <= months; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const base = Math.max(0, intercept + slope * (n - 1 + i));
    const factor = seasonal.get(d.getUTCMonth() + 1) ?? 1;
    const predicted = Math.round(base * factor * 100) / 100;
    out.push({
      period_month: `${monthKey(d)}-01`,
      predicted,
      low: Math.round(Math.max(0, predicted - stdev) * 100) / 100,
      high: Math.round((predicted + stdev) * 100) / 100,
      confidence,
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.res;

    const body = await req.json().catch(() => ({}));
    const months = Math.min(24, Math.max(3, Number(body?.months ?? 12)));
    const admin = adminClient();
    let companyId: string | null = body?.company_id ?? null;
    if (!companyId) {
      const { data: def } = await admin.from('jsc_companies')
        .select('id').is('archived_at', null).order('is_default', { ascending: false })
        .limit(1).maybeSingle();
      companyId = def?.id ?? null;
    }
    const since = new Date(Date.now() - 730 * 86400000).toISOString();

    const q = <T>(p: PromiseLike<T>) => p;
    const [orders, deliveries] = await Promise.all([
      q(admin.from('jsc_orders').select('total, created_at, company_id, delivered_quantity')
        .is('archived_at', null).gte('created_at', since)),
      q(admin.from('jsc_deliveries').select('id, scheduled_date, company_id, truck_id, driver_id')
        .is('archived_at', null).gte('scheduled_date', since.slice(0, 10))),
    ]);

    const filt = <T extends { company_id?: string | null }>(rows: T[] | null) =>
      (rows ?? []).filter((r) => !companyId || r.company_id === companyId);

    const sales = new Map<string, number>();
    const volumes = new Map<string, number>();
    filt(orders.data as { company_id: string; created_at: string; total: number; delivered_quantity: number }[]).forEach((o) => {
      const k = monthKey(new Date(o.created_at));
      sales.set(k, (sales.get(k) ?? 0) + Number(o.total ?? 0));
      volumes.set(k, (volumes.get(k) ?? 0) + Number(o.delivered_quantity ?? 0));
    });

    const trips = new Map<string, number>();
    filt(deliveries.data as { company_id: string; scheduled_date: string }[]).forEach((d) => {
      const k = monthKey(new Date(`${d.scheduled_date}T00:00:00Z`));
      trips.set(k, (trips.get(k) ?? 0) + 1);
    });

    const tripsPerTruckMonth = 40; // Capacité de référence, ajustable par la direction.
    const series: Record<string, Map<string, number>> = {
      sales: sales,
      volume: volumes,
      deliveries: trips,
    };

    const rows: Record<string, unknown>[] = [];
    for (const [metric, data] of Object.entries(series)) {
      for (const p of project(data, months)) {
        rows.push({
          company_id: companyId, metric, period_month: p.period_month,
          predicted: p.predicted, low: p.low, high: p.high, confidence: p.confidence,
          method: 'tendance + saisonnalité', detail: {},
        });
      }
    }
    // Besoins en camions et chauffeurs déduits des livraisons prévues.
    for (const p of project(trips, months)) {
      const need = Math.ceil(p.predicted / tripsPerTruckMonth);
      rows.push({
        company_id: companyId, metric: 'trucks_needed', period_month: p.period_month,
        predicted: need, low: Math.max(0, need - 1), high: need + 1, confidence: p.confidence,
        method: `livraisons / ${tripsPerTruckMonth} par camion`, detail: { trips: p.predicted },
      });
      rows.push({
        company_id: companyId, metric: 'drivers_needed', period_month: p.period_month,
        predicted: need, low: Math.max(0, need - 1), high: need + 1, confidence: p.confidence,
        method: 'un chauffeur par camion actif', detail: { trips: p.predicted },
      });
    }

    if (rows.length) {
      const { error } = await admin.from('jsc_forecasts')
        .upsert(rows, { onConflict: 'company_id,metric,period_month' });
      if (error) return json({ error: error.message }, 500);
    }

    return json({ forecasts: rows.length, months, rows });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
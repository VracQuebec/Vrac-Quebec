// ============================================================
// PANNEAU D'ADMINISTRATION — Tableau de bord.
// Statistiques calculées à partir des soumissions du moteur
// (jsc_quotes). Aucune donnée dupliquée : une seule source.
// ============================================================
import { useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Loader2, TrendingUp } from "lucide-react";
import { useQuotes } from "@/components/jsc/QuotesBoard";

const money = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function TopList({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-3 text-sm font-semibold">{title}</p>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Aucune donnée.</p>}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex justify-between text-xs">
              <span className="truncate">{r.label}</span>
              <span className="text-muted-foreground">{r.value}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminOverview() {
  const { rows, loading } = useQuotes();

  const stats = useMemo(() => {
    const count = rows.length;
    const amount = rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
    const accepted = rows.filter((r) => r.status === "accepted").length;

    const tally = (key: (r: (typeof rows)[number]) => string | null | undefined) => {
      const map = new Map<string, number>();
      for (const r of rows) {
        const k = (key(r) ?? "").trim();
        if (!k) continue;
        map.set(k, (map.get(k) ?? 0) + 1);
      }
      return [...map.entries()].map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value).slice(0, 6);
    };

    const months = new Map<string, { month: string; soumissions: number; ventes: number }>();
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      months.set(d.toISOString().slice(0, 7), {
        month: d.toLocaleDateString("fr-CA", { month: "short" }), soumissions: 0, ventes: 0,
      });
    }
    for (const r of rows) {
      const k = r.created_at.slice(0, 7);
      const m = months.get(k);
      if (!m) continue;
      m.soumissions += 1;
      m.ventes += Number(r.total ?? 0);
    }

    return {
      count, amount, accepted,
      conversion: count ? Math.round((accepted / count) * 100) : 0,
      materials: tally((r) => r.public_payload?.material),
      cities: tally((r) => r.jsc_requests?.city ?? r.public_payload?.delivery_address?.split(",")[1]),
      monthly: [...months.values()],
    };
  }, [rows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement du tableau de bord…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <TrendingUp className="h-5 w-5 text-primary" /> Tableau de bord
        </h2>
        <p className="text-sm text-muted-foreground">Activité commerciale générée par le moteur de soumission.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Soumissions" value={String(stats.count)} />
        <Card label="Ventes estimées" value={money.format(stats.amount)} />
        <Card label="Acceptées" value={String(stats.accepted)} />
        <Card label="Taux de conversion" value={`${stats.conversion} %`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-3 text-sm font-semibold">Soumissions par mois</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.monthly}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip />
                <Bar dataKey="soumissions" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="mb-3 text-sm font-semibold">Ventes estimées par mois</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.monthly}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v: number) => money.format(Number(v))} />
                <Line type="monotone" dataKey="ventes" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TopList title="Matériaux les plus demandés" rows={stats.materials} />
        <TopList title="Secteurs les plus actifs" rows={stats.cities} />
      </div>
    </div>
  );
}

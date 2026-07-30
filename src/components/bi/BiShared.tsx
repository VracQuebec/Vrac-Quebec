// Briques d'interface réutilisables du Centre d'Intelligence d'Affaires.
import { ReactNode, useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Download, Minus, Table2 } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { delta, exportCsv, money, num, type Row } from "@/lib/bi/api";

export const CHART_COLORS = [
  "hsl(var(--primary))", "#2563eb", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#ec4899", "#10b981",
];

export function SectionCard({ title, subtitle, actions, children }: {
  title: string; subtitle?: string; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function KpiCard({ label, value, previous, current, hint, Icon }: {
  label: string; value: string; previous?: number; current?: number; hint?: string;
  Icon?: React.ComponentType<{ className?: string }>;
}) {
  const d = previous === undefined ? null : delta(current, previous);
  const Trend = d === null ? Minus : d >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold leading-none">{value}</p>
      {d !== null ? (
        <p className={`mt-1.5 flex items-center gap-1 text-xs ${d >= 0 ? "text-primary" : "text-destructive"}`}>
          <Trend className="h-3.5 w-3.5" />{d > 0 ? "+" : ""}{num(d, 1)} % vs période précédente
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export type Col = { key: string; label: string; format?: "money" | "number" | "pct" | "text" };

export function DataTable({ rows, cols, filename, empty = "Aucune donnée pour cette période." }: {
  rows: Row[]; cols: Col[]; filename: string; empty?: string;
}) {
  const [limit, setLimit] = useState(10);
  const shown = rows.slice(0, limit);
  const fmt = (v: unknown, f?: Col["format"]) =>
    f === "money" ? money(v) : f === "number" ? num(v, 2) : f === "pct" ? `${num(v, 1)} %` : String(v ?? "—");

  if (!rows.length) return <p className="py-6 text-center text-xs text-muted-foreground">{empty}</p>;
  return (
    <div className="space-y-2">
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              {cols.map((c) => <th key={c.key} className="py-2 pr-3 font-medium">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="border-b last:border-0">
                {cols.map((c) => (
                  <th key={c.key} scope={c === cols[0] ? "row" : undefined}
                    className={`py-2 pr-3 font-normal ${c === cols[0] ? "text-left font-medium" : "tabular-nums"}`}>
                    {fmt(r[c.key], c.format)}
                  </th>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {rows.length > limit && (
          <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + 20)}>
            <Table2 className="mr-1.5 h-3.5 w-3.5" /> Afficher plus ({rows.length - limit})
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => exportCsv(filename, rows)}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
        </Button>
      </div>
    </div>
  );
}

export function BarBlock({ rows, xKey, yKey, height = 260 }: {
  rows: Row[]; xKey: string; yKey: string; height?: number;
}) {
  const data = useMemo(() => rows.slice(0, 8), [rows]);
  if (!data.length) return <p className="py-6 text-center text-xs text-muted-foreground">Aucune donnée.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={54} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) => money(v)} />
        <Bar dataKey={yKey} radius={[6, 6, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PieBlock({ rows, nameKey, valueKey, height = 260 }: {
  rows: Row[]; nameKey: string; valueKey: string; height?: number;
}) {
  const data = rows.slice(0, 6);
  if (!data.length) return <p className="py-6 text-center text-xs text-muted-foreground">Aucune donnée.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey={valueKey} nameKey={nameKey} outerRadius={90} innerRadius={45} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v: number) => money(v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function LineBlock({ rows, xKey, series, height = 280 }: {
  rows: Row[]; xKey: string; series: Array<{ key: string; label: string }>; height?: number;
}) {
  if (!rows.length) return <p className="py-6 text-center text-xs text-muted-foreground">Aucune donnée.</p>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) => money(v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label}
            stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
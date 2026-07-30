// Centre d'Intelligence d'Affaires — accès aux données réelles (aucune donnée codée en dur).
import { supabase } from "@/integrations/supabase/client";

export type Row = Record<string, unknown>;

type RpcFn = (name: string, args?: Record<string, unknown>) =>
  Promise<{ data: unknown; error: { message: string } | null }>;

export const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn;

type FromFn = (table: string) => any; // tables BI hors types générés
export const table = supabase.from.bind(supabase) as unknown as FromFn;

export type Overview = {
  period: { from: string; to: string; previous_from: string; previous_to: string };
  revenue: Record<string, number>;
  counts: Record<string, number>;
  averages: Record<string, number>;
  profitability: Record<string, number>;
  monthly: Array<{ month: string; revenue: number; orders: number; net_margin: number }>;
};

export type Analytics = Record<string, Row[] | Record<string, number>>;

export type Forecast = {
  history: Array<{ month: string; revenue: number; orders: number }>;
  avg_3m: number; avg_12m: number; growth_pct: number;
  projection: Array<{ month: string; forecast: number }>;
  seasonality: Array<{ month_number: number; label: string; revenue: number }>;
};

export type Alert = { level: "critical" | "warning" | "info"; type: string; title: string; detail: string };

export type Goal = {
  id: string; name: string; metric: string; target_value: number;
  period: string; starts_on: string; ends_on: string; notes: string | null; current_value: number;
};

export const GOAL_METRICS: Array<{ value: string; label: string; money: boolean }> = [
  { value: "revenue", label: "Chiffre d'affaires", money: true },
  { value: "profit", label: "Rentabilité (marge nette)", money: true },
  { value: "orders", label: "Commandes", money: false },
  { value: "deliveries", label: "Livraisons", money: false },
  { value: "new_clients", label: "Nouveaux clients", money: false },
];

export const money = (v: unknown) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })
    .format(Number(v ?? 0));

export const num = (v: unknown, digits = 0) =>
  new Intl.NumberFormat("fr-CA", { maximumFractionDigits: digits }).format(Number(v ?? 0));

export const pct = (v: unknown) => `${num(v, 1)} %`;

export function delta(current: unknown, previous: unknown): number | null {
  const c = Number(current ?? 0), p = Number(previous ?? 0);
  if (!p) return c ? 100 : null;
  return Math.round(((c - p) / Math.abs(p)) * 1000) / 10;
}

export const PRESETS: Array<{ id: string; label: string; range: () => [string, string] }> = [
  { id: "7d", label: "7 derniers jours", range: () => [iso(addDays(new Date(), -6)), iso(new Date())] },
  { id: "30d", label: "30 derniers jours", range: () => [iso(addDays(new Date(), -29)), iso(new Date())] },
  { id: "month", label: "Mois en cours", range: () => [iso(startOfMonth(new Date())), iso(new Date())] },
  { id: "quarter", label: "90 derniers jours", range: () => [iso(addDays(new Date(), -89)), iso(new Date())] },
  { id: "year", label: "Année en cours", range: () => [iso(new Date(new Date().getFullYear(), 0, 1)), iso(new Date())] },
  { id: "all", label: "Depuis le début", range: () => ["2000-01-01", iso(new Date())] },
];

function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
export function iso(d: Date) { return d.toISOString().slice(0, 10); }

/** Export CSV natif (aucune dépendance). */
export function exportCsv(filename: string, rows: Row[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  download(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
}

/** Export Excel multi-feuilles. */
export async function exportExcel(filename: string, sheets: Record<string, Row[]>) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => {
    if (!rows?.length) return;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
  });
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
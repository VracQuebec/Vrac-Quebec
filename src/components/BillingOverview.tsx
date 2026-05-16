import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle, Search } from "lucide-react";
import {
  PAYMENT_STATUSES, findPaymentStatus, overdueBucket, type LeadTrip,
} from "@/lib/billing";

interface TripRow extends LeadTrip {
  submissions?: {
    name: string | null;
    address: string | null;
    dompe_number: string | null;
    submission_number: number | null;
  } | null;
  entrepreneurs?: { name: string | null; company: string | null } | null;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n || 0);

const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("fr-CA") : "—";

interface Props {
  onOpenLead: (submissionId: string) => void;
}

export default function BillingOverview({ onOpenLead }: Props) {
  const [rows, setRows] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("lead_trips" as any)
        .select("*, submissions(name,address,dompe_number,submission_number), entrepreneurs(name,company)")
        .order("created_at", { ascending: false })
        .limit(2000);
      setRows((data as any) || []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (status !== "all" && r.payment_status !== status) return false;
      if (onlyOverdue && !overdueBucket(r)) return false;
      if (q) {
        const hay = [
          r.invoice_number, r.material, r.notes,
          r.submissions?.name, r.submissions?.address, r.submissions?.dompe_number,
          r.entrepreneurs?.name, r.entrepreneurs?.company,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, status, q, onlyOverdue]);

  const totals = useMemo(() => {
    let billed = 0, paid = 0, overdue = 0;
    for (const t of filtered) {
      const v = Number(t.total_price || 0);
      if (t.payment_status === "annule") continue;
      if (["facture", "paye_partiel", "en_retard"].includes(t.payment_status)) billed += v;
      if (t.payment_status === "paye") { billed += v; paid += v; }
      if (overdueBucket(t)) overdue += v;
    }
    return { billed, paid, overdue, balance: billed - paid, count: filtered.length };
  }, [filtered]);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
        <Kpi label="Voyages" value={String(totals.count)} />
        <Kpi label="Facturé" value={fmtMoney(totals.billed)} />
        <Kpi label="Payé" value={fmtMoney(totals.paid)} tone="emerald" />
        <Kpi label="Solde dû" value={fmtMoney(totals.balance)} tone="amber" />
        <Kpi label="En retard" value={fmtMoney(totals.overdue)} tone="rose" />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher : client, facture, entrepreneur…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-card font-body" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-border bg-card font-body">
          <option value="all">Tous statuts</option>
          {PAYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm font-body cursor-pointer">
          <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
          En retard uniquement
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-12 font-body">Aucun voyage facturable trouvé.</p>
      ) : (
        <div className="overflow-x-auto bg-card rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary">
              <tr>
                {["Client", "Matériau", "Voyages", "Total", "Facture #", "Livraison", "Paiement", "Mode", "Entrepreneur", "Statut", ""].map((h) => (
                  <th key={h} className="text-left px-3 py-2 font-display font-bold text-xs uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const ps = findPaymentStatus(r.payment_status);
                const ob = overdueBucket(r);
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-secondary/50">
                    <td className="px-3 py-2 font-body">
                      <div className="font-display font-semibold">{r.submissions?.name || "—"}</div>
                      <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                        {r.submissions?.dompe_number || `#${r.submissions?.submission_number ?? ""}`} — {r.submissions?.address || ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-body">{r.material || "—"}</td>
                    <td className="px-3 py-2 font-body">{r.trips_count}</td>
                    <td className="px-3 py-2 font-body font-display font-bold">{fmtMoney(Number(r.total_price))}</td>
                    <td className="px-3 py-2 font-body">{r.invoice_number || "—"}</td>
                    <td className="px-3 py-2 font-body">{fmtDate(r.delivery_date)}</td>
                    <td className="px-3 py-2 font-body">{fmtDate(r.payment_date)}</td>
                    <td className="px-3 py-2 font-body">{r.payment_method || "—"}</td>
                    <td className="px-3 py-2 font-body">{r.entrepreneurs?.name || "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-display font-bold uppercase border ${ps.color}`}>
                        {ps.label}
                      </span>
                      {ob && (
                        <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-rose-700 font-display font-semibold">
                          <AlertTriangle className="w-3 h-3" /> {ob.days}j (≥{ob.bucket}j)
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => onOpenLead(r.submission_id)}
                        className="text-primary text-xs font-display font-semibold hover:underline">Ouvrir</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const Kpi = ({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "emerald" | "amber" | "rose" }) => {
  const toneCls = tone === "emerald" ? "text-emerald-700"
    : tone === "amber" ? "text-amber-700"
    : tone === "rose" ? "text-rose-700"
    : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase font-display font-bold text-muted-foreground">{label}</div>
      <div className={`text-base font-display font-bold ${toneCls}`}>{value}</div>
    </div>
  );
};

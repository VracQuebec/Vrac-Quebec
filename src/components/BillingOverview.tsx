import { useEffect, useMemo, useState } from "react";
import { neutralizeSpreadsheetCell } from "@/lib/security/filters";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle, Search, Download, FileSpreadsheet, Printer, Trash2 } from "lucide-react";
import InvoiceEditDialog, { ConfirmDialog } from "@/components/billing/InvoiceEditDialog";
import InvoiceDetailDialog from "@/components/billing/InvoiceDetailDialog";

import { supabase as sb } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

import * as XLSX from "xlsx";
import {
  PAYMENT_STATUSES, findPaymentStatus, overdueBucket, type LeadTrip,
  computeTaxes, TPS_RATE, TVQ_RATE,
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
  const [entrepreneurId, setEntrepreneurId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");
  const [editing, setEditing] = useState<TripRow | null>(null);
  const [deleting, setDeleting] = useState<TripRow | null>(null);
  const [detail, setDetail] = useState<TripRow | null>(null);
  const [busy, setBusy] = useState(false);


  const applyDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    const { error } = await sb.from("lead_trips" as never).delete().eq("id", deleting.id);
    setBusy(false);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    setRows((prev) => prev.filter((x) => x.id !== deleting.id));
    setDetail((d) => (d && d.id === deleting.id ? null : d));
    setDeleting(null);
    toast({ title: "Facture supprimée" });
  };



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

  const entrepreneursList = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.entrepreneur_id && r.entrepreneurs?.name) {
        map.set(r.entrepreneur_id, `${r.entrepreneurs.name}${r.entrepreneurs.company ? ` (${r.entrepreneurs.company})` : ""}`);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const minA = minAmount ? Number(minAmount) : null;
    const maxA = maxAmount ? Number(maxAmount) : null;
    const from = dateFrom ? new Date(dateFrom).getTime() : null;
    const to = dateTo ? new Date(dateTo).getTime() + 86400000 : null;
    return rows.filter((r) => {
      if (status !== "all" && r.payment_status !== status) return false;
      if (onlyOverdue && !overdueBucket(r)) return false;
      if (entrepreneurId !== "all" && r.entrepreneur_id !== entrepreneurId) return false;
      const refDate = r.delivery_date || r.created_at;
      if (from && refDate && new Date(refDate).getTime() < from) return false;
      if (to && refDate && new Date(refDate).getTime() > to) return false;
      const tx = computeTaxes(Number(r.total_price || 0), !!r.taxable,
        Number(r.tps_rate ?? TPS_RATE), Number(r.tvq_rate ?? TVQ_RATE));
      if (minA != null && tx.total < minA) return false;
      if (maxA != null && tx.total > maxA) return false;
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
  }, [rows, status, q, onlyOverdue, entrepreneurId, dateFrom, dateTo, minAmount, maxAmount]);

  const totals = useMemo(() => {
    let billed = 0, paid = 0, overdue = 0, tps = 0, tvq = 0;
    let nbInvoiced = 0, nbPaid = 0, nbOverdue = 0, monthBilled = 0;
    const dompes = new Set<string>();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    for (const t of filtered) {
      if (t.payment_status === "annule") continue;
      const tx = computeTaxes(Number(t.total_price || 0), !!t.taxable,
        Number(t.tps_rate ?? TPS_RATE), Number(t.tvq_rate ?? TVQ_RATE));
      const v = tx.total;
      const isInvoiced = ["facture", "paye_partiel", "en_retard", "paye"].includes(t.payment_status);
      if (isInvoiced) { billed += v; nbInvoiced++; }
      if (t.payment_status === "paye") { paid += v; nbPaid++; }
      if (overdueBucket(t)) { overdue += v; nbOverdue++; }
      if (isInvoiced) {
        const ref = t.delivery_date || t.created_at;
        if (ref && new Date(ref).getTime() >= monthStart) monthBilled += v;
      }
      if (t.submissions?.dompe_number) dompes.add(t.submissions.dompe_number);
      tps += tx.tps; tvq += tx.tvq;
    }
    return {
      billed, paid, overdue, balance: billed - paid, count: filtered.length, tps, tvq,
      nbInvoiced, nbPaid, nbOverdue, monthBilled, nbDompes: dompes.size,
    };
  }, [filtered]);

  const exportRows = () => filtered.map((r) => {
    const tx = computeTaxes(Number(r.total_price || 0), !!r.taxable,
      Number(r.tps_rate ?? TPS_RATE), Number(r.tvq_rate ?? TVQ_RATE));
    return {
      "Facture #": r.invoice_number || "",
      "Client": r.submissions?.name || "",
      "Dompe": r.submissions?.dompe_number || `#${r.submissions?.submission_number ?? ""}`,
      "Adresse": r.submissions?.address || "",
      "Matériau": r.material || "",
      "Voyages": r.trips_count,
      "Prix unitaire": Number(r.price_per_trip || 0),
      "Sous-total": tx.subtotal,
      "TPS": tx.tps,
      "TVQ": tx.tvq,
      "Total": tx.total,
      "Taxable": tx.taxable ? "Oui" : "Non",
      "Livraison": r.delivery_date || "",
      "Échéance": r.due_date || "",
      "Paiement": r.payment_date || "",
      "Mode": r.payment_method || "",
      "Statut": findPaymentStatus(r.payment_status).label,
      "Entrepreneur": r.entrepreneurs?.name || "",
      "Compagnie": r.entrepreneurs?.company || "",
      "Notes": r.notes || "",
    };
  });

  // Neutralisation des formules de tableur avant tout export.
  const safeRows = () => exportRows().map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      out[k] = typeof v === "number" ? v : neutralizeSpreadsheetCell(v);
    }
    return out;
  });

  const exportCsv = () => {
    const data = safeRows();
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const escape = (v: any) => {
      const s = String(v ?? "");
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(";"), ...data.map((r) => headers.map((h) => escape((r as any)[h])).join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `facturation-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportXlsx = () => {
    const data = safeRows();
    if (!data.length) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Facturation");
    XLSX.writeFile(wb, `facturation-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const printPdf = () => window.print();

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        <Kpi label="Voyages" value={String(totals.count)} />
        <Kpi label="Facturé (TTC)" value={fmtMoney(totals.billed)} />
        <Kpi label="Payé" value={fmtMoney(totals.paid)} tone="emerald" />
        <Kpi label="Solde dû" value={fmtMoney(totals.balance)} tone="amber" />
        <Kpi label="En retard" value={fmtMoney(totals.overdue)} tone="rose" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        <Kpi label="Factures émises" value={String(totals.nbInvoiced)} />
        <Kpi label="Factures payées" value={String(totals.nbPaid)} tone="emerald" />
        <Kpi label="Factures en retard" value={String(totals.nbOverdue)} tone="rose" />
        <Kpi label="Dompes facturées" value={String(totals.nbDompes)} />
        <Kpi label="Facturé ce mois-ci" value={fmtMoney(totals.monthBilled)} />
      </div>
      <div className="text-xs font-body text-muted-foreground mb-4 flex flex-wrap gap-4">
        <span>TPS perçue : <span className="font-display font-semibold text-foreground">{fmtMoney(totals.tps)}</span></span>
        <span>TVQ perçue : <span className="font-display font-semibold text-foreground">{fmtMoney(totals.tvq)}</span></span>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 print:hidden">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher : client, facture, entrepreneur…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-card font-body" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-border bg-card font-body max-w-full min-w-0">
          <option value="all">Tous statuts</option>
          {PAYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={entrepreneurId} onChange={(e) => setEntrepreneurId(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-border bg-card font-body max-w-full min-w-0">
          <option value="all">Tous entrepreneurs</option>
          {entrepreneursList.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm font-body cursor-pointer">
          <input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} />
          En retard uniquement
        </label>
      </div>
      <div className="flex flex-wrap gap-2 mb-4 print:hidden text-xs">
        <label className="inline-flex items-center gap-1 font-body text-muted-foreground">Du
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-border bg-card font-body" />
        </label>
        <label className="inline-flex items-center gap-1 font-body text-muted-foreground">Au
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="px-2 py-1.5 rounded-lg border border-border bg-card font-body" />
        </label>
        <input type="number" placeholder="Min $" value={minAmount} onChange={(e) => setMinAmount(e.target.value)}
          className="w-24 px-2 py-1.5 rounded-lg border border-border bg-card font-body" />
        <input type="number" placeholder="Max $" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)}
          className="w-24 px-2 py-1.5 rounded-lg border border-border bg-card font-body" />
        <div className="ml-auto flex gap-2">
          <button onClick={exportCsv} disabled={!filtered.length}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary text-foreground font-display font-semibold disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button onClick={exportXlsx} disabled={!filtered.length}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary text-foreground font-display font-semibold disabled:opacity-50">
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </button>
          <button onClick={printPdf} disabled={!filtered.length}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary text-foreground font-display font-semibold disabled:opacity-50">
            <Printer className="w-3.5 h-3.5" /> PDF
          </button>
        </div>
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
                {["Client", "Matériau", "Voyages", "Total", "Facture #", "Livraison", "Échéance", "Paiement", "Mode", "Entrepreneur", "Statut", ""].map((h) => (
                  <th key={h} className="text-left px-3 py-2 font-display font-bold text-xs uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const ps = findPaymentStatus(r.payment_status);
                const ob = overdueBucket(r);
                return (
                  <tr key={r.id} onClick={() => setDetail(r)} role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetail(r); } }}
                    className="border-t border-border hover:bg-secondary/50 cursor-pointer">

                    <td className="px-3 py-2 font-body">
                      <div className="font-display font-semibold">{r.submissions?.name || "—"}</div>
                      <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                        {r.submissions?.dompe_number || `#${r.submissions?.submission_number ?? ""}`} — {r.submissions?.address || ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-body">{r.material || "—"}</td>
                    <td className="px-3 py-2 font-body">{r.trips_count}</td>
                    <td className="px-3 py-2 font-body font-display font-bold">
                      {(() => {
                        const tx = computeTaxes(Number(r.total_price || 0), !!r.taxable,
                          Number(r.tps_rate ?? TPS_RATE), Number(r.tvq_rate ?? TVQ_RATE));
                        return (
                          <>
                            <div>{fmtMoney(tx.total)}</div>
                            {tx.taxable && <div className="text-[10px] font-body font-normal text-muted-foreground">HT {fmtMoney(tx.subtotal)}</div>}
                            {!tx.taxable && <div className="text-[10px] font-body font-normal italic text-muted-foreground">Non taxable</div>}
                          </>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 font-body">{r.invoice_number || "—"}</td>
                    <td className="px-3 py-2 font-body">{fmtDate(r.delivery_date)}</td>
                    <td className="px-3 py-2 font-body">{fmtDate(r.due_date as any)}</td>
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
                    <td className="px-3 py-2 print:hidden" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button onClick={() => onOpenLead(r.submission_id)}
                          className="px-2 py-1.5 rounded-md border border-border bg-card hover:bg-secondary text-xs font-display font-semibold min-h-[34px]">Ouvrir</button>
                        <button onClick={() => setEditing(r)}
                          className="px-2 py-1.5 rounded-md border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-display font-semibold min-h-[34px]">Modifier</button>
                        <button onClick={() => setDeleting(r)} aria-label="Supprimer la facture"
                          className="px-2 py-1.5 rounded-md border border-rose-500/50 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 text-xs font-display font-semibold min-h-[34px]">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>

                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && !editing && !deleting && (
        <InvoiceDetailDialog
          invoice={detail}
          onClose={() => setDetail(null)}
          onEdit={() => setEditing(detail)}
          onDelete={() => setDeleting(detail)}
          onOpenLead={onOpenLead}
          onStatusChanged={(row) => {
            setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...row } : x)));
            setDetail((d) => (d && d.id === row.id ? { ...d, ...row } : d));
          }}
        />
      )}


      {editing && (
        <InvoiceEditDialog
          invoice={editing}
          onClose={() => setEditing(null)}
          onSaved={(row) => {
            setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...row } : x)));
            setDetail((d) => (d && d.id === row.id ? { ...d, ...row } : d));
          }}
          onDeleted={(id) => {
            setRows((prev) => prev.filter((x) => x.id !== id));
            setDetail((d) => (d && d.id === id ? null : d));
          }}
        />
      )}


      {deleting && (
        <ConfirmDialog
          danger
          title="⚠️ Supprimer cette facture ?"
          message={`Cette action supprimera définitivement la facture et ses données associées.${
            deleting.payment_status === "paye"
              ? "\n\n⚠️ Cette facture est déjà marquée comme payée. La supprimer peut affecter les données de paiement et les statistiques de facturation."
              : ""
          }`}
          confirmLabel="Supprimer définitivement"
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={applyDelete}
        />
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

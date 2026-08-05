// ============================================================
// PANNEAU D'ADMINISTRATION — Gestion des demandes / soumissions.
// Source de vérité unique : table jsc_quotes (générée par le moteur).
// Recherche, filtres, notes internes, export Excel et PDF.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileDown, FileText, Loader2, Printer, RefreshCw, Search } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const money = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" });

export const QUOTE_STATUSES = [
  { value: "sent", label: "Envoyée" },
  { value: "accepted", label: "Acceptée" },
  { value: "refused", label: "Refusée" },
  { value: "expired", label: "Expirée" },
];

export interface QuoteRow {
  id: string;
  quote_number: string | null;
  status: string | null;
  total: number | null;
  subtotal: number | null;
  tax_total: number | null;
  valid_until: string | null;
  internal_notes: string | null;
  created_at: string;
  public_payload: Record<string, any> | null;
  jsc_clients: { name: string | null; contact_name: string | null; phone: string | null; email: string | null } | null;
  jsc_requests: { request_number: string | null; city: string | null; delivery_address: string | null } | null;
}

const SELECT =
  "id,quote_number,status,total,subtotal,tax_total,valid_until,internal_notes,created_at,public_payload," +
  "jsc_clients(name,contact_name,phone,email),jsc_requests(request_number,city,delivery_address)";

export function useQuotes() {
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("jsc_quotes")
      .select(SELECT)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) toast.error(error.message);
    setRows((data ?? []) as unknown as QuoteRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  return { rows, loading, reload: load, setRows };
}

export default function QuotesBoard() {
  const { rows, loading, reload, setRows } = useQuotes();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [material, setMaterial] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const materials = useMemo(
    () => Array.from(new Set(rows.map((r) => r.public_payload?.material).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (material !== "all" && r.public_payload?.material !== material) return false;
      const day = r.created_at.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!q) return true;
      return [
        r.quote_number, r.jsc_clients?.name, r.jsc_clients?.contact_name, r.jsc_clients?.phone,
        r.jsc_clients?.email, r.jsc_requests?.city, r.public_payload?.material,
        r.public_payload?.delivery_address, r.internal_notes,
      ].some((v) => String(v ?? "").toLowerCase().includes(q));
    });
  }, [rows, search, status, material, from, to]);

  const totals = useMemo(() => ({
    count: filtered.length,
    amount: filtered.reduce((s, r) => s + Number(r.total ?? 0), 0),
    accepted: filtered.filter((r) => r.status === "accepted").length,
  }), [filtered]);

  const patch = async (id: string, values: Partial<QuoteRow>) => {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...values } : r)));
    const { error } = await supabase.from("jsc_quotes").update(values as never).eq("id", id);
    if (error) { toast.error(error.message); void reload(); return; }
    toast.success("Demande mise à jour");
  };

  const tableData = () => filtered.map((r) => ({
    "Numéro": r.quote_number ?? "",
    "Date": new Date(r.created_at).toLocaleDateString("fr-CA"),
    "Statut": QUOTE_STATUSES.find((s) => s.value === r.status)?.label ?? r.status ?? "",
    "Client": r.jsc_clients?.name ?? "",
    "Téléphone": r.jsc_clients?.phone ?? "",
    "Courriel": r.jsc_clients?.email ?? "",
    "Matériau": r.public_payload?.material ?? "",
    "Quantité (t)": r.public_payload?.tonnage ?? "",
    "Voyages": r.public_payload?.trips ?? "",
    "Livraison": r.public_payload?.delivery_address ?? r.jsc_requests?.delivery_address ?? "",
    "Estimation": Number(r.total ?? 0),
    "Notes": r.internal_notes ?? "",
  }));

  const exportExcel = () => {
    const sheet = XLSX.utils.json_to_sheet(tableData());
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Demandes");
    XLSX.writeFile(book, `demandes-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPdf = () => {
    const data = tableData();
    const win = window.open("", "_blank");
    if (!win) { toast.error("Autorisez les fenêtres surgissantes pour l'export PDF."); return; }
    const head = Object.keys(data[0] ?? { Aucune: "" });
    win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
      <title>Demandes — Vrac Québec</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#111}
      h1{font-size:18px}table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{border:1px solid #ddd;padding:5px;text-align:left}th{background:#7ED321;color:#111}</style>
      </head><body><h1>Demandes — ${new Date().toLocaleDateString("fr-CA")} (${data.length})</h1>
      <table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>
      ${data.map((r) => `<tr>${head.map((h) => `<td>${String((r as Record<string, unknown>)[h] ?? "")}</td>`).join("")}</tr>`).join("")}
      </tbody></table></body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <FileText className="h-5 w-5 text-primary" /> Demandes et soumissions
          </h2>
          <p className="text-sm text-muted-foreground">
            Toutes les demandes générées par le moteur, avec suivi, notes et exports.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel}>
            <FileDown className="mr-2 h-4 w-4" /> Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf}>
            <Printer className="mr-2 h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Demandes", String(totals.count)],
          ["Valeur estimée", money.format(totals.amount)],
          ["Acceptées", String(totals.accepted)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{k}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{v}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Client, numéro, ville, notes…" value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {QUOTE_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={material} onValueChange={setMaterial}>
          <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les matériaux</SelectItem>
            {materials.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-[150px]" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" className="w-[150px]" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {["Numéro", "Date", "Client", "Matériau", "Quantité", "Estimation", "Statut", ""].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Chargement…</td></tr>}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Aucune demande.</td></tr>
            )}
            {filtered.map((r) => {
              const p = r.public_payload ?? {};
              const open = openId === r.id;
              return (
                <>
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{r.quote_number ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("fr-CA")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.jsc_clients?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.jsc_clients?.phone ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.material ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {p.tonnage ? `${p.tonnage} t` : "—"}{p.trips ? ` · ${p.trips} voy.` : ""}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{money.format(Number(r.total ?? 0))}</td>
                    <td className="px-4 py-3">
                      <Select value={r.status ?? "sent"} onValueChange={(v) => void patch(r.id, { status: v })}>
                        <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {QUOTE_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setOpenId(open ? null : r.id)}>
                        {open ? "Fermer" : "Détail"}
                      </Button>
                    </td>
                  </tr>
                  {open && (
                    <tr key={`${r.id}-detail`} className="bg-muted/20">
                      <td colSpan={8} className="px-4 py-4">
                        <div className="grid gap-4 sm:grid-cols-3">
                          <div className="space-y-1 text-sm">
                            <p className="font-semibold">Client</p>
                            <p className="text-muted-foreground">{r.jsc_clients?.contact_name ?? "—"}</p>
                            <p className="text-muted-foreground">{r.jsc_clients?.email ?? "—"}</p>
                            <p className="text-muted-foreground">
                              {p.delivery_address ?? r.jsc_requests?.delivery_address ?? "—"}
                            </p>
                            <p className="text-muted-foreground">Demande : {r.jsc_requests?.request_number ?? "—"}</p>
                          </div>
                          <div className="space-y-1 text-sm">
                            <p className="font-semibold">Montants</p>
                            <p className="text-muted-foreground">Sous-total : {money.format(Number(r.subtotal ?? 0))}</p>
                            <p className="text-muted-foreground">Taxes : {money.format(Number(r.tax_total ?? 0))}</p>
                            <p className="text-muted-foreground">Valide jusqu'au : {r.valid_until ?? "—"}</p>
                          </div>
                          <div className="space-y-2 text-sm">
                            <p className="font-semibold">Notes internes</p>
                            <Textarea
                              defaultValue={r.internal_notes ?? ""}
                              placeholder="Suivi, rappel, particularités…"
                              onBlur={(e) => {
                                const value = e.target.value;
                                if (value !== (r.internal_notes ?? "")) void patch(r.id, { internal_notes: value });
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
      {loading && <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  );
}

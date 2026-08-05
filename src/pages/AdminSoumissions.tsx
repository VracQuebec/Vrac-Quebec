// ============================================================
// MODULE 5 — Tableau de bord administratif des soumissions.
// Vue interne : soumissions envoyées, client, montants, statut,
// et détail technique complet (jamais visible du client).
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileText, Loader2, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const money = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" });
const STATUSES = [
  { value: "all", label: "Tous les statuts" },
  { value: "sent", label: "Envoyée" },
  { value: "accepted", label: "Acceptée" },
  { value: "refused", label: "Refusée" },
  { value: "expired", label: "Expirée" },
];

interface QuoteRow {
  id: string;
  quote_number: string | null;
  status: string | null;
  total: number | null;
  subtotal: number | null;
  tax_total: number | null;
  valid_until: string | null;
  created_at: string;
  public_payload: Record<string, any> | null;
  jsc_clients: { name: string | null; contact_name: string | null; phone: string | null; email: string | null } | null;
  jsc_requests: { request_number: string | null; city: string | null; delivery_address: string | null } | null;
}

export default function AdminSoumissions() {
  const { ready, session } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles();
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("jsc_quotes")
      .select("id,quote_number,status,total,subtotal,tax_total,valid_until,created_at,public_payload,jsc_clients(name,contact_name,phone,email),jsc_requests(request_number,city,delivery_address)")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setRows((data ?? []) as unknown as QuoteRow[]);
    setLoading(false);
  }, [status]);

  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.quote_number, r.jsc_clients?.name, r.jsc_clients?.contact_name, r.jsc_clients?.phone,
        r.jsc_clients?.email, r.jsc_requests?.city, r.jsc_requests?.delivery_address]
        .some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [rows, search]);

  const totals = useMemo(() => ({
    count: filtered.length,
    amount: filtered.reduce((s, r) => s + Number(r.total ?? 0), 0),
    accepted: filtered.filter((r) => r.status === "accepted").length,
  }), [filtered]);

  const setStatusFor = async (id: string, next: string) => {
    const { error } = await supabase.from("jsc_quotes").update({ status: next }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Statut mis à jour");
    void load();
  };

  if (!ready || rolesLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!session || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">
        Accès réservé aux administrateurs.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
              <Link to="/admin"><ArrowLeft className="mr-2 h-4 w-4" /> Administration</Link>
            </Button>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <FileText className="h-6 w-6 text-primary" /> Soumissions
            </h1>
            <p className="text-sm text-muted-foreground">
              Toutes les soumissions générées par le moteur, avec leur détail interne.
            </p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </Button>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            ["Soumissions", String(totals.count)],
            ["Valeur totale", money.format(totals.amount)],
            ["Acceptées", String(totals.accepted)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{k}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{v}</p>
            </div>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Client, numéro, ville…" value={search}
              onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {["Numéro", "Date", "Client", "Matériau", "Livraison", "Total", "Statut", ""].map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Chargement…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Aucune soumission.</td></tr>
              )}
              {filtered.map((r) => {
                const p = r.public_payload ?? {};
                const open = openId === r.id;
                return (
                  <>
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">{r.quote_number ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString("fr-CA")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{r.jsc_clients?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.jsc_clients?.phone ?? ""}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.material ?? "—"}{p.tonnage ? ` · ${p.tonnage} t` : ""}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-muted-foreground">
                        {p.delivery_address ?? r.jsc_requests?.delivery_address ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-foreground">
                        {money.format(Number(r.total ?? 0))}
                      </td>
                      <td className="px-4 py-3">
                        <Select value={r.status ?? "sent"} onValueChange={(v) => void setStatusFor(r.id, v)}>
                          <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUSES.filter((s) => s.value !== "all").map((s) => (
                              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
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
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1 text-sm">
                              <p className="font-semibold text-foreground">Client</p>
                              <p className="text-muted-foreground">{r.jsc_clients?.contact_name ?? "—"}</p>
                              <p className="text-muted-foreground">{r.jsc_clients?.email ?? "—"}</p>
                              <p className="text-muted-foreground">{r.jsc_clients?.phone ?? "—"}</p>
                              <p className="text-muted-foreground">Demande : {r.jsc_requests?.request_number ?? "—"}</p>
                              <p className="text-muted-foreground">Valide jusqu'au : {r.valid_until ?? "—"}</p>
                            </div>
                            <div className="space-y-1 text-sm">
                              <p className="font-semibold text-foreground">Montants</p>
                              <p className="text-muted-foreground">Sous-total : {money.format(Number(r.subtotal ?? 0))}</p>
                              <p className="text-muted-foreground">Taxes : {money.format(Number(r.tax_total ?? 0))}</p>
                              <p className="text-muted-foreground">Voyages : {p.trips ?? "—"}</p>
                              <p className="text-muted-foreground">
                                Rappel demandé : {p.requested_callback ? "Oui" : "Non"}
                              </p>
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
      </div>
    </div>
  );
}

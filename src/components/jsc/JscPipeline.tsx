// Vue Kanban du flux commercial : demandes, soumissions et commandes.
// Le changement de statut se fait par simple sélection (moins de trois clics).
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Row = Record<string, unknown>;
type Option = { value: string; label: string };

export type PipelineKind = "requests" | "quotes" | "orders";

const CONFIG: Record<PipelineKind, {
  table: string; numberField: string; title: string; amountField?: string;
}> = {
  requests: { table: "jsc_requests", numberField: "request_number", title: "Demandes" },
  quotes: { table: "jsc_quotes", numberField: "quote_number", title: "Soumissions", amountField: "total" },
  orders: { table: "jsc_orders", numberField: "order_number", title: "Commandes", amountField: "total" },
};

const money = (v: unknown) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(Number(v ?? 0));

export default function JscPipeline({
  kind,
  statuses,
  companyId,
}: {
  kind: PipelineKind;
  statuses: Option[];
  companyId?: string | null;
}) {
  const cfg = CONFIG[kind];
  const [rows, setRows] = useState<Row[]>([]);
  const [clients, setClients] = useState<Record<string, string>>({});
  const [materials, setMaterials] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from(cfg.table as never).select("*").is("archived_at", null)
      .order("created_at", { ascending: false }).limit(500);
    if (companyId) q = q.eq("company_id", companyId);
    const [{ data, error }, cl, mt] = await Promise.all([
      q,
      supabase.from("jsc_clients").select("id,name,city").limit(1000),
      supabase.from("jsc_materials").select("id,name").limit(1000),
    ]);
    if (error) toast.error(error.message);
    setRows((data as unknown as Row[]) ?? []);
    setClients(Object.fromEntries(((cl.data as { id: string; name: string }[]) ?? []).map((c) => [c.id, c.name])));
    setMaterials(Object.fromEntries(((mt.data as { id: string; name: string }[]) ?? []).map((m) => [m.id, m.name])));
    setLoading(false);
  }, [cfg.table, companyId]);

  useEffect(() => { void load(); }, [load]);

  const changeStatus = async (row: Row, status: string) => {
    const { error } = await supabase.from(cfg.table as never)
      .update({ status } as never).eq("id", row.id as string);
    if (error) { toast.error(error.message); return; }
    toast.success("Statut mis à jour.");
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
  };

  const filtered = useMemo(() => {
    const s = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && String(r.status ?? "") !== statusFilter) return false;
      if (!s) return true;
      return [
        r[cfg.numberField], clients[String(r.client_id ?? "")], materials[String(r.material_id ?? "")],
        r.city, r.delivery_address,
      ].some((v) => String(v ?? "").toLowerCase().includes(s));
    });
  }, [rows, query, statusFilter, clients, materials, cfg.numberField]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Rechercher (numéro, client, ville, matériau)…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-56"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {statuses.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {statuses.map((col) => {
          const cards = filtered.filter((r) => String(r.status ?? statuses[0].value) === col.value);
          return (
            <div key={col.value} className="w-72 shrink-0 rounded-xl border bg-muted/30 p-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium">{col.label}</span>
                <Badge variant="secondary">{cards.length}</Badge>
              </div>
              <div className="space-y-2">
                {cards.length === 0 && (
                  <p className="px-1 py-4 text-center text-xs text-muted-foreground">Aucun dossier</p>
                )}
                {cards.map((r) => (
                  <div key={String(r.id)} className="rounded-lg border bg-card p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {String(r[cfg.numberField] ?? "—")}
                      </span>
                      {cfg.amountField && (
                        <span className="text-xs font-semibold">{money(r[cfg.amountField])}</span>
                      )}
                    </div>
                    <p className="mt-1 font-medium">{clients[String(r.client_id ?? "")] ?? "Client inconnu"}</p>
                    <p className="text-xs text-muted-foreground">
                      {[materials[String(r.material_id ?? "")], r.city, r.desired_date ?? r.scheduled_date]
                        .filter(Boolean).join(" · ") || "—"}
                    </p>
                    <Select value={String(r.status ?? col.value)} onValueChange={(v) => changeStatus(r, v)}>
                      <SelectTrigger className="mt-2 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {statuses.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

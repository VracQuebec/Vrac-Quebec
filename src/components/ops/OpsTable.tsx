// Tableau des opérations : toutes les livraisons, filtrables et triables.
import { useMemo, useState } from "react";
import { Delivery, OpsRefs, DELIVERY_LIFECYCLE, OPS_PRIORITIES, statusMeta, priorityMeta, money } from "@/lib/jsc/operations";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Search } from "lucide-react";

interface Props {
  deliveries: Delivery[];
  refs: OpsRefs;
  onOpen: (d: Delivery) => void;
}

export default function OpsTable({ deliveries, refs, onOpen }: Props) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [truck, setTruck] = useState("");
  const [driver, setDriver] = useState("");
  const [sort, setSort] = useState<{ key: keyof Delivery; asc: boolean }>({ key: "scheduled_date", asc: true });

  const name = (list: { id: string; name?: string; first_name?: string; last_name?: string | null }[], id?: string | null) => {
    const r = list.find((x) => x.id === id);
    if (!r) return "—";
    return r.name ?? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim();
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = deliveries.filter((d) => {
      if (status && d.status !== status) return false;
      if (priority && d.priority !== priority) return false;
      if (truck && d.truck_id !== truck) return false;
      if (driver && d.driver_id !== driver) return false;
      if (!needle) return true;
      return [d.delivery_number, d.city, d.delivery_address, name(refs.clients, d.client_id), name(refs.materials, d.material_id)]
        .filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
    return [...filtered].sort((a, b) => {
      const va = String(a[sort.key] ?? "");
      const vb = String(b[sort.key] ?? "");
      return sort.asc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }, [deliveries, q, status, priority, truck, driver, sort, refs]);

  const th = (key: keyof Delivery, label: string) => (
    <th
      className="px-3 py-2 text-left font-display font-bold uppercase text-[10px] tracking-wide text-muted-foreground cursor-pointer select-none"
      onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}
    >
      <span className="inline-flex items-center gap-1">{label}<ArrowUpDown className="w-3 h-3 opacity-50" /></span>
    </th>
  );

  const sel = "px-2 py-2 text-xs rounded-lg border border-border bg-background";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (numéro, client, ville, matériau)…" className="pl-8 h-9 text-xs" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
          <option value="">Tous les statuts</option>
          {DELIVERY_LIFECYCLE.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={sel}>
          <option value="">Toutes priorités</option>
          {OPS_PRIORITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={truck} onChange={(e) => setTruck(e.target.value)} className={sel}>
          <option value="">Tous les camions</option>
          {refs.trucks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={driver} onChange={(e) => setDriver(e.target.value)} className={sel}>
          <option value="">Tous les chauffeurs</option>
          {refs.drivers.map((d) => <option key={d.id} value={d.id}>{d.first_name} {d.last_name ?? ""}</option>)}
        </select>
        <Button variant="outline" size="sm" onClick={() => { setQ(""); setStatus(""); setPriority(""); setTruck(""); setDriver(""); }}>
          Réinitialiser
        </Button>
      </div>

      <div className="rounded-xl border border-border overflow-x-auto bg-card">
        <table className="w-full text-xs">
          <thead className="bg-secondary/40 border-b border-border">
            <tr>
              {th("delivery_number", "Livraison")}
              {th("scheduled_date", "Date")}
              {th("client_id", "Client")}
              {th("material_id", "Matériau")}
              {th("city", "Ville")}
              {th("truck_id", "Camion")}
              {th("driver_id", "Chauffeur")}
              {th("priority", "Priorité")}
              {th("status", "Statut")}
              {th("estimated_cost", "Montant")}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const st = statusMeta(d.status);
              const pr = priorityMeta(d.priority);
              return (
                <tr key={d.id} onClick={() => onOpen(d)} className="border-b border-border/60 hover:bg-secondary/30 cursor-pointer">
                  <td className="px-3 py-2 font-mono">{d.delivery_number ?? "—"}</td>
                  <td className="px-3 py-2">{d.scheduled_date ?? "—"}{d.scheduled_time ? ` ${d.scheduled_time.slice(0, 5)}` : ""}</td>
                  <td className="px-3 py-2">{name(refs.clients, d.client_id)}</td>
                  <td className="px-3 py-2">{name(refs.materials, d.material_id)}</td>
                  <td className="px-3 py-2">{d.city ?? "—"}</td>
                  <td className="px-3 py-2">{name(refs.trucks, d.truck_id)}</td>
                  <td className="px-3 py-2">{name(refs.drivers, d.driver_id)}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style={{ background: pr.color }}>{pr.label}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style={{ background: st.color }}>{st.label}</span>
                  </td>
                  <td className="px-3 py-2">{money(d.estimated_cost)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">Aucune opération pour ces filtres.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-muted-foreground">{rows.length} opération(s) affichée(s).</div>
    </div>
  );
}
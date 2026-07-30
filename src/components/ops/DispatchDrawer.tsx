// Fiche opération : cycle de vie, répartition assistée et actions rapides.
import { useEffect, useMemo, useState } from "react";
import {
  Delivery, OpsRefs, DELIVERY_LIFECYCLE, OPS_PRIORITIES, statusMeta,
  suggestDispatch, money, INCIDENT_TYPES, INCIDENT_SEVERITIES,
} from "@/lib/jsc/operations";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { X, Wand2, Phone, MapPin, AlertTriangle } from "lucide-react";

interface Props {
  delivery: Delivery;
  deliveries: Delivery[];
  refs: OpsRefs;
  companyId?: string | null;
  onClose: () => void;
  onUpdate: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onChanged: () => void;
}

export default function DispatchDrawer({ delivery, deliveries, refs, companyId, onClose, onUpdate, onChanged }: Props) {
  const [notes, setNotes] = useState(delivery.internal_notes ?? "");
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [incType, setIncType] = useState(INCIDENT_TYPES[0].value);
  const [incSeverity, setIncSeverity] = useState("moyenne");
  const [incDesc, setIncDesc] = useState("");

  useEffect(() => { setNotes(delivery.internal_notes ?? ""); }, [delivery.id]);

  const busy = useMemo(() => {
    const trucks = new Set<string>();
    const drivers = new Set<string>();
    deliveries
      .filter((d) => d.id !== delivery.id && d.scheduled_date === delivery.scheduled_date && !["livree", "terminee", "annulee", "facturee"].includes(d.status))
      .forEach((d) => { if (d.truck_id) trucks.add(d.truck_id); if (d.driver_id) drivers.add(d.driver_id); });
    return { trucks, drivers };
  }, [deliveries, delivery]);

  const suggestion = useMemo(() => suggestDispatch(delivery, refs, busy.trucks, busy.drivers), [delivery, refs, busy]);

  const applySuggestion = async () => {
    await onUpdate(delivery.id, {
      carrier_id: suggestion.carrierId,
      truck_id: suggestion.truckId,
      driver_id: suggestion.driverId,
      pickup_location_id: suggestion.pickupId,
      status: delivery.status === "a_planifier" ? "planifiee" : delivery.status,
    });
    toast.success("Suggestion de répartition appliquée");
  };

  const createIncident = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("jsc_incidents" as never) as any).insert({
      company_id: companyId ?? delivery.company_id,
      delivery_id: delivery.id,
      order_id: delivery.order_id,
      incident_type: incType,
      severity: incSeverity,
      description: incDesc,
      status: "ouvert",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Incident enregistré");
    setIncidentOpen(false); setIncDesc("");
    onChanged();
  };

  const st = statusMeta(delivery.status);
  const client = refs.clients.find((c) => c.id === delivery.client_id);
  const label = "block text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-1";
  const input = "w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background";
  const mapsUrl = delivery.latitude && delivery.longitude
    ? `https://www.google.com/maps?q=${delivery.latitude},${delivery.longitude}`
    : `https://www.google.com/maps?q=${encodeURIComponent(delivery.delivery_address ?? delivery.city ?? "")}`;

  return (
    <div className="fixed right-0 top-0 z-50 h-screen w-[440px] max-w-[96vw] bg-card border-l border-border shadow-2xl flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-muted-foreground">{delivery.delivery_number ?? "Livraison"}</div>
          <div className="font-display font-bold truncate">{client?.name ?? "Client"}</div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md hover:bg-secondary"><X className="w-4 h-4" /></button>
      </div>
      <div className="px-4 py-1.5 text-[11px] font-display font-bold uppercase text-white" style={{ background: st.color }}>{st.label}</div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="rounded-lg bg-secondary/30 p-3 text-xs space-y-1">
          <div><b>Adresse :</b> {delivery.delivery_address ?? "—"}{delivery.city ? `, ${delivery.city}` : ""}</div>
          <div><b>Matériau :</b> {refs.materials.find((m) => m.id === delivery.material_id)?.name ?? "—"}</div>
          <div><b>Quantité :</b> {delivery.quantity ?? "—"} {delivery.quantity_unit ?? ""}</div>
          <div><b>Montant estimé :</b> {money(delivery.estimated_cost)}</div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-display font-semibold">
            <MapPin className="w-3.5 h-3.5" /> Itinéraire
          </a>
          {refs.drivers.find((d) => d.id === delivery.driver_id)?.phone && (
            <a href={`tel:${refs.drivers.find((d) => d.id === delivery.driver_id)?.phone}`} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold">
              <Phone className="w-3.5 h-3.5" /> Chauffeur
            </a>
          )}
          <button onClick={() => setIncidentOpen((v) => !v)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs font-display font-semibold">
            <AlertTriangle className="w-3.5 h-3.5" /> Incident
          </button>
        </div>

        {incidentOpen && (
          <div className="rounded-lg border border-border p-3 space-y-2">
            <select value={incType} onChange={(e) => setIncType(e.target.value)} className={input}>
              {INCIDENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select value={incSeverity} onChange={(e) => setIncSeverity(e.target.value)} className={input}>
              {INCIDENT_SEVERITIES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <textarea value={incDesc} onChange={(e) => setIncDesc(e.target.value)} rows={3} className={input} placeholder="Description de l'incident…" />
            <Button size="sm" onClick={createIncident} disabled={!incDesc.trim()}>Enregistrer l'incident</Button>
          </div>
        )}

        <div>
          <label className={label}>Cycle de vie</label>
          <div className="flex flex-wrap gap-1.5">
            {DELIVERY_LIFECYCLE.map((s) => (
              <button key={s.value} onClick={() => onUpdate(delivery.id, { status: s.value })}
                style={delivery.status === s.value ? { background: s.color, color: "#fff", borderColor: "transparent" } : undefined}
                className="px-2 py-1 rounded text-[10px] font-display font-bold uppercase border border-border">
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] uppercase font-display font-bold"><Wand2 className="w-3.5 h-3.5 text-primary" /> Répartition suggérée</div>
          <ul className="text-[11px] text-muted-foreground list-disc pl-4 space-y-0.5">
            {suggestion.rationale.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <Button size="sm" onClick={applySuggestion}>Appliquer la suggestion</Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Date planifiée</label>
            <input type="date" value={delivery.scheduled_date ?? ""} onChange={(e) => onUpdate(delivery.id, { scheduled_date: e.target.value || null })} className={input} />
          </div>
          <div>
            <label className={label}>Heure</label>
            <input type="time" value={(delivery.scheduled_time ?? "").slice(0, 5)} onChange={(e) => onUpdate(delivery.id, { scheduled_time: e.target.value || null })} className={input} />
          </div>
          <div>
            <label className={label}>Camion</label>
            <select value={delivery.truck_id ?? ""} onChange={(e) => onUpdate(delivery.id, { truck_id: e.target.value || null })} className={input}>
              <option value="">— Aucun —</option>
              {refs.trucks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Chauffeur</label>
            <select value={delivery.driver_id ?? ""} onChange={(e) => onUpdate(delivery.id, { driver_id: e.target.value || null })} className={input}>
              <option value="">— Aucun —</option>
              {refs.drivers.map((d) => <option key={d.id} value={d.id}>{d.first_name} {d.last_name ?? ""}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Transporteur</label>
            <select value={delivery.carrier_id ?? ""} onChange={(e) => onUpdate(delivery.id, { carrier_id: e.target.value || null })} className={input}>
              <option value="">— Aucun —</option>
              {refs.carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Priorité</label>
            <select value={delivery.priority} onChange={(e) => onUpdate(delivery.id, { priority: e.target.value })} className={input}>
              {OPS_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={label}>Lieu de chargement (confidentiel)</label>
            <select value={delivery.pickup_location_id ?? ""} onChange={(e) => onUpdate(delivery.id, { pickup_location_id: e.target.value || null })} className={input}>
              <option value="">— Aucun —</option>
              {refs.pickups.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={label}>Notes internes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => onUpdate(delivery.id, { internal_notes: notes })}
            rows={4} className={input} placeholder="Jamais visible par le client…" />
        </div>
      </div>
    </div>
  );
}
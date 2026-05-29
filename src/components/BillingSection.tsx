import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, AlertTriangle, Receipt } from "lucide-react";
import {
  PAYMENT_STATUSES, PAYMENT_METHODS, findPaymentStatus, overdueBucket, type LeadTrip,
  computeTaxes, isMaterialTaxableByDefault, TPS_RATE, TVQ_RATE,
} from "@/lib/billing";
import { REMBLAI_MATERIAL_OPTIONS, REQUEST_TYPES } from "@/lib/questionnaire-data";

interface EntrepreneurRow {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
}

interface Props {
  submissionId: string;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n || 0);

type TripDraft = {
  material: string;
  trip_type: string;
  trips_count: string;
  price_per_trip: string;
  delivery_date: string;
  invoice_number: string;
  payment_status: string;
  payment_date: string;
  payment_method: string;
  notes: string;
  entrepreneur_id: string;
  taxable: boolean;
};

const emptyDraft = (): TripDraft => ({
  material: "",
  trip_type: "",
  trips_count: "",
  price_per_trip: "",
  delivery_date: "",
  invoice_number: "",
  payment_status: "",
  payment_date: "",
  payment_method: "",
  notes: "",
  entrepreneur_id: "",
  taxable: false,
});

export default function BillingSection({ submissionId }: Props) {
  const [trips, setTrips] = useState<LeadTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [entrepreneurs, setEntrepreneurs] = useState<EntrepreneurRow[]>([]);
  const [draft, setDraft] = useState<TripDraft>(emptyDraft());
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("lead_trips" as any)
      .select("*")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: false });
    if (!error && data) setTrips(data as unknown as LeadTrip[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    supabase.from("entrepreneurs").select("id,name,company,email").order("name").then(({ data }) => {
      setEntrepreneurs((data as any) || []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  const summary = useMemo(() => {
    let billed = 0, paid = 0, overdue = 0, count = trips.length;
    let totalTps = 0, totalTvq = 0;
    for (const t of trips) {
      const subtotal = Number(t.total_price || 0);
      const tx = computeTaxes(subtotal, !!t.taxable, Number(t.tps_rate ?? TPS_RATE), Number(t.tvq_rate ?? TVQ_RATE));
      const total = tx.total;
      if (t.payment_status === "annule") continue;
      if (["facture", "paye_partiel", "en_retard"].includes(t.payment_status)) billed += total;
      if (t.payment_status === "paye") { billed += total; paid += total; }
      if (overdueBucket(t)) overdue += total;
      if (!["annule"].includes(t.payment_status)) { totalTps += tx.tps; totalTvq += tx.tvq; }
    }
    return { billed, paid, overdue, count, balance: billed - paid, totalTps, totalTvq };
  }, [trips]);

  const addTrip = async () => {
    if (!draft.material) { toast({ title: "Matériau requis", variant: "destructive" }); return; }
    setAdding(true);
    const tripsCount = draft.trips_count === "" ? 0 : Number(draft.trips_count);
    const pricePerTrip = draft.price_per_trip === "" ? 0 : Number(draft.price_per_trip);
    const payload = {
      submission_id: submissionId,
      material: draft.material || "",
      trip_type: draft.trip_type || "vrac",
      trips_count: tripsCount,
      price_per_trip: pricePerTrip,
      total_price: tripsCount * pricePerTrip,
      delivery_date: draft.delivery_date || null,
      invoice_number: draft.invoice_number || "",
      payment_status: draft.payment_status || "non_facture",
      payment_date: draft.payment_date || null,
      payment_method: draft.payment_method || "",
      notes: draft.notes || "",
      entrepreneur_id: draft.entrepreneur_id || null,
      taxable: draft.taxable,
    };
    const { data, error } = await supabase.from("lead_trips" as any).insert(payload).select().single();
    setAdding(false);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    setTrips((prev) => [data as unknown as LeadTrip, ...prev]);
    setDraft(emptyDraft());
    toast({ title: "Voyage ajouté" });
  };

  const patchTrip = async (id: string, patch: Partial<LeadTrip>) => {
    // recompute total if price/trips changed
    const current = trips.find((t) => t.id === id);
    if (current) {
      const trips_count = patch.trips_count ?? current.trips_count;
      const price_per_trip = patch.price_per_trip ?? current.price_per_trip;
      if (patch.trips_count != null || patch.price_per_trip != null) {
        patch.total_price = Number(trips_count) * Number(price_per_trip);
      }
    }
    setTrips((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } as LeadTrip : t)));
    const { error } = await supabase.from("lead_trips" as any).update(patch).eq("id", id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); load(); }
  };

  const removeTrip = async (id: string) => {
    if (!confirm("Supprimer ce voyage ?")) return;
    const { error } = await supabase.from("lead_trips" as any).delete().eq("id", id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    setTrips((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Receipt className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-display font-bold uppercase tracking-wide text-foreground">Facturation et paiements</h3>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <Kpi label="Voyages" value={String(summary.count)} />
        <Kpi label="Facturé" value={fmtMoney(summary.billed)} />
        <Kpi label="Payé" value={fmtMoney(summary.paid)} tone="emerald" />
        <Kpi label="Solde dû" value={fmtMoney(summary.balance)} tone={summary.balance > 0 ? "amber" : "default"} />
      </div>

      {/* Overdue alerts */}
      {trips.some((t) => overdueBucket(t)) && (
        <div className="mb-3 space-y-1">
          {trips.filter((t) => overdueBucket(t)!).map((t) => {
            const ob = overdueBucket(t)!;
            const tone = ob.bucket === 28 ? "bg-rose-500/15 text-rose-700 border-rose-500/40"
              : ob.bucket === 14 ? "bg-orange-500/15 text-orange-700 border-orange-500/40"
              : "bg-amber-500/15 text-amber-700 border-amber-500/40";
            return (
              <div key={t.id} className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs border ${tone}`}>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="font-display font-semibold">{t.material || "Voyage"}</span>
                <span className="opacity-80">— en attente de paiement depuis {ob.days} jours (seuil {ob.bucket}j)</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Trips list */}
      <div className="space-y-2 mb-4">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : trips.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Aucun voyage facturé pour ce lead.</p>
        ) : trips.map((t) => {
          const ps = findPaymentStatus(t.payment_status);
          return (
            <div key={t.id} className="bg-card border border-border rounded-lg p-3">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs font-display font-bold px-2 py-0.5 rounded bg-secondary text-foreground">{t.material || "—"}</span>
                <span className="text-[10px] uppercase font-display font-bold text-muted-foreground">{REQUEST_TYPES.find((r) => r.value === t.trip_type)?.label || t.trip_type}</span>
                <select
                  value={t.payment_status}
                  onChange={(e) => patchTrip(t.id, { payment_status: e.target.value })}
                  className={`px-2 py-0.5 rounded text-[10px] font-display font-bold uppercase border ${ps.color}`}
                >
                  {PAYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <span className="ml-auto text-sm font-display font-bold text-foreground">{fmtMoney(Number(t.total_price))}</span>
                <button onClick={() => removeTrip(t.id)} className="text-rose-600 hover:bg-rose-50 p-1 rounded" title="Supprimer">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <Field label="Voyages"><input type="number" min={0} step="0.5" value={t.trips_count}
                  onChange={(e) => patchTrip(t.id, { trips_count: Number(e.target.value) })} className={inputCls} /></Field>
                <Field label="Prix / voyage"><input type="number" min={0} step="0.01" value={t.price_per_trip}
                  onChange={(e) => patchTrip(t.id, { price_per_trip: Number(e.target.value) })} className={inputCls} /></Field>
                <Field label="Date livraison"><input type="date" value={t.delivery_date || ""}
                  onChange={(e) => patchTrip(t.id, { delivery_date: e.target.value || null })} className={inputCls} /></Field>
                <Field label="Date paiement"><input type="date" value={t.payment_date || ""}
                  onChange={(e) => patchTrip(t.id, { payment_date: e.target.value || null })} className={inputCls} /></Field>
                <Field label="Facture #"><input type="text" value={t.invoice_number}
                  onChange={(e) => patchTrip(t.id, { invoice_number: e.target.value })} className={inputCls} /></Field>
                <Field label="Mode paiement">
                  <select value={t.payment_method} onChange={(e) => patchTrip(t.id, { payment_method: e.target.value })} className={inputCls}>
                    <option value="">—</option>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Entrepreneur livreur">
                  <select value={t.entrepreneur_id || ""} onChange={(e) => patchTrip(t.id, { entrepreneur_id: e.target.value || null })} className={inputCls}>
                    <option value="">—</option>
                    {entrepreneurs.map((e) => <option key={e.id} value={e.id}>{e.name}{e.company ? ` (${e.company})` : ""}</option>)}
                  </select>
                </Field>
                <Field label="Notes" full>
                  <input type="text" value={t.notes} onChange={(e) => patchTrip(t.id, { notes: e.target.value })} className={inputCls} />
                </Field>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add trip form */}
      <div className="bg-secondary/30 border border-dashed border-border rounded-lg p-3">
        <div className="text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-2">Ajouter un voyage</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <Field label="Matériau">
            <select value={draft.material || ""} onChange={(e) => setDraft({ ...draft, material: e.target.value })} className={inputCls}>
              <option value="">— Choisir —</option>
              {REMBLAI_MATERIAL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Type">
            <select value={draft.trip_type} onChange={(e) => setDraft({ ...draft, trip_type: e.target.value })} className={inputCls}>
              <option value=""></option>
              {REQUEST_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="Voyages"><input type="number" value={draft.trips_count}
            onChange={(e) => setDraft({ ...draft, trips_count: e.target.value })} className={inputCls} /></Field>
          <Field label="Prix / voyage"><input type="number" value={draft.price_per_trip}
            onChange={(e) => setDraft({ ...draft, price_per_trip: e.target.value })} className={inputCls} /></Field>
          <Field label="Date livraison"><input type="date" value={draft.delivery_date}
            onChange={(e) => setDraft({ ...draft, delivery_date: e.target.value })} className={inputCls} /></Field>
          <Field label="Facture #"><input type="text" value={draft.invoice_number}
            onChange={(e) => setDraft({ ...draft, invoice_number: e.target.value })} className={inputCls} /></Field>
          <Field label="Statut">
            <select value={draft.payment_status} onChange={(e) => setDraft({ ...draft, payment_status: e.target.value })} className={inputCls}>
              <option value=""></option>
              {PAYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Mode paiement">
            <select value={draft.payment_method} onChange={(e) => setDraft({ ...draft, payment_method: e.target.value })} className={inputCls}>
              <option value=""></option>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Date paiement"><input type="date" value={draft.payment_date}
            onChange={(e) => setDraft({ ...draft, payment_date: e.target.value })} className={inputCls} /></Field>
          <Field label="Entrepreneur livreur">
            <select value={draft.entrepreneur_id} onChange={(e) => setDraft({ ...draft, entrepreneur_id: e.target.value })} className={inputCls}>
              <option value=""></option>
              {entrepreneurs.map((en) => <option key={en.id} value={en.id}>{en.name}{en.company ? ` (${en.company})` : ""}</option>)}
            </select>
          </Field>
          <Field label="Total calculé">
            <div className="px-2 py-1.5 rounded border border-border bg-card font-display font-bold text-foreground min-h-[34px]">
              {draft.trips_count !== "" && draft.price_per_trip !== ""
                ? fmtMoney(Number(draft.trips_count) * Number(draft.price_per_trip))
                : ""}
            </div>
          </Field>
          <Field label="Notes" full>
            <input type="text" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={addTrip} disabled={adding}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold disabled:opacity-50">
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Ajouter le voyage
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full px-2 py-1.5 rounded border border-border bg-background font-body text-xs focus:outline-none focus:ring-2 focus:ring-primary/40";

const Field = ({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) => (
  <label className={`block ${full ? "col-span-2 sm:col-span-4" : ""}`}>
    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground font-display font-bold mb-1">{label}</span>
    {children}
  </label>
);

const Kpi = ({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "emerald" | "amber" }) => {
  const toneCls = tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase font-display font-bold text-muted-foreground">{label}</div>
      <div className={`text-sm font-display font-bold ${toneCls}`}>{value}</div>
    </div>
  );
};

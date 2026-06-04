import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Receipt, X } from "lucide-react";
import {
  PAYMENT_STATUSES, PAYMENT_METHODS, findPaymentStatus, computeTaxes,
  isMaterialTaxableByDefault, TPS_RATE, TVQ_RATE, type LeadTrip,
} from "@/lib/billing";
import { REMBLAI_MATERIAL_OPTIONS } from "@/lib/questionnaire-data";

interface Props {
  entrepreneurId: string;
}

type SubmissionLite = {
  id: string;
  submission_number: number | null;
  dompe_number: string | null;
  address: string | null;
  formatted_address: string | null;
  city: string | null;
  postal_code: string | null;
};

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n || 0);

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fr-CA", { year: "numeric", month: "2-digit", day: "2-digit" }) : "—";

type Draft = {
  submission_id: string;
  material: string;
  trips_count: string;
  price_per_trip: string;
  delivery_date: string;
  invoice_number: string;
  payment_status: string;
  payment_date: string;
  payment_method: string;
  notes: string;
  taxable: boolean;
};

const emptyDraft = (): Draft => ({
  submission_id: "",
  material: "",
  trips_count: "",
  price_per_trip: "",
  delivery_date: new Date().toISOString().slice(0, 10),
  invoice_number: "",
  payment_status: "non_facture",
  payment_date: "",
  payment_method: "",
  notes: "",
  taxable: false,
});

export default function EntrepreneurBillingTab({ entrepreneurId }: Props) {
  const [trips, setTrips] = useState<LeadTrip[]>([]);
  const [subs, setSubs] = useState<Record<string, SubmissionLite>>({});
  const [dompeSubs, setDompeSubs] = useState<SubmissionLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  // Filters
  const [fDompe, setFDompe] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: tripsData } = await supabase
      .from("lead_trips" as any)
      .select("*")
      .eq("entrepreneur_id", entrepreneurId)
      .order("delivery_date", { ascending: false, nullsFirst: false });
    const list = (tripsData as unknown as LeadTrip[]) || [];
    setTrips(list);

    const ids = [...new Set(list.map((t) => t.submission_id).filter(Boolean))];
    if (ids.length) {
      const { data: sdata } = await supabase
        .from("submissions")
        .select("id,submission_number,dompe_number,address,formatted_address,city,postal_code")
        .in("id", ids);
      const map: Record<string, SubmissionLite> = {};
      ((sdata as any) || []).forEach((s: SubmissionLite) => { map[s.id] = s; });
      setSubs(map);
    } else setSubs({});
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Load all submissions that are "dompes" for the picker
    supabase
      .from("submissions")
      .select("id,submission_number,dompe_number,address,formatted_address,city,postal_code")
      .not("dompe_number", "is", null)
      .neq("dompe_number", "")
      .order("dompe_number", { ascending: true })
      .then(({ data }) => setDompeSubs(((data as any) || []) as SubmissionLite[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrepreneurId]);

  const filtered = useMemo(() => {
    return trips.filter((t) => {
      const s = subs[t.submission_id];
      if (fDompe && !(s?.dompe_number || "").toLowerCase().includes(fDompe.toLowerCase())) return false;
      if (fStatus && t.payment_status !== fStatus) return false;
      const d = t.delivery_date || t.created_at?.slice(0, 10);
      if (fStart && d && d < fStart) return false;
      if (fEnd && d && d > fEnd) return false;
      return true;
    });
  }, [trips, subs, fDompe, fStatus, fStart, fEnd]);

  const summary = useMemo(() => {
    let billed = 0, paid = 0, voyages = 0;
    const dompeSet = new Set<string>();
    for (const t of filtered) {
      if (t.payment_status === "annule") continue;
      const sub = Number(t.total_price || 0);
      const tx = computeTaxes(sub, !!t.taxable, Number(t.tps_rate ?? TPS_RATE), Number(t.tvq_rate ?? TVQ_RATE));
      if (["facture", "paye_partiel", "en_retard"].includes(t.payment_status)) billed += tx.total;
      if (t.payment_status === "paye") { billed += tx.total; paid += tx.total; }
      voyages += Number(t.trips_count) || 0;
      const s = subs[t.submission_id];
      if (s?.dompe_number) dompeSet.add(s.dompe_number);
    }
    return { billed, paid, balance: billed - paid, voyages, dompes: dompeSet.size };
  }, [filtered, subs]);

  const addInvoice = async () => {
    if (!draft.submission_id) { toast({ title: "Sélectionnez une dompe", variant: "destructive" }); return; }
    if (!draft.material) { toast({ title: "Matériau requis", variant: "destructive" }); return; }
    setSaving(true);
    const tc = Number(draft.trips_count || 0);
    const pp = Number(draft.price_per_trip || 0);
    const payload = {
      submission_id: draft.submission_id,
      entrepreneur_id: entrepreneurId,
      material: draft.material,
      trip_type: "vrac",
      trips_count: tc,
      price_per_trip: pp,
      total_price: tc * pp,
      delivery_date: draft.delivery_date || null,
      invoice_number: draft.invoice_number || "",
      payment_status: draft.payment_status || "non_facture",
      payment_date: draft.payment_date || null,
      payment_method: draft.payment_method || "",
      notes: draft.notes || "",
      taxable: draft.taxable,
    };
    const { error } = await supabase.from("lead_trips" as any).insert(payload);
    setSaving(false);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Facturation créée" });
    setDraft(emptyDraft());
    setShowForm(false);
    load();
  };

  const updateStatus = async (id: string, status: string) => {
    setTrips((p) => p.map((t) => t.id === id ? { ...t, payment_status: status } : t));
    const { error } = await supabase.from("lead_trips" as any).update({ payment_status: status }).eq("id", id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); load(); }
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer cette facturation ?")) return;
    const { error } = await supabase.from("lead_trips" as any).delete().eq("id", id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    setTrips((p) => p.filter((t) => t.id !== id));
  };

  const draftSub = dompeSubs.find((s) => s.id === draft.submission_id);
  const draftAddress = draftSub?.formatted_address || [draftSub?.address, draftSub?.city, draftSub?.postal_code].filter(Boolean).join(", ");

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Kpi label="Total facturé" value={fmtMoney(summary.billed)} />
        <Kpi label="Total payé" value={fmtMoney(summary.paid)} tone="emerald" />
        <Kpi label="À recevoir" value={fmtMoney(summary.balance)} tone={summary.balance > 0 ? "amber" : "default"} />
        <Kpi label="Voyages totaux" value={String(summary.voyages)} />
        <Kpi label="Dompes desservies" value={String(summary.dompes)} />
      </div>

      {/* Filters + action */}
      <div className="flex flex-wrap gap-2 items-end">
        <Field label="Dompe">
          <input value={fDompe} onChange={(e) => setFDompe(e.target.value)} placeholder="ex. Dompe 125" className="input" />
        </Field>
        <Field label="Statut">
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="input">
            <option value="">Tous</option>
            {PAYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Du">
          <input type="date" value={fStart} onChange={(e) => setFStart(e.target.value)} className="input" />
        </Field>
        <Field label="Au">
          <input type="date" value={fEnd} onChange={(e) => setFEnd(e.target.value)} className="input" />
        </Field>
        {(fDompe || fStatus || fStart || fEnd) && (
          <button onClick={() => { setFDompe(""); setFStatus(""); setFStart(""); setFEnd(""); }}
            className="px-2 py-1.5 text-xs rounded border border-input hover:bg-muted">Réinitialiser</button>
        )}
        <div className="ml-auto">
          <button onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
            <Plus className="w-4 h-4" /> Nouvelle Facturation
          </button>
        </div>
      </div>

      {/* New invoice form */}
      {showForm && (
        <div className="bg-secondary/40 border border-dashed border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-display font-bold flex items-center gap-2"><Receipt className="w-4 h-4" /> Nouvelle facturation</h4>
            <button onClick={() => setShowForm(false)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Dompe *">
              <select value={draft.submission_id} onChange={(e) => setDraft({ ...draft, submission_id: e.target.value })} className="input">
                <option value="">— Choisir une dompe —</option>
                {dompeSubs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.dompe_number || `#${s.submission_number}`}{s.city ? ` — ${s.city}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Adresse du site" full>
              <div className="px-2 py-1.5 text-xs rounded border border-border bg-card min-h-[34px] text-muted-foreground">
                {draftAddress || "—"}
              </div>
            </Field>
            <Field label="Date du service">
              <input type="date" value={draft.delivery_date}
                onChange={(e) => setDraft({ ...draft, delivery_date: e.target.value })} className="input" />
            </Field>
            <Field label="Matériau *">
              <select value={draft.material}
                onChange={(e) => setDraft({ ...draft, material: e.target.value, taxable: isMaterialTaxableByDefault(e.target.value) })}
                className="input">
                <option value="">— Choisir —</option>
                {REMBLAI_MATERIAL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Statut">
              <select value={draft.payment_status} onChange={(e) => setDraft({ ...draft, payment_status: e.target.value })} className="input">
                {PAYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Nombre de voyages">
              <input type="number" min={0} value={draft.trips_count}
                onChange={(e) => setDraft({ ...draft, trips_count: e.target.value })} className="input" />
            </Field>
            <Field label="Prix par voyage ($)">
              <input type="number" min={0} step="0.01" value={draft.price_per_trip}
                onChange={(e) => setDraft({ ...draft, price_per_trip: e.target.value })} className="input" />
            </Field>
            <Field label="Montant total">
              <div className="px-2 py-1.5 rounded border border-border bg-card font-display font-bold min-h-[34px]">
                {(() => {
                  const sub = Number(draft.trips_count || 0) * Number(draft.price_per_trip || 0);
                  const tx = computeTaxes(sub, draft.taxable);
                  return tx.taxable ? `${fmtMoney(tx.total)} (HT ${fmtMoney(tx.subtotal)})` : fmtMoney(tx.total);
                })()}
              </div>
            </Field>
            <Field label="Numéro de facture">
              <input value={draft.invoice_number} onChange={(e) => setDraft({ ...draft, invoice_number: e.target.value })}
                placeholder="Auto si vide" className="input" />
            </Field>
            <Field label="Date de paiement">
              <input type="date" value={draft.payment_date}
                onChange={(e) => setDraft({ ...draft, payment_date: e.target.value })} className="input" />
            </Field>
            <Field label="Mode paiement">
              <select value={draft.payment_method} onChange={(e) => setDraft({ ...draft, payment_method: e.target.value })} className="input">
                <option value="">—</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Taxes TPS/TVQ">
              <label className="flex items-center gap-2 h-[34px] px-2 rounded border border-border bg-background cursor-pointer">
                <input type="checkbox" checked={draft.taxable}
                  onChange={(e) => setDraft({ ...draft, taxable: e.target.checked })} />
                <span className="text-xs">{draft.taxable ? "Appliquées" : "Non taxable"}</span>
              </label>
            </Field>
            <Field label="Notes administratives" full>
              <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                rows={2} className="input" />
            </Field>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => { setDraft(emptyDraft()); setShowForm(false); }}
              className="px-3 py-2 rounded-lg border border-input text-sm">Annuler</button>
            <button onClick={addInvoice} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Créer la facturation
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">Aucune facturation pour cet entrepreneur.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Dompe</th>
                  <th className="text-left px-3 py-2">Site</th>
                  <th className="text-right px-3 py-2">Voyages</th>
                  <th className="text-right px-3 py-2">Prix/voyage</th>
                  <th className="text-right px-3 py-2">Total</th>
                  <th className="text-left px-3 py-2">Statut</th>
                  <th className="text-left px-3 py-2">Facture #</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const s = subs[t.submission_id];
                  const tx = computeTaxes(Number(t.total_price || 0), !!t.taxable, Number(t.tps_rate ?? TPS_RATE), Number(t.tvq_rate ?? TVQ_RATE));
                  const ps = findPaymentStatus(t.payment_status);
                  return (
                    <tr key={t.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(t.delivery_date)}</td>
                      <td className="px-3 py-2 font-display font-semibold">{s?.dompe_number || (s ? `#${s.submission_number}` : "—")}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{s?.city || s?.address || "—"}</td>
                      <td className="px-3 py-2 text-right font-mono">{t.trips_count}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtMoney(Number(t.price_per_trip))}</td>
                      <td className="px-3 py-2 text-right font-display font-bold">{fmtMoney(tx.total)}</td>
                      <td className="px-3 py-2">
                        <select value={t.payment_status} onChange={(e) => updateStatus(t.id, e.target.value)}
                          className={`px-2 py-0.5 rounded text-[10px] font-display font-bold uppercase border ${ps.color}`}>
                          {PAYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-xs">{t.invoice_number || "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => remove(t.id)} className="text-rose-600 hover:bg-rose-50 p-1 rounded">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "emerald" | "amber" }) {
  const toneCls =
    tone === "emerald" ? "border-emerald-500/30 bg-emerald-500/5"
    : tone === "amber" ? "border-amber-500/30 bg-amber-500/5"
    : "border-border bg-card";
  return (
    <div className={`rounded-lg border p-3 ${toneCls}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-display font-bold">{label}</div>
      <div className="text-lg font-display font-bold mt-0.5">{value}</div>
    </div>
  );
}

function Field({ label, children, full = false }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block text-xs ${full ? "sm:col-span-3" : ""}`}>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-display font-bold">{label}</span>
      <div className="mt-1 [&_.input]:w-full [&_.input]:px-2 [&_.input]:py-1.5 [&_.input]:rounded [&_.input]:border [&_.input]:border-input [&_.input]:bg-background [&_.input]:text-xs">
        {children}
      </div>
    </label>
  );
}
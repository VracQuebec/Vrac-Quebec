import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, X, AlertTriangle, Trash2, Save } from "lucide-react";
import {
  PAYMENT_STATUSES, PAYMENT_METHODS, computeTaxes, TPS_RATE, TVQ_RATE,
  isMaterialTaxableByDefault, type LeadTrip,
} from "@/lib/billing";
import { REMBLAI_MATERIAL_OPTIONS, REQUEST_TYPES } from "@/lib/questionnaire-data";

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n || 0);

const inputCls =
  "w-full px-2 py-2 rounded-md border border-border bg-background text-sm font-body min-h-[38px]";

interface SubmissionOpt { id: string; name: string | null; dompe_number: string | null; address: string | null }
interface EntrepreneurOpt { id: string; name: string; company: string | null }

interface Props {
  invoice: LeadTrip;
  /** When false, the client/site selector is hidden (invoice stays on its lead). */
  allowMove?: boolean;
  onClose: () => void;
  onSaved: (row: LeadTrip) => void;
  onDeleted: (id: string) => void;
}

export default function InvoiceEditDialog({ invoice, allowMove = true, onClose, onSaved, onDeleted }: Props) {
  const [form, setForm] = useState({
    submission_id: invoice.submission_id,
    entrepreneur_id: invoice.entrepreneur_id || "",
    material: invoice.material || "",
    trip_type: invoice.trip_type || "",
    trips_count: String(invoice.trips_count ?? ""),
    price_per_trip: String(invoice.price_per_trip ?? ""),
    tonnage: String((invoice as unknown as { tonnage?: number | null }).tonnage ?? ""),
    taxable: !!invoice.taxable,
    delivery_date: invoice.delivery_date || "",
    due_date: invoice.due_date || "",
    payment_date: invoice.payment_date || "",
    payment_method: invoice.payment_method || "",
    payment_status: invoice.payment_status || "non_facture",
    notes: invoice.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmPaidSave, setConfirmPaidSave] = useState(false);
  const [submissions, setSubmissions] = useState<SubmissionOpt[]>([]);
  const [entrepreneurs, setEntrepreneurs] = useState<EntrepreneurOpt[]>([]);

  const wasPaid = invoice.payment_status === "paye";

  useEffect(() => {
    supabase.from("entrepreneurs").select("id,name,company").order("name").limit(500)
      .then(({ data }) => setEntrepreneurs((data as unknown as EntrepreneurOpt[]) || []));
    if (allowMove) {
      supabase.from("submissions").select("id,name,dompe_number,address")
        .order("created_at", { ascending: false }).limit(500)
        .then(({ data }) => setSubmissions((data as unknown as SubmissionOpt[]) || []));
    }
  }, [allowMove]);

  const subtotal = useMemo(() => {
    const c = Number(form.trips_count || 0);
    const p = Number(form.price_per_trip || 0);
    return c * p;
  }, [form.trips_count, form.price_per_trip]);

  const tx = useMemo(
    () => computeTaxes(subtotal, form.taxable, Number(invoice.tps_rate ?? TPS_RATE), Number(invoice.tvq_rate ?? TVQ_RATE)),
    [subtotal, form.taxable, invoice.tps_rate, invoice.tvq_rate],
  );

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const doSave = async () => {
    setSaving(true);
    const payload = {
      submission_id: form.submission_id,
      entrepreneur_id: form.entrepreneur_id || null,
      material: form.material || "",
      trip_type: form.trip_type || "vrac",
      trips_count: Number(form.trips_count || 0),
      price_per_trip: Number(form.price_per_trip || 0),
      total_price: subtotal,
      tonnage: form.tonnage === "" ? null : Number(form.tonnage),
      taxable: form.taxable,
      delivery_date: form.delivery_date || null,
      due_date: form.due_date || null,
      payment_date: form.payment_date || null,
      payment_method: form.payment_method || "",
      payment_status: form.payment_status,
      notes: form.notes || "",
    };
    const { data, error } = await supabase
      .from("lead_trips" as never)
      .update(payload as never)
      .eq("id", invoice.id)
      .select()
      .single();
    setSaving(false);
    setConfirmPaidSave(false);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Facture mise à jour" });
    onSaved(data as unknown as LeadTrip);
    onClose();
  };

  const save = () => {
    if (wasPaid && !confirmPaidSave) { setConfirmPaidSave(true); return; }
    doSave();
  };

  const doDelete = async () => {
    setSaving(true);
    const { error } = await supabase.from("lead_trips" as never).delete().eq("id", invoice.id);
    setSaving(false);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Facture supprimée" });
    onDeleted(invoice.id);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="bg-card w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border shadow-xl">
        <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center gap-2">
          <div className="min-w-0">
            <h2 className="font-display font-bold text-base truncate">Modifier la facture</h2>
            <p className="text-[11px] text-muted-foreground font-body truncate">
              N° {invoice.invoice_number || "—"} · le numéro reste inchangé
            </p>
          </div>
          <button onClick={onClose} className="ml-auto p-2 rounded-lg hover:bg-secondary" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {wasPaid && (
            <div className="flex gap-2 items-start px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-800 text-xs font-body">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                ⚠️ Cette facture est déjà marquée comme payée. Modifier ou supprimer cette facture peut affecter
                les données de paiement et les statistiques de facturation.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {allowMove && (
              <Field label="Client / Dompe · site" full>
                <select value={form.submission_id} onChange={(e) => set({ submission_id: e.target.value })} className={inputCls}>
                  {submissions.every((s) => s.id !== form.submission_id) && (
                    <option value={form.submission_id}>Lead actuel</option>
                  )}
                  {submissions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {(s.dompe_number ? `${s.dompe_number} — ` : "")}{s.name || "Sans nom"}{s.address ? ` (${s.address})` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Matériau">
              <select value={form.material}
                onChange={(e) => set({ material: e.target.value, taxable: isMaterialTaxableByDefault(e.target.value) })}
                className={inputCls}>
                <option value="">—</option>
                {REMBLAI_MATERIAL_OPTIONS.every((m) => m !== form.material) && form.material && (
                  <option value={form.material}>{form.material}</option>
                )}
                {REMBLAI_MATERIAL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>

            <Field label="Type">
              <select value={form.trip_type} onChange={(e) => set({ trip_type: e.target.value })} className={inputCls}>
                <option value="">—</option>
                {REQUEST_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>

            <Field label="Nombre de voyages">
              <input type="number" min={0} step="0.5" value={form.trips_count}
                onChange={(e) => set({ trips_count: e.target.value })} className={inputCls} />
            </Field>

            <Field label="Prix / voyage ($)">
              <input type="number" min={0} step="0.01" value={form.price_per_trip}
                onChange={(e) => set({ price_per_trip: e.target.value })} className={inputCls} />
            </Field>

            <Field label="Tonnage (t)">
              <input type="number" min={0} step="0.01" value={form.tonnage}
                onChange={(e) => set({ tonnage: e.target.value })} className={inputCls} />
            </Field>

            <Field label="Taxes TPS / TVQ">
              <label className="flex items-center gap-2 min-h-[38px] px-2 rounded-md border border-border bg-background cursor-pointer">
                <input type="checkbox" checked={form.taxable} onChange={(e) => set({ taxable: e.target.checked })} />
                <span className="text-[12px] font-body">{form.taxable ? "Appliquées (5 % + 9,975 %)" : "Non taxable"}</span>
              </label>
            </Field>

            <Field label="Date de livraison">
              <input type="date" value={form.delivery_date} onChange={(e) => set({ delivery_date: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Date d'échéance">
              <input type="date" value={form.due_date} onChange={(e) => set({ due_date: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Date de paiement">
              <input type="date" value={form.payment_date} onChange={(e) => set({ payment_date: e.target.value })} className={inputCls} />
            </Field>

            <Field label="Mode de paiement">
              <select value={form.payment_method} onChange={(e) => set({ payment_method: e.target.value })} className={inputCls}>
                <option value="">—</option>
                {PAYMENT_METHODS.every((m) => m !== form.payment_method) && form.payment_method && (
                  <option value={form.payment_method}>{form.payment_method}</option>
                )}
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>

            <Field label="Statut de paiement">
              <select value={form.payment_status} onChange={(e) => set({ payment_status: e.target.value })} className={inputCls}>
                {PAYMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>

            <Field label="Entrepreneur associé">
              <select value={form.entrepreneur_id} onChange={(e) => set({ entrepreneur_id: e.target.value })} className={inputCls}>
                <option value="">—</option>
                {entrepreneurs.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}{e.company ? ` (${e.company})` : ""}</option>
                ))}
              </select>
            </Field>

            <Field label="Notes" full>
              <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2}
                className={`${inputCls} resize-y`} />
            </Field>
          </div>

          <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 grid grid-cols-2 sm:grid-cols-4 gap-y-1 gap-x-3 text-[12px] font-body">
            <span>Montant (HT) : <strong>{fmtMoney(tx.subtotal)}</strong></span>
            <span>TPS : <strong>{fmtMoney(tx.tps)}</strong></span>
            <span>TVQ : <strong>{fmtMoney(tx.tvq)}</strong></span>
            <span>Total : <strong>{fmtMoney(tx.total)}</strong></span>
          </div>
        </div>

        <div className="sticky bottom-0 bg-card border-t border-border px-4 py-3 flex flex-wrap gap-2">
          <button onClick={() => setConfirmDelete(true)} disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-500/50 text-rose-700 bg-rose-500/10 hover:bg-rose-500/20 text-sm font-display font-semibold">
            <Trash2 className="w-4 h-4" /> Supprimer la facture
          </button>
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} disabled={saving}
              className="px-3 py-2 rounded-lg border border-border bg-card hover:bg-secondary text-sm font-display font-semibold">
              Annuler
            </button>
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer
            </button>
          </div>
        </div>
      </div>

      {confirmPaidSave && (
        <ConfirmDialog
          title="⚠️ Facture déjà payée"
          message="Cette facture est déjà marquée comme payée. Modifier cette facture peut affecter les données de paiement et les statistiques de facturation."
          confirmLabel="Confirmer la modification"
          onCancel={() => setConfirmPaidSave(false)}
          onConfirm={doSave}
          busy={saving}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          danger
          title="⚠️ Supprimer cette facture ?"
          message={`Cette action supprimera définitivement la facture et ses données associées.${
            wasPaid ? "\n\n⚠️ Cette facture est déjà marquée comme payée. La supprimer peut affecter les données de paiement et les statistiques de facturation." : ""
          }`}
          confirmLabel="Supprimer définitivement"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={doDelete}
          busy={saving}
        />
      )}
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  title, message, confirmLabel, onCancel, onConfirm, busy, danger,
}: {
  title: string; message: string; confirmLabel: string;
  onCancel: () => void; onConfirm: () => void; busy?: boolean; danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-card w-full max-w-sm rounded-2xl border border-border p-4 shadow-xl">
        <h3 className="font-display font-bold text-base mb-2">{title}</h3>
        <p className="text-sm font-body text-muted-foreground whitespace-pre-line mb-4">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} disabled={busy}
            className="px-3 py-2 rounded-lg border border-border bg-card hover:bg-secondary text-sm font-display font-semibold">
            Annuler
          </button>
          <button onClick={onConfirm} disabled={busy}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-display font-bold text-white disabled:opacity-60 ${
              danger ? "bg-rose-600 hover:bg-rose-700" : "bg-primary text-primary-foreground hover:opacity-90"
            }`}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { X, Pencil, Trash2, ExternalLink, AlertTriangle, Loader2, ChevronDown, Check } from "lucide-react";
import {
  findPaymentStatus, overdueBucket, computeTaxes, TPS_RATE, TVQ_RATE, PAYMENT_STATUSES, type LeadTrip,
} from "@/lib/billing";

/** Statuts modifiables directement depuis la fiche. */
const QUICK_STATUSES = ["en_attente", "en_retard", "paye", "annule"] as const;

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n || 0);

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("fr-CA") : "—");

export interface InvoiceDetailRow extends LeadTrip {
  submissions?: {
    name: string | null;
    address: string | null;
    dompe_number: string | null;
    submission_number: number | null;
  } | null;
  entrepreneurs?: { name: string | null; company: string | null } | null;
}

interface Props {
  invoice: InvoiceDetailRow;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenLead?: (submissionId: string) => void;
}

interface ClientInfo {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  dompe_number: string | null;
  submission_number: number | null;
}

export default function InvoiceDetailDialog({ invoice, onClose, onEdit, onDelete, onOpenLead }: Props) {
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("submissions")
        .select("name,email,phone,address,city,postal_code,dompe_number,submission_number")
        .eq("id", invoice.submission_id)
        .maybeSingle();
      if (!alive) return;
      setClient((data as unknown as ClientInfo) || null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [invoice.submission_id]);

  const tx = computeTaxes(
    Number(invoice.total_price || 0),
    !!invoice.taxable,
    Number(invoice.tps_rate ?? TPS_RATE),
    Number(invoice.tvq_rate ?? TVQ_RATE),
  );
  const ps = findPaymentStatus(invoice.payment_status);
  const ob = overdueBucket(invoice);
  const tonnage = (invoice as unknown as { tonnage?: number | null }).tonnage;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-card w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center gap-2">
          <div className="min-w-0">
            <h2 className="font-display font-bold text-base truncate">
              Facture {invoice.invoice_number || "—"}
            </h2>
            <p className="text-[11px] text-muted-foreground font-body truncate">
              {client?.name || invoice.submissions?.name || "Client inconnu"}
              {" · "}{fmtMoney(tx.total)}
            </p>
          </div>
          <button onClick={onClose} className="ml-auto p-2 rounded-lg hover:bg-secondary" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-display font-bold uppercase border ${ps.color}`}>
              {ps.label}
            </span>
            {ob && (
              <span className="inline-flex items-center gap-1 text-[11px] text-rose-700 font-display font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" /> En retard {ob.days}j (≥{ob.bucket}j)
              </span>
            )}
            {!tx.taxable && (
              <span className="text-[11px] italic text-muted-foreground font-body">Non taxable</span>
            )}
          </div>

          {/* Montants */}
          <Section title="Montants">
            <Row label="Montant HT" value={fmtMoney(tx.subtotal)} />
            <Row label="TPS (5 %)" value={fmtMoney(tx.tps)} />
            <Row label="TVQ (9,975 %)" value={fmtMoney(tx.tvq)} />
            <Row label="Total TTC" value={fmtMoney(tx.total)} strong />
            {invoice.amount_paid != null && <Row label="Montant payé" value={fmtMoney(Number(invoice.amount_paid))} />}
            <Row label="Solde" value={fmtMoney(tx.total - Number(invoice.amount_paid || (invoice.payment_status === "paye" ? tx.total : 0)))} />
          </Section>

          {/* Client */}
          <Section title="Client">
            {loading ? (
              <div className="col-span-full flex items-center gap-2 text-xs text-muted-foreground font-body">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement…
              </div>
            ) : (
              <>
                <Row label="Nom" value={client?.name || invoice.submissions?.name || "—"} />
                <Row label="Téléphone" value={client?.phone || "—"} />
                <Row label="Courriel" value={client?.email || "—"} />
                <Row label="Dompe / site"
                  value={client?.dompe_number || invoice.submissions?.dompe_number
                    || (client?.submission_number ? `#${client.submission_number}` : "—")} />
                <Row label="Adresse" full
                  value={[client?.address || invoice.submissions?.address, client?.city, client?.postal_code].filter(Boolean).join(", ") || "—"} />
              </>
            )}
          </Section>

          {/* Détails */}
          <Section title="Détails de la facture">
            <Row label="Matériau" value={invoice.material || "—"} />
            <Row label="Type" value={invoice.trip_type || "—"} />
            <Row label="Nombre de voyages" value={String(invoice.trips_count ?? "—")} />
            <Row label="Prix / voyage" value={fmtMoney(Number(invoice.price_per_trip || 0))} />
            <Row label="Tonnage" value={tonnage != null && tonnage !== undefined ? `${tonnage} t` : "—"} />
            <Row label="Entrepreneur associé"
              value={invoice.entrepreneurs?.name
                ? `${invoice.entrepreneurs.name}${invoice.entrepreneurs.company ? ` (${invoice.entrepreneurs.company})` : ""}`
                : "—"} />
          </Section>

          {/* Dates */}
          <Section title="Dates et paiement">
            <Row label="Date de livraison" value={fmtDate(invoice.delivery_date)} />
            <Row label="Date d'échéance" value={fmtDate(invoice.due_date)} />
            <Row label="Date de paiement" value={fmtDate(invoice.payment_date)} />
            <Row label="Mode de paiement" value={invoice.payment_method || "—"} />
            <Row label="Créée le" value={fmtDate(invoice.created_at)} />
            <Row label="Modifiée le" value={fmtDate(invoice.updated_at)} />
          </Section>

          {(invoice.notes || invoice.description) && (
            <Section title="Notes">
              <div className="col-span-full text-sm font-body whitespace-pre-line">
                {invoice.notes || invoice.description}
              </div>
            </Section>
          )}
        </div>

        {/* Actions */}
        <div className="sticky bottom-0 bg-card border-t border-border px-4 py-3 flex flex-wrap items-center gap-2">
          <button onClick={onDelete}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-500/50 text-rose-700 bg-rose-500/10 hover:bg-rose-500/20 text-sm font-display font-semibold min-h-[40px]">
            <Trash2 className="w-4 h-4" /> Supprimer
          </button>
          <div className="ml-auto flex flex-wrap gap-2">
            {onOpenLead && (
              <button onClick={() => onOpenLead(invoice.submission_id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card hover:bg-secondary text-sm font-display font-semibold min-h-[40px]">
                <ExternalLink className="w-4 h-4" /> Ouvrir le lead
              </button>
            )}
            <button onClick={onEdit}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold min-h-[40px]">
              <Pencil className="w-4 h-4" /> Modifier
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-1.5">{title}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value, strong, full }: { label: string; value: string; strong?: boolean; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-[10px] uppercase font-display font-semibold text-muted-foreground">{label}</div>
      <div className={`text-sm font-body break-words ${strong ? "font-display font-bold" : ""}`}>{value}</div>
    </div>
  );
}

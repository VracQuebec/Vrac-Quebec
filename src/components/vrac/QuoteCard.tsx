// ============================================================
// MODULE 5 — Soumission professionnelle affichée au client.
// Aucun calcul interne visible : matériau, quantité, transport,
// adresse et estimation toutes taxes incluses.
// ============================================================
import { CalendarDays, Check, CheckCircle2, Loader2, Lock, Mail, Pencil, Phone, PhoneCall, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/vrac/estimate";
import type { PublicQuote } from "@/lib/jsc/engine";
import type { SubmitAction, SubmitResult } from "@/lib/vrac/submit";

const PHONE = "581-994-7717";

/** Camion recommandé, sans jamais exposer d'information interne. */
function truckLabel(quote: PublicQuote): string {
  const name = quote.truck?.name ?? quote.truck?.type;
  const capacity = quote.truck?.capacity_tonnes;
  if (name && capacity) return `${name} (${capacity} tonnes)`;
  return name ?? (capacity ? `${capacity} tonnes` : "Déterminé par notre équipe");
}

const UNIT_LABEL: Record<string, string> = { tonne: "tonnes", m3: "m³", verge: "verges³" };

/** Quantité affichée : ce que le client a demandé, converti en tonnes si nécessaire. */
function quantityLabel(quote: PublicQuote): string {
  const unit = quote.unit ?? "tonne";
  const asked = `${quote.quantity} ${UNIT_LABEL[unit] ?? "tonnes"}`;
  return unit === "tonne" ? `${quote.tonnage} tonnes` : `${asked} (≈ ${quote.tonnage} tonnes)`;
}

interface Props {
  quote: PublicQuote;
  address: string;
  onEmail: () => void;
  onCallback: () => void;
  onEdit: () => void;
  pending: SubmitAction | null;
  result: SubmitResult | null;
  error: string | null;
}

export default function QuoteCard({
  quote, address, onEmail, onCallback, onEdit, pending, result, error,
}: Props) {
  const rows: [string, string][] = [
    ["Matériau", quote.material.name],
    ["Quantité", quantityLabel(quote)],
    ["Nombre de voyages", `${quote.trips} voyage${quote.trips > 1 ? "s" : ""}`],
    ["Camion utilisé", truckLabel(quote)],
    ["Adresse de livraison", quote.delivery_address ?? address ?? "—"],
  ];

  const included = [
    "Le matériau",
    "Le transport et la livraison à votre adresse",
    "Le chargement et le déchargement",
    "Les taxes (TPS et TVQ)",
  ];

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="bg-foreground px-6 py-5 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-primary">Soumission instantanée</p>
        {result?.quote_number && (
          <p className="mt-1 text-sm text-background/80">N° {result.quote_number}</p>
        )}
      </div>

      <dl className="divide-y divide-border px-6">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-6 py-4">
            <dt className="text-sm text-muted-foreground">{k}</dt>
            <dd className="text-right text-base font-semibold text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mx-6 mb-6 animate-fade-in rounded-2xl border border-primary/40 bg-primary/5 p-6 text-center">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Estimation</p>
        <p className="mt-1 text-4xl font-bold text-foreground">{formatMoney(quote.total)}</p>
        <p className="mt-1 text-sm text-muted-foreground">(TPS/TVQ incluses)</p>
      </div>

      <div
        className="mx-6 mb-6 flex gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 animate-fade-in [animation-fill-mode:both]"
        style={{ animationDelay: "150ms", animationDuration: "400ms" }}
      >
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-foreground">Information importante</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Cette soumission est une estimation automatique basée sur les informations fournies.
            Si des modifications sont apportées à la commande (quantité, adresse, matériau,
            conditions d’accès ou tout autre élément pouvant influencer la livraison), le prix
            pourrait être ajusté. Notre équipe confirmera toujours le montant final avant la livraison.
          </p>
        </div>
      </div>

      <div className="mx-6 mb-6 rounded-2xl border border-border bg-muted/30 p-5">
        <p className="text-sm font-semibold text-foreground">Ce qui est inclus</p>
        <ul className="mt-3 space-y-2">
          {included.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mx-6 mb-6 flex gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
        <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-foreground">Date de livraison</p>
          <p className="mt-1 text-sm text-muted-foreground">
            La date sera confirmée avec vous par notre équipe, selon nos disponibilités.
          </p>
        </div>
      </div>

      <div className="space-y-2 px-6 pb-6 text-sm text-muted-foreground">
        <p>
          {result?.valid_until
            ? `Cette estimation est valide jusqu'au ${new Date(`${result.valid_until}T12:00:00`).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })}.`
            : "Vous recevrez cette estimation par courriel. Notre équipe communiquera ensuite avec vous afin de confirmer les détails de votre commande ainsi que le montant final avant la livraison."}
        </p>
      </div>

      {result && (
        <div className="mx-6 mb-6 flex items-start gap-3 rounded-2xl border border-primary/40 bg-primary/10 p-4 text-sm text-foreground">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p>
            {result.action === "callback"
              ? "Votre demande de rappel est enregistrée. Notre équipe vous contacte sous peu."
              : `Votre soumission ${result.quote_number ?? ""} a été envoyée à ${result.emailed_to ?? "votre courriel"}.`}
          </p>
        </div>
      )}

      {error && (
        <p className="mx-6 mb-6 rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">{error}</p>
      )}

      <div className="mx-6 mb-6 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4">
        <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <p className="text-sm font-medium text-foreground">
          Aucune facturation avant la confirmation de votre commande.
        </p>
      </div>

      <div
        className="grid gap-3 border-t border-border bg-muted/20 p-6 sm:grid-cols-2 animate-fade-in [animation-fill-mode:both]"
        style={{ animationDelay: "300ms", animationDuration: "400ms" }}
      >
        <Button asChild variant="outline" className="h-auto w-full whitespace-normal py-3 text-center">
          <a href={`tel:${PHONE.replace(/\D/g, "")}`}>
            <Phone className="mr-2 h-4 w-4" /> Appeler maintenant
          </a>
        </Button>
        <Button onClick={onEmail} disabled={pending !== null} className="h-auto w-full whitespace-normal py-3 text-center">
          {pending === "submit"
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Envoi…</>
            : <><Mail className="mr-2 h-4 w-4" /> Recevoir ma soumission par courriel</>}
        </Button>
        <Button onClick={onCallback} variant="outline" disabled={pending !== null} className="h-auto w-full whitespace-normal py-3 text-center">
          {pending === "callback"
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Envoi…</>
            : <><PhoneCall className="mr-2 h-4 w-4" /> Demander un rappel</>}
        </Button>
        <Button onClick={onEdit} variant="ghost" className="h-auto w-full whitespace-normal py-3 text-center">
          <Pencil className="mr-2 h-4 w-4" /> Modifier ma demande
        </Button>
      </div>

      <div className="flex items-start gap-2 border-t border-border px-6 py-4 text-xs leading-relaxed text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <span>
          Vos informations demeurent confidentielles et sont utilisées uniquement afin de traiter
          votre demande de soumission.
        </span>
      </div>
    </div>
  );
}

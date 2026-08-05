// ============================================================
// MODULE 5 — Soumission professionnelle affichée au client.
// Aucun calcul interne visible : matériau, quantité, transport,
// adresse et estimation toutes taxes incluses.
// ============================================================
import { CalendarDays, Check, CheckCircle2, Loader2, Mail, Pencil, Phone, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/vrac/estimate";
import type { PublicQuote } from "@/lib/jsc/engine";
import type { SubmitAction, SubmitResult } from "@/lib/vrac/submit";

const PHONE = "581-994-7717";

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
    ["Quantité", `${quote.tonnage} tonnes`],
    ["Nombre de voyages", `${quote.trips} voyage${quote.trips > 1 ? "s" : ""}`],
    ["Camion utilisé", truckLabel(quote)],
    ["Adresse de livraison", quote.delivery_address ?? address ?? "—"],
  ];

  const included = [
    "Le matériau選".replace("選", ""),
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

      <div className="mx-6 mb-6 rounded-2xl border border-primary/40 bg-primary/5 p-6 text-center">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Estimation</p>
        <p className="mt-1 text-4xl font-bold text-foreground">{formatMoney(quote.total)}</p>
        <p className="mt-1 text-sm text-muted-foreground">(TPS/TVQ incluses)</p>
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
            : "Cette estimation vous est confirmée par courriel avec sa date de validité."}
        </p>
        <p>
          Notre équipe communiquera avec vous rapidement afin de confirmer la disponibilité
          et planifier votre livraison.
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

      <div className="grid gap-3 border-t border-border bg-muted/20 p-6 sm:grid-cols-2">
        <Button asChild variant="outline" className="w-full">
          <a href={`tel:${PHONE.replace(/\D/g, "")}`}>
            <Phone className="mr-2 h-4 w-4" /> Appeler
          </a>
        </Button>
        <Button onClick={onEmail} disabled={pending !== null} className="w-full">
          {pending === "submit"
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Envoi…</>
            : <><Mail className="mr-2 h-4 w-4" /> Recevoir par courriel</>}
        </Button>
        <Button onClick={onCallback} variant="outline" disabled={pending !== null} className="w-full">
          {pending === "callback"
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Envoi…</>
            : <><PhoneCall className="mr-2 h-4 w-4" /> Demander un rappel</>}
        </Button>
        <Button onClick={onEdit} variant="ghost" className="w-full">
          <Pencil className="mr-2 h-4 w-4" /> Modifier la demande
        </Button>
      </div>
    </div>
  );
}

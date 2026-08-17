// ============================================================
// CALCULATEUR DE SOUMISSION RAPIDE (CRM) — client applicatif
// Aucune règle de calcul ici : le prix provient exclusivement du
// moteur unique (`quote-engine` via getQuote). Ce module ne fait que
// mettre en forme le résultat et l'enregistrer dans le CRM existant.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { PublicQuote, QuoteUnit } from "./engine";

export const QUICK_QUOTE_SOURCES = [
  "Marketplace", "SMS", "Facebook", "Téléphone", "Courriel", "Site web", "Autre",
] as const;

export const UNIT_LABELS: Record<QuoteUnit, string> = {
  tonne: "tonnes",
  m3: "m³",
  verge: "verges³",
};

export const money = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);

export const QUICK_QUOTE_DISCLAIMER =
  "Cette soumission est une estimation automatique basée sur les informations fournies. " +
  "Si des modifications sont apportées à la commande (quantité, adresse, matériau, conditions d'accès " +
  "ou autres éléments pouvant influencer la livraison), le prix pourrait être ajusté. " +
  "Notre équipe confirmera toujours le montant final avant la livraison.";

/** Texte prêt à coller dans Messenger, SMS ou courriel. */
export function buildQuoteSummary(
  quote: PublicQuote,
  input: { quantity: number; unit: QuoteUnit; address?: string | null },
): string {
  const lines: (string | null)[] = [
    "SOUMISSION VRAC QUÉBEC",
    "",
    `Matériau : ${quote.material.name}`,
    `Quantité : ${input.quantity} ${UNIT_LABELS[input.unit]}`,
    input.address ? `Adresse de livraison : ${input.address}` : null,
    `Camion : ${quote.truck?.name ?? "—"}`,
    `Voyages : ${quote.trips}`,
    "",
    `Matériau : ${money(quote.material_amount)}`,
    `Transport : ${money(quote.transport_amount)}`,
    `Sous-total : ${money(quote.subtotal)}`,
    ...quote.taxes.map((t) => `${t.name} : ${money(t.amount)}`),
    "",
    `TOTAL : ${money(quote.total)}`,
    "",
    QUICK_QUOTE_DISCLAIMER,
  ];
  return lines.filter((l) => l !== null).join("\n");
}

export interface QuickQuoteSaveInput {
  material_id: string;
  quantity: number;
  unit: QuoteUnit;
  address: string;
  truck_id?: string | null;
  source: string;
  notes?: string | null;
  submission_id?: string | null;
  contact: { name: string; phone?: string; email?: string; company?: string };
}

export interface QuickQuoteSaveResult {
  request_number: string;
  submission_id: string | null;
  lead_created: boolean;
}

export async function saveQuickQuote(input: QuickQuoteSaveInput): Promise<QuickQuoteSaveResult> {
  const { data, error } = await supabase.functions.invoke("quote-assistant", {
    body: { action: "admin_save", ...input },
  });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: { text?: () => Promise<string> } }).context;
    if (typeof ctx?.text === "function") {
      const raw = await ctx.text();
      try { message = JSON.parse(raw)?.error ?? raw; } catch { message = raw || message; }
    }
    throw new Error(message || "Enregistrement impossible.");
  }
  if (!data?.ok) throw new Error(data?.error ?? "Enregistrement impossible.");
  return data as QuickQuoteSaveResult;
}

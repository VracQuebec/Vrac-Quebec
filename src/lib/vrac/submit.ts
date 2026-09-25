// ============================================================
// MODULE 5 — Envoi de la soumission professionnelle
// Le navigateur n'enregistre rien lui-même : tout passe par
// quote-submit (recalcul serveur, CRM, courriels, notifications).
// ============================================================
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildQuoteRequest, type QuoteContext } from "@/lib/vrac/estimate";
import type { VracDraft } from "@/lib/vrac/catalog";

export type SubmitAction = "submit" | "callback";

export interface SubmitResult {
  quote_number: string | null;
  request_number: string | null;
  valid_until: string | null;
  emailed_to: string | null;
  action: SubmitAction;
}

export function useQuoteSubmit() {
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [pending, setPending] = useState<SubmitAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Horodatage d'ouverture : sert de contrôle anti-robot côté serveur.
  const [formStartedAt] = useState(() => Date.now());
  const [honeypot, setHoneypot] = useState("");

  const send = useCallback(async (draft: VracDraft, action: SubmitAction, ctx: QuoteContext = {}) => {
    const request = buildQuoteRequest(draft, ctx);
    if ("unsupported" in request) { setError(request.unsupported); return; }

    setPending(action);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("quote-submit", {
        body: {
          action,
          ...request,
          website: honeypot,
          form_started_at: formStartedAt,
          desired_date: draft.date || null,
          access_notes: draft.addressNotes || null,
          contact: {
            name: draft.contact.name,
            phone: draft.contact.phone,
            email: draft.contact.email,
          },
        },
      });
      if (data && data.ok === false) {
        throw new Error(data.error || "Envoi impossible pour le moment.");
      }
      if (fnError) {
        const details = typeof (fnError as { context?: { text?: () => Promise<string> } }).context?.text === "function"
          ? await (fnError as { context: { text: () => Promise<string> } }).context.text()
          : fnError.message;
        let message = details;
        try { const parsed = JSON.parse(details); if (parsed?.error) message = parsed.error; } catch { /* non JSON */ }
        throw new Error(message || "Envoi impossible pour le moment.");
      }
      setResult({
        quote_number: data?.quote_number ?? null,
        request_number: data?.request_number ?? null,
        valid_until: data?.valid_until ?? null,
        emailed_to: data?.emailed_to ?? null,
        action,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible pour le moment.");
    } finally {
      setPending(null);
    }
  }, [formStartedAt, honeypot]);

  /** Demande « Sur demande » : envoyée sans calcul client, traitée côté serveur. */
  const sendManual = useCallback(async (draft: VracDraft) => {
    setPending("submit"); setError(null);
    try {
      const qty = draft.quantityMode === "tonnes" ? Number(draft.tonnes)
        : draft.quantityMode === "voyages" ? Number(draft.trips) : 1;
      const unit = draft.quantityMode === "tonnes" ? draft.quantityUnit : "tonne";
      const notes = [
        draft.quantityMode === "voyages" ? `Quantité : ${draft.trips} voyage(s)` : "",
        draft.quantityMode === "dimensions" ? `Dimensions : ${draft.dims.length} × ${draft.dims.width} × ${draft.dims.depth}` : "",
        draft.quantityMode === "inconnu" ? "Quantité à évaluer" : "",
        draft.contact.comments,
      ].filter(Boolean).join("\n");
      const { data, error: fnError } = await supabase.functions.invoke("quote-submit", {
        body: {
          action: "submit",
          material_catalog_id: draft.catalog?.materialId ?? null,
          granulometry_id: draft.catalog?.granulometryId ?? null,
          material_variant_id: draft.catalog?.variantId ?? null,
          custom_material: draft.catalog ? null : (draft.customMaterial || null),
          quantity: qty > 0 ? qty : 1, unit,
          address: draft.address,
          website: honeypot, form_started_at: formStartedAt,
          desired_date: draft.date || null, access_notes: draft.addressNotes || null,
          contact: { name: draft.contact.name, phone: draft.contact.phone, email: draft.contact.email, comments: notes || null },
        },
      });
      if (fnError || data?.ok === false) throw new Error(data?.error || "Envoi impossible pour le moment.");
      setResult({ quote_number: null, request_number: data?.request_number ?? null, valid_until: null, emailed_to: data?.emailed_to ?? null, action: "submit" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible pour le moment.");
    } finally { setPending(null); }
  }, [formStartedAt, honeypot]);

  return { result, pending, error, send, sendManual, honeypot, setHoneypot };
}

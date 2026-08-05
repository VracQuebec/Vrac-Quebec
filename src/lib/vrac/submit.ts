// ============================================================
// MODULE 5 — Envoi de la soumission professionnelle
// Le navigateur n'enregistre rien lui-même : tout passe par
// quote-submit (recalcul serveur, CRM, courriels, notifications).
// ============================================================
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildQuoteRequest } from "@/lib/vrac/estimate";
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

  const send = useCallback(async (draft: VracDraft, action: SubmitAction) => {
    const request = buildQuoteRequest(draft);
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

  return { result, pending, error, send, honeypot, setHoneypot };
}

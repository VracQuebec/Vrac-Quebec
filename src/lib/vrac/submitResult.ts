// Interprétation honnête de la réponse de la fonction quote-submit.
// Règle d'or : une demande enregistrée en base (numéro présent dans la
// réponse) est un succès, même si le courriel de confirmation a échoué ;
// une réponse sans numéro n'est jamais présentée comme un succès.

export interface QuoteSubmitRecorded {
  kind: "recorded";
  quote_number: string | null;
  request_number: string | null;
  valid_until: string | null;
  emailed_to: string | null;
  email_sent: boolean;
}

export interface QuoteSubmitFailed {
  kind: "failed";
  message: string;
}

export type QuoteSubmitOutcome = QuoteSubmitRecorded | QuoteSubmitFailed;

interface LooseBody {
  ok?: boolean;
  error?: string;
  quote_number?: string | null;
  request_number?: string | null;
  valid_until?: string | null;
  emailed_to?: string | null;
  email_sent?: boolean;
}

const GENERIC_ERROR = "Envoi impossible pour le moment.";

function asRecorded(body: LooseBody, emailSent: boolean): QuoteSubmitRecorded {
  return {
    kind: "recorded",
    quote_number: body.quote_number ?? null,
    request_number: body.request_number ?? null,
    valid_until: body.valid_until ?? null,
    emailed_to: body.emailed_to ?? null,
    email_sent: emailSent,
  };
}

/**
 * @param data          corps JSON quand la fonction a répondu 2xx (null sinon)
 * @param errorBody     corps JSON d'une réponse non-2xx (null si absent/illisible)
 * @param networkMessage message d'erreur réseau/fonction (secours)
 */
export function interpretQuoteSubmit(
  data: LooseBody | null | undefined,
  errorBody: LooseBody | null | undefined,
  networkMessage?: string | null,
): QuoteSubmitOutcome {
  // Réponse d'erreur (ex. 502) MAIS demande déjà enregistrée : les numéros
  // priment. Un courriel en échec ne fait jamais perdre la confirmation.
  if (errorBody && (errorBody.quote_number || errorBody.request_number)) {
    return asRecorded(errorBody, false);
  }

  if (data && typeof data === "object") {
    const hasRef = Boolean(data.quote_number || data.request_number);
    if (data.ok === false && !hasRef) {
      return {
        kind: "failed",
        message: typeof data.error === "string" && data.error ? data.error : GENERIC_ERROR,
      };
    }
    // ok:true, ou ok:false hérité avec numéros (ancien serveur) : enregistrée.
    return asRecorded(data, data.email_sent !== false);
  }

  const detail = typeof errorBody?.error === "string" && errorBody.error ? errorBody.error : null;
  return { kind: "failed", message: detail ?? networkMessage ?? GENERIC_ERROR };
}

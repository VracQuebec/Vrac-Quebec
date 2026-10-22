// ============================================================
// Anti-doublon de quote-submit (achat de vrac)
// ------------------------------------------------------------
// Même mécanisme partagé que submit-parcours : guard_claim → création →
// guard_complete (référence exacte) | guard_release (échec). Seul l'état
// « done » vaut doublon : un échec ne bloque jamais une nouvelle tentative.
// ============================================================
import { claimPublicRequest, completeClaim, releaseClaim, type GuardOptions } from '../_shared/public-guard.ts';

export const SCOPE = 'quote-submit';

export interface QuoteKey {
  email: string;
  action: string;
  quantity: number;
  unit: string;
  address: string;
  material: string;
  catalogId: string | null;
  variantId: string | null;
  granulometryId: string | null;
  customMaterial: string | null;
}

const norm = (s: unknown) => String(s ?? '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');

/** Empreinte hachée (aucune donnée personnelle en clair dans le journal). */
export async function quoteFingerprint(k: QuoteKey): Promise<string> {
  const raw = [
    norm(k.email), k.action, String(k.quantity), k.unit, norm(k.address),
    norm(k.material), k.catalogId ?? '', k.variantId ?? '', k.granulometryId ?? '', norm(k.customMaterial),
  ].join('|');
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return 'q2:' + Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface QuoteRef { request_number: unknown; quote_number: unknown; valid_until: unknown }

export type QuoteClaim =
  | { kind: 'new'; claimId: string }
  | { kind: 'duplicate'; ref: QuoteRef }
  | { kind: 'in_progress' };

export async function claimQuote(
  sb: any,
  o: Omit<GuardOptions, 'scope'>,
): Promise<QuoteClaim> {
  // 180 s : délai max d'une création (géocodage + moteur + 4 insertions).
  const c = await claimPublicRequest(sb, { ...o, scope: SCOPE, pendingSeconds: 180 });
  if (c.state === 'duplicate') {
    const r = c.result ?? {};
    if (!r.submission_id || !(r.request_number || r.quote_number)) {
      // Jamais de référence devinée.
      console.error(JSON.stringify({ event: 'guard.done_without_reference', scope: SCOPE }));
      return { kind: 'in_progress' };
    }
    return { kind: 'duplicate', ref: { request_number: r.request_number ?? null, quote_number: r.quote_number ?? null, valid_until: r.valid_until ?? null } };
  }
  if (c.state === 'in_progress' || !c.claimId) return { kind: 'in_progress' };
  return { kind: 'new', claimId: c.claimId };
}

export const completeQuote = (sb: any, claimId: string, result: { submission_id: string } & Record<string, unknown>) =>
  completeClaim(sb, SCOPE, claimId, result);

export const releaseQuote = (sb: any, claimId: string, reason: string) => releaseClaim(sb, SCOPE, claimId, reason);

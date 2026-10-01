// Demande soumise à résultat inconnu (transport perdu) : copie IMMUABLE de la requête exacte (clé + paramètres d'origine),
// liée à utilisateur/entreprise/enregistrement. Ce n'est pas un brouillon modifiable : elle ne sert qu'au rejeu exact.
// Aucun secret stocké (la clé d'idempotence n'en est pas un ; elle ne vaut que pour ce compte sous RLS).
type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Pending = { v: 1; op: string; user: string; company: string; record: string; key: string; args: J; at: string };

const ls = () => { try { return window.localStorage; } catch { return null; } };
const slot = (op: string, user: string, company: string, record: string) => `vq.pending.${op}:${user}:${company}:${record}`;

export function readPending(op: string, user: string, company: string, record: string): Pending | null {
  try {
    const raw = ls()?.getItem(slot(op, user, company, record)); if (!raw) return null;
    const p = JSON.parse(raw) as Pending;
    return p?.v === 1 && p.op === op && p.user === user && p.company === company && p.record === record && typeof p.key === "string" ? p : null;
  } catch { return null; }
}
export const UNAVAILABLE = "Stockage du navigateur indisponible : impossible de garantir la reprise en cas de coupure, paiement non envoyé (saisie conservée).";
/** Écrit AVANT l'appel réseau ; refuse de remplacer une demande en attente différente. */
export function savePending(p: Omit<Pending, "v" | "at">): Pending {
  const cur = readPending(p.op, p.user, p.company, p.record);
  if (cur && (cur.key !== p.key || JSON.stringify(cur.args) !== JSON.stringify(p.args))) throw new Error("Une demande précédente a un résultat inconnu : récupérez-la d'abord");
  if (cur) return cur;
  const full: Pending = { ...p, v: 1, at: new Date().toISOString() };
  const s = ls(); const k = slot(p.op, p.user, p.company, p.record); const raw = JSON.stringify(full);
  if (!s) throw new Error(UNAVAILABLE);
  try { s.setItem(k, raw); } catch { throw new Error(UNAVAILABLE); }
  let back: string | null = null; try { back = s.getItem(k); } catch { /* lecture refusée */ }
  if (back !== raw) { try { s.removeItem(k); } catch { /* ignoré */ } throw new Error(UNAVAILABLE); }
  return full;
}
export function clearPending(op: string, user: string, company: string, record: string) { ls()?.removeItem(slot(op, user, company, record)); }

/** Refus serveur dont l'issue est connue (SQLSTATE hors classe 08 « connexion », ou code PostgREST) : saisie corrigible.
 *  Résultat INCONNU (demande conservée) : aucun code (réseau, délai, passerelle) ou classe 08 (dont 08007 transaction_resolution_unknown). */
export const isDeterministic = (e: unknown) => { const c = (e as { code?: string })?.code ?? ""; if (/^08/.test(c)) return false; return /^[0-9A-Z]{5}$/.test(c) || /^PGRST/.test(c); };

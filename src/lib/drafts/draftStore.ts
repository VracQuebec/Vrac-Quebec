// NAV-01 — Socle commun des brouillons (stockage local de l'appareil).
// Un brouillon n'est JAMAIS une opération métier : il ne crée ni demande,
// ni soumission, ni paiement. Il conserve seulement ce que la personne a saisi.
// Identité : environnement + version + propriétaire + entreprise + module + formulaire + instance.
// Jamais de mot de passe ni de jeton dans un brouillon (chaque formulaire déclare ses champs).

export const DRAFT_SCHEMA_VERSION = 1;
const PREFIX = "vq.draft";

export type DraftIdentity = {
  module: string;        // ex. « soumission-publique »
  form: string;          // ex. « assistant »
  owner: string;         // id utilisateur, ou « anon » pour un visiteur (même navigateur)
  company?: string | null;
  instance?: string;     // distingue deux créations parallèles; « main » par défaut
  recordId?: string | null; // dossier existant en cas d'édition
};

export type DraftMeta = DraftIdentity & {
  key: string; env: string; version: number; rev: number;
  createdAt: string; updatedAt: string; label?: string;
  /** Version serveur sur laquelle repose cette copie (null = jamais synchronisée). */
  serverRev?: number | null;
  /** Modifications locales pas encore transmises au compte. */
  unsynced?: boolean;
  step?: number | null; route?: string | null;
  /** Copie de récupération : le brouillon au compte a été clos ailleurs; conservée sur cet appareil seulement, jamais transmise automatiquement. */
  recovery?: boolean;
};

export type DraftRecord<T> = { meta: DraftMeta; data: T };

const env = () => (typeof window !== "undefined" ? window.location.hostname : "test");

export function draftKey(id: DraftIdentity) {
  return [PREFIX, env(), id.owner || "anon", id.company || "-", id.module, id.form, id.recordId || "new", id.instance || "main"].join("|");
}

function storage(): Storage | null {
  try { const s = window.localStorage; const t = "__vq_probe__"; s.setItem(t, "1"); s.removeItem(t); return s; } catch { return null; }
}

export function storageAvailable() { return storage() !== null; }

/** Migration versionnée : un ancien format n'est jamais remplacé par du vide. */
function migrate<T>(raw: any): DraftRecord<T> | null {
  if (!raw || typeof raw !== "object" || !raw.meta || !("data" in raw)) return null;
  if (raw.meta.version === DRAFT_SCHEMA_VERSION) return raw as DraftRecord<T>;
  // Aucune version antérieure n'existe encore : on conserve la copie telle quelle.
  return null;
}

export function readDraft<T>(key: string): DraftRecord<T> | null {
  const s = storage(); if (!s) return null;
  const txt = s.getItem(key); if (!txt) return null;
  try {
    const rec = migrate<T>(JSON.parse(txt));
    if (!rec) { s.setItem(`${key}|incompatible`, txt); return null; }
    return rec;
  } catch {
    // Copie corrompue : conservée à part (récupérable), jamais écrasée silencieusement.
    try { s.setItem(`${key}|corrompu`, txt); s.removeItem(key); } catch { /* quota */ }
    return null;
  }
}

/** Écrit la révision suivante. Renvoie la méta écrite, ou null si le stockage a échoué (jamais de faux succès). */
export function writeDraft<T>(id: DraftIdentity, data: T, prev: DraftMeta | null, label?: string, extra?: Partial<DraftMeta>): DraftMeta | null {
  const s = storage(); if (!s) return null;
  const key = draftKey(id); const now = new Date().toISOString();
  const meta: DraftMeta = { ...id, key, env: env(), version: DRAFT_SCHEMA_VERSION, rev: (prev?.rev ?? 0) + 1, createdAt: prev?.createdAt ?? now, updatedAt: now, label, serverRev: prev?.serverRev ?? null, unsynced: prev?.unsynced, step: prev?.step, route: prev?.route, recovery: prev?.recovery, ...extra };
  try { s.setItem(key, JSON.stringify({ meta, data })); return meta; } catch { return null; }
}

export function discardDraft(key: string) { try { storage()?.removeItem(key); } catch { /* rien */ } }

/** Brouillons d'un propriétaire sur cet appareil (jamais ceux d'un autre compte). */
export function listDrafts(owner: string): DraftMeta[] {
  const s = storage(); if (!s) return [];
  const out: DraftMeta[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (!k || !k.startsWith(`${PREFIX}|${env()}|${owner}|`) || /\|(corrompu|incompatible|conflit-serveur|conflit-local)$/.test(k)) continue;
    const r = readDraft<unknown>(k); if (r) out.push(r.meta);
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Met à jour seulement la méta (ex. version serveur confirmée) sans créer de révision locale. */
export function patchMeta(key: string, patch: Partial<DraftMeta>): DraftMeta | null {
  const s = storage(); if (!s) return null;
  const rec = readDraft<unknown>(key); if (!rec) return null;
  const meta = { ...rec.meta, ...patch };
  try { s.setItem(key, JSON.stringify({ meta, data: rec.data })); return meta; } catch { return null; }
}
/** Copie de sécurité (conflit) : les deux versions sont conservées, jamais d'écrasement aveugle. */
export function keepConflictCopy(key: string, data: unknown, from: "serveur" | "local") {
  try { storage()?.setItem(`${key}|conflit-${from}`, JSON.stringify({ at: new Date().toISOString(), data })); } catch { /* quota */ }
}

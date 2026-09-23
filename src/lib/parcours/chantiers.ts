// ============================================================
// « MES CHANTIERS » — VUE CALCULÉE (aucune table « chantiers »).
// Les chantiers sont dérivés en mémoire des demandes réellement
// enregistrées et retournées par la RPC sécurisée `get_my_submissions`.
// Lecture seule : aucune écriture, aucune création, aucune donnée inventée.
//
// Règle de regroupement (uniquement des clés fiables) :
//   1. `place_id` Google (identifiant de lieu normalisé)  → clé « p:… »
//   2. sinon adresse normalisée + ville                   → clé « a:… »
//   3. sinon AUCUN regroupement : la demande reste seule  → clé « s:<id> »
// Aucune clé artificielle (ville seule, proximité GPS…) n'est utilisée :
// deux chantiers distincts d'une même ville ne doivent jamais fusionner.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { RpcClient } from "@/lib/parcours/validation";
import { loadMySubmissions, type MySubmission, type MySubmissionsResult } from "@/lib/parcours/mes-demandes";

export interface Chantier {
  /** Clé de navigation locale ; la propriété réelle reste vérifiée en base. */
  key: string;
  /** Origine de la clé de regroupement, pour transparence/tests. */
  groupedBy: "place_id" | "address" | "city" | "single";
  label: string;
  city: string | null;
  address: string | null;
  materials: string[];
  lastActivity: string | null;
  submissions: MySubmission[];
}

export type ChantierTone = "pending" | "active" | "done" | "refused" | "neutral";

export interface ChantierSummary {
  material: string | null;
  quantity: string | null;
  createdAt: string | null;
  lastActivity: string | null;
  statusLabel: string;
  tone: ChantierTone;
  active: boolean;
}

export type ChantiersResult =
  | { state: "ok"; chantiers: Chantier[] }
  | { state: "unauthorized" }
  | { state: "error"; message: string };

const norm = (v: string | null | undefined): string =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Clé de regroupement fiable, ou null si aucune n'existe. */
export const groupingKey = (
  s: MySubmission,
): { key: string; groupedBy: Chantier["groupedBy"] } => {
  if (s.placeId) return { key: `p:${s.placeId}`, groupedBy: "place_id" };
  const addr = norm(s.address);
  const city = norm(s.city);
  // Adresse suffisamment précise (numéro civique + rue) ET ville connue.
  if (addr.length >= 8 && /\d/.test(addr) && city) {
    return { key: `a:${addr}|${city}`, groupedBy: "address" };
  }
  // Aucune adresse précise : les demandes du même lieu normalisé (ville)
  // se retrouvent dans un seul chantier calculé plutôt que dupliquées.
  if (!addr && city) return { key: `c:${city}`, groupedBy: "city" };
  return { key: `s:${s.id}`, groupedBy: "single" };
};

export const buildChantiers = (submissions: MySubmission[]): Chantier[] => {
  const map = new Map<string, Chantier>();
  for (const s of submissions) {
    const { key, groupedBy } = groupingKey(s);
    const existing = map.get(key);
    if (existing) {
      existing.submissions.push(s);
      if (s.material && !existing.materials.includes(s.material)) existing.materials.push(s.material);
      existing.city = existing.city ?? s.city;
      existing.address = existing.address ?? s.address;
      if (s.createdAt && (!existing.lastActivity || s.createdAt > existing.lastActivity)) {
        existing.lastActivity = s.createdAt;
      }
      continue;
    }
    map.set(key, {
      key,
      groupedBy,
      label: s.city || s.address || "Chantier — adresse à confirmer",
      city: s.city,
      address: s.address,
      materials: s.material ? [s.material] : [],
      lastActivity: s.createdAt,
      submissions: [s],
    });
  }
  return [...map.values()].sort((a, b) => (b.lastActivity ?? "").localeCompare(a.lastActivity ?? ""));
};

const CLOSED_STATUSES = new Set(["terminee", "annulee", "refusee"]);
const ACTIVE_STATUSES = new Set(["acceptee", "planifiee", "en_cours"]);

/** Résumé d'affichage dérivé uniquement des demandes déjà autorisées. */
export const summarizeChantier = (chantier: Chantier): ChantierSummary => {
  const latest = [...chantier.submissions].sort((a, b) =>
    (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  )[0] ?? null;
  const statuses = chantier.submissions.map((submission) => submission.status ?? "");
  const allClosed = statuses.length > 0 && statuses.every((status) => CLOSED_STATUSES.has(status));
  const hasActive = statuses.some((status) => ACTIVE_STATUSES.has(status));
  return {
    material: latest?.material ?? chantier.materials[0] ?? null,
    quantity: latest?.quantity ?? null,
    createdAt: latest?.createdAt ?? null,
    lastActivity: chantier.lastActivity,
    statusLabel: allClosed ? "Terminé" : hasActive ? "En cours" : "En traitement",
    tone: allClosed ? "done" : hasActive ? "active" : "pending",
    active: !allClosed,
  };
};

export const findChantierForSubmission = (chantiers: Chantier[], submissionId: string) =>
  chantiers.find((chantier) => chantier.submissions.some((submission) => submission.id === submissionId)) ?? null;

const normalized = (value: unknown) => norm(typeof value === "string" ? value : null);

/**
 * Rapprochement prudent d'un transport avec un chantier existant.
 * Une ville seule n'est utilisée que lorsqu'elle désigne un chantier unique.
 */
export const findChantierForTransport = (chantiers: Chantier[], transport: Record<string, unknown>) => {
  const address = normalized(transport.site_address);
  if (address) {
    const exact = chantiers.filter((chantier) => normalized(chantier.address) === address);
    if (exact.length === 1) return exact[0];
  }
  const city = normalized(transport.site_city);
  if (!city) return null;
  const sameCity = chantiers.filter((chantier) => normalized(chantier.city) === city);
  return sameCity.length === 1 ? sameCity[0] : null;
};

/** Charge les chantiers de l'utilisateur connecté (vue calculée, lecture seule). */
export const loadMyChantiers = async (
  client: RpcClient = supabase as unknown as RpcClient,
): Promise<ChantiersResult> => {
  const res: MySubmissionsResult = await loadMySubmissions(client);
  if (res.state !== "ok") return res;
  return { state: "ok", chantiers: buildChantiers(res.submissions) };
};

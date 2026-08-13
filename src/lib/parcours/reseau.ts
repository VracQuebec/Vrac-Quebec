// ============================================================
// « CARTE DU RÉSEAU » — V1, VUE CALCULÉE, LECTURE SEULE.
// Aucune table réseau, aucun moteur de matching, aucune distance ni
// proximité inventée. Le réseau est uniquement la mise en relation des
// briques déjà validées :
//   • Demandes  → loadMySubmissions (RPC get_my_submissions, auth.uid())
//   • Chantiers → buildChantiers    (« Mes chantiers »)
//   • Sites     → buildRecommendedSites (« Sites recommandés »)
//   • Transport → transport_requests.origin_submission_id (RLS serveur)
// Une donnée absente reste absente : l'élément est affiché sans position.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import type { RpcClient } from "@/lib/parcours/validation";
import { loadMySubmissions, type MySubmission, type MySubmissionsResult } from "@/lib/parcours/mes-demandes";
import { buildChantiers, type Chantier } from "@/lib/parcours/chantiers";
import { buildRecommendedSites, type RecommendedSite } from "@/lib/parcours/sites-recommandes";

export interface ReseauQueryResult {
  data: unknown;
  error: { message: string } | null;
}
export interface ReseauFilterBuilder {
  not: (column: string, op: string, value: unknown) => PromiseLike<ReseauQueryResult>;
}
export interface ReseauClient extends RpcClient {
  from: (table: string) => { select: (cols: string) => ReseauFilterBuilder };
}

export interface ReseauDemandeNode {
  submissionId: string;
  number: number | null;
  label: string;
  material: string | null;
  status: string | null;
  createdAt: string | null;
  /** Position uniquement si réellement enregistrée. */
  location: { lat: number; lng: number } | null;
  /** Site réellement sélectionné pour cette demande, sinon null. */
  site: RecommendedSite | null;
  /** true seulement si un transport est réellement rattaché. */
  hasTransport: boolean;
  /** null = information transport indisponible (jamais présentée comme « aucun »). */
  transportKnown: boolean;
  href: string;
}

export interface ReseauChantierNode {
  key: string;
  label: string;
  city: string | null;
  address: string | null;
  materials: string[];
  lastActivity: string | null;
  demandes: ReseauDemandeNode[];
  href: string;
}

export interface Reseau {
  chantiers: ReseauChantierNode[];
  totals: {
    chantiers: number;
    demandes: number;
    sites: number;
    /** null si l'information transport n'a pas pu être lue. */
    transports: number | null;
    localises: number;
  };
}

export type ReseauResult =
  | { state: "ok"; reseau: Reseau }
  | { state: "unauthorized" }
  | { state: "error"; message: string };

const demandeLabel = (s: MySubmission): string =>
  s.number != null ? `Demande #${s.number}` : "Demande";

/** Construit le réseau à partir des briques existantes, sans rien inventer. */
export const buildReseau = (
  submissions: MySubmission[],
  linkedTransportIds: Set<string> | null,
): Reseau => {
  const sitesBySubmission = new Map<string, RecommendedSite>();
  for (const site of buildRecommendedSites(submissions)) {
    sitesBySubmission.set(site.submissionId, site);
  }

  const chantiers: Chantier[] = buildChantiers(submissions);
  const nodes: ReseauChantierNode[] = chantiers.map((c) => ({
    key: c.key,
    label: c.label,
    city: c.city,
    address: c.address,
    materials: c.materials,
    lastActivity: c.lastActivity,
    href: "/entrepreneur/chantiers",
    demandes: c.submissions.map((s) => ({
      submissionId: s.id,
      number: s.number,
      label: demandeLabel(s),
      material: s.quoteMaterial ?? s.material,
      status: s.status,
      createdAt: s.createdAt,
      location:
        s.latitude != null && s.longitude != null ? { lat: s.latitude, lng: s.longitude } : null,
      site: sitesBySubmission.get(s.id) ?? null,
      hasTransport: linkedTransportIds ? linkedTransportIds.has(s.id) : false,
      transportKnown: linkedTransportIds !== null,
      href: `/entrepreneur/demandes#demande-${s.id}`,
    })),
  }));

  const demandes = nodes.reduce((n, c) => n + c.demandes.length, 0);
  const sites = new Set(
    nodes.flatMap((c) => c.demandes.map((d) => d.site?.siteId).filter(Boolean) as string[]),
  ).size;
  const localises = nodes.reduce(
    (n, c) => n + c.demandes.filter((d) => d.location !== null).length,
    0,
  );
  const transports = linkedTransportIds
    ? nodes.reduce((n, c) => n + c.demandes.filter((d) => d.hasTransport).length, 0)
    : null;

  return { chantiers: nodes, totals: { chantiers: nodes.length, demandes, sites, transports, localises } };
};

/** Identifiants de demandes réellement rattachées à un transport (filtrés par RLS). */
export const loadLinkedTransportIds = async (
  client: ReseauClient,
): Promise<Set<string> | null> => {
  try {
    const { data, error } = await client
      .from("transport_requests")
      .select("origin_submission_id")
      .not("origin_submission_id", "is", null);
    if (error) return null;
    const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    return new Set(
      rows.map((r) => String(r.origin_submission_id ?? "")).filter((v) => v.length > 0),
    );
  } catch {
    return null;
  }
};

/** Charge le réseau du compte connecté. Aucune écriture, aucun élargissement. */
export const loadReseau = async (
  client: ReseauClient = supabase as unknown as ReseauClient,
): Promise<ReseauResult> => {
  const res: MySubmissionsResult = await loadMySubmissions(client);
  if (res.state !== "ok") return res;
  const ids = await loadLinkedTransportIds(client);
  return { state: "ok", reseau: buildReseau(res.submissions, ids) };
};

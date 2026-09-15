// ============================================================
// CRM — TRI DE LA LISTE DES LEADS
// ------------------------------------------------------------
// Module PUR : options de tri, mappage vers les colonnes réelles,
// comparateur client (valeurs manquantes TOUJOURS à la fin) et
// estimations de jumelage. Aucune écriture, aucune donnée inventée :
// une valeur absente reste `null`, jamais 0.
// ============================================================

export type LeadSort =
  | "recent" | "oldest"
  | "travaux_proche" | "travaux_loin"
  | "modif_recent" | "modif_ancien"
  | "suivi_urgent" | "suivi_loin"
  | "priorite_urgente" | "potentiel" | "matchs_desc" | "matchs_asc"
  | "voyages_desc" | "voyages_asc" | "quantite_desc" | "quantite_asc"
  | "distance_proche" | "distance_loin"
  | "client_az" | "client_za";

export const DEFAULT_SORT: LeadSort = "recent";

export interface SortOption {
  value: LeadSort;
  label: string;
  /** Colonne réellement utilisée pour le tri (documentation + tri serveur). */
  column: string | null;
  ascending: boolean;
  /** Vrai quand le tri ne peut pas être fait par la base (valeur calculée). */
  clientOnly?: boolean;
}

export const SORT_GROUPS: { group: string; options: SortOption[] }[] = [
  {
    group: "Dates",
    options: [
      { value: "recent", label: "Plus récents", column: "created_at", ascending: false },
      { value: "oldest", label: "Plus anciens", column: "created_at", ascending: true },
      { value: "travaux_proche", label: "Date des travaux — plus proche", column: "desired_date", ascending: true },
      { value: "travaux_loin", label: "Date des travaux — plus éloignée", column: "desired_date", ascending: false },
      { value: "modif_recent", label: "Modifiés récemment", column: "updated_at", ascending: false },
      { value: "modif_ancien", label: "Modifiés il y a le plus longtemps", column: "updated_at", ascending: true },
      { value: "suivi_urgent", label: "Prochain suivi — plus urgent", column: "next_follow_up_at", ascending: true },
      { value: "suivi_loin", label: "Prochain suivi — plus éloigné", column: "next_follow_up_at", ascending: false },
    ],
  },
  {
    group: "Priorité et potentiel",
    options: [
      { value: "priorite_urgente", label: "Priorité — urgente en premier", column: "priority", ascending: false },
      { value: "potentiel", label: "Meilleur potentiel de jumelage", column: null, ascending: false, clientOnly: true },
      { value: "matchs_desc", label: "Plus grand nombre de matchs compatibles", column: null, ascending: false, clientOnly: true },
      { value: "matchs_asc", label: "Plus petit nombre de matchs compatibles", column: null, ascending: true, clientOnly: true },
    ],
  },
  {
    group: "Volume",
    options: [
      { value: "voyages_desc", label: "Plus grand nombre de voyages", column: "quantity (voyages) / quote_trips", ascending: false, clientOnly: true },
      { value: "voyages_asc", label: "Plus petit nombre de voyages", column: "quantity (voyages) / quote_trips", ascending: true, clientOnly: true },
      { value: "quantite_desc", label: "Plus grande quantité", column: "quantity_value", ascending: false },
      { value: "quantite_asc", label: "Plus petite quantité", column: "quantity_value", ascending: true },
    ],
  },
  {
    group: "Localisation",
    options: [
      { value: "distance_proche", label: "Distance — plus proche", column: "quote_distance_km", ascending: true },
      { value: "distance_loin", label: "Distance — plus éloignée", column: "quote_distance_km", ascending: false },
    ],
  },
  {
    group: "Client",
    options: [
      { value: "client_az", label: "Nom du client — A à Z", column: "name", ascending: true },
      { value: "client_za", label: "Nom du client — Z à A", column: "name", ascending: false },
    ],
  },
];

export const SORT_OPTIONS: SortOption[] = SORT_GROUPS.flatMap((g) => g.options);

export const isLeadSort = (v: unknown): v is LeadSort =>
  typeof v === "string" && SORT_OPTIONS.some((o) => o.value === v);

export const parseLeadSort = (v: string | null | undefined): LeadSort =>
  isLeadSort(v) ? v : DEFAULT_SORT;

export const sortOption = (sort: LeadSort): SortOption =>
  SORT_OPTIONS.find((o) => o.value === sort) ?? SORT_OPTIONS[0];

export const sortLabel = (sort: LeadSort): string => sortOption(sort).label;

export const isClientOnlySort = (sort: LeadSort): boolean => !!sortOption(sort).clientOnly;

// ------------------------------------------------------------
// Lead minimal utilisé par le tri (compatible avec `submissions`).
// ------------------------------------------------------------
export interface SortableLead {
  id: string;
  created_at: string;
  updated_at?: string | null;
  desired_date?: string | null;
  next_follow_up_at?: string | null;
  priority?: string | null;
  quote_trips?: number | null;
  /** Nombre de voyages saisi en texte libre (« 10 à 12 voyages »). */
  quantity?: string | null;
  quantity_value?: number | null;
  quote_distance_km?: number | null;
  name?: string | null;
  materials?: string[] | null;
  latitude?: number | null;
  longitude?: number | null;
  request_type?: string | null;
  availability_status?: string | null;
  address?: string | null;
}

const time = (v?: string | null): number | null => {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

const num = (v?: number | null): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Rang de priorité : urgente la plus haute. Jamais 0 par défaut. */
/** Voyages estimés : texte libre d'abord, sinon la valeur calculée. Jamais 0. */
export const estimatedTrips = (lead: SortableLead): number | null => {
  const raw = (lead.quantity ?? "").toString();
  const m = raw.match(/(\d+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n)) return n;
  }
  return num(lead.quote_trips);
};

const priorityRank = (v?: string | null): number | null => {
  if (!v) return null;
  if (v === "urgent") return 2;
  if (v === "normal") return 1;
  return null;
};

// ------------------------------------------------------------
// Potentiel de jumelage : estimation affichée, jamais enregistrée.
// `null` quand l'information de base manque (jamais 0 par défaut).
// ------------------------------------------------------------
export const matchPotential = (lead: SortableLead): number | null => {
  const hasMaterials = (lead.materials?.length ?? 0) > 0;
  const hasGeo = num(lead.latitude) != null && num(lead.longitude) != null;
  if (!hasMaterials && !hasGeo) return null;
  let score = 0;
  if (hasMaterials) score += 30;
  if (hasGeo) score += 25;
  if (num(lead.quantity_value) != null || num(lead.quote_trips) != null) score += 20;
  if (lead.address && lead.address.trim()) score += 10;
  if (lead.availability_status === "available") score += 15;
  return score;
};

const EARTH_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

export const haversineKm = (
  aLat: number, aLon: number, bLat: number, bLon: number,
): number => {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};

const direction = (lead: SortableLead): "remblai" | "vrac" =>
  (lead.request_type || "").toLowerCase().includes("remblai") ? "remblai" : "vrac";

/**
 * Estimation du nombre de leads compatibles (matériau partagé + moins de
 * 50 km, sens opposé). `null` quand le lead n'a ni matériau ni coordonnées :
 * une donnée manquante n'est jamais convertie en 0.
 */
export const estimateMatchCounts = (
  leads: SortableLead[],
  radiusKm = 50,
): Map<string, number | null> => {
  const out = new Map<string, number | null>();
  for (const lead of leads) {
    const mats = lead.materials ?? [];
    const lat = num(lead.latitude);
    const lon = num(lead.longitude);
    if (mats.length === 0 || lat == null || lon == null) { out.set(lead.id, null); continue; }
    const dir = direction(lead);
    let count = 0;
    for (const other of leads) {
      if (other.id === lead.id) continue;
      if (direction(other) === dir) continue;
      const oLat = num(other.latitude);
      const oLon = num(other.longitude);
      if (oLat == null || oLon == null) continue;
      if (!(other.materials ?? []).some((m) => mats.includes(m))) continue;
      if (haversineKm(lat, lon, oLat, oLon) > radiusKm) continue;
      count += 1;
    }
    out.set(lead.id, count);
  }
  return out;
};

// ------------------------------------------------------------
// Comparateur client.
// ------------------------------------------------------------
export interface SortHelpers {
  matchCounts?: Map<string, number | null>;
}

/** Valeur triable du lead pour le critère choisi (`null` = donnée absente). */
export const sortValue = (
  lead: SortableLead, sort: LeadSort, helpers: SortHelpers = {},
): number | string | null => {
  switch (sort) {
    case "recent": case "oldest": return time(lead.created_at);
    case "travaux_proche": case "travaux_loin": return time(lead.desired_date);
    case "modif_recent": case "modif_ancien": return time(lead.updated_at);
    case "suivi_urgent": case "suivi_loin": return time(lead.next_follow_up_at);
    case "priorite_urgente": return priorityRank(lead.priority);
    case "potentiel": return matchPotential(lead);
    case "matchs_desc": case "matchs_asc": return helpers.matchCounts?.get(lead.id) ?? null;
    case "voyages_desc": case "voyages_asc": return estimatedTrips(lead);
    case "quantite_desc": case "quantite_asc": return num(lead.quantity_value);
    case "distance_proche": case "distance_loin": return num(lead.quote_distance_km);
    case "client_az": case "client_za": {
      const n = (lead.name ?? "").trim();
      return n ? n.toLocaleLowerCase("fr-CA") : null;
    }
    default: return null;
  }
};

/**
 * Comparateur stable : critère choisi → created_at décroissant → identifiant.
 * Les valeurs manquantes sont toujours placées à la fin, peu importe le sens.
 */
export const compareLeads = (
  sort: LeadSort, helpers: SortHelpers = {},
) => (a: SortableLead, b: SortableLead): number => {
  const asc = sortOption(sort).ascending;
  const va = sortValue(a, sort, helpers);
  const vb = sortValue(b, sort, helpers);
  if (va == null && vb != null) return 1;
  if (vb == null && va != null) return -1;
  if (va != null && vb != null && va !== vb) {
    const cmp = typeof va === "string" && typeof vb === "string"
      ? va.localeCompare(String(vb), "fr-CA")
      : Number(va) - Number(vb);
    if (cmp !== 0) return asc ? cmp : -cmp;
  }
  const ca = time(a.created_at) ?? 0;
  const cb = time(b.created_at) ?? 0;
  if (ca !== cb) return cb - ca;
  return a.id.localeCompare(b.id);
};

export const sortLeads = <T extends SortableLead>(
  leads: T[], sort: LeadSort, helpers: SortHelpers = {},
): T[] => [...leads].sort(compareLeads(sort, helpers));

// ------------------------------------------------------------
// Tri côté serveur (PostgREST) — index dédiés sur chaque colonne.
// ------------------------------------------------------------
export interface OrderableQuery {
  order(column: string, opts: { ascending: boolean; nullsFirst: boolean }): OrderableQuery;
}

/** Applique le tri + les critères secondaires stables à une requête. */
export const applyServerOrder = <Q extends OrderableQuery>(query: Q, sort: LeadSort): Q => {
  const opt = sortOption(sort);
  let q = query;
  if (opt.column) {
    q = q.order(opt.column, { ascending: opt.ascending, nullsFirst: false }) as Q;
  }
  q = q.order("created_at", { ascending: false, nullsFirst: false }) as Q;
  q = q.order("id", { ascending: true, nullsFirst: false }) as Q;
  return q;
};

export const pageRange = (page: number, pageSize: number): [number, number] => {
  const p = Math.max(1, Math.floor(page));
  const from = (p - 1) * pageSize;
  return [from, from + pageSize - 1];
};

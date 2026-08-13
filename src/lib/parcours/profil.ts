// ============================================================
// « PROFIL RÉSEAU » — V1, LECTURE SEULE.
// Source unique : la ligne `entrepreneurs` réellement rattachée au compte
// connecté (RLS : user_id = auth.uid(); aucun identifiant fourni par le
// client). Aucune table, aucune donnée inventée : notation, réputation,
// distance, disponibilité, certification et spécialité n'existent pas ici.
// Les compteurs réutilisent EXACTEMENT les logiques déjà validées
// (Mes demandes / Mes chantiers) via loadActivitySummary.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { loadActivitySummary, type ActivityClient } from "@/lib/parcours/activity";

/** Visibilité d'un champ : privé (jamais affiché), self (moi seul), réseau. */
export type FieldVisibility = "private" | "self" | "network";

export interface ProfilField {
  key: string;
  label: string;
  value: string;
  visibility: Exclude<FieldVisibility, "private">;
}

export interface ProfilReseau {
  /** Champs réellement renseignés, jamais complétés artificiellement. */
  fields: ProfilField[];
  /** Nom d'entreprise réel, sinon null. */
  company: string | null;
  /** Compteurs déjà calculables ; null si non disponibles. */
  demandes: number | null;
  chantiers: number | null;
  /** true si les informations minimales du profil réseau manquent. */
  incomplete: boolean;
  /** true si aucune fiche entrepreneur n'existe pour ce compte. */
  missing: boolean;
}

export type ProfilResult =
  | { state: "ok"; profil: ProfilReseau }
  | { state: "unauthorized" }
  | { state: "error"; message: string };

export interface ProfilQueryResult {
  data: unknown;
  error: { message: string } | null;
}

export interface ProfilClient extends ActivityClient {
  from: (table: string) => { select: (cols: string) => PromiseLike<ProfilQueryResult> } & any;
}

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t : null;
};

const list = (v: unknown): string | null => {
  if (!Array.isArray(v)) return null;
  const items = v.map((x) => String(x ?? "").trim()).filter(Boolean);
  return items.length ? items.join(", ") : null;
};

/**
 * Champs JAMAIS exposés (compte privé) : email, user_id, id, notes internes,
 * adresse de facturation, numéros de taxes, numéro de carte interne.
 */
export const PRIVATE_KEYS = [
  "id",
  "user_id",
  "email",
  "notes",
  "billing_address",
  "tax_tps",
  "tax_tvq",
  "map_number",
] as const;

/** Construit le profil à partir d'une ligne `entrepreneurs` réelle. */
export const buildProfil = (
  row: unknown,
  counters: { demandes: number | null; chantiers: number | null },
): ProfilReseau => {
  const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
  const missing = !row || typeof row !== "object";
  const company = str(r.company);
  const fields: ProfilField[] = [];

  const push = (
    key: string,
    label: string,
    value: string | null,
    visibility: Exclude<FieldVisibility, "private">,
  ) => {
    if (value) fields.push({ key, label, value, visibility });
  };

  push("company", "Entreprise", company, "network");
  push("truck_types", "Types de camions", list(r.truck_types), "network");
  push("truck_count", "Nombre de camions", str(r.truck_count), "network");
  push("contact_name", "Personne-ressource", str(r.contact_name) ?? str(r.name), "self");
  push("phone", "Téléphone", str(r.phone), "self");
  push("address", "Adresse", str(r.address), "self");

  return {
    fields,
    company,
    demandes: counters.demandes,
    chantiers: counters.chantiers,
    incomplete: !missing && !company,
    missing,
  };
};

/** Un profil n'est visible dans le réseau que s'il a un nom d'entreprise réel. */
export const isNetworkVisible = (profil: ProfilReseau): boolean =>
  !profil.missing && !!profil.company;

/** Charge le profil du compte connecté. Jamais celui d'un autre entrepreneur. */
export const loadMyProfil = async (
  client: ProfilClient = supabase as unknown as ProfilClient,
): Promise<ProfilResult> => {
  let row: unknown = null;
  try {
    // RLS : seule la ligne de l'utilisateur connecté peut revenir.
    const { data, error } = await client
      .from("entrepreneurs")
      .select("company,contact_name,name,phone,address,truck_types,truck_count");
    if (error) {
      const m = (error.message || "").toLowerCase();
      if (m.includes("not_authorized") || m.includes("permission") || m.includes("jwt")) {
        return { state: "unauthorized" };
      }
      return { state: "error", message: error.message || "Lecture impossible." };
    }
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    row = rows[0] ?? null;
  } catch (e) {
    return { state: "error", message: (e as Error)?.message || "Lecture impossible." };
  }

  const activity = await loadActivitySummary(client);
  if (activity.state === "unauthorized") return { state: "unauthorized" };
  const counters =
    activity.state === "ok"
      ? { demandes: activity.summary.demandes, chantiers: activity.summary.chantiers }
      : { demandes: null, chantiers: null };

  return { state: "ok", profil: buildProfil(row, counters) };
};

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
  /** Valeurs éditables réelles, préremplies dans le formulaire. */
  edits: ProfilEdits;
}

export type ProfilResult =
  | { state: "ok"; profil: ProfilReseau }
  | { state: "unauthorized" }
  | { state: "error"; message: string };

// ------------------------------------------------------------
// ÉDITION CONTRÔLÉE — uniquement les colonnes réellement éditables
// par l'entrepreneur propriétaire (RLS : user_id = auth.uid()).
// ------------------------------------------------------------
export interface ProfilEdits {
  company: string;
  contact_name: string;
  phone: string;
  address: string;
  truck_types: string[];
  truck_count: string;
}

export const EDITABLE_KEYS = [
  "company",
  "contact_name",
  "phone",
  "address",
  "truck_types",
  "truck_count",
] as const;

/** Options de camions déjà utilisées par l'application (aucune invention). */
export const TRUCK_TYPE_OPTIONS = [
  "Camion 6 roues",
  "Camion 10 roues",
  "Camion 12 roues",
  "Semi-remorque 2 essieux",
  "Semi-remorque 3 essieux",
  "Semi-remorque 4 essieux",
  "Fardier",
  "Autre",
] as const;

export const MAX_LEN: Record<keyof ProfilEdits, number> = {
  company: 120,
  contact_name: 120,
  phone: 30,
  address: 200,
  truck_types: 0,
  truck_count: 6,
};

export type ProfilErrors = Partial<Record<keyof ProfilEdits, string>>;

/** Valeurs du formulaire à partir d'une ligne réelle (jamais inventées). */
export const toEdits = (row: unknown): ProfilEdits => {
  const r = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
  return {
    company: str(r.company) ?? "",
    contact_name: str(r.contact_name) ?? "",
    phone: str(r.phone) ?? "",
    address: str(r.address) ?? "",
    truck_types: Array.isArray(r.truck_types)
      ? r.truck_types.map((x) => String(x ?? "").trim()).filter(Boolean)
      : [],
    truck_count: str(r.truck_count) ?? "",
  };
};

/** Validation : mêmes règles que le reste de l'application, rien de plus. */
export const validateProfilEdits = (e: ProfilEdits): ProfilErrors => {
  const errors: ProfilErrors = {};
  const company = e.company.trim();
  if (!company) errors.company = "Le nom de l'entreprise est requis.";
  else if (company.length > MAX_LEN.company) errors.company = "Maximum 120 caractères.";

  if (e.contact_name.trim().length > MAX_LEN.contact_name)
    errors.contact_name = "Maximum 120 caractères.";
  if (e.address.trim().length > MAX_LEN.address) errors.address = "Maximum 200 caractères.";

  const phone = e.phone.trim();
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 11) errors.phone = "Téléphone invalide (10 chiffres).";
    else if (phone.length > MAX_LEN.phone) errors.phone = "Maximum 30 caractères.";
  }

  const count = e.truck_count.trim();
  if (count && !/^\d{1,6}$/.test(count)) errors.truck_count = "Nombre entier seulement.";

  if (e.truck_types.some((t) => !t.trim())) errors.truck_types = "Type de camion invalide.";
  return errors;
};

/** Payload envoyé à la base : chaînes vides converties en null. */
export const toPayload = (e: ProfilEdits): Record<string, unknown> => ({
  company: e.company.trim() || null,
  contact_name: e.contact_name.trim() || null,
  phone: e.phone.trim() || null,
  address: e.address.trim() || null,
  truck_types: e.truck_types.length ? e.truck_types : null,
  truck_count: e.truck_count.trim() || null,
});

export type SaveResult =
  | { state: "ok" }
  | { state: "unauthorized" }
  | { state: "invalid"; errors: ProfilErrors }
  | { state: "error"; message: string };

/**
 * Sauvegarde la fiche du compte connecté UNIQUEMENT.
 * Aucun identifiant client n'est utilisé : la policy UPDATE
 * (`user_id = auth.uid()`) détermine seule la ligne modifiable.
 */
export const saveMyProfil = async (
  edits: ProfilEdits,
  client: ProfilClient = supabase as unknown as ProfilClient,
): Promise<SaveResult> => {
  const errors = validateProfilEdits(edits);
  if (Object.keys(errors).length) return { state: "invalid", errors };
  try {
    const { error } = await (client as any)
      .from("entrepreneurs")
      .update(toPayload(edits))
      .select("company");
    if (error) {
      const m = (error.message || "").toLowerCase();
      if (m.includes("not_authorized") || m.includes("permission") || m.includes("jwt") || m.includes("row-level")) {
        return { state: "unauthorized" };
      }
      return { state: "error", message: error.message || "Enregistrement impossible." };
    }
    return { state: "ok" };
  } catch (err) {
    return { state: "error", message: (err as Error)?.message || "Enregistrement impossible." };
  }
};

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
    edits: toEdits(row),
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

// ============================================================
// HISTORIQUE ADMIN DE VISIBILITÉ RÉSEAU — LECTURE SEULE.
// Source unique : `crm_audit_log` (déjà existant), filtré sur
// owner_type = 'entrepreneur' et field = 'is_network_visible'.
// Accès : la policy SELECT existante (has_role(auth.uid(),'admin'))
// est la SEULE autorisation — aucun nouveau mécanisme.
// Aucune donnée privée (adresse, téléphone, courriel du profil,
// données fiscales, notes) n'est lue ni exposée.
// ============================================================
import { supabase } from "@/integrations/supabase/client";

export interface VisibilityAuditEntry {
  id: string;
  /** Profil concerné : nom d'entreprise réel, sinon null. */
  company: string | null;
  entrepreneurId: string;
  /** Ancien état de visibilité (null si inconnu). */
  from: boolean | null;
  /** Nouvel état de visibilité (null si inconnu). */
  to: boolean | null;
  /** Acteur du changement : courriel journalisé, sinon identifiant, sinon null. */
  actor: string | null;
  /** Date/heure ISO du changement. */
  at: string;
}

export type VisibilityAuditResult =
  | { state: "ok"; entries: VisibilityAuditEntry[] }
  | { state: "unauthorized" }
  | { state: "error"; message: string };

export interface AuditClient {
  from: (table: string) => any;
}

const toBool = (v: unknown): boolean | null =>
  v === true || v === "true" ? true : v === false || v === "false" ? false : null;

const isDenied = (message: string) => {
  const m = (message || "").toLowerCase();
  return (
    m.includes("permission") ||
    m.includes("row-level") ||
    m.includes("rls") ||
    m.includes("jwt") ||
    m.includes("not_authorized")
  );
};

/** Journal chronologique (plus récent d'abord) des bascules de visibilité. */
export const loadVisibilityAudit = async (
  client: AuditClient = supabase as unknown as AuditClient,
  limit = 100,
): Promise<VisibilityAuditResult> => {
  try {
    const { data, error } = await client
      .from("crm_audit_log")
      .select("id,owner_id,old_value,new_value,actor_id,actor_email,created_at")
      .eq("owner_type", "entrepreneur")
      .eq("field", "is_network_visible")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      const msg = error.message || "Historique indisponible.";
      return isDenied(msg) ? { state: "unauthorized" } : { state: "error", message: msg };
    }

    const rows = (data as any[]) || [];
    if (!rows.length) return { state: "ok", entries: [] };

    // Seul le nom d'entreprise est récupéré : aucune autre colonne du profil.
    const ids = [...new Set(rows.map((r) => String(r.owner_id)).filter(Boolean))];
    const names = new Map<string, string | null>();
    if (ids.length) {
      const { data: ents } = await client.from("entrepreneurs").select("id,company").in("id", ids);
      ((ents as any[]) || []).forEach((e) => {
        names.set(String(e.id), (e.company || "").trim() || null);
      });
    }

    return {
      state: "ok",
      entries: rows.map((r) => ({
        id: String(r.id),
        entrepreneurId: String(r.owner_id),
        company: names.get(String(r.owner_id)) ?? null,
        from: toBool(r.old_value),
        to: toBool(r.new_value),
        actor: (r.actor_email || "").trim() || (r.actor_id ? String(r.actor_id) : null),
        at: String(r.created_at),
      })),
    };
  } catch (err) {
    const msg = (err as Error)?.message || "Historique indisponible.";
    return isDenied(msg) ? { state: "unauthorized" } : { state: "error", message: msg };
  }
};

/** Libellé lisible d'un état de visibilité. */
export const visibilityLabel = (v: boolean | null): string =>
  v === true ? "Visible" : v === false ? "Masqué" : "Inconnu";

/** Date/heure formatée pour l'affichage administrateur. */
export const formatAuditDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-CA", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
};

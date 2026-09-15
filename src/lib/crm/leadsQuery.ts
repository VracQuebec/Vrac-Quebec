// ============================================================
// CRM — REQUÊTE PAGINÉE DES LEADS (côté serveur)
// ------------------------------------------------------------
// Les filtres, le tri et la pagination sont exécutés par la base de
// données (index dédiés), afin de ne jamais charger toute la liste
// dans le navigateur. Lecture seule : aucune écriture.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { applyServerOrder, isClientOnlySort, pageRange, type LeadSort } from "./leadSort";

/** Valeurs brutes historiques considérées comme « remblai ». */
export const REMBLAI_TYPE_VALUES = [
  "remblai", "depot", "dépôt", "remblai / dépôt", "remblai / depot", "remblai_disposition",
];

export interface LeadFilters {
  status: string;
  type: string;
  source: string;
  priority: string;
  assigned: string;
  material: string;
  dateFrom: string;
  dateTo: string;
  search: string;
  /** Filtre « voyages » calculé à partir d'un texte libre : non délégable à la base. */
  trips: string;
}

export const emptyFilters = (): LeadFilters => ({
  status: "all", type: "all", source: "all", priority: "all", assigned: "all",
  material: "all", dateFrom: "", dateTo: "", search: "", trips: "all",
});

/**
 * Vrai quand le tri ou les filtres demandés ne peuvent pas être exécutés par
 * la base (valeurs calculées) : la page bascule alors en mode client.
 */
export const needsClientMode = (filters: LeadFilters, sort: LeadSort): boolean =>
  isClientOnlySort(sort) || filters.trips !== "all";

export const LEADS_PAGE_SIZE = 50;

export async function fetchLeadsPage(
  filters: LeadFilters, sort: LeadSort, page: number, pageSize = LEADS_PAGE_SIZE,
): Promise<{ rows: any[]; total: number }> {
  let query: any = supabase.from("submissions").select("*", { count: "exact" });

  if (filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.source !== "all") query = query.eq("lead_source", filters.source);
  if (filters.priority !== "all") {
    query = filters.priority === "normal"
      ? query.or("priority.is.null,priority.eq.normal")
      : query.eq("priority", filters.priority);
  }
  if (filters.assigned !== "all") {
    query = filters.assigned === "none"
      ? query.is("assigned_entrepreneur", null)
      : query.eq("assigned_entrepreneur", filters.assigned);
  }
  if (filters.material !== "all") query = query.contains("materials", [filters.material]);
  if (filters.type !== "all") {
    const list = `(${REMBLAI_TYPE_VALUES.map((v) => `"${v}"`).join(",")})`;
    query = filters.type === "remblai"
      ? query.in("request_type", REMBLAI_TYPE_VALUES)
      : query.or(`request_type.is.null,request_type.not.in.${list}`);
  }
  // Le filtre « Du / Au » limite la période; il n'influence jamais l'ordre.
  if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00`);
  if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59`);

  const q = filters.search.trim();
  if (q) {
    const esc = q.replace(/[,()]/g, " ");
    query = query.or(
      ["dompe_number", "name", "address", "postal_code", "email", "phone"]
        .map((c) => `${c}.ilike.%${esc}%`).join(","),
    );
  }

  query = applyServerOrder(query, sort);
  const [from, to] = pageRange(page, pageSize);
  const { data, error, count } = await query.range(from, to);
  if (error) throw error;
  return { rows: (data as any[]) ?? [], total: count ?? 0 };
}

// ============================================================
// RÉFÉRENTIEL TERRITORIAL — VRAC QUÉBEC (Phase 4)
// ------------------------------------------------------------
// Accès en lecture au référentiel géographique central et à la
// matrice TERRITOIRE × SERVICE. Aucune donnée client n'est
// exposée : seuls des agrégats et les demandes internes (RLS
// admin) sont lus. Les adresses d'origine ne sont jamais
// modifiées par ce module.
// ============================================================
import { supabase } from "@/integrations/supabase/client";

export type Territory = {
  id: string;
  name: string;
  normalized_name: string;
  type: string;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  seo_city_slug: string | null;
  request_count: number;
  notes: string | null;
};

export type TerritoryService = {
  territory_id: string;
  service_key: string;
  status: "ACTIVE" | "PARTIELLE" | "NON_CONFIGUREE" | "A_VALIDER";
  request_count: number;
};

export type ServiceDef = {
  service_key: string;
  label: string;
  category: "A_OFFERT" | "B_MISE_EN_RELATION" | "C_CONNEXE" | "D_EDITORIAL";
  description: string | null;
  sort_order: number;
};

export type QueueItem = {
  id: string;
  raw_city: string;
  request_count: number;
  status: string;
  created_at: string;
};

export const SERVICE_CATEGORY_LABELS: Record<ServiceDef["category"], string> = {
  A_OFFERT: "Service réellement offert",
  B_MISE_EN_RELATION: "Mise en relation",
  C_CONNEXE: "Service connexe",
  D_EDITORIAL: "Contenu éditorial seulement",
};

export const MATRIX_STATUS_LABELS: Record<TerritoryService["status"], string> = {
  ACTIVE: "Active",
  PARTIELLE: "Partielle",
  NON_CONFIGUREE: "Non configurée",
  A_VALIDER: "À valider",
};

export async function fetchServices(): Promise<ServiceDef[]> {
  const { data, error } = await supabase
    .from("geo_services")
    .select("service_key,label,category,description,sort_order")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as ServiceDef[];
}

export async function fetchTerritories(): Promise<Territory[]> {
  const { data, error } = await supabase
    .from("geo_territories")
    .select("id,name,normalized_name,type,region,latitude,longitude,status,seo_city_slug,request_count,notes")
    .order("request_count", { ascending: false })
    .order("name");
  if (error) throw error;
  return (data ?? []) as Territory[];
}

export async function fetchMatrix(): Promise<TerritoryService[]> {
  const rows: TerritoryService[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from("geo_territory_services")
      .select("territory_id,service_key,status,request_count")
      .range(from, from + page - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as TerritoryService[]));
    if (!data || data.length < page) break;
  }
  return rows;
}

export async function fetchQueue(): Promise<QueueItem[]> {
  const { data, error } = await supabase
    .from("geo_territory_queue")
    .select("id,raw_city,request_count,status,created_at")
    .eq("status", "pending")
    .order("request_count", { ascending: false });
  if (error) throw error;
  return (data ?? []) as QueueItem[];
}

export type TerritoryDetail = {
  total: number;
  byRequestType: { key: string; n: number }[];
  byStatus: { key: string; n: number }[];
  byMaterial: { key: string; n: number }[];
  byMonth: { key: string; n: number }[];
};

function tally(values: (string | null | undefined)[]): { key: string; n: number }[] {
  const map = new Map<string, number>();
  for (const raw of values) {
    const key = raw && String(raw).trim() ? String(raw).trim() : "Non précisé";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
}

export async function fetchTerritoryDetail(territoryId: string): Promise<TerritoryDetail> {
  const { data, error } = await supabase
    .from("submissions")
    .select("request_type,service_type,status,materials,created_at")
    .eq("territory_id", territoryId)
    .limit(2000);
  if (error) throw error;
  const rows = data ?? [];
  const materials: string[] = [];
  for (const r of rows) for (const m of ((r.materials as string[] | null) ?? [])) materials.push(m);
  return {
    total: rows.length,
    byRequestType: tally(rows.map((r) => r.service_type || r.request_type)),
    byStatus: tally(rows.map((r) => r.status)),
    byMaterial: tally(materials).slice(0, 12),
    byMonth: tally(rows.map((r) => String(r.created_at ?? "").slice(0, 7))).sort((a, b) =>
      a.key.localeCompare(b.key),
    ),
  };
}

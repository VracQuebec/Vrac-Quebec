// CRM privé par entreprise. La sécurité est appliquée par la base
// (fonctions entcrm_can_* + RLS). L'entreprise choisie ici ne fait
// jamais autorité : elle est revalidée par le serveur à chaque requête.
import { supabase } from "@/integrations/supabase/client";

export const STAGES = [
  { v: "nouveau", l: "Nouveau" }, { v: "a_contacter", l: "À contacter" }, { v: "qualification", l: "Qualification" },
  { v: "visite", l: "Visite à planifier" }, { v: "soumission_a_preparer", l: "Soumission à préparer" },
  { v: "soumission_remise", l: "Soumission remise" }, { v: "relance", l: "Relance" },
  { v: "gagne", l: "Gagné" }, { v: "perdu", l: "Perdu" },
] as const;
export const SOURCES = [
  { v: "appel", l: "Appel" }, { v: "reference", l: "Référence" }, { v: "facebook", l: "Facebook" },
  { v: "site", l: "Site de l'entrepreneur" }, { v: "courriel", l: "Courriel" }, { v: "import", l: "Import" },
  { v: "vrac_quebec", l: "Vrac Québec" }, { v: "autre", l: "Autre" },
] as const;
export const TRADES: Record<string, { l: string; fields: { k: string; l: string }[] }> = {
  transport: { l: "Transport en vrac", fields: [{ k: "materiaux", l: "Matériaux" }, { k: "origine", l: "Origine" }, { k: "destination", l: "Destination" }, { k: "camion", l: "Camion requis" }, { k: "quantite", l: "Quantité (unité déclarée)" }, { k: "acces", l: "Accès" }] },
  excavation: { l: "Excavation", fields: [{ k: "travaux", l: "Nature des travaux" }, { k: "dimensions", l: "Dimensions / profondeur déclarées" }, { k: "machinerie", l: "Machinerie" }, { k: "deblais", l: "Déblais" }, { k: "acces", l: "Accès" }] },
  paysager: { l: "Aménagement paysager", fields: [{ k: "surfaces", l: "Surfaces" }, { k: "preparation", l: "Préparation" }, { k: "terre", l: "Terre / nivellement" }, { k: "drainage", l: "Drainage" }] },
  pavage: { l: "Pavage / asphalte", fields: [{ k: "surfaces", l: "Surfaces" }, { k: "fondation", l: "Fondation granulaire" }, { k: "epaisseur", l: "Épaisseurs prévues" }] },
  deneigement: { l: "Déneigement", fields: [{ k: "sites", l: "Sites" }, { k: "saison", l: "Saison" }, { k: "frequence", l: "Fréquence" }, { k: "equipement", l: "Équipements" }] },
  autre: { l: "Autre métier", fields: [{ k: "details", l: "Détails" }] },
};
export const label = (list: readonly { v: string; l: string }[], v?: string | null) => list.find((x) => x.v === v)?.l ?? v ?? "—";

export type Company = { id: string; name: string };

export async function resolveCompanies(isAdmin: boolean, supportUserId?: string | null): Promise<Company[]> {
  if (isAdmin && supportUserId) {
    const { data } = await supabase.from("jsc_company_members").select("company_id, jsc_companies(id,name)")
      .eq("user_id", supportUserId).eq("is_active", true).is("archived_at", null);
    return ((data ?? []) as any[]).map((r) => r.jsc_companies).filter(Boolean);
  }
  if (!isAdmin) { await supabase.rpc("fleet_ensure_my_company"); }
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const { data } = await supabase.from("jsc_company_members").select("company_id, jsc_companies(id,name)")
    .eq("user_id", u.user.id).eq("is_active", true).is("archived_at", null);
  return ((data ?? []) as any[]).map((r) => r.jsc_companies).filter(Boolean);
}

export type Line = { desc: string; qty: number; unit: string; price: number };
export const quoteSubtotal = (lines: Line[]) => lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.price) || 0), 0);

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
}
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const split = (l: string) => (l.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"').trim()).slice(0, -1);
  const head = split(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((l) => { const c = split(l); return Object.fromEntries(head.map((h, i) => [h, c[i] ?? ""])); });
}
export const normalize = (s?: string | null) => (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9@]/g, "");

// Prestations privées, modèles métier et documents du CRM entreprise.
// Aucun prix ni rendement n'est inventé : quantités et prix des modèles restent vides.
import { supabase } from "@/integrations/supabase/client";
const db = supabase as any;

export const UNITS = [
  { v: "heure", l: "Heure" }, { v: "voyage", l: "Voyage" }, { v: "tonne", l: "Tonne" }, { v: "m3", l: "m³" },
  { v: "m2", l: "m²" }, { v: "ml", l: "Mètre linéaire" }, { v: "unite", l: "Unité" }, { v: "forfait", l: "Forfait" },
] as const;
export const unitLabel = (v?: string | null) => UNITS.find((u) => u.v === v)?.l ?? v ?? "";

export const FILE_CATEGORIES = [
  { v: "avant_travaux", l: "Avant travaux" }, { v: "apres_travaux", l: "Après travaux" }, { v: "plan", l: "Plan" },
  { v: "devis", l: "Devis" }, { v: "bon_livraison", l: "Bon de livraison" }, { v: "billet_pesee", l: "Billet de pesée" }, { v: "autre", l: "Autre" },
] as const;
export const FILE_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", pdf: "application/pdf" };
export const FILE_MAX = 20 * 1024 * 1024;
export const FILE_ACCEPT = ".jpg,.jpeg,.png,.webp,.heic,.pdf,image/jpeg,image/png,image/webp,image/heic,application/pdf";

/** Ligne de soumission : les valeurs sont figées au moment de l'ajout. */
export type QLine = { desc: string; qty: number | null; unit: string; price: number | null; section?: string; service_id?: string | null; price_at?: string | null; disc_pct?: number | null; tax?: "taxable" | "detaxe" | "exonere" | "a_determiner" | null };

export const DEFAULT_TEMPLATES: { trade: string; name: string; lines: QLine[]; inclusions: string; exclusions: string; conditions: string }[] = [
  { trade: "transport", name: "Transport de matériaux / location de camion", inclusions: "Transport entre l'origine et la destination indiquées.", exclusions: "Frais de disposition, attente au-delà du temps prévu.", conditions: "Quantités à confirmer à la livraison (billets de pesée).",
    lines: [{ section: "Transport", desc: "Camion (à l'heure ou au voyage)", qty: null, unit: "heure", price: null }, { section: "Fourniture", desc: "Matériau fourni et livré", qty: null, unit: "tonne", price: null }, { section: "Frais", desc: "Mobilisation", qty: null, unit: "forfait", price: null }] },
  { trade: "excavation", name: "Excavation et évacuation de déblais", inclusions: "Excavation selon plan fourni.", exclusions: "Roc, sols contaminés, permis.", conditions: "Volume réel mesuré au chantier.",
    lines: [{ section: "Machinerie", desc: "Excavatrice avec opérateur", qty: null, unit: "heure", price: null }, { section: "Main-d'œuvre", desc: "Manœuvre", qty: null, unit: "heure", price: null }, { section: "Évacuation", desc: "Transport des déblais", qty: null, unit: "voyage", price: null }, { section: "Évacuation", desc: "Frais de disposition", qty: null, unit: "voyage", price: null }] },
  { trade: "paysager", name: "Aménagement paysager / préparation de terrain", inclusions: "", exclusions: "", conditions: "",
    lines: [{ section: "Préparation", desc: "Nivellement", qty: null, unit: "m2", price: null }, { section: "Préparation", desc: "Drainage", qty: null, unit: "ml", price: null }, { section: "Fourniture", desc: "Terre / matériau", qty: null, unit: "m3", price: null }] },
  { trade: "pavage", name: "Pavage et fondation", inclusions: "", exclusions: "", conditions: "",
    lines: [{ section: "Fondation", desc: "Fondation granulaire", qty: null, unit: "tonne", price: null }, { section: "Asphalte", desc: "Préparation et pose d'asphalte", qty: null, unit: "m2", price: null }] },
  { trade: "deneigement", name: "Déneigement / transport de neige", inclusions: "", exclusions: "", conditions: "Saison et fréquence à préciser.",
    lines: [{ section: "Déneigement", desc: "Déneigement du site", qty: null, unit: "forfait", price: null }, { section: "Transport", desc: "Transport de neige", qty: null, unit: "voyage", price: null }] },
  { trade: "autre", name: "Travaux ou machinerie personnalisés", inclusions: "", exclusions: "", conditions: "",
    lines: [{ section: "Travaux", desc: "Prestation à définir", qty: null, unit: "unite", price: null }] },
];

/** Copie les modèles de départ dans l'entreprise s'il n'en existe aucun. */
export async function ensureTemplates(companyId: string) {
  const { count } = await db.from("ent_crm_templates").select("id", { count: "exact", head: true }).eq("company_id", companyId);
  if (count) return;
  await db.from("ent_crm_templates").insert(DEFAULT_TEMPLATES.map((t) => ({ ...t, company_id: companyId })));
}

export const lineTotal = (l: QLine) => (l.qty == null || l.price == null) ? null : Number(l.qty) * Number(l.price);
export const subtotal = (lines: QLine[]) => lines.reduce((s, l) => s + (lineTotal(l) ?? 0), 0);
export const incomplete = (lines: QLine[]) => lines.filter((l) => l.qty == null || l.price == null).length;

/** Relie des fichiers existants à un autre dossier (aucune copie). */
export async function copyLinks(companyId: string, from: { t: string; id: string }[], to: { t: string; id: string }) {
  for (const f of from) {
    const { data } = await db.from("ent_crm_file_links").select("file_id").eq("company_id", companyId).eq("owner_type", f.t).eq("owner_id", f.id);
    const rows = (data ?? []).map((r: any) => ({ company_id: companyId, file_id: r.file_id, owner_type: to.t, owner_id: to.id }));
    if (rows.length) await db.from("ent_crm_file_links").upsert(rows, { onConflict: "file_id,owner_type,owner_id", ignoreDuplicates: true });
  }
}

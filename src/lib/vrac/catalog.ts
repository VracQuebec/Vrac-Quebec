// ============================================================
// CATALOGUE — Achat de matériaux en vrac (Vrac Québec)
// Structure évolutive : chaque matériau est décrit ici comme il le sera
// plus tard côté administration (nom, description, usages, photo, ordre,
// statut actif, puis prix/fournisseur/adresse de chargement).
// Aucun calcul, aucun prix : uniquement le parcours utilisateur.
// ============================================================
import terreTamisee from "@/assets/materials/v4/terre-tamisee.jpg";
import sable from "@/assets/materials/v4/sable.jpg";
import sableCompaction from "@/assets/materials/v4/sable-compaction.jpg";
import pierre034 from "@/assets/materials/v4/pierre-0-34.jpg";
import pierre34Net from "@/assets/materials/v4/pierre-34-net.jpg";
import poussierePierre from "@/assets/materials/v4/poussiere-pierre.jpg";

export type VracMaterial = {
  /** Identifiant technique stable (ne jamais renommer). */
  id: string;
  name: string;
  description: string;
  /** Principales utilisations affichées sur la carte. */
  uses: string[];
  image: string;
  sort_order: number;
  is_active: boolean;
  // Champs administrables prévus pour les prochaines étapes (non utilisés ici).
  price_per_tonne?: number | null;
  supplier_id?: string | null;
  pickup_address?: string | null;
};

/** Catalogue courant. L'ajout d'un matériau ne demande aucune modification du parcours. */
export const VRAC_MATERIALS: VracMaterial[] = [
  {
    id: "terre_tamisee",
    name: "Terre tamisée",
    description: "Idéale pour la préparation de pelouses et de jardins.",
    uses: ["Pelouse", "Jardin"],
    image: terreTamisee,
    sort_order: 1,
    is_active: true,
  },
  {
    id: "sable",
    name: "Sable",
    description: "Pour la piscine et divers aménagements.",
    uses: ["Piscine", "Aménagement"],
    image: sable,
    sort_order: 2,
    is_active: true,
  },
  {
    id: "sable_compaction",
    name: "Sable à compaction",
    description: "Idéal pour les bases de pavé uni et les travaux nécessitant une excellente compaction.",
    uses: ["Pavé uni", "Base compactée"],
    image: sableCompaction,
    sort_order: 3,
    is_active: true,
  },
  {
    id: "pierre_0_34",
    name: "Pierre concassée 0-3/4",
    description: "Parfaite pour les entrées et les fondations.",
    uses: ["Entrée", "Fondation"],
    image: pierre034,
    sort_order: 4,
    is_active: true,
  },
  {
    id: "pierre_34_net",
    name: "Pierre concassée 3/4 net",
    description: "Idéale pour le drainage et les drains français.",
    uses: ["Drainage", "Drain français"],
    image: pierre34Net,
    sort_order: 5,
    is_active: true,
  },
  {
    id: "poussiere_pierre",
    name: "Poussière de pierre",
    description: "Parfaite comme lit de pose pour le pavé uni et les dalles.",
    uses: ["Pavé uni", "Dalles"],
    image: poussierePierre,
    sort_order: 6,
    is_active: true,
  },
];

/** Source unique du parcours : seuls les matériaux actifs, dans l'ordre d'affichage. */
export function getActiveVracMaterials(): VracMaterial[] {
  return VRAC_MATERIALS.filter((m) => m.is_active).sort((a, b) => a.sort_order - b.sort_order);
}

export function findVracMaterial(id: string | null): VracMaterial | null {
  return id ? VRAC_MATERIALS.find((m) => m.id === id) ?? null : null;
}

// ---------- État du parcours (sauvegarde automatique) ----------
export const VRAC_DRAFT_KEY = "vq_achat_vrac_draft_v1";

export type VracDraft = {
  materialId: string | null;
  quantityMode: "tonnes" | "voyages" | "dimensions" | "inconnu";
  tonnes: string;
  trips: string;
  dims: { length: string; width: string; depth: string };
  address: string;
  addressNotes: string;
  dateMode: "precise" | "flexible" | "urgent";
  date: string;
  contact: { name: string; phone: string; email: string; company: string; comments: string };
};

export const EMPTY_VRAC_DRAFT: VracDraft = {
  materialId: null,
  quantityMode: "tonnes",
  tonnes: "",
  trips: "",
  dims: { length: "", width: "", depth: "" },
  address: "",
  addressNotes: "",
  dateMode: "precise",
  date: "",
  contact: { name: "", phone: "", email: "", company: "", comments: "" },
};

export function loadVracDraft(): VracDraft {
  try {
    const raw = localStorage.getItem(VRAC_DRAFT_KEY);
    if (!raw) return EMPTY_VRAC_DRAFT;
    const parsed = JSON.parse(raw) as Partial<VracDraft>;
    return {
      ...EMPTY_VRAC_DRAFT,
      ...parsed,
      dims: { ...EMPTY_VRAC_DRAFT.dims, ...(parsed.dims ?? {}) },
      contact: { ...EMPTY_VRAC_DRAFT.contact, ...(parsed.contact ?? {}) },
    };
  } catch {
    return EMPTY_VRAC_DRAFT;
  }
}

export function saveVracDraft(draft: VracDraft) {
  try { localStorage.setItem(VRAC_DRAFT_KEY, JSON.stringify(draft)); } catch { /* stockage indisponible */ }
}

export function clearVracDraft() {
  try { localStorage.removeItem(VRAC_DRAFT_KEY); } catch { /* stockage indisponible */ }
}

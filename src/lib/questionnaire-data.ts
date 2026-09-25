import terreImg from "@/assets/terre.webp";
import sableImg from "@/assets/sable.webp";
import rocheImg from "@/assets/roche.webp";
import rocheConcasseeImg from "@/assets/roche-concassee.webp";
import remplissageImg from "@/assets/remplissage.webp";
import truck10 from "@/assets/truck-10-wheels.webp";
import truck12 from "@/assets/truck-12-wheels.webp";
import truckSemi from "@/assets/truck-semi.webp";
import projectEntree from "@/assets/project-entree.webp";
import projectFondation from "@/assets/project-fondation.webp";
import projectAmenagement from "@/assets/project-amenagement.webp";
import projectRemplissage from "@/assets/project-remplissage.webp";

export const MATERIAL_TYPES = [
  { id: "terre", label: "Terre", image: terreImg },
  { id: "sable", label: "Sable", image: sableImg },
  { id: "roche", label: "Grosse roche / enrochement", image: rocheImg },
  { id: "roche-concassee", label: "Pierre concassée", image: rocheConcasseeImg },
  { id: "remplissage", label: "Remblai (économique)", image: remplissageImg },
  { id: "autre", label: "Autre", image: "" },
  { id: "ne-sais-pas", label: "Je ne sais pas", image: "" },
] as const;

export const PROJECT_TYPES = [
  { value: "Entrée / stationnement", emoji: "🏡", image: projectEntree },
  { value: "Fondation / base (garage, cabanon, patio)", emoji: "🧱", image: projectFondation },
  { value: "Aménagement / terrain (nivelage, pelouse, jardin)", emoji: "🌿", image: projectAmenagement },
  { value: "Remplissage / remblai", emoji: "🚧", image: projectRemplissage },
  { value: "Autre", emoji: "✏️", image: null },
] as const;

export const PROJECT_SIZES = [
  "Petit (1 à 2 voyages)",
  "Moyen (3 à 6 voyages)",
  "Gros (6 voyages et +)",
  "Autre",
] as const;

export const DELIVERY_FLEXIBILITY_OPTIONS = [
  "Date exacte",
  "Flexible ± 1 jour",
  "Flexible ± 2 jours",
  "Flexible ± 3 jours",
  "Flexible ± 5 jours",
  "Flexible ± 1 semaine",
] as const;

export const TRUCK_ACCESS_OPTIONS = [
  { value: "6 roues", emoji: "🚚", image: null },
  { value: "10 roues", emoji: "🚛", image: truck10 },
  { value: "12 roues", emoji: "🚛", image: truck12 },
  { value: "Semi-remorque", emoji: "🚛", image: truckSemi },
  { value: "Je ne sais pas", emoji: "❓", image: null },
] as const;

export interface QuestionnaireData {
  materials: string[];
  /** CATALOGUE-02 : précisions explicites du catalogue central (facultatif). */
  materialSelections?: import("@/components/materials/RemblaiCatalogSelector").RemblaiSelection[];
  otherMaterial: string;
  propertyType: string;
  projectDescription: string;
  quantity: string;
  quantityOther: string;
  tonnage: string;
  budgetUnit: string;
  budgetMax: string;
  machineryAvailable: boolean | null;
  machineryDescription: string;
  accessibility: string[];
  address: string;
  postalCode: string;
  name: string;
  email: string;
  phone: string;
  description: string;
  lengthFt: string;
  widthFt: string;
  depthIn: string;
  deliverOrRemove: string;
  contamination: string;
  photos: string[];
  deliveryDeadline: string;
  deliveryTimeframe: string;
  machineryList: string[];
  deliveryFlexibility: string;
  materialQuantities: Record<string, string>;
  /** Point 30 — vérification d'accès au chantier (optionnel). */
  accessHeavyTruck: string;
  accessDetails: string[];
}

export const initialFormData: QuestionnaireData = {
  materials: [],
  materialSelections: [],
  otherMaterial: "",
  propertyType: "",
  projectDescription: "",
  quantity: "",
  quantityOther: "",
  tonnage: "",
  budgetUnit: "/ voyage",
  budgetMax: "",
  machineryAvailable: null,
  machineryDescription: "",
  accessibility: [],
  address: "",
  postalCode: "",
  name: "",
  email: "",
  phone: "",
  description: "",
  lengthFt: "",
  widthFt: "",
  depthIn: "",
  deliverOrRemove: "",
  contamination: "",
  photos: [],
  deliveryDeadline: "",
  deliveryTimeframe: "",
  machineryList: [],
  accessHeavyTruck: "",
  accessDetails: [],
  deliveryFlexibility: "",
  materialQuantities: {},
};

// ---- Simplified Remblai form (Microsoft Forms style) ----
export const REMBLAI_MATERIAL_OPTIONS = [
  "Terre",
  "Terre mélangée",
  "Sable",
  "Pierre concassée 0-3/4",
  "Pierre concassée 3/4 net",
  "Poussière de pierre",
  "Gravier",
  "Roches",
  "Béton",
  "Asphalte",
  "Souches",
  "Autre",
  "Je ne suis pas certain",
] as const;

/** Anciens libellés conservés pour la rétrocompatibilité des données existantes. */
export const REMBLAI_MATERIAL_LEGACY = ["Pierre"] as const;

import matTerre from "@/assets/materials/v4/terre.jpg";
import matTerreMelangee from "@/assets/materials/v4/terre-melangee.jpg";
import matSable from "@/assets/materials/v4/sable.jpg";
import matPierre034 from "@/assets/materials/v4/pierre-0-34.jpg";
import matPierre34Net from "@/assets/materials/v4/pierre-34-net.jpg";
import matPoussiere from "@/assets/materials/v4/poussiere-pierre.jpg";
import matGravier from "@/assets/materials/v4/gravier.jpg";
import matRoches from "@/assets/materials/v4/roches.jpg";
import matBeton from "@/assets/materials/v4/beton.jpg";
import matAsphalte from "@/assets/materials/v4/asphalte.jpg";
import matSouches from "@/assets/materials/v4/souches.jpg";
import matAutre from "@/assets/materials/autre.webp";

/** Photo représentative pour chaque type de matériel (affichage seulement). */
export const REMBLAI_MATERIAL_IMAGES: Record<string, string> = {
  "Terre": matTerre,
  "Terre mélangée": matTerreMelangee,
  "Sable": matSable,
  "Pierre concassée 0-3/4": matPierre034,
  "Pierre concassée 3/4 net": matPierre34Net,
  "Poussière de pierre": matPoussiere,
  "Pierre": matPierre034,
  "Gravier": matGravier,
  "Roches": matRoches,
  "Béton": matBeton,
  "Asphalte": matAsphalte,
  "Souches": matSouches,
  "Autre": matAutre,
  "Je ne suis pas certain": matAutre,
};

/** Courte description affichée sous chaque matériau. */
export const REMBLAI_MATERIAL_DESCRIPTIONS: Record<string, string> = {
  "Terre": "Terre propre.",
  "Terre mélangée": "Terre avec pierres ou sable.",
  "Sable": "Sable propre.",
  "Pierre concassée 0-3/4": "Résidus de pierre concassée.",
  "Pierre concassée 3/4 net": "Résidus de pierre concassée.",
  "Poussière de pierre": "Poussière ou fines.",
  "Pierre": "Résidus de pierre concassée.",
  "Gravier": "Gravier ou petits cailloux.",
  "Roches": "Grosses roches.",
  "Béton": "Béton à recycler.",
  "Asphalte": "Asphalte à recycler.",
  "Souches": "Souches et racines.",
  "Autre": "Matériau non listé.",
  "Je ne suis pas certain": "Nous vous aiderons à l'identifier.",
};

/** Regroupement par catégorie (ordre d'affichage). */
export const REMBLAI_MATERIAL_CATEGORIES: { title: string; materials: string[] }[] = [
  {
    title: "Matériaux naturels",
    materials: [
      "Terre",
      "Terre mélangée",
      "Sable",
      "Pierre concassée 0-3/4",
      "Pierre concassée 3/4 net",
      "Poussière de pierre",
      "Gravier",
      "Roches",
    ],
  },
  { title: "Matériaux recyclés", materials: ["Béton", "Asphalte"] },
  { title: "Végétaux", materials: ["Souches"] },
  { title: "Divers", materials: ["Autre", "Je ne suis pas certain"] },
];

export const REMBLAI_TRUCK_OPTIONS = [
  "Camion 6 roues",
  "Camion 10 roues",
  "Camion 12 roues",
  "Semi-Remorque 2 essieux",
  "Semi-Remorque 3 essieux",
  "Semi-Remorque 4 essieux",
  "Je ne sais pas",
] as const;

export const REMBLAI_MACHINERY_OPTIONS = [
  "Pelle mécanique",
  "Bulldozer",
  "Tracteur",
  "Aucune",
  "Autre",
] as const;

export const REMBLAI_TIMEFRAME_OPTIONS = [
  "Le plus rapidement possible",
  "Cette semaine",
  "Dans les prochaines semaines",
  "Flexible",
  "Je ne sais pas",
] as const;

// ---- Point 30 — vérification d'accès au chantier ----
export const ACCESS_HEAVY_TRUCK_OPTIONS = [
  "Oui, un camion lourd peut entrer",
  "Probablement, à valider",
  "Non, accès restreint",
  "Je ne sais pas",
] as const;

export const ACCESS_DETAIL_OPTIONS = [
  "Pente prononcée",
  "Fils électriques bas",
  "Branches d'arbres basses",
  "Sol mou ou boueux",
  "Espace de recul limité",
  "Demi-tour possible sur le terrain",
  "Entrée asphaltée ou pavée",
  "Voisinage rapproché",
] as const;

// ---- Parcours /remblai et /depot-materiaux ----
/** Usage du matériel — source unique pour les parcours publics. */
export const PROJECT_USAGE_OPTIONS = [
  "Remplir un trou",
  "Monter mon terrain",
  "Faire une entrée",
  "Faire du nivellement",
  "Faire une pelouse",
  "Faire du drainage",
  "Faire une fondation",
  "Installer ou préparer une piscine",
  "Autre",
  "Je ne sais pas",
] as const;

/** Unités acceptées pour une quantité approximative. */
export const QUANTITY_UNIT_OPTIONS = [
  { value: "voyages", label: "voyages de camion" },
  { value: "tonnes", label: "tonnes" },
  { value: "verges", label: "verges³" },
  { value: "m3", label: "m³" },
] as const;

/** Catégories de photos guidées (aucune n'est obligatoire). */
export const PHOTO_CATEGORIES = [
  "Entrée du terrain",
  "Chemin / voie d'accès",
  "Zone de recul ou de manœuvre",
  "Zone de déchargement",
  "Autre photo",
] as const;

/** Réponse simple sur l'accès d'un camion lourd. */
export const ACCESS_TRUCK_SIMPLE_OPTIONS = [
  "Oui",
  "Probablement",
  "Je ne sais pas",
  "Accès difficile / non",
] as const;

// Materials that trigger the "remblai / dépôt / matériel à sortir" special form
export const REMBLAI_MATERIAL_IDS = ["remplissage"];
export const REMBLAI_PROJECT_TYPES = ["Remplissage / remblai"];

export const isRemblaiRequest = (materials: string[], projectType?: string) =>
  materials.some((m) => REMBLAI_MATERIAL_IDS.includes(m)) ||
  (!!projectType && REMBLAI_PROJECT_TYPES.includes(projectType));

export const detectRequestType = (materials: string[], projectType?: string): string =>
  isRemblaiRequest(materials, projectType) ? "remblai" : "vrac";

export const LEAD_STATUSES = [
  { value: "nouveau", label: "Nouveau", color: "bg-primary text-primary-foreground" },
  { value: "à rappeler", label: "À rappeler", color: "bg-amber-500 text-white" },
  { value: "message texte envoyé", label: "Message texte envoyé", color: "bg-sky-500 text-white" },
  { value: "soumission envoyée", label: "Soumission envoyée", color: "bg-indigo-500 text-white" },
  { value: "soumission acceptée", label: "Soumission acceptée", color: "bg-violet-500 text-white" },
  { value: "en attente de livraison", label: "En attente de livraison", color: "bg-blue-500 text-white" },
  { value: "en attente de paiement", label: "En attente de paiement", color: "bg-teal-600 text-white" },
  { value: "paiement effectué", label: "Paiement effectué", color: "bg-emerald-600 text-white" },
  { value: "perdu", label: "Perdu", color: "bg-rose-600 text-white" },
  { value: "archivé", label: "Archivé", color: "bg-slate-500 text-white" },
] as const;

export const LEAD_PRIORITIES = [
  { value: "normal", label: "Normal", color: "bg-slate-200 text-slate-800" },
  { value: "urgent", label: "Urgent", color: "bg-red-600 text-white" },
] as const;

export const REQUEST_TYPES = [
  { value: "vrac", label: "Vrac", color: "bg-primary/15 text-primary border-primary/30" },
  { value: "remblai", label: "Remblai", color: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
] as const;

/**
 * Le type d'une demande découle uniquement du formulaire d'origine :
 * formulaire de remblai → « Remblai », calculateur de vrac → « Vrac ».
 * Les anciennes valeurs (livraison, dépôt, entrepreneur…) sont ramenées
 * sur ces deux catégories pour l'affichage et les filtres.
 */
export const normalizeRequestType = (value?: string | null): "vrac" | "remblai" => {
  const v = (value ?? "").toString().trim().toLowerCase();
  return ["remblai", "depot", "dépôt", "remblai / dépôt", "remblai / depot", "remblai_disposition"].includes(v)
    ? "remblai"
    : "vrac";
};

export const requestTypeMeta = (value?: string | null) => {
  const key = normalizeRequestType(value);
  return REQUEST_TYPES.find((t) => t.value === key) ?? REQUEST_TYPES[0];
};

export const CONTAMINATION_OPTIONS = ["Non", "Oui", "Je ne sais pas"] as const;

// Type de service choisi à l'entrée du parcours « Obtenir mon prix ».
export const SERVICE_TYPES = [
  { value: "remblai_disposition", label: "Départir du remblai", color: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  { value: "materiel_remplissage", label: "Matériel de remplissage", color: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  { value: "vrac_achat", label: "Matériaux en vrac", color: "bg-primary/15 text-primary border-primary/30" },
] as const;

export const serviceTypeMeta = (value?: string | null) =>
  SERVICE_TYPES.find((s) => s.value === value) ?? null;

export const DELIVER_OR_REMOVE_OPTIONS = ["À livrer", "À sortir du chantier"] as const;

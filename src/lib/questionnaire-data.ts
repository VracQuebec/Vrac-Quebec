import terreImg from "@/assets/terre.jpg";
import sableImg from "@/assets/sable.jpg";
import rocheImg from "@/assets/roche.jpg";
import rocheConcasseeImg from "@/assets/roche-concassee.jpg";
import remplissageImg from "@/assets/remplissage.jpg";
import truck10 from "@/assets/truck-10-wheels.png";
import truck12 from "@/assets/truck-12-wheels.png";
import truckSemi from "@/assets/truck-semi.png";
import projectEntree from "@/assets/project-entree.jpg";
import projectFondation from "@/assets/project-fondation.jpg";
import projectAmenagement from "@/assets/project-amenagement.jpg";
import projectRemplissage from "@/assets/project-remplissage.jpg";

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
  { value: "10 roues", emoji: "🚛", image: truck10 },
  { value: "12 roues", emoji: "🚛", image: truck12 },
  { value: "Semi-remorque", emoji: "🚛", image: truckSemi },
  { value: "Je ne sais pas", emoji: "❓", image: null },
] as const;

export interface QuestionnaireData {
  materials: string[];
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
}

export const initialFormData: QuestionnaireData = {
  materials: [],
  otherMaterial: "",
  propertyType: "",
  projectDescription: "",
  quantity: "",
  quantityOther: "",
  tonnage: "",
  budgetUnit: "",
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
  deliveryFlexibility: "",
  materialQuantities: {},
};

// ---- Simplified Remblai form (Microsoft Forms style) ----
export const REMBLAI_MATERIAL_OPTIONS = [
  "Terre",
  "Terre mélangée",
  "Sable",
  "Gravier",
  "Pierre",
  "Roches",
  "Béton",
  "Asphalte",
  "Souches",
  "Autre",
] as const;

export const REMBLAI_TRUCK_OPTIONS = [
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

// Materials that trigger the "remblai / dépôt / matériel à sortir" special form
export const REMBLAI_MATERIAL_IDS = ["remplissage"];
export const REMBLAI_PROJECT_TYPES = ["Remplissage / remblai"];

export const isRemblaiRequest = (materials: string[], projectType?: string) =>
  materials.some((m) => REMBLAI_MATERIAL_IDS.includes(m)) ||
  (!!projectType && REMBLAI_PROJECT_TYPES.includes(projectType));

export const detectRequestType = (materials: string[], projectType?: string): string =>
  isRemblaiRequest(materials, projectType) ? "remblai" : "livraison";

export const LEAD_STATUSES = [
  { value: "nouveau", label: "Nouveau", color: "bg-orange-500 text-white" },
  { value: "à rappeler", label: "À rappeler", color: "bg-amber-500 text-white" },
  { value: "contacté", label: "Contacté", color: "bg-sky-500 text-white" },
  { value: "soumission envoyée", label: "Soumission envoyée", color: "bg-indigo-500 text-white" },
  { value: "en attente", label: "En attente", color: "bg-blue-500 text-white" },
  { value: "assigné", label: "Assigné", color: "bg-teal-600 text-white" },
  { value: "gagné", label: "Gagné", color: "bg-emerald-600 text-white" },
  { value: "perdu", label: "Perdu", color: "bg-rose-600 text-white" },
  { value: "archivé", label: "Archivé", color: "bg-slate-500 text-white" },
] as const;

export const LEAD_PRIORITIES = [
  { value: "normal", label: "Normal", color: "bg-slate-200 text-slate-800" },
  { value: "urgent", label: "Urgent", color: "bg-red-600 text-white" },
] as const;

export const REQUEST_TYPES = [
  { value: "livraison", label: "Livraison", color: "bg-primary/15 text-primary border-primary/30" },
  { value: "remblai", label: "Remblai / Dépôt", color: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  { value: "depot", label: "Matériel à sortir", color: "bg-purple-500/15 text-purple-700 border-purple-500/30" },
  { value: "entrepreneur", label: "Entrepreneur", color: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
] as const;

export const CONTAMINATION_OPTIONS = ["Non", "Oui", "Je ne sais pas"] as const;
export const DELIVER_OR_REMOVE_OPTIONS = ["À livrer", "À sortir du chantier"] as const;

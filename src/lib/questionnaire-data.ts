import terreImg from "@/assets/terre.jpg";
import sableImg from "@/assets/sable.jpg";
import rocheImg from "@/assets/roche.jpg";
import rocheConcasseeImg from "@/assets/roche-concassee.jpg";
import remplissageImg from "@/assets/remplissage.jpg";

export const MATERIAL_TYPES = [
  { id: "terre", label: "Terre", image: terreImg },
  { id: "sable", label: "Sable", image: sableImg },
  { id: "roche", label: "Roche", image: rocheImg },
  { id: "roche-concassee", label: "Roche concassée", image: rocheConcasseeImg },
  { id: "remplissage", label: "Matériel de remplissage", image: remplissageImg },
  { id: "autre", label: "Autre", image: "" },
] as const;

export const PROJECT_TYPES = [
  { value: "Entrée / stationnement", emoji: "🏡" },
  { value: "Fondation / base (garage, cabanon, patio)", emoji: "🧱" },
  { value: "Aménagement / terrain (nivelage, pelouse, jardin)", emoji: "🌿" },
  { value: "Remplissage / remblai", emoji: "🚧" },
  { value: "Je ne sais pas", emoji: "❓" },
] as const;

export const PROJECT_SIZES = [
  "Petit (1 à 3 voyages)",
  "Moyen (4 à 10 voyages)",
  "Gros (11 voyages et +)",
  "Je ne sais pas",
] as const;

export const TRUCK_ACCESS_OPTIONS = [
  { value: "10 roues", emoji: "🚛" },
  { value: "12 roues", emoji: "🚛" },
  { value: "Semi-remorque", emoji: "🚛" },
  { value: "Je ne sais pas", emoji: "❓" },
] as const;

export interface QuestionnaireData {
  materials: string[];
  otherMaterial: string;
  propertyType: string;
  quantity: string;
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
}

export const initialFormData: QuestionnaireData = {
  materials: [],
  otherMaterial: "",
  propertyType: "",
  quantity: "",
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
};

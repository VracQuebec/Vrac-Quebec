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

export const PROPERTY_TYPES = [
  "Résidentiel",
  "Commercial",
  "Industriel",
] as const;

export const TRIP_VOYAGE_OPTIONS = [
  "1 - 5 voyages",
  "5 - 10 voyages",
  "10 - 25 voyages",
  "25 - 50 voyages",
  "50 - 100 voyages",
  "100 - 500 voyages",
  "500+ voyages",
] as const;

export const TONNAGE_OPTIONS = [
  "Moins de 10 tonnes",
  "10 - 50 tonnes",
  "50 - 100 tonnes",
  "100 - 500 tonnes",
  "500 - 1000 tonnes",
  "1000+ tonnes",
] as const;

export const BUDGET_UNITS = [
  "Par voyage",
  "Par tonne",
] as const;

export const BUDGET_OPTIONS = [
  "Moins de 50 $",
  "50 - 100 $",
  "100 - 200 $",
  "200 - 500 $",
  "500 - 1000 $",
  "Plus de 1000 $",
] as const;

export const ACCESSIBILITY_OPTIONS = [
  "10 roues",
  "12 roues",
  "Semi-remorque 2 essieux",
  "Semi-remorque 3 essieux",
  "Semi-remorque 4 essieux",
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
};

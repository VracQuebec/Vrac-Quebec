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
  { value: "Je ne sais pas", emoji: "❓", image: null },
] as const;

export const PROJECT_SIZES = [
  "Petit (1 à 2 voyages)",
  "Moyen (3 à 6 voyages)",
  "Gros (6 voyages et +)",
  "Je ne sais pas",
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

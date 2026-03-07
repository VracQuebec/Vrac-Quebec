export const MATERIAL_TYPES = [
  { id: "terre", label: "Terre", icon: "🌍" },
  { id: "sable", label: "Sable", icon: "🏖️" },
  { id: "gravier", label: "Gravier", icon: "🪨" },
  { id: "roche-concassee", label: "Roche concassée", icon: "⛏️" },
  { id: "roche", label: "Roche", icon: "🏔️" },
  { id: "glaise", label: "Glaise", icon: "🧱" },
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

export const MACHINERY_OPTIONS = [
  "Oui, machinerie disponible",
  "Non, aucune machinerie",
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
  propertyType: string;
  quantity: string;
  tonnage: string;
  budgetUnit: string;
  budgetMax: string;
  machineryAvailable: string;
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
  propertyType: "",
  quantity: "",
  tonnage: "",
  budgetUnit: "",
  budgetMax: "",
  machineryAvailable: "",
  accessibility: [],
  address: "",
  postalCode: "",
  name: "",
  email: "",
  phone: "",
  description: "",
};

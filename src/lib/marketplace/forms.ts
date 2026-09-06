// ============================================================
// PLACE DE MARCHÉ — FORMULAIRES DYNAMIQUES (étapes 4 et 5)
// Les questions dépendent de la catégorie choisie. Aucun champ
// n'est obligatoire : le client peut toujours répondre « Je ne
// sais pas ». Les réponses sont stockées dans mkt_quote_requests.answers.
// ============================================================

export type FieldType = "texte" | "long" | "nombre" | "choix" | "multi" | "date" | "oui_non";

export interface DynamicField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  placeholder?: string;
  /** Aide courte affichée sous le champ. */
  hint?: string;
}

export interface CategoryForm {
  /** Slug de mkt_service_categories (niveau catégorie). */
  slug: string;
  label: string;
  /** Description simple affichée sur la carte de départ. */
  tagline: string;
  emoji: string;
  fields: DynamicField[];
}

export const UNKNOWN = "Je ne sais pas";

const oui_non_inconnu = [UNKNOWN, "Oui", "Non"];

const MATERIAUX = [
  UNKNOWN, "Terre végétale", "Terre de remplissage", "Terre tamisée", "Sable",
  "Sable à compaction", "Sable à béton", "Gravier", "MG-20", "MG-56",
  "Poussière de pierre", "Pierre nette", "Pierre concassée", "Pierre décorative",
  "Galet", "Roc", "Asphalte recyclé", "Béton recyclé", "Compost", "Paillis", "Autre",
];

const UNITES = [UNKNOWN, "Tonnes", "Verges cubes", "Mètres cubes", "Voyages"];
const CAMIONS = [UNKNOWN, "10 roues", "12 roues", "Semi-dompeur", "Peu importe"];
const CLIENTELE = ["Résidentiel", "Commercial", "Industriel", "Institutionnel", "Municipal"];

export const CATEGORY_FORMS: CategoryForm[] = [
  {
    slug: "transport-en-vrac",
    label: "Transport en vrac",
    tagline: "Terre, sable, gravier, pierre, asphalte, neige…",
    emoji: "🚛",
    fields: [
      { key: "materiau", label: "Matériau à transporter", type: "choix", options: MATERIAUX },
      { key: "quantite", label: "Quantité approximative", type: "texte", placeholder: "Ex. 18 tonnes" },
      { key: "unite", label: "Unité", type: "choix", options: UNITES },
      { key: "adresse_chargement", label: "Adresse de chargement", type: "texte", placeholder: "Si connue" },
      { key: "adresse_livraison", label: "Adresse de livraison", type: "texte" },
      { key: "type_camion", label: "Type de camion souhaité", type: "choix", options: CAMIONS },
      { key: "frequence", label: "Fréquence", type: "choix", options: [UNKNOWN, "Une seule fois", "Quelques jours", "Récurrent"] },
      { key: "acces", label: "Accès au chantier", type: "long", placeholder: "Terrain mou, pente, espace restreint…" },
    ],
  },
  {
    slug: "excavation-et-terrassement",
    label: "Excavation",
    tagline: "Fondation, drain, entrée, terrassement, démolition…",
    emoji: "🚜",
    fields: [
      { key: "type_travaux", label: "Type de travaux", type: "long", placeholder: "Ex. drain français, entrée, fondation" },
      { key: "clientele", label: "Type de propriété", type: "choix", options: [UNKNOWN, ...CLIENTELE] },
      { key: "dimensions", label: "Dimensions approximatives", type: "texte", placeholder: "Ex. 12 m x 8 m" },
      { key: "profondeur", label: "Profondeur", type: "texte", placeholder: "Si connue" },
      { key: "materiaux_enlever", label: "Matériaux à enlever", type: "texte" },
      { key: "materiaux_apporter", label: "Matériaux à apporter", type: "texte" },
      { key: "transport_requis", label: "Transport requis", type: "choix", options: oui_non_inconnu },
      { key: "disposition_requise", label: "Disposition requise", type: "choix", options: oui_non_inconnu },
    ],
  },
  {
    slug: "materiaux-en-vrac",
    label: "Matériaux",
    tagline: "Achat de terre, sable, gravier, pierre, paillis…",
    emoji: "⛏️",
    fields: [
      { key: "materiau", label: "Type de matériau", type: "choix", options: MATERIAUX },
      { key: "quantite", label: "Quantité", type: "texte" },
      { key: "unite", label: "Unité", type: "choix", options: UNITES },
      { key: "livraison", label: "Livraison requise", type: "choix", options: oui_non_inconnu },
      { key: "utilisation", label: "Utilisation prévue", type: "texte", placeholder: "Ex. sous une dalle, aménagement" },
      { key: "acces", label: "Accès au site", type: "long" },
    ],
  },
  {
    slug: "deneigement",
    label: "Déneigement",
    tagline: "Saison complète, chargement, transport de neige, abrasifs…",
    emoji: "❄️",
    fields: [
      { key: "type_propriete", label: "Type de propriété", type: "choix", options: [UNKNOWN, ...CLIENTELE] },
      { key: "superficie", label: "Superficie approximative", type: "texte" },
      { key: "formule", label: "Formule souhaitée", type: "choix", options: [UNKNOWN, "Saison complète", "À l'intervention"] },
      { key: "chargement", label: "Chargement de neige", type: "choix", options: oui_non_inconnu },
      { key: "transport_neige", label: "Transport de neige", type: "choix", options: oui_non_inconnu },
      { key: "abrasifs", label: "Abrasifs / déglaçage", type: "choix", options: oui_non_inconnu },
      { key: "frequence", label: "Fréquence souhaitée", type: "texte" },
    ],
  },
  {
    slug: "pavage",
    label: "Pavage",
    tagline: "Entrée, stationnement, réparation, resurfaçage…",
    emoji: "🛣️",
    fields: [
      { key: "type_travaux", label: "Type de travaux", type: "choix", options: [UNKNOWN, "Entrée résidentielle", "Stationnement commercial", "Réparation d'asphalte", "Resurfaçage", "Autre"] },
      { key: "superficie", label: "Superficie approximative", type: "texte", placeholder: "Ex. 90 m²" },
      { key: "excavation", label: "Excavation nécessaire", type: "choix", options: oui_non_inconnu },
      { key: "fondation", label: "Préparation de fondation", type: "choix", options: oui_non_inconnu },
      { key: "bordures", label: "Bordures", type: "choix", options: oui_non_inconnu },
    ],
  },
  {
    slug: "amenagement-paysager",
    label: "Aménagement paysager",
    tagline: "Terre, tourbe, pavé, muret, drainage, plantation…",
    emoji: "🌿",
    fields: [
      { key: "type_travaux", label: "Type de travaux", type: "long" },
      { key: "superficie", label: "Superficie approximative", type: "texte" },
      { key: "excavation", label: "Excavation", type: "choix", options: oui_non_inconnu },
      { key: "terre", label: "Terre végétale", type: "choix", options: oui_non_inconnu },
      { key: "tourbe", label: "Tourbe ou semence", type: "choix", options: [UNKNOWN, "Tourbe", "Semence", "Aucun"] },
      { key: "muret", label: "Muret", type: "choix", options: oui_non_inconnu },
      { key: "pave", label: "Pavé uni", type: "choix", options: oui_non_inconnu },
      { key: "drainage", label: "Drainage", type: "choix", options: oui_non_inconnu },
    ],
  },
  {
    slug: "transport-general-et-specialise",
    label: "Transport général",
    tagline: "Machinerie, fardier, flatbed, livraison de chantier…",
    emoji: "🚚",
    fields: [
      { key: "marchandise", label: "Marchandise ou équipement", type: "texte" },
      { key: "poids", label: "Poids approximatif", type: "texte" },
      { key: "dimensions", label: "Dimensions", type: "texte" },
      { key: "point_a", label: "Point de départ", type: "texte" },
      { key: "point_b", label: "Point d'arrivée", type: "texte" },
      { key: "equipement", label: "Équipement nécessaire", type: "choix", options: [UNKNOWN, "Flatbed", "Fardier", "Remorque fermée", "Autre"] },
    ],
  },
  {
    slug: "genie-civil-et-infrastructures",
    label: "Génie civil",
    tagline: "Voirie, égout, aqueduc, ponceau, travaux publics…",
    emoji: "🏗️",
    fields: [
      { key: "titre_projet", label: "Titre du projet", type: "texte" },
      { key: "donneur_ouvrage", label: "Donneur d'ouvrage", type: "texte" },
      { key: "portee", label: "Description de la portée", type: "long" },
      { key: "date_limite", label: "Date limite de dépôt", type: "date" },
      { key: "date_travaux", label: "Date prévue des travaux", type: "date" },
      { key: "documents_dispo", label: "Documents disponibles", type: "multi", options: ["Plans", "Devis", "Bordereau", "Étude géotechnique", "Autres"] },
      { key: "lots", label: "Le projet comporte des lots", type: "choix", options: oui_non_inconnu },
    ],
  },
  {
    slug: "location-de-machinerie-et-equipement",
    label: "Location de machinerie",
    tagline: "Pelle, chargeur, rouleau, avec ou sans opérateur…",
    emoji: "🛠️",
    fields: [
      { key: "equipement", label: "Équipement recherché", type: "choix", options: [UNKNOWN, "Pelle mécanique", "Mini-pelle", "Chargeur", "Bulldozer", "Skid steer", "Rouleau compacteur", "Niveleuse", "Camion", "Remorque", "Autre"] },
      { key: "operateur", label: "Avec opérateur", type: "choix", options: oui_non_inconnu },
      { key: "duree", label: "Durée souhaitée", type: "texte", placeholder: "Ex. 3 jours" },
      { key: "travaux", label: "Travaux à réaliser", type: "long" },
    ],
  },
  {
    slug: "disposition-et-recuperation",
    label: "Disposition de matériaux",
    tagline: "Terre, roc, béton, asphalte, matériaux à disposer…",
    emoji: "♻️",
    fields: [
      { key: "matiere", label: "Matière à disposer", type: "choix", options: [UNKNOWN, "Terre", "Roc", "Béton", "Asphalte", "Brique", "Matériaux granulaires", "Matériaux mixtes", "Autre"] },
      { key: "quantite", label: "Quantité approximative", type: "texte" },
      { key: "unite", label: "Unité", type: "choix", options: UNITES },
      { key: "transport_requis", label: "Transport requis", type: "choix", options: oui_non_inconnu },
      { key: "caracterisation", label: "Caractérisation disponible", type: "choix", options: oui_non_inconnu },
    ],
  },
  {
    slug: "services-de-chantier",
    label: "Services de chantier",
    tagline: "Conteneurs, balayage, signalisation, grue, soudure…",
    emoji: "🧰",
    fields: [
      { key: "service", label: "Service recherché", type: "choix", options: [UNKNOWN, "Conteneurs", "Pompage", "Balayage", "Signalisation", "Mécanique mobile", "Soudure", "Nettoyage de chantier", "Levage / grue", "Arpentage", "Autre"] },
      { key: "details", label: "Détails", type: "long" },
      { key: "duree", label: "Durée ou fréquence", type: "texte" },
    ],
  },
  {
    slug: "autre",
    label: "Autre besoin",
    tagline: "Décrivez votre projet, nous trouverons les bonnes entreprises.",
    emoji: "💬",
    fields: [
      { key: "details", label: "Décrivez votre besoin", type: "long" },
    ],
  },
];

export const findForm = (slug: string) => CATEGORY_FORMS.find((f) => f.slug === slug) ?? null;

// ============================================================
// PLACE DE MARCHÉ VRAC QUÉBEC — types et listes de référence
// Fondations (étape 1). Réutilise les entreprises (jsc_companies),
// leurs employés (jsc_company_members) et les clients existants.
// ============================================================

export const CLIENT_TYPES = [
  { value: "particulier", label: "Particulier" },
  { value: "commerce", label: "Commerce" },
  { value: "entreprise", label: "Entreprise" },
  { value: "entrepreneur", label: "Entrepreneur" },
  { value: "entrepreneur_general", label: "Entrepreneur général" },
  { value: "promoteur", label: "Promoteur" },
  { value: "gestionnaire_immobilier", label: "Gestionnaire immobilier" },
  { value: "institution", label: "Institution" },
  { value: "ville", label: "Ville" },
  { value: "municipalite", label: "Municipalité" },
  { value: "organisme_public", label: "Organisme public" },
] as const;
export type ClientType = (typeof CLIENT_TYPES)[number]["value"];

export const BUSINESS_ROLES = [
  { value: "entrepreneur", label: "Entrepreneur" },
  { value: "transporteur", label: "Transporteur" },
  { value: "fournisseur", label: "Fournisseur" },
  { value: "carriere", label: "Carrière" },
  { value: "sabliere", label: "Sablière" },
  { value: "site_disposition", label: "Site de disposition" },
  { value: "sous_traitant", label: "Sous-traitant" },
  { value: "donneur_ouvrage", label: "Donneur d'ouvrage" },
] as const;
export type BusinessRole = (typeof BUSINESS_ROLES)[number]["value"];

export const PARTNER_CLIENT_TYPES = [
  { value: "particulier", label: "Particulier" },
  { value: "commercial", label: "Commercial" },
  { value: "industriel", label: "Industriel" },
  { value: "institutionnel", label: "Institutionnel" },
  { value: "entrepreneur", label: "Entrepreneur" },
  { value: "entrepreneur_general", label: "Entrepreneur général" },
  { value: "municipal", label: "Municipal" },
  { value: "gouvernemental", label: "Gouvernemental" },
] as const;

export const AVAILABILITY_STATUSES = [
  { value: "disponible", label: "Disponible" },
  { value: "limitee", label: "Disponibilité limitée" },
  { value: "complet", label: "Complet" },
  { value: "urgences", label: "Urgences seulement" },
  { value: "inactif", label: "Inactif temporairement" },
] as const;

export const REQUEST_STATUSES = [
  { value: "brouillon", label: "Brouillon" },
  { value: "nouvelle", label: "Nouvelle demande" },
  { value: "a_qualifier", label: "À qualifier" },
  { value: "a_matcher", label: "À jumeler" },
  { value: "distribuee", label: "Invitations envoyées" },
  { value: "sans_soumission", label: "Sans soumission" },
  { value: "soumissions_recues", label: "Soumissions reçues" },
  { value: "attribution_a_confirmer", label: "Attribution à confirmer" },
  { value: "attribuee", label: "Projet attribué" },
  { value: "en_cours", label: "Projet en cours" },
  { value: "terminee", label: "Projet terminé" },
  { value: "annulee", label: "Annulée" },
  { value: "litige", label: "Problème / litige" },
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number]["value"];

export const BID_STATUSES = [
  { value: "brouillon", label: "Brouillon" },
  { value: "envoyee", label: "Envoyée" },
  { value: "vue", label: "Vue" },
  { value: "preselectionnee", label: "Présélectionnée" },
  { value: "retenue", label: "Retenue" },
  { value: "non_retenue", label: "Non retenue" },
  { value: "retiree", label: "Retirée" },
  { value: "expiree", label: "Expirée" },
] as const;
export type BidStatus = (typeof BID_STATUSES)[number]["value"];

export const PRICE_TYPES = [
  { value: "forfait", label: "Forfait" },
  { value: "horaire", label: "Taux horaire" },
  { value: "tonne", label: "À la tonne" },
  { value: "verge", label: "À la verge" },
  { value: "voyage", label: "Au voyage" },
  { value: "unite", label: "À l'unité" },
  { value: "estimation", label: "Estimation" },
] as const;

export const PRICING_MODELS = [
  { value: "commission_pourcentage", label: "Commission en pourcentage" },
  { value: "commission_fixe", label: "Commission fixe" },
  { value: "marge", label: "Marge ajoutée" },
  { value: "frais_par_lead", label: "Frais par occasion transmise" },
  { value: "frais_deblocage", label: "Frais de déblocage" },
  { value: "abonnement", label: "Abonnement" },
  { value: "credits", label: "Crédits" },
  { value: "gratuit", label: "Gratuit" },
  { value: "entente_personnalisee", label: "Entente personnalisée" },
] as const;

export const CONTACT_VISIBILITY = [
  { value: "toujours_cachees", label: "Toujours cachées" },
  { value: "apres_soumission", label: "Après soumission" },
  { value: "apres_preselection", label: "Après présélection" },
  { value: "apres_attribution", label: "Après attribution" },
  { value: "manuelle", label: "Révélation manuelle" },
  { value: "visibles", label: "Visibles" },
] as const;

export const PROJECT_SIZES = [
  { value: "tres_petit", label: "Très petits travaux" },
  { value: "petit", label: "Petits travaux" },
  { value: "moyen", label: "Moyens projets" },
  { value: "gros", label: "Gros projets" },
] as const;

export interface ServiceCategory {
  id: string;
  parent_id: string | null;
  level: "categorie" | "sous_categorie" | "service";
  code: string | null;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  keywords: string[];
  tags: string[];
  sort_order: number;
  is_active: boolean;
}

export interface MarketplacePartner {
  id: string;
  company_id: string;
  legal_name: string | null;
  trade_name: string | null;
  neq: string | null;
  founded_year: number | null;
  description: string | null;
  logo_url: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  contact_name: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  project_sizes: string[];
  accepts_tenders: boolean;
  accepts_subcontracting: boolean;
  min_project_amount: number | null;
  max_project_amount: number | null;
  max_distance_km: number | null;
  availability_status: string;
  availability_note: string | null;
  is_public: boolean;
  is_verified: boolean;
  onboarding_status: string;
  is_active: boolean;
}

export interface QuoteRequest {
  id: string;
  request_number: string | null;
  client_user_id: string | null;
  client_type: ClientType;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  organization_name: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  title: string;
  description: string | null;
  answers: Record<string, unknown>;
  address: string | null;
  city: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  desired_date: string | null;
  deadline_at: string | null;
  budget_min: number | null;
  budget_max: number | null;
  estimated_value: number | null;
  is_multi_lot: boolean;
  status: RequestStatus;
  distribution_mode: "auto" | "manuel" | "semi_auto";
  contact_visibility: string | null;
  contact_revealed_at?: string | null;
  created_at: string;
}

export interface RequestLot {
  id: string;
  request_id: string;
  lot_number: string;
  title: string;
  category_id: string | null;
  description: string | null;
  quantity: number | null;
  quantity_unit: string | null;
  estimated_amount: number | null;
  status: string;
  sort_order: number;
}

export interface Invitation {
  id: string;
  request_id: string;
  lot_id: string | null;
  company_id: string;
  match_score: number | null;
  match_reasons: Record<string, unknown>;
  distance_km: number | null;
  mode: "auto" | "manuel";
  status: string;
  sent_at: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  decline_reason?: string | null;
}

export interface Bid {
  id: string;
  request_id: string;
  lot_id: string | null;
  company_id: string;
  price_type: string;
  amount: number | null;
  taxes_included: boolean;
  lines: Array<{ label: string; amount: number; note?: string }>;
  lead_time: string | null;
  available_from: string | null;
  scope: string | null;
  conditions: string | null;
  valid_until: string | null;
  status: BidStatus;
  submitted_at: string | null;
}

export const labelOf = (
  list: readonly { value: string; label: string }[],
  value: string | null | undefined,
) => list.find((o) => o.value === value)?.label ?? value ?? "—";

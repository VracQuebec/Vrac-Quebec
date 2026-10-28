// Répertoire « Groupes Facebook » — types partagés.
// Les fiches proviennent d'un relevé de captures : l'identité Facebook
// (URL, identifiant) reste à vérifier avant toute utilisation directe.

export type FbGroupStatus = "actif" | "en_pause" | "a_verifier";

export type FbPublicationStatus =
  | "a_preparer"
  | "planifie"
  | "soumis"
  | "publie"
  | "refuse"
  | "retire"
  | "annule";

export const PUBLICATION_STATUS_LABEL: Record<FbPublicationStatus, string> = {
  a_preparer: "À préparer",
  planifie: "Planifié",
  soumis: "Soumis en attente d'approbation",
  publie: "Publié",
  refuse: "Refusé",
  retire: "Retiré",
  annule: "Annulé",
};

// Statuts qui comptent comme une tentative (jamais comme une publication réussie).
export const ATTEMPT_STATUSES: FbPublicationStatus[] = ["soumis", "publie", "refuse", "retire"];

export const GROUP_STATUS_LABEL: Record<FbGroupStatus, string> = {
  actif: "Actif",
  en_pause: "En pause",
  a_verifier: "À vérifier",
};

export type FbGroup = {
  id: string;
  source_id: string | null;
  name: string;
  transcription_note: string | null;
  captures: string[];
  fb_url: string | null;
  fb_identifier: string | null;
  region: string | null;
  cities: string | null;
  category: string | null;
  language: string | null;
  ad_rules: string;
  allowed_days: string | null;
  min_interval_days: number | null;
  member_account: string | null;
  internal_notes: string | null;
  status: FbGroupStatus;
  name_incomplete: boolean;
  merged_into: string | null;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FbCampaign = {
  id: string;
  name: string;
  description: string | null;
  content_text: string | null;
  min_interval_days: number;
  cycle: number;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FbCampaignGroup = {
  campaign_id: string;
  group_id: string;
  excluded: boolean;
  exclusion_reason: string | null;
  added_by: string | null;
  created_at: string;
};

export type FbPublication = {
  id: string;
  group_id: string;
  campaign_id: string | null;
  cycle: number;
  content_text: string | null;
  responsible: string | null;
  account_used: string | null;
  planned_date: string | null;
  submitted_at: string | null;
  submitted_real_date: string | null;
  published_at: string | null;
  published_real_date: string | null;
  post_url: string | null;
  status: FbPublicationStatus;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FbAssignment = {
  group_id: string;
  campaign_id: string;
  cycle: number;
  assigned_to: string;
  assigned_at: string;
};

export type FbGroupEvent = {
  id: string;
  group_id: string | null;
  publication_id: string | null;
  actor: string | null;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: string;
};

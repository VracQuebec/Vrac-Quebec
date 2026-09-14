// ============================================================
// LOT 14 — API D'ÉCRITURE DES CONFIRMATIONS HUMAINES.
// ------------------------------------------------------------
// TOUTE écriture est bloquée tant que le drapeau qualification_writes_v2
// est faux (valeur par défaut, et valeur en production).
// Aucune écriture ne touche : texte original, materials, other_material,
// statut CRM, disponibilité, capacités, matériaux historiques.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { isFeatureEnabled } from "@/lib/flags";
import type {
  AliasDraft, JournalDraft, JournalEntry, QualificationCategory, TermDecision, TermProposalDraft,
} from "@/lib/qualification/lot14";

export class QualificationWritesDisabled extends Error {
  constructor() {
    super("Écritures de qualification désactivées (qualification_writes_v2 = FALSE).");
    this.name = "QualificationWritesDisabled";
  }
}

export const writesEnabled = () => isFeatureEnabled("qualification_writes_v2");

function assertWrites() {
  if (!writesEnabled()) throw new QualificationWritesDisabled();
}

type Row = {
  id: string;
  submission_id: string;
  category: string;
  subject: string;
  previous_value: unknown;
  proposed_value: unknown;
  confirmed_value: unknown;
  decision: string;
  source: string;
  confidence_before_confirmation: string | null;
  original_text: string | null;
  supersedes_id: string | null;
  note: string | null;
  confirmed_by: string;
  confirmed_at: string;
  created_at: string;
};

export const rowToEntry = (r: Row): JournalEntry => ({
  id: r.id,
  submissionId: r.submission_id,
  category: r.category as QualificationCategory,
  subject: r.subject,
  previousValue: r.previous_value,
  proposedValue: r.proposed_value,
  confirmedValue: r.confirmed_value,
  decision: r.decision as JournalEntry["decision"],
  source: r.source,
  confidenceBefore: (r.confidence_before_confirmation as JournalEntry["confidenceBefore"]) ?? null,
  originalText: r.original_text,
  supersedesId: r.supersedes_id,
  note: r.note,
  confirmedBy: r.confirmed_by,
  confirmedAt: r.confirmed_at,
  createdAt: r.created_at,
});

const draftToRow = (d: JournalDraft) => ({
  submission_id: d.submissionId,
  category: d.category,
  subject: d.subject,
  previous_value: (d.previousValue ?? null) as never,
  proposed_value: (d.proposedValue ?? null) as never,
  confirmed_value: (d.confirmedValue ?? null) as never,
  decision: d.decision,
  source: d.source,
  confidence_before_confirmation: d.confidenceBefore ?? null,
  original_text: d.originalText ?? null,
  supersedes_id: d.supersedesId ?? null,
  note: d.note ?? null,
  confirmed_by: d.confirmedBy,
  confirmed_at: d.confirmedAt,
});

/** Lecture du journal (admin seulement, via RLS). Toujours autorisée. */
export async function fetchJournal(submissionIds: string[]): Promise<JournalEntry[]> {
  if (submissionIds.length === 0) return [];
  const { data, error } = await supabase
    .from("qualification_confirmations")
    .select("*")
    .in("submission_id", submissionIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToEntry(r as unknown as Row));
}

/** Ajout d'entrées — append-only, jamais de mise à jour ni de suppression. */
export async function appendJournal(drafts: JournalDraft[]): Promise<JournalEntry[]> {
  assertWrites();
  if (drafts.length === 0) return [];
  const { data, error } = await supabase
    .from("qualification_confirmations")
    .insert(drafts.map(draftToRow))
    .select("*");
  if (error) throw error;
  return (data ?? []).map((r) => rowToEntry(r as unknown as Row));
}

/** File des termes non reconnus. */
export async function upsertTermProposal(p: TermProposalDraft) {
  assertWrites();
  const { error } = await supabase.from("qualification_term_proposals").upsert(
    {
      term: p.term,
      term_norm: p.termNorm,
      context: p.context,
      occurrences: p.occurrences,
      proposed_material_key: p.proposedMaterialKey,
    },
    { onConflict: "term_norm" },
  );
  if (error) throw error;
}

/** Décision humaine sur un terme. Aucun alias n'est créé sans cette étape. */
export async function resolveTermProposal(
  termNorm: string, decision: TermDecision, alias: AliasDraft | null, resolvedBy: string,
) {
  assertWrites();
  const { error } = await supabase
    .from("qualification_term_proposals")
    .update({ decision, resolved_by: resolvedBy, resolved_at: new Date().toISOString() })
    .eq("term_norm", termNorm);
  if (error) throw error;
  if (alias) {
    const { error: aliasError } = await supabase.from("material_synonyms").insert({
      expression: alias.expression,
      expression_norm: alias.expression_norm,
      material_keys: alias.material_keys,
      validated_by_admin: alias.validated_by_admin,
      is_active: alias.is_active,
      confidence: alias.confidence,
      notes: alias.notes,
    });
    if (aliasError) throw aliasError;
  }
}

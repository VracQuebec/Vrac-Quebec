// Accès données « Groupes Facebook » — réservé au rôle admin plateforme (RLS).
// Journalise chaque action dans fb_group_events pour retrouver qui a modifié quoi.

import { supabase } from "@/integrations/supabase/client";
import type {
  FbAssignment,
  FbCampaign,
  FbCampaignGroup,
  FbGroup,
  FbGroupEvent,
  FbPublication,
  FbPublicationStatus,
} from "./types";

const PAGE_SIZE = 100;

export async function fetchGroupsPage(args: {
  page: number;
  search?: string;
  status?: string;
  region?: string;
  category?: string;
  includeArchived?: boolean;
}): Promise<{ rows: FbGroup[]; count: number }> {
  let q = supabase
    .from("fb_groups")
    .select("*", { count: "exact" })
    .order("source_id", { ascending: true })
    .range(args.page * PAGE_SIZE, args.page * PAGE_SIZE + PAGE_SIZE - 1);
  if (!args.includeArchived) q = q.is("archived_at", null);
  if (args.search) q = q.or(`name.ilike.%${args.search}%,source_id.ilike.%${args.search}%`);
  if (args.status && args.status !== "all") q = q.eq("status", args.status);
  if (args.region) q = q.ilike("region", `%${args.region}%`);
  if (args.category) q = q.ilike("category", `%${args.category}%`);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as FbGroup[], count: count ?? 0 };
}

export async function fetchAllGroups(): Promise<FbGroup[]> {
  const out: FbGroup[] = [];
  for (let page = 0; ; page++) {
    const { rows } = await fetchGroupsPage({ page, includeArchived: true });
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

export async function fetchCampaigns(): Promise<FbCampaign[]> {
  const { data, error } = await supabase.from("fb_campaigns").select("*").order("created_at");
  if (error) throw error;
  return (data ?? []) as FbCampaign[];
}

export async function fetchCampaignGroups(campaignId?: string): Promise<FbCampaignGroup[]> {
  let q = supabase.from("fb_campaign_groups").select("*");
  if (campaignId) q = q.eq("campaign_id", campaignId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FbCampaignGroup[];
}

export async function fetchPublications(args: {
  groupId?: string;
  campaignId?: string;
  status?: FbPublicationStatus;
}): Promise<FbPublication[]> {
  let q = supabase.from("fb_publications").select("*").order("created_at", { ascending: false });
  if (args.groupId) q = q.eq("group_id", args.groupId);
  if (args.campaignId) q = q.eq("campaign_id", args.campaignId);
  if (args.status) q = q.eq("status", args.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FbPublication[];
}

export async function fetchAssignments(campaignId: string, cycle: number): Promise<FbAssignment[]> {
  const { data, error } = await supabase
    .from("fb_assignments")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("cycle", cycle);
  if (error) throw error;
  return (data ?? []) as FbAssignment[];
}

export async function fetchGroupEvents(groupId: string): Promise<FbGroupEvent[]> {
  const { data, error } = await supabase
    .from("fb_group_events")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as FbGroupEvent[];
}

export async function logEvent(
  actor: string,
  action: string,
  groupId?: string | null,
  publicationId?: string | null,
  detail?: Record<string, unknown>,
): Promise<void> {
  await supabase.from("fb_group_events").insert({
    actor,
    action,
    group_id: groupId ?? null,
    publication_id: publicationId ?? null,
    detail: (detail ?? null) as never,
  });
}

export async function updateGroup(
  id: string,
  patch: Partial<FbGroup>,
  actor: string,
): Promise<void> {
  const { error } = await supabase
    .from("fb_groups")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await logEvent(actor, "groupe_modifie", id, null, { champs: Object.keys(patch) });
}

export async function addGroup(name: string, actor: string): Promise<void> {
  const { error } = await supabase.from("fb_groups").insert({ name, created_by: actor });
  if (error) throw error;
  await logEvent(actor, "groupe_ajoute_manuellement", null, null, { nom: name });
}

export async function mergeGroup(sourceId: string, targetId: string, actor: string): Promise<void> {
  // Fusion manuelle : la fiche source pointe vers la cible; historique et références préservés.
  const { error } = await supabase
    .from("fb_groups")
    .update({ merged_into: targetId, updated_at: new Date().toISOString() })
    .eq("id", sourceId);
  if (error) throw error;
  await logEvent(actor, "fusion", sourceId, null, { fusionne_dans: targetId });
}

export async function upsertPublication(
  pub: Partial<FbPublication> & { group_id: string },
  actor: string,
): Promise<string> {
  const now = new Date().toISOString();
  if (pub.id) {
    const { error } = await supabase
      .from("fb_publications")
      .update({ ...pub, updated_by: actor, updated_at: now })
      .eq("id", pub.id);
    if (error) throw error;
    await logEvent(actor, "publication_modifiee", pub.group_id, pub.id, { statut: pub.status });
    return pub.id;
  }
  const { data, error } = await supabase
    .from("fb_publications")
    .insert({ ...pub, created_by: actor, updated_by: actor })
    .select("id")
    .single();
  if (error) throw error;
  await logEvent(actor, "publication_creee", pub.group_id, data.id, { statut: pub.status });
  return data.id as string;
}

/** « Marquer soumis » : enregistre une tentative, jamais une publication. */
export async function markSubmitted(
  pub: Partial<FbPublication> & { group_id: string },
  realDate: string,
  actor: string,
): Promise<string> {
  return upsertPublication(
    { ...pub, status: "soumis", submitted_at: new Date().toISOString(), submitted_real_date: realDate },
    actor,
  );
}

/** « Confirmer publié » : publication effective, date réelle modifiable. */
export async function markPublished(
  pub: Partial<FbPublication> & { group_id: string },
  realDate: string,
  postUrl: string | null,
  actor: string,
): Promise<string> {
  return upsertPublication(
    {
      ...pub,
      status: "publie",
      published_at: new Date().toISOString(),
      published_real_date: realDate,
      post_url: postUrl,
    },
    actor,
  );
}

/** Attribution persistante : retourne false si un autre admin tient déjà la fiche. */
export async function claimGroup(
  groupId: string,
  campaignId: string,
  cycle: number,
  userId: string,
): Promise<{ ok: boolean; heldBy: string | null }> {
  const { data, error } = await supabase.rpc("fb_claim_group", { p_group: groupId, p_campaign: campaignId, p_cycle: cycle });
  if (error) throw error;
  const result = data as { ok: boolean; heldBy: string | null };
  return result;
}

export async function releaseGroup(
  groupId: string,
  campaignId: string,
  cycle: number,
  userId: string,
): Promise<void> {
  const { error } = await supabase.rpc("fb_release_group", { p_group: groupId, p_campaign: campaignId, p_cycle: cycle });
  if (error) throw error;
}

export function exportCsv(filename: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

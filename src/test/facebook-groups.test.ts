import { describe, expect, it } from "vitest";
import {
  computeQueue,
  cycleStats,
  duplicateWarning,
  effectiveIntervalDays,
  nextAllowedDate,
} from "@/lib/facebook-groups/rotation";
import type { FbCampaign, FbGroup, FbPublication } from "@/lib/facebook-groups/types";

const group = (id: string, over: Partial<FbGroup> = {}): FbGroup => ({
  id,
  source_id: `GF${id}`,
  name: `Groupe ${id}`,
  transcription_note: null,
  captures: [],
  fb_url: null,
  fb_identifier: null,
  region: null,
  cities: null,
  category: null,
  language: null,
  ad_rules: "a_verifier",
  allowed_days: null,
  min_interval_days: null,
  member_account: null,
  internal_notes: null,
  status: "actif",
  name_incomplete: false,
  merged_into: null,
  archived_at: null,
  created_by: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  ...over,
});

const campaign = (over: Partial<FbCampaign> = {}): FbCampaign => ({
  id: "camp1",
  name: "Campagne",
  description: null,
  content_text: null,
  min_interval_days: 14,
  cycle: 1,
  status: "active",
  created_by: null,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  ...over,
});

const pub = (groupId: string, status: FbPublication["status"], over: Partial<FbPublication> = {}): FbPublication => ({
  id: `${groupId}-${status}-${over.campaign_id ?? "camp1"}-${over.cycle ?? 1}`,
  group_id: groupId,
  campaign_id: "camp1",
  cycle: 1,
  content_text: null,
  responsible: null,
  account_used: null,
  planned_date: null,
  submitted_at: "2026-10-01T12:00:00Z",
  submitted_real_date: null,
  published_at: null,
  published_real_date: null,
  post_url: null,
  status,
  notes: null,
  created_by: null,
  updated_by: null,
  created_at: "2026-10-01",
  updated_at: "2026-10-01T12:00:00Z",
  ...over,
});

const TODAY = new Date("2026-10-28T12:00:00Z");

describe("rotation des groupes Facebook", () => {
  it("la règle d'intervalle du groupe prévaut sur celle de la campagne", () => {
    expect(effectiveIntervalDays(group("a", { min_interval_days: 30 }), campaign())).toBe(30);
    expect(effectiveIntervalDays(group("a"), campaign({ min_interval_days: 7 }))).toBe(7);
  });

  it("calcule la prochaine date autorisée depuis la dernière tentative", () => {
    expect(nextAllowedDate(group("a"), campaign(), "2026-10-01T12:00:00Z")).toBe("2026-10-15");
    expect(nextAllowedDate(group("a"), campaign(), null)).toBeNull();
  });

  it("propose d'abord les jamais tentés, puis les plus anciennement tentés", () => {
    const groups = [group("a"), group("b"), group("c")];
    const cgs = groups.map((g) => ({ campaign_id: "camp1", group_id: g.id, excluded: false, exclusion_reason: null, added_by: null, created_at: "" }));
    const pubs = [
      pub("b", "publie", { published_at: "2026-09-01T12:00:00Z" }),
      pub("c", "refuse", { submitted_at: "2026-10-10T12:00:00Z" }),
    ];
    const q = computeQueue({ groups, campaignGroups: cgs, publications: pubs, assignments: [], campaign: campaign(), today: TODAY });
    expect(q.map((i) => i.group.id)).toEqual(["a", "b", "c"]);
    expect(q[0].neverAttempted).toBe(true);
  });

  it("retire de la file les groupes avec une soumission en attente", () => {
    const groups = [group("a"), group("b")];
    const cgs = groups.map((g) => ({ campaign_id: "camp1", group_id: g.id, excluded: false, exclusion_reason: null, added_by: null, created_at: "" }));
    const pubs = [pub("a", "soumis")];
    const q = computeQueue({ groups, campaignGroups: cgs, publications: pubs, assignments: [], campaign: campaign(), today: TODAY });
    expect(q.map((i) => i.group.id)).toEqual(["b"]);
  });

  it("exclut les groupes en pause, archivés, fusionnés ou exclus de la campagne", () => {
    const groups = [
      group("a", { status: "en_pause" }),
      group("b", { archived_at: "2026-10-01" }),
      group("c", { merged_into: "x" }),
      group("d"),
      group("e"),
    ];
    const cgs = [
      ...groups.slice(0, 4).map((g) => ({ campaign_id: "camp1", group_id: g.id, excluded: false, exclusion_reason: null, added_by: null, created_at: "" })),
      { campaign_id: "camp1", group_id: "e", excluded: true, exclusion_reason: "hors secteur", added_by: null, created_at: "" },
    ];
    const q = computeQueue({ groups, campaignGroups: cgs, publications: [], assignments: [], campaign: campaign(), today: TODAY });
    expect(q.map((i) => i.group.id)).toEqual(["d"]);
  });

  it("signale les règles inconnues et les répétitions récentes toutes campagnes confondues", () => {
    const groups = [group("a")];
    const cgs = [{ campaign_id: "camp1", group_id: "a", excluded: false, exclusion_reason: null, added_by: null, created_at: "" }];
    const pubs = [pub("a", "publie", { campaign_id: "autre", cycle: 3, published_at: "2026-10-20T12:00:00Z" })];
    const q = computeQueue({ groups, campaignGroups: cgs, publications: pubs, assignments: [], campaign: campaign(), today: TODAY });
    expect(q[0].rulesUnknown).toBe(true);
    expect(q[0].duplicateWarning).toContain("autre campagne");
  });

  it("bloque avant la prochaine date autorisée", () => {
    const groups = [group("a")];
    const cgs = [{ campaign_id: "camp1", group_id: "a", excluded: false, exclusion_reason: null, added_by: null, created_at: "" }];
    const pubs = [pub("a", "publie", { published_at: "2026-10-25T12:00:00Z" })];
    const q = computeQueue({ groups, campaignGroups: cgs, publications: pubs, assignments: [], campaign: campaign(), today: TODAY });
    expect(q[0].blockedByDate).toBe(true);
    expect(q[0].nextAllowedDate).toBe("2026-11-08");
  });

  it("refus et retraits comptent comme tentatives, pas comme publications", () => {
    const cgs = [
      { campaign_id: "camp1", group_id: "a", excluded: false, exclusion_reason: null, added_by: null, created_at: "" },
      { campaign_id: "camp1", group_id: "b", excluded: false, exclusion_reason: null, added_by: null, created_at: "" },
    ];
    const pubs = [pub("a", "refuse"), pub("a", "publie", { published_at: "2026-10-02T12:00:00Z" }), pub("b", "retire")];
    const s = cycleStats({ campaignGroups: cgs, publications: pubs, campaign: campaign() });
    expect(s.attempted).toBe(2);
    expect(s.coveredGroups).toBe(1); // un seul groupe couvert malgré 2 lignes sur « a »
    expect(s.refused).toBe(2);
    expect(s.remaining).toBe(0);
  });

  it("duplicateWarning distingue planifié, en attente et publié récemment", () => {
    const base = [pub("a", "planifie")];
    expect(duplicateWarning(base, "a", "camp1", 1, 14, TODAY)).toContain("planifié");
    expect(duplicateWarning([pub("a", "soumis")], "a", "camp1", 1, 14, TODAY)).toContain("en attente");
    expect(duplicateWarning([], "a", "camp1", 1, 14, TODAY)).toBeNull();
  });
});

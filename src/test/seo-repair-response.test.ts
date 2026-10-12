import { describe, it, expect } from "vitest";
import { repairResponse } from "../../supabase/functions/_shared/seo-repair-guard";
import { repairCity, type RepairSlot } from "@/lib/seo/cityRepair";
import { publishPrecheck, precheckReason } from "@/lib/seo/cityPublish";
import { generateReasonWithCatalog } from "@/lib/seo/cityActions";

const slot: RepairSlot = { key: "saint-georges|remblai|", label: "Remblai", gen_state: "invalid", has_page: true, published: false,
  noindex_volontaire: false, issues: ["Contenu insuffisant"], attempts: 0, material_slug: "remblai", service_slug: null };

describe("réponse de régénération unitaire", () => {
  it("génération réussie → réussi", () => {
    expect(repairResponse({ ok: true })).toEqual({ status: 200, body: { ok: true, queued: 1, done: true } });
  });
  it("génération échouée → erreur avec la raison, jamais réussi", () => {
    const r = repairResponse({ ok: false, error: "IA indisponible" });
    expect(r.status).toBe(502);
    expect(r.body.ok).toBe(false);
    expect(r.body.error).toBe("IA indisponible");
  });
  it("remplacement refusé (brouillon modifié) → erreur", () => {
    const r = repairResponse({ ok: false, error: "Brouillon modifié entre-temps ou publié — aucun remplacement effectué." });
    expect(r.status).toBe(502);
    expect(r.body.ok).toBe(false);
  });
  it("tâche déjà en cours → refus, aucune nouvelle tentative", () => {
    expect(repairResponse({ ok: true, skipped: true }).status).toBe(409);
  });
  it("IA simulée en échec : la ville compte un échec, pas une réussite", async () => {
    const o = await repairCity([slot], async () => { throw new Error("IA simulée : échec"); });
    expect(o.done).toEqual([]);
    expect(o.failed[0].error).toBe("IA simulée : échec");
  });
  it("IA simulée réussie : une seule page traitée", async () => {
    let calls = 0;
    const o = await repairCity([slot], async () => { calls++; });
    expect(calls).toBe(1);
    expect(o.done).toEqual(["Remblai"]);
  });
  it("limite de 3 tentatives : aucun appel", async () => {
    let calls = 0;
    const o = await repairCity([{ ...slot, attempts: 3 }], async () => { calls++; });
    expect(calls).toBe(0);
    expect(o.skipped[0].reason).toMatch(/3 tentatives/);
  });
});

describe("pré-contrôle de publication avant le clic", () => {
  const base = { slug: "remblai-x", status: "draft", meta_title: "Remblai à Saint-Georges : guide complet du projet", meta_description: "x".repeat(80),
    h1: "Remblai à Saint-Georges", title: null, content_html: "<p>" + "mot ".repeat(400) + "</p>", word_count: 400, internal_link_count: 3 };
  it("brouillon en noindex volontaire → bloqué, bouton désactivé avec raison", () => {
    const p = publishPrecheck([{ ...base, noindex: true, noindex_volontaire: true }], "Saint-Georges", new Map());
    expect(p.eligible).toEqual([]);
    expect(precheckReason(p)).toMatch(/aucun admissible/);
  });
  it("aucun brouillon → raison explicite", () => {
    expect(precheckReason(publishPrecheck([], "Saint-Georges", new Map()))).toBe("Aucun brouillon dans cette ville.");
  });
});

describe("raison de génération selon le catalogue", () => {
  it("file vide mais inconnues → décision requise", () => {
    const r = generateReasonWithCatalog("Toutes les pages prévues existent déjà (aucune page manquante, aucun échec de création).",
      { missing_unknown: 17, missing_confirmed: 0, excluded_missing: 2, draft_error: 0 });
    expect(r).toMatch(/17 combinaison\(s\) à disponibilité inconnue/);
  });
});

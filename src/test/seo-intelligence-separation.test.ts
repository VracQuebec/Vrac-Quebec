import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  ANALYTIC_PAGE_COLUMNS,
  OPERATIONAL_PAGE_COLUMNS,
  classifyPageUpdate,
  extractPageUpdateColumns,
  findForbiddenPageWrites,
} from "@/lib/seo/separation";
import { natureOfType, nextStatus, buildLogEntry } from "@/lib/seo/workflow";
import { runVerification } from "@/lib/seo/verification";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const INTEL = "supabase/functions/seo-intelligence-scan/index.ts";
const SCAN = "supabase/functions/seo-assistant-scan/index.ts";

describe("Séparation Intelligence SEO automatique / Copilote", () => {
  it("les deux ensembles de colonnes sont disjoints", () => {
    const inter = ANALYTIC_PAGE_COLUMNS.filter((c) =>
      (OPERATIONAL_PAGE_COLUMNS as readonly string[]).includes(c),
    );
    expect(inter).toEqual([]);
  });

  it("classifyPageUpdate autorise une écriture purement analytique", () => {
    const v = classifyPageUpdate([
      "diagnostic_report",
      "intelligence_flags",
      "intelligence_last_checked_at",
      "needs_refresh",
      "refresh_reason",
    ]);
    expect(v.operational).toEqual([]);
    expect(v.allowedForAutomation).toBe(true);
  });

  it("classifyPageUpdate refuse une écriture de titre ou meta", () => {
    const v = classifyPageUpdate(["meta_title", "meta_description", "needs_refresh"]);
    expect(v.operational).toEqual(["meta_title", "meta_description"]);
    expect(v.allowedForAutomation).toBe(false);
  });

  it("classifyPageUpdate refuse une publication automatique", () => {
    expect(classifyPageUpdate(["status", "published_at"]).allowedForAutomation).toBe(false);
  });

  it("classifyPageUpdate refuse contenu, CTA et maillage", () => {
    expect(classifyPageUpdate(["content_html"]).allowedForAutomation).toBe(false);
    expect(classifyPageUpdate(["internal_links"]).allowedForAutomation).toBe(false);
    expect(classifyPageUpdate(["intro"]).allowedForAutomation).toBe(false);
  });

  it("une colonne inconnue est traitée comme non autorisée (fail-safe)", () => {
    const v = classifyPageUpdate(["colonne_inventee"]);
    expect(v.unknown).toEqual(["colonne_inventee"]);
    expect(v.allowedForAutomation).toBe(false);
  });

  it("extractPageUpdateColumns lit les colonnes d'une écriture sur seo_pages", () => {
    const src = `await supa.from("seo_pages").update({ needs_refresh: true, refresh_reason: "x" }).eq("id", p.id);`;
    expect(extractPageUpdateColumns(src)).toEqual([["needs_refresh", "refresh_reason"]]);
  });

  it("extractPageUpdateColumns ignore les objets imbriqués", () => {
    const src = `sb.from("seo_pages").update({ diagnostic_report: { a: 1, b: { c: 2 } }, needs_refresh: false })`;
    expect(extractPageUpdateColumns(src)).toEqual([["diagnostic_report", "needs_refresh"]]);
  });

  it("findForbiddenPageWrites détecte insert/delete", () => {
    expect(findForbiddenPageWrites(`sb.from("seo_pages").insert({})`)).toContain("insert");
    expect(findForbiddenPageWrites(`sb.from("seo_pages").delete()`)).toContain("delete");
    expect(findForbiddenPageWrites(`sb.from("seo_pages").update({})`)).toEqual([]);
  });

  it("la tâche automatique d'intelligence n'écrit que des colonnes analytiques", () => {
    expect(existsSync(resolve(process.cwd(), INTEL))).toBe(true);
    const src = read(INTEL);
    const updates = extractPageUpdateColumns(src);
    expect(updates.length).toBeGreaterThan(0);
    for (const cols of updates) {
      const v = classifyPageUpdate(cols);
      expect(v.operational, `écriture SEO interdite: ${v.operational.join(",")}`).toEqual([]);
      expect(v.unknown, `colonne non classée: ${v.unknown.join(",")}`).toEqual([]);
    }
  });

  it("la tâche automatique ne crée ni ne supprime de page", () => {
    expect(findForbiddenPageWrites(read(INTEL))).toEqual([]);
  });

  it("la tâche automatique ne publie jamais une page", () => {
    const src = read(INTEL);
    expect(/status:\s*["']published["']/.test(src)).toBe(false);
    const cols = extractPageUpdateColumns(src).flat();
    expect(cols).not.toContain("published_at");
    expect(cols).not.toContain("status");
  });

  it("l'analyse d'opportunités ne modifie aucune page", () => {
    const src = read(SCAN);
    expect(extractPageUpdateColumns(src)).toEqual([]);
    expect(findForbiddenPageWrites(src)).toEqual([]);
  });

  it("l'analyse d'opportunités peut créer et mettre à jour des signaux", () => {
    const src = read(SCAN);
    expect(/from\(\s*["']seo_opportunities["']\s*\)\s*\.insert\(/.test(src)).toBe(true);
    expect(/from\(\s*["']seo_opportunities["']\s*\)\s*\.update\(/.test(src)).toBe(true);
  });

  it("l'analyse ne supprime jamais une opportunité", () => {
    expect(/from\(\s*["']seo_opportunities["']\s*\)\s*\.delete\(/.test(read(SCAN))).toBe(false);
  });

  it("une vérification du Copilote retourne un résultat sans muter les pages lues", () => {
    const rows = [
      { id: "1", slug: "a", status: "published", noindex: false, google_index_status: "indexed" },
      { id: "2", slug: "b", status: "published", noindex: true, google_index_status: "indexed" },
    ];
    const snapshot = JSON.stringify(rows);
    const res = runVerification("indexation", rows);
    expect(res.outcome).toBe("issue");
    expect(JSON.stringify(rows)).toBe(snapshot);
  });

  it("seule une action confirmée passe En cours puis Terminée", () => {
    expect(nextStatus("open", "work")).toBe("in_progress");
    expect(nextStatus("in_progress", "applied")).toBe("completed");
    expect(nextStatus("open", "applied")).toBe("completed");
  });

  it("une action exécutable est de nature action, une vérification de nature vérification", () => {
    expect(natureOfType("high_impr_low_ctr")).toBe("action");
    expect(natureOfType("not_indexed")).toBe("verification");
    expect(natureOfType("low_qa")).toBe("verification");
    expect(natureOfType("cannibalization")).toBe("verification");
  });

  it("toute modification Copilote est journalisée avec avant/après", () => {
    const entry = buildLogEntry(
      { key: "k", kind: "page", primary: { id: "opp-1", type: "high_impr_low_ctr" } } as never,
      {
        status: "applied",
        before_data: { meta_title: "avant" },
        after_data: { meta_title: "après" },
      },
    );
    expect(entry.status).toBe("applied");
    expect(entry.before_data).toEqual({ meta_title: "avant" });
    expect(entry.after_data).toEqual({ meta_title: "après" });
  });

  it("une vérification est journalisée sans after_data", () => {
    const entry = buildLogEntry(
      { key: "k", kind: "group", primary: { id: "opp-2", type: "not_indexed" } } as never,
      { status: "checked", note: "20 pages vérifiées" },
    );
    expect(entry.status).toBe("checked");
    expect(entry.after_data ?? {}).toEqual({});
  });

  it("aucune autre fonction SEO automatique horaire n'écrit de colonne opérationnelle sans passer par le Copilote", () => {
    const src = read(INTEL);
    const cols = extractPageUpdateColumns(src).flat();
    expect(cols.sort()).toEqual(
      [
        "diagnostic_report",
        "intelligence_flags",
        "intelligence_last_checked_at",
        "needs_refresh",
        "refresh_reason",
        "needs_refresh",
        "refresh_reason",
        "intelligence_flags",
        "needs_refresh",
        "refresh_reason",
        "needs_refresh",
        "refresh_reason",
      ].sort(),
    );
  });
});

import { describe, it, expect, vi } from "vitest";
import { pipelinePublishRefusal, autofixAuthorization, guardedReplace, type GuardedDeps } from "../../supabase/functions/_shared/seo-write-guards";

const deps = (o: Partial<GuardedDeps> = {}) => {
  const d = {
    insertBackup: vi.fn(async () => "bk1"),
    conditionalUpdate: vi.fn(async () => 1),
    finalizeBackup: vi.fn(async () => {}),
    ...o,
  };
  return d;
};
const page = { id: "p1", status: "draft", updated_at: "2026-10-12T10:00:00Z", content_html: "<p>a</p>" };

describe("pilote : publication", () => {
  it("une tâche de publication est refusée", () => expect(pipelinePublishRefusal("publish")).toMatch(/refusée/));
  it("une tâche de génération n'est pas concernée", () => expect(pipelinePublishRefusal("generate")).toBeNull());
});

describe("correction automatique : autorisation", () => {
  it("page en ligne sans autorisation → refus 409", () => {
    const r = autofixAuthorization({ pageId: "p1", status: "published" });
    expect(r).toMatchObject({ ok: false, status: 409, code: "published_confirmation_required" });
  });
  it("autorisation pour une autre page → refus", () =>
    expect(autofixAuthorization({ pageId: "p1", status: "published", confirmPublishedPageId: "p2" }).ok).toBe(false));
  it("autorisation explicite pour cette page → accepté", () =>
    expect(autofixAuthorization({ pageId: "p1", status: "published", confirmPublishedPageId: "p1" }).ok).toBe(true));
  it("brouillon → accepté", () => expect(autofixAuthorization({ pageId: "p1", status: "draft" }).ok).toBe(true));
});

describe("correction automatique : sauvegarde puis remplacement", () => {
  it("sauvegarde complète AVANT le remplacement, puis confirmée", async () => {
    const order: string[] = [];
    const d = deps({
      insertBackup: vi.fn(async (b) => { order.push("backup"); expect(b).toEqual(page); return "bk1"; }),
      conditionalUpdate: vi.fn(async (at) => { order.push("update"); expect(at).toBe(page.updated_at); return 1; }),
    });
    const r = await guardedReplace(page, d);
    expect(r).toEqual({ ok: true, backupId: "bk1" });
    expect(order).toEqual(["backup", "update"]);
    expect(d.finalizeBackup).toHaveBeenCalledWith("bk1", true, "");
  });
  it("sauvegarde échouée → aucun remplacement", async () => {
    const d = deps({ insertBackup: vi.fn(async () => null) });
    const r = await guardedReplace(page, d);
    expect(r).toMatchObject({ ok: false, code: "backup_failed" });
    expect(d.conditionalUpdate).not.toHaveBeenCalled();
  });
  it("sauvegarde qui plante → aucun remplacement", async () => {
    const d = deps({ insertBackup: vi.fn(async () => { throw new Error("x"); }) });
    expect((await guardedReplace(page, d)).ok).toBe(false);
    expect(d.conditionalUpdate).not.toHaveBeenCalled();
  });
  it("page changée depuis la lecture → 409, sauvegarde non appliquée", async () => {
    const d = deps({ conditionalUpdate: vi.fn(async () => 0) });
    const r = await guardedReplace(page, d);
    expect(r).toMatchObject({ ok: false, status: 409, code: "page_changed" });
    expect(d.finalizeBackup).toHaveBeenCalledWith("bk1", false, expect.stringMatching(/changé/));
  });
  it("erreur de la base → échec, rien d'appliqué", async () => {
    const d = deps({ conditionalUpdate: vi.fn(async () => -1) });
    expect(await guardedReplace(page, d)).toMatchObject({ ok: false, code: "update_failed" });
  });
  it("lecture initiale absente → rien n'est fait", async () => {
    const d = deps();
    expect((await guardedReplace(null, d)).ok).toBe(false);
    expect(d.insertBackup).not.toHaveBeenCalled();
  });
});

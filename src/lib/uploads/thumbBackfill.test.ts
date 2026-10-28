import { describe, it, expect } from "vitest";
import { backfillThumbs, legacyThumbPath, type BackfillDeps, type LegacyFile } from "./thumbBackfill";

function fake() {
  const objects = new Map<string, Blob>([["orig/a.jpg", new Blob(["A"])], ["orig/b.png", new Blob(["B"])]]);
  const rows = new Map<string, string | null>();
  const deps: BackfillDeps = {
    download: async (p) => objects.get(p) ?? null,
    makeThumb: async () => new Blob(["t"]),
    upload: async (p, b) => (objects.has(p) ? "exists" : (objects.set(p, b), "ok")),
    setThumb: async (id, p) => (rows.get(id) ? false : (rows.set(id, p), true)),
  };
  return { objects, rows, deps };
}
const files = (): LegacyFile[] => [
  { id: "a", storage_path: "orig/a.jpg", mime_type: "image/jpeg", thumb_path: null },
  { id: "b", storage_path: "orig/b.png", mime_type: "image/png", thumb_path: null },
  { id: "p", storage_path: "orig/p.pdf", mime_type: "application/pdf", thumb_path: null },
  { id: "h", storage_path: "orig/h.heic", mime_type: "image/heic", thumb_path: null },
];

describe("miniatures des anciennes photos", () => {
  it("crée les miniatures sans toucher aux originaux ni aux PDF", async () => {
    const f = fake(); const before = await f.objects.get("orig/a.jpg")!.text();
    const r = await backfillThumbs("c1", files(), f.deps);
    expect(r).toEqual({ created: 2, reused: 0, skipped: 2, failed: 0 });
    expect(await f.objects.get("orig/a.jpg")!.text()).toBe(before);
    expect(f.rows.get("a")).toBe(legacyThumbPath("c1", "a"));
    expect(f.rows.has("p")).toBe(false);
  });
  it("reprise après interruption : aucun doublon", async () => {
    const f = fake();
    await backfillThumbs("c1", files(), f.deps, 1);
    const count = f.objects.size;
    // Liste relue avant que la base reflète la 1re miniature (pire cas) :
    const r = await backfillThumbs("c1", files(), f.deps);
    expect(r.created).toBe(1); expect(r.reused).toBe(1);
    expect(f.objects.size).toBe(count + 1);
  });
  it("original illisible (droits refusés) : échec compté, rien créé", async () => {
    const f = fake(); f.deps.download = async () => null;
    const r = await backfillThumbs("c1", files(), f.deps);
    expect(r.failed).toBe(2); expect(f.rows.size).toBe(0);
  });
});

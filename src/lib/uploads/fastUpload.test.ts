import { describe, it, expect } from "vitest";
import { targetSize, withRetry, runLimited } from "./fastUpload";

describe("fastUpload", () => {
  it("réduit une photo 4032x3024 à 2560 px sur le grand côté", () => {
    expect(targetSize(4032, 3024)).toEqual({ w: 2560, h: 1920 });
  });
  it("ne grossit jamais une petite photo", () => {
    expect(targetSize(1200, 900)).toEqual({ w: 1200, h: 900 });
  });
  it("reprend jusqu'à 3 essais", async () => {
    let n = 0;
    const v = await withRetry(async () => { if (++n < 3) throw Error("x"); return "ok"; }, 3, 1);
    expect([v, n]).toEqual(["ok", 3]);
  });
  it("limite à 3 envois simultanés et garde l'ordre", async () => {
    let live = 0, peak = 0;
    const r = await runLimited([1, 2, 3, 4, 5, 6], 3, async (x) => { live++; peak = Math.max(peak, live); await new Promise((s) => setTimeout(s, 5)); live--; return x * 2; });
    expect(peak).toBe(3);
    expect(r.map((x) => (x as PromiseFulfilledResult<number>).value)).toEqual([2, 4, 6, 8, 10, 12]);
  });
});

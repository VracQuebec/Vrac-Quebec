// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileResponse } from "./readProgress";

describe("document original lu progressivement", () => {
  it("conserve exactement les octets et expose la taille reçue", async () => {
    const bytes = new Uint8Array([0, 255, 12, 42]);
    const progress: number[] = [];
    const blob = await readFileResponse(new Response(bytes, { headers: { "content-length": "4", "content-type": "application/pdf" } }), p => progress.push(p.received));
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    expect(progress).toEqual([0, 4]);
    expect(blob.type).toBe("application/pdf");
  });
  it("ne prétend pas connaître une taille absente", async () => {
    const totals: (number | null)[] = [];
    await readFileResponse(new Response("abc"), p => totals.push(p.total));
    expect(totals).toEqual([null, null]);
  });
});
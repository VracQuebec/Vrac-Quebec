import { describe, it, expect } from "vitest";
import { routingBatches } from "@/lib/entrepreneur/comparateur-candidates";

const origin = { lat: 46.7765, lng: -71.2705 };
const far = (i: number) => ({ id: `far-${i}`, latitude: 45.6 + i * 0.0001, longitude: -72.9 });

describe("comparateur — candidates routières", () => {
  it("une dompe proche placée après la 100e entrée est incluse dans le premier lot", () => {
    const items = [...Array.from({ length: 150 }, (_, i) => far(i)), { id: "d24", latitude: 46.78, longitude: -71.27 }];
    const batches = routingBatches(items, origin);
    expect(batches[0][0].id).toBe("d24");
  });

  it("découpe en lots de 100 et plafonne le nombre de candidates", () => {
    const items = Array.from({ length: 450 }, (_, i) => far(i));
    const batches = routingBatches(items, origin);
    expect(batches.map((b) => b.length)).toEqual([100, 100]);
  });

  it("ignore les dompes sans coordonnées", () => {
    const batches = routingBatches([{ id: "x", latitude: null, longitude: null }], origin);
    expect(batches).toEqual([]);
  });
});

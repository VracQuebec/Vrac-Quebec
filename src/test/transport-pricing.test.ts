import { describe, expect, it } from "vitest";
import { computeTransportPricing, computeRequestTotal, type TruckRate } from "@/lib/transport/pricing";

const TAXES = { tps: 0.05, tvq: 0.09975 };
const rate = (code: string, label: string, price: number): TruckRate => ({ code, label, price_per_trip: price });

const R = {
  traileur: rate("traileur", "Traileur", 35),
  dix: rate("10_roues", "10 roues", 70),
  douze: rate("12_roues", "12 roues", 80),
  semi2: rate("semi_2_essieux", "Semi 2 essieux", 105),
  semi3: rate("semi_3_essieux", "Semi 3 essieux", 130),
  semi4: rate("semi_4_essieux", "Semi 4 essieux", 155),
};

const sub = (r: TruckRate, trips: number) => {
  const p = computeTransportPricing(r, trips, TAXES);
  if ("error" in p) throw new Error(p.error);
  return p;
};

describe("tarification du transport (par voyage)", () => {
  it("tarifs officiels × voyages", () => {
    expect(sub(R.dix, 1).subtotal).toBe(70);
    expect(sub(R.dix, 5).subtotal).toBe(350);
    expect(sub(R.douze, 1).subtotal).toBe(80);
    expect(sub(R.douze, 5).subtotal).toBe(400);
    expect(sub(R.semi2, 3).subtotal).toBe(315);
    expect(sub(R.semi3, 4).subtotal).toBe(520);
    expect(sub(R.semi4, 5).subtotal).toBe(775);
    expect(sub(R.traileur, 1).subtotal).toBe(35);
  });

  it("TPS, TVQ et total taxes incluses", () => {
    const p = sub(R.dix, 5);
    expect(p.tpsAmount).toBe(17.5);
    expect(p.tvqAmount).toBe(34.91);
    expect(p.total).toBe(402.41);
  });

  it("recalcule immédiatement au changement de camion ou de voyages", () => {
    expect(sub(R.dix, 5).subtotal).toBe(350);
    expect(sub(R.douze, 5).subtotal).toBe(400);
    expect(sub(R.douze, 2).subtotal).toBe(160);
  });

  it("bloque les entrées invalides", () => {
    expect(computeTransportPricing(null, 3, TAXES)).toHaveProperty("error");
    expect(computeTransportPricing(R.dix, 0, TAXES)).toHaveProperty("error");
    expect(computeTransportPricing(R.dix, -2, TAXES)).toHaveProperty("error");
    expect(computeTransportPricing(R.dix, "", TAXES)).toHaveProperty("error");
    expect(computeTransportPricing(R.dix, 1.5, TAXES)).toHaveProperty("error");
  });

  it("matériau + transport restent séparés, taxes appliquées une seule fois", () => {
    const p = sub(R.dix, 5);
    const t = computeRequestTotal(p, 1000);
    expect(t.material).toBe(1000);
    expect(t.transport).toBe(350);
    expect(t.subtotal).toBe(1350);
    expect(t.tpsAmount).toBe(67.5);
    expect(t.tvqAmount).toBe(134.66);
    expect(t.total).toBe(1552.16);
  });
});

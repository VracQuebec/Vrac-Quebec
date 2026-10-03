import { describe, expect, it } from "vitest";
import { summarize, type Trip } from "@/lib/ops/trips";
import { detectStops } from "@/lib/ops/stops";
import { nextStep, type Profile } from "@/lib/ops/cadence";

const t = (o: Partial<Trip>): Trip => ({
  id: Math.random().toString(), side: "recu", kind: "voyage", trip_date: "2026-10-01", count: 1, occurred_at: null,
  entrepreneur_label: "ABC", driver_label: null, truck_label: null, destination: null, coupon_number: null,
  photo_path: null, voided_at: null, created_at: "2026-10-01T10:00:00Z", ...o,
});

describe("voyages", () => {
  it("10 papier + 10 application = 10, jamais 20", () => {
    const rows = [...Array(10)].map(() => t({ side: "recu" })).concat([...Array(10)].map(() => t({ side: "livre" })));
    expect(summarize(rows).total).toBe(10);
  });
  it("total quotidien remplace les voyages unitaires", () => {
    expect(summarize([t({}), t({}), t({ kind: "total_jour", count: 7 })]).total).toBe(7);
  });
  it("écart = en attente, chaque entrepreneur séparé", () => {
    const s = summarize([t({ side: "recu", kind: "total_jour", count: 5 }), t({ side: "livre", kind: "total_jour", count: 6 }), t({ entrepreneur_label: "XYZ" })]);
    expect(s.pending).toBe(1); expect(s.total).toBe(1); expect(s.groups).toHaveLength(2);
  });
  it("annulé ignoré", () => { expect(summarize([t({ voided_at: "x" })]).total).toBe(0); });
});

describe("arrêts", () => {
  it("détecte un arrêt de 10 min", () => {
    const pts = [0, 2, 4, 6, 8, 10].map((m) => ({ lat: 46.8, lng: -71.2, recorded_at: new Date(Date.UTC(2026, 0, 1, 8, m)).toISOString() }))
      .concat([{ lat: 46.9, lng: -71.3, recorded_at: new Date(Date.UTC(2026, 0, 1, 8, 20)).toISOString() }]);
    const s = detectStops(pts); expect(s).toHaveLength(1); expect(s[0].minutes).toBe(10);
  });
});

describe("cadence", () => {
  const base: Profile = { audience: "client", signedUpAt: "2026-09-01", consent: true, unsubscribed: false, lastActivityAt: null,
    lastPromoAt: null, stepsIncomplete: false, remblaiFinishedAt: null, sent: ["bienvenue"], ignoredSinceInactive: 0 };
  it("plafond 7 jours", () => {
    expect(nextStep({ ...base, lastPromoAt: "2026-09-28" }, new Date("2026-10-01"))).toBeNull();
  });
  it("sans consentement : aucune promotion", () => {
    expect(nextStep({ ...base, consent: false }, new Date("2026-10-01"))).toBeNull();
  });
  it("désabonné : rien", () => { expect(nextStep({ ...base, sent: [], unsubscribed: true })).toBeNull(); });
});

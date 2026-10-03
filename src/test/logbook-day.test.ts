import { describe, expect, it } from "vitest";
import { dayBounds, daySegments, zonedToUtc } from "@/lib/logbook/day";

const TZ = "America/Toronto";
describe("LOG-01 journée", () => {
  it("bornes en UTC selon le terminus (EDT)", () => {
    const { start, end } = dayBounds("2026-09-10", "00:00", TZ);
    expect(start.toISOString()).toBe("2026-09-10T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-11T04:00:00.000Z");
  });
  it("activité traversant minuit coupée sur deux journées", () => {
    const ev = [{ id: "a", duty_status: "conduite", started_at: zonedToUtc("2026-09-10", "22:00", TZ).toISOString(), ended_at: zonedToUtc("2026-09-11", "02:00", TZ).toISOString(), state: "actif" }];
    const now = new Date("2026-09-20T00:00:00Z");
    const d1 = dayBounds("2026-09-10", "00:00", TZ), d2 = dayBounds("2026-09-11", "00:00", TZ);
    const s1 = daySegments(ev, d1.start, d1.end, now), s2 = daySegments(ev, d2.start, d2.end, now);
    expect(s1.segments.at(-1)).toMatchObject({ id: "a", to: d1.end.getTime() });
    expect(s2.segments[0]).toMatchObject({ id: "a", from: d2.start.getTime() });
  });
  it("historique incomplet : trous à compléter, aucun verdict positif", () => {
    const d = dayBounds("2026-09-10", "00:00", TZ);
    const r = daySegments([{ id: "a", duty_status: "repos", started_at: d.start.toISOString(), ended_at: zonedToUtc("2026-09-10", "08:00", TZ).toISOString(), state: "actif" }], d.start, d.end, new Date("2026-09-20T00:00:00Z"));
    expect(r.completeness).toBe("incomplete");
    expect(r.missingMin).toBe(16 * 60);
  });
  it("journée future jamais vérifiée; versions remplacées ignorées", () => {
    const d = dayBounds("2026-09-10", "00:00", TZ);
    const r = daySegments([{ id: "x", duty_status: "repos", started_at: d.start.toISOString(), ended_at: d.end.toISOString(), state: "remplace" }], d.start, d.end, new Date("2026-09-10T12:00:00Z"));
    expect(r.completeness).toBe("future_ou_en_cours");
    expect(r.segments.every((s) => s.status === "a_completer")).toBe(true);
  });
});

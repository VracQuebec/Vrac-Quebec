import { describe, it, expect } from "vitest";
import { rankDumps, dumpRoleLabel } from "@/lib/entrepreneur/dump-ranking";
const d = (id: string) => ({ id, availability_status: "available", truck_types_allowed: null, accessibility: null });
describe("classement des dompes", () => {
  it("aucun plafond de 80 km : 90 km classée avant 150 km", () => {
    const r = rankDumps([d("far"), d("mid")], { far: { distance_km: 150, duration_minutes: 100 }, mid: { distance_km: 90, duration_minutes: 60 } });
    expect(r.map((x) => x.id)).toEqual(["mid", "far"]);
  });
  it("sans itinéraire : distance null, jamais à vol d'oiseau, classée après", () => {
    const r = rankDumps([d("x"), d("y")], { y: { distance_km: 200, duration_minutes: 120 } });
    expect(r[0].id).toBe("y");
    expect(r[1].distance_km).toBeNull();
    expect(r[1].road_distance).toBe(false);
  });
  it("la sélection n'influence pas le libellé", () => {
    expect(dumpRoleLabel("a", "b")).toBe("Autres options");
    expect(dumpRoleLabel("b", "b")).toBe("Dompe recommandée");
  });
});

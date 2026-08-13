import { describe, it, expect, vi } from "vitest";
import {
  applyProximity,
  filterAnnuaire,
  mapAnnuaireProfil,
  loadAnnuaire,
  EMPTY_FILTERS,
  FORBIDDEN_COLUMNS,
  toProximityLocalisation,
  type AnnuaireProfil,
} from "@/lib/parcours/annuaire";
import type { PublicLocalisation } from "@/lib/parcours/localisation";

const ref = (p: Partial<PublicLocalisation>): PublicLocalisation => ({
  city: null, region: null, province: null, provinceName: null, postalSector: null, ...p,
});

const prof = (id: string, p: Partial<AnnuaireProfil> = {}): AnnuaireProfil => ({
  id,
  company: `Entreprise ${id}`,
  city: null,
  province: null,
  provinceName: null,
  region: null,
  postalSector: null,
  truckTypes: [],
  truckCount: null,
  locationLabel: null,
  locationComplete: false,
  proximity: "unknown",
  ...p,
});

const QUEBEC = ref({ city: "Québec", province: "QC", region: "Capitale-Nationale" });

const SAMPLE = [
  prof("unknown", {}),
  prof("autre-province", { city: "Toronto", province: "ON" }),
  prof("meme-province", { city: "Montréal", province: "QC" }),
  prof("meme-region", { city: "Beauport", province: "QC" }),
  prof("meme-ville", { city: "Québec", province: "QC" }),
];

const ids = (list: AnnuaireProfil[]) => list.map((p) => p.id);

describe("annuaire × proximité", () => {
  it("A/B/C/D — ordre ville > région > province > autre province > unknown", () => {
    expect(ids(applyProximity(SAMPLE, QUEBEC))).toEqual([
      "meme-ville", "meme-region", "meme-province", "autre-province", "unknown",
    ]);
  });

  it("E — profil invisible jamais retourné (filtrage serveur)", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: "1", company: "Visible", city: "Québec", province: "QC" }],
      error: null,
    });
    const res = await loadAnnuaire({ rpc } as never);
    expect(rpc).toHaveBeenCalledWith("get_entrepreneur_directory", {});
    expect(res.state).toBe("ok");
    if (res.state === "ok") expect(res.profils.map((p) => p.company)).toEqual(["Visible"]);
  });

  it("F/G/H — filtres de proximité", () => {
    const list = applyProximity(SAMPLE, QUEBEC);
    const f = (proximity: "same_city" | "same_region" | "same_province") =>
      ids(filterAnnuaire(list, { ...EMPTY_FILTERS, proximity }));
    expect(f("same_city")).toEqual(["meme-ville"]);
    expect(f("same_region")).toEqual(["meme-region"]);
    expect(f("same_province")).toEqual(["meme-province"]);
  });

  it("I — mode Tous conserve les profils unknown", () => {
    const list = filterAnnuaire(applyProximity(SAMPLE, QUEBEC), EMPTY_FILTERS);
    expect(ids(list)).toContain("unknown");
    expect(list).toHaveLength(SAMPLE.length);
  });

  it("J — aucune donnée privée retournée ni utilisée", () => {
    const mapped = mapAnnuaireProfil({
      id: "1", company: "X", city: "Québec", province: "QC",
      address: "123 rue Privée", phone: "581", email: "a@b.ca", user_id: "u", postal_code: "G1A 1A1",
    })!;
    for (const col of FORBIDDEN_COLUMNS) {
      expect(Object.keys(mapped)).not.toContain(col);
    }
    expect(Object.keys(toProximityLocalisation(mapped)).sort()).toEqual(
      ["city", "postalSector", "province", "provinceName", "region"],
    );
  });

  it("K — RLS inchangé : aucune requête ni colonne supplémentaire", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await loadAnnuaire({ rpc } as never);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("L — ordre existant conservé à égalité de proximité (tri stable)", () => {
    const same = [
      prof("a", { city: "Québec", province: "QC" }),
      prof("b", { city: "Québec", province: "QC" }),
      prof("c", { city: "Québec", province: "QC" }),
    ];
    expect(ids(applyProximity(same, QUEBEC))).toEqual(["a", "b", "c"]);
  });

  it("M — aucune N+1 : une seule passe, aucune requête par profil", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: Array.from({ length: 50 }, (_, i) => ({ id: String(i), company: `E${i}` })),
      error: null,
    });
    const res = await loadAnnuaire({ rpc } as never);
    expect(rpc).toHaveBeenCalledTimes(1);
    if (res.state === "ok") expect(applyProximity(res.profils, QUEBEC)).toHaveLength(50);
  });

  it("N — profil de référence sans localisation : ordre inchangé, tout unknown", () => {
    const out = applyProximity(SAMPLE, null);
    expect(ids(out)).toEqual(ids(SAMPLE));
    expect(out.every((p) => p.proximity === "unknown")).toBe(true);
    const empty = applyProximity(SAMPLE, ref({}));
    expect(empty.every((p) => p.proximity === "unknown")).toBe(true);
  });

  it("O — profil candidat sans localisation reste unknown et en dernier", () => {
    const out = applyProximity([prof("x"), prof("y", { city: "Québec", province: "QC" })], QUEBEC);
    expect(ids(out)).toEqual(["y", "x"]);
    expect(out[1].proximity).toBe("unknown");
  });

  it("P — hors Québec : aucune région inventée", () => {
    const out = applyProximity(
      [prof("on", { city: "Ottawa", province: "ON" })],
      ref({ city: "Toronto", province: "ON" }),
    );
    expect(out[0].proximity).toBe("same_province");
  });

  it("Q — accents et casse insensibles", () => {
    const out = applyProximity([prof("q", { city: "QUEBEC", province: "quebec" })], QUEBEC);
    expect(out[0].proximity).toBe("same_city");
  });

  it("R — faux rapprochement refusé", () => {
    const out = applyProximity([prof("qe", { city: "Québec-Est", province: "QC" })], QUEBEC);
    expect(out[0].proximity).not.toBe("same_city");
  });
});
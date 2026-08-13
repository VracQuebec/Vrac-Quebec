import { describe, it, expect } from "vitest";
import {
  addressFromPlaceComponents,
  normalizePlaceSelection,
  normalizeAddress,
  toPublicLocalisation,
} from "@/lib/parcours/localisation";
import { toPayload, validateProfilEdits, toEdits } from "@/lib/parcours/profil";

const comp = (longText: string, shortText: string, types: string[]) => ({ longText, shortText, types });

const quebecPlace = [
  comp("1234", "1234", ["street_number"]),
  comp("Rue Saint-Jean", "Rue Saint-Jean", ["route"]),
  comp("Québec", "Québec", ["locality", "political"]),
  comp("Québec", "QC", ["administrative_area_level_1"]),
  comp("Canada", "CA", ["country"]),
  comp("G1R 1P5", "G1R 1P5", ["postal_code"]),
];

describe("capture structurée de la localisation", () => {
  it("A — adresse québécoise structurée", () => {
    expect(addressFromPlaceComponents(quebecPlace)).toBe("Québec, QC, G1R 1P5");
  });

  it("B — ville + province correctement extraites", () => {
    const loc = normalizePlaceSelection(quebecPlace);
    expect(loc.city).toBe("Québec");
    expect(loc.province).toBe("QC");
    expect(loc.provinceName).toBe("Québec");
    expect(loc.status).toBe("reliable");
  });

  it("C — adresse invalide", () => {
    const loc = normalizePlaceSelection([], "@@@@");
    expect(["unnormalizable", "partial"]).toContain(loc.status);
    expect(loc.region).toBeNull();
  });

  it("D — résultat incomplet (province seule)", () => {
    const loc = normalizePlaceSelection([comp("Québec", "QC", ["administrative_area_level_1"])]);
    expect(loc.province).toBe("QC");
    expect(loc.status).toBe("partial");
  });

  it("E — texte libre sans sélection : pipeline inchangé", () => {
    const txt = "500 Boulevard Charest Est, Québec, QC";
    expect(normalizePlaceSelection(undefined, txt)).toEqual(normalizeAddress(txt));
  });

  it("F — province inconnue", () => {
    const loc = normalizePlaceSelection([
      comp("Springfield", "Springfield", ["locality"]),
      comp("Zzzland", "ZZ", ["administrative_area_level_1"]),
    ]);
    expect(loc.province).toBeNull();
    expect(loc.region).toBeNull();
  });

  it("G — ville inconnue mais province fiable", () => {
    const loc = normalizePlaceSelection([
      comp("Saint-Trucville", "Saint-Trucville", ["locality"]),
      comp("Québec", "QC", ["administrative_area_level_1"]),
    ]);
    expect(loc.city).toBe("Saint-Trucville");
    expect(loc.province).toBe("QC");
    expect(loc.region).toBeNull();
  });

  it("H — région déterminée par le référentiel local", () => {
    const loc = normalizePlaceSelection([
      comp("Trois-Rivières", "Trois-Rivières", ["locality"]),
      comp("Québec", "QC", ["administrative_area_level_1"]),
    ]);
    expect(loc.region).toBe("Mauricie");
  });

  it("I — aucune région inventée sans province", () => {
    const loc = normalizePlaceSelection([comp("Gatineau", "Gatineau", ["locality"])]);
    expect(loc.region).toBeNull();
  });

  it("J — données privées jamais exposées", () => {
    const loc = normalizePlaceSelection(quebecPlace);
    const pub = toPublicLocalisation(loc) as unknown as Record<string, unknown>;
    expect(Object.keys(pub).sort()).toEqual(
      ["city", "postalSector", "province", "provinceName", "region"],
    );
    expect(JSON.stringify(pub)).not.toContain("1234");
    expect(JSON.stringify(pub)).not.toContain("G1R 1P5");
    expect(pub.postalSector).toBe("G1R");
  });

  it("K — sauvegarde du profil inchangée", () => {
    const edits = toEdits({ company: "Excavation X", address: "1234 Rue Saint-Jean, Québec, QC G1R 1P5" });
    expect(validateProfilEdits(edits)).toEqual({});
    expect(Object.keys(toPayload(edits)).sort()).toEqual(
      ["address", "company", "contact_name", "phone", "truck_count", "truck_types"],
    );
    expect(toPayload(edits).address).toBe("1234 Rue Saint-Jean, Québec, QC G1R 1P5");
  });

  it("L — profil existant toujours lisible", () => {
    const loc = normalizeAddress("100 Rue Principale, Lévis, QC");
    expect(loc.city).toBe("Lévis");
    expect(loc.status).toBe("reliable");
  });

  it("N — absence de composants et d'adresse", () => {
    const loc = normalizePlaceSelection(undefined, undefined);
    expect(loc.status).toBe("missing");
  });

  it("O — composants corrompus : fallback propre", () => {
    const loc = normalizePlaceSelection({ oops: true } as unknown, "Sherbrooke, QC");
    expect(loc.city).toBe("Sherbrooke");
    expect(loc.province).toBe("QC");
  });
});

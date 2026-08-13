import { describe, it, expect } from "vitest";
import { resolveProvince, resolveCity, geoKey } from "@/lib/parcours/geo-referentiel";
import { normalizeAddress, toPublicLocalisation } from "@/lib/parcours/localisation";
import { buildProfil } from "@/lib/parcours/profil";

describe("Référentiel ville / province / région", () => {
  it("A — ville québécoise connue → région officielle", () => {
    const loc = normalizeAddress("100 Rue Test, Lévis, QC");
    expect(loc.city).toBe("Lévis");
    expect(loc.province).toBe("QC");
    expect(loc.region).toBe("Chaudière-Appalaches");
    expect(loc.status).toBe("reliable");
  });

  it("B — ville avec accents manquants → nom officiel accentué", () => {
    const loc = normalizeAddress("10 Rue A, Quebec, QC");
    expect(loc.city).toBe("Québec");
    expect(loc.region).toBe("Capitale-Nationale");
  });

  it("C — casse différente", () => {
    expect(resolveCity("MONTREAL", "QC")?.name).toBe("Montréal");
    expect(resolveCity("montréal", "QC")?.region).toBe("Montréal");
  });

  it("D — espaces superflus", () => {
    expect(resolveCity("  Trois-Rivières  ", "QC")?.region).toBe("Mauricie");
    expect(geoKey("  Saint - Nicolas ")).toBe("saint nicolas");
  });

  it("E — ville inconnue : conservée, aucune région", () => {
    const loc = normalizeAddress("5 Rue B, Villeneuve-Inconnue, QC");
    expect(loc.city).toBe("Villeneuve-Inconnue");
    expect(loc.region).toBeNull();
  });

  it("F — province inconnue reste nulle", () => {
    expect(resolveProvince("XX")).toBeNull();
    expect(resolveProvince("République")).toBeNull();
    const loc = normalizeAddress("Sherbrooke");
    expect(loc.province).toBeNull();
    expect(loc.region).toBeNull();
    expect(loc.status).toBe("partial");
  });

  it("G — ville connue + province connue (hors Québec)", () => {
    const loc = normalizeAddress("22 King Street, Ottawa, ON");
    expect(loc.province).toBe("ON");
    expect(loc.provinceName).toBe("Ontario");
    expect(loc.region).toBeNull();
  });

  it("H — ville connue mais région non déterminable sans province", () => {
    const loc = normalizeAddress("Gatineau");
    expect(loc.city).toBe("Gatineau");
    expect(loc.region).toBeNull();
    expect(loc.status).toBe("partial");
  });

  it("I — aucun faux rapprochement", () => {
    expect(resolveCity("Levy", "QC")).toBeNull();
    expect(resolveCity("Quebek", "QC")).toBeNull();
    expect(resolveCity("Montreal-Est", "QC")).toBeNull();
    expect(resolveCity("Lévis", "ON")).toBeNull();
  });

  it("J — données privées jamais retournées", () => {
    const address = "4567 Boulevard des Chutes, app. 3, Beauport, QC G1E 2K1";
    const pub = toPublicLocalisation(normalizeAddress(address));
    const json = JSON.stringify(pub);
    expect(json).not.toContain("4567");
    expect(json).not.toContain("Boulevard");
    expect(json).not.toContain("G1E 2K1");
    expect(pub.region).toBe("Capitale-Nationale");
    expect(pub.postalSector).toBe("G1E");
  });

  it("K — profil existant inchangé (champs et compteurs)", () => {
    const p = buildProfil(
      { company: "ABC", phone: "418-555-1234", address: "1 Rue A, Lévis, QC G6V 1A1" },
      { demandes: 2, chantiers: 1 },
    );
    expect(p.company).toBe("ABC");
    expect(p.demandes).toBe(2);
    expect(p.fields.find((f) => f.key === "phone")?.visibility).toBe("self");
    expect(p.localisation.postalCode).toBe("G6V 1A1");
    expect(p.localisation.region).toBe("Chaudière-Appalaches");
  });

  it("L — le référentiel n'expose aucune coordonnée ni distance", () => {
    const loc = normalizeAddress("1 Rue A, Laval, QC");
    expect(loc.latitude).toBeNull();
    expect(loc.longitude).toBeNull();
    expect(Object.keys(toPublicLocalisation(loc)).sort()).toEqual(
      ["city", "postalSector", "province", "provinceName", "region"],
    );
  });

  it("M — états de fiabilité préservés", () => {
    expect(normalizeAddress(null).status).toBe("missing");
    expect(normalizeAddress("1234").status).toBe("unnormalizable");
    expect(normalizeAddress("Lévis").status).toBe("partial");
    expect(normalizeAddress("1 Rue A, Lévis, QC").status).toBe("reliable");
  });
});

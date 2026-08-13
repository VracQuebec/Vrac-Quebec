import { describe, it, expect } from "vitest";
import {
  normalizeAddress,
  toPublicLocalisation,
  localisationLabel,
} from "@/lib/parcours/localisation";
import { buildProfil, PRIVATE_KEYS } from "@/lib/parcours/profil";

const counters = { demandes: 1, chantiers: 1 };

describe("Normalisation de la localisation du profil", () => {
  it("A — adresse complète valide → ville, province, secteur", () => {
    const loc = normalizeAddress("1234 Rue Principale, Saint-Nicolas, QC G7A 2M3, Canada");
    expect(loc.status).toBe("reliable");
    expect(loc.city).toBe("Saint-Nicolas");
    expect(loc.province).toBe("QC");
    expect(loc.postalSector).toBe("G7A");
    expect(localisationLabel(loc)).toBe("Saint-Nicolas, QC");
  });

  it("B — adresse absente", () => {
    const loc = normalizeAddress(null);
    expect(loc.status).toBe("missing");
    expect(loc.city).toBeNull();
    expect(loc.province).toBeNull();
    expect(loc.postalCode).toBeNull();
  });

  it("C — adresse partielle (ville seule)", () => {
    const loc = normalizeAddress("Lévis");
    expect(loc.status).toBe("partial");
    expect(loc.city).toBe("Lévis");
    expect(loc.province).toBeNull();
  });

  it("C2 — code postal seul", () => {
    const loc = normalizeAddress("G1V 2M3");
    expect(loc.status).toBe("partial");
    expect(loc.postalSector).toBe("G1V");
    expect(loc.city).toBeNull();
  });

  it("D — adresse non normalisable", () => {
    const loc = normalizeAddress("1234");
    expect(loc.status).toBe("unnormalizable");
    expect(loc.city).toBeNull();
    expect(loc.province).toBeNull();
  });

  it("E — localisation partielle : province sans ville", () => {
    const loc = normalizeAddress("QC, Canada");
    expect(loc.status).toBe("partial");
    expect(loc.province).toBe("QC");
    expect(loc.city).toBeNull();
  });

  it("F — aucun service externe : jamais de coordonnées inventées", () => {
    const loc = normalizeAddress("1234 Rue Principale, Québec, QC G1V 2M3");
    expect(loc.latitude).toBeNull();
    expect(loc.longitude).toBeNull();
  });

  it("G — l'adresse complète n'est jamais exposée", () => {
    const address = "4567 Boulevard des Chutes, app. 3, Beauport, QC G1E 2K1";
    const pub = toPublicLocalisation(normalizeAddress(address));
    const json = JSON.stringify(pub);
    expect(json).not.toContain("4567");
    expect(json).not.toContain("Boulevard");
    expect(json).not.toContain("app");
    expect(json).not.toContain("G1E 2K1");
    expect(pub.city).toBe("Beauport");
  });

  it("H — aucun user_id ni identifiant interne exposé", () => {
    const row = {
      id: "int-1", user_id: "uid-1", email: "a@b.c", company: "ABC",
      address: "12 Rue X, Lévis, QC G6V 1A1", tax_tps: "123", billing_address: "secret",
    };
    const p = buildProfil(row, counters);
    const json = JSON.stringify(p.publicLocalisation);
    for (const k of PRIVATE_KEYS) expect(json).not.toContain(String(row[k as keyof typeof row] ?? "@@"));
    expect(json).not.toContain("uid-1");
  });

  it("I — aucune donnée inventée (ville absente reste nulle)", () => {
    const loc = normalizeAddress("Canada");
    expect(loc.city).toBeNull();
    expect(loc.region).toBeNull();
    expect(loc.status).toBe("unnormalizable");
  });

  it("J — la localisation est dérivée de la seule ligne du compte connecté", () => {
    const a = buildProfil({ company: "A", address: "1 Rue A, Lévis, QC" }, counters);
    const b = buildProfil({ company: "B", address: "2 Rue B, Gatineau, QC" }, counters);
    expect(a.localisation.city).toBe("Lévis");
    expect(b.localisation.city).toBe("Gatineau");
    expect(a.localisation.city).not.toBe(b.localisation.city);
  });

  it("K — profil sans adresse : état « missing » explicite, aucun 0 ni faux positif", () => {
    const p = buildProfil({ company: "ABC" }, counters);
    expect(p.localisation.status).toBe("missing");
    expect(p.publicLocalisation).toEqual({ city: null, region: null, province: null, provinceName: null, postalSector: null });
  });

  it("L — le code postal complet reste privé, seul le secteur est exposable", () => {
    const loc = normalizeAddress("10 Rue Y, Québec, QC G1K 3T4");
    expect(loc.postalCode).toBe("G1K 3T4");
    expect(toPublicLocalisation(loc)).not.toHaveProperty("postalCode");
    expect(toPublicLocalisation(loc).postalSector).toBe("G1K");
  });
});

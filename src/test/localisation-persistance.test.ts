import { describe, it, expect } from "vitest";
import {
  normalizeAddress,
  normalizePlaceSelection,
  toStoredLocalisation,
  localisationFromRow,
  toPublicLocalisation,
} from "@/lib/parcours/localisation";
import {
  toPayload,
  toEdits,
  buildProfil,
  saveMyProfil,
  PRIVATE_KEYS,
  type ProfilEdits,
  type ProfilClient,
} from "@/lib/parcours/profil";

const edits = (over: Partial<ProfilEdits> = {}): ProfilEdits => ({
  company: "Excavation ABC",
  contact_name: "Jean",
  phone: "418-555-1234",
  address: "1234 Rue Principale, Québec, QC G1R 2B3",
  truck_types: [],
  truck_count: "",
  is_network_visible: false,
  ...over,
});

const placeComponents = [
  { longText: "1234", types: ["street_number"] },
  { longText: "Rue Principale", types: ["route"] },
  { longText: "Québec", shortText: "Québec", types: ["locality"] },
  { longText: "Quebec", shortText: "QC", types: ["administrative_area_level_1"] },
  { longText: "G1R 2B3", types: ["postal_code"] },
];

const client = (opts: { error?: { message: string } } = {}) => {
  const captured: Record<string, unknown>[] = [];
  const c = {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        captured.push(payload);
        return { select: () => Promise.resolve({ data: [], error: opts.error ?? null }) };
      },
    }),
  } as unknown as ProfilClient;
  return { c, captured };
};

describe("Persistance de la localisation normalisée", () => {
  it("A — profil avec adresse structurée (Google Places)", () => {
    const loc = normalizePlaceSelection(placeComponents, "1234 Rue Principale, Québec, QC G1R 2B3");
    const p = toPayload(edits(), loc);
    expect(p.address).toBe("1234 Rue Principale, Québec, QC G1R 2B3");
    expect(p.city).toBe("Québec");
  });

  it("B — city persistée", () => {
    expect(toPayload(edits()).city).toBe("Québec");
  });

  it("C — province persistée", () => {
    expect(toPayload(edits()).province).toBe("QC");
  });

  it("D — provinceName persistée", () => {
    expect(toPayload(edits()).province_name).toBe("Québec");
  });

  it("E — region persistée uniquement si déterminable par le référentiel", () => {
    expect(toPayload(edits()).region).toBe("Capitale-Nationale");
    const unknownCity = toPayload(edits({ address: "10 rue X, Villeinconnue, QC" }));
    expect(unknownCity.region).toBeNull();
  });

  it("F — postalSector conservé, code postal complet non persisté", () => {
    const p = toPayload(edits());
    expect(p.postal_sector).toBe("G1R");
    // Le code postal complet n'existe que dans `address` (privé).
    expect(Object.keys(p)).not.toContain("postal_code");
    expect(String(p.address)).toContain("G1R 2B3");
  });

  it("G — adresse complète reste privée (jamais dans la projection publique)", () => {
    const loc = normalizeAddress(edits().address);
    const pub = toPublicLocalisation(loc);
    expect(JSON.stringify(pub)).not.toContain("1234");
    expect(JSON.stringify(pub)).not.toContain("Rue Principale");
    expect((pub as unknown as Record<string, unknown>).postalCode).toBeUndefined();
  });

  it("H — ville inconnue → null", () => {
    expect(toPayload(edits({ address: "QC" })).city).toBeNull();
  });

  it("I — province inconnue → null", () => {
    expect(toPayload(edits({ address: "Trois-Rivières" })).province).toBeNull();
  });

  it("J — région non déterminable → null", () => {
    expect(toPayload(edits({ address: "Trois-Rivières" })).region).toBeNull();
  });

  it("K — aucune approximation : adresse vide → tout null", () => {
    const p = toPayload(edits({ address: "" }));
    expect(p.address).toBeNull();
    expect([p.city, p.province, p.province_name, p.region, p.postal_sector]).toEqual([
      null, null, null, null, null,
    ]);
  });

  it("L — profil existant sans colonnes de localisation : dérivation à la lecture", () => {
    const loc = localisationFromRow({ address: "12 rue A, Lévis, QC" });
    expect(loc.city).toBe("Lévis");
    expect(loc.province).toBe("QC");
  });

  it("L bis — colonnes persistées prioritaires sur la dérivation", () => {
    const loc = localisationFromRow({
      address: "12 rue A, Lévis, QC",
      city: "Saguenay",
      province: "QC",
      province_name: "Québec",
      region: "Saguenay–Lac-Saint-Jean",
      postal_sector: "G7H",
    });
    expect(loc.city).toBe("Saguenay");
    expect(loc.region).toBe("Saguenay–Lac-Saint-Jean");
    expect(loc.status).toBe("reliable");
  });

  it("M — sauvegarde réussie envoie les colonnes normalisées", async () => {
    const { c, captured } = client();
    const res = await saveMyProfil(edits(), c);
    expect(res.state).toBe("ok");
    expect(captured[0].city).toBe("Québec");
    expect(captured[0].province).toBe("QC");
  });

  it("N — erreur de sauvegarde remontée sans écraser l'état", async () => {
    const { c } = client({ error: { message: "boom" } });
    const res = await saveMyProfil(edits(), c);
    expect(res.state).toBe("error");
  });

  it("O — RLS : refus explicite si la policy bloque (utilisateur A vs B)", async () => {
    const { c } = client({ error: { message: "new row violates row-level security policy" } });
    const res = await saveMyProfil(edits(), c);
    expect(res.state).toBe("unauthorized");
  });

  it("P — lecture publique sans données privées", () => {
    const p = buildProfil(
      {
        company: "ABC",
        email: "prive@test.com",
        user_id: "uid",
        billing_address: "9 rue Facture",
        address: "1234 Rue Principale, Québec, QC G1R 2B3",
        city: "Québec",
        province: "QC",
        province_name: "Québec",
        region: "Capitale-Nationale",
        postal_sector: "G1R",
      },
      { demandes: 0, chantiers: 0 },
    );
    const pub = JSON.stringify(p.publicLocalisation);
    for (const k of PRIVATE_KEYS) expect(pub).not.toContain(k);
    expect(pub).not.toContain("1234");
    expect(p.publicLocalisation.city).toBe("Québec");
  });

  it("Q — lecture du profil après sauvegarde utilise les colonnes persistées", () => {
    const p = buildProfil(
      { company: "ABC", address: "1 rue A, Gatineau, QC", city: "Laval", province: "QC" },
      { demandes: null, chantiers: null },
    );
    expect(p.localisation.city).toBe("Laval");
  });

  it("R — compatibilité formulaire : toEdits ignore les colonnes de localisation", () => {
    const e = toEdits({ company: "ABC", address: "1 rue A", city: "Laval" });
    expect(Object.keys(e).sort()).toEqual(
      ["address", "company", "contact_name", "phone", "truck_count", "truck_types"].sort(),
    );
  });

  it("S — fallback texte libre normalisé de la même façon", () => {
    const free = toPayload(edits({ address: "5 boul. Test, Sherbrooke, QC J1H 1A1" }));
    expect(free.city).toBe("Sherbrooke");
    expect(free.postal_sector).toBe("J1H");
  });

  it("T — absence de Google Places : aucune localisation inventée", () => {
    const loc = normalizePlaceSelection(undefined, "");
    expect(toStoredLocalisation(loc)).toEqual({
      city: null, province: null, province_name: null, region: null, postal_sector: null,
    });
  });
});

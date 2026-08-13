import { describe, it, expect } from "vitest";
import {
  mapAnnuaireProfil,
  filterAnnuaire,
  buildFacets,
  loadAnnuaire,
  EMPTY_FILTERS,
  PUBLIC_COLUMNS,
  FORBIDDEN_COLUMNS,
  type AnnuaireProfil,
} from "@/lib/parcours/annuaire";
import type { RpcClient } from "@/lib/parcours/validation";

const ROW = (extra: Record<string, unknown> = {}) => ({
  id: "e1",
  company: "Excavation Tremblay",
  city: "Québec",
  province: "QC",
  province_name: "Québec",
  region: "Capitale-Nationale",
  postal_sector: "G1V",
  truck_types: ["Camion 10 roues"],
  truck_count: "4",
  ...extra,
});

const P = (extra: Record<string, unknown> = {}): AnnuaireProfil =>
  mapAnnuaireProfil(ROW(extra))!;

const client = (rows: unknown[], err?: string): RpcClient =>
  ({ rpc: async () => ({ data: rows, error: err ? { message: err } : null }) }) as unknown as RpcClient;

describe("Annuaire professionnel — V1", () => {
  it("A — la route lit uniquement la RPC publique", async () => {
    let fn = "";
    let args: unknown = "none";
    const spy = { rpc: async (f: string, a: unknown) => { fn = f; args = a; return { data: [], error: null }; } } as unknown as RpcClient;
    await loadAnnuaire(spy);
    expect(fn).toBe("get_entrepreneur_directory");
    expect(args).toEqual({});
  });

  it("B — chargement des profils publics", async () => {
    const res = await loadAnnuaire(client([ROW(), ROW({ id: "e2", company: "Transport Roy" })]));
    expect(res.state).toBe("ok");
    expect(res.state === "ok" && res.profils).toHaveLength(2);
  });

  it("C — projection publique correcte", () => {
    const p = P();
    expect(p).toMatchObject({
      id: "e1",
      company: "Excavation Tremblay",
      city: "Québec",
      province: "QC",
      provinceName: "Québec",
      region: "Capitale-Nationale",
      postalSector: "G1V",
      truckCount: "4",
      locationComplete: true,
    });
    expect(p.locationLabel).toBe("Québec, Québec");
  });

  it("D à H — aucune donnée privée projetée", () => {
    const p = P({ address: "123 rue Privée", email: "a@b.c", phone: "418", user_id: "u1", tax_tps: "1", tax_tvq: "2", notes: "secret", billing_address: "x" }) as unknown as Record<string, unknown>;
    for (const k of ["address", "email", "phone", "user_id", "tax_tps", "tax_tvq", "notes", "billing_address"]) {
      expect(p[k]).toBeUndefined();
    }
    expect(JSON.stringify(p)).not.toContain("rue Privée");
  });

  it("I — recherche par entreprise", () => {
    const rows = [P(), P({ id: "e2", company: "Transport Roy" })];
    expect(filterAnnuaire(rows, { ...EMPTY_FILTERS, query: "tremblay" })).toHaveLength(1);
  });

  it("J — recherche par ville (insensible aux accents)", () => {
    const rows = [P(), P({ id: "e2", company: "Roy", city: "Lévis" })];
    expect(filterAnnuaire(rows, { ...EMPTY_FILTERS, query: "levis" })[0].id).toBe("e2");
  });

  it("K — filtre province", () => {
    const rows = [P(), P({ id: "e2", province: "ON", province_name: "Ontario", city: "Ottawa", region: null })];
    expect(filterAnnuaire(rows, { ...EMPTY_FILTERS, province: "Ontario" })).toHaveLength(1);
  });

  it("L — filtre région", () => {
    const rows = [P(), P({ id: "e2", region: "Estrie" })];
    expect(filterAnnuaire(rows, { ...EMPTY_FILTERS, region: "Estrie" })[0].id).toBe("e2");
  });

  it("M — filtre type de camion", () => {
    const rows = [P(), P({ id: "e2", truck_types: ["Fardier"] })];
    expect(filterAnnuaire(rows, { ...EMPTY_FILTERS, truckType: "Fardier" })[0].id).toBe("e2");
  });

  it("N — combinaison recherche + filtre", () => {
    const rows = [P(), P({ id: "e2", company: "Roy", city: "Lévis" })];
    expect(filterAnnuaire(rows, { ...EMPTY_FILTERS, query: "roy", city: "Québec" })).toHaveLength(0);
  });

  it("O — aucun résultat", () => {
    expect(filterAnnuaire([P()], { ...EMPTY_FILTERS, query: "inexistant" })).toHaveLength(0);
  });

  it("P — liste vide gérée sans invention", async () => {
    const res = await loadAnnuaire(client([]));
    expect(res.state === "ok" && res.profils).toEqual([]);
  });

  it("Q — erreur de chargement", async () => {
    expect((await loadAnnuaire(client([], "boom"))).state).toBe("error");
    expect((await loadAnnuaire(client([], "permission denied"))).state).toBe("unauthorized");
  });

  it("R — localisation partielle", () => {
    const p = P({ province: null, province_name: null, region: null });
    expect(p.locationComplete).toBe(false);
    expect(p.locationLabel).toBe("Québec");
  });

  it("S — profil sans région : aucune région inventée", () => {
    expect(P({ region: null }).region).toBeNull();
  });

  it("T — profil sans ville", () => {
    const p = P({ city: null });
    expect(p.city).toBeNull();
    expect(p.locationLabel).toBe("Québec");
  });

  it("U — facettes issues des données réelles uniquement", () => {
    const f = buildFacets([P(), P({ id: "e2", city: "Lévis", region: null, truck_types: ["Fardier"] })]);
    expect(f.cities).toEqual(["Lévis", "Québec"]);
    expect(f.regions).toEqual(["Capitale-Nationale"]);
    expect(f.truckTypes).toEqual(["Camion 10 roues", "Fardier"]);
    expect(f.provinces).toEqual(["Québec"]);
  });

  it("V — sécurité : colonnes publiques/privées explicites", () => {
    expect([...PUBLIC_COLUMNS]).not.toContain("address");
    for (const k of FORBIDDEN_COLUMNS) expect([...PUBLIC_COLUMNS]).not.toContain(k);
  });

  it("W — lignes invalides ignorées (aucune fiche fantôme)", async () => {
    const res = await loadAnnuaire(client([ROW(), { id: "x" }, null, { company: "Sans id" }]));
    expect(res.state === "ok" && res.profils).toHaveLength(1);
  });

  it("X — truck_types manquant reste vide", () => {
    expect(P({ truck_types: null }).truckTypes).toEqual([]);
  });
});

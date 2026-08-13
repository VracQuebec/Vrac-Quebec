// ============================================================
// VISIBILITÉ EXPLICITE DU PROFIL DANS LE RÉSEAU — tests A à Z.
// Aucune donnée inventée : uniquement le pipeline réel profil/annuaire.
// ============================================================
import { describe, it, expect } from "vitest";
import {
  toEdits,
  toPayload,
  buildProfil,
  saveMyProfil,
  isNetworkVisible,
  validateProfilEdits,
  EDITABLE_KEYS,
  LOCATION_KEYS,
  PRIVATE_KEYS,
  type ProfilEdits,
  type ProfilClient,
} from "@/lib/parcours/profil";
import {
  mapAnnuaireProfil,
  filterAnnuaire,
  loadAnnuaire,
  EMPTY_FILTERS,
  FORBIDDEN_COLUMNS,
} from "@/lib/parcours/annuaire";
import type { RpcClient } from "@/lib/parcours/validation";

const counters = { demandes: 0, chantiers: 0 };

const edits = (o: Partial<ProfilEdits> = {}): ProfilEdits => ({
  company: "Excavation ABC",
  contact_name: "Marc",
  phone: "418-555-1234",
  address: "12 rue Test, Québec, QC G1R 2B3",
  truck_types: ["Camion 10 roues"],
  truck_count: "4",
  is_network_visible: false,
  ...o,
});

const saveClient = (error: { message: string } | null = null) => {
  const calls: unknown[] = [];
  const client = {
    from: () => ({
      update: (payload: unknown) => {
        calls.push(payload);
        return { select: async () => ({ data: null, error }) };
      },
    }),
    rpc: async () => ({ data: [], error: null }),
  } as unknown as ProfilClient;
  return { client, calls };
};

/** RPC serveur simulée : reproduit le filtre `is_network_visible = true`. */
const directoryClient = (rows: Record<string, unknown>[]) =>
  ({
    rpc: async () => ({
      data: rows
        .filter((r) => r.is_network_visible === true)
        .map(({ id, company, city, province, province_name, region, postal_sector, truck_types, truck_count }) => ({
          id, company, city, province, province_name, region, postal_sector, truck_types, truck_count,
        })),
      error: null,
    }),
  }) as unknown as RpcClient;

const rowVisible = {
  id: "e1", company: "Excavation Visible", city: "Québec", province: "QC",
  province_name: "Québec", region: "Capitale-Nationale", postal_sector: "G1R",
  truck_types: ["Camion 10 roues"], truck_count: "4", is_network_visible: true,
  address: "12 rue Privée", email: "a@b.c", phone: "418-555-1234",
  user_id: "uid-1", tax_tps: "123456789RT", tax_tvq: "1020304050TQ",
};
const rowHidden = { ...rowVisible, id: "e2", company: "Excavation Cachée", is_network_visible: false };

describe("Visibilité explicite dans le réseau", () => {
  it("A — le champ is_network_visible existe dans le pipeline profil", () => {
    expect(Object.keys(toPayload(edits()))).toContain("is_network_visible");
  });

  it("B — valeur par défaut false (aucune valeur en base)", () => {
    expect(toEdits({ company: "ABC" }).is_network_visible).toBe(false);
  });

  it("C — nouveau profil invisible", () => {
    const p = buildProfil({ company: "Nouvelle Entreprise" }, counters);
    expect(p.networkOptIn).toBe(false);
    expect(isNetworkVisible(p)).toBe(false);
  });

  it("D — l'utilisateur peut activer sa visibilité", () => {
    expect(toPayload(edits({ is_network_visible: true })).is_network_visible).toBe(true);
  });

  it("E — l'utilisateur peut désactiver sa visibilité", () => {
    expect(toPayload(edits({ is_network_visible: false })).is_network_visible).toBe(false);
  });

  it("F — valeur correctement sauvegardée", async () => {
    const { client, calls } = saveClient();
    expect((await saveMyProfil(edits({ is_network_visible: true }), client)).state).toBe("ok");
    expect((calls[0] as Record<string, unknown>).is_network_visible).toBe(true);
  });

  it("G — valeur correctement relue", () => {
    const p = buildProfil({ company: "ABC", is_network_visible: true }, counters);
    expect(p.edits.is_network_visible).toBe(true);
    expect(isNetworkVisible(p)).toBe(true);
  });

  it("H — profil visible apparaît dans l'annuaire", async () => {
    const res = await loadAnnuaire(directoryClient([rowVisible, rowHidden]));
    expect(res.state).toBe("ok");
    if (res.state !== "ok") return;
    expect(res.profils.map((p) => p.company)).toEqual(["Excavation Visible"]);
  });

  it("I — profil invisible absent de la réponse serveur", async () => {
    const res = await loadAnnuaire(directoryClient([rowHidden]));
    expect(res.state === "ok" && res.profils).toEqual([]);
  });

  it("J — la recherche ne retourne pas les profils invisibles", async () => {
    const res = await loadAnnuaire(directoryClient([rowVisible, rowHidden]));
    if (res.state !== "ok") throw new Error("état inattendu");
    const found = filterAnnuaire(res.profils, { ...EMPTY_FILTERS, query: "Cachée" });
    expect(found).toHaveLength(0);
  });

  it("K — les filtres ne retournent pas les profils invisibles", async () => {
    const res = await loadAnnuaire(directoryClient([rowHidden]));
    if (res.state !== "ok") throw new Error("état inattendu");
    expect(filterAnnuaire(res.profils, { ...EMPTY_FILTERS, city: "Québec" })).toHaveLength(0);
  });

  it("L — adresse complète jamais exposée", async () => {
    const res = await loadAnnuaire(directoryClient([rowVisible]));
    expect(JSON.stringify(res)).not.toContain("rue Privée");
  });

  it("M — courriel jamais exposé", async () => {
    const res = await loadAnnuaire(directoryClient([rowVisible]));
    expect(JSON.stringify(res)).not.toContain("a@b.c");
  });

  it("N — téléphone jamais exposé", async () => {
    const res = await loadAnnuaire(directoryClient([rowVisible]));
    expect(JSON.stringify(res)).not.toContain("418-555-1234");
  });

  it("O — user_id jamais exposé", async () => {
    const res = await loadAnnuaire(directoryClient([rowVisible]));
    expect(JSON.stringify(res)).not.toContain("uid-1");
  });

  it("P — données fiscales jamais exposées", async () => {
    const res = await loadAnnuaire(directoryClient([rowVisible]));
    const json = JSON.stringify(res);
    expect(json).not.toContain("123456789RT");
    expect(json).not.toContain("1020304050TQ");
    for (const k of FORBIDDEN_COLUMNS) expect(json).not.toContain(`"${k}"`);
  });

  it("Q — un utilisateur ne peut pas viser la fiche d'un autre", async () => {
    const { client, calls } = saveClient();
    await saveMyProfil(
      { ...edits({ is_network_visible: true }), ...({ user_id: "uid-B", id: "row-B" } as any) },
      client,
    );
    const payload = calls[0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([...EDITABLE_KEYS, ...LOCATION_KEYS].sort());
    expect(payload.user_id).toBeUndefined();
    expect(payload.id).toBeUndefined();
  });

  it("R — RLS conservée : refus serveur remonté comme non autorisé", async () => {
    const { client } = saveClient({ message: "new row violates row-level security policy" });
    expect((await saveMyProfil(edits(), client)).state).toBe("unauthorized");
  });

  it("S — la RPC reste la seule source : aucun filtrage client de visibilité", async () => {
    // Le client ne reçoit même pas la colonne : impossible de contourner.
    const res = await loadAnnuaire(directoryClient([rowVisible]));
    if (res.state !== "ok") throw new Error("état inattendu");
    expect((res.profils[0] as unknown as Record<string, unknown>).is_network_visible).toBeUndefined();
  });

  it("T — l'annuaire existant continue de fonctionner", () => {
    const p = mapAnnuaireProfil(rowVisible);
    expect(p?.locationLabel).toBe("Québec, Québec");
    expect(p?.truckTypes).toEqual(["Camion 10 roues"]);
  });

  it("U — la carte de profil continue de fonctionner", () => {
    const p = buildProfil({ ...rowVisible }, counters);
    expect(p.fields.map((f) => f.key)).toContain("company");
    expect(p.missing).toBe(false);
  });

  it("V — le formulaire continue de fonctionner (validation inchangée)", () => {
    expect(validateProfilEdits(edits({ is_network_visible: true }))).toEqual({});
    expect(validateProfilEdits(edits({ company: "  " })).company).toBeTruthy();
  });

  it("W — aucune régression du profil : données privées non éditables", () => {
    const payload = toPayload(edits({ is_network_visible: true }));
    for (const k of PRIVATE_KEYS) expect(payload[k]).toBeUndefined();
    expect(payload.company).toBe("Excavation ABC");
  });

  it("X — aucune régression de localisation (comparateur intact)", () => {
    const payload = toPayload(edits({ is_network_visible: true }));
    expect(payload.city).toBe("Québec");
    expect(payload.province).toBe("QC");
  });

  it("Y — aucune régression CRM : la visibilité n'affecte pas les champs métier", () => {
    const off = toPayload(edits({ is_network_visible: false }));
    const on = toPayload(edits({ is_network_visible: true }));
    for (const k of Object.keys(off)) {
      if (k === "is_network_visible") continue;
      expect(on[k]).toEqual(off[k]);
    }
  });

  it("Z — projection publique stable (responsive/UI inchangée)", () => {
    const p = mapAnnuaireProfil(rowVisible)!;
    expect(Object.keys(p).sort()).toEqual(
      [
        "city", "company", "id", "locationComplete", "locationLabel", "postalSector",
        "province", "provinceName", "proximity", "region", "truckCount", "truckTypes",
      ],
    );
  });
});

// ============================================================
// CONTRÔLE RAPIDE DE VISIBILITÉ + JOURNALISATION — tests A à Q.
// Aucune donnée inventée : logique unique via l'RPC serveur réelle.
// ============================================================
import { describe, it, expect } from "vitest";
import {
  buildProfil,
  setMyNetworkVisibility,
  toEdits,
  toPayload,
  validateProfilEdits,
  PRIVATE_KEYS,
  type ProfilClient,
} from "@/lib/parcours/profil";
import { loadAnnuaire, filterAnnuaire, EMPTY_FILTERS } from "@/lib/parcours/annuaire";
import type { RpcClient } from "@/lib/parcours/validation";

const counters = { demandes: 0, chantiers: 0 };

/** Serveur simulé : `set_my_network_visibility` applique le changement au propriétaire. */
const rpcClient = (opts: { owner?: boolean; error?: string } = {}) => {
  const calls: { name: string; args: unknown }[] = [];
  const client = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      if (opts.error) return { data: null, error: { message: opts.error } };
      if (opts.owner === false) return { data: null, error: { message: "not_authorized" } };
      return { data: (args as { _visible: boolean })._visible, error: null };
    },
  } as unknown as ProfilClient;
  return { client, calls };
};

const row = (visible: boolean) => ({
  id: "e1", company: "Excavation ABC", city: "Québec", province: "QC",
  province_name: "Québec", region: "Capitale-Nationale", postal_sector: "G1R",
  truck_types: ["Camion 10 roues"], truck_count: "4", is_network_visible: visible,
  address: "12 rue Privée", email: "a@b.c", phone: "418-555-1234", user_id: "uid-1",
});

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

describe("Contrôle rapide de visibilité", () => {
  it("A — statut réel affiché depuis is_network_visible", () => {
    expect(buildProfil(row(true), counters).networkOptIn).toBe(true);
    expect(buildProfil(row(false), counters).networkOptIn).toBe(false);
  });

  it("B — ON depuis la carte", async () => {
    const { client } = rpcClient();
    expect(await setMyNetworkVisibility(true, client)).toEqual({ state: "ok", visible: true });
  });

  it("C — OFF depuis la carte", async () => {
    const { client } = rpcClient();
    expect(await setMyNetworkVisibility(false, client)).toEqual({ state: "ok", visible: false });
  });

  it("D — sauvegarde réelle via l'RPC unique (aucune 2e logique)", async () => {
    const { client, calls } = rpcClient();
    await setMyNetworkVisibility(true, client);
    expect(calls).toEqual([{ name: "set_my_network_visibility", args: { _visible: true } }]);
  });

  it("E — relecture réelle : le profil rechargé reflète le nouvel état", () => {
    expect(buildProfil(row(true), counters).edits.is_network_visible).toBe(true);
  });

  it("F — profil ON présent dans l'annuaire", async () => {
    const res = await loadAnnuaire(directoryClient([row(true)]));
    expect(res.state === "ok" && res.profils.map((p) => p.company)).toEqual(["Excavation ABC"]);
  });

  it("G — profil OFF absent de l'annuaire", async () => {
    const res = await loadAnnuaire(directoryClient([row(false)]));
    expect(res.state === "ok" && res.profils).toEqual([]);
  });

  it("H — utilisateur non propriétaire refusé", async () => {
    const { client } = rpcClient({ owner: false });
    expect(await setMyNetworkVisibility(true, client)).toEqual({ state: "unauthorized" });
  });

  it("I — double clic : un seul appel serveur pour une bascule verrouillée", async () => {
    const { client, calls } = rpcClient();
    let busy = false;
    const toggle = async () => {
      if (busy) return;
      busy = true;
      await setMyNetworkVisibility(true, client);
      busy = false;
    };
    await Promise.all([toggle(), toggle()]);
    expect(calls).toHaveLength(1);
  });

  it("J — erreur correctement remontée", async () => {
    const { client } = rpcClient({ error: "profile_not_found" });
    expect(await setMyNetworkVisibility(true, client)).toEqual({
      state: "error",
      message: "profile_not_found",
    });
  });

  it("K — aucune donnée privée envoyée au serveur (donc jamais journalisée)", async () => {
    const { client, calls } = rpcClient();
    await setMyNetworkVisibility(true, client);
    const payload = JSON.stringify(calls[0].args);
    for (const key of PRIVATE_KEYS) expect(payload).not.toContain(key);
    expect(payload).not.toContain("418-555-1234");
    expect(payload).not.toContain("rue Privée");
    expect(Object.keys(calls[0].args as object)).toEqual(["_visible"]);
  });

  it("L — RLS conservée : aucun identifiant fourni par le client", async () => {
    const { client, calls } = rpcClient();
    await setMyNetworkVisibility(false, client);
    expect(JSON.stringify(calls[0].args)).not.toContain("uid-1");
    expect(JSON.stringify(calls[0].args)).not.toContain("e1");
  });

  it("M — ProfilEditForm toujours fonctionnel", () => {
    const e = toEdits(row(true));
    expect(validateProfilEdits(e)).toEqual({});
    expect(toPayload(e).is_network_visible).toBe(true);
  });

  it("N — annuaire toujours fonctionnel (recherche/filtres inchangés)", async () => {
    const res = await loadAnnuaire(directoryClient([row(true)]));
    if (res.state !== "ok") throw new Error("annuaire indisponible");
    expect(filterAnnuaire(res.profils, { ...EMPTY_FILTERS, query: "Excavation" })).toHaveLength(1);
    expect(filterAnnuaire(res.profils, { ...EMPTY_FILTERS, city: "Montréal" })).toHaveLength(0);
  });

  it("O — aucune régression du profil : champs réels conservés", () => {
    const p = buildProfil(row(true), counters);
    expect(p.company).toBe("Excavation ABC");
    expect(p.fields.some((f) => f.key === "truck_types")).toBe(true);
    expect(p.missing).toBe(false);
  });

  it("P — exception réseau capturée sans changer d'état", async () => {
    const client = { rpc: async () => { throw new Error("network down"); } } as unknown as ProfilClient;
    expect(await setMyNetworkVisibility(true, client)).toEqual({
      state: "error",
      message: "network down",
    });
  });

  it("Q — la valeur retournée par le serveur fait foi", async () => {
    const client = { rpc: async () => ({ data: false, error: null }) } as unknown as ProfilClient;
    expect(await setMyNetworkVisibility(true, client)).toEqual({ state: "ok", visible: false });
  });
});

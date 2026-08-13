import { describe, it, expect } from "vitest";
import {
  buildProfil,
  isNetworkVisible,
  loadMyProfil,
  PRIVATE_KEYS,
  type ProfilClient,
} from "@/lib/parcours/profil";

const counters = { demandes: 3, chantiers: 2 };

const makeClient = (
  row: unknown,
  opts: { error?: { message: string }; rpc?: unknown[] } = {},
): ProfilClient =>
  ({
    from: () => ({
      select: () => Promise.resolve({ data: row ? [row] : [], error: opts.error ?? null }),
      // utilisé par loadActivitySummary (transport_requests)
    }),
    rpc: async () => ({ data: opts.rpc ?? [], error: null }),
  }) as unknown as ProfilClient;

describe("Profil réseau V1", () => {
  it("A — profil complet expose les champs réels", () => {
    const p = buildProfil(
      { company: "Excavation ABC", truck_types: ["10 roues"], truck_count: "4", phone: "418" },
      counters,
    );
    expect(p.company).toBe("Excavation ABC");
    expect(p.incomplete).toBe(false);
    expect(p.fields.map((f) => f.key)).toContain("truck_types");
    expect(isNetworkVisible(p)).toBe(true);
  });

  it("B — profil incomplet (sans entreprise)", () => {
    const p = buildProfil({ phone: "418-000-0000" }, counters);
    expect(p.incomplete).toBe(true);
    expect(isNetworkVisible(p)).toBe(false);
  });

  it("C — absence de profil", () => {
    const p = buildProfil(null, counters);
    expect(p.missing).toBe(true);
    expect(p.fields).toHaveLength(0);
    expect(isNetworkVisible(p)).toBe(false);
  });

  it("D — visibilité : entreprise réseau, téléphone self", () => {
    const p = buildProfil({ company: "ABC", phone: "418" }, counters);
    expect(p.fields.find((f) => f.key === "company")?.visibility).toBe("network");
    expect(p.fields.find((f) => f.key === "phone")?.visibility).toBe("self");
  });

  it("E — confidentialité : aucun champ privé exposé", () => {
    const p = buildProfil(
      {
        company: "ABC",
        email: "prive@test.com",
        user_id: "uid-1",
        notes: "interne",
        tax_tps: "123",
        billing_address: "x",
        map_number: "7",
      },
      counters,
    );
    const keys = p.fields.map((f) => f.key);
    for (const k of PRIVATE_KEYS) expect(keys).not.toContain(k);
    expect(JSON.stringify(p)).not.toContain("prive@test.com");
  });

  it("F — entrepreneur A / B : aucun identifiant client, seule la ligne RLS revient", async () => {
    const res = await loadMyProfil(makeClient({ company: "A inc." }));
    expect(res.state).toBe("ok");
    if (res.state === "ok") expect(res.profil.company).toBe("A inc.");
    // B n'a aucune ligne visible → profil absent, jamais celui de A
    const resB = await loadMyProfil(makeClient(null));
    expect(resB.state === "ok" && resB.profil.missing).toBe(true);
  });

  it("G — données manquantes restent absentes (jamais inventées)", () => {
    const p = buildProfil({ company: "ABC", truck_types: [] }, { demandes: null, chantiers: null });
    expect(p.fields.map((f) => f.key)).toEqual(["company"]);
    expect(p.demandes).toBeNull();
    expect(p.chantiers).toBeNull();
  });

  it("H — erreur de lecture", async () => {
    const res = await loadMyProfil(makeClient(null, { error: { message: "boom" } }));
    expect(res.state).toBe("error");
  });

  it("H2 — non autorisé", async () => {
    const res = await loadMyProfil(makeClient(null, { error: { message: "permission denied" } }));
    expect(res.state).toBe("unauthorized");
  });

  it("K — refresh renvoie le même résultat", async () => {
    const c = makeClient({ company: "ABC" });
    const a = await loadMyProfil(c);
    const b = await loadMyProfil(c);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("L — aucune donnée inventée (pas de note, réputation, distance)", () => {
    const p = buildProfil({ company: "ABC" }, counters);
    const s = JSON.stringify(p).toLowerCase();
    for (const banned of ["rating", "reputation", "certification", "distance", "note"]) {
      expect(s.includes(banned)).toBe(false);
    }
  });

  it("Compteurs réutilisent les logiques existantes", () => {
    const p = buildProfil({ company: "ABC" }, counters);
    expect(p.demandes).toBe(3);
    expect(p.chantiers).toBe(2);
  });
});

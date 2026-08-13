import { describe, it, expect } from "vitest";
import {
  buildProfil,
  isNetworkVisible,
  loadMyProfil,
  PRIVATE_KEYS,
  LOCATION_KEYS,
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

// ============================================================
// ÉDITION CONTRÔLÉE DU PROFIL
// ============================================================
import {
  toEdits,
  toPayload,
  validateProfilEdits,
  saveMyProfil,
  EDITABLE_KEYS,
  type ProfilEdits,
} from "@/lib/parcours/profil";

const baseEdits = (o: Partial<ProfilEdits> = {}): ProfilEdits => ({
  company: "Excavation ABC",
  contact_name: "Marc",
  phone: "418-555-1234",
  address: "12 rue Test",
  truck_types: ["Camion 10 roues"],
  truck_count: "4",
  ...o,
});

const saveClient = (error: { message: string } | null = null) => {
  const calls: unknown[] = [];
  const client = {
    from: () => ({
      update: (payload: unknown) => {
        calls.push(payload);
        return { select: () => Promise.resolve({ data: [], error }) };
      },
    }),
    rpc: async () => ({ data: [], error: null }),
  } as any;
  return { client, calls };
};

describe("Édition contrôlée du profil", () => {
  it("A — affichage : valeurs existantes préremplies", () => {
    const p = buildProfil(
      { company: "ABC", truck_types: ["Camion 12 roues"], truck_count: "3", phone: "418-555-1234" },
      counters,
    );
    expect(p.edits.company).toBe("ABC");
    expect(p.edits.truck_types).toEqual(["Camion 12 roues"]);
    expect(p.edits.truck_count).toBe("3");
  });

  it("B — profil incomplet : formulaire vide, pas de valeur inventée", () => {
    const e = toEdits(null);
    expect(e).toEqual({
      company: "", contact_name: "", phone: "", address: "", truck_types: [], truck_count: "",
    });
  });

  it("C — company obligatoire", () => {
    expect(validateProfilEdits(baseEdits({ company: "  " })).company).toBeTruthy();
    expect(validateProfilEdits(baseEdits({ company: "A".repeat(121) })).company).toBeTruthy();
    expect(validateProfilEdits(baseEdits())).toEqual({});
  });

  it("D — truck_types conservés au format tableau texte de la base", () => {
    const payload = toPayload(baseEdits({ truck_types: ["Camion 10 roues", "Autre"] }));
    expect(payload.truck_types).toEqual(["Camion 10 roues", "Autre"]);
    expect(toPayload(baseEdits({ truck_types: [] })).truck_types).toBeNull();
  });

  it("E — truck_count : entier seulement", () => {
    expect(validateProfilEdits(baseEdits({ truck_count: "abc" })).truck_count).toBeTruthy();
    expect(validateProfilEdits(baseEdits({ truck_count: "" })).truck_count).toBeUndefined();
  });

  it("F — téléphone selon le format déjà utilisé", () => {
    expect(validateProfilEdits(baseEdits({ phone: "4185551234" }))).toEqual({});
    expect(validateProfilEdits(baseEdits({ phone: "123" })).phone).toBeTruthy();
  });

  it("G — sauvegarde réussie", async () => {
    const { client, calls } = saveClient();
    const res = await saveMyProfil(baseEdits(), client);
    expect(res.state).toBe("ok");
    expect(calls).toHaveLength(1);
  });

  it("H — erreur de sauvegarde remontée sans perte de données", async () => {
    const { client } = saveClient({ message: "network down" });
    const res = await saveMyProfil(baseEdits(), client);
    expect(res).toEqual({ state: "error", message: "network down" });
  });

  it("I — utilisateur non connecté / RLS", async () => {
    const { client } = saveClient({ message: "new row violates row-level security policy" });
    expect((await saveMyProfil(baseEdits(), client)).state).toBe("unauthorized");
  });

  it("J — aucun identifiant client envoyé (A ne peut pas viser la fiche de B)", async () => {
    const { client, calls } = saveClient();
    await saveMyProfil({ ...baseEdits(), ...({ user_id: "uid-B", id: "row-B" } as any) }, client);
    const payload = calls[0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([...EDITABLE_KEYS, ...LOCATION_KEYS].sort());
    expect(payload.user_id).toBeUndefined();
    expect(payload.id).toBeUndefined();
  });

  it("K — aucune donnée privée éditable ni exposée", () => {
    for (const k of PRIVATE_KEYS) {
      expect((EDITABLE_KEYS as readonly string[]).includes(k)).toBe(false);
    }
    const payload = toPayload(baseEdits());
    for (const k of PRIVATE_KEYS) expect(payload[k]).toBeUndefined();
  });

  it("L — refresh après sauvegarde : valeurs vides converties en null", () => {
    const payload = toPayload(baseEdits({ contact_name: "  ", address: "" }));
    expect(payload.contact_name).toBeNull();
    expect(payload.address).toBeNull();
  });

  it("M — validation invalide bloque l'appel réseau", async () => {
    const { client, calls } = saveClient();
    const res = await saveMyProfil(baseEdits({ company: "" }), client);
    expect(res.state).toBe("invalid");
    expect(calls).toHaveLength(0);
  });
});

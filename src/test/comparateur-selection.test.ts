import { describe, it, expect, vi } from "vitest";
import {
  persistSelection, fetchPersistedSelection, mapPersisted, type RpcClient,
} from "@/lib/parcours/selection";
import type { ComparateurSelection } from "@/lib/parcours/handoff";

const SUB = "11111111-2222-3333-4444-555555555555";
const SITE_A = "aaaaaaaa-1111-2222-3333-444444444444";
const SITE_B = "bbbbbbbb-1111-2222-3333-444444444444";

const sel = (over: Partial<ComparateurSelection> = {}): ComparateurSelection => ({
  submissionId: SUB,
  siteId: SITE_A,
  siteLabel: "Dompe 12",
  distanceKm: 18.4,
  durationMinutes: 23.6,
  trips: 3,
  tonnes: 42,
  quantityValue: "42",
  quantityUnit: "tonnes",
  materialKey: "terre",
  materialLabel: "Terre",
  truckKey: "10_roues",
  truckLabel: "Camion 10 roues",
  capacityTonnes: 15,
  address: "500 Bd Alphonse-Deshaies, Bécancour",
  coords: { lat: 46.38, lng: -72.38 },
  desiredDate: "2026-09-15",
  timeframe: "Cette semaine",
  accessDetails: ["Sol mou ou boueux"],
  createdAt: Date.now(),
  ...over,
});

/** Faux CRM : une seule ligne par submissionId → tout doublon serait visible. */
const makeClient = () => {
  const rows = new Map<string, Record<string, unknown>>();
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client: RpcClient = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === "save_comparateur_selection") {
        const id = args.p_submission_id as string;
        const row = {
          submission_id: id,
          submission_number: 123,
          selected_site_id: args.p_site_id,
          selected_site_label: args.p_site_label,
          selected_site_address: "1 rue du Site",
          selected_site_latitude: 46.5,
          selected_site_longitude: -71.5,
          material: args.p_material,
          quantity: args.p_quantity,
          unit: args.p_unit,
          tonnage: args.p_tonnage,
          trips: args.p_trips,
          truck: args.p_truck,
          distance_km: args.p_distance_km,
          duration_minutes: args.p_duration_minutes,
          desired_date: args.p_desired_date,
          timeframe: args.p_timeframe,
          access_details: args.p_access_details,
          selection_updated_at: new Date().toISOString(),
        };
        rows.set(id, row);
        return { data: row, error: null };
      }
      if (fn === "get_comparateur_selection") {
        return { data: rows.get(args.p_submission_id as string) ?? null, error: null };
      }
      return { data: null, error: { message: "unknown_fn" } };
    },
  };
  return { client, rows, calls };
};

describe("sélection comparateur → CRM", () => {
  it("A — enregistre la sélection sur la demande existante", async () => {
    const { client, rows, calls } = makeClient();
    const res = await persistSelection(sel(), client);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.saved.submissionId).toBe(SUB);
      expect(res.saved.siteId).toBe(SITE_A);
      expect(res.saved.trips).toBe(3);
      expect(res.saved.distanceKm).toBe(18.4);
      expect(res.saved.durationMinutes).toBe(24); // arrondi, jamais inventé
    }
    expect(rows.size).toBe(1);
    expect(calls[0].args.p_submission_id).toBe(SUB);
  });

  it("B — aucune écriture sans submissionId", async () => {
    const { client, calls } = makeClient();
    const res = await persistSelection(sel({ submissionId: null }), client);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("missing_submission");
    expect(calls).toHaveLength(0);
  });

  it("C — aucune écriture sans sélection de site", async () => {
    const { client, calls } = makeClient();
    const res = await persistSelection(null, client);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("missing_selection");
    const res2 = await persistSelection(sel({ siteId: "" }), client);
    expect(res2.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("D — une erreur serveur ne produit jamais de fausse confirmation", async () => {
    const client: RpcClient = { rpc: async () => ({ data: null, error: { message: "not_authorized" } }) };
    const res = await persistSelection(sel(), client);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("save_failed");
      expect(res.message).toBe("not_authorized");
    }
  });

  it("E — changer de site met à jour la MÊME demande", async () => {
    const { client, rows } = makeClient();
    await persistSelection(sel(), client);
    const res = await persistSelection(sel({ siteId: SITE_B, siteLabel: "Dompe 44" }), client);
    expect(res.ok).toBe(true);
    expect(rows.size).toBe(1);
    expect(rows.get(SUB)?.selected_site_id).toBe(SITE_B);
    expect(rows.get(SUB)?.selected_site_label).toBe("Dompe 44");
  });

  it("F — sélection récupérable après rechargement", async () => {
    const { client } = makeClient();
    await persistSelection(sel(), client);
    const back = await fetchPersistedSelection(SUB, client);
    expect(back?.siteId).toBe(SITE_A);
    expect(back?.trips).toBe(3);
    expect(await fetchPersistedSelection(null, client)).toBeNull();
  });

  it("G — double soumission identique : idempotente, aucun doublon", async () => {
    const { client, rows, calls } = makeClient();
    const s = sel();
    const [r1, r2] = await Promise.all([persistSelection(s, client), persistSelection(s, client)]);
    expect(r1.ok && r2.ok).toBe(true);
    expect(rows.size).toBe(1);
    expect(calls.filter((c) => c.fn === "save_comparateur_selection")).toHaveLength(2);
    expect(rows.get(SUB)?.selected_site_id).toBe(SITE_A);
  });

  it("n'envoie pas de date non ISO ni de champs vides", async () => {
    const { client, calls } = makeClient();
    await persistSelection(sel({ desiredDate: "dès que possible", timeframe: "", quantityValue: "" }), client);
    expect(calls[0].args.p_desired_date).toBeNull();
    expect(calls[0].args.p_timeframe).toBeNull();
    expect(calls[0].args.p_quantity).toBeNull();
  });

  it("mapPersisted ignore une réponse vide", () => {
    expect(mapPersisted(null)).toBeNull();
    expect(mapPersisted({} as Record<string, unknown>)).toBeNull();
  });

  it("ne crée jamais de submission : seules les RPC de sélection sont appelées", async () => {
    const { client, calls } = makeClient();
    await persistSelection(sel(), client);
    await fetchPersistedSelection(SUB, client);
    expect(new Set(calls.map((c) => c.fn))).toEqual(
      new Set(["save_comparateur_selection", "get_comparateur_selection"]),
    );
  });
});

import { describe, it, expect, vi } from "vitest";
import {
  validateSelectedSite,
  buildTransportPrefill,
  classifyError,
} from "@/lib/parcours/validation";

const SUB = "11111111-1111-1111-1111-111111111111";
const SITE = "22222222-2222-2222-2222-222222222222";

const okClient = (validatedAt = "2026-08-12T10:00:00Z") => ({
  rpc: vi.fn(async () => ({
    data: {
      submission_id: SUB,
      selected_site_id: SITE,
      selected_site_label: "Dompe #42",
      selected_site_address: "100 rue Test, Québec",
      site_validated_at: validatedAt,
    },
    error: null,
  })),
});

describe("validation admin du site sélectionné", () => {
  it("valide une demande avec site sélectionné", async () => {
    const client = okClient();
    const res = await validateSelectedSite(SUB, { hasSelection: true }, client);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.validated.submissionId).toBe(SUB);
      expect(res.validated.validatedAt).toBe("2026-08-12T10:00:00Z");
    }
    expect(client.rpc).toHaveBeenCalledWith("validate_selected_site", { p_submission_id: SUB });
  });

  it("refuse une demande sans site sélectionné (aucune écriture)", async () => {
    const client = okClient();
    const res = await validateSelectedSite(SUB, { hasSelection: false }, client);
    expect(res.ok).toBe(false);
    if (res.ok === false) expect(res.code).toBe("missing_selection");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("n'écrit rien si l'identifiant de demande est absent", async () => {
    const client = okClient();
    const res = await validateSelectedSite(null, {}, client);
    expect(res.ok).toBe(false);
    if (res.ok === false) expect(res.code).toBe("missing_submission");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("refuse un utilisateur non autorisé", async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: { message: "not_authorized" } })) };
    const res = await validateSelectedSite(SUB, { hasSelection: true }, client);
    expect(res.ok).toBe(false);
    if (res.ok === false) expect(res.code).toBe("not_authorized");
  });

  it("ne confirme jamais en cas d'erreur DB", async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: { message: "deadlock detected" } })) };
    const res = await validateSelectedSite(SUB, { hasSelection: true }, client);
    expect(res.ok).toBe(false);
    if (res.ok === false) expect(res.code).toBe("save_failed");
  });

  it("est idempotente : deux appels renvoient la même date de validation", async () => {
    const client = okClient();
    const a = await validateSelectedSite(SUB, { hasSelection: true }, client);
    const b = await validateSelectedSite(SUB, { hasSelection: true }, client);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.validated.validatedAt).toBe(b.validated.validatedAt);
    // Toujours la même demande : aucune nouvelle submission.
    const ids = client.rpc.mock.calls.map((c) => (c as unknown as [string, { p_submission_id: string }])[1].p_submission_id);
    expect(new Set(ids)).toEqual(new Set([SUB]));
  });

  it("classifie les erreurs Postgres connues", () => {
    expect(classifyError("no_site_selected")).toBe("missing_selection");
    expect(classifyError("submission_not_found")).toBe("not_found");
    expect(classifyError("boom")).toBe("save_failed");
  });
});

describe("préremplissage de /demande-transport", () => {
  const row = {
    id: SUB,
    selected_site_id: SITE,
    selected_site_label: "Dompe #42",
    quote_material: "Terre",
    quote_quantity: 12,
    quote_unit: "tonnes",
    quote_trips: 3,
    quote_truck: "12 roues",
    quote_distance_km: 18.4,
    quote_duration_minutes: 25,
    desired_date: "2026-09-01",
    delivery_timeframe: "2 semaines",
    formatted_address: "500 boul. Test, Lévis",
    latitude: 46.8,
    longitude: -71.2,
    access_heavy_truck: "oui",
    name: "Jean",
    phone: "418-555-1234",
  };

  it("transmet le submissionId existant et conserve les données", () => {
    const pf = buildTransportPrefill(row);
    expect(pf?.submissionId).toBe(SUB);
    expect(pf?.dumpId).toBe(SITE);
    expect(pf?.material).toBe("terre_propre");
    expect(pf?.quantity).toBe("12");
    expect(pf?.unit).toBe("tonnes");
    expect(pf?.trips).toBe("3");
    expect(pf?.truckType).toBe("12 roues");
    expect(pf?.desiredDate).toBe("2026-09-01");
    expect(pf?.timeframe).toBe("2 semaines");
    expect(pf?.address).toBe("500 boul. Test, Lévis");
    expect(pf?.coords).toEqual({ lat: 46.8, lng: -71.2 });
    expect(pf?.accessHeavyTruck).toBe("oui");
    expect(pf?.clientPhone).toBe("418-555-1234");
  });

  it("n'invente aucune valeur absente", () => {
    const pf = buildTransportPrefill({ id: SUB });
    expect(pf?.material).toBe("");
    expect(pf?.quantity).toBe("");
    expect(pf?.coords).toBeNull();
    expect(pf?.distance_km).toBeNull();
  });

  it("retourne null sans demande", () => {
    expect(buildTransportPrefill(null)).toBeNull();
  });
});
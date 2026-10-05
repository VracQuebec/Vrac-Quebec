import { describe, expect, it } from "vitest";
import { buildEntrepreneurRequests, requestMatchesFilter } from "@/lib/entrepreneur-app/requests";
import { buildChantiers, findChantierForTransport } from "@/lib/parcours/chantiers";
import type { MySubmission } from "@/lib/parcours/mes-demandes";

const submission = (over: Partial<MySubmission> = {}): MySubmission => ({
  id: "sub-1", number: 12, createdAt: "2026-09-20T10:00:00Z", status: "nouvelle",
  requestType: "remblai", material: "Terre", quantity: "4 voyages", location: "Lévis",
  desiredDate: null, selectedSiteLabel: null, selectedSiteAddress: null, siteValidatedAt: null,
  city: "Lévis", address: null, placeId: null, latitude: null, longitude: null,
  selectedSiteId: null, quoteMaterial: null, distanceKm: null, durationMinutes: null,
  selectionUpdatedAt: null, siteAvailabilityStatus: null, siteAvailabilityUpdatedAt: null,
  ...over,
});

describe("dossiers entrepreneur", () => {
  it("transforme chaque demande en dossier ouvrable", () => {
    const [request] = buildEntrepreneurRequests([submission()], []);
    expect(request.id).toBe("s-sub-1");
    expect(request.title).toBe("Terre");
    expect(request.filter).toBe("pending");
  });

  it("conserve les états terminés et annulés dans les filtres", () => {
    const requests = buildEntrepreneurRequests([
      submission({ id: "done", status: "terminee" }),
      submission({ id: "cancelled", status: "annulee" }),
    ], []);
    expect(requests.find((item) => item.sourceId === "done")?.filter).toBe("done");
    expect(requests.find((item) => item.sourceId === "cancelled")?.filter).toBe("cancelled");
    expect(requests.filter((item) => requestMatchesFilter(item, "done"))).toHaveLength(1);
  });

  it("ne transforme jamais une sélection en approbation", () => {
    const [request] = buildEntrepreneurRequests([
      submission({ selectedSiteId: "site-1", selectedSiteLabel: "Dompe 8", siteValidatedAt: null }),
    ], []);
    expect(request.statusLabel).toBe("Dompe en attente");
    expect(request.submission?.selectedSiteAddress).toBeNull();
  });

  it("associe un transport seulement par son lien explicite", () => {
    const chantiers = buildChantiers([
      submission({ id: "one", address: "12 rue Test", city: "Lévis" }),
      submission({ id: "two", address: "12 rue Test", city: "Lévis" }),
    ]);
    expect(findChantierForTransport(chantiers, { site_address: "12 rue Test", site_city: "Lévis" })).toBeNull();
    expect(findChantierForTransport(chantiers, { origin_submission_id: "two" })?.submissions[0].id).toBe("two");
  });

  it("demande d'accès avec ses propres camions : ni accès accordé ni transport commandé", () => {
    const [r] = buildEntrepreneurRequests([], [{ id: "t1", status: "nouvelle", created_at: null, request_kind: "dump_access", transport_mode: "own_trucks" }]);
    expect(r.natureLabel).toBe("Demande d'accès à une dompe · vos propres camions");
    expect(r.nextAction).toBe("Demande envoyée — accès non encore accordé");
  });
});

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

  it("contextualise une demande dans son chantier calculé", () => {
    const submissions = [submission({ address: "12 rue Test", city: "Lévis" })];
    const chantiers = buildChantiers(submissions);
    const [request] = buildEntrepreneurRequests(submissions, [], chantiers);
    expect(request.chantierKey).toBe(chantiers[0].key);
    expect(request.chantierLabel).toBe("Lévis");
  });

  it("ne rattache pas un transport par ville lorsque plusieurs chantiers sont possibles", () => {
    const chantiers = buildChantiers([
      submission({ id: "one", placeId: "place-one", city: "Lévis" }),
      submission({ id: "two", placeId: "place-two", city: "Lévis" }),
    ]);
    expect(findChantierForTransport(chantiers, { site_city: "Lévis" })).toBeNull();
  });

  it("rattache un transport à une adresse exacte unique", () => {
    const chantiers = buildChantiers([
      submission({ id: "one", address: "12 rue Test", city: "Lévis" }),
      submission({ id: "two", address: "18 rue Nord", city: "Lévis" }),
    ]);
    expect(findChantierForTransport(chantiers, { site_address: "12 rue Test", site_city: "Lévis" })?.submissions[0].id).toBe("one");
  });
});
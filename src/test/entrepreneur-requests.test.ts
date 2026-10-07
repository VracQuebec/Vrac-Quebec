import { describe, expect, it } from "vitest";
import { buildEntrepreneurRequests, buildRequestTracking, requestMatchesFilter } from "@/lib/entrepreneur-app/requests";
import { buildChantiers, findChantierForTransport } from "@/lib/parcours/chantiers";
import type { MySubmission } from "@/lib/parcours/mes-demandes";
import { deriveJourneyStage, submissionDisplayState } from "@/lib/parcours/submission-display";

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

  it("filtre Confirmées uniquement depuis des statuts ou liens existants", () => {
    const requests = buildEntrepreneurRequests([
      submission({ id: "accepted", status: "acceptee" }),
      submission({ id: "waiting", status: "nouvelle" }),
      submission({ id: "site", status: "nouvelle", siteValidatedAt: "2026-09-21T10:00:00Z" }),
    ], []);
    expect(requests.filter((item) => requestMatchesFilter(item, "confirmed")).map((item) => item.sourceId)).toEqual(["accepted", "site"]);
  });

  it("fournit des valeurs de présentation honnêtes quand des champs manquent", () => {
    const [request] = buildEntrepreneurRequests([submission({ number: null, requestType: null, material: null, city: null })], []);
    expect(request.typeLabel).toBe("Non précisé");
    expect(request.subjectLabel).toBe("Non précisé");
    expect(request.city).toBe("À compléter");
    expect(request.reference).toBe("SUB-1");
  });

  it("ne complète une étape de suivi que si un état existant la prouve", () => {
    const [waiting] = buildEntrepreneurRequests([submission()], []);
    const [confirmed] = buildEntrepreneurRequests([submission({ siteValidatedAt: "2026-09-21T10:00:00Z" })], []);
    expect(buildRequestTracking(waiting).find((step) => step.label === "Solution trouvée")?.state).toBe("upcoming");
    expect(buildRequestTracking(confirmed).find((step) => step.label === "Solution trouvée")?.state).toBe("current");
    expect(buildRequestTracking(confirmed, { id: "t", status: "nouvelle", created_at: null }).find((step) => step.label === "Transport à organiser")?.state).toBe("current");
  });

  it.each([
    ["nouveau", "Nouvelle", "pending"],
    ["soumission envoyée", "Soumission envoyée", "pending"],
    ["soumission acceptée", "Soumission acceptée", "active"],
    ["paiement effectué", "Paiement effectué", "active"],
    ["en attente de livraison", "En attente de livraison", "active"],
    ["archivé", "Archivée", "cancelled"],
    ["perdu", "Perdue", "cancelled"],
  ])("interprète %s sans modifier la valeur source", (raw, label, filter) => {
    const state = submissionDisplayState(raw);
    expect(state.label).toBe(label);
    expect(state.filter).toBe(filter);
  });

  it("calcule la progression seulement depuis des preuves existantes", () => {
    expect(deriveJourneyStage(submission())).toMatchObject({ key: "request", label: "Besoin identifié" });
    expect(deriveJourneyStage(submission({ status: "soumission envoyée" }))).toMatchObject({ key: "search", label: "Recherche" });
    expect(deriveJourneyStage(submission({ selectedSiteId: "site-1" }))).toMatchObject({ key: "solution", label: "Solution trouvée" });
    expect(deriveJourneyStage(submission(), { status: "nouvelle", lifecycle_status: "a_valider" })).toMatchObject({ key: "transport", label: "Transport à organiser" });
    expect(deriveJourneyStage(submission({ status: "soumission acceptée" }))).toMatchObject({ key: "confirmed", label: "Confirmé" });
    expect(deriveJourneyStage(submission(), { status: "en_cours" })).toMatchObject({ key: "execution", label: "En cours" });
    expect(deriveJourneyStage(submission(), null, [{ submission_id: "sub-1", voided_at: null }])).toMatchObject({ key: "request", label: "Besoin identifié" });
    expect(deriveJourneyStage(submission({ status: "archivé" }))).toMatchObject({ key: "closed", label: "Terminé", detail: "Archivée" });
    expect(deriveJourneyStage(submission({ status: "perdu" }))).toMatchObject({ key: "closed", label: "Terminé", detail: "Perdue" });
    expect(deriveJourneyStage(submission(), null, [{ submission_id: "sub-1", voided_at: "2026-10-03T00:00:00Z" }]).key).toBe("request");
  });

  it("affiche les sept étapes cibles sans déclarer les étapes futures accomplies", () => {
    const [request] = buildEntrepreneurRequests([submission({ selectedSiteId: "site-1" })], []);
    const tracking = buildRequestTracking(request);
    expect(tracking.map((step) => step.label)).toEqual([
      "Besoin identifié", "Recherche", "Solution trouvée", "Transport à organiser", "Confirmé", "En cours", "Terminé",
    ]);
    expect(tracking.find((step) => step.label === "Solution trouvée")?.state).toBe("current");
    expect(tracking.find((step) => step.label === "Transport à organiser")?.state).toBe("upcoming");
  });

  it("ne transforme jamais une sélection en approbation", () => {
    const [request] = buildEntrepreneurRequests([
      submission({ selectedSiteId: "site-1", selectedSiteLabel: "Dompe 8", siteValidatedAt: null }),
    ], []);
    expect(request.statusLabel).toBe("Site choisi — validation en attente");
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

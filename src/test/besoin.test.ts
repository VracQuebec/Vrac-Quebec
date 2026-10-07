import { describe, expect, it } from "vitest";
import { NEED_LABELS, needDirection, needsDumpSearch, isApproximateLocation, originDateNote, possibleDuplicates, parseCoordinates, reliableCoords, visibilityLabel } from "@/lib/parcours/sens-besoin";
import { submissionNeedLabel } from "@/lib/parcours/submission-display";
import { mapMySubmission, type MySubmission } from "@/lib/parcours/mes-demandes";

const S = (id: string, extra: Partial<MySubmission> = {}, row: Record<string, unknown> = {}): MySubmission => ({
  ...mapMySubmission({ id, request_type: "remblai", materials: ["Terre"], latitude: 46.8, longitude: -71.2, ...row })!,
  ...extra,
});

describe("sens du besoin", () => {
  it("réception et évacuation distinctes", () => {
    expect(needDirection(S("a", { parcoursDirection: "reception", deliverOrRemove: "À livrer" }))).toBe("recevoir");
    expect(needDirection(S("b", { parcoursDirection: "evacuation", deliverOrRemove: "À sortir du chantier" }))).toBe("evacuer");
  });
  it("le type « remblai » seul ne suffit pas", () => {
    const d = needDirection(S("c"));
    expect(d).toBe("a_preciser");
    expect(needsDumpSearch(d)).toBe(false);
    expect(submissionNeedLabel(S("c", { material: "Terre", quantity: "30 tonnes" }), false, NEED_LABELS[d])).toBe("Sens à confirmer");
  });
  it("réserve Informations à compléter aux renseignements réellement absents", () => {
    expect(submissionNeedLabel(S("vide", { material: null, quantity: null }), false, "")).toBe("Informations à compléter");
  });
  it("informations contradictoires : à préciser", () => {
    expect(needDirection(S("d", { parcoursDirection: "evacuation", deliverOrRemove: "À livrer" }))).toBe("a_preciser");
  });
  it("seule l'évacuation lance une recherche de dompe", () => {
    expect(needsDumpSearch(needDirection(S("e", { parcoursDirection: "reception" })))).toBe(false);
    expect(needsDumpSearch(needDirection(S("f", { parcoursDirection: "evacuation" })))).toBe(true);
  });
  it("achat / livraison", () => {
    expect(needDirection(S("g", {}, { request_type: "livraison" }))).toBe("acheter");
  });
});

describe("provenance, lieu et historique", () => {
  it("lieu approximatif ou lien collé : coordonnées non utilisées", () => {
    const s = S("h", { locationType: "APPROXIMATE" });
    expect(isApproximateLocation(s)).toBe(true);
    expect(reliableCoords(s)).toBeNull();
    expect(isApproximateLocation(S("i", {}, { address: "https://maps.app.goo.gl/abc" }))).toBe(true);
  });
  it("coordonnées lisibles dans un lien ou collées", () => {
    expect(parseCoordinates("https://www.google.com/maps/@46.81,-71.21,15z")).toEqual({ lat: 46.81, lng: -71.21 });
    expect(parseCoordinates("46.8123, -71.2145")).toEqual({ lat: 46.8123, lng: -71.2145 });
    expect(parseCoordinates("https://maps.app.goo.gl/abc")).toBeNull();
  });
  it("horodatage commun : date d'origine incertaine", () => {
    expect(originDateNote(S("j", { sharedTimestampCount: 154 }))).toContain("154");
    expect(originDateNote(S("k", { sharedTimestampCount: 1 }))).toBeNull();
  });
  it("doublons signalés sans fusion", () => {
    const d = possibleDuplicates([S("1", {}, { address: "https://maps.app.goo.gl/x1", submission_number: 24 }), S("2", {}, { address: "https://maps.app.goo.gl/x1", submission_number: 167 })]);
    expect(d.get("1")).toEqual(["#167"]);
  });
  it("raison de visibilité affichée, jamais inventée", () => {
    expect(visibilityLabel("courriel")).toContain("non rattaché");
    expect(visibilityLabel(null)).toBe("Raison de visibilité à confirmer");
  });
});

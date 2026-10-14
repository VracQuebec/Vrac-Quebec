import { describe, it, expect } from "vitest";
import { formatRequestLabel, formatDompeLabel, humanizeRequestRefs, requestSearchText } from "@/lib/requests/labels";

describe("libellés demande / dompe", () => {
  it("DT-0053 s'affiche Demande #0053", () => expect(formatRequestLabel("DT-0053")).toBe("Demande #0053"));
  it("Dompe 926 s'affiche Dompe #926", () => expect(formatDompeLabel("Dompe 926")).toBe("Dompe #926"));
  it("sans dompe, jamais le numéro de demande", () => expect(formatDompeLabel(null)).toBeNull());
  it("notifications : DT-0054 remplacé dans le texte", () =>
    expect(humanizeRequestRefs("Nouvelle demande DT-0054 reçue")).toBe("Nouvelle demande Demande #0054 reçue"));
  it("recherche par l'ancien identifiant toujours possible", () =>
    expect(requestSearchText("DT-0054")).toContain("DT-0054"));
});

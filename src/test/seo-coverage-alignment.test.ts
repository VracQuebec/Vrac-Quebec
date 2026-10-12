import { describe, it, expect } from "vitest";
import { availabilityOf, expandBulk } from "@/lib/seo/slotDecisions";

describe("disponibilité de référence = catalogue serveur", () => {
  it("« Terre » comptée comme remblai dans la couverture ne confirme plus si le serveur dit inconnue", () =>
    expect(availabilityOf({ kind: "material", status: "covered" }, undefined, "inconnue")).toBe("inconnue"));
  it("preuve serveur confirmée", () => expect(availabilityOf({ kind: "material", status: "not_requested" }, undefined, "confirmee")).toBe("confirmee"));
  it("exclusion serveur prioritaire sur une décision confirmée", () => expect(availabilityOf({ kind: "material", status: "x" }, "confirmee", "exclue")).toBe("exclue"));
  it("décision explicite confirme une inconnue", () => expect(availabilityOf({ kind: "service", status: "x" }, "confirmee", "inconnue")).toBe("confirmee"));
});

describe("décisions en lot", () => {
  it("une ligne par combinaison, motif conservé", () => {
    const r = expandBulk([{ city_slug: "beauceville", kind: "material", slugs: ["mg-20", "sable"], decision: "exclue", reason: "  Pas offert ici " }]);
    expect(r).toEqual([
      { city_slug: "beauceville", kind: "material", slug: "mg-20", decision: "exclue", reason: "Pas offert ici" },
      { city_slug: "beauceville", kind: "material", slug: "sable", decision: "exclue", reason: "Pas offert ici" },
    ]);
  });
  it("motif trop court refusé", () => expect(() => expandBulk([{ city_slug: "a", kind: "service", slugs: ["dompe"], decision: "confirmee", reason: "ok" }])).toThrow());
});

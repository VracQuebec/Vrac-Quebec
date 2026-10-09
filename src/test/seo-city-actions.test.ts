import { describe, it, expect } from "vitest";
import { cityProblemSplit, retryDisabledReason, publishDisabledReason, publishResultMessage } from "@/lib/seo/cityActions";

const problems = [
  { city_slug: "adstock", gen_state: "invalid", issues: ["Publiée mais noindex"] },
  { city_slug: "saint-henri", gen_state: "invalid", issues: ["Contenu insuffisant"] },
  { city_slug: "levis", gen_state: "invalid", issues: ["Publiée mais noindex", "Contenu insuffisant"] },
  { city_slug: "levis", gen_state: "error", issues: [] },
];

describe("actions de ville du gestionnaire SEO", () => {
  it("une page publiée seulement non indexée n'est pas une erreur", () => {
    expect(cityProblemSplit(problems, "adstock")).toEqual({ realErrors: 0, noindex: 1 });
    expect(retryDisabledReason(0, 1)).toMatch(/non indexée/);
  });
  it("le contenu insuffisant reste une vraie erreur", () => {
    expect(cityProblemSplit(problems, "saint-henri")).toEqual({ realErrors: 1, noindex: 0 });
    expect(retryDisabledReason(1, 0)).toBeNull();
  });
  it("noindex combiné à un autre problème reste une erreur", () => {
    expect(cityProblemSplit(problems, "levis")).toEqual({ realErrors: 2, noindex: 0 });
  });
  it("publication désactivée expliquée quand les brouillons échouent au contrôle", () => {
    expect(publishDisabledReason({ unpublished: 0, drafts: 1 })).toMatch(/contrôles de qualité/);
    expect(publishDisabledReason({ unpublished: 1, drafts: 1 })).toBeNull();
  });
  it("le résultat de publication affiche publiées et ignorées", () => {
    expect(publishResultMessage({ published: 1, skipped_invalid: 2 })).toBe("1 page(s) publiée(s), 2 ignorée(s) (contrôle qualité non réussi).");
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { findUnverifiedClaims } from "../../supabase/functions/seo-generate-page/claims";

const src = readFileSync("supabase/functions/seo-qa-autofix/index.ts", "utf8");
const faqBlock = src.slice(src.indexOf("function buildFaq"), src.indexOf("Deno.serve"));
const metaBlock = src.slice(src.indexOf("function buildMetaDescription"), src.indexOf("function buildKeywords"));

describe("modèle automatique de questions-réponses", () => {
  it("ne nomme jamais Transport JSC au client", () => {
    expect(src).not.toMatch(/Transport JSC/);
  });
  it("aucune promesse de délai, prix ou partenaires", () => {
    for (const bad of ["3 à 5 jours", "24 à 72 heures", "prix compétitif", "Nos partenaires", "Notre réseau", "Fournisseurs vérifiés", "réponse rapide"]) {
      expect(faqBlock + metaBlock).not.toContain(bad);
    }
  });
  it("les réponses passent le contrôle des promesses", () => {
    const answers = [...faqBlock.matchAll(/answer: `([^`]+)`/g)].map((m) => m[1]);
    expect(answers).toHaveLength(6);
    for (const a of answers) expect(findUnverifiedClaims(a)).toEqual([]);
  });
});

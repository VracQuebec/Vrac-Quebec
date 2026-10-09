import { describe, it, expect } from "vitest";
import { findUnverifiedClaims } from "../../supabase/functions/seo-generate-page/claims";

describe("garde-fou des affirmations non vérifiées", () => {
  it("bloque les phrases du brouillon de Saint-Henri", () => {
    expect(findUnverifiedClaims("<p>Opter pour un fournisseur local via Vrac Québec</p>").length).toBeGreaterThan(0);
    expect(findUnverifiedClaims("<p>Nos partenaires respectent des normes de qualité strictes</p>").length).toBeGreaterThan(0);
    expect(findUnverifiedClaims("transporteurs et fournisseurs situés à proximité de Saint-Henri").length).toBeGreaterThan(0);
  });
  it("bloque prix, distance, délai et garantie", () => {
    expect(findUnverifiedClaims("environ 25 $ la tonne")).not.toHaveLength(0);
    expect(findUnverifiedClaims("à 12 km du chantier")).not.toHaveLength(0);
    expect(findUnverifiedClaims("livraison en 24 heures")).not.toHaveLength(0);
    expect(findUnverifiedClaims("un remblai certifié")).not.toHaveLength(0);
  });
  it("laisse passer un texte général et prudent", () => {
    const ok = "<h2>Choisir son remblai</h2><p>Le remblai granulaire se compacte bien et draine l'eau. Selon les disponibilités confirmées lors de l'analyse de votre demande, Vrac Québec vous répond.</p>";
    expect(findUnverifiedClaims(ok)).toEqual([]);
  });
});

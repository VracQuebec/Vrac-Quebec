// Confidentialité des partenaires : les surfaces publiques ne doivent jamais demander
// de données privées (coordonnées directes, notes internes, métadonnées admin).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const PRIVATE_FIELDS = ["contact_phone", "contact_email", "created_by", "internal_notes"];

describe("Confidentialité des surfaces publiques", () => {
  it("la place de marché publique lit la vue publique des annonces", () => {
    const src = read("src/pages/PlaceDeMarche.tsx");
    expect(src).toContain('.from("jsc_listings_public")');
    const load = src.slice(src.indexOf("const load ="), src.indexOf("useEffect"));
    PRIVATE_FIELDS.forEach((f) => expect(load).not.toContain(f));
  });

  it("l'annuaire du réseau lit la vue publique des fiches partenaires", () => {
    const list = read("src/pages/Reseau.tsx");
    expect(list).toContain('.from("jsc_marketplace_profiles_public")');
    expect(list).not.toContain('.from("jsc_marketplace_profiles")');
  });

  it("la fiche partenaire ne charge les coordonnées qu'avec une session active", () => {
    const src = read("src/pages/ReseauProfil.tsx");
    expect(src).toContain('.from("jsc_marketplace_profiles_public")');
    const contactBlock = src.slice(src.indexOf("supabase.auth.getSession"), src.indexOf("setProfile(p)"));
    expect(contactBlock).toContain('.from("jsc_marketplace_profiles")');
    expect(contactBlock).toContain("phone");
    // Le bloc coordonnées est conditionné à une session : il n'existe pas hors de ce garde-fou.
    expect(src.indexOf("session.session")).toBeLessThan(src.indexOf('.from("jsc_marketplace_profiles")'));
  });
});

import { describe, expect, it } from "vitest";
import { DOMPE_PATH, REMBLAI_PATH } from "@/lib/navigation/priority-paths";
import { isPublicFooterVisible } from "@/components/PublicContactFooter";

describe("Parcours prioritaires et pied de page public", () => {
  it("« Je cherche une dompe » mène à l'espace entrepreneur", () => expect(DOMPE_PATH).toBe("/espace-entrepreneur"));
  it("« Je veux du remblai » mène à la demande de remblai", () => expect(REMBLAI_PATH).toBe("/remblai"));
  it("affiche le pied de page sur les pages publiques", () => {
    for (const p of ["/remblai", "/acces-dompe", "/livraison/beauport", "/blog/un-article", "/login"]) expect(isPublicFooterVisible(p)).toBe(true);
  });
  it("le masque dans les espaces connectés", () => {
    for (const p of ["/", "/blog", "/admin", "/entrepreneur/demandes", "/portail/client"]) expect(isPublicFooterVisible(p)).toBe(false);
  });
});

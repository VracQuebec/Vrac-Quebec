import { describe, it, expect } from "vitest";
import { clean } from "./invoicePdf";
describe("PDF facture — caractères hors WinAnsi", () => {
  it("remplace la flèche par ->", () => expect(clean("Saint-Jérôme → Lévis")).toBe("Saint-Jérôme -> Lévis"));
  it("conserve les accents français", () => expect(clean("Éloïse, Hélène, Côté, œuvre")).toBe("Éloïse, Hélène, Côté, œuvre"));
});

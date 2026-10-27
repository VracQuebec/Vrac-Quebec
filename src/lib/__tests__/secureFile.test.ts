import { describe, it, expect } from "vitest";
import { secureFileMessage } from "../secureFile";
describe("messages de téléchargement contrôlé", () => {
  it("401 demande reconnexion", () => expect(secureFileMessage(401)).toMatch(/reconnectez/));
  it("403 refus après révocation ou autre entreprise", () => expect(secureFileMessage(403)).toMatch(/Accès refusé/));
});

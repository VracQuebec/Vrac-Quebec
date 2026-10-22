import { describe, it, expect } from "vitest";
import { classifyConfirmation } from "../../supabase/functions/submit-parcours/confirmation-status.ts";

describe("statut honnête du courriel de confirmation", () => {
  it("succès seulement si le service confirme", () => {
    expect(classifyConfirmation(true, { success: true, queued: true })).toBe("queued");
  });
  it("erreur serveur (503) = échec", () => {
    expect(classifyConfirmation(false, { error: "Failed to prepare confirmation" })).toBe("failed");
  });
  it("réponse illisible = échec, jamais succès", () => {
    expect(classifyConfirmation(true, null)).toBe("failed");
    expect(classifyConfirmation(true, {})).toBe("failed");
  });
  it("désinscription = non envoyé, pas un succès", () => {
    expect(classifyConfirmation(true, { success: false, reason: "email_suppressed" })).toBe("not_sent");
  });
});

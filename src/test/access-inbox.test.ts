import { describe, expect, it } from "vitest";
import { inboxState, isPending } from "@/lib/access-requests/inbox";

const none = { seen_at: null, taken_at: null, follow_status: "nouvelle" };

describe("boîte des nouvelles demandes de dompes", () => {
  it("une demande jamais ouverte est Nouvelle", () => {
    expect(inboxState("nouvelle", null)).toBe("nouvelle");
  });
  it("ouvrir la demande la rend Consultée, pas Traitée", () => {
    const s = inboxState("nouvelle", { ...none, seen_at: "2026-10-14T10:00:00Z" });
    expect(s).toBe("consultee");
    expect(isPending(s)).toBe(true);
  });
  it("un statut de coordination ou une prise en charge = En traitement", () => {
    expect(inboxState("informations_requises", none)).toBe("en_traitement");
    expect(inboxState("nouvelle", { ...none, follow_status: "prise_en_charge" })).toBe("en_traitement");
  });
  it("seule une décision réelle rend la demande Traitée et la retire", () => {
    expect(inboxState("acceptee", none)).toBe("traitee");
    expect(inboxState("refusee", none)).toBe("traitee");
    expect(isPending("traitee")).toBe(false);
  });
});

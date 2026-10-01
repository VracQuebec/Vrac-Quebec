import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { createdLabel } from "@/lib/fleet/api";
describe("Flotte — horodatage d'inscription", () => {
  it("hiver (UTC-5) et été (UTC-4) sans décalage", () => {
    expect(createdLabel({ created_at: "2026-01-15T14:05:00Z" })).toMatch(/^Enregistré le 15 janv\.? 2026 à 9 h 05$/);
    expect(createdLabel({ created_at: "2026-07-15T14:05:00Z" })).toMatch(/^Enregistré le 15 juill?\.? 2026 à 10 h 05$/);
  });
  it("changement d'heure : 8 mars 2026 06:59Z = 1 h 59 EST, 07:00Z = 3 h 00 EDT", () => {
    expect(createdLabel({ created_at: "2026-03-08T06:59:00Z" })).toMatch(/à 1 h 59$/);
    expect(createdLabel({ created_at: "2026-03-08T07:00:00Z" })).toMatch(/à 3 h 00$/);
  });
  it("minuit UTC → veille à Toronto, jamais arrondi", () => {
    expect(createdLabel({ created_at: "2026-02-01T00:00:00+00:00" })).toMatch(/31 janv\.? 2026 à 19 h 00$/);
  });
  it("heure inconnue jamais inventée", () => {
    expect(createdLabel({ created_at: null })).toBe("Enregistré le — · heure non enregistrée");
    expect(createdLabel({})).toMatch(/heure non enregistrée/);
    expect(createdLabel({ created_at: "2026-02-01" })).toMatch(/heure non enregistrée$/);
    expect(createdLabel({ created_at: "pas une date" })).toMatch(/heure non enregistrée/);
    expect(createdLabel({ created_at: "2026-02-01" })).not.toMatch(/0 h 00|minuit/);
  });
});

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
  it("heure sans fuseau explicite rejetée (jamais interprétée selon l'appareil)", () => {
    expect(createdLabel({ created_at: "2026-02-01T12:00:00" })).toBe("Enregistré le — · heure non enregistrée");
    expect(createdLabel({ created_at: "2026-02-01 12:00:00" })).toBe("Enregistré le — · heure non enregistrée");
  });
  it("date calendrier impossible rejetée (jamais normalisée silencieusement)", () => {
    expect(createdLabel({ created_at: "2026-02-30T12:00:00Z" })).toBe("Enregistré le — · heure non enregistrée");
    expect(createdLabel({ created_at: "2026-13-01T12:00:00Z" })).toBe("Enregistré le — · heure non enregistrée");
    expect(createdLabel({ created_at: "2026-02-30" })).toBe("Enregistré le — · heure non enregistrée");
    expect(createdLabel({ created_at: "2026-02-01T25:00:00Z" })).toBe("Enregistré le — · heure non enregistrée");
  });
  it("décalage invalide rejeté", () => {
    expect(createdLabel({ created_at: "2026-02-01T12:00:00+24:00" })).toBe("Enregistré le — · heure non enregistrée");
    expect(createdLabel({ created_at: "2026-02-01T12:00:00+05:60" })).toBe("Enregistré le — · heure non enregistrée");
  });
  it("offsets explicites équivalents → même heure Toronto", () => {
    const a = createdLabel({ created_at: "2026-01-15T14:05:00Z" });
    const b = createdLabel({ created_at: "2026-01-15T09:05:00-05:00" });
    const c = createdLabel({ created_at: "2026-01-15T16:05:00+02:00" });
    expect(a).toMatch(/à 9 h 05$/);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });
  it("résultat indépendant du fuseau de l'environnement", () => {
    const attendu = createdLabel({ created_at: "2026-07-15T14:05:00Z" });
    const tz = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Auckland";
      expect(createdLabel({ created_at: "2026-07-15T14:05:00Z" })).toBe(attendu);
      process.env.TZ = "America/Vancouver";
      expect(createdLabel({ created_at: "2026-07-15T14:05:00Z" })).toBe(attendu);
    } finally {
      if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz;
    }
  });
});

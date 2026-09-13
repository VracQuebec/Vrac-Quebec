// Sécurité place de marché : les règles doivent exister en base (RLS/triggers),
// pas seulement dans l'interface. Ces tests vérifient les garde-fous côté code
// ainsi que l'absence de mutation depuis le Matching Lab.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const migrations = () => {
  const dir = resolve(process.cwd(), "supabase/migrations");
  const fs = require("node:fs") as typeof import("node:fs");
  return fs.readdirSync(dir).map((f) => fs.readFileSync(resolve(dir, f), "utf8")).join("\n");
};

describe("Sécurité place de marché (base de données)", () => {
  const sql = migrations();

  it("17. une mutation ne peut pas usurper une entreprise", () => {
    expect(sql).toContain("jsc_user_controls_company");
    for (const table of ["jsc_listings", "jsc_public_offers", "jsc_public_requests"]) {
      const idx = sql.lastIndexOf(`ON public.${table}`);
      expect(idx).toBeGreaterThan(-1);
    }
    expect(sql).toMatch(/WITH CHECK \(auth\.uid\(\) = created_by AND public\.jsc_user_controls_company\(company_id\)\)/);
    expect(sql).toMatch(/WITH CHECK \(auth\.uid\(\) = responder_user_id AND public\.jsc_user_controls_company\(company_id\)\)/);
  });

  it("18/19. un auteur ne peut pas publier ni approuver son propre avis", () => {
    expect(sql).toContain("mkt_reviews_guard");
    expect(sql).toContain("jsc_marketplace_reviews_guard");
    expect(sql).toContain("NEW.is_approved := OLD.is_approved");
    expect(sql).toContain("NEW.status := OLD.status");
  });

  it("20. les fonctions internes ne sont pas exécutables anonymement", () => {
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.matching_lab_candidates");
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.jsc_user_controls_company");
  });
});

describe("Matching Lab — lecture / simulation seulement", () => {
  const src = read("src/pages/AdminMatchingLab.tsx");

  it("n'effectue aucune mutation métier", () => {
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/functions\.invoke/);
    // La seule écriture autorisée est le journal de simulation.
    const inserts = src.match(/\.from\("([a-z_]+)"\)\s*\.insert/g) ?? [];
    expect(inserts.length).toBeLessThanOrEqual(1);
    expect(src).toContain('.from("matching_simulation_log")');
  });

  it("reste réservé à l'administration et signale le matching public inactif", () => {
    expect(src).toContain("isAdmin");
    expect(src).toContain("matching_v2_enabled_public");
  });
});

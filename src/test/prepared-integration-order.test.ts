// Garde locale : empêche l'intégration prématurée du code guard_claim_id.
// Lecture de fichiers seulement — aucune requête réseau, base ou déploiement.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const FUNCS = join(ROOT, "supabase/functions");
const PREP = join(ROOT, "prepared");
const etat = JSON.parse(readFileSync(join(PREP, "deploiement/etat-migrations.json"), "utf8"));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|js|mjs)$/.test(n) ? [p] : [];
  });
}
const funcFiles = walk(FUNCS);
const rel = (p: string) => p.slice(ROOT.length + 1);

describe("ordre migration → code (guard_claim_id)", () => {
  it("aucune fonction serveur n'utilise guard_claim_id avant la migration déclarée appliquée", () => {
    if (etat["migration-guard-claim-id"] === true) return;
    const fautifs = funcFiles.filter((f) => /guard_claim_id|runClaimedCreate|claimed-create/.test(readFileSync(f, "utf8")));
    expect(fautifs.map(rel), "Code guard_claim_id copié dans supabase/functions/ trop tôt : appliquer d'abord migration-guard-claim-id puis la déclarer dans etat-migrations.json").toEqual([]);
    expect(existsSync(join(FUNCS, "_shared/claimed-create.ts"))).toBe(false);
  });

  it("la migration guard_claim_id ne peut être déclarée appliquée sans la migration anti-doublon", () => {
    if (etat["migration-guard-claim-id"]) expect(etat["migration-anti-doublon-transactionnel"]).toBe(true);
  });

  it("aucune fonction serveur n'importe depuis prepared/", () => {
    const fautifs = funcFiles.filter((f) => /from\s+["'][^"']*prepared\//.test(readFileSync(f, "utf8")));
    expect(fautifs.map(rel)).toEqual([]);
  });

  it("INTEGRATION.md documente l'ordre et l'import à changer", () => {
    const doc = readFileSync(join(PREP, "fonctions-guard-claim-id/INTEGRATION.md"), "utf8");
    const i1 = doc.indexOf("migration anti-doublon"), i2 = doc.indexOf("migration guard_claim_id"), i3 = doc.indexOf("copie du code");
    expect(i1).toBeGreaterThan(-1);
    expect(i1 < i2 && i2 < i3).toBe(true);
    expect(doc).toContain("./public-guard.ts");
    expect(doc).toContain("submit-parcours/index.ts");
    expect(doc).toContain("quote-submit/index.ts");
  });

  it("la migration préparée ajoute bien la colonne aux deux tables (remblai et achat de vrac)", () => {
    const sql = readFileSync(join(PREP, "deploiement/migration-guard-claim-id-NON-APPLIQUEE.sql"), "utf8");
    expect(sql).toMatch(/ALTER TABLE public\.submissions\s+ADD COLUMN IF NOT EXISTS guard_claim_id uuid/);
    expect(sql).toMatch(/ALTER TABLE public\.jsc_requests\s+ADD COLUMN IF NOT EXISTS guard_claim_id uuid/);
  });
});

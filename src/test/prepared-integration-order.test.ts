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

const PROPOSITION = readFileSync(join(PREP, "deploiement/proposition-restriction-fonctions-anon-NON-APPLIQUEE.sql"), "utf8");
const PRECONTROLE = readFileSync(join(PREP, "deploiement/precontrole-restriction-fonctions.sql"), "utf8");
const RETOUR = readFileSync(join(PREP, "deploiement/retour-arriere-restriction-fonctions-NON-APPLIQUE.sql"), "utf8");

describe("restriction des fonctions : prérequis et retour arrière", () => {
  it("bloquée tant qu'un prérequis (propriétaire, type, appelants) est inconnu", () => {
    const pre = etat["prerequis-seo_sync_cities_from_territories"];
    for (const k of ["proprietaire", "type_resultat", "appelants_code", "appelants_sql", "appelants_taches_planifiees"]) {
      expect(pre[k], `prérequis ${k} absent`).toBeTruthy();
    }
    const inconnus = Object.entries(pre).filter(([k, v]) => !k.startsWith("_") && /NON VÉRIFIÉ|inconnu/i.test(String(v)));
    if (inconnus.length) expect(etat["restriction-fonctions-prete"], `inconnus : ${inconnus.map(([k]) => k)}`).toBe(false);
  });

  it("la proposition commence par le précontrôle exact (arrêt en cas d'écart)", () => {
    const corps = PRECONTROLE.slice(PRECONTROLE.indexOf("DO $pre$"));
    expect(PROPOSITION).toContain(corps.trim());
    expect(PROPOSITION.indexOf("DO $pre$")).toBeLessThan(PROPOSITION.indexOf("ALTER FUNCTION"));
    expect(PROPOSITION.indexOf("DO $pre$")).toBeLessThan(PROPOSITION.indexOf("REVOKE"));
    expect(corps).toContain("RAISE EXCEPTION 'ARRÊT");
  });

  it("le précontrôle reprend propriétaire et type déclarés", () => {
    const pre = etat["prerequis-seo_sync_cities_from_territories"];
    expect(PRECONTROLE).toContain(`'public.seo_sync_cities_from_territories()', '${pre.proprietaire}'`);
    expect(PRECONTROLE).toContain(pre.droits_actuels);
  });

  it("le retour arrière vérifie l'état courant AVANT et les droits APRÈS", () => {
    const iAvant = RETOUR.indexOf("DO $avant$"), iDrop = RETOUR.indexOf("DROP FUNCTION"), iApres = RETOUR.indexOf("DO $apres$");
    expect(iAvant).toBeGreaterThan(-1);
    expect(iAvant < iDrop && iDrop < iApres).toBe(true);
    expect(RETOUR).toMatch(/ARRÊT retour arrière/);
  });

  it("le retour arrière n'accorde rien au-delà du relevé du 16 oct.", () => {
    const grants = [...RETOUR.matchAll(/^GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO ([^;]+);/gm)].map((m) => [m[1], m[2].replace(/\s/g, "")]);
    expect(grants).toEqual([
      ["seo_sync_cities_from_territories", "anon,authenticated,service_role"],
      ["seo_optimization_counts", "anon"],
      ["seo_optimization_candidates", "anon"],
      ["mkt_compute_commission", "PUBLIC"],
      ["blog_increment_view", "anon,authenticated"],
    ]);
  });
});

describe("titres SEO préservés", () => {
  it("aucun fichier préparé de déploiement ni fonction serveur n'écrit meta_title", () => {
    const fichiers = [...walk(join(PREP, "deploiement")), ...readdirSync(join(PREP, "deploiement")).filter((n) => n.endsWith(".sql")).map((n) => join(PREP, "deploiement", n))];
    const fautifs = fichiers.filter((f) => /UPDATE\s+public\.seo_pages[\s\S]{0,200}meta_title|meta_title\s*=/i.test(readFileSync(f, "utf8")));
    expect(fautifs.map(rel)).toEqual([]);
  });
});

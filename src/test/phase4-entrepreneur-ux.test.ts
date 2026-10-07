import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const shell = source("src/components/entrepreneur-app/EntrepreneurAppShell.tsx");
const home = source("src/pages/EntrepreneurDashboard.tsx");
const activity = source("src/pages/EntrepreneurActivites.tsx");
const account = source("src/pages/EntrepreneurCompte.tsx");

describe("Phase 4 — protections de présentation entrepreneur", () => {
  it("conserve les cinq entrées et les groupes existants", () => {
    expect(shell).toContain("grid-cols-5");
    for (const title of ["Opérations", "Planification", "Mon entreprise", "Mes ressources", "Compte"])
      expect(shell).toContain(`title: "${title}"`);
  });
  it("ouvre seulement le groupe courant, sans cacher définitivement des accès", () => {
    expect(shell).toContain("setOpenSections(current ? [current] : [])");
    expect(shell).toContain("aria-expanded={open}");
    for (const destination of ["agenda", "taches", "crm", "flotte", "documents", "assurances", "finances", "punch"])
      expect(shell).toContain(`/entrepreneur/${destination}`);
  });
  it("compte toutes les demandes à compléter, même lorsque la liste est limitée à trois", () => {
    expect(home).toContain("const attention = attentionRequests.slice(0, 3)");
    expect(home).toContain('value: attentionRequests.length, label: "À faire"');
    expect(home).toContain("Toutes les demandes à compléter");
  });
  it("préserve la distinction décompte, coupons et services, sans lecture opérationnelle ajoutée", () => {
    expect(activity).toContain("Décompte des voyages par demande");
    for (const view of ["voyages", "coupons", "services"])
      expect(activity).toContain(`value="${view}"`);
    expect(activity).toContain("?cote=livre");
    expect(activity).toContain("Voir la demande");
    expect(activity).not.toContain('from("trips")');
  });
  it("rejoint les sections compte et préférences après le chargement", () => {
    expect(account).toContain("if (loading || failed || !hash) return");
    expect(account).toContain('scrollIntoView({ block: "start" })');
    expect(account).toContain('id="mon-compte"');
    expect(account).toContain('id="preferences"');
  });
  it("n'ajoute aucune écriture à l'accueil ou au décompte", () => {
    for (const text of [home, activity]) {
      expect(text).not.toMatch(/\.(insert|update|delete|upsert)\(/);
    }
  });
});
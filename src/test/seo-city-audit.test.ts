import { describe, it, expect } from "vitest";
import { auditStatus, sortAuditRows, summarize, completeness, AUDIT_STATUS_LABEL, type AuditRow } from "@/lib/seo/cityAudit";

const row = (p: Partial<AuditRow>): AuditRow => ({
  slug: "x", name: "Ville", planned: 0, generated: 0, published: 0, drafts: 0, remaining: 0, errors: 0, pending: 0, ...p,
});

describe("audit des combinaisons par ville", () => {
  it("complète quand toutes les combinaisons pertinentes existent", () => {
    expect(auditStatus(row({ planned: 6, generated: 6, published: 6 }))).toBe("complete");
  });
  it("complète même avec un petit nombre de combinaisons (6/6)", () => {
    expect(auditStatus(row({ planned: 6, generated: 6, drafts: 6 }))).toBe("complete");
  });
  it("complète avec 28/28 sans considérer 28 comme obligatoire", () => {
    expect(auditStatus(row({ planned: 28, generated: 28, published: 20, drafts: 8 }))).toBe("complete");
  });
  it("incomplète quand des combinaisons pertinentes manquent", () => {
    expect(auditStatus(row({ planned: 28, generated: 10, drafts: 10, remaining: 18 }))).toBe("incomplete");
  });
  it("aucune page quand rien n'est généré", () => {
    expect(auditStatus(row({ planned: 5, remaining: 5 }))).toBe("none");
  });
  it("erreur prioritaire sur incomplète", () => {
    expect(auditStatus(row({ planned: 5, generated: 4, drafts: 4, remaining: 1, errors: 1 }))).toBe("error");
  });
  it("à vérifier si généré dépasse le prévu", () => {
    expect(auditStatus(row({ planned: 3, generated: 5, drafts: 5 }))).toBe("check");
  });
  it("à vérifier si publiées + brouillons ne font pas les générées", () => {
    expect(auditStatus(row({ planned: 4, generated: 4, published: 1, drafts: 1 }))).toBe("check");
  });
  it("à vérifier si générées + manquantes ne font pas les pertinentes", () => {
    expect(auditStatus(row({ planned: 10, generated: 4, drafts: 4, remaining: 2 }))).toBe("check");
  });
  it("à vérifier si aucune combinaison pertinente n'est calculée", () => {
    expect(auditStatus(row({ planned: 0 }))).toBe("check");
  });
  it("les brouillons comptent comme combinaisons créées", () => {
    const r = row({ planned: 4, generated: 4, drafts: 4 });
    expect(auditStatus(r)).toBe("complete");
    expect(completeness(r)).toBe(1);
  });
  it("complétude nulle sans page", () => {
    expect(completeness(row({ planned: 8, remaining: 8 }))).toBe(0);
  });
  it("complétude à zéro si aucune combinaison prévue", () => {
    expect(completeness(row({}))).toBe(0);
  });
  it("tri par pages manquantes décroissant", () => {
    const rows = [row({ slug: "a", name: "A", planned: 5, generated: 4, drafts: 4, remaining: 1 }), row({ slug: "b", name: "B", planned: 9, generated: 2, drafts: 2, remaining: 7 })];
    expect(sortAuditRows(rows, "missing")[0].slug).toBe("b");
  });
  it("tri par moins de pages générées", () => {
    const rows = [row({ slug: "a", name: "A", generated: 9 }), row({ slug: "b", name: "B", generated: 1 })];
    expect(sortAuditRows(rows, "generated")[0].slug).toBe("b");
  });
  it("tri par erreurs décroissant", () => {
    const rows = [row({ slug: "a", name: "A", errors: 0 }), row({ slug: "b", name: "B", errors: 3 })];
    expect(sortAuditRows(rows, "errors")[0].slug).toBe("b");
  });
  it("tri alphabétique avec accents", () => {
    const rows = [row({ slug: "z", name: "Étang" }), row({ slug: "a", name: "Adstock" })];
    expect(sortAuditRows(rows, "name").map((r) => r.slug)).toEqual(["a", "z"]);
  });
  it("tri par complétude croissante", () => {
    const rows = [row({ slug: "a", name: "A", planned: 4, generated: 4, drafts: 4 }), row({ slug: "b", name: "B", planned: 4, generated: 1, drafts: 1, remaining: 3 })];
    expect(sortAuditRows(rows, "completeness")[0].slug).toBe("b");
  });
  it("le tri ne modifie pas le tableau source", () => {
    const rows = [row({ slug: "a", name: "A" }), row({ slug: "b", name: "B", remaining: 5 })];
    sortAuditRows(rows, "missing");
    expect(rows[0].slug).toBe("a");
  });
  it("résumé cohérent avec le total des villes", () => {
    const rows = [
      row({ slug: "a", name: "A", planned: 6, generated: 6, published: 6 }),
      row({ slug: "b", name: "B", planned: 8, generated: 3, drafts: 3, remaining: 5 }),
      row({ slug: "c", name: "C", planned: 4, remaining: 4 }),
      row({ slug: "d", name: "D", planned: 4, generated: 4, drafts: 4, errors: 1 }),
      row({ slug: "e", name: "E", planned: 2, generated: 3, drafts: 3 }),
    ];
    const s = summarize(rows);
    expect(s).toEqual({ total: 5, complete: 1, incomplete: 1, none: 1, errors: 1, check: 1 });
    expect(s.complete + s.incomplete + s.none + s.errors + s.check).toBe(s.total);
  });
  it("libellés de statut en français", () => {
    expect(AUDIT_STATUS_LABEL.complete).toBe("COMPLÈTE");
    expect(AUDIT_STATUS_LABEL.check).toBe("À VÉRIFIER");
  });
});

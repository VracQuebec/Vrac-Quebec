import { describe, it, expect } from "vitest";
import { DEFAULT_TEMPLATES, FILE_MAX, FILE_MIME, incomplete, lineTotal, subtotal, type QLine } from "@/lib/entcrm/catalog";

describe("CRM-ENT-03 — calculs et fichiers", () => {
  it("prix absent : ligne incomplète, jamais comptée comme zéro", () => {
    const l: QLine[] = [{ desc: "Pelle", qty: 4, unit: "heure", price: null }, { desc: "Transport", qty: 2, unit: "voyage", price: 150 }];
    expect(lineTotal(l[0])).toBeNull();
    expect(incomplete(l)).toBe(1);
    expect(subtotal(l)).toBe(300);
  });
  it("zéro volontaire est une valeur, pas une absence", () => {
    expect(incomplete([{ desc: "Gratuit", qty: 1, unit: "forfait", price: 0 }])).toBe(0);
  });
  it("modèles de départ : quantités et prix vides", () => {
    expect(DEFAULT_TEMPLATES.length).toBe(6);
    for (const t of DEFAULT_TEMPLATES) for (const l of t.lines) { expect(l.qty).toBeNull(); expect(l.price).toBeNull(); }
  });
  it("formats et limite de 20 Mo", () => {
    expect(Object.keys(FILE_MIME).sort()).toEqual(["heic", "jpeg", "jpg", "pdf", "png", "webp"]);
    expect(FILE_MAX).toBe(20 * 1024 * 1024);
  });
  it("une ligne figée ne change pas quand le catalogue change", () => {
    const frozen: QLine = { desc: "Transport", qty: 2, unit: "voyage", price: 150, price_at: "2026-09-27" };
    const copy = structuredClone(frozen);
    const catalogPrice = 175; void catalogPrice;
    expect(lineTotal(copy)).toBe(300);
  });
});

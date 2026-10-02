// FIN-12C — reçus et documents : suggestions jamais inventées, fournisseur jamais deviné, incohérences signalées.
import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { editsFrom, matchSupplier, warnings, type ExDoc } from "@/lib/finances/captures";

const doc = (p: Partial<ExDoc>): ExDoc => ({ doc_type: "facture", supplier_name: null, reference: null, doc_date: null, due_date: null, currency: null, subtotal: null, gst: null, qst: null,
  other_taxes: null, total: null, paid_mention: false, pages: null, lines: [], uncertain: [], ...p });
const sups = [{ id: "s1", name: "Béton Québec Inc.", archived: false }, { id: "s2", name: "Béton Lévis", archived: false }];

describe("FIN-12C", () => {
  it("champ illisible = vide (À compléter), jamais 0; aucune échéance déduite de la date", () => {
    const e = editsFrom(doc({ doc_date: "2026-09-28", total: 12.5 }), 0, "");
    expect(e.gst).toBe(""); expect(e.qst).toBe(""); expect(e.subtotal).toBe(""); expect(e.due_date).toBe(""); expect(e.total).toBe("12.5");
  });
  it("note de crédit lue → brouillon de note de crédit", () => { expect(editsFrom(doc({ doc_type: "note_credit" }), 0, "").kind).toBe("credit"); });
  it("fournisseur : exact seulement (accents/casse), approximatif proposé sans sélection", () => {
    expect(matchSupplier("BETON QUEBEC INC", sups).exact).toBe("s1");
    const m = matchSupplier("Béton", sups); expect(m.exact).toBeNull(); expect(m.close.length).toBe(2);
  });
  it("incohérences signalées sans correction", () => {
    const d = doc({ subtotal: 300, lines: [{ description: "a", quantity: 1, unit: null, unit_price: null, amount: 250 }] });
    const w = warnings(d, { ...editsFrom(d, 0, "s1"), gst: "15", qst: "29.93", total: "340" });
    expect(w.some((x) => x.includes("Écart"))).toBe(true); expect(w.some((x) => x.includes("Somme des lignes"))).toBe(true);
    expect(warnings(doc({ currency: "$" }), editsFrom(null, 0, ""))).toEqual([]);
  });
});

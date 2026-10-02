import { describe, expect, it } from "vitest";
import { summarize, linePayload, emptyLine, lineFromExtraction } from "@/lib/finances/expenses";

describe("FIN-12D — notes de frais", () => {
  it("300 approuvés − 150 avance − 100 remboursés = 50 dû", () => {
    expect(summarize([{ payer: "employe", accepted_amount: 300, business_amount: 300 }], 150, 100).due).toBe(50);
  });
  it("dépense payée par l'entreprise : rien à rembourser", () => {
    const s = summarize([{ payer: "entreprise", accepted_amount: 100, business_amount: 100 }], 0, 0);
    expect(s.reimbursable).toBe(0); expect(s.company).toBe(100); expect(s.due).toBe(0);
  });
  it("avance 300 / dépenses 220 : jamais de solde négatif", () => {
    expect(summarize([{ payer: "avance", accepted_amount: 220, business_amount: 220 }], 220, 0).due).toBe(0);
  });
  it("achat lié seulement si payé par l'entreprise; virgule décimale acceptée", () => {
    const p = linePayload({ ...emptyLine(), payer: "employe", supplier_bill_id: "x", business_amount: "12,5" });
    expect(p.supplier_bill_id).toBe(""); expect(p.business_amount).toBe("12.5");
  });
  it("taxe non lue reste vide (jamais 0)", () => {
    const l = lineFromExtraction({ documents: [{ doc_type: "recu", supplier_name: "FIC", reference: null, doc_date: "2026-10-01", due_date: null, currency: "CAD", subtotal: null, gst: null, qst: null, other_taxes: null, total: 40, paid_mention: true, pages: null, lines: [], uncertain: [] }], notes: null }, emptyLine());
    expect(l.gst).toBe(""); expect(l.qst).toBe(""); expect(l.doc_amount).toBe("40");
  });
});

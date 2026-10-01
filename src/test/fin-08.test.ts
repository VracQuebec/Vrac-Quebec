import { describe, it, expect } from "vitest";
import { renderInvoicePdf, treatmentText } from "@/lib/finances/invoicePdf";
import { invoiceState } from "@/components/finances/Invoices";
import { computeTaxes } from "@/lib/finances/tax";

describe("FIN-08 factures", () => {
  it("PDF multipage avec pagination, totaux identiques au moteur", () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({ desc: `Ligne ${i} `.repeat(i % 6 ? 1 : 12), qty: 1, unit: "u", price: "25", tax: "taxable" as const }));
    const tax = computeTaxes(lines, { gstStatus: "inscrit", qstStatus: "inscrit", rates: { gst: "0.05", qst: "0.09975" } });
    const doc = renderInvoicePdf({ status: "brouillon", isTest: true, number: null, issueDate: "2026-09-30", dueDate: null, terms: null, seller: { name: "TEST" }, client: { name: "Client" }, lines, tax: { ...tax, gst_status: "inscrit", qst_status: "inscrit" } as never, template: {} });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(tax.total).toBe(1149.75);
  });
  it("traitements lisibles et « Payée » seulement par encaissements reliés", () => {
    expect(treatmentText("detaxe", true, true)).toBe("Détaxé (0 %)");
    expect(treatmentText("taxable", false, false)).toMatch(/non inscrit/);
    expect(invoiceState({ status: "emise", total: 100, sent_at: null, fin_expected_inflows: { received: 0 } }, "2026-09-30").label).toBe("Émise (non envoyée)");
    expect(invoiceState({ status: "emise", total: 100, fin_expected_inflows: { received: 100 } }, "2026-09-30").label).toMatch(/^Payée/);
    expect(invoiceState({ status: "emise", total: 100, due_date: "2026-09-01", fin_expected_inflows: { received: 40 } }, "2026-09-30").label).toBe("En retard");
  });
});

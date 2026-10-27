import { renderInvoicePdf } from "/dev-server/src/lib/finances/invoicePdf.ts";
import { writeFileSync } from "fs";
const lines = Array.from({length: 38}, (_, i) => ({ desc: `Transport de remblai — voyage n° ${i+1} (Saint-Jérôme → Lévis), matériau classé, accès été`, qty: 1, unit: "voyage", price: 150, disc_pct: 0, tax: "taxable" as const }));
const sub = 38*150, gst = Math.round(sub*0.05*100)/100, qst = Math.round(sub*0.09975*100)/100;
const doc = renderInvoicePdf({ status: "emise", isTest: true, number: "TEST-2026-0001", issueDate: "2026-10-27", dueDate: "2026-11-26", terms: "Net 30 jours", projectName: "Chantier fictif — Rivière-du-Loup",
 seller: { name: "Entreprise Fictive Éloïse inc.", address: "123, rue de l’Église, Québec (Québec) G1R 0A0", phone: "819-592-3495", email: "facturation@exemple.invalid", gst_number: "000000000RT0001", qst_number: "0000000000TQ0001" },
 client: { name: "Client Fictif Hélène Côté", address: "45, boul. Saint-Joseph, Gatineau (Québec)", email: "client@exemple.invalid" },
 lines: lines as any, tax: { subtotal: sub, discount: 0, taxable_base: sub, zero_rated_base: 0, exempt_base: 0, undetermined: 0, gst, qst, gst_rate: 0.05, qst_rate: 0.09975, pre_tax: sub, total: sub+gst+qst, prices_include_tax: false, gst_status: "inscrit", qst_status: "inscrit" },
 template: { color: "#7DD520", footer: "Document TEST — aucune valeur fiscale. Merci de votre confiance.", version: 1 } });
writeFileSync("/tmp/pdf/facture-test.pdf", Buffer.from(doc.output("arraybuffer")));
console.log(sub, gst, qst, sub+gst+qst);

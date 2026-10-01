// FIN-09A — PDF d'une note de crédit, rendu uniquement depuis les instantanés figés à l'émission
// (vendeur, client, facture source, montants crédités). Jamais de note interne ni de profil actuel.
import { jsPDF } from "jspdf";
import { TREATMENT_LABEL, type TaxTreatment } from "./tax";

export type CreditNotePdfData = {
  status: "brouillon" | "emise"; isTest: boolean; number: string | null; issuedAt: string | null; reason: string;
  seller: { name?: string | null; legal_name?: string | null; address?: string | null; phone?: string | null; email?: string | null; gst_number?: string | null; qst_number?: string | null };
  client: { name?: string | null; address?: string | null; email?: string | null; phone?: string | null };
  invoice: { number?: string | null; issue_date?: string | null; total?: number | null };
  credit: { mode: string; lines: { desc?: string | null; unit?: string | null; qty: number; tax: string; gross: number; base?: number | null }[]; taxable_base: number; zero_rated_base: number; exempt_base: number; pre_tax: number; gst: number; qst: number; total: number; gst_rate: number; qst_rate: number; gst_status?: string; qst_status?: string };
  template: { color?: string | null; footer?: string | null };
  logo?: { data: string; format: "PNG" | "JPEG"; w: number; h: number } | null;
};

const clean = (s: string) => s.replace(/[\u202F\u00A0]/g, " ").replace(/[\u2212\u2013\u2014]/g, "-").replace(/[\u2019]/g, "'");
const money = (n: number | null | undefined) => clean(Number(n ?? 0).toLocaleString("fr-CA", { style: "currency", currency: "CAD" }));
const date = (d: string | null | undefined) => d ? clean(new Date(d.length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString("fr-CA", { timeZone: "America/Toronto", day: "numeric", month: "long", year: "numeric" })) : "-";
const pct = (r: number) => clean(` (${(r * 100).toLocaleString("fr-CA", { maximumFractionDigits: 3 })} %)`);
const hex = (c?: string | null): [number, number, number] => { const m = /^#?([0-9a-f]{6})$/i.exec(c ?? ""); const v = m ? parseInt(m[1], 16) : 0x111111; return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };

export function renderCreditNotePdf(d: CreditNotePdfData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 15, FOOT = 22;
  const color = hex(d.template.color);
  const T = (s: string, x: number, y: number, o?: Parameters<jsPDF["text"]>[3]) => doc.text(clean(s), x, y, o);
  const wrap = (s: string, w: number) => doc.splitTextToSize(clean(s), w) as string[];
  const header = () => {
    let y = M;
    if (d.logo) { const r = Math.min(32 / d.logo.w, 18 / d.logo.h); try { doc.addImage(d.logo.data, d.logo.format, M, y, d.logo.w * r, d.logo.h * r); } catch { /* ignoré */ } }
    const sx = d.logo ? M + 36 : M;
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(17, 17, 17);
    T(d.seller.legal_name || d.seller.name || "Entreprise", sx, y + 4);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(70, 70, 70);
    [d.seller.address, [d.seller.phone, d.seller.email].filter(Boolean).join("  ·  ") || null,
      [d.seller.gst_number ? `TPS n° ${d.seller.gst_number}` : null, d.seller.qst_number ? `TVQ n° ${d.seller.qst_number}` : null].filter(Boolean).join("  ·  ") || null]
      .filter(Boolean).forEach((l, i) => T(wrap(l as string, 80)[0], sx, y + 8.5 + i * 3.8));
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...color);
    T("NOTE DE CRÉDIT", W - M, y + 6, { align: "right" });
    doc.setFontSize(10); doc.setTextColor(17, 17, 17);
    T(d.number ? `N° ${d.number}` : "Numéro attribué à l'émission", W - M, y + 12, { align: "right" });
    y += 24; doc.setDrawColor(...color); doc.setLineWidth(0.6); doc.line(M, y, W - M, y);
    return y + 5;
  };
  let y = header();
  doc.setFontSize(8); doc.setTextColor(110, 110, 110); doc.setFont("helvetica", "bold");
  T("CLIENT", M, y); T("DÉTAILS", W / 2 + 10, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(17, 17, 17);
  let cy = y + 5; [d.client.name, d.client.address, d.client.phone, d.client.email].filter(Boolean).forEach((l) => wrap(l as string, W / 2 - M).forEach((w) => { T(w, M, cy); cy += 4.3; }));
  const det: [string, string][] = [["Date de la note", date(d.issuedAt)], ["Facture source", d.invoice.number ?? "-"], ["Date de la facture", date(d.invoice.issue_date)], ["Total de la facture", money(d.invoice.total)]];
  let dy = y + 5; det.forEach(([k, v]) => { doc.setTextColor(110, 110, 110); T(k, W / 2 + 10, dy); doc.setTextColor(17, 17, 17); T(v, W - M, dy, { align: "right" }); dy += 4.6; });
  y = Math.max(cy, dy) + 3;
  const LIMIT = H - FOOT - 4;
  // Motif paginé : chaque ligne vérifie la place restante (motifs longs sur plusieurs pages).
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(17, 17, 17); T("Motif", M, y); doc.setFont("helvetica", "normal");
  for (const w of wrap(d.reason, W - 2 * M)) {
    if (y + 4.3 > LIMIT) { doc.addPage(); y = header(); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(17, 17, 17); T("Motif (suite)", M, y); doc.setFont("helvetica", "normal"); }
    y += 4.3; T(w, M, y);
  }
  y += 6;

  const DESC_W = 74;
  const tableHead = () => {
    doc.setFillColor(...color); doc.rect(M, y, W - 2 * M, 6.5, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(255, 255, 255);
    T("Description créditée", M + 1.5, y + 4.4); T("Qté", M + 94, y + 4.4, { align: "right" }); T("Traitement", M + 97, y + 4.4);
    T("Montant (prix facture)", W - M - 32, y + 4.4, { align: "right" }); T("Base HT", W - M - 1.5, y + 4.4, { align: "right" });
    y += 9; doc.setTextColor(17, 17, 17); doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  };
  if (d.credit.lines?.length) {
    if (y + 16 > LIMIT) { doc.addPage(); y = header(); }
    tableHead();
    for (const l of d.credit.lines) {
      const dl = wrap(l.desc || "-", DESC_W);
      if (y + 6 > LIMIT) { doc.addPage(); y = header(); tableHead(); }
      T(`${l.qty} ${l.unit ?? ""}`.trim(), M + 94, y + 3.2, { align: "right" }); T(TREATMENT_LABEL[l.tax as TaxTreatment] ?? l.tax, M + 97, y + 3.2);
      T(money(l.gross), W - M - 32, y + 3.2, { align: "right" }); if (l.base != null) T(money(l.base), W - M - 1.5, y + 3.2, { align: "right" });
      // Description longue : continue sur la page suivante avec l'en-tête du tableau répété.
      dl.forEach((t) => { if (y + 3.8 > LIMIT) { doc.addPage(); y = header(); tableHead(); T("(suite)", M + 94, y + 3.2, { align: "right" }); } T(t, M + 1.5, y + 3.2); y += 3.8; });
      y += 2.2;
    }
  } else { doc.setFontSize(8.5); T(d.credit.mode === "balance" ? "Crédit du solde exact restant (sans retour de lignes)." : "Crédit par montant (sans retour de lignes).", M, y); y += 6; }

  const c = d.credit; const rows: [string, string, boolean?][] = [];
  rows.push(["Base taxable créditée", money(c.taxable_base)]);
  if (c.zero_rated_base) rows.push(["Détaxé (0 %) crédité", money(c.zero_rated_base)]);
  if (c.exempt_base) rows.push(["Exonéré crédité", money(c.exempt_base)]);
  rows.push(["Montant avant taxes crédité", money(c.pre_tax)]);
  rows.push([`TPS ajustée${pct(c.gst_rate)}`, c.gst_status === "inscrit" ? money(c.gst) : "Non inscrit"]);
  rows.push([`TVQ ajustée${pct(c.qst_rate)}`, c.qst_status === "inscrit" ? money(c.qst) : "Non inscrit"]);
  rows.push(["TOTAL CRÉDITÉ", money(c.total), true]);
  if (y + rows.length * 5.2 + 16 > H - FOOT - 4) { doc.addPage(); y = header(); }
  y += 3; const bx = W - M - 92;
  rows.forEach(([k, v, strong]) => {
    if (strong) { doc.setFillColor(...color); doc.rect(bx, y - 3.8, 92, 6.6, "F"); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); }
    else { doc.setTextColor(17, 17, 17); doc.setFont("helvetica", "normal"); doc.setFontSize(9); }
    T(k, bx + 2, y); T(v, W - M - 2, y, { align: "right" }); y += strong ? 7 : 5.2;
  });
  doc.setTextColor(90, 90, 90); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  ["Taxes ajustées selon les taux et le traitement figés sur la facture source. Cette note réduit le montant dû; elle n'est pas un remboursement."].forEach((n) => wrap(n, W - 2 * M).forEach((w) => { T(w, M, y + 2); y += 3.4; }));

  const pages = doc.getNumberOfPages(); const mark = d.isTest ? (d.status === "brouillon" ? "BROUILLON - TEST" : "TEST") : d.status === "brouillon" ? "BROUILLON" : null;
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    if (mark) { const G = (doc as unknown as { GState: new (o: object) => unknown }).GState; doc.setGState(new G({ opacity: 0.2 }) as never);
      doc.setTextColor(120, 120, 120); doc.setFont("helvetica", "bold"); doc.setFontSize(mark.length > 10 ? 50 : 72); T(mark, W / 2, H / 2 + 20, { align: "center", angle: 35 });
      doc.setGState(new G({ opacity: 1 }) as never); }
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.line(M, H - FOOT + 4, W - M, H - FOOT + 4);
    doc.setTextColor(100, 100, 100); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    if (d.template.footer) wrap(d.template.footer, W - 2 * M - 30).slice(0, 3).forEach((w, i) => T(w, M, H - FOOT + 8.5 + i * 3.4));
    T(`Page ${p} / ${pages}`, W - M, H - FOOT + 8.5, { align: "right" });
    if (d.number) T(d.number, W - M, H - FOOT + 12, { align: "right" });
  }
  return doc;
}

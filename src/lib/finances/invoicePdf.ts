// FIN-08 — Rendu PDF des factures (modèle « standard »). Fonction pure : n'affiche que des données
// destinées au client (jamais coûts internes, marges ni note interne). Multipage : en-tête répété,
// en-tête de tableau répété, totaux jamais coupés, pagination « Page x / y ».
import { jsPDF } from "jspdf";
import { computeTaxes, TREATMENT_LABEL, type TaxLine, type TaxTreatment } from "./tax";

/** prog : ligne de facture progressive par quantités (qté de cette facture, cumul, prix unitaire contractuel). */
export type InvoicePdfLine = TaxLine & {
  desc: string;
  unit?: string | null;
  prog?: { qty_new: number | string; qty_cum: number | string; qty_contract: number | string; unit_price?: number | string | null; disc_pct?: number | string | null } | null;
};
export type InvoicePdfData = {
  status: "brouillon" | "emise";
  isTest: boolean;
  number: string | null;
  issueDate: string | null;
  dueDate: string | null;
  terms: string | null;
  projectName?: string | null;
  seller: {
    name?: string | null;
    legal_name?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    gst_number?: string | null;
    qst_number?: string | null;
  };
  client: { name?: string | null; address?: string | null; email?: string | null; phone?: string | null };
  lines: InvoicePdfLine[];
  tax: {
    subtotal: number;
    discount: number;
    taxable_base: number | null;
    zero_rated_base: number;
    exempt_base: number;
    undetermined: number;
    gst: number | null;
    qst: number | null;
    gst_rate: number | null;
    qst_rate: number | null;
    pre_tax: number | null;
    total: number | null;
    prices_include_tax: boolean;
    gst_status?: string;
    qst_status?: string;
  };
  template: { color?: string | null; footer?: string | null; version?: number };
  logo?: { data: string; format: "PNG" | "JPEG"; w: number; h: number } | null;
  progress?: ProgressRecap | null;
};
type PP = { ht: number | string; total: number | string; pct?: number | string; cap?: number | string };
export type ProgressRecap = {
  kind: "acompte" | "situation" | "solde";
  seq: number;
  quote_number?: string | null;
  basis?: "ht" | "ttc";
  contract: PP;
  prev: PP;
  cum: PP;
  new: PP;
  remaining: PP;
  gap_vs_quote?: { ht?: number | string; gst?: number | string; qst?: number | string; total: number | string } | null;
  previous?: { number: string; total: number | string }[];
  contract_version?: number;
  initial?: PP | null;
  amendments?: { seq: number; reason: string; approval_ref?: string | null; delta?: { cap?: number | string; total?: number | string } }[];
  milestone?: { ord: number; title: string } | null;
};

// Polices standard PDF (WinAnsi) : on remplace les espaces fines et signes hors jeu.
const clean = (s: string) =>
  s
    .replace(/[\u202F\u00A0]/g, " ")
    .replace(/[\u2212\u2013\u2014]/g, "-")
    .replace(/[\u2019]/g, "'");
const money = (n: number | null | undefined) =>
  n == null ? "À déterminer" : clean(n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" }));
const num = (n: unknown) =>
  n == null || n === "" ? "" : clean(Number(n).toLocaleString("fr-CA", { maximumFractionDigits: 4 }));
const date = (d: string | null) =>
  d
    ? clean(
        new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-CA", {
          timeZone: "UTC",
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      )
    : "-";
const pct = (r: number | null) =>
  r == null ? "" : ` (${clean((r * 100).toLocaleString("fr-CA", { maximumFractionDigits: 3 }))} %)`;
const hex = (c?: string | null): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c ?? "");
  const v = m ? parseInt(m[1], 16) : 0x111111;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

export function treatmentText(t: TaxTreatment | null | undefined, gstOn: boolean, qstOn: boolean) {
  if (t === "taxable")
    return gstOn && qstOn ? "TPS + TVQ" : gstOn ? "TPS" : qstOn ? "TVQ" : "Non taxé (vendeur non inscrit)";
  return TREATMENT_LABEL[t ?? "a_determiner"];
}

export function renderInvoicePdf(d: InvoicePdfData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const W = doc.internal.pageSize.getWidth(),
    H = doc.internal.pageSize.getHeight(),
    M = 15,
    FOOT = 22;
  const color = hex(d.template.color);
  const gstOn = d.tax.gst_status === "inscrit",
    qstOn = d.tax.qst_status === "inscrit";
  const T = (s: string, x: number, y: number, o?: Parameters<jsPDF["text"]>[3]) => doc.text(clean(s), x, y, o);
  const wrap = (s: string, w: number) => doc.splitTextToSize(clean(s), w) as string[];
  const cols = [
    // x de départ, largeur, alignement
    { k: "desc", l: "Description", w: 70, a: "left" },
    { k: "qty", l: "Qté", w: 14, a: "right" },
    { k: "unit", l: "Unité", w: 16, a: "left" },
    { k: "price", l: "Prix unitaire", w: 24, a: "right" },
    { k: "disc", l: "Rabais", w: 14, a: "right" },
    { k: "tax", l: "Taxes", w: 22, a: "left" },
    { k: "amt", l: "Montant", w: 26, a: "right" },
  ] as const;
  let x0 = M;
  const cx = cols.map((c) => {
    const v = x0;
    x0 += c.w;
    return v;
  });

  const header = (first: boolean) => {
    let y = M;
    if (d.logo) {
      const r = Math.min(32 / d.logo.w, 18 / d.logo.h);
      try {
        doc.addImage(d.logo.data, d.logo.format, M, y, d.logo.w * r, d.logo.h * r);
      } catch {
        /* logo illisible : ignoré */
      }
    }
    const sx = d.logo ? M + 36 : M;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(17, 17, 17);
    T(d.seller.legal_name || d.seller.name || "Entreprise", sx, y + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(70, 70, 70);
    const sl = [
      d.seller.legal_name && d.seller.name && d.seller.name !== d.seller.legal_name ? d.seller.name : null,
      d.seller.address,
      [d.seller.phone, d.seller.email].filter(Boolean).join("  ·  ") || null,
    ].filter(Boolean) as string[];
    sl.slice(0, 3).forEach((l, i) => T(wrap(l, 80)[0], sx, y + 8.5 + i * 3.8));
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...color);
    T("FACTURE", W - M, y + 6, { align: "right" });
    doc.setFontSize(10);
    doc.setTextColor(17, 17, 17);
    T(d.number ? `N° ${d.number}` : "Numéro attribué à l'émission", W - M, y + 12, { align: "right" });
    y += 24;
    doc.setDrawColor(...color);
    doc.setLineWidth(0.6);
    doc.line(M, y, W - M, y);
    return first ? y + 5 : y + 4;
  };
  const tableHead = (y: number) => {
    doc.setFillColor(...color);
    doc.rect(M, y, W - 2 * M, 6.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    cols.forEach((c, i) =>
      T(c.l, c.a === "right" ? cx[i] + c.w - 1.5 : cx[i] + 1.5, y + 4.4, { align: c.a as "left" | "right" }),
    );
    doc.setTextColor(17, 17, 17);
    doc.setFont("helvetica", "normal");
    return y + 9;
  };

  let y = header(true);
  // Client et dates
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.setFont("helvetica", "bold");
  T("FACTURER À", M, y);
  T("DÉTAILS", W / 2 + 10, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(17, 17, 17);
  const cl = [d.client.name, d.client.address, d.client.phone, d.client.email].filter(Boolean) as string[];
  let cy = y + 5;
  cl.forEach((l) =>
    wrap(l, W / 2 - M).forEach((w) => {
      T(w, M, cy);
      cy += 4.3;
    }),
  );
  const det: [string, string][] = [
    ["Date de facture", date(d.issueDate)],
    ["Échéance", date(d.dueDate)],
  ];
  if (d.projectName) det.push(["Chantier", d.projectName]);
  let dy = y + 5;
  det.forEach(([k, v]) => {
    doc.setTextColor(110, 110, 110);
    T(k, W / 2 + 10, dy);
    doc.setTextColor(17, 17, 17);
    T(wrap(v, 50)[0], W - M, dy, { align: "right" });
    dy += 4.6;
  });
  if (d.terms) {
    doc.setTextColor(110, 110, 110);
    T("Modalités", W / 2 + 10, dy);
    doc.setTextColor(17, 17, 17);
    wrap(d.terms, 70)
      .slice(0, 4)
      .forEach((w, i) => T(w, W / 2 + 10, dy + 4.3 * (i + 1)));
    dy += 4.3 * (Math.min(4, wrap(d.terms, 70).length) + 1);
  }
  y = Math.max(cy, dy) + 4;
  y = tableHead(y);

  doc.setFontSize(8.5);
  for (const l of d.lines) {
    const one = computeTaxes([{ ...l, tax: "exonere" }], {
      gstStatus: "non_inscrit",
      qstStatus: "non_inscrit",
      rates: { gst: 0, qst: 0 },
    });
    const pr = l.prog;
    const dl = wrap(
      (l.desc || "-") + (pr ? ` (cumul ${num(pr.qty_cum)} / ${num(pr.qty_contract)}${l.unit ? ` ${l.unit}` : ""})` : ""),
      cols[0].w - 3,
    );
    const h = Math.max(1, dl.length) * 3.8 + 2.2;
    if (y + h > H - FOOT - 4) {
      doc.addPage();
      y = tableHead(header(false));
      doc.setFontSize(8.5);
    }
    const cells = [
      null,
      pr ? num(pr.qty_new) : num(l.qty),
      l.unit ?? "",
      pr ? (pr.unit_price == null ? "" : money(Number(pr.unit_price))) : l.price == null ? "" : money(Number(l.price)),
      pr ? (pr.disc_pct ? `${num(pr.disc_pct)} %` : "") : l.disc_pct ? `${num(l.disc_pct)} %` : "",
      treatmentText(l.tax, gstOn, qstOn),
      money(one.subtotal - one.discount),
    ];
    dl.forEach((t, i) => T(t, cx[0] + 1.5, y + 3.2 + i * 3.8));
    cols.forEach((c, i) => {
      if (i === 0) return;
      const v = cells[i] as string;
      const tw = i === 5 ? wrap(v, c.w - 2) : [v];
      tw.forEach((t, j) =>
        T(t, c.a === "right" ? cx[i] + c.w - 1.5 : cx[i] + 1.5, y + 3.2 + j * 3.4, { align: c.a as "left" | "right" }),
      );
    });
    y += h;
    doc.setDrawColor(225, 225, 225);
    doc.setLineWidth(0.2);
    doc.line(M, y - 0.8, W - M, y - 0.8);
  }

  // Totaux : bloc insécable
  const t = d.tax;
  const rows: [string, string, boolean?][] = [];
  rows.push([t.prices_include_tax ? "Sous-total (prix taxes incluses)" : "Sous-total", money(t.subtotal)]);
  if (t.discount) rows.push(["Rabais", `- ${money(t.discount)}`]);
  rows.push(["Montant avant taxes", money(t.pre_tax)]);
  rows.push(["  dont base taxable", money(t.taxable_base)]);
  if (t.zero_rated_base) rows.push(["  dont détaxé (0 %)", money(t.zero_rated_base)]);
  if (t.exempt_base) rows.push(["  dont exonéré", money(t.exempt_base)]);
  rows.push([
    `TPS${pct(t.gst_rate)}${d.seller.gst_number ? ` - n° ${d.seller.gst_number}` : ""}`,
    gstOn ? money(t.gst) : "Non inscrit",
  ]);
  rows.push([
    `TVQ${pct(t.qst_rate)}${d.seller.qst_number ? ` - n° ${d.seller.qst_number}` : ""}`,
    qstOn ? money(t.qst) : "Non inscrit",
  ]);
  rows.push(["TOTAL", money(t.total), true]);
  const need = rows.length * 5.2 + 14;
  if (y + need > H - FOOT - 4) {
    doc.addPage();
    y = header(false) + 2;
  }
  y += 3;
  const bx = W - M - 92;
  rows.forEach(([k, v, strong]) => {
    if (strong) {
      doc.setFillColor(...color);
      doc.rect(bx, y - 3.8, 92, 6.6, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
    } else {
      doc.setTextColor(17, 17, 17);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
    }
    T(k, bx + 2, y);
    T(v, W - M - 2, y, { align: "right" });
    y += strong ? 7 : 5.2;
  });
  doc.setTextColor(90, 90, 90);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const notes = ["Détaxé : taxable au taux de 0 %. Exonéré : non assujetti à la TPS/TVQ."];
  if (t.prices_include_tax)
    notes.push("Prix saisis taxes incluses : chaque taxe est extraite du total et arrondie au cent.");
  notes.forEach((n) => {
    wrap(n, W - 2 * M).forEach((w) => {
      T(w, M, y + 2);
      y += 3.4;
    });
  });

  // FIN-09B1 — Récapitulatif de facturation progressive (depuis l'instantané figé; bloc insécable)
  const pg = d.progress;
  if (pg) {
    const kind =
      pg.kind === "acompte"
        ? "Facture d'acompte (part du prix)"
        : pg.kind === "solde"
          ? "Facture de solde final"
          : "Facture de situation progressive";
    const prevs = (pg.previous ?? []).map((p) => `${p.number} (${money(Number(p.total))})`).join(", ");
    const amds = pg.amendments ?? [];
    const rr: [string, string, string][] = [
      ...(amds.length && pg.initial
        ? ([
            ["Contrat initial (soumission " + (pg.quote_number ?? "") + ")", money(Number(pg.initial.ht)), money(Number(pg.initial.total))],
            ...amds.map(
              (a) => [`Avenant ${a.seq} approuvé : ${a.reason}`.slice(0, 70), "", money(Number(a.delta?.total ?? 0))] as [string, string, string],
            ),
          ] as [string, string, string][])
        : []),
      [
        (amds.length ? `Contrat révisé (v${pg.contract_version ?? amds.length + 1})` : "Contrat (soumission " + (pg.quote_number ?? "") + ")"),
        money(Number(pg.contract.ht)),
        money(Number(pg.contract.total)),
      ],
      ["Déjà facturé avant cette facture", money(Number(pg.prev.ht)), money(Number(pg.prev.total))],
      [`Cumul après cette facture (${num(pg.cum.pct)} %)`, money(Number(pg.cum.ht)), money(Number(pg.cum.total))],
      ["Cette facture", money(Number(pg.new.ht)), money(Number(pg.new.total))],
      pg.basis === "ttc"
        ? ["Reste à facturer (plafond TTC)", "", money(Number(pg.remaining.cap ?? pg.remaining.total))]
        : ["Reste à facturer (plafond HT)", money(Number(pg.remaining.cap ?? pg.remaining.ht)), ""],
    ];
    const g = pg.gap_vs_quote;
    const gapTxt =
      g && [g.ht, g.gst, g.qst, g.total].some((value) => Number(value) !== 0)
        ? `Écart d'arrondi par rapport à l'estimation de la soumission : HT ${money(Number(g.ht))} ; TPS ${money(Number(g.gst))} ; TVQ ${money(Number(g.qst))} ; TTC ${money(Number(g.total))} (taxes calculées sur chaque facture, non ajustées).`
        : "";
    const prevLines = [
      ...(pg.milestone ? wrap(`Jalon facturé : ${pg.milestone.ord}. ${pg.milestone.title}`, W - 2 * M) : []),
      ...(prevs ? wrap(`Factures précédentes : ${prevs}`, W - 2 * M) : []),
      ...(gapTxt ? wrap(gapTxt, W - 2 * M) : []),
    ];
    const need2 = 14 + rr.length * 5 + prevLines.length * 3.6;
    if (y + need2 > H - FOOT - 4) {
      doc.addPage();
      y = header(false) + 2;
    }
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(17, 17, 17);
    T(`RÉCAPITULATIF — ${kind} n° ${pg.seq}`, M, y);
    y += 5;
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    T("Avant taxes", W - M - 40, y, { align: "right" });
    T("Taxes incluses", W - M, y, { align: "right" });
    y += 4.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(17, 17, 17);
    const boldIdx = rr.length - 2;
    rr.forEach(([k, a, b], idx) => {
      if (y > H - FOOT - 8) {
        doc.addPage();
        y = header(false) + 6;
      }
      if (idx === boldIdx) doc.setFont("helvetica", "bold");
      T(k, M, y);
      T(a, W - M - 40, y, { align: "right" });
      T(b, W - M, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += 5;
    });
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 90);
    prevLines.forEach((w) => {
      T(w, M, y);
      y += 3.6;
    });
  }

  // Pied de page, pagination et filigrane sur toutes les pages
  const pages = doc.getNumberOfPages();
  const mark = d.isTest
    ? d.status === "brouillon"
      ? "BROUILLON - TEST"
      : "TEST"
    : d.status === "brouillon"
      ? "BROUILLON"
      : null;
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    if (mark) {
      const G = (doc as unknown as { GState: new (o: object) => unknown }).GState;
      doc.setGState(new G({ opacity: 0.2 }) as never);
      doc.setTextColor(120, 120, 120);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(mark.length > 10 ? 50 : 72);
      T(mark, W / 2, H / 2 + 20, { align: "center", angle: 35 });
      doc.setGState(new G({ opacity: 1 }) as never);
    }
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(M, H - FOOT + 4, W - M, H - FOOT + 4);
    doc.setTextColor(100, 100, 100);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    if (d.template.footer)
      wrap(d.template.footer, W - 2 * M - 30)
        .slice(0, 3)
        .forEach((w, i) => T(w, M, H - FOOT + 8.5 + i * 3.4));
    T(`Page ${p} / ${pages}`, W - M, H - FOOT + 8.5, { align: "right" });
    if (d.number) T(d.number, W - M, H - FOOT + 12, { align: "right" });
  }
  return doc;
}

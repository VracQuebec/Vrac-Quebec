import { describe, it, expect } from "vitest";
import * as C from "@/lib/finances/csvImport";

const sups = [{ id: "s1", name: "Fournisseur Fictif Ltée" }, { id: "s2", name: "Béton Démo" }, { id: "s3", name: "Béton Démo" }];
const build = (csv: string, o: Partial<{ num: C.NumFmt; date: C.DateFmt | null; supplierMap: Record<string, string> }> = {}) => {
  const p = C.parseCsv(csv); return C.buildDocs(p.rows.slice(1), C.autoMap(p.rows[0]), { num: "fr", date: null, supplierMap: {}, sups, ...o });
};

describe("FIN-12E import CSV", () => {
  it("lit l'exemple français (BOM, accents, décimales, zéro initial) et regroupe la facture multiligne", () => {
    const d = build("\uFEFF" + C.EXAMPLE);
    expect(d).toHaveLength(2);
    const f = d.find((x) => x.kind === "facture")!;
    expect(f.reference).toBe("000123"); expect(f.p.lines).toHaveLength(2); expect(f.p.total).toBe(408.16); expect(f.errors).toEqual([]);
    const nc = d.find((x) => x.kind === "credit")!; expect(nc.p.due_date).toBeNull(); expect(nc.errors).toEqual([]);
  });
  it("taxes et échéance absentes restent inconnues", () => {
    const [d] = build("type;fournisseur;numero;date;total\nfacture;Fournisseur Fictif Ltée;7;2026-09-01;100,00\n");
    expect(d.p.gst).toBeNull(); expect(d.p.qst).toBeNull(); expect(d.p.due_date).toBeNull(); expect(d.errors).toEqual([]);
  });
  it("refuse date ambiguë, devise étrangère, montant incohérent, relevé et paiement", () => {
    expect(build("fournisseur;numero;date;total\nFournisseur Fictif Ltée;1;03/04/2026;10,00\n")[0].errors.join()).toMatch(/ambiguë/);
    expect(build("fournisseur;numero;date;total\nFournisseur Fictif Ltée;1;03/04/2026;10,00\n", { date: "dmy" })[0].p.doc_date).toBe("2026-04-03");
    expect(build("fournisseur;numero;date;devise;total\nFournisseur Fictif Ltée;1;2026-01-01;USD;10,00\n")[0].errors.join()).toMatch(/USD/);
    expect(build("fournisseur;numero;date;sous_total;tps;tvq;total\nFournisseur Fictif Ltée;1;2026-01-01;100;5;9,98;120\n")[0].errors.join()).toMatch(/incohérent/);
    expect(build("type;fournisseur;numero;date;total\nrelevé;Fournisseur Fictif Ltée;R1;2026-01-01;10\n")[0].errors.join()).toMatch(/Relevé/);
    expect(build("fournisseur;numero;date;total;solde\nFournisseur Fictif Ltée;1;2026-01-01;100;40\n")[0].errors.join()).toMatch(/historique de paiement/);
  });
  it("même numéro chez deux fournisseurs = deux documents ; fournisseur ambigu à résoudre", () => {
    const d = build("fournisseur;numero;date;total\nFournisseur Fictif Ltée;9;2026-01-01;10\nBéton Démo;9;2026-01-01;10\n");
    expect(d).toHaveLength(2); expect(d[1].errors.join()).toMatch(/ambigu/);
    expect(build("fournisseur;numero;date;total\nBéton Démo;9;2026-01-01;10\n", { supplierMap: { [C.norm("Béton Démo")]: "s3" } })[0].supplierId).toBe("s3");
  });
  it("nombres : formats et ambiguïté signalée", () => {
    expect(C.parseNum("1 234,56", "fr")).toBe(1234.56); expect(C.parseNum("1,234.56", "en")).toBe(1234.56);
    expect(C.numAmbiguous("1,234")).toBe(true); expect(C.parseCsv('a,b\n"x, y",2\n').rows[1][0]).toBe("x, y");
  });
});

describe("FIN-12E1 valeurs sources transmises au serveur", () => {
  it("conserve la date source, le format choisi, payé et solde dans la charge envoyée", () => {
    const [d] = build("fournisseur;numero;date;total;paye;solde\nFournisseur Fictif Ltée;1;03/04/2026;10,00;0;10,00\n", { date: "dmy" });
    const pl = C.docPayload(d, { kind: "distinct" });
    expect(pl.src).toEqual({ type: "", doc_date: "03/04/2026", due_date: "", date_fmt: "dmy" });
    expect(pl.p.doc_date).toBe("2026-04-03"); expect(pl.p.paid).toBe(0); expect(pl.p.balance).toBe(10); expect(pl.resolution).toEqual({ kind: "distinct" });
  });
});

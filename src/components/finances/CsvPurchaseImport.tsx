// FIN-12E — Import CSV des factures et notes de crédit fournisseurs : brouillons seulement.
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import * as C from "@/lib/finances/csvImport";
import { sha256 } from "@/lib/finances/purchases";
import { fmtMoney } from "@/lib/finances/period";

const sel = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";
type Saved = { fileName: string; text: string; map: C.Field[]; num: C.NumFmt | null; date: C.DateFmt | null; supplierMap: Record<string, string>; picked: string[]; reqKey: string | null; reqSig: string | null };
const money = (n: number | null) => (n == null ? "inconnu" : fmtMoney(n));
const download = (name: string, text: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" })); a.download = name; a.click(); };
const OUT: Record<string, string> = { nouveau: "Nouveau", deja_present: "Déjà présent", conflit: "Conflit à examiner", refuse: "Refusé", cree: "Brouillon créé" };

export default function CsvPurchaseImport({ companyId, sups, onOpenBill, onOpenCredit, onClose }: { companyId: string; sups: C.Sup[] | null; onOpenBill: (id: string) => void; onOpenCredit: (id: string) => void; onClose: () => void }) {
  const store = `fin12e.${companyId}`;
  const [s, setS] = useState<Saved | null>(() => { try { return JSON.parse(sessionStorage.getItem(store) ?? "null"); } catch { return null; } });
  const [checks, setChecks] = useState<Record<string, C.Check> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<C.Result | null>(null);
  const company = useRef(companyId);
  useEffect(() => { company.current = companyId; }, [companyId]);
  useEffect(() => { if (s) sessionStorage.setItem(store, JSON.stringify(s)); else sessionStorage.removeItem(store); }, [s, store]);
  const up = (p: Partial<Saved>) => setS((x) => (x ? { ...x, ...p } : x));

  const parsed = useMemo(() => (s ? C.parseCsv(s.text) : null), [s?.text]);
  const headers = parsed?.rows[0] ?? []; const body = useMemo(() => parsed?.rows.slice(1) ?? [], [parsed]);
  const colVals = (f: C.Field) => { const i = s?.map.indexOf(f) ?? -1; return i < 0 ? [] : body.map((r) => r[i] ?? ""); };
  const numCols = (["subtotal", "gst", "qst", "total", "line_amount", "unit_price", "quantity", "paid", "balance"] as C.Field[]).flatMap(colVals);
  const hint = C.numHint(numCols); const numAmb = !hint && numCols.some(C.numAmbiguous);
  const needDate = C.hasSlashDates([...colVals("doc_date"), ...colVals("due_date")]);
  const num: C.NumFmt | null = s?.num ?? (numAmb ? null : hint ?? "fr");
  const docs = useMemo(() => (s && num && sups ? C.buildDocs(body, s.map, { num, date: s.date, supplierMap: s.supplierMap, sups }) : []), [s, num, sups, body]);
  const ready = (d: C.Doc) => !d.errors.length && checks?.[d.key]?.outcome === "nouveau";
  const unknownSups = [...new Map(docs.filter((d) => d.supplierName && !d.supplierId).map((d) => [C.norm(d.supplierName), d])).values()];

  async function onFile(f: File) {
    if (f.size > 2_000_000) { toast({ title: "Fichier trop volumineux (2 Mo max)", variant: "destructive" }); return; }
    const text = await f.text(); const p = C.parseCsv(text);
    if (p.rows.length < 2) { toast({ title: "CSV vide ou sans données", variant: "destructive" }); return; }
    setChecks(null); setResult(null); setError(null);
    setS({ fileName: f.name, text, map: C.autoMap(p.rows[0]), num: null, date: null, supplierMap: {}, picked: [], reqKey: null, reqSig: null });
  }
  async function runCheck() {
    setBusy(true); setError(null); const my = companyId;
    try {
      const valid = docs.filter((d) => !d.errors.length);
      const r = valid.length ? await C.check(companyId, valid) : [];
      if (company.current !== my) return;
      const m = Object.fromEntries(r.map((x) => [x.key, x])); setChecks(m);
      up({ picked: (s?.picked ?? []).filter((k) => m[k]?.outcome === "nouveau") });
    } catch (e: any) { if (company.current === my) setError(`Vérification impossible : ${e.message}. Vos choix sont conservés ; réessayez.`); }
    finally { setBusy(false); }
  }
  async function runImport() {
    if (!s) return; const chosen = docs.filter((d) => s.picked.includes(d.key) && ready(d)); if (!chosen.length) return;
    const sig = chosen.map((d) => d.key + d.hash).sort().join("|");
    const reqKey = s.reqSig === sig && s.reqKey ? s.reqKey : crypto.randomUUID(); up({ reqKey, reqSig: sig });
    setBusy(true); setError(null); const my = companyId;
    try {
      const sha = await sha256(new Blob([s.text]));
      const r = await C.commit(companyId, reqKey, s.fileName, sha, { num, date: s.date, map: s.map }, chosen);
      if (company.current !== my) return;
      setResult(r); up({ picked: [], reqKey: null, reqSig: null }); setChecks(null);
    } catch (e: any) { if (company.current === my) setError(`Import non confirmé : ${e.message}. Rien n'est perdu ; « Importer » réutilise la même demande sans créer de doublon.`); }
    finally { setBusy(false); }
  }
  const report = () => download("rapport-import.csv", "lignes;type;fournisseur;numero;statut;motif\n" + docs.map((d) => {
    const c = checks?.[d.key]; const rr = result?.docs.find((x) => x.key === d.key);
    const st = rr ? OUT[rr.outcome] : d.errors.length ? "Refusé" : c ? OUT[c.outcome] : "Non vérifié";
    const why = rr?.reason ?? (d.errors.join(" / ") || c?.problem || "");
    return [d.rows.join(" "), d.kind, d.supplierName, d.reference, st, why].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";");
  }).join("\n"));

  return <section className="space-y-4 rounded-md border p-3" data-testid="fin12e">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-display text-base font-semibold">Importer un CSV d'achats</h3>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => download("modele-achats.csv", C.TEMPLATE)}>Modèle CSV</Button>
        <Button size="sm" variant="outline" onClick={() => download("exemple-achats-fictif.csv", C.EXAMPLE)}>Exemple fictif</Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Fermer</Button>
      </div>
    </div>
    <p className="text-xs text-muted-foreground">Factures et notes de crédit fournisseurs, CAD seulement. L'aperçu ne crée rien ; l'import crée uniquement des brouillons à confirmer ensuite. Les colonnes « payé » ou « solde » ne créent jamais de règlement. Relevés refusés.</p>
    <label className="block text-sm"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Fichier CSV (2 Mo max, 500 documents max)</span>
      <input aria-label="Fichier CSV" type="file" accept=".csv,text/csv,text/plain" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="block w-full text-sm" /></label>
    {s && <p className="text-xs">Fichier : <strong>{s.fileName}</strong> · {body.length} ligne(s) · séparateur « {parsed?.delim === "\t" ? "tabulation" : parsed?.delim} » <Button size="sm" variant="link" className="h-auto p-0" onClick={() => { setS(null); setChecks(null); setResult(null); }}>Retirer</Button></p>}

    {s && !result && <>
      <details open className="rounded-md border p-2"><summary className="cursor-pointer text-sm font-semibold">Correspondance des colonnes</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">{headers.map((h, i) => <label key={i} className="block text-xs"><span className="mb-1 block truncate font-mono">{h || `(colonne ${i + 1})`}</span>
          <select aria-label={`Colonne ${h}`} className={sel} value={s.map[i] ?? ""} onChange={(e) => { const m = [...s.map]; m[i] = e.target.value as C.Field; up({ map: m }); setChecks(null); }}>{C.FIELDS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}</select></label>)}</div>
      </details>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Format des nombres {numAmb && !s.num && <span className="text-destructive">— à choisir (ambigu)</span>}</span>
          <select aria-label="Format des nombres" className={sel} value={s.num ?? ""} onChange={(e) => { up({ num: (e.target.value || null) as C.NumFmt | null }); setChecks(null); }}>
            <option value="">{numAmb ? "— Choisir —" : `Détecté : ${num === "en" ? "anglais 1,234.56" : "français 1 234,56"}`}</option><option value="fr">Français : 1 234,56</option><option value="en">Anglais : 1,234.56</option></select></label>
        <label className="block text-sm"><span className="mb-1 block text-xs font-semibold text-muted-foreground">Format des dates {needDate && !s.date && <span className="text-destructive">— à choisir</span>}</span>
          <select aria-label="Format des dates" className={sel} value={s.date ?? ""} onChange={(e) => { up({ date: (e.target.value || null) as C.DateFmt | null }); setChecks(null); }}>
            <option value="">{needDate ? "— Choisir —" : "AAAA-MM-JJ seulement"}</option><option value="dmy">JJ/MM/AAAA</option><option value="mdy">MM/JJ/AAAA</option></select></label>
      </div>
      {unknownSups.length > 0 && <div className="space-y-2 rounded-md border border-amber-500/40 p-2"><p className="text-sm font-semibold">Fournisseurs à associer (aucune fiche créée automatiquement)</p>
        {unknownSups.map((d) => <label key={d.supplierName} className="block text-sm"><span className="mb-1 block text-xs">« {d.supplierName} » {d.supplierChoices.length > 1 ? "— plusieurs fiches portent ce nom" : "— aucune fiche exacte"}</span>
          <select aria-label={`Associer ${d.supplierName}`} className={sel} value={s.supplierMap[C.norm(d.supplierName)] ?? ""} onChange={(e) => { up({ supplierMap: { ...s.supplierMap, [C.norm(d.supplierName)]: e.target.value } }); setChecks(null); }}>
            <option value="">— Choisir une fiche existante —</option>{(sups ?? []).filter((x) => !x.archived).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>)}
        <p className="text-[11px] text-muted-foreground">Fournisseur absent ? Créez sa fiche dans « Factures et crédits », puis revenez : vos choix sont conservés.</p></div>}

      {!num ? <p role="alert" className="text-sm text-destructive">Choisissez le format des nombres pour afficher l'aperçu.</p> : <>
        <div className="flex flex-wrap gap-2"><Button size="sm" onClick={runCheck} disabled={busy || !docs.length}>{busy ? "…" : "Vérifier l'aperçu"}</Button>
          <Button size="sm" variant="outline" onClick={report} disabled={!docs.length}>Rapport CSV</Button></div>
        {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm">{error}</p>}
        <ul className="space-y-2" aria-label="Aperçu des documents">{docs.map((d) => { const c = checks?.[d.key]; const st = d.errors.length ? "refuse" : c?.outcome; const ok = ready(d);
          return <li key={d.key} className="rounded-md border p-2 text-sm" data-testid="csv-doc">
            <label className="flex items-start gap-2"><input type="checkbox" aria-label={`Importer ${d.reference}`} disabled={!ok} checked={ok && s.picked.includes(d.key)}
              onChange={(e) => up({ picked: e.target.checked ? [...s.picked, d.key] : s.picked.filter((k) => k !== d.key) })} className="mt-1" />
              <span className="min-w-0 flex-1"><strong>{d.kind === "credit" ? "Note de crédit" : d.kind === "facture" ? "Facture" : d.kind === "releve" ? "Relevé" : "Inconnu"} {d.reference || "—"}</strong> · {d.supplierName || "fournisseur ?"} · lignes {d.rows.join(", ")}
                <span className="block text-xs text-muted-foreground">Date {d.p.doc_date ?? "?"} · échéance {d.p.due_date ?? "inconnue"} · sous-total {money(d.p.subtotal)} · TPS {money(d.p.gst)} · TVQ {money(d.p.qst)} · total {money(d.p.total)} · {d.p.lines.length} ligne(s) regroupée(s)</span>
                {d.p.lines.length > 1 && <span className="block text-xs">{d.p.lines.map((l, i) => <span key={i} className="block">• {l.description || "—"} {l.quantity ?? ""} {l.unit} {l.amount != null ? `= ${fmtMoney(l.amount)}` : ""}</span>)}</span>}
                <span className={`mt-1 block text-xs font-semibold ${st === "refuse" || st === "conflit" ? "text-destructive" : ""}`} data-testid="csv-status">{st ? OUT[st] : "Non vérifié"}{c?.existing && ` (existant ${money(c.existing.total)}, ${c.existing.status === "draft" ? "brouillon" : c.existing.status === "confirmed" ? "confirmé" : c.existing.status})`}</span>
                {[...d.errors, ...(c?.problem ? [c.problem] : [])].map((e) => <span key={e} className="block text-xs text-destructive">{e}</span>)}
              </span></label></li>; })}</ul>
        {checks && <Button onClick={runImport} disabled={busy || !s.picked.length} data-testid="csv-import">{busy ? "Import…" : `Importer ${s.picked.length} document(s) en brouillon`}</Button>}
      </>}
    </>}

    {result && <div className="space-y-2 rounded-md border p-3" data-testid="csv-result">
      <p className="text-sm font-semibold">Bilan{result.replay ? " (demande déjà traitée, aucun nouveau document)" : ""} : {result.counts.cree} créé(s) · {result.counts.deja_present} déjà présent(s) · {result.counts.conflit} conflit(s) · {result.counts.refuse} refusé(s)</p>
      <ul className="space-y-1 text-sm">{result.docs.map((r) => { const d = docs.find((x) => x.key === r.key); const id = r.bill_id ?? r.credit_id;
        return <li key={r.key}>{OUT[r.outcome] ?? r.outcome} — {d?.reference ?? r.key} {r.reason && <span className="text-xs text-muted-foreground">({r.reason})</span>} {id && <Button size="sm" variant="link" className="h-auto p-0" onClick={() => (r.bill_id ? onOpenBill(r.bill_id) : onOpenCredit(r.credit_id!))}>Ouvrir le brouillon</Button>}</li>; })}</ul>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={report}>Rapport CSV des autres éléments</Button><Button size="sm" variant="outline" onClick={() => { setResult(null); runCheck(); }}>Revenir à l'aperçu</Button></div>
    </div>}
  </section>;
}

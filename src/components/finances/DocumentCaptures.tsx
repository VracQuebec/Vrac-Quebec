// FIN-12C — Reçus et documents : photo / import → lecture explicite (suggestions) → vérification → brouillon FIN-12A/12A1 ou pièce jointe.
// Aucune action ici ne touche À payer, les règlements ou les engagements.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import * as C from "@/lib/finances/captures";
import * as P from "@/lib/finances/purchases";
import { fmtMoney } from "@/lib/finances/period";

type Sup = { id: string; name: string; archived: boolean };
const sel = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";
const L = ({ l, warn, children, className = "" }: { l: string; warn?: string | null; children: React.ReactNode; className?: string }) =>
  <label className={`block text-sm ${className}`}><span className="mb-1 block text-xs font-semibold text-muted-foreground">{l}{warn && <span className="ml-1 rounded bg-amber-500/15 px-1 text-[11px] font-medium text-amber-800">{warn}</span>}</span>{children}</label>;

export default function DocumentCaptures({ companyId, sups, canWrite, onOpenBill, onOpenCredit }: { companyId: string; sups: Sup[] | null; canWrite: boolean; onOpenBill: (id: string) => void; onOpenCredit: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return open ? <CaptureReview key={open} companyId={companyId} id={open} sups={sups ?? []} canWrite={canWrite} onBack={() => setOpen(null)} onSwitch={setOpen} onOpenBill={onOpenBill} onOpenCredit={onOpenCredit} />
    : <CaptureList companyId={companyId} canWrite={canWrite} onOpen={setOpen} />;
}

function CaptureList({ companyId, canWrite, onOpen }: { companyId: string; canWrite: boolean; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof C.list>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<Awaited<ReturnType<typeof P.companyFiles>>>([]);
  const seq = useRef(0);
  const load = useCallback(() => { const my = ++seq.current; setErr(null);
    C.list(companyId).then((r) => { if (my === seq.current) setRows(r); }).catch((e) => { if (my === seq.current) setErr(e.message); });
    P.companyFiles(companyId).then((f) => { if (my === seq.current) setFiles(f); }).catch(() => {}); }, [companyId]);
  useEffect(() => { setRows(null); load(); }, [load]);
  const add = async (file?: File | null) => { if (!file) return; setBusy(true);
    try { const r = await C.addFile(companyId, file); toast({ title: "Document ajouté", description: "Lancez la lecture ou saisissez manuellement." }); onOpen(r.id); }
    catch (e: any) { toast({ title: "Document non ajouté", description: e.message, variant: "destructive" }); } finally { setBusy(false); } };
  const reuse = async (fid: string) => { if (!fid) return; setBusy(true);
    try { const r = await C.register(companyId, fid); if (r.replay) toast({ title: "Pièce déjà présente dans Reçus et documents (reprise)" }); onOpen(r.id); }
    catch (e: any) { toast({ title: "Pièce refusée", description: e.message, variant: "destructive" }); } finally { setBusy(false); } };
  return <section className="space-y-3" data-testid="fin12c">
    <p className="text-xs text-muted-foreground">Ajoutez une photo ou un PDF, lancez la lecture, vérifiez les propositions puis créez un brouillon ou joignez la pièce à une facture existante. Rien n'est compté dans « À payer » avant la confirmation habituelle de la facture.</p>
    {canWrite && <div className="grid gap-2 sm:grid-cols-3">
      <label className="flex h-11 cursor-pointer items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">Photographier un reçu
        <input aria-label="Photographier un reçu" type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={(e) => add(e.target.files?.[0])} /></label>
      <label className="flex h-11 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-semibold">Importer une image ou un PDF
        <input aria-label="Importer une image ou un PDF" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" className="sr-only" disabled={busy} onChange={(e) => add(e.target.files?.[0])} /></label>
      <select aria-label="Réutiliser une pièce existante" className={sel} value="" disabled={busy} onChange={(e) => reuse(e.target.value)}><option value="">Réutiliser une pièce déjà présente…</option>{files.map((f) => <option key={f.id} value={f.id}>{f.file_name}</option>)}</select>
    </div>}
    <p className="text-[11px] text-muted-foreground">{C.LIMITS}</p>
    {busy && <p className="text-sm text-muted-foreground">Envoi en cours…</p>}
    {err ? <p role="alert" className="text-sm text-destructive">Impossible de charger les documents : {err}</p> : !rows ? <p className="text-sm text-muted-foreground">Chargement…</p> :
      <ul className="divide-y rounded-md border">{rows.map((r) => <li key={r.id}><button className="flex w-full flex-wrap justify-between gap-2 p-3 text-left text-sm hover:bg-muted/40" onClick={() => onOpen(r.id)}>
        <span><strong>{r.file?.file_name ?? "pièce"}</strong><br /><span className="text-xs text-muted-foreground">Ajouté {P.fmtStamp(r.created_at)}</span></span>
        <span className="text-xs">{C.STATUS[r.status]}{r.results.length ? ` · ${r.results.map((x) => x.kind === "bill" ? "brouillon créé" : x.kind === "credit" ? "note de crédit créée" : "document lié").join(", ")}` : ""}</span></button></li>)}
        {!rows.length && <li className="p-3 text-sm text-muted-foreground">Aucun document.</li>}</ul>}
  </section>;
}

function CaptureReview({ companyId, id, sups, canWrite, onBack, onSwitch, onOpenBill, onOpenCredit }: { companyId: string; id: string; sups: Sup[]; canWrite: boolean; onBack: () => void; onSwitch: (id: string) => void; onOpenBill: (id: string) => void; onOpenCredit: (id: string) => void }) {
  const lk = `vq.fin12c.edits.${companyId}.${id}`;
  const [c, setC] = useState<C.Capture | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [e, setE] = useState<C.Edits | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [opErr, setOpErr] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [showSrc, setShowSrc] = useState(false);
  const [convUrl, setConvUrl] = useState<string | null>(null);
  const [dups, setDups] = useState<P.Dups | null>(null);
  const [dupReason, setDupReason] = useState("");
  const [bills, setBills] = useState<P.BillRow[]>([]);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [evs, setEvs] = useState<Awaited<ReturnType<typeof C.events>>>([]);
  const alive = useRef(true); useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async (resetEdits = false) => {
    try { const x = await C.detail(id); if (!alive.current) return; setC(x); setEvs(await C.events(id));
      const stored = (() => { try { return JSON.parse(localStorage.getItem(lk) || "null"); } catch { return null; } })();
      setE((cur) => { if (cur && !resetEdits) return cur; if (stored && !resetEdits) { setDirty(true); return stored; }
        if (x.edits) return x.edits;
        const d = x.extraction?.documents?.[0] ?? null; return C.editsFrom(d, 0, C.matchSupplier(d?.supplier_name ?? null, sups).exact ?? ""); });
    } catch (er: any) { if (alive.current) setLoadErr(er.message); }
  }, [id, lk, sups]);
  useEffect(() => { void load(); C.detail(id).then((x) => P.openFile(x.file_id)).then((u) => { if (alive.current) setUrl(u); }).catch(() => {}); }, [load, id]);
  useEffect(() => { const v = c?.converted_file_id; if (!v) { setConvUrl(null); return; } P.openFile(v).then((u) => { if (alive.current) setConvUrl(u); }).catch(() => setConvUrl(null)); }, [c?.converted_file_id]);
  useEffect(() => { if (!dirty || !e) return; try { localStorage.setItem(lk, JSON.stringify(e)); } catch { /* indisponible */ } }, [e, dirty, lk]);
  useEffect(() => { if (!e?.supplier_id) { setBills([]); return; } P.overview(companyId, { supplier_id: e.supplier_id, status: "active" }, 100, 0).then((d) => { if (alive.current) setBills(d.rows); }).catch(() => setBills([])); }, [companyId, e?.supplier_id]);
  useEffect(() => { if (!e || e.kind !== "bill" || !e.supplier_id) { setDups(null); return; }
    const t = setTimeout(() => P.dups(companyId, null, { ...C.toBillForm(e), file_id: c?.file_id ?? "", file_sha256: c?.file_sha256 ?? "" }).then((d) => { if (!alive.current) return; const own = new Set((c?.results ?? []).map((r) => r.id)); setDups({ exact: d.exact.filter((x) => !own.has(x.id)), probable: d.probable.filter((x) => !own.has(x.id)) }); }).catch(() => {}), 400); return () => clearTimeout(t); },
    [companyId, e, c?.file_id, c?.file_sha256, c?.results]);

  if (loadErr) return <section className="space-y-2"><p role="alert" className="text-sm text-destructive">{loadErr}</p><Button size="sm" variant="outline" onClick={onBack}>Retour</Button></section>;
  if (!c || !e) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  const docs = c.extraction?.documents ?? [];
  const doc = docs[e.index] ?? null;
  const multi = docs.length > 1;
  const editable = canWrite && c.can_write && c.status !== "ecarte";
  const up = <K extends keyof C.Edits>(k: K, v: C.Edits[K]) => { setDirty(true); setE((x) => ({ ...(x as C.Edits), [k]: v })); };
  const unc = (k: string) => doc?.uncertain?.includes(k) ? "incertain" : null;
  const miss = (v: string) => (v.trim() === "" ? "À compléter" : null);
  const match = C.matchSupplier(doc?.supplier_name ?? null, sups);
  const warns = C.warnings(doc, e);
  const isReleve = doc?.doc_type === "releve";
  const isRecu = doc?.doc_type === "recu";
  const exact = (dups?.exact.length ?? 0) > 0;
  const already = c.results.find((r) => r.index === (multi ? e.index : null) || (!multi && (r.kind === "bill" || r.kind === "credit")));
  const run = async (tag: string, fn: () => Promise<void>) => { setBusy(tag); setOpErr(null); try { await fn(); } catch (er: any) { if (alive.current) setOpErr(er.message); } finally { if (alive.current) setBusy(null); } };
  const read = (force: boolean) => run("read", async () => {
    if (force && c.extraction && !window.confirm("Relancer la lecture consommera une nouvelle lecture. Vos corrections ne seront pas remplacées sans votre accord. Continuer ?")) return;
    setC({ ...c, status: "lecture" });
    try { const r = await C.extract(id, force); toast({ title: r.status === "cached" ? "Lecture déjà disponible (réutilisée)" : "Lecture terminée", description: "Vérifiez chaque proposition." }); }
    finally { await load(); }
  });
  const convertRead = () => run("read", async () => {
    if (!c.converted_file_id) { setBusy("convert"); await C.convertHeic(companyId, id, c.file_id, c.file.name); await load(); }
    setBusy("read"); setC((x) => (x ? { ...x, status: "lecture" } : x));
    try { await C.extract(id, false); toast({ title: "Photo convertie et lue", description: "Vérifiez chaque proposition." }); } finally { await load(); }
  });
  const pickOther = async (f?: File | null) => { if (!f) return; await run("add", async () => { const r = await C.addFile(companyId, f); toast({ title: "Nouvelle photo ajoutée", description: "L'ancienne pièce est conservée." }); onSwitch(r.id); }); };
  const manual = () => document.querySelector<HTMLInputElement>('[aria-label="Référence"]')?.focus();
  const applySuggestion = () => { const d = docs[e.index] ?? null; setDirty(true); setE({ ...C.editsFrom(d, e.index, e.supplier_id || (match.exact ?? "")), kind: e.kind, employee_paid: e.employee_paid }); };
  const saveEdits = () => run("save", async () => { const r = await C.saveEdits(id, e, c.rev); try { localStorage.removeItem(lk); } catch { /* */ } setDirty(false); setC({ ...c, rev: r.rev, edits: e }); toast({ title: "Corrections enregistrées" }); });
  const createDraft = () => run("create", async () => {
    const p = e.kind === "credit" ? P.creditPayload(C.toCreditForm(e)) : P.toPayload(C.toBillForm(e));
    const r = await C.create(id, e.kind, multi ? e.index : null, p as Record<string, unknown>, exact ? dupReason : null);
    try { localStorage.removeItem(lk); } catch { /* */ } setDirty(false);
    toast({ title: r.replay ? "Brouillon déjà créé pour ce document (repris)" : e.kind === "credit" ? "Brouillon de note de crédit créé" : "Brouillon de facture créé", description: "Aucune dette tant que le document n'est pas confirmé." });
    await load();
  });
  const doAttach = () => run("attach", async () => { const r = await C.attach(id, target); toast({ title: r.replay ? "Déjà joint (repris)" : "Pièce jointe à la facture", description: "Aucun montant ni solde modifié." }); setTarget(""); await load(); });

  // FIN-12C1 : lien temporaire privé renouvelé à chaque ouverture; aucun fichier rendu public.
  const openOriginal = async (download = false) => { const w = download ? null : window.open("", "_blank");
    try { const u = await P.openFile(c.file_id); if (!alive.current) return; setUrl(u);
      if (download) { const a = document.createElement("a"); a.href = u + (u.includes("?") ? "&" : "?") + "download=" + encodeURIComponent(c.file.name); a.rel = "noopener"; a.click(); }
      else if (w) { w.opener = null; w.location.href = u; } else window.location.assign(u); }
    catch (er: any) { w?.close(); toast({ title: "Pièce inaccessible", description: er.message, variant: "destructive" }); } };
  const isHeic = c.file.mime === "image/heic";
  const Source = () => <div className="rounded-md border bg-muted/30 p-2" data-testid="cap-source">
    <div className="flex flex-wrap gap-1"><Button size="sm" variant="link" onClick={() => openOriginal(false)}>Ouvrir l'original</Button><Button size="sm" variant="link" onClick={() => openOriginal(true)}>Télécharger l'original</Button></div>
    {!url ? <p className="text-xs text-muted-foreground">Aperçu en préparation… Vous pouvez ouvrir l'original ci-dessous.</p>
      : isHeic ? (convUrl ? <img src={convUrl} alt={`Pièce ${c.file.name} (version convertie)`} className="max-h-[70vh] w-full object-contain" /> : <p className="text-xs">Photo HEIC : aperçu disponible après conversion. L'original peut être téléchargé.</p>)
      : c.file.mime.startsWith("image/") ? <img src={url} alt={`Pièce ${c.file.name}`} className="max-h-[70vh] w-full object-contain" />
      : c.file.mime === "application/pdf" ? <object data={url} type="application/pdf" aria-label="Pièce PDF" className="h-[40vh] w-full rounded bg-background lg:h-[70vh]">
          <div role="status" className="space-y-1 p-3 text-sm" data-testid="pdf-fallback"><p className="font-semibold">Aperçu PDF intégré non pris en charge par ce navigateur.</p>
            <p className="text-xs text-muted-foreground">La pièce est intacte et privée. Ouvrez-la dans un nouvel onglet ou téléchargez-la; votre saisie reste en place.</p></div></object>
      : <p className="text-xs">Aperçu non disponible pour ce format.</p>}
  </div>;

  return <section className="space-y-3 rounded-md border p-3" data-testid="capture-review">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display font-semibold">{c.file.name} — <span data-testid="cap-status">{C.STATUS[c.status]}</span></h3><Button size="sm" variant="outline" onClick={onBack}>Retour aux documents</Button></div>
    <p className="text-xs text-muted-foreground">Ajouté {P.fmtStamp(c.created_at)} (heure serveur, Toronto) · {(c.file.size / 1024).toFixed(0)} Ko · {c.file.mime}{c.extracted_at ? ` · lu ${P.fmtStamp(c.extracted_at)} (${c.extract_count} lecture(s))` : ""}</p>
    {c.same_file.length > 0 && <p role="status" className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-sm">Même fichier déjà traité ailleurs ({c.same_file.length}) : {c.same_file.map((s) => s.results.map((r) => <Button key={r.key} size="sm" variant="link" onClick={() => (r.kind === "credit" ? onOpenCredit(r.id) : onOpenBill(r.id))}>ouvrir le document existant</Button>))}</p>}
    {c.results.length > 0 && <div role="status" className="rounded border border-primary/40 bg-primary/5 p-2 text-sm">{c.results.map((r) => <p key={r.key}>{r.kind === "bill" ? "Brouillon de facture créé" : r.kind === "credit" ? "Brouillon de note de crédit créé" : "Document lié à une facture"} · {P.fmtStamp(r.at)}
      <Button size="sm" variant="link" onClick={() => (r.kind === "credit" ? onOpenCredit(r.id) : onOpenBill(r.id))}>Ouvrir</Button></p>)}</div>}
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="hidden lg:block"><Source /></div>
      <div className="space-y-3">
        <Button size="sm" variant="outline" className="w-full lg:hidden" onClick={() => setShowSrc((v) => !v)}>{showSrc ? "Masquer la pièce" : "Voir la pièce"}</Button>
        {showSrc && <div className="lg:hidden"><Source /></div>}
        {editable && <div className="flex flex-wrap gap-2">
          {!c.extraction && isHeic && <Button size="sm" onClick={convertRead} disabled={!!busy || c.status === "lecture"}>{c.status === "echec" ? "Réessayer" : c.converted_file_id ? "Lire la photo convertie" : "Convertir et lire"}</Button>}
          {!c.extraction && !isHeic && <Button size="sm" onClick={() => read(false)} disabled={!!busy || c.status === "lecture"}>{c.status === "echec" ? "Réessayer la lecture" : "Lire le document"}</Button>}
          {c.extraction && <Button size="sm" variant="outline" onClick={() => read(true)} disabled={!!busy || c.status === "lecture"}>Relancer la lecture</Button>}
          {c.extraction && <Button size="sm" variant="outline" onClick={applySuggestion} disabled={!!busy}>Appliquer les suggestions de lecture</Button>}
        </div>}
        {busy === "convert" && <p role="status" className="text-sm">Conversion de la photo HEIC en cours…</p>}
        {isHeic && editable && !c.extraction && (opErr || c.status === "echec") && <div role="alert" className="space-y-2 rounded border border-destructive/40 bg-destructive/10 p-2 text-sm" data-testid="heic-fail">
          <p>La photo HEIC n'a pas pu être {c.converted_file_id ? "lue" : "convertie"}. La pièce et vos corrections sont conservées.</p>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={convertRead} disabled={!!busy}>Réessayer</Button>
            <label className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm">Choisir une autre photo<input aria-label="Choisir une autre photo" type="file" accept="image/*,.heic" className="sr-only" onChange={(ev) => pickOther(ev.target.files?.[0])} /></label>
            <Button size="sm" variant="outline" onClick={manual}>Saisir manuellement</Button></div></div>}
        {(busy === "read" || c.status === "lecture") && <p role="status" className="text-sm">Lecture en cours…</p>}
        {c.status === "echec" && c.extract_error && <p role="alert" className="rounded border border-destructive/40 bg-destructive/10 p-2 text-sm">Lecture échouée : {c.extract_error} La pièce est conservée; la saisie manuelle reste possible.</p>}
        {!c.extraction && c.status !== "echec" && <p className="text-xs text-muted-foreground">Aucune lecture lancée : les champs sont à saisir manuellement, ou lancez la lecture.</p>}
        {c.extraction && <p className="text-xs text-muted-foreground">Propositions de lecture automatique : à vérifier. Les champs vides sont « À compléter »; aucune échéance ni taxe n'est déduite.</p>}
        {multi && <div role="status" className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-sm"><p>{docs.length} documents distincts détectés dans ce fichier. Choisissez celui à traiter (un brouillon par document) :</p>
          <select aria-label="Document détecté" className={sel} value={e.index} onChange={(ev) => { const i = Number(ev.target.value); const d = docs[i] ?? null; setDirty(true); setE(C.editsFrom(d, i, C.matchSupplier(d?.supplier_name ?? null, sups).exact ?? "")); }}>
            {docs.map((d, i) => <option key={i} value={i}>{i + 1}. {C.TYPE_LABEL[d.doc_type]} · {d.reference ?? "sans référence"}{d.pages ? ` · p. ${d.pages}` : ""}{c.results.some((r) => r.index === i) ? " (déjà traité)" : ""}</option>)}</select></div>}
        {doc && <p className="text-sm">Type lu : <strong>{C.TYPE_LABEL[doc.doc_type]}</strong>{doc.supplier_name ? <> · fournisseur lu : <strong>{doc.supplier_name}</strong></> : " · fournisseur : À compléter"}{doc.paid_mention && <span className="ml-1 rounded bg-muted px-1 text-xs">mention « payé » lue</span>}</p>}
        {doc?.paid_mention && <p className="rounded border p-2 text-xs">La mention « payé » ne crée aucun règlement. Si la dépense a été payée par un employé, ne la saisissez pas comme dette fournisseur : utilisez « Préparer une note de frais » (copie privée, hors documents généraux).</p>}
        {isReleve && <p role="alert" className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-sm">Relevé fournisseur : il récapitule des dettes déjà enregistrées. Aucune facture n'est créée à partir d'un relevé; vous pouvez seulement le joindre à une facture existante.</p>}
        <fieldset disabled={!editable || !!busy} className="grid gap-3">
          <L l="Créer comme"><select aria-label="Créer comme" className={sel} value={e.kind} onChange={(ev) => up("kind", ev.target.value as C.Edits["kind"])}><option value="bill">Brouillon de facture fournisseur</option><option value="credit">Brouillon de note de crédit fournisseur</option></select></L>
          <L l="Fournisseur *" warn={!e.supplier_id ? "À compléter" : null}><select aria-label="Fournisseur" className={sel} value={e.supplier_id} onChange={(ev) => up("supplier_id", ev.target.value)}><option value="">— Choisir un fournisseur existant —</option>{sups.filter((s) => !s.archived || s.id === e.supplier_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></L>
          {!e.supplier_id && match.close.length > 0 && <p className="text-xs">Correspondances approximatives (à choisir vous-même) : {match.close.map((m) => <Button key={m.id} size="sm" variant="link" className="h-auto px-1" onClick={() => up("supplier_id", m.id)}>{m.name}</Button>)}</p>}
          {!e.supplier_id && doc?.supplier_name && !match.exact && <p className="text-xs text-muted-foreground">Aucune fiche n'est créée automatiquement : ajoutez le fournisseur dans « Factures et crédits » au besoin.</p>}
          <L l="Référence *" warn={unc("reference") ?? miss(e.reference)}><Input aria-label="Référence" value={e.reference} onChange={(ev) => up("reference", ev.target.value)} /></L>
          <div className="grid gap-3 sm:grid-cols-2">
            <L l="Date du document *" warn={unc("doc_date") ?? miss(e.doc_date)}><Input aria-label="Date du document" type="date" value={e.doc_date} onChange={(ev) => up("doc_date", ev.target.value)} /></L>
            {e.kind === "bill" && <L l="Échéance (seulement si écrite)" warn={unc("due_date") ?? (e.due_date ? null : "Inconnue")}><Input aria-label="Échéance" type="date" value={e.due_date} onChange={(ev) => up("due_date", ev.target.value)} /></L>}
            <L l="Avant taxes" warn={unc("subtotal") ?? miss(e.subtotal)}><Input aria-label="Avant taxes" inputMode="decimal" value={e.subtotal} onChange={(ev) => up("subtotal", ev.target.value)} /></L>
            <L l="TPS" warn={unc("gst") ?? miss(e.gst)}><Input aria-label="TPS" inputMode="decimal" value={e.gst} onChange={(ev) => up("gst", ev.target.value)} /></L>
            <L l="TVQ" warn={unc("qst") ?? miss(e.qst)}><Input aria-label="TVQ" inputMode="decimal" value={e.qst} onChange={(ev) => up("qst", ev.target.value)} /></L>
            <L l="Total *" warn={unc("total") ?? miss(e.total)}><Input aria-label="Total" inputMode="decimal" value={e.total} onChange={(ev) => up("total", ev.target.value)} /></L>
          </div>
          <L l="Description / lignes"><Textarea aria-label="Description" rows={3} value={e.description} onChange={(ev) => up("description", ev.target.value)} /></L>
          {isRecu && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={e.employee_paid} onChange={(ev) => up("employee_paid", ev.target.checked)} className="mt-1" />Payé par un employé avec ses fonds (à rembourser) — dans ce cas, aucune dette fournisseur n'est créée ici.</label>}
          {isRecu && e.employee_paid && editable && <a className="inline-block rounded-md border px-3 py-1 text-sm font-semibold" data-testid="cap-to-expense" href={`/entrepreneur/finances?tab=frais&company=${companyId}&capture=${id}`}>Préparer une note de frais</a>}
        </fieldset>
        {doc?.lines && doc.lines.length > 0 && <details className="text-xs"><summary>Lignes lues ({doc.lines.length})</summary><ul>{doc.lines.map((l, i) => <li key={i}>{l.description} · {l.quantity ?? "?"} {l.unit ?? ""} · {l.unit_price != null ? fmtMoney(l.unit_price) : "—"} · {l.amount != null ? fmtMoney(l.amount) : "—"}</li>)}</ul></details>}
        {warns.length > 0 && <ul role="status" className="list-disc space-y-1 rounded border border-destructive/40 bg-destructive/5 p-2 pl-6 text-xs">{warns.map((w) => <li key={w}>{w} Aucun montant n'est modifié automatiquement.</li>)}</ul>}
        {dups && (dups.exact.length > 0 || dups.probable.length > 0) && <div role="status" className="space-y-1 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
          {dups.exact.map((d) => <p key={d.id}><strong>Déjà enregistré</strong> ({d.why === "fichier" ? "même fichier" : "même fournisseur et référence"}) : {d.reference ?? "—"} · {d.total != null ? fmtMoney(d.total) : "—"}
            <Button size="sm" variant="link" onClick={() => onOpenBill(d.id)}>Ouvrir</Button>{editable && <Button size="sm" variant="link" onClick={() => setTarget(d.id)}>Y joindre la pièce</Button>}</p>)}
          {dups.probable.map((d) => <p key={d.id}>Doublon probable ({d.why}) : {d.reference ?? "—"} · {d.total != null ? fmtMoney(d.total) : "—"} <Button size="sm" variant="link" onClick={() => onOpenBill(d.id)}>Ouvrir</Button></p>)}
          {exact && editable && <L l="Exception justifiée — motif (tracé)"><Input aria-label="Motif de l'exception" value={dupReason} onChange={(ev) => setDupReason(ev.target.value)} /></L>}
        </div>}
        {dirty && editable && <p className="text-xs text-amber-700">Saisie conservée sur cet appareil jusqu'à l'enregistrement.</p>}
        {opErr && <p role="alert" className="text-sm text-destructive">Opération refusée : {opErr}. Le document et votre saisie sont conservés.</p>}
        {editable && <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={saveEdits} disabled={!!busy}>Enregistrer les corrections</Button>
          <Button size="sm" onClick={createDraft} disabled={!!busy || isReleve || e.employee_paid || !e.supplier_id || (exact && !dupReason.trim()) || (!!already && !multi)} data-testid="create-draft">
            {e.kind === "credit" ? "Créer un brouillon de note de crédit" : "Créer un brouillon"}</Button>
        </div>}
        {editable && <div className="space-y-1 rounded border p-2 text-sm"><p className="text-xs font-semibold text-muted-foreground">Joindre à une facture existante (justificatif seulement, aucune nouvelle dette)</p>
          <div className="flex flex-col gap-2 sm:flex-row"><select aria-label="Facture existante" className={sel} value={target} onChange={(ev) => setTarget(ev.target.value)}><option value="">{e.supplier_id ? "— Choisir une facture —" : "Choisissez d'abord le fournisseur"}</option>
            {bills.map((b) => <option key={b.id} value={b.id}>{b.reference ?? "—"} · {P.STATUS_LABEL[b.status]} · {b.total != null ? fmtMoney(b.total) : "—"}</option>)}{target && !bills.some((b) => b.id === target) && <option value={target}>Facture choisie</option>}</select>
            <Button size="sm" variant="outline" disabled={!target || !!busy} onClick={doAttach}>Joindre</Button></div></div>}
        {editable && c.status !== "traite" && <div className="flex flex-col gap-2 sm:flex-row sm:items-end"><L l="Écarter ce document — motif" className="flex-1"><Input aria-label="Motif pour écarter" value={reason} onChange={(ev) => setReason(ev.target.value)} /></L>
          <Button size="sm" variant="outline" disabled={!reason.trim() || !!busy} onClick={() => run("dismiss", async () => { await C.dismiss(id, reason); await load(); })}>Écarter</Button></div>}
        {c.dismiss_reason && <p className="text-xs">Écarté : {c.dismiss_reason}</p>}
        {evs.length > 0 && <details className="text-xs"><summary>Historique</summary><ul>{evs.map((v, i) => <li key={i}>{P.fmtStamp(v.created_at)} — {EV[v.action] ?? v.action}{v.reason ? ` · ${v.reason}` : ""}</li>)}</ul></details>}
      </div>
    </div>
  </section>;
}
const EV: Record<string, string> = { add: "Document ajouté", extract_start: "Lecture lancée", extract_ok: "Lecture terminée", extract_fail: "Lecture échouée", create_bill: "Brouillon de facture créé", create_credit: "Brouillon de note de crédit créé", attach: "Joint à une facture", dismiss: "Écarté", convert: "Photo HEIC convertie en JPEG (original conservé)" };

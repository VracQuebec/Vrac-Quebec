// FIN-12D — Notes de frais, avances et remboursements manuels (responsables : tout le dossier permis; employé : ses propres notes).
// Aucun virement : chaque versement/remboursement est un règlement manuel déclaré. Aucune écriture directe : RPC fin_exp_* seulement.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import * as X from "@/lib/finances/expenses";
import { fmtMoney } from "@/lib/finances/period";
import { METHOD_LABEL } from "@/lib/finances/settlement";

const sel = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";
const L = ({ l, warn, children, className = "" }: { l: string; warn?: string | null; children: React.ReactNode; className?: string }) =>
  <label className={`block text-sm ${className}`}><span className="mb-1 block text-xs font-semibold text-muted-foreground">{l}{warn && <span className="ml-1 rounded bg-amber-500/15 px-1 text-[11px] font-medium text-amber-800">{warn}</span>}</span>{children}</label>;
const at = (t?: string | null) => (t ? new Date(t).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : "—");
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
const m = (v: unknown) => fmtMoney(Number(v ?? 0));
const Stat = ({ l, v, tone = "" }: { l: string; v: string; tone?: string }) => <div className={`rounded-md border p-2 ${tone}`}><div className="text-[11px] text-muted-foreground">{l}</div><div className="font-display text-base font-semibold">{v}</div></div>;

type Props = { companyId: string; mine: boolean; canApprove: boolean; canCorrect: boolean; initialCapture?: string | null };

export default function ExpenseReports({ companyId, mine, canApprove, canCorrect, initialCapture }: Props) {
  const [view, setView] = useState<{ k: "list" } | { k: "edit"; id: string | null; capture?: string | null } | { k: "detail"; id: string }>(initialCapture ? { k: "edit", id: null, capture: initialCapture } : { k: "list" });
  const [ov, setOv] = useState<any>(null); const [err, setErr] = useState<string | null>(null);
  const [lk, setLk] = useState<Awaited<ReturnType<typeof X.lookups>> | null>(null);
  const seq = useRef(0);
  const load = useCallback(() => { const my = ++seq.current; setErr(null);
    X.overview(companyId, mine).then((r) => { if (my === seq.current) setOv(r); }).catch((e) => { if (my === seq.current) setErr(e.message); });
    X.lookups(companyId).then((r) => { if (my === seq.current) setLk(r); }).catch(() => undefined);
  }, [companyId, mine]);
  useEffect(() => { setOv(null); setLk(null); load(); return () => { seq.current++; }; }, [load]);
  const manage = canApprove && !mine;
  if (view.k === "edit") return <ReportEditor key={view.id ?? "new"} companyId={companyId} id={view.id} capture={view.capture ?? null} lk={lk} manage={manage} onDone={(id) => { load(); setView(id ? { k: "detail", id } : { k: "list" }); }} />;
  if (view.k === "detail") return <ReportDetail key={view.id} companyId={companyId} id={view.id} manage={manage} canCorrect={canCorrect} advances={ov?.advances ?? []} onBack={() => { load(); setView({ k: "list" }); }} onEdit={() => setView({ k: "edit", id: view.id })} />;
  const reps: any[] = ov?.reports ?? []; const advs: any[] = ov?.advances ?? [];
  const n = (k: string, rows: any[]) => rows.reduce((t, r) => t + Number(r[k] ?? 0), 0);
  const paidAdv = advs.filter((a) => a.status === "versee");
  return <div className="space-y-4" data-testid="exp-list">
    <p className="text-xs text-muted-foreground">Une note n'a aucun effet financier avant approbation. L'approbation crée un seul montant « À payer » à l'employé pour ce qu'il a payé lui-même; une dépense payée par l'entreprise n'est jamais remboursée. Aucun virement n'est exécuté ici : les versements et remboursements sont déclarés manuellement.</p>
    {err && <p role="alert" className="text-sm text-destructive">Chargement impossible : {err}</p>}
    {!ov ? <p className="text-muted-foreground">Chargement…</p> : <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="exp-totals">
        <Stat l="Dépenses approuvées" v={m(n("approved", reps))} />
        <Stat l="Avances versées" v={m(n("paid_amount", paidAdv))} />
        <Stat l="Avances affectées" v={m(n("allocated", paidAdv))} />
        <Stat l="Restitutions reçues" v={m(n("restituted", paidAdv))} />
        <Stat l="Reste dû aux employés" v={m(n("due", reps))} tone="border-primary/50" />
        <Stat l="Avances à justifier ou restituer" v={m(n("available", paidAdv))} tone="border-amber-500/50" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display font-semibold">{mine ? "Mes notes de frais" : "Notes de frais"}</h3>
        <Button size="sm" onClick={() => setView({ k: "edit", id: null })} data-testid="exp-new">Nouvelle note de frais</Button></div>
      {reps.length === 0 ? <p className="text-sm text-muted-foreground">Aucune note pour l'instant.</p> :
        <ul className="divide-y rounded-md border">{reps.map((r) => <li key={r.id}><button className="flex w-full flex-col gap-1 p-3 text-left hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between" onClick={() => setView({ k: "detail", id: r.id })}>
          <span className="min-w-0"><strong className="break-words">{r.purpose}</strong>{manage && <span className="text-muted-foreground"> · {r.employee}</span>}<span className="block text-xs text-muted-foreground">{X.STATUS_LABEL[r.status]}{r.approval === "partielle" ? " (partielle)" : ""} · v{r.version} · {at(r.updated_at)}</span></span>
          <span className="text-sm sm:text-right">Demandé {m(r.requested)}{r.approved != null && <> · approuvé {m(r.approved)}</>}<span className="block font-semibold">{Number(r.due) > 0 ? `Reste dû ${m(r.due)}` : r.status === "approuvee" ? "Rien à rembourser" : ""}</span></span>
        </button></li>)}</ul>}
      <Advances companyId={companyId} advs={advs} reps={reps} manage={manage} canCorrect={canCorrect} lk={lk} reload={load} />
    </>}
  </div>;
}

// ---------------- Saisie / modification d'un brouillon ----------------
function ReportEditor({ companyId, id, capture, lk, manage, onDone }: { companyId: string; id: string | null; capture: string | null; lk: any; manage: boolean; onDone: (id: string | null) => void }) {
  const [rid, setRid] = useState<string | null>(id); const [rev, setRev] = useState<number | null>(null);
  const [h, setH] = useState({ purpose: "", period_start: "", period_end: "", employee_id: "" });
  const [lines, setLines] = useState<X.Line[]>([X.emptyLine()]);
  const [busy, setBusy] = useState<string | null>(null); const [opErr, setOpErr] = useState<string | null>(null); const [loaded, setLoaded] = useState(!id);
  const draftKey = `vq.fin12d.${companyId}.${id ?? "new"}`;
  useEffect(() => { if (!id) { try { const s = JSON.parse(localStorage.getItem(draftKey) ?? "null"); if (s) { setH(s.h); setLines(s.lines); } } catch { /* rien */ } return; }
    X.detail(id).then((d) => { setRev(d.rev); setH({ purpose: d.purpose, period_start: d.period_start ?? "", period_end: d.period_end ?? "", employee_id: d.employee_id });
      setLines(d.lines.length ? d.lines.map(X.lineFromRow) : [X.emptyLine()]); setLoaded(true); }).catch((e) => setOpErr(e.message));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded) localStorage.setItem(draftKey, JSON.stringify({ h, lines })); }, [h, lines, loaded, draftKey]);
  // Reçu orienté depuis « Reçus et documents » (FIN-12C) : copie privée + lecture existante proposée.
  const capDone = useRef(false);
  useEffect(() => { if (!capture || capDone.current) return; capDone.current = true; setBusy("Copie privée du reçu…");
    X.fromCapture(companyId, capture).then(async (f) => { const row = await X.fileRow(f.id);
      setLines((ls) => [X.lineFromExtraction(row?.extraction ?? null, { ...X.emptyLine(), file_id: f.id, file_name: f.name }), ...ls.filter((l) => l.merchant || l.business_amount || l.file_id)]);
      toast({ title: "Reçu copié dans le dossier privé de la note", description: row?.extraction ? "Suggestions de lecture appliquées : vérifiez chaque champ." : "Aucune lecture existante : saisissez ou lancez la lecture." });
    }).catch((e) => setOpErr(e.message)).finally(() => setBusy(null));
  }, [capture, companyId]);
  const up = (i: number, k: keyof X.Line, v: any) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const persist = async () => {
    const r = await X.save(companyId, rid, { ...h, employee_id: h.employee_id || undefined, lines: lines.map(X.linePayload) }, rid ? rev : null);
    setRid(r.id); setRev(r.rev); localStorage.removeItem(draftKey); localStorage.removeItem(`vq.fin12d.${companyId}.${r.id}`); return r;
  };
  const run = async (label: string, f: () => Promise<void>) => { setBusy(label); setOpErr(null); try { await f(); } catch (e: any) { setOpErr(e.message); } finally { setBusy(null); } };
  if (!loaded) return <p className="text-muted-foreground">{opErr ?? "Chargement…"}</p>;
  return <div className="space-y-3" data-testid="exp-editor">
    <Button size="sm" variant="outline" onClick={() => onDone(rid)}>← Retour</Button>
    <h3 className="font-display font-semibold">{rid ? "Modifier la note (brouillon ou à corriger)" : "Nouvelle note de frais"}</h3>
    <div className="grid gap-2 sm:grid-cols-2">
      <L l="Objet *"><Input aria-label="Objet" value={h.purpose} onChange={(e) => setH({ ...h, purpose: e.target.value })} /></L>
      {manage && !rid && <L l="Bénéficiaire"><select aria-label="Bénéficiaire" className={sel} value={h.employee_id} onChange={(e) => setH({ ...h, employee_id: e.target.value })}><option value="">Moi-même</option>{(lk?.members ?? []).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></L>}
      <L l="Période — début"><Input type="date" value={h.period_start} onChange={(e) => setH({ ...h, period_start: e.target.value })} /></L>
      <L l="Période — fin"><Input type="date" value={h.period_end} onChange={(e) => setH({ ...h, period_end: e.target.value })} /></L>
    </div>
    <p className="text-xs text-muted-foreground">{X.LIMITS} Devise : CAD. Les taxes non lues restent vides (à compléter); aucune admissibilité fiscale n'est déduite.</p>
    {lines.map((l, i) => <LineEditor key={i} i={i} l={l} companyId={companyId} lk={lk} manage={manage} up={(k, v) => up(i, k, v)} remove={() => setLines((ls) => ls.filter((_, j) => j !== i))} setLine={(nl) => setLines((ls) => ls.map((x, j) => (j === i ? nl : x)))} />)}
    <Button size="sm" variant="outline" onClick={() => setLines([...lines, X.emptyLine()])}>Ajouter une dépense</Button>
    <p className="text-xs text-amber-700">Saisie conservée sur cet appareil jusqu'à l'enregistrement.</p>
    {busy && <p role="status" className="text-sm">{busy}</p>}
    {opErr && <p role="alert" className="text-sm text-destructive">Opération refusée : {opErr}. Votre saisie est conservée.</p>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("Enregistrement…", async () => { await persist(); toast({ title: "Brouillon enregistré" }); })}>Enregistrer le brouillon</Button>
      <Button size="sm" disabled={!!busy} data-testid="exp-submit" onClick={() => run("Soumission…", async () => { const r = await persist(); await X.submit(r.id, r.rev); toast({ title: "Note soumise pour examen" }); onDone(r.id); })}>Enregistrer et soumettre</Button>
    </div>
  </div>;
}

function LineEditor({ i, l, companyId, lk, manage, up, remove, setLine }: { i: number; l: X.Line; companyId: string; lk: any; manage: boolean; up: (k: keyof X.Line, v: any) => void; remove: () => void; setLine: (l: X.Line) => void }) {
  const [busy, setBusy] = useState<string | null>(null); const [fe, setFe] = useState<string | null>(null); const [ex, setEx] = useState<any>(null);
  const refresh = useCallback(async () => { if (l.file_id) setEx(await X.fileRow(l.file_id)); else setEx(null); }, [l.file_id]);
  useEffect(() => { refresh(); }, [refresh]);
  const go = async (label: string, f: () => Promise<void>) => { setBusy(label); setFe(null); try { await f(); } catch (e: any) { setFe(e.message); } finally { setBusy(null); await refresh(); } };
  const onFile = (f?: File) => f && go("Téléversement…", async () => { const r = await X.uploadFile(companyId, f, f.name); setLine({ ...l, file_id: r.id, file_name: r.name }); });
  const heic = ex?.mime === "image/heic";
  return <fieldset className="space-y-2 rounded-md border p-3" data-testid={`exp-line-${i}`}>
    <legend className="px-1 text-xs font-semibold">Dépense {i + 1}</legend>
    <div className="grid gap-2 sm:grid-cols-3">
      <L l="Date *" warn={l.spent_on ? null : "À compléter"}><Input type="date" aria-label="Date" value={l.spent_on} onChange={(e) => up("spent_on", e.target.value)} /></L>
      <L l="Commerçant *" warn={l.merchant ? null : "À compléter"}><Input aria-label="Commerçant" value={l.merchant} onChange={(e) => up("merchant", e.target.value)} /></L>
      <L l="Catégorie"><Input aria-label="Catégorie" value={l.category} onChange={(e) => up("category", e.target.value)} /></L>
      <L l="Montant du document"><Input aria-label="Montant du document" inputMode="decimal" value={l.doc_amount} onChange={(e) => up("doc_amount", e.target.value)} /></L>
      <L l="TPS" warn={l.gst ? null : "À compléter"}><Input aria-label="TPS" inputMode="decimal" value={l.gst} onChange={(e) => up("gst", e.target.value)} /></L>
      <L l="TVQ" warn={l.qst ? null : "À compléter"}><Input aria-label="TVQ" inputMode="decimal" value={l.qst} onChange={(e) => up("qst", e.target.value)} /></L>
      <L l="Portion professionnelle demandée *"><Input aria-label="Portion professionnelle" inputMode="decimal" value={l.business_amount} onChange={(e) => up("business_amount", e.target.value)} /></L>
      <L l="Payeur" className="sm:col-span-2"><select aria-label="Payeur" className={sel} value={l.payer} onChange={(e) => up("payer", e.target.value)}>{(Object.keys(X.PAYER_LABEL) as X.Payer[]).map((p) => <option key={p} value={p}>{X.PAYER_LABEL[p]}</option>)}</select></L>
    </div>
    {l.payer === "entreprise" && <p className="text-xs">Payée par l'entreprise : documentée seulement, aucun remboursement à l'employé.{manage && <> Si l'achat existe déjà, indiquez son identifiant pour le lier sans le recréer : <Input aria-label="Achat existant" className="mt-1" placeholder="Identifiant de la facture fournisseur" value={l.supplier_bill_id} onChange={(e) => up("supplier_bill_id", e.target.value)} /></>}</p>}
    {l.payer === "avance" && <p className="text-xs">Financée par une avance : une fois approuvée, elle justifie l'avance par affectation, sans second remboursement ni nouvelle sortie d'argent.</p>}
    <L l="Description"><Textarea rows={2} aria-label="Description" value={l.description} onChange={(e) => up("description", e.target.value)} /></L>
    <div className="grid gap-2 sm:grid-cols-2">
      <L l="Camion / équipement"><select className={sel} aria-label="Camion" value={l.truck_id} onChange={(e) => up("truck_id", e.target.value)}><option value="">—</option>{(lk?.trucks ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></L>
      <L l="Chantier"><select className={sel} aria-label="Chantier" value={l.project_id} onChange={(e) => up("project_id", e.target.value)}><option value="">—</option>{(lk?.projects ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></L>
    </div>
    <div className="space-y-1 rounded bg-muted/40 p-2 text-sm">
      {l.file_id ? <>
        <p>Justificatif : <strong className="break-all">{l.file_name ?? ex?.name ?? "pièce jointe"}</strong>{ex && <span className="text-xs text-muted-foreground"> · lecture : {ex.extract_status === "ok" ? "faite" : ex.extract_status === "echec" ? "échec" : ex.extract_status === "lecture" ? "en cours" : "non lancée"}</span>}</p>
        <div className="flex flex-wrap gap-2">
          {ex && <Button size="sm" variant="outline" onClick={() => go("Ouverture…", async () => { window.open(await X.openUrl(ex.converted_path ?? ex.storage_path), "_blank", "noopener"); })}>Voir la pièce</Button>}
          {heic && !ex?.converted_path && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => go("Conversion…", async () => { await X.convertHeic(companyId, l.file_id!); await X.extract(l.file_id!); })}>Convertir et lire</Button>}
          {!(heic && !ex?.converted_path) && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => go("Lecture en cours…", async () => { await X.extract(l.file_id!, ex?.extract_status === "ok"); })}>{ex?.extract_status === "ok" ? "Relire" : "Lire le reçu"}</Button>}
          {ex?.extraction && <Button size="sm" onClick={() => setLine(X.lineFromExtraction(ex.extraction, l))}>Appliquer les suggestions de lecture</Button>}
          <Button size="sm" variant="ghost" onClick={() => setLine({ ...l, file_id: null, file_name: null })}>Retirer</Button>
        </div>
        {ex?.extract_error && <p className="text-xs text-destructive">{ex.extract_error}</p>}
        <L l="Répartition justifiée (si ce reçu sert à plusieurs notes/achats)"><Input aria-label="Répartition" value={l.split_reason} onChange={(e) => up("split_reason", e.target.value)} /></L>
      </> : <>
        <label className="block text-sm"><span className="text-xs font-semibold text-muted-foreground">Photo ou PDF du reçu</span>
          <input type="file" aria-label={`Justificatif ${i + 1}`} accept="image/jpeg,image/png,image/webp,image/heic,.heic,application/pdf" capture="environment" className="mt-1 block w-full text-sm" onChange={(e) => onFile(e.target.files?.[0])} /></label>
        <p className="text-xs text-amber-800">Justificatif manquant : joignez la pièce ou expliquez son absence (décision motivée du responsable requise).</p>
        <Input aria-label="Motif de la pièce manquante" placeholder="Pourquoi la pièce manque" value={l.missing_receipt_note} onChange={(e) => up("missing_receipt_note", e.target.value)} />
      </>}
      {busy && <p role="status" className="text-xs">{busy}</p>}
      {fe && <p role="alert" className="text-xs text-destructive">{fe} — la pièce et la saisie sont conservées; saisie manuelle possible.</p>}
    </div>
    <Button size="sm" variant="ghost" onClick={remove}>Supprimer cette dépense</Button>
  </fieldset>;
}

// ---------------- Détail, examen, remboursements ----------------
function ReportDetail({ companyId, id, manage, canCorrect, advances, onBack, onEdit }: { companyId: string; id: string; manage: boolean; canCorrect: boolean; advances: any[]; onBack: () => void; onEdit: () => void }) {
  const [d, setD] = useState<any>(null); const [opErr, setOpErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [dec, setDec] = useState<Record<string, { accepted_amount: string; reason: string; missing_accepted_reason: string }>>({});
  const [note, setNote] = useState(""); const [selfR, setSelfR] = useState(""); const [due, setDue] = useState("");
  const [pay, setPay] = useState({ amount: "", paid_on: today(), method: "virement", reference: "" });
  const [voidR, setVoidR] = useState<Record<string, string>>({});
  const decKey = useRef(X.key()); const payKey = useRef(X.key());
  const load = useCallback(() => X.detail(id).then((r) => { setD(r); setDec(Object.fromEntries(r.lines.map((l: any) => [l.id, { accepted_amount: String(l.accepted_amount ?? l.business_amount ?? ""), reason: l.decision_reason ?? "", missing_accepted_reason: l.missing_accepted_reason ?? "" }]))); }).catch((e) => setOpErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  const run = async (f: () => Promise<unknown>, ok: string) => { setBusy(true); setOpErr(null); try { await f(); toast({ title: ok }); await load(); } catch (e: any) { setOpErr(e.message); } finally { setBusy(false); } };
  if (!d) return <div><Button size="sm" variant="outline" onClick={onBack}>← Retour</Button><p className="mt-2 text-muted-foreground">{opErr ?? "Chargement…"}</p></div>;
  const stale = d.current_hash !== d.submitted_hash;
  const canDecide = manage && d.can_decide && d.status === "soumise";
  const decide = (kind: "approve" | "return" | "refuse") => run(() => X.decide(id, kind, d.lines.map((l: any) => ({ id: l.id, ...dec[l.id] })), d.version, d.submitted_hash, note, selfR, due || null, decKey.current), kind === "approve" ? "Note approuvée" : kind === "return" ? "Note retournée à corriger" : "Note refusée");
  const sum = X.summarize(d.lines.map((l: any) => ({ payer: l.payer, accepted_amount: l.accepted_amount, business_amount: l.business_amount })), Number(d.advances_allocated), Number(d.reimbursed));
  const empAdv = advances.filter((a) => a.employee_id === d.employee_id && a.status === "versee" && Number(a.available) > 0);
  return <div className="space-y-3" data-testid="exp-detail">
    <Button size="sm" variant="outline" onClick={onBack}>← Retour</Button>
    <div><h3 className="font-display text-lg font-semibold break-words">{d.purpose}</h3>
      <p className="text-sm text-muted-foreground">{d.employee_name} · {X.STATUS_LABEL[d.status]}{d.approval ? ` (${d.approval})` : ""} · version soumise v{d.version}{d.submitted_at ? ` le ${at(d.submitted_at)}` : ""}</p>
      {d.decision_note && <p className="mt-1 rounded border p-2 text-sm">Décision : {d.decision_note}</p>}
      {d.self_approval_reason && <p className="text-xs text-amber-800">Auto-approbation exceptionnelle tracée : {d.self_approval_reason}</p>}</div>
    {d.status === "approuvee" && <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="exp-balance">
      <Stat l="Approuvé" v={m(d.approved_total)} /><Stat l="Remboursable à l'employé" v={m(d.reimbursable_total)} /><Stat l="Avances affectées" v={m(d.advances_allocated)} />
      <Stat l="Remboursé" v={m(d.reimbursed)} /><Stat l="Reste dû" v={m(d.due)} tone="border-primary/50" /></div>}
    {d.status === "approuvee" && d.due_unknown && Number(d.due) > 0 && <p className="text-xs text-amber-800">Échéance inconnue : affichée comme telle dans À payer et le calendrier.</p>}
    {sum.company > 0 && <p className="text-xs">Dont {m(sum.company)} payé directement par l'entreprise : documenté, jamais remboursé à l'employé.</p>}
    <ul className="space-y-2">{d.lines.map((l: any) => { const v = dec[l.id] ?? { accepted_amount: "", reason: "", missing_accepted_reason: "" }; const gap = Number(l.business_amount ?? 0) - Number(l.accepted_amount ?? l.business_amount ?? 0);
      return <li key={l.id} className="rounded-md border p-3 text-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:justify-between"><span className="min-w-0 break-words"><strong>{l.merchant ?? "Commerçant à compléter"}</strong> · {l.spent_on ?? "date à compléter"}{l.category ? ` · ${l.category}` : ""}<span className="block text-xs text-muted-foreground">{X.PAYER_LABEL[l.payer as X.Payer]}{l.file_name ? ` · pièce : ${l.file_name}` : " · pièce manquante"}{l.missing_receipt_note ? ` (${l.missing_receipt_note})` : ""}</span></span>
          <span className="sm:text-right">Demandé {m(l.business_amount)}{l.doc_amount != null && <span className="block text-xs">document {m(l.doc_amount)} · TPS {l.gst ?? "à compléter"} · TVQ {l.qst ?? "à compléter"}</span>}{l.accepted_amount != null && <span className="block">Accepté {m(l.accepted_amount)}{gap > 0 ? ` · écart ${m(gap)}` : ""}</span>}</span></div>
        {l.decision_reason && <p className="text-xs">Motif : {l.decision_reason}</p>}
        {(l.uses ?? []).length > 0 && <p className="mt-1 rounded bg-amber-500/10 p-1 text-xs text-amber-900">Reçu déjà utilisé ailleurs : {(l.uses as any[]).map((u) => u.kind === "achat" ? `achat ${u.reference ?? ""} (${m(u.amount)})` : `note de ${u.employee} (${X.STATUS_LABEL[u.status]}, ${m(u.amount)})`).join(" ; ")}. Double remboursement refusé sans répartition justifiée.</p>}
        {canDecide && <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <L l="Montant accepté"><Input aria-label={`Accepté ${l.pos}`} inputMode="decimal" value={v.accepted_amount} onChange={(e) => setDec({ ...dec, [l.id]: { ...v, accepted_amount: e.target.value } })} /></L>
          <L l="Motif réduction / refus"><Input aria-label={`Motif ${l.pos}`} value={v.reason} onChange={(e) => setDec({ ...dec, [l.id]: { ...v, reason: e.target.value } })} /></L>
          {!l.file_id && <L l="Pièce manquante acceptée — motif"><Input aria-label={`Pièce manquante ${l.pos}`} value={v.missing_accepted_reason} onChange={(e) => setDec({ ...dec, [l.id]: { ...v, missing_accepted_reason: e.target.value } })} /></L>}
        </div>}
        {manage && canCorrect && d.status === "approuvee" && <AdjustLine l={l} onDone={load} />}
      </li>; })}</ul>
    {d.can_edit && <Button size="sm" onClick={onEdit}>Modifier et soumettre de nouveau</Button>}
    {canDecide && <div className="space-y-2 rounded-md border p-3" data-testid="exp-decide">
      {stale && <p role="alert" className="text-sm text-destructive">La note a changé depuis la soumission : version périmée, approbation impossible.</p>}
      <L l="Note de décision (obligatoire pour retour ou refus)"><Textarea rows={2} aria-label="Note de décision" value={note} onChange={(e) => setNote(e.target.value)} /></L>
      <L l="Échéance du remboursement (facultatif)"><Input type="date" aria-label="Échéance" value={due} onChange={(e) => setDue(e.target.value)} /></L>
      {d.is_self && <L l="Auto-approbation — motif obligatoire (tracé)"><Input aria-label="Motif d'auto-approbation" value={selfR} onChange={(e) => setSelfR(e.target.value)} /></L>}
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || stale} onClick={() => decide("approve")} data-testid="exp-approve">Approuver</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => decide("return")}>Retourner à corriger</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => decide("refuse")}>Refuser</Button></div>
    </div>}
    {manage && d.status === "approuvee" && Number(d.due) > 0 && <div className="space-y-2 rounded-md border p-3" data-testid="exp-reimburse">
      <h4 className="font-semibold">Enregistrer un remboursement (manuel, aucun virement exécuté)</h4>
      <div className="grid gap-2 sm:grid-cols-4">
        <L l={`Montant (max ${m(d.due)})`}><Input aria-label="Montant remboursé" inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></L>
        <L l="Date"><Input type="date" aria-label="Date du remboursement" value={pay.paid_on} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} /></L>
        <L l="Moyen"><select className={sel} aria-label="Moyen" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></L>
        <L l="Référence"><Input aria-label="Référence" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></L>
      </div>
      <Button size="sm" disabled={busy || !pay.amount} onClick={() => run(async () => { await X.reimburse(id, { ...pay, amount: pay.amount.replace(",", "."), idem_key: payKey.current }); payKey.current = X.key(); setPay({ ...pay, amount: "", reference: "" }); }, "Remboursement enregistré")}>Enregistrer le remboursement</Button>
      {empAdv.length > 0 && <AllocBox advs={empAdv} reportId={id} due={Number(d.due)} onDone={load} />}
    </div>}
    {(d.payments ?? []).length > 0 && <div className="text-sm"><h4 className="font-semibold">Remboursements</h4><ul className="divide-y rounded border">{d.payments.map((p: any) => <li key={p.payment_id + (p.reversed_at ?? "")} className="flex flex-col gap-1 p-2 sm:flex-row sm:items-center sm:justify-between">
      <span>{m(p.amount)} · {p.paid_on} · {METHOD_LABEL[p.method] ?? p.method}{p.reference ? ` · ${p.reference}` : ""}{(p.status !== "validated" || p.reversed_at) && <span className="ml-1 text-destructive">annulé{p.reason ? ` — ${p.reason}` : ""}</span>}</span>
      {manage && canCorrect && p.status === "validated" && !p.reversed_at && <span className="flex gap-1"><Input aria-label="Motif d'annulation" className="h-8" placeholder="Motif" value={voidR[p.payment_id] ?? ""} onChange={(e) => setVoidR({ ...voidR, [p.payment_id]: e.target.value })} />
        <Button size="sm" variant="outline" disabled={busy || !(voidR[p.payment_id] ?? "").trim()} onClick={() => run(() => X.voidPayment(p.payment_id, voidR[p.payment_id]), "Remboursement annulé; solde rétabli")}>Annuler</Button></span>}
    </li>)}</ul></div>}
    {(d.allocs ?? []).length > 0 && <p className="text-sm">Avances affectées : {d.allocs.map((a: any) => `${m(a.amount)}${a.voided_at ? " (retirée)" : ""}`).join(" · ")}</p>}
    {opErr && <p role="alert" className="text-sm text-destructive">Opération refusée : {opErr}</p>}
    <details className="text-sm"><summary className="cursor-pointer font-semibold">Historique</summary><ul className="mt-1 space-y-1">{d.events.map((e: any, i: number) => <li key={i}>{at(e.at)} — {X.EVENT_LABEL[e.action] ?? e.action}{e.reason ? ` : ${e.reason}` : ""}</li>)}</ul></details>
  </div>;
}

function AdjustLine({ l, onDone }: { l: any; onDone: () => void }) {
  const [v, setV] = useState(""); const [r, setR] = useState(""); const [e, setE] = useState<string | null>(null);
  return <details className="mt-2 text-xs"><summary className="cursor-pointer">Corriger après approbation (tracé)</summary>
    <div className="mt-1 flex flex-col gap-1 sm:flex-row"><Input className="h-8" aria-label="Nouveau montant accepté" placeholder="Nouveau montant" value={v} onChange={(x) => setV(x.target.value)} /><Input className="h-8" aria-label="Motif de correction" placeholder="Motif" value={r} onChange={(x) => setR(x.target.value)} />
      <Button size="sm" variant="outline" disabled={!v || !r.trim()} onClick={async () => { try { await X.adjust(l.id, Number(v.replace(",", ".")), r); onDone(); } catch (x: any) { setE(x.message); } }}>Corriger</Button></div>
    {e && <p className="text-destructive">{e}</p>}</details>;
}

function AllocBox({ advs, reportId, due, onDone }: { advs: any[]; reportId: string; due: number; onDone: () => void }) {
  const [adv, setAdv] = useState(advs[0]?.id ?? ""); const [amt, setAmt] = useState(""); const [e, setE] = useState<string | null>(null); const k = useRef(X.key());
  const a = advs.find((x) => x.id === adv);
  return <div className="space-y-1 border-t pt-2"><h4 className="text-sm font-semibold">Affecter une avance versée (aucune nouvelle sortie d'argent)</h4>
    <div className="flex flex-col gap-2 sm:flex-row"><select className={sel} aria-label="Avance" value={adv} onChange={(x) => setAdv(x.target.value)}>{advs.map((x) => <option key={x.id} value={x.id}>{x.purpose} · disponible {m(x.available)}</option>)}</select>
      <Input aria-label="Montant affecté" inputMode="decimal" placeholder={`max ${m(Math.min(Number(a?.available ?? 0), due))}`} value={amt} onChange={(x) => setAmt(x.target.value)} />
      <Button size="sm" disabled={!amt} onClick={async () => { setE(null); try { await X.alloc(adv, reportId, Number(amt.replace(",", ".")), k.current); k.current = X.key(); setAmt(""); toast({ title: "Avance affectée" }); onDone(); } catch (x: any) { setE(x.message); } }}>Affecter</Button></div>
    {e && <p role="alert" className="text-xs text-destructive">{e}</p>}</div>;
}

// ---------------- Avances ----------------
function Advances({ companyId, advs, reps, manage, canCorrect, lk, reload }: { companyId: string; advs: any[]; reps: any[]; manage: boolean; canCorrect: boolean; lk: any; reload: () => void }) {
  const [f, setF] = useState({ purpose: "", amount: "", planned_on: "", employee_id: "" }); const [e, setE] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); setE(null); try { await fn(); toast({ title: ok }); reload(); } catch (x: any) { setE(x.message); } finally { setBusy(false); } };
  return <section className="space-y-2" data-testid="exp-advances"><h3 className="font-display font-semibold">Avances</h3>
    <p className="text-xs text-muted-foreground">Une avance prévue n'est pas versée. Le versement est une sortie de trésorerie à justifier, pas une dépense. Un excédent reste « à justifier ou restituer » — jamais un solde négatif ni un revenu.</p>
    <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-5">
      <L l="Objet"><Input aria-label="Objet de l'avance" value={f.purpose} onChange={(x) => setF({ ...f, purpose: x.target.value })} /></L>
      <L l="Montant (CAD)"><Input aria-label="Montant de l'avance" inputMode="decimal" value={f.amount} onChange={(x) => setF({ ...f, amount: x.target.value })} /></L>
      <L l="Date prévue"><Input type="date" aria-label="Date prévue" value={f.planned_on} onChange={(x) => setF({ ...f, planned_on: x.target.value })} /></L>
      {manage && <L l="Employé"><select className={sel} aria-label="Employé de l'avance" value={f.employee_id} onChange={(x) => setF({ ...f, employee_id: x.target.value })}><option value="">Moi-même</option>{(lk?.members ?? []).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></L>}
      <div className="flex items-end"><Button size="sm" disabled={busy || !f.amount} onClick={() => run(async () => { await X.advSave(companyId, { ...f, amount: f.amount.replace(",", "."), employee_id: f.employee_id || undefined }); setF({ purpose: "", amount: "", planned_on: "", employee_id: "" }); }, "Avance préparée")}>Préparer l'avance</Button></div>
    </div>
    {e && <p role="alert" className="text-sm text-destructive">Opération refusée : {e}</p>}
    <ul className="space-y-2">{advs.map((a) => <AdvanceRow key={a.id} a={a} reps={reps} manage={manage} canCorrect={canCorrect} run={run} busy={busy} />)}</ul>
  </section>;
}

function AdvanceRow({ a, reps, manage, canCorrect, run, busy }: { a: any; reps: any[]; manage: boolean; canCorrect: boolean; run: (f: () => Promise<unknown>, ok: string) => void; busy: boolean }) {
  const [note, setNote] = useState(""); const [selfR, setSelfR] = useState(""); const [pay, setPay] = useState({ amount: String(a.amount), paid_on: today(), method: "virement", reference: "" });
  const [rest, setRest] = useState({ amount: "", received_on: today(), reference: "" }); const [rep, setRep] = useState(""); const [amt, setAmt] = useState(""); const [vr, setVr] = useState("");
  const k = useRef({ dec: X.key(), pay: X.key(), res: X.key(), al: X.key() });
  const targets = reps.filter((r) => r.employee_id === a.employee_id && r.status === "approuvee" && Number(r.due) > 0);
  return <li className="space-y-2 rounded-md border p-3 text-sm" data-testid="exp-adv">
    <div className="flex flex-col gap-1 sm:flex-row sm:justify-between"><span className="min-w-0 break-words"><strong>{a.purpose}</strong>{manage && ` · ${a.employee}`}<span className="block text-xs text-muted-foreground">{X.ADV_LABEL[a.status]}{a.paid_on ? ` le ${a.paid_on}` : a.planned_on ? ` · prévue le ${a.planned_on}` : ""}{a.reference ? ` · réf. ${a.reference}` : ""}</span></span>
      <span className="sm:text-right">{m(a.status === "versee" ? a.paid_amount : a.amount)}{a.status === "versee" && <span className="block text-xs">affecté {m(a.allocated)} · restitué {m(a.restituted)} · <strong>à justifier/restituer {m(a.available)}</strong></span>}</span></div>
    {manage && a.status === "prevue" && <div className="flex flex-col gap-2 sm:flex-row"><Input aria-label="Note de décision d'avance" placeholder="Note (obligatoire pour refuser)" value={note} onChange={(e) => setNote(e.target.value)} />
      <Input aria-label="Motif d'auto-approbation d'avance" placeholder="Auto-approbation : motif" value={selfR} onChange={(e) => setSelfR(e.target.value)} />
      <Button size="sm" disabled={busy} onClick={() => run(() => X.advDecide(a.id, "approve", note, selfR, k.current.dec), "Avance approuvée")}>Approuver</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => X.advDecide(a.id, "refuse", note, selfR, k.current.dec), "Avance refusée")}>Refuser</Button></div>}
    {manage && a.status === "approuvee" && <div className="grid gap-2 sm:grid-cols-5">
      <Input aria-label="Montant versé" inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
      <Input type="date" aria-label="Date du versement" value={pay.paid_on} onChange={(e) => setPay({ ...pay, paid_on: e.target.value })} />
      <select className={sel} aria-label="Moyen du versement" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{Object.entries(METHOD_LABEL).map(([kk, v]) => <option key={kk} value={kk}>{v}</option>)}</select>
      <Input aria-label="Référence du versement" placeholder="Référence" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} />
      <Button size="sm" disabled={busy} onClick={() => run(() => X.advPay(a.id, { ...pay, amount: pay.amount.replace(",", "."), currency: "CAD", idem_key: k.current.pay }), "Versement de l'avance enregistré")}>Enregistrer le versement</Button></div>}
    {manage && a.status === "versee" && Number(a.available) > 0 && <>
      {targets.length > 0 && <div className="flex flex-col gap-2 sm:flex-row"><select className={sel} aria-label="Note à justifier" value={rep} onChange={(e) => setRep(e.target.value)}><option value="">— Note approuvée à justifier —</option>{targets.map((r) => <option key={r.id} value={r.id}>{r.purpose} · reste dû {m(r.due)}</option>)}</select>
        <Input aria-label="Montant à affecter" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
        <Button size="sm" disabled={busy || !rep || !amt} onClick={() => run(async () => { await X.alloc(a.id, rep, Number(amt.replace(",", ".")), k.current.al); k.current.al = X.key(); setAmt(""); }, "Avance affectée")}>Affecter</Button></div>}
      <div className="grid gap-2 sm:grid-cols-4"><Input aria-label="Montant restitué" inputMode="decimal" placeholder={`Restitution (max ${m(a.available)})`} value={rest.amount} onChange={(e) => setRest({ ...rest, amount: e.target.value })} />
        <Input type="date" aria-label="Date de réception" value={rest.received_on} onChange={(e) => setRest({ ...rest, received_on: e.target.value })} />
        <Input aria-label="Référence de restitution" placeholder="Référence / preuve" value={rest.reference} onChange={(e) => setRest({ ...rest, reference: e.target.value })} />
        <Button size="sm" disabled={busy || !rest.amount} onClick={() => run(async () => { await X.restitute(a.id, { ...rest, amount: rest.amount.replace(",", "."), idem_key: k.current.res }); k.current.res = X.key(); setRest({ ...rest, amount: "" }); }, "Restitution enregistrée (pas un revenu)")}>Enregistrer la restitution</Button></div>
    </>}
    {manage && canCorrect && ((a.allocs ?? []).some((x: any) => !x.voided_at) || (a.restitutions ?? []).some((x: any) => !x.voided_at)) && <details className="text-xs"><summary className="cursor-pointer">Annuler une affectation ou une restitution (motif)</summary>
      <Input className="my-1 h-8" aria-label="Motif d'annulation d'avance" placeholder="Motif" value={vr} onChange={(e) => setVr(e.target.value)} />
      {(a.allocs ?? []).filter((x: any) => !x.voided_at).map((x: any) => <Button key={x.id} size="sm" variant="outline" className="mr-1" disabled={!vr.trim()} onClick={() => run(() => X.allocVoid(x.id, vr), "Affectation retirée")}>Retirer affectation {m(x.amount)}</Button>)}
      {(a.restitutions ?? []).filter((x: any) => !x.voided_at).map((x: any) => <Button key={x.id} size="sm" variant="outline" className="mr-1" disabled={!vr.trim()} onClick={() => run(() => X.restitutionVoid(x.id, vr), "Restitution annulée")}>Annuler restitution {m(x.amount)}</Button>)}
    </details>}
  </li>;
}

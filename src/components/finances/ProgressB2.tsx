// FIN-09B2 — Suivi du dossier progressif : choix du suivi, jalons, avenants approuvés.
// Tous les montants, plafonds et contrôles sont décidés au serveur; l'écran ne fait qu'afficher et envoyer.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fmtDate, todayIn } from "@/lib/finances/period";
import * as P from "@/lib/finances/progress";

const sel = "h-10 rounded-md border border-input bg-background px-2 text-sm";
const money = (n?: number | null) => (n == null ? "—" : Number(n).toLocaleString("fr-CA", { style: "currency", currency: "CAD" }));
const num = (n?: number | null) => (n == null ? "—" : Number(n).toLocaleString("fr-CA", { maximumFractionDigits: 4 }));
const MS: Record<P.Milestone["status"], string> = { prevu: "Prévu", realise: "Réalisé (non facturé)", facture: "Facturé", archive: "Archivé" };
const AS: Record<P.Amendment["status"], string> = { brouillon: "Brouillon (sans effet)", approuve: "Approuvé", abandonne: "Abandonné", rejete: "Rejeté" };
const TAX: Record<string, string> = { taxable: "Taxable", detaxe: "Détaxé (0 %)", exonere: "Exonéré" };

type Pending = { label: string; run: () => Promise<unknown>; after?: (r: unknown) => void };
type QtyRow = { id: string; qty: string };
type NewRow = { desc: string; unit: string; qty: string; price: string; tax: string };
type AmForm = { reason: string; qtys: QtyRow[]; news: NewRow[]; ref: string; refDate: string; approver: string };
const emptyAm = (): AmForm => ({ reason: "", qtys: [], news: [], ref: "", refDate: todayIn(), approver: "" });

export default function ProgressB2({ sum, canWrite, hasDraft, reload, onChanged }: {
  sum: P.Summary; canWrite: boolean; hasDraft: boolean; reload: () => Promise<void> | void; onChanged: () => void;
}) {
  const track: P.Track = sum.track ?? "global";
  const version = sum.contract_version ?? 1;
  const issued = sum.situations.some((s) => s.status === "emise");
  const cap = sum.cap;
  const capTotal = cap ? Number(cap.t) + Number(cap.z) + Number(cap.e) : null;
  const billedCap = cap ? Number(cap.billed_t) + Number(cap.billed_z) + Number(cap.billed_e) : null;
  const [busy, setBusy] = useState(false);
  const [pend, setPend] = useState<Pending | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [trackSel, setTrackSel] = useState<P.Track>(track);
  const [ms, setMs] = useState({ title: "", ord: "", due: "", share: "" });
  const [am, setAm] = useState<AmForm>(emptyAm());
  const [amDraft, setAmDraft] = useState<{ key: string; rev: number | null } | null>(null);
  const [confirm, setConfirm] = useState<Record<string, boolean>>({});
  const [closeReason, setCloseReason] = useState("");
  const [amDirty, setAmDirty] = useState(false); // brouillon repris modifié et non enregistré
  const locked = busy || !!pend;
  // Contexte : dossier, entreprise, droits. Toute réponse d'un ancien contexte (ou après démontage) est ignorée.
  const ctx = useRef(0);
  useEffect(() => {
    ctx.current++;
    setPend(null); setBusy(false); setMsg(null); setConfirm({});
    return () => { ctx.current++; };
  }, [sum.id, sum.company_id, canWrite]);
  const ckey = (a: P.Amendment) => `${a.id}:${a.rev}:${a.hash}`;
  const editingThis = (a: P.Amendment) => !!amDraft && amDraft.key === a.draft_key && amDirty;
  const canApprove = (a: P.Amendment) => canWrite && !locked && !hasDraft && !!confirm[ckey(a)] && !editingThis(a);

  const exec = async (p: Pending) => {
    if (busy) return;
    const c = ctx.current;
    setPend(p); setBusy(true); setMsg(null);
    try {
      const r = await p.run();
      if (c !== ctx.current) return false; // action enregistrée au serveur, mais l'écran a changé : aucune retombée
      setPend(null);
      p.after?.(r);
      onChanged();
      await reload();
      return true;
    } catch (e) {
      if (c !== ctx.current) return false;
      const x = e as Error & { code?: string };
      if (x.code === "P0409") { setPend(null); setMsg(`${x.message} Rien n'a été appliqué automatiquement : vérifiez l'état rechargé.`); void reload(); }
      else if (/réseau|network|fetch|failed/i.test(x.message)) setMsg(`${x.message} Réessayez : la même demande sera renvoyée.`);
      else { setPend(null); setMsg(x.message); }
      return false;
    } finally { if (c === ctx.current) setBusy(false); }
  };

  const ms_ = sum.milestones ?? [];
  const ams = sum.amendments ?? [];
  const draftAm = ams.find((a) => a.status === "brouillon") ?? null;

  const addMilestone = () => {
    const share = P.parseCumul(ms.share); const ord = Number(ms.ord);
    if (!ms.title.trim() || !share || !Number.isInteger(ord) || ord < 1) { setMsg("Titre, ordre (entier ≥ 1) et part positive (2 décimales au plus) requis."); return; }
    const key = P.newKey(); const body = { plan: sum.id, id: null, key, title: ms.title.trim(), ord, due: ms.due || null, share, baseRev: null };
    void exec({ label: `Ajout du jalon « ${body.title} »`, run: () => P.milestoneSave(body) }).then((ok) => ok && setMs({ title: "", ord: "", due: "", share: "" }));
  };
  const saveAm = () => {
    const changes: unknown[] = [];
    for (const r of am.qtys) { const q = P.parseQty(r.qty); if (!r.id || q == null) { setMsg("Quantité contractuelle invalide (fr-CA, 4 décimales au plus)."); return; } changes.push({ id: r.id, qty: q }); }
    for (const r of am.news) {
      const q = P.parseQty(r.qty); const pr = P.parseQty(r.price);
      if (!r.desc.trim() || !q || !pr || !r.tax) { setMsg("Nouvelle ligne : description, quantité, prix et traitement fiscal requis."); return; }
      changes.push({ desc: r.desc.trim(), unit: r.unit.trim(), qty: q, price: pr, tax: r.tax });
    }
    if (!am.reason.trim() || !changes.length) { setMsg("Motif et au moins une ligne modifiée ou ajoutée requis."); return; }
    const d = amDraft ?? { key: P.newKey(), rev: null };
    const body = { plan: sum.id, key: d.key, reason: am.reason, changes, ref: am.ref, refDate: am.refDate || null, approver: am.approver, refQuote: null, baseRev: d.rev };
    setAmDraft(d);
    void exec({ label: "Enregistrement de l'avenant", run: () => P.amendSave(body),
      after: (a) => { setAmDraft({ key: d.key, rev: (a as P.Amendment).rev }); setAmDirty(false); setConfirm({}); } });
  };
  const resumeAm = (a: P.Amendment) => {
    const ch = (a.changes ?? []) as Record<string, string>[];
    setAm({ reason: a.reason, qtys: ch.filter((c) => c.id).map((c) => ({ id: c.id, qty: String(c.qty).replace(".", ",") })),
      news: ch.filter((c) => !c.id).map((c) => ({ desc: c.desc, unit: c.unit ?? "", qty: String(c.qty).replace(".", ","), price: String(c.price).replace(".", ","), tax: c.tax })),
      ref: a.approval_ref ?? "", refDate: a.approval_date ?? todayIn(), approver: a.approver_name ?? "" });
    setAmDraft({ key: a.draft_key, rev: a.rev }); setAmDirty(false);
  };
  const editAm = (p: Partial<AmForm>) => {
    if (locked) return;
    setAm((f) => ({ ...f, ...p }));
    if (amDraft) { setAmDirty(true); setConfirm({}); } // toute édition invalide la confirmation jusqu'à un nouvel impact enregistré
  };
  const approve = (a: P.Amendment) => {
    if (!canApprove(a)) return; // garde aussi dans le gestionnaire
    const k = P.newKey(); const id = a.id, rev = a.rev, hash = a.hash;
    void exec({ label: `Approbation de l'avenant ${a.seq}`, run: () => P.amendApprove(id, k, rev, hash) });
  };

  return (
    <div className="space-y-3 text-sm">
      <section className="space-y-1 rounded border border-border p-2" aria-label="Suivi du dossier">
        <p><span className="font-semibold">Suivi :</span> {P.TRACK_LABEL[track]} · contrat v{version}
          {capTotal != null && <> · plafond {money(capTotal)} {sum.contract && (sum.contract as unknown as { prices_include_tax?: boolean }).prices_include_tax ? "TTC" : "HT"} · déjà facturé {money(billedCap)}</>}</p>
        {canWrite && !issued && !hasDraft ? (
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Choix du suivi" className={sel} value={trackSel} disabled={locked} onChange={(e) => setTrackSel(e.target.value as P.Track)}>
              {(Object.keys(P.TRACK_LABEL) as P.Track[]).map((t) => <option key={t} value={t}>{P.TRACK_LABEL[t]}</option>)}
            </select>
            <Button size="sm" variant="outline" disabled={locked || trackSel === track} onClick={() => void exec({ label: "Choix du suivi", run: () => P.setTrack(sum.id, trackSel, version) })}>Appliquer</Button>
            <span className="text-xs text-muted-foreground">Choix possible tant qu'aucune facture n'est émise et qu'aucun brouillon n'est actif.</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Suivi verrouillé {issued ? "après la première facture" : hasDraft ? "pendant un brouillon de situation" : "(lecture seule)"} : les cumuls déjà facturés ne sont jamais convertis vers un autre suivi.</p>
        )}
      </section>

      {track === "lines" && sum.lines && (
        <section aria-label="Lignes du contrat" className="overflow-x-auto rounded border border-border p-2">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground"><th>Ligne</th><th>Contrat</th><th>Déjà facturé</th><th>Restant</th><th>Montant contrat</th><th>Facturé</th></tr></thead>
            <tbody>{sum.lines.map((l) => (
              <tr key={l.id}><td>{l.id} · {l.desc} ({TAX[l.tax] ?? l.tax})</td><td>{num(l.qty)} {l.unit ?? ""}</td><td>{num(l.billed_qty)}</td><td>{num(Number(l.qty) - Number(l.billed_qty))}</td><td>{money(l.amount)}</td><td>{money(l.billed_amt)}</td></tr>
            ))}</tbody>
          </table>
        </section>
      )}

      {track === "milestones" && (
        <section aria-label="Jalons" className="space-y-2 rounded border border-border p-2">
          <p className="font-semibold">Jalons</p>
          <p className="text-xs text-muted-foreground">Alloué {money(cap?.allocated)} sur {money(capTotal)} · non alloué {money(capTotal != null && cap ? capTotal - Number(cap.allocated) : null)}. Les dates sont indicatives : aucune facture n'est émise automatiquement; déclarer un jalon réalisé n'émet rien.</p>
          {ms_.length > 0 && <ul className="divide-y divide-border">{ms_.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
              <span>{m.ord}. {m.title} · {money(m.share)}{m.due_hint ? ` · prévu le ${fmtDate(m.due_hint)}` : ""} · {MS[m.status]}{m.done_at ? ` le ${fmtDate(m.done_at.slice(0, 10))}` : ""}</span>
              {canWrite && m.status === "prevu" && <span className="flex gap-1">
                <Button size="sm" variant="outline" disabled={locked} onClick={() => void exec({ label: `Réalisation du jalon ${m.ord}`, run: () => P.milestoneSet(m.id, "realise", m.rev) })}>Déclarer réalisé</Button>
                <Button size="sm" variant="ghost" disabled={locked} onClick={() => void exec({ label: `Archivage du jalon ${m.ord}`, run: () => P.milestoneSet(m.id, "archive", m.rev) })}>Archiver</Button>
              </span>}
            </li>))}</ul>}
          {canWrite && (
            <fieldset disabled={locked} className="grid gap-2 sm:grid-cols-5">
              <Input aria-label="Titre du jalon" placeholder="Titre" value={ms.title} onChange={(e) => setMs({ ...ms, title: e.target.value })} />
              <Input aria-label="Ordre du jalon" inputMode="numeric" placeholder="Ordre" value={ms.ord} onChange={(e) => setMs({ ...ms, ord: e.target.value })} />
              <Input aria-label="Date indicative" type="date" value={ms.due} onChange={(e) => setMs({ ...ms, due: e.target.value })} />
              <Input aria-label="Part contractuelle" inputMode="decimal" placeholder="Part (ex. 300,00)" value={ms.share} onChange={(e) => setMs({ ...ms, share: e.target.value })} />
              <Button variant="outline" onClick={addMilestone}>Ajouter le jalon</Button>
            </fieldset>
          )}
        </section>
      )}

      <section aria-label="Avenants" className="space-y-2 rounded border border-border p-2">
        <p className="font-semibold">Avenants</p>
        <p className="text-xs text-muted-foreground">Contrat initial {money(sum.initial?.total)} TTC · contrat en vigueur (v{version}) {money(sum.contract.total)} TTC. Seul un avenant approuvé modifie le plafond; un brouillon, un avenant rejeté ou abandonné n'a aucun effet. Les factures déjà émises ne changent jamais.</p>
        {ams.length > 0 && <ul className="divide-y divide-border">{ams.map((a) => (
          <li key={a.id} className="space-y-1 py-1">
            <p>Avenant {a.seq} · {AS[a.status]} · {a.reason} · plafond {money(a.impact?.cap_before)} → {money(a.impact?.cap_after)} (écart {money(a.impact?.delta?.cap)}){a.to_version ? ` · contrat v${a.to_version}` : ""}</p>
            <ul className="pl-3 text-xs text-muted-foreground">{(a.impact?.changes ?? []).map((c) => (
              <li key={c.id}>{c.new ? "Nouvelle ligne" : "Ligne"} {c.id} · {c.desc} : quantité {num(c.qty_before)} → {num(c.qty_after)} · {money(c.amount_before)} → {money(c.amount_after)}</li>))}</ul>
            <p className="text-xs">Accord déclaré : {a.approval_ref ?? "—"} · {a.approval_date ? fmtDate(a.approval_date) : "—"} · {a.approver_name ?? "—"} (déclaration manuelle, pas une signature électronique vérifiée){a.close_reason ? ` · motif : ${a.close_reason}` : ""}</p>
            {canWrite && a.status === "brouillon" && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" disabled={locked} onClick={() => resumeAm(a)}>Reprendre</Button>
                <Button size="sm" variant="outline" disabled={locked || editingThis(a)} onClick={() => {
                  if (editingThis(a)) return;
                  const body = { plan: sum.id, key: a.draft_key, reason: a.reason, changes: (a.changes ?? []) as unknown[], ref: a.approval_ref ?? "", refDate: a.approval_date ?? null,
                    approver: a.approver_name ?? "", refQuote: (a as unknown as { ref_quote_id?: string | null }).ref_quote_id ?? null, baseRev: a.rev };
                  void exec({ label: `Actualisation de l'impact de l'avenant ${a.seq}`, run: () => P.amendSave(body), after: (r) => { if (amDraft?.key === a.draft_key) setAmDraft({ key: a.draft_key, rev: (r as P.Amendment).rev }); } });
                }}>Actualiser l'impact</Button>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={locked || editingThis(a)} checked={!!confirm[ckey(a)]} onChange={(e) => setConfirm({ [ckey(a)]: e.target.checked })} />
                  Je confirme l'accord du client tel que déclaré</label>
                <Button size="sm" disabled={!canApprove(a)} onClick={() => approve(a)}>Approuver</Button>
                {editingThis(a) && <span className="text-xs text-destructive">Brouillon modifié : enregistrez-le pour recalculer l'impact avant d'approuver.</span>}
                <Input aria-label="Motif de clôture" className="h-9 w-48" placeholder="Motif (rejet/abandon)" value={closeReason} disabled={locked} onChange={(e) => setCloseReason(e.target.value)} />
                {(["rejete", "abandonne"] as const).map((st) => (
                  <Button key={st} size="sm" variant="ghost" disabled={locked || !closeReason.trim()} onClick={() => { const k = P.newKey(); const r = closeReason.trim(); void exec({ label: "Clôture de l'avenant", run: () => P.amendClose(a.id, k, st, r, a.rev, a.hash) }); }}>{st === "rejete" ? "Rejeter" : "Abandonner"}</Button>
                ))}
                {hasDraft && <span className="text-xs text-destructive">Un brouillon de situation est actif : reprenez-le pour l'émettre ou abandonnez-le avant d'approuver.</span>}
              </div>
            )}
          </li>))}</ul>}
        {canWrite && (!draftAm || amDraft) && (
          <fieldset disabled={locked} className="space-y-2" aria-label="Brouillon d'avenant">
            <Input aria-label="Motif de l'avenant" placeholder="Motif de l'avenant" value={am.reason} onChange={(e) => editAm({ reason: e.target.value })} />
            {am.qtys.map((r, i) => (
              <div key={`q${i}`} className="grid gap-2 sm:grid-cols-3">
                <select aria-label="Ligne modifiée" className={sel} value={r.id} onChange={(e) => editAm({ qtys: am.qtys.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)) })}>
                  <option value="">Ligne…</option>{(sum.lines ?? []).map((l) => <option key={l.id} value={l.id}>{l.id} · {l.desc} ({num(l.qty)} {l.unit ?? ""})</option>)}
                </select>
                <Input aria-label="Nouvelle quantité contractuelle" inputMode="decimal" placeholder="Nouvelle quantité" value={r.qty} onChange={(e) => editAm({ qtys: am.qtys.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) })} />
                <Button variant="ghost" onClick={() => editAm({ qtys: am.qtys.filter((_, j) => j !== i) })}>Retirer</Button>
              </div>))}
            {am.news.map((r, i) => (
              <div key={`n${i}`} className="grid gap-2 sm:grid-cols-6">
                <Input aria-label="Description" placeholder="Description" value={r.desc} onChange={(e) => editAm({ news: am.news.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)) })} />
                <Input aria-label="Unité" placeholder="Unité" value={r.unit} onChange={(e) => editAm({ news: am.news.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)) })} />
                <Input aria-label="Quantité" inputMode="decimal" placeholder="Qté" value={r.qty} onChange={(e) => editAm({ news: am.news.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)) })} />
                <Input aria-label="Prix unitaire" inputMode="decimal" placeholder="Prix" value={r.price} onChange={(e) => editAm({ news: am.news.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)) })} />
                <select aria-label="Traitement fiscal" className={sel} value={r.tax} onChange={(e) => editAm({ news: am.news.map((x, j) => (j === i ? { ...x, tax: e.target.value } : x)) })}>
                  <option value="">Taxes…</option>{Object.entries(TAX).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <Button variant="ghost" onClick={() => editAm({ news: am.news.filter((_, j) => j !== i) })}>Retirer</Button>
              </div>))}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => editAm({ qtys: [...am.qtys, { id: "", qty: "" }] })}>+ Modifier une quantité</Button>
              <Button size="sm" variant="outline" onClick={() => editAm({ news: [...am.news, { desc: "", unit: "", qty: "", price: "", tax: "" }] })}>+ Nouvelle ligne</Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input aria-label="Preuve ou référence d'approbation" placeholder="Preuve / référence d'approbation" value={am.ref} onChange={(e) => editAm({ ref: e.target.value })} />
              <Input aria-label="Date de l'accord" type="date" value={am.refDate} onChange={(e) => editAm({ refDate: e.target.value })} />
              <Input aria-label="Personne ayant donné l'accord" placeholder="Personne ayant donné l'accord" value={am.approver} onChange={(e) => editAm({ approver: e.target.value })} />
            </div>
            <Button size="sm" onClick={saveAm}>Enregistrer le brouillon (aperçu de l'impact)</Button>
          </fieldset>
        )}
      </section>

      {(sum.versions?.length ?? 0) > 1 && (
        <p className="text-xs text-muted-foreground">Versions du contrat : {sum.versions!.map((v) => `v${v.version} ${money(v.contract.total)} (${fmtDate(v.created_at.slice(0, 10))})`).join(" · ")}</p>
      )}
      {msg && <p role="alert" className="rounded border border-destructive/50 bg-destructive/10 p-2">{msg}</p>}
      {pend && !busy && <Button size="sm" onClick={() => void exec(pend)}>Réessayer : {pend.label}</Button>}
    </div>
  );
}

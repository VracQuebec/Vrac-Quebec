// ASSUR-01 — tableau de bord et liste des polices. Lecture sous RLS (asr_can_read).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Search, ShieldCheck, Phone } from "lucide-react";
import { daysBetween, money, policyStatus, POLICY_STATUS, STAGES, torontoToday } from "@/lib/insurance/compare";

const db = supabase as any;

export function currentPeriod(periods: any[], today = torontoToday()) {
  const ps = [...periods].sort((a, b) => (a.effective_from ?? "").localeCompare(b.effective_from ?? ""));
  return ps.filter((p) => !p.effective_from || p.effective_from <= today).pop() ?? ps[0] ?? null;
}

export default function InsuranceBoard({ companyId, canWrite }: { companyId: string; canWrite: boolean }) {
  const today = torontoToday();
  const [rows, setRows] = useState<any[] | null>(null);
  const [cats, setCats] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [q, setQ] = useState(""); const [fCat, setFCat] = useState(""); const [fIns, setFIns] = useState(""); const [fResp, setFResp] = useState(""); const [fStat, setFStat] = useState(""); const [fDue, setFDue] = useState("");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [pol, per, ren, docs, quotes, cov, as, c, m] = await Promise.all([
      db.from("asr_policies").select("*").eq("company_id", companyId).is("archived_at", null),
      db.from("asr_periods").select("*").eq("company_id", companyId),
      db.from("asr_renewals").select("id,period_id,stage,closed_at").eq("company_id", companyId),
      db.from("asr_documents").select("id,policy_id,doc_type,title").eq("company_id", companyId).is("archived_at", null),
      db.from("asr_quotes").select("id,renewal_id").eq("company_id", companyId).is("archived_at", null),
      db.from("asr_coverages").select("period_id,label,exclusions").eq("company_id", companyId).is("archived_at", null),
      db.from("asr_assets").select("period_id,asset_label,trucks(name,unit_number,plate)").eq("company_id", companyId).is("archived_at", null),
      db.from("asr_categories").select("*").is("archived_at", null).order("sort"),
      db.from("jsc_company_members").select("user_id,full_name,email").eq("company_id", companyId).eq("is_active", true).is("archived_at", null),
    ]);
    if (pol.error) { setErr(pol.error.message); return; }
    setErr(null); setCats((c.data ?? []).filter((x: any) => !x.company_id || x.company_id === companyId)); setMembers((m.data ?? []).filter((x: any) => x.user_id));
    setRows((pol.data ?? []).map((p: any) => {
      const periods = (per.data ?? []).filter((x: any) => x.policy_id === p.id);
      const cur = currentPeriod(periods, today);
      const renewal = cur && (ren.data ?? []).find((r: any) => r.period_id === cur.id);
      const pdocs = (docs.data ?? []).filter((d: any) => d.policy_id === p.id);
      const pids = periods.map((x: any) => x.id);
      const text = [p.title, p.insurer, p.policy_number, ...pdocs.map((d: any) => d.title),
        ...(cov.data ?? []).filter((x: any) => pids.includes(x.period_id)).map((x: any) => x.label),
        ...(as.data ?? []).filter((x: any) => pids.includes(x.period_id)).map((x: any) => [x.asset_label, x.trucks?.name, x.trucks?.unit_number, x.trucks?.plate].join(" "))].join(" ").toLowerCase();
      return { ...p, cur, renewal, docs: pdocs, quotes: renewal ? (quotes.data ?? []).filter((x: any) => x.renewal_id === renewal.id).length : 0, text };
    }));
  }, [companyId, today]);
  useEffect(() => { load(); }, [load]);

  const list = useMemo(() => (rows ?? []).filter((r) => {
    const st = policyStatus(r.cur ?? {}, today);
    if (q && !r.text.includes(q.toLowerCase())) return false;
    if (fCat && r.category_id !== fCat) return false;
    if (fIns && r.insurer !== fIns) return false;
    if (fResp && r.responsible_user !== fResp) return false;
    if (fStat && st !== fStat) return false;
    if (fDue && !(r.cur?.expires_on && daysBetween(today, r.cur.expires_on) <= Number(fDue))) return false;
    return true;
  }).sort((a, b) => (a.cur?.expires_on ?? "9999").localeCompare(b.cur?.expires_on ?? "9999")), [rows, q, fCat, fIns, fResp, fStat, fDue, today]);

  const k = useMemo(() => {
    const r = rows ?? [];
    const upcoming = r.filter((x) => x.cur?.expires_on && x.cur.expires_on >= today && daysBetween(today, x.cur.expires_on) <= 90);
    const byCur: Record<string, number> = {};
    r.forEach((x) => { if (x.cur?.total != null) byCur[x.cur.currency] = (byCur[x.cur.currency] ?? 0) + Number(x.cur.total); });
    return {
      n: r.length, upcoming: upcoming.length,
      toPrep: r.filter((x) => x.renewal && !x.renewal.closed_at).length,
      noDoc: r.filter((x) => !x.docs.some((d: any) => ["police", "certificat"].includes(d.doc_type))).length,
      quotes: r.reduce((s, x) => s + x.quotes, 0),
      unknownCost: r.filter((x) => x.cur && x.cur.total == null).length, byCur,
    };
  }, [rows, today]);
  const name = (u?: string | null) => members.find((m) => m.user_id === u)?.full_name || members.find((m) => m.user_id === u)?.email || "Non attribué";
  const insurers = [...new Set((rows ?? []).map((r) => r.insurer).filter(Boolean))];

  if (err) return <p className="text-sm text-destructive">{err}</p>;
  if (!rows) return <p className="text-muted-foreground">Chargement…</p>;
  return (
    <div className="space-y-5">
      <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Ces fiches résument les renseignements que vous avez enregistrés. Vrac Québec ne certifie aucune couverture : seuls vos contrats et votre représentant en assurance font foi.
      </p>
      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[["Polices enregistrées", k.n], ["Échéances ≤ 3 mois", k.upcoming], ["Renouvellements en cours", k.toPrep], ["Sans police ni certificat joint", k.noDoc], ["Soumissions reçues", k.quotes],
          ["Coûts déclarés", Object.entries(k.byCur).map(([c, v]) => money(v, c)).join(" · ") || "—"]].map(([l, v]) => (
          <div key={l as string} className="rounded-md border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 break-words text-lg font-semibold">{v}</p></div>
        ))}
      </section>
      {k.unknownCost > 0 && <p className="text-xs text-muted-foreground">{k.unknownCost} police(s) au coût inconnu, non comptée(s) dans le total.</p>}

      <section className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1 basis-full sm:basis-64"><Search className="absolute left-2 top-3 h-4 w-4 text-muted-foreground" />
            <Input aria-label="Rechercher" className="pl-8" placeholder="Titre, assureur, numéro, bien, garantie…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {[["Catégorie", fCat, setFCat, cats.map((c) => [c.id, c.label])], ["Assureur", fIns, setFIns, insurers.map((i) => [i, i])], ["Responsable", fResp, setFResp, members.map((m) => [m.user_id, m.full_name || m.email])],
            ["Statut", fStat, setFStat, Object.entries(POLICY_STATUS).map(([v, s]) => [v, s.label])], ["Échéance", fDue, setFDue, [["30", "≤ 30 jours"], ["90", "≤ 3 mois"], ["180", "≤ 6 mois"]]]].map(([l, v, set, opts]: any) => (
            <select key={l} aria-label={l} className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm sm:flex-none" value={v} onChange={(e) => set(e.target.value)}>
              <option value="">{l} : toutes</option>{opts.map(([a, b]: any) => <option key={a} value={a}>{b}</option>)}
            </select>))}
          {canWrite && <Button onClick={() => setAdding(true)} className="w-full sm:w-auto"><Plus className="mr-1 h-4 w-4" />Ajouter une police</Button>}
        </div>
        {!list.length ? <p className="text-sm text-muted-foreground">Aucune police{rows.length ? " pour ces filtres" : " enregistrée pour l’instant"}.</p> : (
          <ul className="space-y-2">{list.map((r) => {
            const st = POLICY_STATUS[policyStatus(r.cur ?? {}, today)];
            const left = r.cur?.expires_on ? daysBetween(today, r.cur.expires_on) : null;
            return (
              <li key={r.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <ShieldCheck className="hidden h-5 w-5 shrink-0 text-primary sm:block" />
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-medium">{r.title}</p>
                    <p className="break-words text-xs text-muted-foreground">{cats.find((c) => c.id === r.category_id)?.label ?? "Sans catégorie"} · {r.insurer || "Assureur non renseigné"} · N° {r.policy_number || "non renseigné"}</p>
                    <p className="text-xs text-muted-foreground">Échéance : {r.cur?.expires_on ?? "non renseignée"}{left != null && ` (${left >= 0 ? `${left} j restants` : `${-left} j dépassés`})`} · Responsable : {name(r.responsible_user)}</p>
                    <div className="mt-1 flex flex-wrap gap-1 text-xs">
                      <span className={`rounded px-2 py-0.5 ${st.cls}`} aria-label={st.label}>{st.icon} {st.label}</span>
                      {r.renewal && <span className="rounded border border-border px-2 py-0.5">Renouvellement : {STAGES[r.renewal.stage]}</span>}
                      {r.cur?.suspended_reason && <span className="rounded border border-border px-2 py-0.5">⏸ Rappels suspendus</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" asChild><Link to={`/entrepreneur/assurances/${r.id}`}>Ouvrir</Link></Button>
                    <Button size="sm" variant="outline" asChild><Link to={`/entrepreneur/assurances/${r.id}?onglet=documents`}>Documents</Link></Button>
                    {canWrite && <Button size="sm" variant="outline" asChild><Link to={`/entrepreneur/assurances/${r.id}?onglet=renouvellement`}>Renouvellement et soumissions</Link></Button>}
                    {r.broker_phone && <Button size="sm" variant="ghost" asChild><a href={`tel:${r.broker_phone}`}><Phone className="mr-1 h-4 w-4" />Courtier</a></Button>}
                  </div>
                </div>
              </li>);
          })}</ul>)}
      </section>
      <AddPolicy open={adding} onClose={() => setAdding(false)} companyId={companyId} cats={cats} members={members} onDone={load} />
    </div>
  );
}

function AddPolicy({ open, onClose, companyId, cats, members, onDone }: any) {
  const blank = { title: "", category_id: "", insurer: "", policy_number: "", responsible_user: "", effective_from: "", expires_on: "" };
  const [f, setF] = useState(blank); const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.title.trim()) return toast({ title: "Intitulé requis", variant: "destructive" });
    setBusy(true);
    const { data: p, error } = await db.from("asr_policies").insert({ company_id: companyId, title: f.title.trim(), category_id: f.category_id || null, insurer: f.insurer || null, policy_number: f.policy_number || null, responsible_user: f.responsible_user || null }).select("id").single();
    if (!error) {
      const r = await db.from("asr_periods").insert({ policy_id: p.id, company_id: companyId, effective_from: f.effective_from || null, expires_on: f.expires_on || null });
      if (r.error) toast({ title: "Période refusée", description: r.error.message, variant: "destructive" });
    }
    setBusy(false);
    if (error) return toast({ title: "Refusé", description: error.message, variant: "destructive" });
    toast({ title: "Police ajoutée", description: "Complétez la fiche : garanties, coûts, documents." }); setF(blank); onClose(); onDone();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Ajouter une police</DialogTitle></DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs sm:col-span-2">Intitulé<Input className="mt-1" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="text-xs">Catégorie<select className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2 text-sm" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">—</option>{cats.map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
          <label className="text-xs">Responsable interne<select className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2 text-sm" value={f.responsible_user} onChange={(e) => setF({ ...f, responsible_user: e.target.value })}><option value="">—</option>{members.map((m: any) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}</select></label>
          <label className="text-xs">Assureur<Input className="mt-1" value={f.insurer} onChange={(e) => setF({ ...f, insurer: e.target.value })} /></label>
          <label className="text-xs">Numéro de police<Input className="mt-1" value={f.policy_number} onChange={(e) => setF({ ...f, policy_number: e.target.value })} /></label>
          <label className="text-xs">Prise d’effet<Input type="date" className="mt-1" value={f.effective_from} onChange={(e) => setF({ ...f, effective_from: e.target.value })} /></label>
          <label className="text-xs">Échéance<Input type="date" className="mt-1" value={f.expires_on} onChange={(e) => setF({ ...f, expires_on: e.target.value })} /></label>
        </div>
        <p className="text-xs text-muted-foreground">Les catégories servent au classement : aucune protection n’est présumée incluse.</p>
        <Button onClick={save} disabled={busy}>{busy ? "Enregistrement…" : "Enregistrer"}</Button>
      </DialogContent>
    </Dialog>
  );
}

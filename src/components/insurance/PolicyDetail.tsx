// ASSUR-01 — fiche de police : période, coûts, garanties, biens, documents, renouvellement, soumissions, questions, historique.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Phone, Mail, Eye, Download, Upload, Printer } from "lucide-react";
import { currentPeriod } from "./InsuranceBoard";
import { annualized, comparable, CONTINUITY, COV_STATE, daysBetween, diff, DOC_TYPES, flags, lowestComparable, money, OCC_LABEL, policyStatus, POLICY_STATUS, STAGES, torontoToday } from "@/lib/insurance/compare";

const db = supabase as any;
const BUCKET = "asr-files";
const MAX = 100 * 1048576;
const MIME: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const sel = "mt-1 h-10 w-full rounded-md border border-border bg-background px-2 text-sm";
const num = (v: any) => (v === "" || v == null ? null : Number(v));
const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const CHECK = ["Activités", "Chiffre d’affaires demandé par le courtier", "Nouveaux véhicules ou équipements", "Valeurs déclarées", "Lieux", "Territoires", "Sinistres", "Besoins à revoir"];

function printDoc(title: string, html: string) {
  const w = window.open("", "_blank"); if (!w) return;
  w.document.write(`<html><head><title>${esc(title)}</title><style>body{font-family:sans-serif;padding:24px;font-size:13px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px;text-align:left;vertical-align:top}h1{font-size:18px}.n{color:#a00;font-weight:bold}</style></head><body>${html}<script>print()</script></body></html>`);
  w.document.close();
}

export default function PolicyDetail({ companyId, policyId, canWrite, tab }: { companyId: string; policyId: string; canWrite: boolean; tab?: string }) {
  const today = torontoToday();
  const [d, setD] = useState<any>(null);
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<any>(null);

  const load = useCallback(async () => {
    const [pol, per, cov, as, docs, ren, q, ev, del, trucks, cats, m] = await Promise.all([
      db.from("asr_policies").select("*").eq("id", policyId).maybeSingle(),
      db.from("asr_periods").select("*").eq("company_id", companyId),
      db.from("asr_coverages").select("*").eq("company_id", companyId).is("archived_at", null).order("created_at"),
      db.from("asr_assets").select("*, trucks(name,unit_number,plate,category)").eq("company_id", companyId).is("archived_at", null),
      db.from("asr_documents").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      db.from("asr_renewals").select("*").eq("company_id", companyId),
      db.from("asr_questions").select("*").eq("policy_id", policyId).order("created_at", { ascending: false }),
      db.from("asr_events").select("*").eq("company_id", companyId).order("at", { ascending: false }).limit(300),
      db.from("asr_deliveries").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(200),
      db.from("trucks").select("id,name,unit_number,plate,category").eq("company_id", companyId).is("archived_at", null).order("name"),
      db.from("asr_categories").select("*").is("archived_at", null).order("sort"),
      db.from("jsc_company_members").select("user_id,full_name,email").eq("company_id", companyId).eq("is_active", true).is("archived_at", null),
    ]);
    if (!pol.data) { setD({ missing: true }); return; }
    // Une période de remplacement peut appartenir à une autre police : on suit la chaîne previous_id.
    const all = per.data ?? [];
    const mine = all.filter((p: any) => p.policy_id === policyId);
    const ids = new Set(mine.map((p: any) => p.id));
    const periods = mine.sort((a: any, b: any) => (b.effective_from ?? "").localeCompare(a.effective_from ?? ""));
    const quotes = ren.data?.length ? (await db.from("asr_quotes").select("*").in("renewal_id", ren.data.map((r: any) => r.id)).is("archived_at", null)).data ?? [] : [];
    const conts: Record<string, string> = {};
    await Promise.all(periods.map(async (p: any) => { const { data } = await db.rpc("asr_continuity", { _period: p.id }); conts[p.id] = data; }));
    setD({ pol: pol.data, periods, all, cov: cov.data ?? [], assets: as.data ?? [], docs: (docs.data ?? []).filter((x: any) => x.policy_id === policyId), renewals: ren.data ?? [], quotes,
      questions: q.data ?? [], events: (ev.data ?? []).filter((e: any) => e.entity_id === policyId || ids.has(e.entity_id) || (e.detail && ids.has(e.detail?.period_id?.apres ?? e.detail?.period_id))), deliveries: (del.data ?? []).filter((x: any) => ids.has(x.period_id)),
      trucks: trucks.data ?? [], cats: cats.data ?? [], members: (m.data ?? []).filter((x: any) => x.user_id), conts });
    setPeriodId((cur) => (cur && ids.has(cur) ? cur : currentPeriod(periods, today)?.id ?? null));
  }, [companyId, policyId, today]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <p className="text-muted-foreground">Chargement…</p>;
  if (d.missing) return <p className="text-muted-foreground">Police introuvable ou accès refusé.</p>;
  const { pol } = d;
  const period = d.periods.find((p: any) => p.id === periodId) ?? null;
  const renewal = period && d.renewals.find((r: any) => r.period_id === period.id);
  const name = (u?: string | null) => d.members.find((m: any) => m.user_id === u)?.full_name || d.members.find((m: any) => m.user_id === u)?.email || "—";
  const st = POLICY_STATUS[policyStatus(period ?? {}, today)];

  const run = async (p: Promise<any>, ok: string) => { const { error } = await p; if (error) { toast({ title: "Refusé", description: error.message, variant: "destructive" }); return false; } toast({ title: ok }); await load(); return true; };
  const openDoc = async (doc: any, download = false) => {
    const { data, error } = await supabase.storage.from(BUCKET).download(doc.storage_path);
    if (error || !data) return toast({ title: "Accès refusé", description: error?.message, variant: "destructive" });
    const url = URL.createObjectURL(new Blob([data], { type: doc.mime_type }));
    if (download) { const a = document.createElement("a"); a.href = url; a.download = doc.file_name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000); }
    else setViewer({ doc, url });
  };
  const exportSummary = () => {
    const cov = d.cov.filter((c: any) => c.period_id === period?.id);
    printDoc("Résumé " + pol.title, `<h1>Résumé des renseignements enregistrés — ${esc(pol.title)}</h1>
      <p class="n">Ce document n’est pas une attestation d’assurance. Il résume les renseignements saisis dans Vrac Québec par l’entreprise. Seuls le contrat et l’assureur font foi.</p>
      <table><tr><th>Assureur</th><td>${esc(pol.insurer || "Non renseigné")}</td><th>N° de police</th><td>${esc(pol.policy_number || "Non renseigné")}</td></tr>
      <tr><th>Assurés désignés</th><td>${esc(pol.named_insureds || "Non renseigné")}</td><th>Courtier</th><td>${esc([pol.broker_name, pol.broker_phone, pol.broker_email].filter(Boolean).join(" · ") || "Non renseigné")}</td></tr>
      <tr><th>Période</th><td>${esc(period?.effective_from || "?")} ${esc(period?.effective_time || "")} → ${esc(period?.expires_on || "?")} ${esc(period?.expires_time || "(heure non renseignée)")}</td><th>Réclamations</th><td>${esc(pol.claims_contact || "Non renseigné")}</td></tr>
      <tr><th>Coût total</th><td>${esc(money(period?.total, period?.currency))}</td><th>Imprimé le</th><td>${new Date().toLocaleString("fr-CA", { timeZone: "America/Toronto" })}</td></tr></table>
      <h2>Garanties enregistrées</h2><table><tr><th>Garantie</th><th>État</th><th>Limite</th><th>Franchise</th><th>Exclusions</th><th>Source</th></tr>
      ${cov.map((c: any) => `<tr><td>${esc(c.label)}</td><td>${COV_STATE[c.state]}</td><td>${esc(c.limit_text || (c.limit_amount != null ? money(c.limit_amount) : "Non renseigné"))}</td><td>${esc(c.deductible != null ? money(c.deductible) : "Non renseigné")} ${esc(c.deductible_form || "")}</td><td>${esc(c.exclusions || "Non renseigné")}</td><td>${esc(c.source_ref || "")}</td></tr>`).join("") || "<tr><td colspan=6>Aucune garantie saisie</td></tr>"}</table>`);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-3">
        <h2 className="break-words text-lg font-semibold">{pol.title}</h2>
        <p className="break-words text-sm">N° de police : <strong>{pol.policy_number || "non renseigné"}</strong> · {pol.insurer || "Assureur non renseigné"}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {pol.broker_phone && <Button size="sm" asChild><a href={`tel:${pol.broker_phone}`}><Phone className="mr-1 h-4 w-4" />Courtier {pol.broker_name ?? ""}</a></Button>}
          {pol.broker_email && <Button size="sm" variant="outline" asChild><a href={`mailto:${pol.broker_email}`}><Mail className="mr-1 h-4 w-4" />Courriel</a></Button>}
          <Button size="sm" variant="outline" onClick={exportSummary}><Printer className="mr-1 h-4 w-4" />Fiche récapitulative</Button>
        </div>
        {pol.claims_contact && <p className="mt-2 break-words text-sm">Réclamations : {pol.claims_contact}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded px-2 py-0.5 ${st.cls}`}>{st.icon} {st.label}</span>
          {renewal && <span className="rounded border border-border px-2 py-0.5">Renouvellement : {STAGES[renewal.stage]}</span>}
          {period?.suspended_reason && <span className="rounded border border-border px-2 py-0.5">⏸ Rappels suspendus : {period.suspended_reason}</span>}
          {period && d.conts[period.id] !== "non_documentee" && <span className="rounded border border-border px-2 py-0.5">{CONTINUITY[d.conts[period.id]]}</span>}
          {d.periods.length > 1 && (
            <select aria-label="Période" className="h-8 rounded-md border border-border bg-background px-2" value={periodId ?? ""} onChange={(e) => setPeriodId(e.target.value)}>
              {d.periods.map((p: any) => <option key={p.id} value={p.id}>Période {p.effective_from ?? "?"} → {p.expires_on ?? "?"}{p.confirmed_at ? " (confirmée)" : ""}</option>)}
            </select>)}
        </div>
      </section>

      <Tabs defaultValue={tab || "fiche"}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          {[["fiche", "Fiche"], ["garanties", "Garanties"], ["biens", "Biens"], ["documents", "Documents"], ["renouvellement", "Renouvellement"], ["questions", "Questions"], ["historique", "Historique"]].map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="fiche"><Fiche d={d} period={period} canWrite={canWrite} run={run} /></TabsContent>
        <TabsContent value="garanties"><Coverages d={d} period={period} canWrite={canWrite} run={run} /></TabsContent>
        <TabsContent value="biens"><Assets d={d} period={period} canWrite={canWrite} run={run} companyId={companyId} /></TabsContent>
        <TabsContent value="documents"><Docs d={d} period={period} canWrite={canWrite} companyId={companyId} reload={load} openDoc={openDoc} /></TabsContent>
        <TabsContent value="renouvellement"><Renewal d={d} period={period} renewal={renewal} canWrite={canWrite} run={run} companyId={companyId} reload={load} openDoc={openDoc} /></TabsContent>
        <TabsContent value="questions"><Questions d={d} canWrite={canWrite} run={run} companyId={companyId} openDoc={openDoc} /></TabsContent>
        <TabsContent value="historique"><History d={d} name={name} /></TabsContent>
      </Tabs>

      <Dialog open={!!viewer} onOpenChange={(o) => { if (!o) { URL.revokeObjectURL(viewer.url); setViewer(null); } }}>
        <DialogContent className="flex h-[90vh] max-w-4xl flex-col p-3 sm:p-4">
          <DialogHeader><DialogTitle className="pr-6 text-base break-words">{viewer?.doc.title} · v{viewer?.doc.version}</DialogTitle></DialogHeader>
          {viewer && (viewer.doc.mime_type === "application/pdf"
            ? <object data={viewer.url} type="application/pdf" className="min-h-0 w-full flex-1 rounded border border-border"><p className="p-4 text-sm"><a className="text-primary underline" href={viewer.url} target="_blank" rel="noopener noreferrer">Ouvrir le PDF</a></p></object>
            : <img src={viewer.url} alt={viewer.doc.title} className="min-h-0 w-full flex-1 object-contain" />)}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, wide }: any) { return <label className={`text-xs ${wide ? "sm:col-span-2" : ""}`}>{label}{children}</label>; }

function Fiche({ d, period, canWrite, run }: any) {
  const [p, setP] = useState<any>(d.pol); const [per, setPer] = useState<any>(period ?? {});
  const [susp, setSusp] = useState("");
  useEffect(() => { setP(d.pol); setPer(period ?? {}); }, [d.pol, period]);
  const save = async () => {
    const pf = ["title", "category_id", "insurer", "policy_number", "named_insureds", "broker_name", "broker_phone", "broker_email", "claims_contact", "responsible_user", "notes"];
    const ok = await run(db.from("asr_policies").update(Object.fromEntries(pf.map((k) => [k, p[k] || null]))).eq("id", d.pol.id), "Fiche enregistrée");
    if (ok && period) {
      const tf = ["effective_from", "effective_time", "expires_on", "expires_time", "contract_tz", "renewal_terms", "notice_date", "installments", "currency"];
      const nf = ["premium", "taxes", "fees", "total", "financing_fees"];
      await run(db.from("asr_periods").update({ ...Object.fromEntries(tf.map((k) => [k, per[k] || (k === "currency" ? "CAD" : null)])), ...Object.fromEntries(nf.map((k) => [k, num(per[k])])) }).eq("id", period.id), "Période enregistrée");
    }
  };
  const ro = !canWrite;
  const I = (o: any, set: any, k: string, type = "text") => <Input className="mt-1" type={type} disabled={ro} value={o[k] ?? ""} onChange={(e) => set({ ...o, [k]: e.target.value })} />;
  const left = period?.expires_on ? daysBetween(torontoToday(), period.expires_on) : null;
  return (
    <div className="space-y-4 pt-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Intitulé">{I(p, setP, "title")}</Field>
        <Field label="Catégorie"><select disabled={ro} className={sel} value={p.category_id ?? ""} onChange={(e) => setP({ ...p, category_id: e.target.value })}><option value="">—</option>{d.cats.map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
        <Field label="Assureur">{I(p, setP, "insurer")}</Field><Field label="Numéro de police">{I(p, setP, "policy_number")}</Field>
        <Field label="Assurés désignés" wide>{I(p, setP, "named_insureds")}</Field>
        <Field label="Courtier ou agent">{I(p, setP, "broker_name")}</Field><Field label="Téléphone du courtier">{I(p, setP, "broker_phone", "tel")}</Field>
        <Field label="Courriel du courtier">{I(p, setP, "broker_email", "email")}</Field><Field label="Contact de réclamation">{I(p, setP, "claims_contact")}</Field>
        <Field label="Responsable interne"><select disabled={ro} className={sel} value={p.responsible_user ?? ""} onChange={(e) => setP({ ...p, responsible_user: e.target.value })}><option value="">—</option>{d.members.map((m: any) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}</select></Field>
      </div>
      {period ? <>
        <h3 className="text-sm font-semibold">Période {period.confirmed_at && "· confirmée avec preuve"} {left != null && <span className="font-normal text-muted-foreground">({left >= 0 ? `${left} jours restants` : `${-left} jours dépassés`})</span>}</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Prise d’effet">{I(per, setPer, "effective_from", "date")}</Field><Field label="Heure de prise d’effet (si inscrite)">{I(per, setPer, "effective_time", "time")}</Field>
          <Field label="Fuseau du contrat (si inscrit)">{I(per, setPer, "contract_tz")}</Field>
          <Field label="Échéance">{I(per, setPer, "expires_on", "date")}</Field><Field label="Heure d’expiration (si inscrite)">{I(per, setPer, "expires_time", "time")}</Field>
          <Field label="Date limite du préavis contractuel">{I(per, setPer, "notice_date", "date")}</Field>
          <Field label="Modalités de renouvellement" wide>{I(per, setPer, "renewal_terms")}</Field>
        </div>
        {!period.expires_time && <p className="text-xs text-muted-foreground">Heure d’expiration non renseignée : la continuité ne pourra être vérifiée qu’à la journée.</p>}
        <h3 className="text-sm font-semibold">Coûts (vide = inconnu, jamais zéro)</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {[["premium", "Prime pour la période"], ["taxes", "Taxes documentées"], ["fees", "Frais documentés"], ["total", "Coût total"], ["financing_fees", "Frais de financement"]].map(([k, l]) => <Field key={k} label={l}>{I(per, setPer, k, "number")}</Field>)}
          <Field label="Devise">{I(per, setPer, "currency")}</Field>
          <Field label="Versements (fréquence)" wide>{I(per, setPer, "installments")}</Field>
        </div>
        <p className="text-xs text-muted-foreground">Aucune taxe n’est calculée automatiquement : inscrivez celles indiquées sur vos documents.</p>
      </> : <p className="text-sm text-muted-foreground">Aucune période enregistrée.</p>}
      {canWrite && <Button onClick={save}>Enregistrer</Button>}
      {canWrite && period && (
        <div className="rounded-md border border-border p-3 text-sm">
          {period.suspended_reason
            ? <div className="flex flex-wrap items-center gap-2"><span>⏸ Rappels suspendus : {period.suspended_reason}</span><Button size="sm" variant="outline" onClick={() => run(db.rpc("asr_period_suspend", { _period: period.id, _reason: null }), "Rappels réactivés")}>Réactiver les rappels</Button></div>
            : <div className="flex flex-wrap gap-2"><Input className="min-w-0 flex-1" placeholder="Raison de la suspension des rappels" value={susp} onChange={(e) => setSusp(e.target.value)} /><Button size="sm" variant="outline" disabled={susp.trim().length < 3} onClick={() => run(db.rpc("asr_period_suspend", { _period: period.id, _reason: susp }), "Rappels suspendus")}>Suspendre les rappels</Button></div>}
          <p className="mt-1 text-xs text-muted-foreground">Suspendre les rappels ne change pas l’état du dossier, qui reste affiché.</p>
        </div>)}
    </div>
  );
}

function Coverages({ d, period, canWrite, run }: any) {
  const blank = { label: "", description: "", limit_amount: "", limit_text: "", sublimits: "", deductible: "", deductible_form: "", limit_basis: "", territory: "", activities: "", exclusions: "", conditions: "", endorsements: "", source_doc_id: "", source_ref: "", state: "non_renseigne" };
  const [f, setF] = useState<any>(blank); const [edit, setEdit] = useState<string | null>(null);
  const list = d.cov.filter((c: any) => c.period_id === period?.id);
  if (!period) return null;
  const save = async () => {
    if (!f.label.trim()) return toast({ title: "Description de la garantie requise", variant: "destructive" });
    const row = { ...f, limit_amount: num(f.limit_amount), deductible: num(f.deductible), source_doc_id: f.source_doc_id || null };
    const ok = await run(edit ? db.from("asr_coverages").update(row).eq("id", edit) : db.from("asr_coverages").insert({ ...row, period_id: period.id, company_id: period.company_id }), "Garantie enregistrée");
    if (ok) { setF(blank); setEdit(null); }
  };
  return (
    <div className="space-y-3 pt-2">
      <p className="text-xs text-muted-foreground">L’absence d’information n’est pas une exclusion : seule la mention « Exclu explicitement » l’indique.</p>
      {!list.length && <p className="text-sm text-muted-foreground">Aucune garantie saisie.</p>}
      <ul className="space-y-2">{list.map((c: any) => (
        <li key={c.id} className="rounded-md border border-border p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2"><p className="font-medium break-words">{c.label}</p><span className="rounded border border-border px-2 py-0.5 text-xs">{COV_STATE[c.state]}</span></div>
          <p className="break-words text-xs text-muted-foreground">Limite : {c.limit_text || (c.limit_amount != null ? money(c.limit_amount) : "non renseignée")} · Franchise : {c.deductible != null ? money(c.deductible) : "non renseignée"} {c.deductible_form ?? ""} · Territoire : {c.territory || "non renseigné"}</p>
          {c.exclusions && <p className="break-words text-xs">Exclusions : {c.exclusions}</p>}
          {c.source_ref && <p className="text-xs text-muted-foreground">Source : {d.docs.find((x: any) => x.id === c.source_doc_id)?.title ?? "document"} · {c.source_ref}</p>}
          {canWrite && <Button size="sm" variant="ghost" onClick={() => { setEdit(c.id); setF(Object.fromEntries(Object.keys(blank).map((k) => [k, c[k] ?? ""]))); }}>Modifier</Button>}
        </li>))}</ul>
      {canWrite && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <h3 className="text-sm font-semibold">{edit ? "Modifier la garantie" : "Ajouter une garantie"}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Garantie (description)" wide><Input className="mt-1" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field>
            <Field label="État"><select className={sel} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>{Object.entries(COV_STATE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            {[["limit_amount", "Limite ($)", "number"], ["limit_text", "Limite (texte du contrat)"], ["sublimits", "Sous-limites"], ["deductible", "Franchise ($)", "number"], ["deductible_form", "Forme de la franchise"], ["limit_basis", "Base d’application des limites"], ["territory", "Territoire"], ["activities", "Activités déclarées"], ["exclusions", "Exclusions"], ["conditions", "Conditions"], ["endorsements", "Avenants"], ["source_ref", "Page ou section"]].map(([k, l, t]) => (
              <Field key={k} label={l}><Input className="mt-1" type={t || "text"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>))}
            <Field label="Document source"><select className={sel} value={f.source_doc_id} onChange={(e) => setF({ ...f, source_doc_id: e.target.value })}><option value="">—</option>{d.docs.map((x: any) => <option key={x.id} value={x.id}>{x.title} v{x.version}</option>)}</select></Field>
          </div>
          <div className="flex gap-2"><Button onClick={save}>Enregistrer</Button>{edit && <Button variant="ghost" onClick={() => { setEdit(null); setF(blank); }}>Annuler</Button>}</div>
        </div>)}
    </div>
  );
}

function Assets({ d, period, canWrite, run, companyId }: any) {
  const [truck, setTruck] = useState(""); const [label, setLabel] = useState(""); const [cov, setCov] = useState(""); const [subject, setSubject] = useState("");
  if (!period) return null;
  const list = d.assets.filter((a: any) => a.period_id === period.id);
  const add = async () => {
    if (!truck && !label.trim()) return;
    const ok = await run(db.from("asr_assets").insert({ company_id: companyId, period_id: period.id, truck_id: truck || null, asset_label: truck ? null : label.trim(), coverage_id: cov || null }), "Bien relié");
    if (ok) { setTruck(""); setLabel(""); setCov(""); }
  };
  return (
    <div className="space-y-3 pt-2">
      <p className="text-xs text-muted-foreground">Relier un bien indique seulement qu’il figure à votre dossier pour cette police; cela ne le déclare pas assuré.</p>
      <ul className="space-y-1">{list.map((a: any) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm">
          <span className="break-words">{a.trucks ? `${a.trucks.unit_number ? a.trucks.unit_number + " · " : ""}${a.trucks.name}${a.trucks.plate ? " · " + a.trucks.plate : ""}` : a.asset_label}{a.coverage_id && ` — ${d.cov.find((c: any) => c.id === a.coverage_id)?.label ?? ""}`}</span>
          {canWrite && <Button size="sm" variant="ghost" onClick={() => run(db.from("asr_assets").update({ archived_at: new Date().toISOString() }).eq("id", a.id), "Lien retiré")}>Retirer le lien</Button>}
        </li>))}{!list.length && <li className="text-sm text-muted-foreground">Aucun bien relié.</li>}</ul>
      {canWrite && <>
        <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-4">
          <Field label="Véhicule, remorque ou équipement de la flotte"><select className={sel} value={truck} onChange={(e) => setTruck(e.target.value)}><option value="">—</option>{d.trucks.map((t: any) => <option key={t.id} value={t.id}>{t.unit_number ? t.unit_number + " · " : ""}{t.name}</option>)}</select></Field>
          <Field label="Ou autre bien (bâtiment, contenu…)"><Input className="mt-1" disabled={!!truck} value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
          <Field label="Garantie concernée (facultatif)"><select className={sel} value={cov} onChange={(e) => setCov(e.target.value)}><option value="">—</option>{d.cov.filter((c: any) => c.period_id === period.id).map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
          <div className="flex items-end"><Button onClick={add} className="w-full">Relier</Button></div>
        </div>
        <div className="flex flex-wrap gap-2 rounded-md border border-border p-3">
          <Input className="min-w-0 flex-1" placeholder="Nouveau bien ou nouvelle activité à vérifier" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Button variant="outline" disabled={!subject.trim()} onClick={async () => { if (await run(db.rpc("asr_broker_task", { _company: companyId, _subject: subject }), "Tâche « Vérifier avec le courtier » créée")) setSubject(""); }}>Créer la tâche « Vérifier avec le courtier »</Button>
        </div>
      </>}
    </div>
  );
}

export function useUpload(companyId: string) {
  return async (file: File, meta: any) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!MIME[ext]) throw new Error("Formats acceptés : PDF, JPG, PNG, WEBP");
    if (file.size > MAX) throw new Error("100 Mo au maximum");
    const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: MIME[ext] });
    if (up.error) throw new Error(up.error.message);
    const { data, error } = await db.from("asr_documents").insert({ company_id: companyId, storage_path: path, file_name: file.name, mime_type: MIME[ext], size_bytes: file.size, ...meta }).select("*").single();
    if (error) { await supabase.storage.from(BUCKET).remove([path]); throw new Error(error.message); }
    return data;
  };
}

function Docs({ d, period, canWrite, companyId, reload, openDoc }: any) {
  const upload = useUpload(companyId);
  const [file, setFile] = useState<File | null>(null); const [meta, setMeta] = useState({ doc_type: "police", title: "", period_id: period?.id ?? "", supersedes_id: "" });
  const [busy, setBusy] = useState(false); const [q, setQ] = useState("");
  const send = async () => {
    if (!file) return; setBusy(true);
    try { await upload(file, { ...meta, title: meta.title || file.name, policy_id: d.pol.id, period_id: meta.period_id || null, supersedes_id: meta.supersedes_id || null }); toast({ title: "Document ajouté" }); setFile(null); setMeta({ ...meta, title: "", supersedes_id: "" }); reload(); }
    catch (e: any) { toast({ title: "Envoi refusé", description: e.message, variant: "destructive" }); }
    setBusy(false);
  };
  const list = d.docs.filter((x: any) => !q || (x.title + " " + DOC_TYPES[x.doc_type]).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-3 pt-2">
      <Input placeholder="Rechercher un document" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="space-y-2">{list.map((x: any) => (
        <li key={x.id} className="flex flex-col gap-2 rounded-md border border-border p-2 text-sm sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1"><p className="break-words font-medium">{x.title} <span className="text-xs text-muted-foreground">v{x.version}</span>{x.archived_at && " (archivé)"}</p>
            <p className="text-xs text-muted-foreground">{DOC_TYPES[x.doc_type]} · ajouté le {new Date(x.created_at).toLocaleString("fr-CA", { timeZone: "America/Toronto" })}{x.period_id && (() => { const p = d.all.find((p: any) => p.id === x.period_id); return p ? ` · période ${p.effective_from ?? "?"} → ${p.expires_on ?? "?"}` : ""; })()}</p></div>
          <div className="flex gap-2"><Button size="sm" onClick={() => openDoc(x)}><Eye className="mr-1 h-4 w-4" />Consulter</Button><Button size="sm" variant="outline" onClick={() => openDoc(x, true)}><Download className="mr-1 h-4 w-4" />Télécharger</Button></div>
        </li>))}{!list.length && <li className="text-sm text-muted-foreground">Aucun document.</li>}</ul>
      {canWrite && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <label className="flex cursor-pointer flex-col items-center gap-1 rounded-md border-2 border-dashed border-border p-4 text-center text-sm"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setFile(e.dataTransfer.files?.[0] ?? null); }}>
            <Upload className="h-5 w-5 text-primary" />{file ? file.name : "Glissez un fichier ou touchez pour choisir (PDF ou image, 100 Mo max.)"}
            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Type"><select className={sel} value={meta.doc_type} onChange={(e) => setMeta({ ...meta, doc_type: e.target.value })}>{Object.entries(DOC_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Titre"><Input className="mt-1" value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></Field>
            <Field label="Période concernée"><select className={sel} value={meta.period_id} onChange={(e) => setMeta({ ...meta, period_id: e.target.value })}><option value="">—</option>{d.periods.map((p: any) => <option key={p.id} value={p.id}>{p.effective_from ?? "?"} → {p.expires_on ?? "?"}</option>)}</select></Field>
            <Field label="Nouvelle version de (facultatif)"><select className={sel} value={meta.supersedes_id} onChange={(e) => setMeta({ ...meta, supersedes_id: e.target.value })}><option value="">— nouveau document —</option>{d.docs.map((x: any) => <option key={x.id} value={x.id}>{x.title} v{x.version}</option>)}</select></Field>
          </div>
          <p className="text-xs text-muted-foreground">Un avenant s’ajoute à la police; les documents précédents restent conservés. Aucune facture ni écriture comptable n’est créée.</p>
          <Button onClick={send} disabled={!file || busy}>{busy ? "Envoi…" : "Ajouter le document"}</Button>
        </div>)}
    </div>
  );
}

function Renewal({ d, period, renewal, canWrite, run, companyId, reload, openDoc }: any) {
  const upload = useUpload(companyId);
  const [crit, setCrit] = useState(""); const [qf, setQf] = useState<any>({ cost_basis: "a_confirmer", currency: "CAD" }); const [qFile, setQFile] = useState<File | null>(null);
  const [conf, setConf] = useState<any>(null); const [nr, setNr] = useState("");
  const quotes = useMemo(() => renewal ? d.quotes.filter((q: any) => q.renewal_id === renewal.id) : [], [d.quotes, renewal]);
  if (!period) return null;
  if (!renewal) return (
    <div className="space-y-2 pt-2"><p className="text-sm text-muted-foreground">Aucun dossier de renouvellement. Il s’ouvre automatiquement trois mois avant l’échéance, ou maintenant :</p>
      {canWrite && <Button onClick={() => run(db.rpc("asr_renewal_open", { _period: period.id }), "Dossier ouvert, tâche et agenda créés")}>Préparer le renouvellement</Button>}
      <Reminders d={d} period={period} /></div>);
  const closed = !!renewal.closed_at;
  const ref = { total: period.total, currency: period.currency, cost_basis: period.premium != null && period.taxes != null && period.fees != null ? "prime_taxes_frais" : "a_confirmer", period_from: period.effective_from, period_to: period.expires_on,
    limit_amount: d.cov.filter((c: any) => c.period_id === period.id).map((c: any) => c.limit_amount).find((x: any) => x != null), deductible: d.cov.filter((c: any) => c.period_id === period.id).map((c: any) => c.deductible).find((x: any) => x != null) };
  const low = lowestComparable(quotes);
  const upd = (patch: any, ok: string) => run(db.from("asr_renewals").update(patch).eq("id", renewal.id), ok);
  const addQuote = async () => {
    const { data, error } = await db.from("asr_quotes").insert({ ...qf, company_id: companyId, renewal_id: renewal.id, total: num(qf.total), limit_amount: num(qf.limit_amount), deductible: num(qf.deductible), financing_fees: num(qf.financing_fees), period_from: qf.period_from || null, period_to: qf.period_to || null, valid_until: qf.valid_until || null }).select("id").single();
    if (error) return toast({ title: "Refusé", description: error.message, variant: "destructive" });
    if (qFile) { try { await upload(qFile, { doc_type: "soumission", title: `Soumission ${qf.insurer ?? ""}`.trim(), policy_id: d.pol.id, period_id: period.id, quote_id: data.id }); } catch (e: any) { toast({ title: "Pièce refusée", description: e.message, variant: "destructive" }); } }
    if (["a_preparer", "magasinage"].includes(renewal.stage)) await db.from("asr_renewals").update({ stage: "soumissions_recues" }).eq("id", renewal.id);
    toast({ title: "Soumission ajoutée" }); setQf({ cost_basis: "a_confirmer", currency: "CAD" }); setQFile(null); reload();
  };
  const exportRequest = () => {
    const pick = Array.from(document.querySelectorAll<HTMLInputElement>("[data-exp]:checked")).map((x) => x.dataset.exp);
    const cov = d.cov.filter((c: any) => c.period_id === period.id);
    printDoc("Demande de soumission", `<h1>Dossier pour demande de soumission — ${esc(d.pol.title)}</h1><p class="n">Préparé par l’entreprise à partir de ses renseignements enregistrés. Aucun envoi automatique n’est fait par Vrac Québec.</p>
      ${pick.includes("police") ? `<p>Assureur actuel : ${esc(d.pol.insurer || "Non renseigné")} · N° ${esc(d.pol.policy_number || "Non renseigné")} · Échéance ${esc(period.expires_on)}</p>` : ""}
      ${pick.includes("garanties") ? `<h2>Garanties actuelles</h2><ul>${cov.map((c: any) => `<li>${esc(c.label)} — ${COV_STATE[c.state]} — limite ${esc(c.limit_text || money(c.limit_amount))}, franchise ${esc(money(c.deductible))}</li>`).join("")}</ul>` : ""}
      ${pick.includes("biens") ? `<h2>Biens</h2><ul>${d.assets.filter((a: any) => a.period_id === period.id).map((a: any) => `<li>${esc(a.trucks ? a.trucks.name + " " + (a.trucks.plate ?? "") : a.asset_label)}</li>`).join("")}</ul>` : ""}
      ${pick.includes("verif") ? `<h2>Points à revoir</h2><ul>${CHECK.map((c) => `<li>${esc(c)} : ${esc(renewal.checklist?.[c] ?? "à compléter")}</li>`).join("")}</ul>` : ""}
      ${pick.includes("criteres") ? `<h2>Critères essentiels</h2><ul>${renewal.criteria.map((c: string) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
      ${pick.includes("pieces") ? `<h2>Pièces jointes à transmettre</h2><ul>${d.docs.filter((x: any) => x.period_id === period.id).map((x: any) => `<li>${esc(x.title)} v${x.version}</li>`).join("")}</ul>` : ""}`);
  };
  const EV: Record<string, string> = { documente: "Critère documenté", non: "Non satisfait", a_confirmer: "À confirmer" };
  return (
    <div className="space-y-4 pt-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Étape"><select className={sel} disabled={!canWrite || closed} value={renewal.stage} onChange={(e) => upd({ stage: e.target.value }, "Étape mise à jour")}>
          {Object.entries(STAGES).filter(([v]) => closed || ["a_preparer", "magasinage", "soumissions_recues", "choix_en_attente"].includes(v)).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Responsable"><select className={sel} disabled={!canWrite || closed} value={renewal.responsible_user ?? ""} onChange={(e) => upd({ responsible_user: e.target.value || null }, "Responsable attribué")}><option value="">—</option>{d.members.map((m: any) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}</select></Field>
        <Field label="Échéance du dossier"><Input type="date" className="mt-1" disabled={!canWrite || closed} defaultValue={renewal.due_date ?? ""} onBlur={(e) => e.target.value !== (renewal.due_date ?? "") && upd({ due_date: e.target.value || null }, "Échéance du dossier modifiée")} /></Field>
      </div>
      <p className="text-xs text-muted-foreground">Le dossier de renouvellement ne modifie pas la période de la police actuelle. Une tâche et une échéance à l’agenda y sont reliées.</p>
      {closed && <p className="rounded-md border border-border p-2 text-sm">{STAGES[renewal.stage]}{renewal.nonrenew_reason && ` — motif : ${renewal.nonrenew_reason}. Aucun remplacement documenté.`} · {CONTINUITY[d.conts[period.id]]}</p>}

      <section className="space-y-1"><h3 className="text-sm font-semibold">Liste de vérification</h3>
        {CHECK.map((c) => <Field key={c} label={c}><Input className="mt-1" disabled={!canWrite || closed} defaultValue={renewal.checklist?.[c] ?? ""} onBlur={(e) => e.target.value !== (renewal.checklist?.[c] ?? "") && upd({ checklist: { ...renewal.checklist, [c]: e.target.value } }, "Vérification notée")} /></Field>)}
      </section>

      <section className="space-y-1"><h3 className="text-sm font-semibold">Critères essentiels</h3>
        <div className="flex flex-wrap gap-1">{renewal.criteria.map((c: string) => <span key={c} className="rounded border border-border px-2 py-0.5 text-xs">{c}</span>)}</div>
        {canWrite && !closed && <div className="flex gap-2"><Input placeholder="Ex. : pollution soudaine et accidentelle" value={crit} onChange={(e) => setCrit(e.target.value)} /><Button variant="outline" disabled={!crit.trim()} onClick={async () => { if (await upd({ criteria: [...renewal.criteria, crit.trim()] }, "Critère ajouté")) setCrit(""); }}>Ajouter</Button></div>}
      </section>

      <section className="space-y-2"><h3 className="text-sm font-semibold">Comparaison des soumissions</h3>
        {!quotes.length ? <p className="text-sm text-muted-foreground">Aucune soumission enregistrée.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-xs"><thead><tr className="text-left"><th className="p-1">Élément</th><th className="p-1">Police actuelle</th>{quotes.map((q: any) => <th key={q.id} className="p-1">{q.insurer || "Assureur ?"}{low === q.id && <span className="ml-1 rounded bg-primary/15 px-1">Prix le plus bas parmi les soumissions comparables enregistrées</span>}</th>)}</tr></thead>
            <tbody>
              {[["Courtier", d.pol.broker_name, (q: any) => q.broker], ["Période", `${period.effective_from ?? "?"} → ${period.expires_on ?? "?"}`, (q: any) => `${q.period_from ?? "?"} → ${q.period_to ?? "?"}`], ["Validité de l’offre", "—", (q: any) => q.valid_until],
                ["Coût total", money(period.total, period.currency), (q: any) => money(q.total, q.currency)], ["Composition du coût", ref.cost_basis === "a_confirmer" ? "À confirmer" : "Prime + taxes + frais", (q: any) => ({ prime_taxes_frais: "Prime + taxes + frais", prime_seule: "Prime seule", prime_taxes: "Prime + taxes", a_confirmer: "À confirmer" } as any)[q.cost_basis]],
                ["Écart vs actuelle", "—", (q: any) => { const x = diff(ref, q); return x ? `${money(x.dollars)}${x.pct != null ? ` (${x.pct} %)` : " (référence nulle)"}` : `Non comparable : ${comparable(ref, q).why}`; }],
                ["Annualisé (estimation)", annualized(ref) != null ? money(annualized(ref)) : "—", (q: any) => annualized(q) != null ? money(annualized(q)) : "—"],
                ["Versements / financement", period.installments, (q: any) => [q.installments, q.financing_fees != null && money(q.financing_fees)].filter(Boolean).join(" · ")], ["Limite", money(ref.limit_amount), (q: any) => money(q.limit_amount)], ["Franchise", money(ref.deductible), (q: any) => money(q.deductible)],
                ["Exclusions", "—", (q: any) => q.exclusions], ["Territoire", "—", (q: any) => q.territory], ["Biens et activités", "—", (q: any) => q.assets_activities], ["Conditions", "—", (q: any) => q.conditions],
                ["Alertes", "—", (q: any) => flags(ref, q).join(" · ") || "Aucune"]].map(([l, cur, fn]: any) => (
                <tr key={l} className="border-t border-border"><td className="p-1 font-medium">{l}</td><td className="p-1">{cur || "Non renseigné"}</td>{quotes.map((q: any) => <td key={q.id} className="p-1 break-words">{fn(q) || "Non renseigné"}</td>)}</tr>))}
              {renewal.criteria.map((c: string) => (
                <tr key={c} className="border-t border-border"><td className="p-1 font-medium">Critère : {c}</td><td className="p-1">—</td>{quotes.map((q: any) => <td key={q.id} className="p-1">
                  {canWrite && !closed ? <select className="h-8 rounded border border-border bg-background" value={q.criteria_eval?.[c] ?? "a_confirmer"} onChange={(e) => run(db.from("asr_quotes").update({ criteria_eval: { ...q.criteria_eval, [c]: e.target.value } }).eq("id", q.id), "Critère évalué")}>{Object.entries(EV).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select> : EV[q.criteria_eval?.[c] ?? "a_confirmer"]}</td>)}</tr>))}
            </tbody></table></div>)}
        <p className="text-xs text-muted-foreground">Le prix le plus bas n’est pas la meilleure couverture. Le choix appartient à l’entreprise, avec son représentant en assurance; Vrac Québec ne souscrit, ne renouvelle et ne résilie aucun contrat.</p>
        {canWrite && !closed && (
          <div className="space-y-2 rounded-md border border-border p-3"><h4 className="text-sm font-medium">Ajouter une soumission reçue</h4>
            <div className="grid gap-2 sm:grid-cols-3">
              {[["insurer", "Assureur"], ["broker", "Courtier"], ["total", "Coût total", "number"], ["currency", "Devise"], ["period_from", "Début proposé", "date"], ["period_to", "Fin proposée", "date"], ["valid_until", "Offre valide jusqu’au", "date"], ["installments", "Versements"], ["financing_fees", "Frais de financement", "number"], ["limit_amount", "Limite", "number"], ["deductible", "Franchise", "number"], ["exclusions", "Exclusions"], ["territory", "Territoire"], ["assets_activities", "Biens et activités couverts"], ["conditions", "Conditions à remplir"]].map(([k, l, t]) => (
                <Field key={k} label={l}><Input className="mt-1" type={t || "text"} value={qf[k] ?? ""} onChange={(e) => setQf({ ...qf, [k]: e.target.value })} /></Field>))}
              <Field label="Composition du coût"><select className={sel} value={qf.cost_basis} onChange={(e) => setQf({ ...qf, cost_basis: e.target.value })}><option value="prime_taxes_frais">Prime + taxes + frais</option><option value="prime_taxes">Prime + taxes</option><option value="prime_seule">Prime seule</option><option value="a_confirmer">À confirmer</option></select></Field>
              <Field label="Pièce (PDF ou image)"><input type="file" className="mt-1 block w-full text-xs" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setQFile(e.target.files?.[0] ?? null)} /></Field>
            </div>
            <Button onClick={addQuote}>Ajouter la soumission</Button>
          </div>)}
        {quotes.length > 0 && <ul className="text-xs">{d.docs.filter((x: any) => quotes.some((q: any) => q.id === x.quote_id)).map((x: any) => <li key={x.id}><button className="text-primary underline" onClick={() => openDoc(x)}>{x.title}</button></li>)}</ul>}
      </section>

      <section className="space-y-2 rounded-md border border-border p-3"><h3 className="text-sm font-semibold">Dossier pour demander des soumissions</h3>
        <div className="flex flex-wrap gap-3 text-sm">{[["police", "Police actuelle"], ["garanties", "Garanties"], ["biens", "Biens"], ["verif", "Points à revoir"], ["criteres", "Critères"], ["pieces", "Liste des pièces"]].map(([k, l]) => <label key={k} className="flex items-center gap-1"><input type="checkbox" data-exp={k} defaultChecked={k !== "pieces"} />{l}</label>)}</div>
        <Button variant="outline" onClick={exportRequest}><Printer className="mr-1 h-4 w-4" />Préparer le dossier (impression / PDF)</Button>
      </section>

      {canWrite && !closed && (
        <section className="flex flex-wrap gap-2">
          <Button onClick={() => setConf({ kind: "renouvellement", effective_from: period.expires_on ?? "", currency: period.currency })}>Confirmer le renouvellement</Button>
          <Button variant="outline" onClick={() => setConf({ kind: "remplacement", effective_from: period.expires_on ?? "", currency: "CAD" })}>Confirmer un remplacement</Button>
          <div className="flex min-w-0 flex-1 gap-2"><Input className="min-w-0" placeholder="Motif du non-renouvellement" value={nr} onChange={(e) => setNr(e.target.value)} /><Button variant="outline" disabled={nr.trim().length < 3} onClick={() => run(db.rpc("asr_renewal_nonrenew", { _renewal: renewal.id, _reason: nr }), "Non-renouvellement déclaré")}>Déclarer</Button></div>
        </section>)}
      <Reminders d={d} period={period} />

      <Dialog open={!!conf} onOpenChange={(o) => !o && setConf(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{conf?.kind === "remplacement" ? "Confirmer un remplacement" : "Confirmer le renouvellement"}</DialogTitle></DialogHeader>
          {conf && <div className="grid gap-2 sm:grid-cols-2">
            {conf.kind === "remplacement" && <><Field label="Nouvel assureur"><Input className="mt-1" value={conf.insurer ?? ""} onChange={(e) => setConf({ ...conf, insurer: e.target.value })} /></Field><Field label="Nouveau numéro"><Input className="mt-1" value={conf.policy_number ?? ""} onChange={(e) => setConf({ ...conf, policy_number: e.target.value })} /></Field></>}
            {[["effective_from", "Nouvelle prise d’effet", "date"], ["effective_time", "Heure (si inscrite)", "time"], ["expires_on", "Nouvelle échéance", "date"], ["expires_time", "Heure (si inscrite)", "time"], ["premium", "Prime", "number"], ["taxes", "Taxes", "number"], ["fees", "Frais", "number"], ["total", "Coût total", "number"], ["currency", "Devise"]].map(([k, l, t]) => (
              <Field key={k} label={l}><Input className="mt-1" type={t || "text"} value={conf[k] ?? ""} onChange={(e) => setConf({ ...conf, [k]: e.target.value })} /></Field>))}
            <Field label="Soumission retenue (facultatif)"><select className={sel} value={conf.quote_id ?? ""} onChange={(e) => setConf({ ...conf, quote_id: e.target.value })}><option value="">—</option>{quotes.map((q: any) => <option key={q.id} value={q.id}>{q.insurer} {money(q.total, q.currency)}</option>)}</select></Field>
            <Field label="Preuve de confirmation (obligatoire)" wide><input type="file" className="mt-1 block w-full text-xs" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setConf({ ...conf, file: e.target.files?.[0] })} /></Field>
            <p className="text-xs text-muted-foreground sm:col-span-2">Une soumission ou un choix d’offre ne suffit pas : joignez la police, le certificat, la preuve provisoire ou la confirmation écrite. L’ancienne période est conservée.</p>
            <Button className="sm:col-span-2" disabled={!conf.file || !conf.effective_from || !conf.expires_on} onClick={async () => {
              try {
                const doc = await upload(conf.file, { doc_type: "confirmation", title: `Confirmation ${conf.kind} ${conf.effective_from}`, policy_id: d.pol.id });
                const { file, kind, ...f } = conf;
                if (await run(db.rpc("asr_renewal_confirm", { _renewal: renewal.id, _kind: kind, _f: f, _proof: doc.id }), "Nouvelle période créée; l’ancienne est conservée")) setConf(null);
              } catch (e: any) { toast({ title: "Refusé", description: e.message, variant: "destructive" }); }
            }}>Confirmer avec la preuve</Button>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Reminders({ d, period }: any) {
  const list = d.deliveries.filter((x: any) => x.period_id === period.id);
  return (
    <section className="space-y-1"><h3 className="text-sm font-semibold">Rappels envoyés</h3>
      <p className="text-xs text-muted-foreground">3, 2 et 1 mois avant, puis chaque semaine, le jour même si la continuité n’est pas documentée, et chaque semaine après l’échéance, à 9 h (heure de Toronto). Courriel, texto et push : non activés pour l’instant — rappels dans l’application seulement.</p>
      {!list.length ? <p className="text-xs text-muted-foreground">Aucun rappel pour l’instant.</p> : <ul className="text-xs">{list.map((x: any) => (
        <li key={x.id} className="border-t border-border py-1">{new Date(x.created_at).toLocaleString("fr-CA", { timeZone: "America/Toronto" })} · {OCC_LABEL(x.occurrence)} · {x.channel === "app" ? "Application : notification créée" : `Courriel : ${x.state === "canal_indisponible" ? "canal indisponible" : x.state}`}{x.read_at && " · lu (ne signifie pas renouvelé)"}{x.obsolete_at && " · obsolète (échéance modifiée)"}</li>))}</ul>}
    </section>
  );
}

function Questions({ d, canWrite, run, companyId, openDoc }: any) {
  const [f, setF] = useState<any>({ question: "", coverage_id: "", asset: "" }); const [ans, setAns] = useState<any>({}); const [s, setS] = useState("");
  const shortcuts: [string, (c: any) => string | null][] = [["Franchise", (c) => c.deductible != null ? `${c.label} : ${money(c.deductible)} ${c.deductible_form ?? ""}` : null], ["Exclusion", (c) => c.exclusions ? `${c.label} : ${c.exclusions}` : null], ["Montant", (c) => c.limit_amount != null || c.limit_text ? `${c.label} : ${c.limit_text || money(c.limit_amount)}` : null]];
  const [hit, setHit] = useState<string[] | null>(null);
  const searchFor = (k: string) => {
    if (k === "Document") return setHit(d.docs.map((x: any) => `${DOC_TYPES[x.doc_type]} : ${x.title} v${x.version}`));
    if (k === "Contact") return setHit([d.pol.broker_name && `Courtier : ${d.pol.broker_name} ${d.pol.broker_phone ?? ""} ${d.pol.broker_email ?? ""}`, d.pol.claims_contact && `Réclamations : ${d.pol.claims_contact}`].filter(Boolean));
    const fn = shortcuts.find(([n]) => n === k)![1];
    setHit(d.cov.map((c: any) => { const r = fn(c); return r && `${r} (${COV_STATE[c.state]}${c.source_ref ? " · " + c.source_ref : ""})`; }).filter(Boolean));
  };
  return (
    <div className="space-y-3 pt-2">
      <div className="flex flex-wrap gap-2">{["Franchise", "Exclusion", "Montant", "Document", "Contact"].map((k) => <Button key={k} size="sm" variant="outline" onClick={() => searchFor(k)}>Retrouver : {k.toLowerCase()}</Button>)}</div>
      {hit && <div className="rounded-md border border-border p-2 text-sm">{hit.length ? <ul className="list-disc pl-5">{hit.map((h, i) => <li key={i} className="break-words">{h}</li>)}</ul> : <p>Information non trouvée dans les renseignements enregistrés. À confirmer avec votre courtier.</p>}<p className="mt-1 text-xs text-muted-foreground">Recherche dans les renseignements saisis, pas une interprétation du contrat ni une garantie d’indemnisation.</p></div>}
      <div className="space-y-2 rounded-md border border-border p-3">
        <Textarea placeholder="Votre question sur cette police" value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} />
        <div className="grid gap-2 sm:grid-cols-2">
          <select className={sel} value={f.coverage_id} onChange={(e) => setF({ ...f, coverage_id: e.target.value })}><option value="">Garantie concernée —</option>{d.cov.map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          <Input placeholder="Bien concerné" value={f.asset} onChange={(e) => setF({ ...f, asset: e.target.value })} />
        </div>
        <Button disabled={!f.question.trim()} onClick={async () => { const { data: u } = await supabase.auth.getUser(); if (await run(db.from("asr_questions").insert({ company_id: companyId, policy_id: d.pol.id, question: f.question.trim(), coverage_id: f.coverage_id || null, asset: f.asset || null, created_by: u.user?.id }), "Question consignée")) setF({ question: "", coverage_id: "", asset: "" }); }}>Consigner la question</Button>
      </div>
      <Input placeholder="Rechercher dans les questions" value={s} onChange={(e) => setS(e.target.value)} />
      <ul className="space-y-2">{d.questions.filter((q: any) => !s || (q.question + " " + (q.answer ?? "")).toLowerCase().includes(s.toLowerCase())).map((q: any) => (
        <li key={q.id} className="rounded-md border border-border p-3 text-sm">
          <p className="break-words font-medium">{q.question}</p>
          <p className="text-xs text-muted-foreground">{new Date(q.created_at).toLocaleString("fr-CA", { timeZone: "America/Toronto" })} · {d.members.find((m: any) => m.user_id === q.created_by)?.full_name ?? "Membre"} · {{ ouverte: "Ouverte", repondue: "Répondue", a_confirmer: "À confirmer" }[q.status as string]}{q.coverage_id && ` · ${d.cov.find((c: any) => c.id === q.coverage_id)?.label ?? ""}`}{q.asset && ` · ${q.asset}`}</p>
          {q.answer && <p className="mt-1 break-words rounded bg-muted/50 p-2">{q.answer_source === "note_interne" ? "Note interne (pas une confirmation de l’assureur)" : `Réponse ${q.answer_source === "assureur" ? "de l’assureur" : "du courtier"}`}{q.answer_by_name && ` — ${q.answer_by_name}`}{q.answer_date && ` le ${q.answer_date}`} : {q.answer}
            {q.answer_doc_id && <button className="ml-1 text-primary underline" onClick={() => openDoc(d.docs.find((x: any) => x.id === q.answer_doc_id))}>pièce</button>}</p>}
          {canWrite && (ans.id === q.id ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Textarea className="sm:col-span-2" placeholder="Réponse" value={ans.answer ?? ""} onChange={(e) => setAns({ ...ans, answer: e.target.value })} />
              <select className={sel} value={ans.answer_source ?? "courtier"} onChange={(e) => setAns({ ...ans, answer_source: e.target.value })}><option value="courtier">Provenance : courtier</option><option value="assureur">Provenance : assureur</option><option value="note_interne">Note interne</option></select>
              <Input placeholder="Nom de la personne" value={ans.answer_by_name ?? ""} onChange={(e) => setAns({ ...ans, answer_by_name: e.target.value })} />
              <Input type="date" value={ans.answer_date ?? ""} onChange={(e) => setAns({ ...ans, answer_date: e.target.value })} />
              <select className={sel} value={ans.answer_doc_id ?? ""} onChange={(e) => setAns({ ...ans, answer_doc_id: e.target.value })}><option value="">Pièce justificative —</option>{d.docs.map((x: any) => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
              <select className={sel} value={ans.status ?? "repondue"} onChange={(e) => setAns({ ...ans, status: e.target.value })}><option value="repondue">Répondue</option><option value="a_confirmer">À confirmer</option></select>
              <Button onClick={async () => { const { id, ...r } = ans; if (await run(db.from("asr_questions").update({ ...r, answer_source: r.answer_source ?? "courtier", status: r.status ?? "repondue", answer_date: r.answer_date || null, answer_doc_id: r.answer_doc_id || null }).eq("id", id), "Réponse consignée")) setAns({}); }}>Enregistrer la réponse</Button>
            </div>) : <Button size="sm" variant="ghost" onClick={() => setAns({ id: q.id, answer: q.answer, answer_source: q.answer_source, answer_by_name: q.answer_by_name, answer_date: q.answer_date, status: q.status })}>{q.answer ? "Modifier la réponse" : "Consigner une réponse"}</Button>)}
        </li>))}</ul>
    </div>
  );
}

function History({ d, name }: any) {
  const A: Record<string, string> = { creation: "Création", modification: "Modification", rappel: "Rappel créé", confirmation_renouvellement: "Renouvellement confirmé", confirmation_remplacement: "Remplacement confirmé", acces_contenu_autorise: "Accès assistance autorisé", verifier_courtier: "Tâche courtier" };
  const E: Record<string, string> = { asr_policies: "Police", asr_periods: "Période", asr_coverages: "Garantie", asr_assets: "Bien", asr_documents: "Document", asr_renewals: "Renouvellement", asr_quotes: "Soumission", asr_questions: "Question" };
  return (
    <ul className="space-y-1 pt-2 text-xs">{d.events.map((e: any) => (
      <li key={e.id} className="border-t border-border py-1 break-words">{new Date(e.at).toLocaleString("fr-CA", { timeZone: "America/Toronto" })} · {E[e.entity] ?? e.entity} · {A[e.action] ?? e.action} · {e.actor ? name(e.actor) : "Système"}
        {e.action === "modification" && e.detail && <span className="text-muted-foreground"> — {Object.keys(e.detail).join(", ")}</span>}</li>))}
      {!d.events.length && <li className="text-muted-foreground">Aucun historique.</li>}</ul>
  );
}

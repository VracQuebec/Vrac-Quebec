// CRM privé de l'entreprise (CRM-ENT-01). Données dans ent_crm_*,
// cloisonnées par company_id côté base (RLS). Le super admin y entre
// en mode « Assistance Vrac Québec » (journalisé côté serveur).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, Download, LifeBuoy, Plus, Upload } from "lucide-react";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { STAGES, SOURCES, TRADES, label, resolveCompanies, quoteSubtotal, toCsv, parseCsv, normalize, type Company, type Line } from "@/lib/entcrm/api";
import { UNITS, unitLabel, ensureTemplates, subtotal, lineTotal, incomplete, copyLinks, type QLine } from "@/lib/entcrm/catalog";
import CrmFiles from "@/components/entcrm/CrmFiles";
import CrmServices from "@/components/entcrm/CrmServices";

const db = supabase as any;
const TABS = [
  ["today", "Aujourd'hui"], ["leads", "Leads"], ["clients", "Clients"], ["quotes", "Soumissions"], ["services", "Tarifs et modèles"],
  ["projects", "Chantiers"], ["tasks", "Tâches"], ["reports", "Rapports"], ["history", "Historique"], ["team", "Équipe et paramètres"],
] as const;
type Tab = typeof TABS[number][0];
const money = (n?: number | null) => n == null ? "—" : n.toLocaleString("fr-CA", { style: "currency", currency: "CAD" });
const sel = "h-10 rounded-md border border-border bg-background px-2 text-sm font-body";
const PAGE = 25;
// Brouillon non enregistré : jamais transféré vers une autre entreprise active.
let crmDirty: string | null = null;
const PHONE = /^[+\d(][\d\s().-]{6,}$/, MAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function EntrepreneurCrm() {
  const [params, setParams] = useSearchParams();
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading: rl } = useUserRoles(user, isReady);
  const supportUser = params.get("support_user");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const tab = (params.get("tab") as Tab) || "today";
  const setTab = (t: Tab) => { const p = new URLSearchParams(params); p.set("tab", t); p.delete("page"); setParams(p); };

  useEffect(() => {
    if (!isReady || rl || !user) return;
    (async () => {
      const list = await resolveCompanies(isAdmin, supportUser);
      setCompanies(list);
      const key = `vq.entcrm.company.${user.id}`;
      const pref = params.get("company") || localStorage.getItem(key);
      const c = list.find((x) => x.id === pref) ?? list[0] ?? null;
      setCompanyId(c?.id ?? null);
    })();
  }, [isReady, rl, user, isAdmin, supportUser]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!companyId || !user) return;
    localStorage.setItem(`vq.entcrm.company.${user.id}`, companyId);
    setRole(null);
    db.rpc("entcrm_role", { _company_id: companyId }).then(({ data }: any) => setRole(data));
  }, [companyId, user, isAdmin]);

  const company = companies.find((c) => c.id === companyId);
  const canWrite = ["support", "proprietaire", "gestionnaire"].includes(role ?? "");
  const canFinance = ["support", "proprietaire", "gestionnaire", "comptabilite", "lecture"].includes(role ?? "");
  const canCommercial = canFinance;
  const canAdmin = ["support", "proprietaire"].includes(role ?? "");
  const visibleTabs = TABS.filter(([k]) => canCommercial || ["today", "projects", "tasks", "team"].includes(k));

  return (
    <EntrepreneurAppShell title="Mon CRM" subtitle={company?.name ?? ""} backTo={null} allowCompanyMembers>
      {isAdmin && company && (
        <div role="status" className="border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm text-amber-800 dark:text-amber-300 flex flex-wrap items-center gap-2">
          <LifeBuoy className="h-4 w-4" /><strong>Assistance Vrac Québec — {company.name}</strong>
          <Link to="/admin/crm" className="ml-auto underline">Retour à l'administration</Link>
        </div>
      )}
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          {companies.length > 1 ? (
            <select aria-label="Entreprise active" className={sel} value={companyId ?? ""} onChange={(e) => { if (crmDirty && !confirm(`Un formulaire non enregistré est ouvert dans « ${company?.name} ». Le fermer sans l'enregistrer pour changer d'entreprise ?`)) return; crmDirty = null; setRole(null); setCompanyId(e.target.value); setParams(new URLSearchParams({ tab, ...(supportUser ? { support_user: supportUser } : {}) })); }}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : <span className="font-display text-sm font-semibold">{company?.name ?? "Aucune entreprise"}</span>}
          {role && <span className="text-xs text-muted-foreground">· Rôle : {role === "support" ? "Assistance" : (ROLES.find((r) => r[0] === role)?.[1] ?? role)}</span>}
        </div>
        {companyId && role === null ? <p className="text-muted-foreground">Vérification des droits…</p> : !companyId ? <p className="text-muted-foreground">Aucune entreprise accessible. Un compte approuvé est requis.</p> : (
          <>
            <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border pb-2">
              {visibleTabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-display font-semibold ${tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{l}</button>)}
            </nav>
            <Body key={companyId} tab={tab} companyId={companyId} companyName={company?.name ?? ""} canWrite={canWrite} canFinance={canFinance} canAdmin={canAdmin} canCommercial={canCommercial} canCost={["support", "proprietaire", "gestionnaire", "comptabilite"].includes(role ?? "")} params={params} setParams={setParams} />
          </>
        )}
      </div>
    </EntrepreneurAppShell>
  );
}

const CrmCtx = createContext<{ companyId: string; canWrite: boolean; canAdmin: boolean }>({ companyId: "", canWrite: false, canAdmin: false });

function Body(p: { tab: Tab; companyId: string; companyName: string; canWrite: boolean; canFinance: boolean; canAdmin: boolean; canCommercial: boolean; canCost: boolean; params: URLSearchParams; setParams: (p: URLSearchParams) => void }) {
  return <CrmCtx.Provider value={{ companyId: p.companyId, canWrite: p.canWrite, canAdmin: p.canAdmin }}><BodyInner {...p} /></CrmCtx.Provider>;
}
function BodyInner(p: any) {
  const { tab } = p;
  if (tab === "today") return <Today {...p} />;
  if (tab === "team") return <Team {...p} />;
  if (!p.canCommercial && ["leads", "clients", "quotes", "services", "reports", "history"].includes(tab)) return <p className="text-muted-foreground">Section non autorisée pour votre rôle.</p>;
  if (tab === "leads") return <Leads {...p} />;
  if (tab === "clients") return <Clients {...p} />;
  if (tab === "quotes") return p.canFinance ? <Quotes {...p} /> : <p className="text-muted-foreground">Accès financier non autorisé pour votre rôle.</p>;
  if (tab === "services") return <CrmServices companyId={p.companyId} canWrite={p.canWrite} canAdmin={p.canAdmin} canCost={p.canCost} />;
  if (tab === "projects") return <Projects {...p} />;
  if (tab === "tasks") return <Tasks {...p} />;
  if (tab === "reports") return <Reports {...p} />;
  return <History {...p} />;
}

/** Bouton « Pièces » : ouvre les documents privés du dossier. */
function FilesBtn({ t, id, clientToggle }: { t: "lead" | "client" | "quote" | "project"; id: string; clientToggle?: boolean }) {
  const c = useContext(CrmCtx); const [o, setO] = useState(false);
  return <div className="mt-2"><button className="text-xs font-semibold text-primary underline" onClick={() => setO(!o)}>{o ? "Masquer les pièces" : "Photos et documents"}</button>
    {o && <div className="mt-2"><CrmFiles companyId={c.companyId} ownerType={t} ownerId={id} canWrite={c.canWrite} canAdmin={c.canAdmin} showClientToggle={clientToggle} /></div>}</div>;
}

/** État de la demande réseau source : jamais d'écrasement des données privées. */
function NetworkStatus({ leadId }: { leadId: string }) {
  const [s, setS] = useState<any>(null);
  useEffect(() => { (async () => { const { data: l } = await db.from("ent_crm_network_links").select("id,source_snapshot").eq("lead_id", leadId).maybeSingle(); if (!l) return;
    const { data } = await db.rpc("entcrm_network_check", { _link_id: l.id }); setS({ ...data, snap: l.source_snapshot }); })(); }, [leadId]);
  if (!s) return null;
  if (s.state === "revoked") return <p className="mt-1 text-xs text-muted-foreground">Demande source Vrac Québec : accès retiré. Vos notes et pièces privées sont conservées.</p>;
  return <p className="mt-1 text-xs">Demande Vrac Québec {s.source?.number ?? ""} · {s.source?.status ?? ""}{s.state === "update_available" && <span className="ml-1 rounded bg-amber-500/20 px-1">Actualisation disponible dans la demande source</span>}</p>;
}

function Stat({ l, v }: { l: string; v: string | number }) {
  return <div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 font-display text-2xl font-bold">{v}</p></div>;
}

function Today({ companyId, canFinance }: { companyId: string; canFinance: boolean }) {
  const [s, setS] = useState<any>(null);
  useEffect(() => { (async () => {
    const now = new Date().toISOString(); const week = new Date(Date.now() - 7 * 864e5).toISOString();
    const c = (t: string) => db.from(t).select("id", { count: "exact", head: true }).eq("company_id", companyId);
    const [nl, late, open, won, lost, proj] = await Promise.all([
      c("ent_crm_leads").gte("created_at", week), c("ent_crm_tasks").is("done_at", null).lt("due_at", now),
      db.from("ent_crm_leads").select("estimated_amount").eq("company_id", companyId).not("stage", "in", "(gagne,perdu)").is("archived_at", null),
      c("ent_crm_leads").eq("stage", "gagne"), c("ent_crm_leads").eq("stage", "perdu"),
      c("ent_crm_projects").gte("start_date", now.slice(0, 10)),
    ]);
    const q = canFinance ? (await db.from("ent_crm_quotes").select("status,subtotal,invoiced_amount,paid_amount").eq("company_id", companyId)).data ?? [] : [];
    setS({ nl: nl.count, late: late.count, pipe: (open.data ?? []).reduce((a: number, r: any) => a + (Number(r.estimated_amount) || 0), 0), won: won.count, lost: lost.count, proj: proj.count,
      toFollow: q.filter((x: any) => x.status === "remise").length,
      est: q.filter((x: any) => x.status !== "refusee").reduce((a: number, x: any) => a + Number(x.subtotal), 0),
      acc: q.filter((x: any) => x.status === "acceptee").reduce((a: number, x: any) => a + Number(x.subtotal), 0),
      inv: q.reduce((a: number, x: any) => a + (Number(x.invoiced_amount) || 0), 0), paid: q.reduce((a: number, x: any) => a + (Number(x.paid_amount) || 0), 0) });
  })(); }, [companyId, canFinance]);
  if (!s) return <p className="text-muted-foreground">Chargement…</p>;
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
    <Stat l="Nouveaux leads (7 j)" v={s.nl ?? 0} /><Stat l="Relances en retard" v={s.late ?? 0} />
    <Stat l="Valeur du pipeline (estimée)" v={money(s.pipe)} /><Stat l="Gagnés / perdus" v={`${s.won ?? 0} / ${s.lost ?? 0}`} />
    <Stat l="Chantiers à venir" v={s.proj ?? 0} />
    {canFinance && <><Stat l="Soumissions à suivre" v={s.toFollow} /><Stat l="Montant estimé" v={money(s.est)} /><Stat l="Montant accepté" v={money(s.acc)} /><Stat l="Facturé" v={money(s.inv)} /><Stat l="Encaissé" v={money(s.paid)} /></>}
  </div>;
}

function useStages(companyId: string) {
  const [st, setSt] = useState<{ v: string; l: string; kind: string; id?: string }[]>(STAGES.map((s) => ({ ...s, kind: s.v === "gagne" ? "gagnee" : s.v === "perdu" ? "perdue" : "ouverte" })));
  const load = useCallback(async () => { const { data } = await db.from("ent_crm_stages").select("*").eq("company_id", companyId).order("position");
    if (data?.length) setSt(data.map((d: any) => ({ v: d.key, l: d.label, kind: d.kind, id: d.id }))); }, [companyId]);
  useEffect(() => { void load(); }, [load]);
  return { stages: st, reload: load };
}

function Leads({ companyId, canWrite, params, setParams }: any) {
  const { stages } = useStages(companyId);
  const [views, setViews] = useState<any[]>([]);
  const loadViews = useCallback(async () => setViews((await db.from("ent_crm_saved_views").select("*").eq("company_id", companyId).order("created_at")).data ?? []), [companyId]);
  useEffect(() => { void loadViews(); }, [loadViews]);
  const saveView = async () => { const name = prompt("Nom de la vue ?"); if (!name) return; const p = new URLSearchParams(params); p.delete("page"); p.delete("support_user");
    const { error } = await db.from("ent_crm_saved_views").insert({ company_id: companyId, name, params: p.toString() }); if (error) toast({ title: "Refusé", description: error.message }); loadViews(); };
  const [importing, setImporting] = useState<{ rows: Record<string, string>[]; heads: string[]; map: Record<string, string>; existing: any[]; dupMode: string; ignored: string[] } | null>(null);
  const [rows, setRows] = useState<any[]>([]); const [count, setCount] = useState(0);
  const [clients, setClients] = useState<any[]>([]);
  const [open, setOpen] = useState<any>(null); const [view, setView] = useState<"liste" | "kanban">("liste");
  const q = params.get("q") ?? ""; const stage = params.get("stage") ?? ""; const source = params.get("source") ?? "";
  const sort = params.get("sort") ?? "recent"; const page = Number(params.get("page") ?? 1);
  const setF = (k: string, v: string) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); if (k !== "page") n.delete("page"); setParams(n); };
  const load = useCallback(async () => {
    let r = db.from("ent_crm_leads").select("*", { count: "exact" }).eq("company_id", companyId).is("archived_at", null);
    if (q) r = r.or(`title.ilike.%${q.replace(/[,()%]/g, "")}%,contact_name.ilike.%${q.replace(/[,()%]/g, "")}%,need.ilike.%${q.replace(/[,()%]/g, "")}%`);
    if (stage) r = r.eq("stage", stage); if (source) r = r.eq("source", source);
    r = sort === "ancien" ? r.order("created_at") : sort === "relance" ? r.order("next_action_at", { nullsFirst: false }) : sort === "montant" ? r.order("estimated_amount", { ascending: false, nullsFirst: false }) : r.order("created_at", { ascending: false });
    const { data, count: c } = await r.range((page - 1) * PAGE, page * PAGE - 1);
    setRows(data ?? []); setCount(c ?? 0);
    setClients((await db.from("ent_crm_clients").select("id,name").eq("company_id", companyId).is("archived_at", null).order("name")).data ?? []);
  }, [companyId, q, stage, source, sort, page]);
  useEffect(() => { void load(); }, [load]);
  const move = async (l: any, st: string) => {
    let lost_reason = l.lost_reason; if (stages.find((x) => x.v === st)?.kind === "perdue") { lost_reason = prompt("Motif de perte ?") ?? ""; if (!lost_reason) return; }
    const { error } = await db.from("ent_crm_leads").update({ stage: st, lost_reason, updated_at: new Date().toISOString() }).eq("id", l.id);
    if (error) toast({ title: "Refusé", description: error.message, variant: "destructive" }); else load();
  };
  const convert = async (l: any) => {
    const { data: clientId, error } = await db.rpc("entcrm_convert_lead", { _lead_id: l.id });
    if (error) return toast({ title: "Refusé", description: error.message, variant: "destructive" });
    if (clientId) await copyLinks(companyId, [{ t: "lead", id: l.id }], { t: "client", id: clientId });
    toast({ title: "Client créé, historique et pièces conservés" }); load();
  };
  const exportCsv = async () => {
    const all: any[] = [];
    for (let from = 0; ; from += 1000) {
      let r = db.from("ent_crm_leads").select("*").eq("company_id", companyId).is("archived_at", null);
      if (q) r = r.or(`title.ilike.%${q.replace(/[,()%]/g, "")}%,contact_name.ilike.%${q.replace(/[,()%]/g, "")}%,need.ilike.%${q.replace(/[,()%]/g, "")}%`);
      if (stage) r = r.eq("stage", stage); if (source) r = r.eq("source", source);
      const { data } = await r.order("created_at", { ascending: false }).range(from, from + 999); all.push(...(data ?? [])); if (!data || data.length < 1000) break;
    }
    const blob = new Blob([toCsv(all.map(({ trade_fields, ...r }) => ({ ...r, trade_fields: JSON.stringify(trade_fields) })))], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "leads.csv"; a.click(); };
  const previewCsv = async (f: File) => { const rows = parseCsv(await f.text()); if (!rows.length) return toast({ title: "Fichier vide ou invalide", variant: "destructive" });
    const heads = Object.keys(rows[0]);
    const existing = (await db.from("ent_crm_leads").select("title,contact_value").eq("company_id", companyId)).data ?? []; const guess = (c: string[]) => heads.find((h) => c.includes(h)) ?? "";
    setImporting({ rows, heads, map: { title: guess(["titre", "nom", "title", "name"]), contact_name: guess(["contact", "personne"]), contact_value: guess(["telephone", "téléphone", "courriel", "email", "phone"]), need: guess(["besoin", "need", "description"]) }, existing, dupMode: "ignorer", ignored: heads.filter((h) => /company|entreprise_id|owner|compagnie/.test(h)) }); };
  const analyse = (imp: any) => { const m = imp.map; const seen = new Set(imp.existing.map((e: any) => normalize(e.contact_value) || normalize(e.title)));
    return imp.rows.map((r: any, i: number) => { const title = (r[m.title] || r[m.contact_name] || "").trim(); const contact = (r[m.contact_value] ?? "").trim(); const key = normalize(contact) || normalize(title);
      let status = "valide", why = "";
      if (!title) { status = "invalide"; why = "nom/titre manquant"; } else if (contact && !PHONE.test(contact) && !MAIL.test(contact)) { status = "invalide"; why = `« ${contact} » n'est ni un téléphone ni un courriel`; } else if (seen.has(key)) { status = "doublon"; why = "fiche existante avec le même contact/nom"; }
      if (status !== "invalide") seen.add(key);
      return { line: i + 2, title, nom: (r[m.contact_name] ?? "").trim(), contact, besoin: (r[m.need] ?? "").trim(), status, why }; }); };
  const importCsv = async () => { if (!importing) return; const m = importing.map;
    void m; const recs = analyse(importing); const dupMode = importing.dupMode; setImporting(null);
    let ok = 0, dup = 0, bad = 0;
    for (const r of recs) {
      if (r.status === "invalide") { bad++; continue; }
      if (r.status === "doublon" && dupMode !== "creer") { dup++; continue; }
      // company_id vient toujours de l'entreprise active validée par le serveur (RLS), jamais du fichier.
      const { error } = await db.from("ent_crm_leads").insert({ company_id: companyId, title: r.title, contact_name: r.nom || null, contact_value: r.contact || null, need: r.besoin || null, source: "import" });
      error ? bad++ : ok++;
    }
    toast({ title: "Import terminé", description: `${ok} ajoutés · ${dup} doublons ignorés · ${bad} invalides. Aucun message envoyé.` }); load();
  };
  const pages = Math.max(1, Math.ceil(count / PAGE));
  return <div>
    <div className="mb-3 flex flex-wrap gap-2">
      <Input placeholder="Rechercher…" defaultValue={q} onKeyDown={(e) => e.key === "Enter" && setF("q", (e.target as HTMLInputElement).value)} className="h-10 w-full sm:w-60" />
      <select className={sel} value={stage} onChange={(e) => setF("stage", e.target.value)}><option value="">Toutes étapes</option>{stages.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
      <select className={sel} value={source} onChange={(e) => setF("source", e.target.value)}><option value="">Toutes provenances</option>{SOURCES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
      <select className={sel} value={sort} onChange={(e) => setF("sort", e.target.value)}><option value="recent">Plus récents</option><option value="ancien">Plus anciens</option><option value="relance">Prochaine relance</option><option value="montant">Montant</option></select>
      <select className={sel} value={view} onChange={(e) => setView(e.target.value as any)}><option value="liste">Liste</option><option value="kanban">Kanban</option></select>
      {canWrite && <Button onClick={() => setOpen({})}><Plus className="mr-1 h-4 w-4" />Nouveau lead</Button>}
      {canWrite && <Button variant="outline" onClick={saveView}>Enregistrer la vue</Button>}
      <Button variant="outline" onClick={exportCsv}><Download className="mr-1 h-4 w-4" />Exporter</Button>
      {canWrite && <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-border px-3 text-sm"><Upload className="mr-1 h-4 w-4" />Importer CSV<input type="file" accept=".csv" hidden onChange={(e) => { e.target.files?.[0] && previewCsv(e.target.files[0]); e.target.value = ""; }} /></label>}
    </div>
    {views.length > 0 && <div className="mb-2 flex flex-wrap gap-1">{views.map((v) => <span key={v.id} className="inline-flex items-center rounded-full border border-border text-xs"><button className="px-3 py-1.5" onClick={() => { const n = new URLSearchParams(v.params); n.set("tab", "leads"); const su = params.get("support_user"); if (su) n.set("support_user", su); setParams(n); }}>{v.name}</button>{canWrite && <button aria-label="Mettre à jour la vue avec les filtres actuels" className="px-1" onClick={async () => { const p = new URLSearchParams(params); p.delete("page"); p.delete("support_user"); const { error } = await db.from("ent_crm_saved_views").update({ params: p.toString() }).eq("id", v.id); if (error) toast({ title: "Refusé", description: error.message }); else toast({ title: "Vue mise à jour" }); loadViews(); }}>↻</button>}{canWrite && <button aria-label="Supprimer la vue" className="px-2" onClick={async () => { await db.from("ent_crm_saved_views").delete().eq("id", v.id); loadViews(); }}>×</button>}</span>)}</div>}
    {importing && <div className="mb-3 rounded-lg border border-border bg-card p-3 text-sm"><p className="font-display font-bold">Import : {importing.rows.length} ligne(s) — correspondance des colonnes</p>
      {(["title", "contact_name", "contact_value", "need"] as const).map((k) => <label key={k} className="mt-1 flex items-center gap-2"><span className="w-40">{{ title: "Nom / titre *", contact_name: "Personne contact", contact_value: "Téléphone / courriel", need: "Besoin" }[k]}</span><select className={sel} value={importing.map[k]} onChange={(e) => setImporting({ ...importing, map: { ...importing.map, [k]: e.target.value } })}><option value="">(aucune)</option>{importing.heads.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>)}
      {importing.ignored.length > 0 && <p className="mt-2 text-xs text-destructive">Colonne(s) ignorée(s) : {importing.ignored.join(", ")}. L'entreprise propriétaire est toujours l'entreprise active, jamais une valeur du fichier.</p>}
      <div className="mt-2 max-h-60 overflow-auto"><table className="w-full text-xs"><tbody>{analyse(importing).map((r: any) => <tr key={r.line} className="border-t border-border"><td className="p-1">L{r.line}</td><td className="p-1">{r.title || "—"}</td><td className="p-1">{r.contact}</td><td className={`p-1 font-semibold ${r.status === "invalide" ? "text-destructive" : r.status === "doublon" ? "text-muted-foreground" : "text-primary"}`}>{r.status}</td><td className="p-1 text-muted-foreground">{r.why}</td></tr>)}</tbody></table></div>
      {analyse(importing).some((r: any) => r.status === "doublon") && <label className="mt-2 flex items-center gap-2 text-xs">Doublons :<select aria-label="Traitement des doublons" className={sel} value={importing.dupMode} onChange={(e) => setImporting({ ...importing, dupMode: e.target.value })}><option value="ignorer">Ignorer (aucune fiche modifiée)</option><option value="creer">Créer quand même une nouvelle fiche</option></select></label>}
      <p className="mt-2 text-xs text-muted-foreground">Aucune fiche existante n'est écrasée. Aucun courriel, SMS, compte ni invitation n'est créé.</p>
      <div className="mt-2 flex gap-2"><Button size="sm" disabled={!importing.map.title} onClick={importCsv}>Importer</Button><Button size="sm" variant="outline" onClick={() => setImporting(null)}>Annuler</Button></div></div>}
    <p className="mb-2 text-xs text-muted-foreground">{count} résultat(s)</p>
    {view === "kanban" ? (
      <div className="flex gap-3 overflow-x-auto pb-2">{stages.map((s) => <div key={s.v} className="w-60 shrink-0 rounded-lg bg-muted/40 p-2"><p className="mb-2 font-display text-sm font-bold">{s.l}</p>
        {rows.filter((r) => r.stage === s.v).map((r) => <LeadCard key={r.id} r={r} stages={stages} canWrite={canWrite} move={move} convert={convert} edit={() => setOpen(r)} />)}</div>)}</div>
    ) : <div className="grid gap-2">{rows.map((r) => <LeadCard key={r.id} r={r} stages={stages} canWrite={canWrite} move={move} convert={convert} edit={() => setOpen(r)} />)}</div>}
    <div className="mt-3 flex items-center gap-2 text-sm"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setF("page", String(page - 1))}>Précédent</Button>Page {page}/{pages}<Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setF("page", String(page + 1))}>Suivant</Button></div>
    {open && <LeadDialog lead={open} companyId={companyId} clients={clients} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
  </div>;
}

function LeadCard({ r, stages, canWrite, move, convert, edit }: any) {
  return <div className="mb-2 rounded-lg border border-border bg-card p-3 text-sm">
    <button className="text-left font-display font-bold hover:underline" onClick={edit}>{r.title}</button>
    <p className="text-xs text-muted-foreground">{label(stages, r.stage)} · {r.contact_name} {r.contact_value} · {label(SOURCES, r.source)}{r.network_ref ? " · Réseau Vrac Québec" : ""}</p>
    {r.need && <p className="mt-1 line-clamp-2">{r.need}</p>}
    <p className="mt-1 text-xs">Prochaine action : {r.next_action || "—"} {r.next_action_at ? `(${new Date(r.next_action_at).toLocaleDateString("fr-CA")})` : ""}</p>
    {r.estimated_amount != null && <p className="text-xs">Estimé : {money(Number(r.estimated_amount))}</p>}
    {r.lost_reason && <p className="text-xs text-destructive">Perdu : {r.lost_reason}</p>}
    {canWrite && <div className="mt-2 flex flex-wrap gap-1">
      <select aria-label="Étape" className="h-9 rounded border border-border bg-background text-xs" value={r.stage} onChange={(e) => move(r, e.target.value)}>{stages.map((s: any) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
      {!r.client_id ? <Button size="sm" variant="outline" onClick={() => convert(r)}>Convertir en client</Button> : <span className="self-center text-xs text-emerald-700 dark:text-emerald-400">Client lié</span>}
    </div>}
    {r.network_ref && <NetworkStatus leadId={r.id} />}
    <FilesBtn t="lead" id={r.id} />
  </div>;
}

function LeadDialog({ lead, companyId, clients, onClose, onSaved }: any) {
  const [f, setF] = useState<any>({ source: "appel", trade: "", trade_fields: {}, ...lead });
  const [dups, setDups] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const loadTasks = useCallback(async () => { if (lead.id) setTasks((await db.from("ent_crm_tasks").select("*").eq("lead_id", lead.id).order("created_at")).data ?? []); }, [lead.id]);
  useEffect(() => { void loadTasks(); }, [loadTasks]);
  const set = (k: string, v: any) => { crmDirty = companyId; setF((x: any) => ({ ...x, [k]: v })); };
  useEffect(() => () => { crmDirty = null; }, []);
  useEffect(() => { const n = normalize(f.contact_value); if (!n || n.length < 5 || lead.id) return setDups([]);
    db.from("ent_crm_leads").select("id,title,contact_value").eq("company_id", companyId).then(({ data }: any) => setDups((data ?? []).filter((d: any) => normalize(d.contact_value) === n))); }, [f.contact_value, companyId, lead.id]);
  const save = async () => {
    if (!f.title?.trim()) return toast({ title: "Nom requis", variant: "destructive" });
    const row = { company_id: companyId, title: f.title, contact_name: f.contact_name || null, contact_value: f.contact_value || null, need: f.need || null, source: f.source, trade: f.trade || null, trade_fields: f.trade_fields, priority: f.priority || "normale", estimated_amount: f.estimated_amount === "" || f.estimated_amount == null ? null : Number(f.estimated_amount), next_action: f.next_action || null, next_action_at: f.next_action_at || null, client_id: f.client_id || null, updated_at: new Date().toISOString() };
    const { error } = lead.id ? await db.from("ent_crm_leads").update(row).eq("id", lead.id) : await db.from("ent_crm_leads").insert(row);
    if (error) toast({ title: "Refusé", description: error.message, variant: "destructive" }); else onSaved();
  };
  const addTask = async () => { const title = prompt("Tâche / relance ?"); const due = prompt("Échéance (AAAA-MM-JJ) ?"); if (!title) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await db.from("ent_crm_tasks").insert({ company_id: companyId, title, due_at: due || null, lead_id: lead.id, assignee_user_id: u.user?.id }); toast({ title: error ? "Refusé" : "Tâche ajoutée", description: error?.message }); loadTasks(); };
  return <Dialog open onOpenChange={onClose}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{lead.id ? "Lead" : "Nouveau lead"}</DialogTitle></DialogHeader>
    <div className="grid gap-2">
      <Input placeholder="Nom / titre *" value={f.title ?? ""} onChange={(e) => set("title", e.target.value)} />
      <Input placeholder="Personne contact" value={f.contact_name ?? ""} onChange={(e) => set("contact_name", e.target.value)} />
      <Input placeholder="Téléphone ou courriel" value={f.contact_value ?? ""} onChange={(e) => set("contact_value", e.target.value)} />
      {dups.length > 0 && <p className="text-xs text-amber-700">Doublon probable dans votre CRM : {dups.map((d) => d.title).join(", ")}</p>}
      <Textarea placeholder="Besoin" value={f.need ?? ""} onChange={(e) => set("need", e.target.value)} />
      <select className={sel} value={f.source} onChange={(e) => set("source", e.target.value)}>{SOURCES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
      <select className={sel} value={f.client_id ?? ""} onChange={(e) => set("client_id", e.target.value)}><option value="">Aucun client lié</option>{clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <select className={sel} value={f.priority ?? "normale"} onChange={(e) => set("priority", e.target.value)}><option value="basse">Priorité basse</option><option value="normale">Normale</option><option value="haute">Haute</option></select>
      <Input type="number" placeholder="Budget / montant estimé (si connu)" value={f.estimated_amount ?? ""} onChange={(e) => set("estimated_amount", e.target.value)} />
      <Input placeholder="Prochaine action" value={f.next_action ?? ""} onChange={(e) => set("next_action", e.target.value)} />
      <Input type="date" value={(f.next_action_at ?? "").slice(0, 10)} onChange={(e) => set("next_action_at", e.target.value)} />
      <select className={sel} value={f.trade ?? ""} onChange={(e) => set("trade", e.target.value)}><option value="">Métier (optionnel)</option>{Object.entries(TRADES).map(([k, t]) => <option key={k} value={k}>{t.l}</option>)}</select>
      {f.trade && TRADES[f.trade]?.fields.map((x) => <Input key={x.k} placeholder={x.l} value={f.trade_fields?.[x.k] ?? ""} onChange={(e) => set("trade_fields", { ...f.trade_fields, [x.k]: e.target.value })} />)}
      {lead.id && <div className="rounded border border-border p-2 text-xs"><p className="font-semibold">Tâches et relances</p>{tasks.length === 0 ? <p className="text-muted-foreground">Aucune</p> : tasks.map((t) => <p key={t.id}>{t.done_at ? "✓" : "•"} {t.title}{t.due_at ? ` (${t.due_at.slice(0, 10)})` : ""}{t.result ? ` — Résultat : ${t.result}` : ""}</p>)}</div>}
      <div className="flex gap-2"><Button onClick={save}>Enregistrer</Button>{lead.id && <Button variant="outline" onClick={addTask}>Ajouter une relance</Button>}</div>
    </div></DialogContent></Dialog>;
}

function Clients({ companyId, canWrite }: any) {
  const [rows, setRows] = useState<any[]>([]); const [q, setQ] = useState(""); const [open, setOpen] = useState<any>(null);
  const load = useCallback(async () => setRows((await db.from("ent_crm_clients").select("*, ent_crm_contacts(*), ent_crm_projects(id,name), ent_crm_leads(id,title,stage)").eq("company_id", companyId).is("archived_at", null).order("name")).data ?? []), [companyId]);
  useEffect(() => { void load(); }, [load]);
  const add = async () => { const name = prompt("Nom du client ?"); if (!name) return; const kind = prompt("Type : particulier, entreprise ou organisme", "particulier") || "particulier";
    const { error } = await db.from("ent_crm_clients").insert({ company_id: companyId, name, kind }); error ? toast({ title: "Refusé", description: error.message, variant: "destructive" }) : load(); };
  const addContact = async (c: any) => { const name = prompt("Nom du contact ?"); if (!name) return; const phone = prompt("Téléphone ?") || null; const email = prompt("Courriel ?") || null;
    const { error } = await db.from("ent_crm_contacts").insert({ company_id: companyId, client_id: c.id, name, phone, email }); error ? toast({ title: "Refusé", description: error.message }) : load(); };
  const [jsc, setJsc] = useState<any[] | null>(null); const [refs, setRefs] = useState<Record<string, any>>({});
  useEffect(() => { rows.filter((r) => r.jsc_client_id && !refs[r.id]).forEach((r) => db.rpc("entcrm_jsc_client_refs", { _client_id: r.id }).then(({ data }: any) => setRefs((x) => ({ ...x, [r.id]: data })))); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const openJsc = async () => { const { data, error } = await db.rpc("entcrm_jsc_candidates", { _company_id: companyId }); if (error) return toast({ title: "Refusé", description: error.message, variant: "destructive" }); setJsc(data ?? []); };
  const linkJsc = async (j: any) => { const { error } = await db.rpc("entcrm_link_jsc_client", { _company_id: companyId, _jsc_client_id: j.jsc_client_id }); if (error) return toast({ title: "Refusé", description: error.message, variant: "destructive" }); toast({ title: "Client rattaché", description: "Même dossier réutilisé, sans ressaisie." }); setJsc(null); load(); };
  const archive = async (c: any) => { if (!confirm("Archiver ce client ?")) return; await db.from("ent_crm_clients").update({ archived_at: new Date().toISOString() }).eq("id", c.id); load(); };
  const shown = rows.filter((r) => !q || normalize(`${r.name}${r.email}${r.phone}`).includes(normalize(q)));
  return <div><div className="mb-3 flex flex-wrap gap-2"><Input placeholder="Rechercher un client" value={q} onChange={(e) => setQ(e.target.value)} className="h-10 w-full sm:w-60" />{canWrite && <Button onClick={add}><Plus className="mr-1 h-4 w-4" />Nouveau client</Button>}{canWrite && <Button variant="outline" onClick={openJsc}>Clients existants (Transport JSC)</Button>}</div>
    {jsc && <Dialog open onOpenChange={() => setJsc(null)}><DialogContent><DialogHeader><DialogTitle>Rattacher un client existant</DialogTitle></DialogHeader>
      <p className="text-xs text-muted-foreground">Seuls les dossiers clients appartenant à votre entreprise sont listés. Le rattachement est explicite : aucun rapprochement automatique par nom, téléphone ou courriel.</p>
      <div className="max-h-80 overflow-y-auto">{jsc.length === 0 ? <p className="text-sm text-muted-foreground">Aucun dossier client existant pour cette entreprise.</p> : jsc.map((j) => <div key={j.jsc_client_id} className="flex items-center justify-between gap-2 border-t border-border py-2 text-sm"><div><p className="font-semibold">{j.name}</p><p className="text-xs text-muted-foreground">{[j.contact_name, j.phone, j.email, j.city].filter(Boolean).join(" · ")}</p></div>{j.linked_client_id ? <span className="text-xs text-muted-foreground">Déjà rattaché</span> : <Button size="sm" onClick={() => linkJsc(j)}>Utiliser</Button>}</div>)}</div>
    </DialogContent></Dialog>}
    <div className="grid gap-2 md:grid-cols-2">{shown.map((c) => <div key={c.id} className="rounded-lg border border-border bg-card p-3 text-sm">
      <p className="font-display font-bold">{c.name} <span className="text-xs font-normal text-muted-foreground">({c.kind})</span>{c.jsc_client_id && <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs font-normal">Dossier Transport JSC</span>}</p>
      {c.jsc_client_id && refs[c.id] && <p className="text-xs text-muted-foreground">Historique existant : {refs[c.id].requests} demande(s) · {refs[c.id].quotes} soumission(s) · {refs[c.id].orders} commande(s) · {refs[c.id].invoices} facture(s)</p>}
      <p className="text-xs text-muted-foreground">{c.phone} {c.email} {c.address} {c.city}</p>
      <p className="mt-1 text-xs"><strong>Contacts :</strong> {c.ent_crm_contacts.map((x: any) => `${x.name}${x.phone ? " " + x.phone : ""}`).join(" · ") || "—"}</p>
      <p className="text-xs"><strong>Opportunités :</strong> {c.ent_crm_leads.map((x: any) => x.title).join(" · ") || "—"}</p>
      <p className="text-xs"><strong>Chantiers :</strong> {c.ent_crm_projects.map((x: any) => x.name).join(" · ") || "—"}</p>
      {canWrite && <div className="mt-2 flex flex-wrap gap-1"><Button size="sm" variant="outline" onClick={() => addContact(c)}>+ Contact</Button><Button size="sm" variant="outline" onClick={async () => { const title = prompt("Nouvelle opportunité ?"); if (!title) return; const { error } = await db.from("ent_crm_leads").insert({ company_id: companyId, client_id: c.id, title, contact_name: c.name, contact_value: c.phone || c.email, source: "autre" }); if (error) toast({ title: "Refusé", description: error.message }); load(); }}>+ Opportunité</Button><Button size="sm" variant="outline" onClick={() => setOpen(c)}>Modifier</Button><Button size="sm" variant="ghost" onClick={() => archive(c)}>Archiver</Button></div>}
      <FilesBtn t="client" id={c.id} />
    </div>)}</div>
    {open && <Dialog open onOpenChange={() => setOpen(null)}><DialogContent><DialogHeader><DialogTitle>{open.name}</DialogTitle></DialogHeader>
      {open.jsc_client_id && <p className="text-xs text-muted-foreground">Identité gérée par le dossier client Transport JSC (source d'autorité) : non modifiable ici pour éviter deux versions divergentes.</p>}
      {["name", "phone", "email", "address", "city"].map((k) => <Input key={k} disabled={!!open.jsc_client_id} placeholder={k} value={open[k] ?? ""} onChange={(e) => setOpen({ ...open, [k]: e.target.value })} />)}
      <Textarea placeholder="Notes internes" value={open.notes ?? ""} onChange={(e) => setOpen({ ...open, notes: e.target.value })} />
      <Button onClick={async () => { const { id, name, phone, email, address, city, notes } = open; const { error } = await db.from("ent_crm_clients").update({ name, phone, email, address, city, notes, updated_at: new Date().toISOString() }).eq("id", id); if (error) toast({ title: "Refusé", description: error.message }); else { setOpen(null); load(); } }}>Enregistrer</Button>
    </DialogContent></Dialog>}
  </div>;
}

function Quotes({ companyId, companyName, canWrite }: any) {
  const [rows, setRows] = useState<any[]>([]); const [clients, setClients] = useState<any[]>([]); const [open, setOpen] = useState<any>(null); const [print, setPrint] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]); const [tpls, setTpls] = useState<any[]>([]); const [diff, setDiff] = useState<any[] | null>(null); const [printDocs, setPrintDocs] = useState<string[]>([]);
  const load = useCallback(async () => { setRows((await db.from("ent_crm_quotes").select("*, ent_crm_clients(name), ent_crm_projects(id)").eq("company_id", companyId).order("created_at", { ascending: false })).data ?? []);
    setClients((await db.from("ent_crm_clients").select("id,name").eq("company_id", companyId).is("archived_at", null)).data ?? []);
    setServices((await db.from("ent_crm_services").select("id,label,unit,price,inclusions,exclusions").eq("company_id", companyId).is("archived_at", null).order("label")).data ?? []);
    if (canWrite) await ensureTemplates(companyId);
    setTpls((await db.from("ent_crm_templates").select("*").eq("company_id", companyId).is("archived_at", null).order("name")).data ?? []); }, [companyId, canWrite]);
  useEffect(() => { void load(); }, [load]);
  const save = async () => { const lines: QLine[] = open.lines ?? []; const row = { company_id: companyId, client_id: open.client_id || null, lead_id: open.lead_id || null, number: open.number || null, lines, inclusions: open.inclusions || null, exclusions: open.exclusions || null, conditions: open.conditions || null, valid_until: open.valid_until || null, subtotal: subtotal(lines), updated_at: new Date().toISOString() };
    const { error } = open.id ? await db.from("ent_crm_quotes").update(row).eq("id", open.id) : await db.from("ent_crm_quotes").insert(row);
    if (error) toast({ title: "Refusé", description: error.message, variant: "destructive" }); else { crmDirty = null; setOpen(null); load(); } };
  const edit = (v: any) => { crmDirty = "quote"; setOpen(v); };
  const applyTpl = (id: string) => { const t = tpls.find((x) => x.id === id); if (!t) return; if ((open.lines ?? []).some((l: QLine) => l.desc) && !confirm("Remplacer les lignes actuelles par celles du modèle ?")) return;
    edit({ ...open, lines: (t.lines as QLine[]).map((l) => ({ ...l, qty: null, price: null })), inclusions: t.inclusions, exclusions: t.exclusions, conditions: t.conditions }); };
  const addService = (id: string) => { const s = services.find((x) => x.id === id); if (!s) return;
    edit({ ...open, lines: [...(open.lines ?? []).filter((l: QLine) => l.desc || l.price != null), { desc: s.label, qty: null, unit: s.unit, price: s.price == null ? null : Number(s.price), service_id: s.id, price_at: new Date().toISOString() }] }); };
  // Actualisation explicite des tarifs sur un brouillon : différences présentées avant application.
  const refreshPrices = () => { const d = (open.lines as QLine[]).map((l, i) => { const s = l.service_id && services.find((x) => x.id === l.service_id); if (!s) return null; const np = s.price == null ? null : Number(s.price); return np !== l.price ? { i, desc: l.desc, old: l.price, next: np } : null; }).filter(Boolean);
    if (!d.length) return toast({ title: "Tarifs à jour", description: "Aucune différence avec le catalogue privé." }); setDiff(d); };
  const applyDiff = () => { const lines = [...open.lines]; diff!.forEach((d: any) => { lines[d.i] = { ...lines[d.i], price: d.next, price_at: new Date().toISOString() }; }); edit({ ...open, lines }); setDiff(null); };
  const setStatus = async (q: any, status: string) => {
    if (status === "remise" && incomplete(q.lines ?? [])) return toast({ title: "Soumission incomplète", description: `${incomplete(q.lines)} ligne(s) sans quantité ou prix.` });
    if (status === "acceptee") { const src = prompt("Source de l'acceptation (signature, courriel, appel…) ?"); const by = prompt("Accepté par (nom du client) ?"); if (!src || !by) return;
      const { error } = await db.rpc("entcrm_accept_quote", { _quote_id: q.id, _source: src, _by: by }); if (error) return toast({ title: "Refusé", description: error.message });
    } else await db.from("ent_crm_quotes").update({ status }).eq("id", q.id);
    load(); };
  const toProject = async (q: any) => { const name = prompt("Nom du chantier ?", q.ent_crm_clients?.name ?? "Chantier"); if (!name) return;
    const { data, error } = await db.from("ent_crm_projects").insert({ company_id: companyId, client_id: q.client_id, quote_id: q.id, name }).select("id").single();
    if (!error && data) await copyLinks(companyId, [{ t: "quote", id: q.id }, ...(q.lead_id ? [{ t: "lead", id: q.lead_id }] : [])], { t: "project", id: data.id });
    toast({ title: error ? "Refusé" : "Chantier créé avec les pièces de la soumission", description: error?.message.includes("duplicate") ? "Un chantier existe déjà pour cette soumission." : error?.message }); load(); };
  const revise = async (q: any) => { const { id, created_at, updated_at, ent_crm_clients, ent_crm_projects, accepted_source, accepted_by_name, accepted_at, accepted_recorded_by, invoiced_amount, paid_amount, ...rest } = q;
    const { error } = await db.from("ent_crm_quotes").insert({ ...rest, status: "brouillon", version: q.version + 1, parent_quote_id: q.id }); toast({ title: error ? "Refusé" : "Révision créée (la version acceptée reste inchangée)", description: error?.message }); load(); };
  const fin = async (q: any, k: string) => { const v = prompt(k === "invoiced_amount" ? "Montant facturé ?" : "Montant encaissé ?"); if (v == null) return; await db.from("ent_crm_quotes").update({ [k]: v === "" ? null : Number(v) }).eq("id", q.id); load(); };
  const openPrint = async (q: any) => { const { data } = await db.from("ent_crm_file_links").select("file:ent_crm_files(title,file_name)").eq("owner_type", "quote").eq("owner_id", q.id).eq("client_visible", true);
    setPrintDocs((data ?? []).map((d: any) => d.file?.title || d.file?.file_name).filter(Boolean)); setPrint(q); };
  if (print) { const lines = print.lines as QLine[]; const st = subtotal(lines);
    return <div className="print:p-0"><Button className="print:hidden mb-3" onClick={() => window.print()}>Télécharger / imprimer en PDF</Button> <Button variant="outline" className="print:hidden mb-3" onClick={() => setPrint(null)}>Fermer</Button>
    <div className="rounded border border-border bg-card p-6 text-sm"><p className="font-display text-lg font-bold">{companyName}</p><h2 className="font-display text-xl font-bold">Soumission {print.number ?? ""} (v{print.version})</h2><p>Client : {print.ent_crm_clients?.name ?? "—"}</p>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-xs sm:text-sm [&_th]:whitespace-nowrap [&_th]:pr-1.5 [&_td]:pr-1.5 [&_td:not(:first-child)]:whitespace-nowrap"><thead><tr className="text-left"><th>Description</th><th>Qté</th><th>Unité</th><th>Prix</th><th>Total</th></tr></thead><tbody>{lines.map((l, i) => <tr key={i}><td>{l.section ? `${l.section} — ` : ""}{l.desc}</td><td>{l.qty ?? "À compléter"}</td><td>{unitLabel(l.unit)}</td><td>{l.price == null ? "À renseigner" : money(l.price)}</td><td>{lineTotal(l) == null ? "—" : money(lineTotal(l))}</td></tr>)}</tbody></table></div>
      <p className="mt-2 font-bold">Sous-total avant taxes : {money(st)}</p><p className="text-xs text-muted-foreground">Taxes applicables selon votre inscription (TPS/TVQ), non calculées ici : aucun taux n'est saisi dans le CRM.</p>
      {incomplete(lines) > 0 && <p className="text-xs text-destructive">{incomplete(lines)} ligne(s) à compléter : montant partiel.</p>}
      {print.inclusions && <p className="mt-2"><strong>Inclusions :</strong> {print.inclusions}</p>}{print.exclusions && <p><strong>Exclusions :</strong> {print.exclusions}</p>}{print.conditions && <p><strong>Conditions :</strong> {print.conditions}</p>}{print.valid_until && <p>Valide jusqu'au {print.valid_until}</p>}
      {printDocs.length > 0 && <p className="mt-2"><strong>Pièces jointes :</strong> {printDocs.join(", ")}</p>}</div></div>; }
  return <div>{canWrite && <Button className="mb-3" onClick={() => edit({ lines: [] })}><Plus className="mr-1 h-4 w-4" />Nouvelle soumission</Button>}
    <div className="grid gap-2">{rows.map((q) => <div key={q.id} className="rounded-lg border border-border bg-card p-3 text-sm">
      <p className="font-display font-bold">{q.number || "Soumission"} · {q.ent_crm_clients?.name ?? "Sans client"} · v{q.version} · <span className="uppercase">{q.status}</span></p>
      <p className="text-xs">Estimé : {money(Number(q.subtotal))} · Facturé : {money(q.invoiced_amount)} · Encaissé : {money(q.paid_amount)}</p>
      {q.accepted_at && <p className="text-xs text-muted-foreground">Acceptée par {q.accepted_by_name} ({q.accepted_source}) le {new Date(q.accepted_at).toLocaleString("fr-CA")}</p>}
      <div className="mt-2 flex flex-wrap gap-1">
        <Button size="sm" variant="outline" onClick={() => openPrint(q)}>PDF</Button>
        {canWrite && q.status === "brouillon" && <><Button size="sm" variant="outline" onClick={() => edit(q)}>Modifier</Button><Button size="sm" variant="outline" onClick={() => setStatus(q, "remise")}>Marquer remise</Button></>}
        {canWrite && q.status === "remise" && <><Button size="sm" onClick={() => setStatus(q, "acceptee")}>Accepter (documenter)</Button><Button size="sm" variant="outline" onClick={() => setStatus(q, "refusee")}>Refusée</Button></>}
        {canWrite && q.status === "acceptee" && !(Array.isArray(q.ent_crm_projects) ? q.ent_crm_projects.length : q.ent_crm_projects) && <Button size="sm" onClick={() => toProject(q)}>Créer le chantier</Button>}
        {canWrite && q.status === "acceptee" && <><Button size="sm" variant="outline" onClick={() => revise(q)}>Réviser</Button><Button size="sm" variant="ghost" onClick={() => fin(q, "invoiced_amount")}>Facturé</Button><Button size="sm" variant="ghost" onClick={() => fin(q, "paid_amount")}>Encaissé</Button></>}
      </div>
      <FilesBtn t="quote" id={q.id} clientToggle /></div>)}</div>
    {open && <Dialog open onOpenChange={() => { if (!confirm("Fermer sans enregistrer ?")) return; crmDirty = null; setOpen(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Soumission</DialogTitle></DialogHeader>
      <select className={sel} value={open.client_id ?? ""} onChange={(e) => edit({ ...open, client_id: e.target.value })}><option value="">Client…</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <Input placeholder="Numéro" value={open.number ?? ""} onChange={(e) => edit({ ...open, number: e.target.value })} />
      <div className="grid gap-2 sm:grid-cols-2">
        <select aria-label="Modèle" className={sel} value="" onChange={(e) => applyTpl(e.target.value)}><option value="">Partir d'un modèle métier…</option>{tpls.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <select aria-label="Ajouter une prestation" className={sel} value="" onChange={(e) => addService(e.target.value)}><option value="">+ Prestation de mon catalogue…</option>{services.map((s) => <option key={s.id} value={s.id}>{s.label} ({s.price == null ? "À renseigner" : money(Number(s.price))}/{unitLabel(s.unit)})</option>)}</select>
      </div>
      {(open.lines as QLine[]).map((l, i) => <div key={i} className="grid grid-cols-[1fr_4rem_5.5rem_5.5rem_1.5rem] gap-1">
        <Input aria-label="Description" placeholder={l.section ? `${l.section} — description` : "Description"} value={l.desc} onChange={(e) => { const lines = [...open.lines]; lines[i] = { ...l, desc: e.target.value }; edit({ ...open, lines }); }} />
        <Input aria-label="Quantité" type="number" placeholder="Qté" value={l.qty ?? ""} onChange={(e) => { const lines = [...open.lines]; lines[i] = { ...l, qty: e.target.value === "" ? null : Number(e.target.value) }; edit({ ...open, lines }); }} />
        <select aria-label="Unité" className="h-10 rounded-md border border-border bg-background px-1 text-xs" value={l.unit} onChange={(e) => { const lines = [...open.lines]; lines[i] = { ...l, unit: e.target.value }; edit({ ...open, lines }); }}>{UNITS.map((u) => <option key={u.v} value={u.v}>{u.l}</option>)}{!UNITS.some((u) => u.v === l.unit) && <option value={l.unit}>{l.unit}</option>}</select>
        <Input aria-label="Prix" type="number" placeholder="Prix" value={l.price ?? ""} onChange={(e) => { const lines = [...open.lines]; lines[i] = { ...l, price: e.target.value === "" ? null : Number(e.target.value) }; edit({ ...open, lines }); }} />
        <button aria-label="Retirer la ligne" onClick={() => edit({ ...open, lines: open.lines.filter((_: any, j: number) => j !== i) })}>×</button></div>)}
      <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => edit({ ...open, lines: [...open.lines, { desc: "", qty: null, unit: "unite", price: null }] })}>+ Ligne libre</Button>
        {(open.lines as QLine[]).some((l) => l.service_id) && <Button variant="outline" size="sm" onClick={refreshPrices}>Actualiser les tarifs</Button>}</div>
      {diff && <div className="rounded border border-border p-2 text-xs"><p className="font-semibold">Différences avec le catalogue actuel :</p>{diff.map((d: any) => <p key={d.i}>{d.desc} : {d.old == null ? "À renseigner" : money(d.old)} → {d.next == null ? "À renseigner" : money(d.next)}</p>)}<div className="mt-1 flex gap-1"><Button size="sm" onClick={applyDiff}>Appliquer</Button><Button size="sm" variant="ghost" onClick={() => setDiff(null)}>Ignorer</Button></div></div>}
      <p className="text-sm font-bold">Sous-total : {money(subtotal(open.lines))}{incomplete(open.lines) > 0 && <span className="ml-1 text-xs font-normal text-destructive">({incomplete(open.lines)} ligne(s) à compléter)</span>}</p>
      <Textarea placeholder="Inclusions" value={open.inclusions ?? ""} onChange={(e) => edit({ ...open, inclusions: e.target.value })} />
      <Textarea placeholder="Exclusions" value={open.exclusions ?? ""} onChange={(e) => edit({ ...open, exclusions: e.target.value })} />
      <Textarea placeholder="Conditions / échéancier" value={open.conditions ?? ""} onChange={(e) => edit({ ...open, conditions: e.target.value })} />
      <Input type="date" value={open.valid_until ?? ""} onChange={(e) => edit({ ...open, valid_until: e.target.value })} />
      <Button onClick={save}>Enregistrer</Button></DialogContent></Dialog>}
  </div>;
}

function Projects({ companyId, canWrite }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const load = useCallback(async () => setRows((await db.from("ent_crm_projects").select("*, ent_crm_clients(name)").eq("company_id", companyId).is("archived_at", null).order("created_at", { ascending: false })).data ?? []), [companyId]);
  useEffect(() => { void load(); }, [load]);
  const upd = async (p: any, k: string, v: string) => { const { error } = await db.from("ent_crm_projects").update({ [k]: v || null, updated_at: new Date().toISOString() }).eq("id", p.id); if (error) toast({ title: "Refusé", description: error.message }); load(); };
  return <div className="grid gap-2 md:grid-cols-2">{rows.length === 0 && <p className="text-muted-foreground">Aucun chantier. Créez-en un depuis une soumission acceptée.</p>}{rows.map((p) => <div key={p.id} className="rounded-lg border border-border bg-card p-3 text-sm">
    <p className="font-display font-bold">{p.name}</p><p className="text-xs text-muted-foreground">{p.ent_crm_clients?.name}</p>
    <FilesBtn t="project" id={p.id} />
    {canWrite ? <div className="mt-2 grid gap-1"><Input placeholder="Adresse" defaultValue={p.address ?? ""} onBlur={(e) => e.target.value !== (p.address ?? "") && upd(p, "address", e.target.value)} />
      <div className="flex gap-1"><Input type="date" defaultValue={p.start_date ?? ""} onBlur={(e) => upd(p, "start_date", e.target.value)} /><Input type="date" defaultValue={p.end_date ?? ""} onBlur={(e) => upd(p, "end_date", e.target.value)} /></div>
      <select className={sel} value={p.status} onChange={(e) => upd(p, "status", e.target.value)}>{["a_planifier", "planifie", "en_cours", "termine", "annule"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select></div>
      : <p className="text-xs">{p.address} · {p.status}</p>}
  </div>)}</div>;
}

function Tasks({ companyId, canWrite }: any) {
  const [rows, setRows] = useState<any[]>([]); const [done, setDone] = useState(false);
  const load = useCallback(async () => { let r = db.from("ent_crm_tasks").select("*, ent_crm_leads(title), ent_crm_projects(name), ent_crm_clients(name)").eq("company_id", companyId); r = done ? r.not("done_at", "is", null) : r.is("done_at", null); setRows((await r.order("due_at", { nullsFirst: false })).data ?? []); }, [companyId, done]);
  useEffect(() => { void load(); }, [load]);
  const finish = async (t: any) => { const result = prompt("Résultat ?"); if (result == null) return; const { error } = await db.from("ent_crm_tasks").update({ done_at: new Date().toISOString(), result }).eq("id", t.id); if (error) toast({ title: "Refusé", description: error.message }); load(); };
  const add = async () => { const title = prompt("Tâche ?"); if (!title) return; const due = prompt("Échéance (AAAA-MM-JJ) ?"); const { data: u } = await supabase.auth.getUser();
    const { error } = await db.from("ent_crm_tasks").insert({ company_id: companyId, title, due_at: due || null, assignee_user_id: u.user?.id }); if (error) toast({ title: "Refusé", description: error.message }); load(); };
  return <div><div className="mb-3 flex gap-2">{canWrite && <Button onClick={add}><Plus className="mr-1 h-4 w-4" />Nouvelle tâche</Button>}<Button variant="outline" onClick={() => setDone(!done)}>{done ? "Voir à faire" : "Voir terminées"}</Button></div>
    <div className="grid gap-2">{rows.map((t) => { const late = !t.done_at && t.due_at && new Date(t.due_at) < new Date(); return <div key={t.id} className={`rounded-lg border bg-card p-3 text-sm ${late ? "border-destructive" : "border-border"}`}>
      <p className="font-display font-bold">{t.title}</p><p className="text-xs text-muted-foreground">Échéance : {t.due_at ? new Date(t.due_at).toLocaleDateString("fr-CA") : "—"}{late ? " · EN RETARD" : ""} · Dossier : {t.ent_crm_leads?.title ?? t.ent_crm_projects?.name ?? t.ent_crm_clients?.name ?? "—"}</p>
      {t.result && <p className="text-xs">Résultat : {t.result}</p>}{!t.done_at && <Button size="sm" className="mt-2" onClick={() => finish(t)}>Terminer</Button>}</div>; })}</div></div>;
}

function Reports({ companyId }: any) {
  const [d, setD] = useState<any[]>([]); const [q, setQ] = useState<any[]>([]);
  const { stages } = useStages(companyId);
  useEffect(() => { db.from("ent_crm_quotes").select("status,subtotal,invoiced_amount,paid_amount").eq("company_id", companyId).then(({ data }: any) => setQ(data ?? [])); }, [companyId]);
  const sum = (f: (x: any) => number) => q.reduce((a, x) => a + (f(x) || 0), 0);
  useEffect(() => { db.from("ent_crm_leads").select("stage,source,estimated_amount").eq("company_id", companyId).then(({ data }: any) => setD(data ?? [])); }, [companyId]);
  const by = (k: string, list: readonly any[]) => list.map((s) => ({ l: s.l, n: d.filter((x) => x[k] === s.v).length })).filter((x) => x.n);
  return <div className="grid gap-4 md:grid-cols-2">
    <div className="rounded-lg border border-border bg-card p-4 md:col-span-2"><p className="mb-2 font-display font-bold">Montants</p>{[["Proposé (remis ou accepté)", sum((x) => ["remise", "acceptee"].includes(x.status) ? Number(x.subtotal) : 0)], ["Accepté", sum((x) => x.status === "acceptee" ? Number(x.subtotal) : 0)], ["Facturé", sum((x) => Number(x.invoiced_amount))], ["Encaissé", sum((x) => Number(x.paid_amount))]].map(([l, v]: any) => <p key={l} className="flex justify-between text-sm"><span>{l}</span><span>{money(v)}</span></p>)}</div>
    {[["Par étape", by("stage", stages)], ["Par provenance", by("source", SOURCES)]].map(([t, rows]: any) =>
    <div key={t} className="rounded-lg border border-border bg-card p-4"><p className="mb-2 font-display font-bold">{t}</p>{rows.map((r: any) => <p key={r.l} className="flex justify-between text-sm"><span>{r.l}</span><span>{r.n}</span></p>)}{!rows.length && <p className="text-sm text-muted-foreground">Aucune donnée.</p>}</div>)}</div>;
}

function History({ companyId }: any) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { db.from("ent_crm_history").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(100).then(({ data }: any) => setRows(data ?? [])); }, [companyId]);
  const name = (r: any) => r.after?.title ?? r.after?.name ?? r.before?.title ?? r.before?.name ?? "";
  return <div className="grid gap-1 text-sm">{rows.length === 0 && <p className="text-muted-foreground">Aucun historique visible pour votre rôle.</p>}{rows.map((r) => <p key={r.id} className="border-b border-border py-1">
    <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("fr-CA")}</span> · {r.entity.replace("ent_crm_", "")} · {r.action} {name(r)} {r.origin === "support_vrac_quebec" && <span className="rounded bg-amber-500/15 px-1 text-xs text-amber-800 dark:text-amber-300">Assistance Vrac Québec</span>}</p>)}</div>;
}

const ROLES = [["proprietaire", "Propriétaire"], ["gestionnaire", "Gestionnaire / commercial"], ["comptabilite", "Comptabilité"], ["chauffeur", "Employé terrain / chauffeur"], ["operateur", "Opérateur"], ["mecanicien", "Mécanicien"], ["lecture", "Lecture seule"]] as const;

function Team({ companyId, canAdmin }: any) {
  const [members, setMembers] = useState<any[]>([]); const [err, setErr] = useState("");
  const { stages, reload } = useStages(companyId);
  const [trades, setTrades] = useState<string[]>([]);
  const load = useCallback(async () => { const { data, error } = await db.rpc("entcrm_list_members", { _company_id: companyId }); setErr(error?.message ?? ""); setMembers(data ?? []);
    const st = await db.from("ent_crm_settings").select("trades").eq("company_id", companyId).maybeSingle(); setTrades(st.data?.trades ?? []); }, [companyId]);
  useEffect(() => { void load(); }, [load]);
  const setMember = async (email: string, role: string, active: boolean) => { const { error } = await db.rpc("entcrm_set_member", { _company_id: companyId, _email: email, _role: role, _active: active });
    toast({ title: error ? "Refusé" : "Accès mis à jour", description: error?.message }); load(); };
  const add = async () => { const email = prompt("Courriel d'un compte existant ?"); if (!email) return; const role = prompt(`Rôle (${ROLES.map((r) => r[0]).join(", ")}) ?`, "lecture"); if (role) setMember(email, role, true); };
  const initStages = async () => { const { error } = await db.from("ent_crm_stages").insert(STAGES.map((s, i) => ({ company_id: companyId, key: s.v, label: s.l, position: i, kind: s.v === "gagne" ? "gagnee" : s.v === "perdu" ? "perdue" : "ouverte" }))); if (error) toast({ title: "Refusé", description: error.message }); reload(); };
  const addStage = async () => { const labelTxt = prompt("Nom de l'étape ?"); if (!labelTxt) return; const key = normalize(labelTxt).slice(0, 30) || "etape";
    const { error } = await db.from("ent_crm_stages").insert({ company_id: companyId, key, label: labelTxt, position: stages.length, kind: "ouverte" }); if (error) toast({ title: "Refusé", description: error.message }); reload(); };
  const delStage = async (s: any) => { const rep = prompt(`Étape de remplacement pour les dossiers (${stages.filter((x) => x.v !== s.v).map((x) => x.v).join(", ")}) ?`); if (!rep) return;
    const { error } = await db.rpc("entcrm_delete_stage", { _stage_id: s.id, _replacement: rep }); if (error) toast({ title: "Refusé", description: error.message }); reload(); };
  const saveTrades = async (t: string[]) => { setTrades(t); const { error } = await db.from("ent_crm_settings").upsert({ company_id: companyId, trades: t, updated_at: new Date().toISOString() }); if (error) toast({ title: "Refusé", description: error.message }); };
  const custom = stages.some((s) => s.id);
  const preview = <JscAttachPreview />;
  return <div className="grid gap-6 lg:grid-cols-2">
    <section className="rounded-lg border border-border bg-card p-4"><div className="mb-2 flex items-center justify-between"><h2 className="font-display font-bold">Membres</h2>{canAdmin && <Button size="sm" onClick={add}><Plus className="mr-1 h-4 w-4" />Ajouter</Button>}</div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {members.map((m) => <div key={m.user_id} className="flex flex-wrap items-center gap-2 border-t border-border py-2 text-sm"><span className="min-w-0 flex-1 break-all">{m.email}</span>
        {canAdmin ? <><select aria-label={`Rôle de ${m.email}`} className={sel} value={m.role} onChange={(e) => setMember(m.email, e.target.value, m.is_active)}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}{!ROLES.some((r) => r[0] === m.role) && <option value={m.role}>{m.role}</option>}</select>
          <Button size="sm" variant={m.is_active ? "outline" : "default"} onClick={() => setMember(m.email, ROLES.some((r) => r[0] === m.role) ? m.role : "lecture", !m.is_active)}>{m.is_active ? "Retirer l'accès" : "Rétablir"}</Button></>
          : <span className="text-xs text-muted-foreground">{ROLES.find((r) => r[0] === m.role)?.[1] ?? m.role}{m.is_active ? "" : " · retiré"}</span>}</div>)}
      <p className="mt-2 text-xs text-muted-foreground">Seuls des comptes existants peuvent être ajoutés; aucune invitation n'est envoyée. Aucun rôle d'entreprise ne donne accès aux autres entreprises.</p></section>
    <section className="rounded-lg border border-border bg-card p-4"><div className="mb-2 flex items-center justify-between"><h2 className="font-display font-bold">Étapes commerciales</h2>{canAdmin && (custom ? <Button size="sm" onClick={addStage}><Plus className="mr-1 h-4 w-4" />Étape</Button> : <Button size="sm" onClick={initStages}>Personnaliser</Button>)}</div>
      {stages.map((s) => <div key={s.v} className="flex items-center gap-2 border-t border-border py-2 text-sm"><span className="flex-1">{s.l}</span><span className="text-xs text-muted-foreground">{s.kind}</span>
        {canAdmin && s.id && <><Button size="sm" variant="ghost" onClick={async () => { const l = prompt("Nouveau nom ?", s.l); if (!l) return; await db.from("ent_crm_stages").update({ label: l }).eq("id", s.id); reload(); }}>Renommer</Button><Button size="sm" variant="ghost" onClick={() => delStage(s)}>Retirer</Button></>}</div>)}</section>
    <section className="rounded-lg border border-border bg-card p-4"><h2 className="mb-2 font-display font-bold">Activités de l'entreprise</h2>
      {Object.entries(TRADES).map(([k, t]) => <label key={k} className="flex items-center gap-2 py-1 text-sm"><input type="checkbox" disabled={!canAdmin} checked={trades.includes(k)} onChange={(e) => saveTrades(e.target.checked ? [...trades, k] : trades.filter((x) => x !== k))} />{t.l}</label>)}</section>
  </div>;
}

/** Aperçu super admin du rattachement des clients historiques Transport JSC — lecture seule, rien n'est appliqué. */
function JscAttachPreview() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { db.rpc("entcrm_jsc_attach_preview").then(({ data, error }: any) => !error && setD(data)); }, []);
  if (!d) return null;
  return <section className="mt-6 rounded-lg border border-amber-500/40 p-3 text-sm">
    <h3 className="font-display font-bold">Aperçu : rattachement des clients historiques Transport JSC (aucune application)</h3>
    <p>Clients historiques au total : <strong>{d.total}</strong> · déjà reliés à un dossier CRM : {d.already_linked} · correspondances possibles (même courriel ou téléphone) : {d.possible_matches}</p>
    <p className="mt-1 font-semibold">Entreprise actuellement propriétaire :</p>
    <ul className="list-disc pl-5">{d.by_company.map((c: any) => <li key={c.company_id ?? "none"}>{c.name ?? "Aucune"} — <code className="text-xs">{c.company_id}</code> : {c.n} client(s)</li>)}</ul>
    <p className="mt-1 font-semibold">Entreprises dont le nom contient « JSC » :</p>
    <ul className="list-disc pl-5">{d.jsc_candidates.length ? d.jsc_candidates.map((c: any) => <li key={c.id}>{c.name} — <code className="text-xs">{c.id}</code></li>) : <li>Aucune</li>}</ul>
    <p className="mt-1 text-xs text-muted-foreground">Effet d'un rattachement : le dossier CRM reprendrait l'identité du client historique (source d'autorité) ; les soumissions figées ne seraient jamais réécrites. Décision à prendre explicitement par le super admin.</p>
  </section>;
}

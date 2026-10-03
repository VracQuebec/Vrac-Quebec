// Agenda d'une entreprise (agd_events). Droits vérifiés côté serveur; rappels générés
// par agd_reminders_sweep (application livrée, courriel/texto simulés — aucun envoi réel).
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { TASK_COLORS } from "@/components/todo/TodoBoard";
import { occurrences, type Recurrence } from "@/lib/agenda/occurrences";

const db = supabase as any;
const sel = "h-10 rounded-md border border-border bg-background px-2 text-sm";
const CATS: Record<string, string> = { rendez_vous: "Rendez-vous", chantier: "Chantier", livraison: "Livraison", reunion: "Réunion", appel: "Appel", visite: "Visite", entretien: "Entretien", conge: "Congé", autre: "Autre" };
const STATUS: Record<string, string> = { planifie: "Planifié", confirme: "Confirmé", en_cours: "En cours", termine: "Terminé", annule: "Annulé", reporte: "Reporté" };
const RECS: Record<Recurrence, string> = { aucune: "Aucune", quotidienne: "Chaque jour", hebdomadaire: "Chaque semaine", aux_2_semaines: "Aux 2 semaines", mensuelle: "Chaque mois" };
const CH: Record<string, string> = { app: "Application", email: "Courriel", sms: "Texto" };
const ACTIONS: Record<string, string> = { creation: "Création", transfert: "Transfert", deplacement: "Déplacement", statut: "Statut", archive: "Archivage", reponse: "Réponse" };
const RESP: Record<string, string> = { en_attente: "En attente", accepte: "Accepté", refuse: "Refusé", peut_etre: "Peut-être" };

type Rem = { minutes: number; channels: string[] };
type Att = { id?: string; user_id: string | null; name?: string | null; email?: string | null; phone?: string | null; response?: string };
type Ev = {
  id: string; company_id: string; title: string; description: string | null; location: string | null; category: string; color: string; status: string;
  start_at: string; end_at: string; all_day: boolean; owner_user_id: string | null; client_id: string | null; project_id: string | null; task_id: string | null;
  recurrence: Recurrence; recurrence_until: string | null; reminders: Rem[]; notify_client: boolean;
};
type Edit = Partial<Ev> & { attendees: Att[] };
type Occ = { ev: Ev; at: Date; end: Date };

const toLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const dayKey = (d: Date) => toLocal(d).slice(0, 10);
const startOfWeek = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const hsl = (c: string) => `hsl(${(TASK_COLORS[c] ?? TASK_COLORS.bleu).hsl})`;

export default function AgendaBoard({ companyId, role }: { companyId: string; role: string | null }) {
  const { user } = useAuthReady();
  const canManage = ["support", "proprietaire", "gestionnaire"].includes(role ?? "");
  const canField = canManage || ["mecanicien", "chauffeur", "operateur"].includes(role ?? "");
  const [view, setView] = useState<"jour" | "semaine" | "mois" | "liste">(() => (window.innerWidth < 640 ? "liste" : "semaine"));
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState<Ev[]>([]);
  const [atts, setAtts] = useState<Record<string, Att[]>>({});
  const [members, setMembers] = useState<{ user_id: string; email: string; role: string }[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [tasks, setTasks] = useState<{ id: string; title: string }[]>([]);
  const [fWho, setFWho] = useState(""); const [fCat, setFCat] = useState(""); const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Edit | null>(null); const [log, setLog] = useState<any[]>([]); const [busy, setBusy] = useState(false);

  const range = useMemo(() => {
    const s = new Date(cursor); s.setHours(0, 0, 0, 0);
    if (view === "jour") { const e = new Date(s); e.setDate(e.getDate() + 1); return [s, e]; }
    if (view === "semaine") { const a = startOfWeek(s); const e = new Date(a); e.setDate(e.getDate() + 7); return [a, e]; }
    if (view === "mois") { const a = startOfWeek(new Date(s.getFullYear(), s.getMonth(), 1)); const e = new Date(a); e.setDate(e.getDate() + 42); return [a, e]; }
    const e = new Date(s); e.setDate(e.getDate() + 60); return [s, e];
  }, [cursor, view]);

  const load = useCallback(async () => {
    const [e, a, m, c, p, t] = await Promise.all([
      db.from("agd_events").select("*").eq("company_id", companyId).is("archived_at", null).lt("start_at", range[1].toISOString()).order("start_at").limit(1000),
      db.from("agd_attendees").select("*").eq("company_id", companyId).limit(3000),
      db.rpc("entcrm_list_members", { _company_id: companyId }),
      db.from("ent_crm_clients").select("id,name").eq("company_id", companyId).is("archived_at", null).order("name").limit(300),
      db.from("ent_crm_projects").select("id,name").eq("company_id", companyId).is("archived_at", null).order("name").limit(300),
      db.from("ent_crm_tasks").select("id,title").eq("company_id", companyId).is("archived_at", null).neq("status", "fait").limit(300),
    ]);
    if (e.error) toast({ title: "Chargement impossible", description: e.error.message, variant: "destructive" });
    setEvents(e.data ?? []);
    const g: Record<string, Att[]> = {}; for (const x of a.data ?? []) (g[x.event_id] ||= []).push(x); setAtts(g);
    setMembers((m.data ?? []).filter((x: any) => x.is_active)); setClients(c.data ?? []); setProjects(p.data ?? []); setTasks(t.data ?? []);
  }, [companyId, range]);
  useEffect(() => { load(); }, [load]);

  const who = (id: string | null) => (id ? members.find((m) => m.user_id === id)?.email ?? "Employé" : "Non attribué");

  const occs = useMemo(() => {
    const out: Occ[] = [];
    for (const ev of events) {
      if (fCat && ev.category !== fCat) continue;
      if (fWho === "moi" && ev.owner_user_id !== user?.id && !(atts[ev.id] ?? []).some((a) => a.user_id === user?.id)) continue;
      if (fWho && fWho !== "moi" && ev.owner_user_id !== fWho && !(atts[ev.id] ?? []).some((a) => a.user_id === fWho)) continue;
      if (q && !`${ev.title} ${ev.location ?? ""} ${ev.description ?? ""}`.toLowerCase().includes(q.toLowerCase())) continue;
      const dur = new Date(ev.end_at).getTime() - new Date(ev.start_at).getTime();
      for (const at of occurrences(ev.start_at, ev.recurrence, ev.recurrence_until, new Date(range[0].getTime() - dur), range[1])) out.push({ ev, at, end: new Date(at.getTime() + dur) });
    }
    return out.sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [events, atts, fCat, fWho, q, range, user?.id]);

  const byDay = useMemo(() => { const m: Record<string, Occ[]> = {}; for (const o of occs) (m[dayKey(o.at)] ||= []).push(o); return m; }, [occs]);

  const move = (dir: number) => { const d = new Date(cursor); if (view === "jour") d.setDate(d.getDate() + dir); else if (view === "mois") d.setMonth(d.getMonth() + dir); else d.setDate(d.getDate() + 7 * dir); setCursor(d); };

  const openNew = (day?: Date) => {
    const s = day ? new Date(day) : new Date(); if (day) s.setHours(9, 0, 0, 0); else s.setMinutes(0, 0, 0);
    const e = new Date(s.getTime() + 3600000);
    setLog([]);
    setEdit({ title: "", category: "rendez_vous", color: "bleu", status: "planifie", start_at: s.toISOString(), end_at: e.toISOString(), all_day: false, owner_user_id: user?.id ?? null, recurrence: "aucune", recurrence_until: null, reminders: [{ minutes: 60, channels: ["app"] }], notify_client: false, attendees: [] });
  };
  const openEv = async (ev: Ev) => {
    setEdit({ ...ev, attendees: (atts[ev.id] ?? []).map((a) => ({ ...a })) });
    const { data } = await db.from("agd_event_log").select("*").eq("event_id", ev.id).order("created_at", { ascending: false }).limit(50); setLog(data ?? []);
  };
  const canEditEv = (e: Edit) => canManage || (canField && (!e.id || e.owner_user_id === user?.id));

  const save = async () => {
    if (!edit || !edit.title?.trim() || busy) return;
    if (new Date(edit.end_at!) < new Date(edit.start_at!)) return toast({ title: "La fin doit suivre le début", variant: "destructive" });
    setBusy(true);
    const row = {
      title: edit.title.trim(), description: edit.description || null, location: edit.location || null, category: edit.category, color: edit.color, status: edit.status,
      start_at: edit.start_at, end_at: edit.end_at, all_day: !!edit.all_day, owner_user_id: edit.owner_user_id || null,
      client_id: edit.client_id || null, project_id: edit.project_id || null, task_id: edit.task_id || null,
      recurrence: edit.recurrence, recurrence_until: edit.recurrence === "aucune" ? null : edit.recurrence_until || null,
      reminders: (edit.reminders ?? []).filter((r) => r.channels.length), notify_client: !!edit.notify_client,
    };
    const res = edit.id ? await db.from("agd_events").update(row).eq("id", edit.id).select("id").single() : await db.from("agd_events").insert({ ...row, company_id: companyId }).select("id").single();
    if (res.error) { setBusy(false); return toast({ title: "Enregistrement refusé", description: res.error.message, variant: "destructive" }); }
    const id = res.data.id as string;
    const before = atts[id] ?? []; const keep = edit.attendees.filter((a) => a.id).map((a) => a.id);
    const removed = before.filter((a) => !keep.includes(a.id)).map((a) => a.id);
    if (removed.length) await db.from("agd_attendees").delete().in("id", removed);
    const fresh = edit.attendees.filter((a) => !a.id).map((a) => ({ event_id: id, company_id: companyId, user_id: a.user_id, name: a.name || null, email: a.email || null, phone: a.phone || null }));
    if (fresh.length) { const r = await db.from("agd_attendees").insert(fresh); if (r.error) toast({ title: "Participant refusé", description: r.error.message, variant: "destructive" }); }
    setBusy(false); setEdit(null); load();
  };

  const archive = async () => {
    if (!edit?.id || !confirm("Archiver cet événement ? Il reste dans l'historique.")) return;
    const { error } = await db.from("agd_events").update({ archived_at: new Date().toISOString() }).eq("id", edit.id);
    if (error) return toast({ title: "Archivage refusé", description: error.message, variant: "destructive" });
    setEdit(null); load();
  };
  const respond = async (r: string) => {
    if (!edit?.id) return;
    const { error } = await db.rpc("agd_respond", { _event: edit.id, _response: r });
    if (error) return toast({ title: "Réponse refusée", description: error.message, variant: "destructive" });
    toast({ title: "Réponse enregistrée" }); setEdit(null); load();
  };

  const Chip = ({ o }: { o: Occ }) => (
    <button type="button" onClick={() => openEv(o.ev)} className={`block w-full truncate rounded px-1.5 py-1 text-left text-xs ${o.ev.status === "annule" ? "line-through opacity-60" : ""}`}
      style={{ background: `color-mix(in srgb, ${hsl(o.ev.color)} 18%, transparent)`, borderLeft: `3px solid ${hsl(o.ev.color)}` }}>
      {!o.ev.all_day && <span className="font-semibold">{o.at.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })} </span>}{o.ev.title}
    </button>
  );

  const days = useMemo(() => { const out: Date[] = []; for (let d = new Date(range[0]); d < range[1]; d.setDate(d.getDate() + 1)) out.push(new Date(d)); return out; }, [range]);
  const today = dayKey(new Date());
  const title = view === "mois" ? cursor.toLocaleDateString("fr-CA", { month: "long", year: "numeric" }) : view === "jour" ? cursor.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" }) : `${range[0].toLocaleDateString("fr-CA", { day: "numeric", month: "short" })} – ${new Date(range[1].getTime() - 1).toLocaleDateString("fr-CA", { day: "numeric", month: "short" })}`;
  const myInvite = edit?.id ? edit.attendees.find((a) => a.user_id === user?.id) : undefined;
  const editable = edit ? canEditEv(edit) : false;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon" variant="outline" aria-label="Précédent" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" onClick={() => setCursor(new Date())}>Aujourd'hui</Button>
        <Button size="icon" variant="outline" aria-label="Suivant" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
        <h2 className="min-w-0 flex-1 font-display text-lg font-bold capitalize">{title}</h2>
        {canField && <Button onClick={() => openNew()}><Plus className="mr-1 h-4 w-4" />Événement</Button>}
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="flex rounded-md border border-border" role="group" aria-label="Vue">
          {(["jour", "semaine", "mois", "liste"] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`px-3 py-2 text-sm capitalize ${view === v ? "bg-primary text-primary-foreground" : ""}`}>{v}</button>)}
        </div>
        <select aria-label="Employé" className={sel} value={fWho} onChange={(e) => setFWho(e.target.value)}>
          <option value="">Toute l'équipe</option><option value="moi">Mon agenda</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
        </select>
        <select aria-label="Catégorie" className={sel} value={fCat} onChange={(e) => setFCat(e.target.value)}>
          <option value="">Toutes catégories</option>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Input aria-label="Rechercher" placeholder="Rechercher" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-48" />
      </div>

      {view === "liste" || view === "jour" ? (
        <div className="space-y-3">
          {(view === "jour" ? [dayKey(cursor)] : Object.keys(byDay)).map((k) => (
            <section key={k}>
              <h3 className="mb-1 text-sm font-bold capitalize text-muted-foreground">{new Date(k + "T12:00").toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" })}</h3>
              {(byDay[k] ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Rien de prévu.</p> : (
                <ul className="space-y-2">{byDay[k].map((o) => (
                  <li key={o.ev.id + o.at.toISOString()}>
                    <button type="button" onClick={() => openEv(o.ev)} className="flex w-full items-start gap-3 rounded-md border border-border bg-card p-3 text-left" style={{ borderLeft: `6px solid ${hsl(o.ev.color)}` }}>
                      <span className="w-14 shrink-0 text-sm font-semibold">{o.ev.all_day ? "Journée" : o.at.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="min-w-0"><span className={`block break-words font-medium ${o.ev.status === "annule" ? "line-through" : ""}`}>{o.ev.title}</span>
                        <span className="block text-xs text-muted-foreground">{CATS[o.ev.category]} · {STATUS[o.ev.status]} · {who(o.ev.owner_user_id)}{o.ev.location ? ` · ${o.ev.location}` : ""}</span></span>
                    </button>
                  </li>))}</ul>)}
            </section>))}
          {view === "liste" && !occs.length && <p className="text-muted-foreground">Aucun événement dans les 60 prochains jours.</p>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[700px] grid-cols-7 gap-px rounded-md border border-border bg-border">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => <div key={d} className="bg-muted p-1 text-center text-xs font-bold">{d}</div>)}
            {days.map((d) => { const k = dayKey(d); const out = view === "mois" && d.getMonth() !== cursor.getMonth(); return (
              <div key={k} className={`bg-background p-1 ${view === "mois" ? "min-h-24" : "min-h-64"} ${out ? "opacity-50" : ""}`} onDoubleClick={() => canField && openNew(d)}>
                <div className={`mb-1 text-xs ${k === today ? "font-bold text-primary" : "text-muted-foreground"}`}>{d.getDate()}</div>
                <div className="space-y-1">{(byDay[k] ?? []).slice(0, view === "mois" ? 3 : 20).map((o) => <Chip key={o.ev.id + o.at.toISOString()} o={o} />)}
                  {view === "mois" && (byDay[k]?.length ?? 0) > 3 && <button type="button" className="text-xs text-primary" onClick={() => { setCursor(d); setView("jour"); }}>+{byDay[k].length - 3} autres</button>}</div>
              </div>); })}
          </div>
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && !busy && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit?.id ? (editable ? "Modifier l'événement" : edit.title) : "Nouvel événement"}</DialogTitle></DialogHeader>
          {edit && <div className="space-y-3">
            {myInvite && <div className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-sm">Votre réponse : {RESP[myInvite.response ?? "en_attente"]}
              <Button size="sm" variant="outline" onClick={() => respond("accepte")}>Accepter</Button><Button size="sm" variant="outline" onClick={() => respond("peut_etre")}>Peut-être</Button><Button size="sm" variant="outline" onClick={() => respond("refuse")}>Refuser</Button></div>}
            <fieldset disabled={!editable} className="space-y-3">
              <Input aria-label="Titre" placeholder="Titre" value={edit.title ?? ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
              <Input aria-label="Lieu" placeholder="Lieu ou adresse" value={edit.location ?? ""} onChange={(e) => setEdit({ ...edit, location: e.target.value })} />
              <Textarea aria-label="Description" placeholder="Description" value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!edit.all_day} onCheckedChange={(v) => setEdit({ ...edit, all_day: !!v })} />Toute la journée</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="text-sm">Début<Input type={edit.all_day ? "date" : "datetime-local"} value={edit.all_day ? dayKey(new Date(edit.start_at!)) : toLocal(new Date(edit.start_at!))}
                  onChange={(e) => { if (!e.target.value) return; const s = new Date(edit.all_day ? e.target.value + "T00:00" : e.target.value); const dur = new Date(edit.end_at!).getTime() - new Date(edit.start_at!).getTime(); setEdit({ ...edit, start_at: s.toISOString(), end_at: new Date(s.getTime() + Math.max(dur, 0)).toISOString() }); }} /></label>
                <label className="text-sm">Fin<Input type={edit.all_day ? "date" : "datetime-local"} value={edit.all_day ? dayKey(new Date(edit.end_at!)) : toLocal(new Date(edit.end_at!))}
                  onChange={(e) => e.target.value && setEdit({ ...edit, end_at: new Date(edit.all_day ? e.target.value + "T23:59" : e.target.value).toISOString() })} /></label>
                <label className="text-sm">Catégorie<select className={`${sel} w-full`} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="text-sm">Statut<select className={`${sel} w-full`} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="text-sm">Responsable (transfert)<select className={`${sel} w-full`} value={edit.owner_user_id ?? ""} onChange={(e) => setEdit({ ...edit, owner_user_id: e.target.value || null })}>{canManage && <option value="">Non attribué</option>}{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.email} ({m.role})</option>)}</select></label>
                <label className="text-sm">Récurrence<select className={`${sel} w-full`} value={edit.recurrence} onChange={(e) => setEdit({ ...edit, recurrence: e.target.value as Recurrence })}>{Object.entries(RECS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                {edit.recurrence !== "aucune" && <label className="text-sm">Jusqu'au<Input type="date" value={edit.recurrence_until ?? ""} onChange={(e) => setEdit({ ...edit, recurrence_until: e.target.value || null })} /></label>}
                <label className="text-sm">Client du CRM<select className={`${sel} w-full`} value={edit.client_id ?? ""} onChange={(e) => setEdit({ ...edit, client_id: e.target.value || null })}><option value="">Aucun</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                <label className="text-sm">Chantier<select className={`${sel} w-full`} value={edit.project_id ?? ""} onChange={(e) => setEdit({ ...edit, project_id: e.target.value || null })}><option value="">Aucun</option>{projects.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                <label className="text-sm">Tâche liée<select className={`${sel} w-full`} value={edit.task_id ?? ""} onChange={(e) => setEdit({ ...edit, task_id: e.target.value || null })}><option value="">Aucune</option>{tasks.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
              </div>
              <fieldset><legend className="mb-1 text-sm">Couleur</legend><div className="flex flex-wrap gap-2">
                {Object.entries(TASK_COLORS).map(([k, v]) => <button key={k} type="button" aria-label={v.label} aria-pressed={edit.color === k} onClick={() => setEdit({ ...edit, color: k })} className={`h-8 w-8 rounded-full border-2 ${edit.color === k ? "border-foreground" : "border-transparent"}`} style={{ background: `hsl(${v.hsl})` }} />)}
              </div></fieldset>

              <fieldset className="space-y-2"><legend className="text-sm font-semibold">Participants</legend>
                {edit.attendees.map((a, i) => <div key={a.id ?? i} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{a.user_id ? who(a.user_id) : [a.name, a.email, a.phone].filter(Boolean).join(" · ")}</span>
                  <span className="text-xs text-muted-foreground">{RESP[a.response ?? "en_attente"]}</span>
                  <Button size="icon" variant="ghost" aria-label="Retirer le participant" onClick={() => setEdit({ ...edit, attendees: edit.attendees.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                </div>)}
                <select aria-label="Inviter un employé" className={`${sel} w-full`} value="" onChange={(e) => e.target.value && !edit.attendees.some((a) => a.user_id === e.target.value) && setEdit({ ...edit, attendees: [...edit.attendees, { user_id: e.target.value }] })}>
                  <option value="">Inviter un employé…</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
                </select>
                <ExternalInvite onAdd={(a) => setEdit({ ...edit, attendees: [...edit.attendees, a] })} />
              </fieldset>

              <fieldset className="space-y-2"><legend className="text-sm font-semibold">Rappels</legend>
                {(edit.reminders ?? []).map((r, i) => <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <select aria-label="Délai du rappel" className={sel} value={r.minutes} onChange={(e) => setEdit({ ...edit, reminders: edit.reminders!.map((x, j) => (j === i ? { ...x, minutes: Number(e.target.value) } : x)) })}>
                    {[[10, "10 min"], [30, "30 min"], [60, "1 h"], [120, "2 h"], [1440, "1 jour"], [2880, "2 jours"], [10080, "1 semaine"]].map(([v, l]) => <option key={v} value={v}>{l} avant</option>)}
                  </select>
                  {Object.entries(CH).map(([k, l]) => <label key={k} className="flex items-center gap-1"><Checkbox checked={r.channels.includes(k)} onCheckedChange={(v) => setEdit({ ...edit, reminders: edit.reminders!.map((x, j) => (j === i ? { ...x, channels: v ? [...x.channels, k] : x.channels.filter((c) => c !== k) } : x)) })} />{l}</label>)}
                  <Button size="icon" variant="ghost" aria-label="Retirer le rappel" onClick={() => setEdit({ ...edit, reminders: edit.reminders!.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                </div>)}
                <Button size="sm" variant="outline" onClick={() => setEdit({ ...edit, reminders: [...(edit.reminders ?? []), { minutes: 1440, channels: ["app"] }] })}>Ajouter un rappel</Button>
                {edit.client_id && <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!edit.notify_client} onCheckedChange={(v) => setEdit({ ...edit, notify_client: !!v })} />Rappeler aussi le client (courriel/texto)</label>}
                <p className="text-xs text-muted-foreground">Les courriels et textos sont préparés en mode essai : aucun envoi réel tant que le service d'envoi n'est pas activé.</p>
              </fieldset>
            </fieldset>

            {log.length > 0 && <details className="text-sm"><summary className="cursor-pointer font-semibold">Historique ({log.length})</summary>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{log.map((l) => <li key={l.id}>{new Date(l.created_at).toLocaleString("fr-CA")} — {ACTIONS[l.action] ?? l.action}{l.action === "transfert" ? ` : ${who(l.detail?.de)} → ${who(l.detail?.a)}` : ""}{l.action === "statut" ? ` : ${STATUS[l.detail?.avant]} → ${STATUS[l.detail?.apres]}` : ""}{l.action === "reponse" ? ` : ${RESP[l.detail?.reponse]}` : ""} · {who(l.actor)}</li>)}</ul></details>}

            <div className="flex flex-wrap justify-end gap-2">
              {edit.id && canManage && <Button variant="outline" onClick={archive}>Archiver</Button>}
              <Button variant="outline" onClick={() => setEdit(null)} disabled={busy}>Fermer</Button>
              {editable && <Button onClick={save} disabled={busy || !edit.title?.trim()}>{busy ? "Enregistrement…" : "Enregistrer"}</Button>}
            </div>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExternalInvite({ onAdd }: { onAdd: (a: Att) => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phone, setPhone] = useState("");
  const ok = (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) || (phone && /^[+\d(][\d\s().-]{6,}$/.test(phone));
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
    <Input aria-label="Nom de l'invité externe" placeholder="Invité externe" value={name} onChange={(e) => setName(e.target.value)} />
    <Input aria-label="Courriel de l'invité" placeholder="Courriel" value={email} onChange={(e) => setEmail(e.target.value)} />
    <Input aria-label="Téléphone de l'invité" placeholder="Téléphone" value={phone} onChange={(e) => setPhone(e.target.value)} />
    <Button type="button" variant="outline" disabled={!ok} onClick={() => { onAdd({ user_id: null, name, email: email || null, phone: phone || null }); setName(""); setEmail(""); setPhone(""); }}>Ajouter</Button>
  </div>;
}

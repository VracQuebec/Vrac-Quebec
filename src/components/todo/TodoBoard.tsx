// Liste de tâches d'une entreprise (ent_crm_tasks). Droits vérifiés côté serveur :
// gestion = proprietaire/gestionnaire/support; employé assigné = avancement seulement.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, CheckSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const db = supabase as any;
export const TASK_COLORS: Record<string, { label: string; hsl: string }> = {
  gris: { label: "Gris", hsl: "220 9% 55%" }, vert: { label: "Vert", hsl: "88 72% 45%" },
  bleu: { label: "Bleu", hsl: "210 80% 52%" }, jaune: { label: "Jaune", hsl: "45 95% 52%" },
  orange: { label: "Orange", hsl: "25 95% 53%" }, rouge: { label: "Rouge", hsl: "0 78% 54%" },
  violet: { label: "Violet", hsl: "270 60% 58%" },
};
const PRIORITIES: Record<string, string> = { basse: "Basse", normale: "Normale", haute: "Haute", urgente: "Urgente" };
const STATUSES: Record<string, string> = { a_faire: "À faire", en_cours: "En cours", fait: "Fait" };
const sel = "h-10 rounded-md border border-border bg-background px-2 text-sm";

type Item = { id: string; text: string; done: boolean };
type Task = {
  id: string; company_id: string; title: string; description: string | null; due_at: string | null;
  assignee_user_id: string | null; client_id: string | null; project_id: string | null;
  status: string; priority: string; color: string; checklist: Item[]; done_at: string | null; result: string | null;
};
type Member = { user_id: string; email: string; role: string; is_active: boolean };

const blank = (): Partial<Task> => ({ title: "", description: "", due_at: null, assignee_user_id: null, client_id: null, project_id: null, status: "a_faire", priority: "normale", color: "gris", checklist: [] });
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export default function TodoBoard({ companyId, role }: { companyId: string; role: string | null }) {
  const { user } = useAuthReady();
  const canManage = ["support", "proprietaire", "gestionnaire"].includes(role ?? "");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(""); const [fStatus, setFStatus] = useState("ouvertes");
  const [fWho, setFWho] = useState(""); const [fColor, setFColor] = useState(""); const [fPrio, setFPrio] = useState("");
  const [quick, setQuick] = useState(""); const [edit, setEdit] = useState<Partial<Task> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [t, m, c, p] = await Promise.all([
      db.from("ent_crm_tasks").select("*").eq("company_id", companyId).is("archived_at", null).order("due_at", { ascending: true, nullsFirst: false }).limit(500),
      db.rpc("entcrm_list_members", { _company_id: companyId }),
      db.from("ent_crm_clients").select("id,name").eq("company_id", companyId).is("archived_at", null).order("name").limit(300),
      db.from("ent_crm_projects").select("id,name").eq("company_id", companyId).is("archived_at", null).order("name").limit(300),
    ]);
    if (t.error) toast({ title: "Chargement impossible", description: t.error.message, variant: "destructive" });
    setTasks((t.data ?? []).map((x: any) => ({ ...x, checklist: Array.isArray(x.checklist) ? x.checklist : [] })));
    setMembers((m.data ?? []).filter((x: Member) => x.is_active)); setClients(c.data ?? []); setProjects(p.data ?? []);
    setLoading(false);
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const who = (id: string | null) => (id ? members.find((m) => m.user_id === id)?.email ?? "Employé" : "Non attribuée");
  const now = Date.now(); const endToday = new Date(); endToday.setHours(23, 59, 59, 999);

  const shown = useMemo(() => tasks.filter((t) => {
    if (fStatus === "ouvertes" && t.status === "fait") return false;
    if (fStatus !== "ouvertes" && fStatus !== "toutes" && t.status !== fStatus) return false;
    if (fWho === "moi" && t.assignee_user_id !== user?.id) return false;
    if (fWho === "aucun" && t.assignee_user_id) return false;
    if (fWho && !["moi", "aucun"].includes(fWho) && t.assignee_user_id !== fWho) return false;
    if (fColor && t.color !== fColor) return false; if (fPrio && t.priority !== fPrio) return false;
    if (q && !`${t.title} ${t.description ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [tasks, fStatus, fWho, fColor, fPrio, q, user?.id]);

  const groups = useMemo(() => {
    const g: [string, Task[]][] = [["En retard", []], ["Aujourd'hui", []], ["À venir", []], ["Sans échéance", []], ["Terminées", []]];
    for (const t of shown) {
      if (t.status === "fait") g[4][1].push(t);
      else if (!t.due_at) g[3][1].push(t);
      else if (new Date(t.due_at).getTime() < now) g[0][1].push(t);
      else if (new Date(t.due_at) <= endToday) g[1][1].push(t);
      else g[2][1].push(t);
    }
    return g.filter(([, l]) => l.length);
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (t: Task, fields: Partial<Task>) => {
    const prev = tasks; setTasks((l) => l.map((x) => (x.id === t.id ? { ...x, ...fields } : x)));
    const { error } = await db.from("ent_crm_tasks").update(fields).eq("id", t.id);
    if (error) { setTasks(prev); toast({ title: "Modification refusée", description: error.message, variant: "destructive" }); }
  };

  const addQuick = async () => {
    if (!quick.trim() || busy) return; setBusy(true);
    const { error } = await db.from("ent_crm_tasks").insert({ company_id: companyId, title: quick.trim(), assignee_user_id: user?.id ?? null });
    setBusy(false);
    if (error) return toast({ title: "Ajout refusé", description: error.message, variant: "destructive" });
    setQuick(""); load();
  };

  const save = async () => {
    if (!edit?.title?.trim() || busy) return; setBusy(true);
    const row: any = canManage ? {
      title: edit.title.trim(), description: edit.description || null, due_at: edit.due_at || null,
      assignee_user_id: edit.assignee_user_id || null, client_id: edit.client_id || null, project_id: edit.project_id || null,
      status: edit.status, priority: edit.priority, color: edit.color, checklist: edit.checklist ?? [], result: edit.result ?? null,
    } : { status: edit.status, checklist: edit.checklist ?? [], result: edit.result ?? null };
    const { error } = edit.id ? await db.from("ent_crm_tasks").update(row).eq("id", edit.id) : await db.from("ent_crm_tasks").insert({ ...row, company_id: companyId });
    setBusy(false);
    if (error) return toast({ title: "Enregistrement refusé", description: error.message, variant: "destructive" }); // saisie conservée
    setEdit(null); load();
  };

  const archive = async (t: Task) => {
    if (!confirm(`Archiver « ${t.title} » ? Elle restera dans l'historique.`)) return;
    const { error } = await db.from("ent_crm_tasks").update({ archived_at: new Date().toISOString() }).eq("id", t.id);
    if (error) return toast({ title: "Archivage refusé", description: error.message, variant: "destructive" });
    load();
  };

  const open = tasks.filter((t) => t.status !== "fait");
  const late = open.filter((t) => t.due_at && new Date(t.due_at).getTime() < now).length;
  const mine = open.filter((t) => t.assignee_user_id === user?.id).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[["Ouvertes", open.length], ["En retard", late], ["À moi", mine]].map(([l, n]) => (
          <div key={l as string} className="rounded-md border border-border p-2"><div className="font-display text-xl font-bold">{n}</div><div className="text-xs text-muted-foreground">{l}</div></div>
        ))}
      </div>

      {canManage && <div className="flex gap-2">
        <Input aria-label="Nouvelle tâche rapide" placeholder="Ajouter une tâche puis Entrée" value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addQuick()} />
        <Button onClick={addQuick} disabled={busy || !quick.trim()} aria-label="Ajouter"><Plus className="h-4 w-4" /></Button>
        <Button variant="outline" onClick={() => setEdit(blank())}>Détaillée</Button>
      </div>}

      <div className="flex flex-wrap gap-2">
        <Input aria-label="Rechercher" placeholder="Rechercher" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-48" />
        <select aria-label="Statut" className={sel} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="ouvertes">Ouvertes</option><option value="toutes">Toutes</option>
          {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Attribution" className={sel} value={fWho} onChange={(e) => setFWho(e.target.value)}>
          <option value="">Tout le monde</option><option value="moi">Mes tâches</option><option value="aucun">Non attribuées</option>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}
        </select>
        <select aria-label="Couleur" className={sel} value={fColor} onChange={(e) => setFColor(e.target.value)}>
          <option value="">Toutes couleurs</option>{Object.entries(TASK_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select aria-label="Priorité" className={sel} value={fPrio} onChange={(e) => setFPrio(e.target.value)}>
          <option value="">Toutes priorités</option>{Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? <p className="text-muted-foreground">Chargement…</p> : !groups.length ? <p className="text-muted-foreground">Aucune tâche.</p> : groups.map(([g, list]) => (
        <section key={g} aria-label={g}>
          <h3 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">{g} · {list.length}</h3>
          <ul className="space-y-2">
            {list.map((t) => {
              const mineT = t.assignee_user_id === user?.id; const canTick = canManage || mineT;
              const done = t.checklist.filter((i) => i.done).length;
              return (
                <li key={t.id} className="flex items-start gap-3 rounded-md border border-border bg-card p-3" style={{ borderLeft: `6px solid hsl(${TASK_COLORS[t.color]?.hsl ?? TASK_COLORS.gris.hsl})` }}>
                  <Checkbox aria-label={t.status === "fait" ? `Décocher ${t.title}` : `Cocher ${t.title}`} className="mt-1 h-5 w-5 shrink-0" checked={t.status === "fait"} disabled={!canTick}
                    onCheckedChange={(v) => patch(t, { status: v ? "fait" : "a_faire" })} />
                  <div className="min-w-0 flex-1">
                    <p className={`break-words font-medium ${t.status === "fait" ? "text-muted-foreground line-through" : ""}`}>{t.title}</p>
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{who(t.assignee_user_id)}</span>
                      {t.due_at && <span>{new Date(t.due_at).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" })}</span>}
                      <span>{PRIORITIES[t.priority]}</span>{t.status === "en_cours" && <span className="text-primary">En cours</span>}
                      {t.checklist.length > 0 && <span className="inline-flex items-center gap-1"><CheckSquare className="h-3 w-3" />{done}/{t.checklist.length}</span>}
                      {t.client_id && <span>Client : {clients.find((c) => c.id === t.client_id)?.name ?? "—"}</span>}
                      {t.project_id && <span>Chantier : {projects.find((c) => c.id === t.project_id)?.name ?? "—"}</span>}
                    </p>
                  </div>
                  {canTick && <Button size="icon" variant="ghost" aria-label={`Modifier ${t.title}`} onClick={() => setEdit({ ...t })}><Pencil className="h-4 w-4" /></Button>}
                  {canManage && <Button size="icon" variant="ghost" aria-label={`Archiver ${t.title}`} onClick={() => archive(t)}><Archive className="h-4 w-4" /></Button>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <Dialog open={!!edit} onOpenChange={(o) => !o && !busy && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit?.id ? "Modifier la tâche" : "Nouvelle tâche"}</DialogTitle></DialogHeader>
          {edit && <div className="space-y-3">
            <Input aria-label="Titre" placeholder="Titre" value={edit.title ?? ""} disabled={!canManage} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            <Textarea aria-label="Description" placeholder="Description" value={edit.description ?? ""} disabled={!canManage} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-sm">Statut<select className={`${sel} w-full`} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="text-sm">Priorité<select className={`${sel} w-full`} disabled={!canManage} value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })}>{Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="text-sm">Échéance<Input type="datetime-local" disabled={!canManage} value={toLocal(edit.due_at ?? null)} onChange={(e) => setEdit({ ...edit, due_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label>
              <label className="text-sm">Attribuée à<select className={`${sel} w-full`} disabled={!canManage} value={edit.assignee_user_id ?? ""} onChange={(e) => setEdit({ ...edit, assignee_user_id: e.target.value || null })}><option value="">Non attribuée</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.email} ({m.role})</option>)}</select></label>
              <label className="text-sm">Client du CRM<select className={`${sel} w-full`} disabled={!canManage} value={edit.client_id ?? ""} onChange={(e) => setEdit({ ...edit, client_id: e.target.value || null })}><option value="">Aucun</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="text-sm">Chantier<select className={`${sel} w-full`} disabled={!canManage} value={edit.project_id ?? ""} onChange={(e) => setEdit({ ...edit, project_id: e.target.value || null })}><option value="">Aucun</option>{projects.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            </div>
            <fieldset><legend className="mb-1 text-sm">Couleur</legend><div className="flex flex-wrap gap-2">
              {Object.entries(TASK_COLORS).map(([k, v]) => <button key={k} type="button" disabled={!canManage} aria-label={v.label} aria-pressed={edit.color === k} onClick={() => setEdit({ ...edit, color: k })}
                className={`h-8 w-8 rounded-full border-2 ${edit.color === k ? "border-foreground" : "border-transparent"}`} style={{ background: `hsl(${v.hsl})` }} />)}
            </div></fieldset>
            <fieldset className="space-y-1"><legend className="text-sm">Liste de contrôle</legend>
              {(edit.checklist ?? []).map((it, i) => <div key={it.id} className="flex items-center gap-2">
                <Checkbox aria-label={`Étape ${it.text}`} checked={it.done} onCheckedChange={(v) => setEdit({ ...edit, checklist: edit.checklist!.map((x, j) => (j === i ? { ...x, done: !!v } : x)) })} />
                <Input value={it.text} disabled={!canManage} onChange={(e) => setEdit({ ...edit, checklist: edit.checklist!.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                {canManage && <Button size="icon" variant="ghost" aria-label="Retirer l'étape" onClick={() => setEdit({ ...edit, checklist: edit.checklist!.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>}
              </div>)}
              {canManage && <Button size="sm" variant="outline" onClick={() => setEdit({ ...edit, checklist: [...(edit.checklist ?? []), { id: crypto.randomUUID(), text: "", done: false }] })}>Ajouter une étape</Button>}
            </fieldset>
            <Textarea aria-label="Résultat" placeholder="Résultat ou note de fin" value={edit.result ?? ""} onChange={(e) => setEdit({ ...edit, result: e.target.value })} />
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEdit(null)} disabled={busy}>Annuler</Button><Button onClick={save} disabled={busy || !edit.title?.trim()}>{busy ? "Enregistrement…" : "Enregistrer"}</Button></div>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// CENTRE DE CONTRÔLE — surveillance des demandes (admin seulement)
// Lecture des demandes existantes; seules actions en écriture :
// état des avis internes (consultée / prise en charge), note interne,
// date de rappel. Aucun courriel, aucun changement de statut ici.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Bell, CheckCircle2, Clock, ExternalLink, Eye, Hand, Loader2,
  RefreshCw, Search, ShieldCheck, Siren, CalendarClock, Activity,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { markRead, setStatus } from "@/lib/notifications/api";
import {
  actionRank, computeSystemState, elapsed, enrich, fromSubmission, fromTransport, matches,
  FILTER_LABELS, GROUP_LABEL, SYSTEM_LABEL,
  type ControlRequest, type Delays, type Filter, type NotifLite, type Priority, type SystemState,
} from "@/lib/control-center/model";

const PRIO_STYLE: Record<Priority, { label: string; cls: string }> = {
  critique: { label: "Critique", cls: "bg-destructive text-destructive-foreground" },
  urgent: { label: "Urgent", cls: "bg-destructive/15 text-destructive border border-destructive/40" },
  attention: { label: "Attention", cls: "bg-attention/15 text-attention border border-attention/40" },
  suivi: { label: "Suivi", cls: "bg-followup/15 text-followup border border-followup/40" },
  ok: { label: "Traitée", cls: "bg-success/15 text-success border border-success/40" },
  normal: { label: "Normale", cls: "bg-secondary text-muted-foreground border border-border" },
};

const SYS_STYLE: Record<SystemState, string> = {
  ok: "bg-success/15 text-success border-success/40",
  verify: "bg-followup/15 text-followup border-followup/40",
  error: "bg-destructive/15 text-destructive border-destructive/40",
  late: "bg-attention/15 text-attention border-attention/40",
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const SUB_COLS = "id,dompe_number,submission_number,request_type,company,name,email,phone,city,address,service_type,materials,other_material,quantity,quantity_value,quantity_unit,tonnage,description,created_at,updated_at,status,next_follow_up_at,desired_date,delivery_timeframe";
const TR_COLS = "id,request_number,client_name,client_company,client_phone,client_email,site_city,site_address,material_type,material_other,quantity,quantity_unit,desired_date,status,created_at,updated_at,client_notes";

export default function AdminControlCenter() {
  const { isReady, user } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles(user, isReady);
  const [rows, setRows] = useState<ControlRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [realtime, setRealtime] = useState(false);
  const [openAlerts, setOpenAlerts] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [, tick] = useState(0);
  const debounce = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [subs, trs, notifs, settings] = await Promise.all([
        supabase.from("submissions").select(SUB_COLS).order("created_at", { ascending: false }).limit(2000),
        supabase.from("transport_requests").select(TR_COLS).order("created_at", { ascending: false }).limit(1000),
        supabase.from("crm_notifications")
          .select("id,entity_id,entity_type,status,category,title,created_at,read_at")
          .in("entity_type", ["submission", "transport_request"])
          .order("created_at", { ascending: false }).limit(3000),
        supabase.from("crm_notification_settings").select("delays").eq("scope", "global").maybeSingle(),
      ]);
      const err = subs.error || trs.error || notifs.error;
      if (err) throw err;
      const d = (settings.data?.delays ?? {}) as Record<string, number>;
      const delays: Delays = {
        untreatedHours: Number(d.lead_untreated_hours ?? 24),
        followupDays: Number(d.quote_followup_days ?? 2),
      };
      const byEntity = new Map<string, NotifLite[]>();
      for (const n of (notifs.data ?? []) as NotifLite[]) {
        const k = `${n.entity_type}:${n.entity_id}`;
        byEntity.set(k, [...(byEntity.get(k) ?? []), n]);
      }
      const bases = [
        ...((subs.data ?? []) as Record<string, unknown>[]).map(fromSubmission),
        ...((trs.data ?? []) as Record<string, unknown>[]).map(fromTransport),
      ];
      setRows(bases.map((b) => enrich(b, byEntity.get(b.key) ?? [], delays)));
      const { count } = await supabase.from("crm_notifications")
        .select("id", { count: "exact", head: true }).in("status", ["unread", "read", "in_progress"]);
      setOpenAlerts(count ?? 0);
      setLoadError(null);
      setLastSync(Date.now());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
    const schedule = () => {
      if (debounce.current) window.clearTimeout(debounce.current);
      debounce.current = window.setTimeout(() => void load(), 800);
    };
    const ch = supabase.channel(`control-center-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "submissions" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "transport_requests" }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_notifications" }, schedule)
      .subscribe((status) => setRealtime(status === "SUBSCRIBED"));
    const t = window.setInterval(() => void load(), 60_000);
    const clock = window.setInterval(() => tick((x) => x + 1), 30_000);
    return () => {
      window.clearInterval(t); window.clearInterval(clock);
      if (debounce.current) window.clearTimeout(debounce.current);
      void supabase.removeChannel(ch);
    };
  }, [isAdmin, load]);

  const lastRequest = useMemo(
    () => [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null, [rows]);
  const sys = computeSystemState({
    loadOk: !loadError, lastSyncAt: lastSync, realtime,
    lastRequestAt: lastRequest?.createdAt ?? null,
    lastRequestHasNotif: lastRequest ? lastRequest.notifs.length > 0 : null,
  });

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const counts = useMemo(() => ({
    new: rows.filter((r) => matches(r, "new")).length,
    urgent: rows.filter((r) => matches(r, "urgent")).length,
    followup: rows.filter((r) => matches(r, "followup")).length,
    doneToday: rows.filter((r) => r.group === "traitee" && r.updatedAt && new Date(r.updatedAt) >= todayStart).length,
  }), [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const priorityList = useMemo(() => rows.filter((r) => actionRank(r) < 9)
    .sort((a, b) => actionRank(a) - actionRank(b) || a.createdAt.localeCompare(b.createdAt))
    // Les suivis sont plafonnés à 6 pour ne jamais masquer une nouvelle demande.
    .filter((r, _i, arr) => actionRank(r) !== 2 || arr.filter((x) => actionRank(x) === 2).indexOf(r) < 6), [rows]);

  const reminders = useMemo(() => rows
    .filter((r) => r.followUpAt && r.group !== "traitee" && r.group !== "annulee")
    .sort((a, b) => (a.followUpAt ?? "").localeCompare(b.followUpAt ?? "")).slice(0, 10), [rows]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => matches(r, filter)).filter((r) => !term ||
      [r.number, r.requester, r.service, r.typeLabel, r.city].some((v) => v.toLowerCase().includes(term)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [rows, filter, q]);

  const selected = rows.find((r) => r.key === selectedKey) ?? null;

  const markSeen = async (r: ControlRequest) => {
    const ids = r.notifs.filter((n) => n.status === "unread").map((n) => n.id);
    if (!ids.length) { toast.info("Aucun avis non consulté pour cette demande."); return; }
    try { await Promise.all(ids.map(markRead)); toast.success("Demande marquée comme consultée."); void load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Échec"); }
  };
  const takeCharge = async (r: ControlRequest) => {
    const ids = r.notifs.filter((n) => ["unread", "read"].includes(n.status)).map((n) => n.id);
    if (!ids.length) {
      toast.info("Aucun avis ouvert lié : changez le statut depuis la fiche complète.");
      return;
    }
    try { await Promise.all(ids.map((id) => setStatus(id, "in_progress"))); toast.success("Demande prise en charge."); void load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Échec"); }
  };

  if (!isReady || rolesLoading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Vérification des permissions…</div>;
  }
  if (!isAdmin) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <ShieldCheck className="h-8 w-8 text-muted-foreground" />
      <h1 className="text-xl font-semibold">Accès réservé</h1>
      <p className="max-w-md text-sm text-muted-foreground">Le Centre de contrôle est réservé aux administrateurs.</p>
    </div>;
  }

  const cards: { f: Filter; label: string; value: number; icon: typeof Bell; tone: string }[] = [
    { f: "new", label: "Nouvelles demandes", value: counts.new, icon: Bell, tone: "border-destructive/40 text-destructive" },
    { f: "urgent", label: "Alertes urgentes", value: counts.urgent, icon: Siren, tone: "border-attention/40 text-attention" },
    { f: "followup", label: "Suivis requis", value: counts.followup, icon: CalendarClock, tone: "border-followup/40 text-followup" },
    { f: "done", label: "Traitées aujourd'hui", value: counts.doneToday, icon: CheckCircle2, tone: "border-success/40 text-success" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={<Activity className="h-5 w-5" />}
        title="Centre de contrôle"
        subtitle="Surveillance des demandes et opérations"
        actions={<Button variant="outline" size="sm" onClick={() => { setLoading(true); void load(); }} disabled={loading}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser</Button>}
      />
      <main className="mx-auto w-full max-w-7xl space-y-5 px-3 py-4 sm:px-6">
        {/* État système */}
        <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className={`rounded-xl border px-3 py-2 ${SYS_STYLE[sys]}`}>
            <p className="text-[11px] font-semibold uppercase">Avis internes</p>
            <p className="font-display text-sm font-bold">{SYSTEM_LABEL[sys]}</p>
          </div>
          <Info label="Dernière synchronisation" value={lastSync ? new Date(lastSync).toLocaleTimeString("fr-CA") : "—"} />
          <Info label="Dernière demande reçue" value={fmt(lastRequest?.createdAt ?? null)} />
          <Info label="Alertes non résolues" value={String(openAlerts)} />
        </section>
        {loadError && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Lecture impossible : {loadError}</p>}

        {/* Cartes de synthèse */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((c) => (
            <button key={c.f} type="button" onClick={() => setFilter(c.f)}
              className={`rounded-xl border-2 bg-card p-4 text-left transition hover:shadow-md ${c.tone} ${filter === c.f ? "ring-2 ring-primary" : ""}`}>
              <c.icon className="h-5 w-5" />
              <p className="mt-2 font-display text-3xl font-bold text-foreground">{loading && !lastSync ? "…" : c.value}</p>
              <p className="text-sm font-semibold text-muted-foreground">{c.label}</p>
            </button>
          ))}
        </section>

        {/* Zone rouge */}
        <section className="rounded-xl border-2 border-destructive/50 bg-destructive/5 p-3 sm:p-4">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold text-destructive">
            <AlertTriangle className="h-5 w-5" /> Action immédiate requise
          </h2>
          {priorityList.length === 0 ? (
            <p className="text-sm text-muted-foreground">{lastSync ? "Aucune demande n'exige d'action immédiate." : "Chargement…"}</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {priorityList.map((r) => <RequestCard key={r.key} r={r} onOpen={() => setSelectedKey(r.key)} onTake={() => void takeCharge(r)} />)}
            </div>
          )}
        </section>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          {/* Liste centrale */}
          <section className="space-y-3">
            <div className="no-scrollbar -mx-3 flex gap-1 overflow-x-auto px-3">
              {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)}
                  className={`min-h-10 shrink-0 whitespace-nowrap rounded-lg px-3 text-sm ${filter === f ? "bg-primary font-semibold text-primary-foreground" : "bg-card text-muted-foreground border border-border"}`}>
                  {FILTER_LABELS[f]} <span className="opacity-70">({rows.filter((r) => matches(r, f)).length})</span>
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} className="h-11 pl-9"
                placeholder="Numéro, entrepreneur, service ou municipalité" />
            </div>
            {loading && !lastSync ? (
              <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement des demandes…</p>
            ) : list.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Aucune demande pour ce filtre.</p>
            ) : (
              <div className="space-y-2">
                {list.slice(0, 100).map((r) => <RequestCard key={r.key} r={r} compact onOpen={() => setSelectedKey(r.key)} onTake={() => void takeCharge(r)} />)}
                {list.length > 100 && <p className="text-center text-xs text-muted-foreground">100 premières sur {list.length} — affinez la recherche.</p>}
              </div>
            )}
          </section>

          {/* Rappels */}
          <aside className="space-y-2">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold"><Clock className="h-4 w-4 text-attention" /> Rappels à venir</h2>
            {reminders.length === 0 ? <p className="text-sm text-muted-foreground">Aucun rappel programmé.</p> :
              reminders.map((r) => (
                <button key={r.key} type="button" onClick={() => setSelectedKey(r.key)}
                  className="w-full rounded-lg border border-attention/30 bg-card p-3 text-left text-sm">
                  <p className="font-semibold">{r.number} · {r.requester}</p>
                  <p className="text-xs text-muted-foreground">Relance prévue · {fmt(r.followUpAt)}</p>
                  <p className="text-xs">{new Date(r.followUpAt!).getTime() <= Date.now() ? "Échu" : "À venir"} · statut {r.status}</p>
                </button>
              ))}
          </aside>
        </div>
      </main>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedKey(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected && <Detail r={selected} onSeen={() => void markSeen(selected)} onTake={() => void takeCharge(selected)} onChanged={() => void load()} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-card px-3 py-2">
    <p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p>
    <p className="font-display text-sm font-bold">{value}</p>
  </div>;
}

function RequestCard({ r, onOpen, onTake, compact }: { r: ControlRequest; onOpen: () => void; onTake: () => void; compact?: boolean }) {
  const p = PRIO_STYLE[r.priority];
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display font-bold">{r.number}</span>
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${p.cls}`}>{p.label}</span>
        {r.unseen && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-foreground">Non consultée</span>}
        <span className="ml-auto text-xs text-muted-foreground">il y a {elapsed(r.createdAt)}</span>
      </div>
      <p className="mt-1 text-sm font-semibold">{r.requester} <span className="font-normal text-muted-foreground">· {r.city || "Municipalité inconnue"}</span></p>
      <p className="text-xs text-muted-foreground">{r.typeLabel}{r.service ? ` · ${r.service}` : ""}</p>
      <p className="text-xs">Statut : <strong>{r.status}</strong> ({GROUP_LABEL[r.group]}) · reçue {fmt(r.createdAt)}</p>
      {!compact && <p className="truncate text-xs text-muted-foreground">Dernière action : {r.lastAction}</p>}
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" className="min-h-10 flex-1" onClick={onOpen}><Eye className="mr-1 h-4 w-4" /> Consulter</Button>
        {!r.taken && <Button size="sm" className="min-h-10 flex-1" onClick={onTake}><Hand className="mr-1 h-4 w-4" /> Prendre en charge</Button>}
      </div>
    </div>
  );
}

function Detail({ r, onSeen, onTake, onChanged }: { r: ControlRequest; onSeen: () => void; onTake: () => void; onChanged: () => void }) {
  const raw = r.raw as Record<string, unknown>;
  const [notes, setNotes] = useState<{ id: string; note: string; author_email: string | null; created_at: string }[]>([]);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const isSub = r.kind === "dompe";

  useEffect(() => {
    if (!isSub) return;
    void supabase.from("lead_notes").select("id,note,author_email,created_at").eq("submission_id", r.id)
      .order("created_at", { ascending: false }).then(({ data }) => setNotes(data ?? []));
  }, [r.id, isSub]);

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("lead_notes").insert({ submission_id: r.id, note: note.trim(), author_id: user?.id, author_email: user?.email });
    setBusy(false);
    if (error) return toast.error(error.message);
    setNote(""); toast.success("Note interne ajoutée.");
    const { data } = await supabase.from("lead_notes").select("id,note,author_email,created_at").eq("submission_id", r.id).order("created_at", { ascending: false });
    setNotes(data ?? []);
  };
  const setReminder = async () => {
    if (!when) return;
    setBusy(true);
    const { error } = await supabase.from("submissions").update({ next_follow_up_at: new Date(when).toISOString() }).eq("id", r.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Rappel programmé."); onChanged();
  };

  const field = (label: string, v: unknown) => v == null || v === "" || (Array.isArray(v) && !v.length) ? null :
    <div className="flex justify-between gap-3 border-b border-border py-1 text-sm"><span className="text-muted-foreground">{label}</span><span className="text-right">{Array.isArray(v) ? v.join(", ") : String(v)}</span></div>;
  const inProgress = r.notifs.find((n) => n.status === "in_progress");

  return (
    <div className="space-y-4">
      <SheetHeader><SheetTitle>{r.number} — {r.typeLabel}</SheetTitle></SheetHeader>
      <section>
        <h3 className="mb-1 text-xs font-bold uppercase text-muted-foreground">Identification</h3>
        {field("Demandeur", r.requester)}
        {field("Courriel", raw.email ?? raw.client_email)}
        {field("Téléphone", raw.phone ?? raw.client_phone)}
        {field("Reçue le", fmt(r.createdAt))}
      </section>
      <section>
        <h3 className="mb-1 text-xs font-bold uppercase text-muted-foreground">Détails</h3>
        {field("Matériau / service", r.service)}
        {field("Municipalité", r.city)}
        {field("Adresse", raw.address ?? raw.site_address)}
        {field("Quantité", [raw.quantity_value ?? raw.quantity, raw.quantity_unit].filter(Boolean).join(" ") || raw.tonnage)}
        {field("Date souhaitée", raw.desired_date)}
        {field("Délai", raw.delivery_timeframe)}
        {field("Description", raw.description ?? raw.client_notes)}
      </section>
      <section>
        <h3 className="mb-1 text-xs font-bold uppercase text-muted-foreground">Suivi</h3>
        {field("Statut actuel", r.status)}
        {field("Prise en charge", inProgress ? `Oui (${fmt(inProgress.read_at)})` : r.taken ? "Statut déjà avancé" : "Non")}
        {field("Prochaine action", r.followUpAt ? `Relance ${fmt(r.followUpAt)}` : null)}
        <p className="mt-1 text-[11px] text-muted-foreground">Responsable nommé : non enregistré par le système actuel.</p>
        <ul className="mt-2 space-y-1">
          {[...r.notifs].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((n) => (
            <li key={n.id} className="text-xs"><span className="text-muted-foreground">{fmt(n.created_at)}</span> · {n.title}</li>
          ))}
          {r.notifs.length === 0 && <li className="text-xs text-muted-foreground">Aucun historique d'avis.</li>}
        </ul>
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase text-muted-foreground">Actions</h3>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="min-h-11" onClick={onSeen}><Eye className="mr-1 h-4 w-4" /> Marquer consultée</Button>
          <Button className="min-h-11" onClick={onTake} disabled={r.taken}><Hand className="mr-1 h-4 w-4" /> Prendre en charge</Button>
        </div>
        <Button asChild variant="secondary" className="min-h-11 w-full">
          <Link to={r.fullUrl}><ExternalLink className="mr-1 h-4 w-4" /> Fiche complète (modifier le statut)</Link>
        </Button>
        {isSub && <>
          <div className="flex gap-2">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-11" />
            <Button className="min-h-11" variant="outline" disabled={busy || !when} onClick={() => void setReminder()}>Programmer</Button>
          </div>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note interne (visible admin seulement)" />
          <Button className="min-h-11 w-full" variant="outline" disabled={busy || !note.trim()} onClick={() => void addNote()}>Ajouter la note</Button>
          <ul className="space-y-1">{notes.map((n) => <li key={n.id} className="rounded bg-secondary p-2 text-xs"><span className="text-muted-foreground">{fmt(n.created_at)} · {n.author_email}</span><br />{n.note}</li>)}</ul>
        </>}
      </section>
    </div>
  );
}

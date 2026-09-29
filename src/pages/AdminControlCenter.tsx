// ============================================================
// CENTRE DE CONTRÔLE — surveillance et gestion des demandes
// Les demandes ne sont jamais modifiées ici : la prise en charge,
// les rappels, les notes et les résolutions vivent dans le registre
// de suivi séparé (request_followups) avec historique figé.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, Bell, CheckCircle2, Clock, ExternalLink, Eye, Hand, Loader2,
  RefreshCw, Search, ShieldCheck, Siren, CalendarClock, Activity, Settings2,
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
import {
  actionRank, computeSystemState, elapsed, enrich, fromSubmission, fromTransport, matches,
  FILTER_LABELS, FOLLOW_LABEL, GROUP_LABEL, SYSTEM_LABEL,
  type ControlRequest, type Delays, type Filter, type Followup, type NotifLite, type Priority, type SystemState,
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

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const SUB_COLS = "id,dompe_number,submission_number,request_type,company,name,email,phone,city,address,service_type,materials,other_material,quantity,quantity_value,quantity_unit,tonnage,description,created_at,updated_at,status,next_follow_up_at,desired_date,delivery_timeframe";
const TR_COLS = "id,request_number,client_name,client_company,client_phone,client_email,site_city,site_address,material_type,material_other,quantity,quantity_unit,desired_date,status,created_at,updated_at,client_notes";

const DEFAULT_DELAYS: Delays = { firstMin: 15, secondMin: 60, criticalHours: 24, followupDays: 2 };

export default function AdminControlCenter() {
  const { isReady, user } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles(user, isReady);
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<ControlRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [realtime, setRealtime] = useState(false);
  const [openAlerts, setOpenAlerts] = useState(0);
  const [pushFailed, setPushFailed] = useState(0);
  const [delays, setDelays] = useState<Delays>(DEFAULT_DELAYS);
  const [rawDelays, setRawDelays] = useState<Record<string, number>>({});
  const [showSettings, setShowSettings] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(params.get("demande"));
  const [takeMode, setTakeMode] = useState(false);
  const [, tick] = useState(0);
  const debounce = useRef<number | null>(null);
  const knownFollowups = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const [subs, trs, notifs, settings, fus, failed] = await Promise.all([
        supabase.from("submissions").select(SUB_COLS).order("created_at", { ascending: false }).limit(2000),
        supabase.from("transport_requests").select(TR_COLS).order("created_at", { ascending: false }).limit(1000),
        supabase.from("crm_notifications")
          .select("id,entity_id,entity_type,status,category,title,created_at,read_at")
          .in("entity_type", ["submission", "transport_request"])
          .order("created_at", { ascending: false }).limit(3000),
        supabase.from("crm_notification_settings").select("delays").eq("scope", "global").maybeSingle(),
        supabase.from("request_followups").select("*").limit(5000),
        supabase.from("crm_notifications").select("id", { count: "exact", head: true })
          .eq("push_status", "failed").gte("created_at", new Date(Date.now() - 86_400_000).toISOString()),
      ]);
      const err = subs.error || trs.error || notifs.error || fus.error;
      if (err) throw err;
      const d = (settings.data?.delays ?? {}) as Record<string, number>;
      setRawDelays(d);
      const dl: Delays = {
        firstMin: Number(d.cc_first_reminder_min ?? 15),
        secondMin: Number(d.cc_second_reminder_min ?? 60),
        criticalHours: Number(d.cc_critical_hours ?? 24),
        followupDays: Number(d.quote_followup_days ?? 2),
      };
      setDelays(dl);
      const byEntity = new Map<string, NotifLite[]>();
      for (const n of (notifs.data ?? []) as NotifLite[]) {
        const k = `${n.entity_type}:${n.entity_id}`;
        byEntity.set(k, [...(byEntity.get(k) ?? []), n]);
      }
      const fuMap = new Map<string, Followup>();
      for (const f of (fus.data ?? []) as unknown as Followup[]) fuMap.set(`${f.entity_type}:${f.entity_id}`, f);
      const bases = [
        ...((subs.data ?? []) as Record<string, unknown>[]).map(fromSubmission),
        ...((trs.data ?? []) as Record<string, unknown>[]).map(fromTransport),
      ];
      const enriched = bases.map((b) => enrich(b, byEntity.get(b.key) ?? [], fuMap.get(b.key) ?? null, dl));
      // Alerte visible à l'arrivée d'une nouvelle demande pendant que la page est ouverte.
      const keys = new Set(fuMap.keys());
      if (knownFollowups.current) {
        for (const k of keys) if (!knownFollowups.current.has(k)) {
          const r = enriched.find((x) => x.key === k);
          if (r) toast.error(`Nouvelle demande ${r.number} — ${r.requester}`, {
            duration: 20000, action: { label: "Ouvrir", onClick: () => setSelectedKey(k) },
          });
        }
      }
      knownFollowups.current = keys;
      setRows(enriched);
      setPushFailed(failed.count ?? 0);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "request_followups" }, schedule)
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
  const baseSys = computeSystemState({
    loadOk: !loadError, lastSyncAt: lastSync, realtime,
    lastRequestAt: lastRequest?.createdAt ?? null,
    lastRequestHasNotif: lastRequest ? lastRequest.notifs.length > 0 : null,
  });
  const sys: SystemState = baseSys === "ok" && pushFailed > 0 ? "error" : baseSys;

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const counts = useMemo(() => ({
    new: rows.filter((r) => matches(r, "new")).length,
    unseen: rows.filter((r) => r.unseen && r.group === "nouvelle").length,
    urgent: rows.filter((r) => matches(r, "urgent")).length,
    followup: rows.filter((r) => matches(r, "followup")).length,
    doneToday: rows.filter((r) =>
      (r.track?.resolved_at && new Date(r.track.resolved_at) >= todayStart) ||
      (!r.track?.resolved_at && r.group === "traitee" && r.updatedAt && new Date(r.updatedAt) >= todayStart)).length,
  }), [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const priorityList = useMemo(() => rows.filter((r) => actionRank(r) < 9 && r.track?.follow_status !== "resolue")
    .sort((a, b) => actionRank(a) - actionRank(b) || a.createdAt.localeCompare(b.createdAt))
    // Les suivis sont plafonnés à 6 pour ne jamais masquer une nouvelle demande.
    .filter((r, _i, arr) => actionRank(r) !== 2 || arr.filter((x) => actionRank(x) === 2).indexOf(r) < 6), [rows]);

  const reminders = useMemo(() => rows
    .filter((r) => r.followUpAt && r.group !== "annulee" && r.track?.follow_status !== "resolue" && r.group !== "traitee")
    .sort((a, b) => (a.followUpAt ?? "").localeCompare(b.followUpAt ?? "")).slice(0, 10), [rows]);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => matches(r, filter)).filter((r) => !term ||
      [r.number, r.requester, r.service, r.typeLabel, r.city].some((v) => v.toLowerCase().includes(term)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [rows, filter, q]);

  const selected = rows.find((r) => r.key === selectedKey) ?? null;
  const open = (key: string, take = false) => { setSelectedKey(key); setTakeMode(take); };
  const close = () => {
    setSelectedKey(null); setTakeMode(false);
    if (params.get("demande")) { params.delete("demande"); setParams(params, { replace: true }); }
  };

  const saveDelays = async (next: { first: number; second: number; crit: number }) => {
    if (!(next.first > 0 && next.second > next.first && next.crit * 60 > next.second)) {
      toast.error("Les délais doivent être croissants (1er rappel < 2e rappel < alerte critique).");
      return;
    }
    const { error } = await supabase.from("crm_notification_settings").update({
      delays: { ...rawDelays, cc_first_reminder_min: next.first, cc_second_reminder_min: next.second, cc_critical_hours: next.crit },
    } as never).eq("scope", "global");
    if (error) return toast.error(error.message);
    toast.success("Délais enregistrés."); setShowSettings(false); void load();
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
        badge={counts.unseen > 0 ? (
          <span aria-label={`${counts.unseen} nouvelles demandes non consultées`}
            className="shrink-0 rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">
            {counts.unseen} non consultée{counts.unseen > 1 ? "s" : ""}
          </span>) : undefined}
        actions={<>
          <Button variant="outline" size="sm" onClick={() => setShowSettings((v) => !v)}>
            <Settings2 className="mr-1 h-4 w-4" /> Délais</Button>
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); void load(); }} disabled={loading}>
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser</Button>
        </>}
      />
      <main className="mx-auto w-full max-w-7xl space-y-5 px-3 py-4 sm:px-6">
        {showSettings && <DelaySettings delays={delays} onSave={saveDelays} />}

        <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className={`rounded-xl border px-3 py-2 ${SYS_STYLE[sys]}`}>
            <p className="text-[11px] font-semibold uppercase">Avis internes</p>
            <p className="font-display text-sm font-bold">{SYSTEM_LABEL[sys]}</p>
            {pushFailed > 0 && <p className="text-[11px]">{pushFailed} envoi(s) téléphone en échec (24 h)</p>}
          </div>
          <Info label="Dernière synchronisation" value={lastSync ? new Date(lastSync).toLocaleTimeString("fr-CA") : "—"} />
          <Info label="Dernière demande reçue" value={fmt(lastRequest?.createdAt ?? null)} />
          <Info label="Alertes non résolues" value={String(openAlerts)} />
        </section>
        {loadError && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Lecture impossible : {loadError}</p>}

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

        <section className="rounded-xl border-2 border-destructive/50 bg-destructive/5 p-3 sm:p-4">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-bold text-destructive">
            <AlertTriangle className="h-5 w-5" /> Action immédiate requise
          </h2>
          {priorityList.length === 0 ? (
            <p className="text-sm text-muted-foreground">{lastSync ? "Aucune demande n'exige d'action immédiate." : "Chargement…"}</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {priorityList.map((r) => <RequestCard key={r.key} r={r} onOpen={() => open(r.key)} onTake={() => open(r.key, true)} />)}
            </div>
          )}
        </section>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
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
                {list.slice(0, 100).map((r) => <RequestCard key={r.key} r={r} compact onOpen={() => open(r.key)} onTake={() => open(r.key, true)} />)}
                {list.length > 100 && <p className="text-center text-xs text-muted-foreground">100 premières sur {list.length} — affinez la recherche.</p>}
              </div>
            )}
          </section>

          <aside className="space-y-2">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold"><Clock className="h-4 w-4 text-attention" /> Rappels à venir</h2>
            {reminders.length === 0 ? <p className="text-sm text-muted-foreground">Aucun rappel programmé.</p> :
              reminders.map((r) => (
                <button key={r.key} type="button" onClick={() => open(r.key)}
                  className="w-full rounded-lg border border-attention/30 bg-card p-3 text-left text-sm">
                  <p className="font-semibold">{r.number} · {r.requester}</p>
                  <p className="text-xs text-muted-foreground">{r.track?.reminder_reason || r.track?.next_action || "Relance"} · {fmt(r.followUpAt)}</p>
                  <p className="text-xs">
                    {r.track?.reminder_fired_at ? "Déclenché" : new Date(r.followUpAt!).getTime() <= Date.now() ? "Échu" : "À venir"}
                    {r.track?.assignee_email ? ` · ${r.track.assignee_email}` : ""}
                  </p>
                </button>
              ))}
          </aside>
        </div>
      </main>

      <Sheet open={!!selected} onOpenChange={(o) => !o && close()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected && <Detail key={selected.key} r={selected} takeMode={takeMode} myEmail={user?.email ?? ""} onChanged={() => void load()} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DelaySettings({ delays, onSave }: { delays: Delays; onSave: (d: { first: number; second: number; crit: number }) => void }) {
  const [first, setFirst] = useState(delays.firstMin);
  const [second, setSecond] = useState(delays.secondMin);
  const [crit, setCrit] = useState(delays.criticalHours);
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2 font-display text-sm font-bold">Délais des rappels automatiques</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">1er rappel (minutes)<Input type="number" min={1} value={first} onChange={(e) => setFirst(Number(e.target.value))} className="mt-1 h-11" /></label>
        <label className="text-sm">2e rappel (minutes)<Input type="number" min={2} value={second} onChange={(e) => setSecond(Number(e.target.value))} className="mt-1 h-11" /></label>
        <label className="text-sm">Alerte critique (heures)<Input type="number" min={1} value={crit} onChange={(e) => setCrit(Number(e.target.value))} className="mt-1 h-11" /></label>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">La vérification automatique a lieu toutes les 10 minutes : un rappel peut arriver jusqu'à 10 minutes après son délai.</p>
      <Button className="mt-3 min-h-11" onClick={() => onSave({ first, second, crit })}>Enregistrer les délais</Button>
    </section>
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
        {r.unseen && <span className="rounded bg-destructive px-1.5 py-0.5 text-[11px] font-semibold text-destructive-foreground">Non consultée</span>}
        {r.track?.is_test && <span className="rounded border border-border px-1.5 py-0.5 text-[11px]">Test</span>}
        <span className="ml-auto text-xs text-muted-foreground">il y a {elapsed(r.createdAt)}</span>
      </div>
      <p className="mt-1 text-sm font-semibold">{r.requester} <span className="font-normal text-muted-foreground">· {r.city || "Municipalité inconnue"}</span></p>
      <p className="text-xs text-muted-foreground">{r.typeLabel}{r.service ? ` · ${r.service}` : ""}</p>
      <p className="text-xs">Statut : <strong>{r.status}</strong> ({GROUP_LABEL[r.group]})
        {r.track && <> · suivi : <strong>{FOLLOW_LABEL[r.track.follow_status]}</strong></>} · reçue {fmt(r.createdAt)}</p>
      {r.track?.assignee_email && <p className="text-xs">Responsable : {r.track.assignee_email} · depuis {fmt(r.track.taken_at)}</p>}
      {!compact && <p className="truncate text-xs text-muted-foreground">Dernière action : {r.lastAction}</p>}
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="outline" className="min-h-10 flex-1" onClick={onOpen}><Eye className="mr-1 h-4 w-4" /> Consulter</Button>
        {!r.taken && <Button size="sm" className="min-h-10 flex-1" onClick={onTake}><Hand className="mr-1 h-4 w-4" /> Prendre en charge</Button>}
      </div>
    </div>
  );
}

type Ev = { id: string; action: string; detail: Record<string, unknown>; actor_email: string | null; created_at: string };
const EV_LABEL: Record<string, string> = {
  recue: "Demande reçue", consultee: "Consultée", statut_suivi: "Suivi modifié",
  modification: "Suivi modifié", note: "Note interne", rappel_declenche: "Rappel déclenché",
};

function Detail({ r, takeMode, myEmail, onChanged }: { r: ControlRequest; takeMode: boolean; myEmail: string; onChanged: () => void }) {
  const raw = r.raw as Record<string, unknown>;
  const t = r.track;
  const [events, setEvents] = useState<Ev[]>([]);
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState(t?.assignee_email ?? myEmail);
  const [nextAction, setNextAction] = useState(t?.next_action ?? "");
  const [when, setWhen] = useState(t?.next_reminder_at ? toLocalInput(new Date(t.next_reminder_at)) : "");
  const [reason, setReason] = useState(t?.reminder_reason ?? "");
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);
  const entityType = r.kind === "dompe" ? "submission" : "transport_request";

  const loadEvents = useCallback(async () => {
    if (!t) { setEvents([]); return; }
    const { data } = await supabase.from("request_followup_events")
      .select("id,action,detail,actor_email,created_at").eq("followup_id", t.id).order("created_at", { ascending: false });
    setEvents((data ?? []) as Ev[]);
  }, [t]);
  useEffect(() => { void loadEvents(); }, [loadEvents, t?.id, t?.follow_status, t?.next_reminder_at]);

  const ensureRow = async () => {
    const { error } = await supabase.from("request_followups").upsert(
      { entity_type: entityType, entity_id: r.id, received_at: r.createdAt },
      { onConflict: "entity_type,entity_id", ignoreDuplicates: true });
    if (error) throw error;
  };
  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); onChanged(); await loadEvents(); }
    catch (e) { toast.error(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Échec"); }
    finally { setBusy(false); }
  };

  const markSeen = () => run(async () => {
    const { error } = await supabase.rpc("request_followup_mark_seen", { _entity_type: entityType, _entity_id: r.id });
    if (error) throw error;
  }, "Demande marquée comme consultée.");

  const takeCharge = () => run(async () => {
    if (!assignee.trim()) throw new Error("Indiquez le responsable.");
    await ensureRow();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("request_followups").update({
      follow_status: "prise_en_charge",
      assignee_email: assignee.trim(),
      assignee_id: assignee.trim() === user?.email ? user?.id : null,
      taken_at: new Date().toISOString(),
      seen_at: t?.seen_at ?? new Date().toISOString(),
      next_action: nextAction.trim() || null,
      next_reminder_at: when ? new Date(when).toISOString() : null,
      reminder_reason: reason.trim() || null,
    }).eq("entity_type", entityType).eq("entity_id", r.id);
    if (error) throw error;
    if (note.trim()) {
      const { error: e2 } = await supabase.rpc("request_followup_add_note", { _entity_type: entityType, _entity_id: r.id, _note: note });
      if (e2) throw e2;
      setNote("");
    }
  }, "Demande prise en charge.");

  const saveFollow = () => run(async () => {
    await ensureRow();
    const { error } = await supabase.from("request_followups").update({
      next_action: nextAction.trim() || null,
      next_reminder_at: when ? new Date(when).toISOString() : null,
      reminder_reason: reason.trim() || null,
    }).eq("entity_type", entityType).eq("entity_id", r.id);
    if (error) throw error;
  }, "Suivi enregistré.");

  const addNote = () => run(async () => {
    const { error } = await supabase.rpc("request_followup_add_note", { _entity_type: entityType, _entity_id: r.id, _note: note });
    if (error) throw error;
    setNote("");
  }, "Note interne ajoutée.");

  const resolve = () => run(async () => {
    if (resolution.trim().length < 3) throw new Error("Documentez la résolution (3 caractères minimum).");
    await ensureRow();
    const { error } = await supabase.from("request_followups").update({
      follow_status: "resolue", resolution_note: resolution.trim(),
    }).eq("entity_type", entityType).eq("entity_id", r.id);
    if (error) throw error;
  }, "Suivi résolu.");

  const field = (label: string, v: unknown) => v == null || v === "" || (Array.isArray(v) && !v.length) ? null :
    <div className="flex justify-between gap-3 border-b border-border py-1 text-sm"><span className="text-muted-foreground">{label}</span><span className="text-right">{Array.isArray(v) ? v.join(", ") : String(v)}</span></div>;
  const resolved = t?.follow_status === "resolue";

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
        {field("Statut de la demande", r.status)}
        {field("Statut de suivi", t ? FOLLOW_LABEL[t.follow_status] : "Aucun suivi enregistré")}
        {field("Consultée", t?.seen_at ? `${fmt(t.seen_at)} · ${t.seen_by_email ?? ""}` : "Non")}
        {field("Responsable", t?.assignee_email)}
        {field("Prise en charge", t?.taken_at ? fmt(t.taken_at) : null)}
        {field("Prochaine action", t?.next_action)}
        {field("Prochain rappel", t?.next_reminder_at ? `${fmt(t.next_reminder_at)}${t.reminder_fired_at ? " (déclenché)" : ""}` : null)}
        {field("Résolution", t?.resolution_note ? `${t.resolution_note} · ${fmt(t.resolved_at)}` : null)}
      </section>

      {!resolved && <section className="space-y-2 rounded-lg border border-border p-3">
        <h3 className="text-xs font-bold uppercase text-muted-foreground">{r.taken ? "Suivi et rappel" : "Prendre en charge"}</h3>
        {!t?.seen_at && <Button variant="outline" className="min-h-11 w-full" disabled={busy} onClick={() => void markSeen()}>
          <Eye className="mr-1 h-4 w-4" /> Marquer comme consultée</Button>}
        {!t?.taken_at && <label className="block text-sm">Responsable
          <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} className="mt-1 h-11" autoFocus={takeMode} /></label>}
        <label className="block text-sm">Prochaine action
          <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Ex. rappeler le client" className="mt-1 h-11" /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">Rappel le<Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="mt-1 h-11" /></label>
          <label className="text-sm">Raison<Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 h-11" /></label>
        </div>
        {!t?.taken_at && <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note interne (facultative)" />}
        {!t?.taken_at
          ? <Button className="min-h-11 w-full" disabled={busy} onClick={() => void takeCharge()}><Hand className="mr-1 h-4 w-4" /> Prendre en charge</Button>
          : <Button className="min-h-11 w-full" variant="outline" disabled={busy} onClick={() => void saveFollow()}>Enregistrer le suivi</Button>}
      </section>}

      <section className="space-y-2">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note interne (visible admin seulement)" />
        <Button className="min-h-11 w-full" variant="outline" disabled={busy || !note.trim()} onClick={() => void addNote()}>Ajouter la note</Button>
        {!resolved && <>
          <Input value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Résolution documentée (obligatoire pour clore le suivi)" className="h-11" />
          <Button className="min-h-11 w-full" variant="secondary" disabled={busy || resolution.trim().length < 3} onClick={() => void resolve()}>
            <CheckCircle2 className="mr-1 h-4 w-4" /> Résoudre le suivi</Button>
        </>}
        <Button asChild variant="secondary" className="min-h-11 w-full">
          <Link to={r.fullUrl}><ExternalLink className="mr-1 h-4 w-4" /> Fiche complète (modifier le statut de la demande)</Link>
        </Button>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-bold uppercase text-muted-foreground">Historique</h3>
        <ul className="space-y-1">
          {events.map((e) => (
            <li key={e.id} className="rounded bg-secondary p-2 text-xs">
              <span className="text-muted-foreground">{fmt(e.created_at)}{e.actor_email ? ` · ${e.actor_email}` : ""}</span><br />
              <strong>{EV_LABEL[e.action] ?? e.action}</strong>
              {e.action === "note" ? ` : ${String(e.detail.note ?? "")}` :
                Object.keys(e.detail ?? {}).length > 0 && e.action !== "recue" ? ` : ${Object.entries(e.detail).map(([k, v]) =>
                  typeof v === "object" && v && "apres" in (v as object) ? `${k} → ${String((v as { apres: unknown }).apres ?? "—")}` : `${k} ${String(v)}`).join(" · ")}` : ""}
            </li>
          ))}
          {[...r.notifs].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((n) => (
            <li key={n.id} className="text-xs"><span className="text-muted-foreground">{fmt(n.created_at)}</span> · Avis : {n.title}</li>
          ))}
          {events.length === 0 && r.notifs.length === 0 && <li className="text-xs text-muted-foreground">Aucun historique.</li>}
        </ul>
      </section>
    </div>
  );
}

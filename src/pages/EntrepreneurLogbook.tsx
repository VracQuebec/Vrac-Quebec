// LOG-01 — Logbook et heures de conduite (prototype privé, NON certifié, aucun DCE connecté).
// Toutes les écritures passent par les RPC log_* (droits, isolation, anti-doublon, versions).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { CATEGORIES, DUTY, catLabel, dayBounds, daySegments, dutyLabel, fmtLocal, newClientId, tzOffsetMin, zonedToUtc } from "@/lib/logbook/day";

type Ctx = { company_id: string | null; company_name?: string; role?: string; enabled?: boolean; manager?: boolean };
type Ev = {
  id: string; root_id: string; supersedes_id: string | null; revision: number; state: string; duty_status: string; category: string | null;
  started_at: string; ended_at: string | null; entered_at: string; received_at: string; actor_id: string; driver_user_id: string;
  truck_id: string | null; time_zone: string; utc_offset_min: number; source: string; correction_reason: string | null; note: string | null; validation_label: string;
};
type Profile = Record<string, string | number | null> & { version: number; time_zone: string; day_start: string };
type Truck = { id: string; name: string; unit_number: string | null; plate: string | null; vin: string | null; year: number | null; pnbv_kg: number | null };
type SaveState = { kind: "idle" | "envoi" | "confirme" | "erreur"; msg?: string };

const sel = "h-10 w-full rounded-md border border-input bg-background px-2 text-sm";
const today = () => new Date().toISOString().slice(0, 10);
const COLORS: Record<string, string> = { repos: "bg-muted-foreground/50", couchette: "bg-secondary", conduite: "bg-primary", travail: "bg-accent", a_completer: "bg-destructive/20" };

function SaveBadge({ s }: { s: SaveState }) {
  if (s.kind === "idle") return null;
  const t = s.kind === "envoi" ? "Envoi au serveur…" : s.kind === "confirme" ? "Confirmé par le serveur" : `Erreur — non enregistré : ${s.msg}`;
  return <p role="status" className={`text-sm ${s.kind === "erreur" ? "text-destructive" : "text-muted-foreground"}`}>{t}</p>;
}

export default function EntrepreneurLogbook() {
  const { user } = useAuthReady();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("onglet") ?? "journal";
  const setTab = (t: string) => { const n = new URLSearchParams(sp); n.set("onglet", t); setSp(n, { replace: true }); };

  useEffect(() => { void supabase.rpc("log_my_context").then(({ data, error }) => error ? setErr(error.message) : setCtx(data as Ctx)); }, [user?.id]);

  const tabs = [["journal", "Mon logbook"], ...(ctx?.manager ? [["chauffeurs", "Logbooks des chauffeurs"]] : []), ["profil", "Profil réglementaire"], ["qualif", "Qualification du mode"], ...(ctx?.manager ? [["vehicules", "Véhicules et DCE"]] : [])];

  return (
    <EntrepreneurAppShell title="Logbook et heures de conduite" subtitle="Gestion de flotte" backTo="/entrepreneur/flotte">
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-5">
        <div className="rounded-md border border-border bg-muted p-3 text-sm">
          <strong>Prototype privé LOG-01 — non certifié.</strong> Ce journal n'est pas un DCE et ne remplace pas un registre réglementaire. <strong>DCE non connecté.</strong> Aucun compteur d'heures ni verdict « autorisé à conduire » dans ce lot.
        </div>
        {err && <p className="text-destructive">{err}</p>}
        {!ctx ? <p className="text-muted-foreground">Chargement…</p> : !ctx.company_id ? <p>Aucune entreprise rattachée à ce compte.</p>
          : !ctx.enabled ? <p className="rounded-md border border-border p-4">Le logbook n'est pas activé pour {ctx.company_name}. Il est réservé aux entreprises autorisées pour les essais par l'administration Vrac Québec.</p>
          : user && <div key={ctx.company_id} className="space-y-4">
            <nav className="flex flex-wrap gap-2">{tabs.map(([v, l]) => <Button key={v} size="sm" variant={tab === v ? "default" : "outline"} onClick={() => setTab(v)}>{l}</Button>)}</nav>
            <Workspace tab={tab} companyId={ctx.company_id} me={user.id} manager={!!ctx.manager} />
          </div>}
      </div>
    </EntrepreneurAppShell>
  );
}

function Workspace({ tab, companyId, me, manager }: { tab: string; companyId: string; me: string; manager: boolean }) {
  const [drivers, setDrivers] = useState<{ user_id: string; email: string; display_name: string | null; role: string }[]>([]);
  const [driver, setDriver] = useState(me);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  useEffect(() => {
    void supabase.from("trucks").select("id,name,unit_number,plate,vin,year,pnbv_kg").eq("company_id", companyId).is("archived_at", null).order("name").then(({ data }) => setTrucks((data ?? []) as Truck[]));
    if (manager) void supabase.rpc("log_company_drivers", { p_company: companyId }).then(({ data }) => setDrivers((data ?? []) as typeof drivers));
  }, [companyId, manager]);
  const target = tab === "chauffeurs" ? driver : me;
  const picker = tab === "chauffeurs" && <label className="block text-sm">Chauffeur
    <select className={sel} value={driver} onChange={(e) => setDriver(e.target.value)}>
      {drivers.map((d) => <option key={d.user_id} value={d.user_id}>{d.display_name ?? d.email} ({d.role})</option>)}
    </select></label>;
  if (tab === "vehicules") return <Vehicles companyId={companyId} trucks={trucks} />;
  return <div className="space-y-4">{picker}
    <ProfileGate key={target} companyId={companyId} driver={target} me={me} trucks={trucks} tab={tab === "chauffeurs" ? "journal" : tab} />
  </div>;
}

function ProfileGate({ companyId, driver, me, trucks, tab }: { companyId: string; driver: string; me: string; trucks: Truck[]; tab: string }) {
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const load = useCallback(async () => {
    const { data } = await supabase.from("log_profiles").select("*").eq("company_id", companyId).eq("driver_user_id", driver).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, [companyId, driver]);
  useEffect(() => { void load(); }, [load]);
  if (profile === undefined) return <p className="text-muted-foreground">Chargement…</p>;
  if (tab === "profil") return <ProfileForm companyId={companyId} driver={driver} profile={profile} trucks={trucks} onSaved={load} />;
  if (tab === "qualif") return <Qualification companyId={companyId} driver={driver} />;
  if (!profile) return <div className="rounded-md border border-border p-4 text-sm">Profil réglementaire à compléter avant le journal (terminus, fuseau, heure de début de journée). <ProfileForm companyId={companyId} driver={driver} profile={null} trucks={trucks} onSaved={load} /></div>;
  return <Journal companyId={companyId} driver={driver} isSelf={driver === me} profile={profile} trucks={trucks} />;
}

function ProfileForm({ companyId, driver, profile, trucks, onSaved }: { companyId: string; driver: string; profile: Profile | null; trucks: Truck[]; onSaved: () => void }) {
  const init = { display_name: "", license_number: "", license_jurisdiction: "QC", home_terminal: "", home_terminal_address: "", time_zone: "America/Toronto", day_start: "00:00", cycle: "a_determiner", regime: "a_determiner", history_status: "incomplet", history_note: "", current_truck_id: "", codriver_user_id: "" };
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(init).map(([k, v]) => [k, profile?.[k] != null ? String(profile[k]).slice(0, k === "day_start" ? 5 : undefined) : v])));
  const [s, setS] = useState<SaveState>({ kind: "idle" });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setS({ kind: "envoi" });
    const { error } = await supabase.rpc("log_save_profile", { p_company: companyId, p_driver: driver, p: f, p_expected_version: profile?.version ?? null });
    if (error) return setS({ kind: "erreur", msg: error.message });
    setS({ kind: "confirme" }); onSaved();
  };
  const tx = (k: string, l: string) => <label className="block text-sm">{l}<Input value={f[k]} onChange={set(k)} /></label>;
  const op = (k: string, l: string, opts: [string, string][]) => <label className="block text-sm">{l}<select className={sel} value={f[k]} onChange={set(k)}>{opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>;
  return <section className="mt-3 grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
    <p className="text-xs text-muted-foreground sm:col-span-2">Version {profile?.version ?? "—"} · chaque enregistrement crée une nouvelle version; les journaux existants gardent la version en vigueur à leur saisie.</p>
    {tx("display_name", "Nom du conducteur")}{tx("license_number", "Numéro de permis")}{tx("license_jurisdiction", "Autorité du permis")}
    {tx("home_terminal", "Terminus d'attache")}{tx("home_terminal_address", "Adresse du terminus")}
    {op("time_zone", "Fuseau du terminus", [["America/Toronto", "America/Toronto (Québec)"], ["America/Halifax", "America/Halifax"], ["America/Winnipeg", "America/Winnipeg"]])}
    <label className="block text-sm">Heure désignée de début de journée<Input type="time" value={f.day_start} onChange={set("day_start")} /></label>
    {op("cycle", "Cycle sélectionné", [["a_determiner", "À déterminer"], ["cycle_1", "Cycle 1"], ["cycle_2", "Cycle 2"]])}
    {op("regime", "Régime déclaré", [["a_determiner", "À déterminer"], ["quebec_intraprovincial", "Québec intraprovincial"], ["federal", "Fédéral"]])}
    {op("history_status", "Historique antérieur", [["incomplet", "Incomplet"], ["partiel", "Partiel"], ["complet_declare", "Complet (déclaré)"]])}
    {tx("history_note", "Note sur l'historique")}
    {op("current_truck_id", "Véhicule utilisé", [["", "—"], ...trucks.map((t) => [t.id, `${t.unit_number ?? t.name} ${t.plate ?? ""}`] as [string, string])])}
    {tx("codriver_user_id", "Coconducteur (identifiant, facultatif)")}
    <div className="flex items-center gap-3 sm:col-span-2"><Button onClick={save} disabled={s.kind === "envoi"}>Enregistrer le profil</Button><SaveBadge s={s} /></div>
  </section>;
}

function Journal({ companyId, driver, isSelf, profile, trucks }: { companyId: string; driver: string; isSelf: boolean; profile: Profile; trucks: Truck[] }) {
  const tz = profile.time_zone; const [date, setDate] = useState(today());
  const [events, setEvents] = useState<Ev[]>([]); const [atts, setAtts] = useState<{ id: string; file_name: string; storage_path: string }[]>([]);
  const [s, setS] = useState<SaveState>({ kind: "idle" });
  const [editing, setEditing] = useState<Ev | null>(null);
  const [cid, setCid] = useState(newClientId);
  const { start, end } = useMemo(() => dayBounds(date, String(profile.day_start), tz), [date, profile.day_start, tz]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("log_events").select("*").eq("company_id", companyId).eq("driver_user_id", driver)
      .lt("started_at", end.toISOString()).or(`ended_at.is.null,ended_at.gt.${start.toISOString()}`).order("started_at");
    setEvents((data ?? []) as Ev[]);
    const { data: a } = await supabase.from("log_attachments").select("id,file_name,storage_path").eq("company_id", companyId).eq("driver_user_id", driver).eq("day", date);
    setAtts(a ?? []);
  }, [companyId, driver, start, end, date]);
  useEffect(() => { void load(); }, [load]);
  const active = events.filter((e) => e.state === "actif");
  const proposals = events.filter((e) => e.state === "propose");
  const day = daySegments(active, start, end);
  const current = active.find((e) => !e.ended_at);
  const span = end.getTime() - start.getTime();

  const [f, setF] = useState({ duty_status: "repos", category: "", start: "", end: "", truck_id: String(profile.current_truck_id ?? ""), note: "", reason: "" });
  const toUtc = (v: string) => (v ? zonedToUtc(v.slice(0, 10), v.slice(11, 16), tz).toISOString() : "");
  const submit = async () => {
    if (!f.start) return setS({ kind: "erreur", msg: "heure de début requise" });
    setS({ kind: "envoi" });
    const st = toUtc(f.start);
    const payload = { duty_status: f.duty_status, category: f.category, started_at: st, ended_at: toUtc(f.end), truck_id: f.truck_id, note: f.note,
      time_zone: tz, utc_offset_min: tzOffsetMin(tz, new Date(st)), entered_at: new Date().toISOString() };
    const { data, error } = editing
      ? await supabase.rpc("log_correct_event", { p_event: editing.id, p: payload, p_reason: f.reason, p_client_id: cid })
      : await supabase.rpc("log_add_event", { p_company: companyId, p_driver: driver, p: { ...payload, reason: f.reason }, p_client_id: cid });
    if (error) return setS({ kind: "erreur", msg: error.message });
    const r = data as { state: string; duplicate: boolean };
    setS({ kind: "confirme", msg: r.state });
    setCid(newClientId()); setEditing(null); setF({ ...f, note: "", reason: "", start: "", end: "" }); void load();
  };
  const startEdit = (e: Ev) => {
    const loc = (iso: string | null) => (iso ? `${fmtLocal(iso, tz, true).slice(0, 10)}T${fmtLocal(iso, tz)}` : "");
    setEditing(e); setCid(newClientId());
    setF({ duty_status: e.duty_status, category: e.category ?? "", start: loc(e.started_at), end: loc(e.ended_at), truck_id: e.truck_id ?? "", note: e.note ?? "", reason: "" });
  };
  const decide = async (id: string, accept: boolean) => {
    setS({ kind: "envoi" });
    const { error } = await supabase.rpc("log_decide", { p_proposal: id, p_accept: accept, p_note: accept ? "Acceptée" : "Refusée" });
    setS(error ? { kind: "erreur", msg: error.message } : { kind: "confirme" }); void load();
  };
  const upload = async (file: File) => {
    setS({ kind: "envoi" });
    const path = `${companyId}/${driver}/${date}-${newClientId()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const up = await supabase.storage.from("log-files").upload(path, file);
    if (up.error) return setS({ kind: "erreur", msg: up.error.message });
    const { error } = await supabase.rpc("log_register_attachment", { p_company: companyId, p_driver: driver, p_path: path, p_name: file.name, p_mime: file.type, p_day: date, p_root: null });
    setS(error ? { kind: "erreur", msg: error.message } : { kind: "confirme" }); void load();
  };
  const openFile = async (p: string) => { const { data } = await supabase.storage.from("log-files").createSignedUrl(p, 60); if (data) window.open(data.signedUrl, "_blank"); };
  const truckName = (id: string | null) => { const t = trucks.find((x) => x.id === id); return t ? (t.unit_number ?? t.name) : "—"; };
  const completenessLabel = { future_ou_en_cours: "Journée en cours ou future — non vérifiée", incomplete: `Incomplète — ${Math.floor(day.missingMin / 60)} h ${day.missingMin % 60} min à compléter`, couverte_non_verifiee: "Périodes couvertes — non vérifiée (prototype)" }[day.completeness];

  return <div className="space-y-4">
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Date<Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
      <div className="text-sm"><div>Statut courant : <strong>{current ? dutyLabel(current.duty_status) : "aucune activité ouverte"}</strong></div>
        <div className="text-muted-foreground">Terminus {String(profile.home_terminal ?? "à compléter")} · {tz} · début {String(profile.day_start).slice(0, 5)} · véhicule {truckName(String(profile.current_truck_id ?? "") || null)}</div></div>
    </div>
    <section aria-label="Grille journalière" className="rounded-md border border-border p-3">
      {DUTY.map((d) => <div key={d.value} className="flex items-center gap-2 py-1">
        <span className="w-28 shrink-0 text-xs sm:w-52">{d.label}</span>
        <div className="relative h-5 flex-1 rounded bg-muted">{day.segments.filter((g) => g.status === d.value).map((g, i) =>
          <div key={i} className={`absolute inset-y-0 ${COLORS[g.status]}`} style={{ left: `${((g.from - start.getTime()) / span) * 100}%`, width: `${((g.to - g.from) / span) * 100}%` }} />)}</div>
      </div>)}
      <div className="flex items-center gap-2 py-1"><span className="w-28 shrink-0 text-xs sm:w-52">À compléter</span>
        <div className="relative h-5 flex-1 rounded bg-muted">{day.segments.filter((g) => g.status === "a_completer").map((g, i) =>
          <div key={i} className={`absolute inset-y-0 ${COLORS.a_completer}`} style={{ left: `${((g.from - start.getTime()) / span) * 100}%`, width: `${((g.to - g.from) / span) * 100}%` }} />)}</div></div>
      <p className="mt-2 text-sm font-medium">{completenessLabel}</p>
    </section>

    {proposals.length > 0 && <section className="rounded-md border border-border p-3"><h3 className="font-bold">Propositions du gestionnaire</h3>
      {proposals.map((p) => { const base = events.find((e) => e.id === p.supersedes_id); return <div key={p.id} className="mt-2 text-sm">
        <div>Avant : {base ? `${dutyLabel(base.duty_status)} ${fmtLocal(base.started_at, tz)}–${base.ended_at ? fmtLocal(base.ended_at, tz) : "…"}` : "(nouvelle activité)"}</div>
        <div>Après : {dutyLabel(p.duty_status)} {fmtLocal(p.started_at, tz)}–{p.ended_at ? fmtLocal(p.ended_at, tz) : "…"} · motif : {p.correction_reason}</div>
        {isSelf ? <div className="mt-1 flex gap-2"><Button size="sm" onClick={() => decide(p.id, true)}>Accepter</Button><Button size="sm" variant="outline" onClick={() => decide(p.id, false)}>Refuser</Button></div> : <div className="text-muted-foreground">En attente de la décision du chauffeur</div>}
      </div>; })}</section>}

    <section aria-label="Liste chronologique" className="space-y-2">
      <h3 className="font-bold">Activités (versions courantes et historique)</h3>
      {events.length === 0 && <p className="text-sm text-muted-foreground">Aucune activité pour cette journée.</p>}
      {events.filter((e) => e.state !== "propose").map((e) => <div key={e.id} className={`rounded-md border border-border p-3 text-sm ${e.state !== "actif" ? "opacity-60" : ""}`}>
        <div className="flex flex-wrap justify-between gap-2"><strong>{dutyLabel(e.duty_status)}{catLabel(e.category) ? ` · ${catLabel(e.category)}` : ""}</strong>
          <span>{fmtLocal(e.started_at, tz, true)} → {e.ended_at ? fmtLocal(e.ended_at, tz, true) : "en cours"}</span></div>
        <div className="text-xs text-muted-foreground">v{e.revision} · {e.state === "actif" ? "version courante" : e.state === "remplace" ? "original conservé (remplacé)" : e.state} · source {e.source} · véhicule {truckName(e.truck_id)} · décalage UTC {e.utc_offset_min / 60} h</div>
        <div className="text-xs text-muted-foreground">Saisie {fmtLocal(e.entered_at, tz, true)} · reçue serveur {fmtLocal(e.received_at, tz, true)} · acteur {e.actor_id === driver ? "chauffeur" : "gestionnaire"} · {e.validation_label}</div>
        {e.correction_reason && <div className="text-xs">Motif : {e.correction_reason}</div>}{e.note && <div className="text-xs">Note : {e.note}</div>}
        {e.state === "actif" && <Button size="sm" variant="outline" className="mt-2" onClick={() => startEdit(e)}>{isSelf ? "Corriger" : "Proposer une correction"}</Button>}
      </div>)}
    </section>

    <section className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
      <h3 className="font-bold sm:col-span-2">{editing ? (isSelf ? "Corriger (nouvelle version liée)" : "Proposer une correction au chauffeur") : isSelf ? "Ajouter une activité" : "Proposer une activité au chauffeur"}</h3>
      <label className="text-sm">État réglementaire<select className={sel} value={f.duty_status} onChange={(e) => setF({ ...f, duty_status: e.target.value })}>{DUTY.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></label>
      <label className="text-sm">Catégorie métier (facultative)<select className={sel} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">—</option>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="text-sm">Début réel ({tz})<Input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
      <label className="text-sm">Fin réelle (vide = en cours)<Input type="datetime-local" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
      {!editing && <label className="text-sm">Véhicule<select className={sel} value={f.truck_id} onChange={(e) => setF({ ...f, truck_id: e.target.value })}><option value="">—</option>{trucks.map((t) => <option key={t.id} value={t.id}>{t.unit_number ?? t.name} {t.plate ?? ""}</option>)}</select></label>}
      <label className="text-sm">Note privée<Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      {(editing || !isSelf) && <label className="text-sm sm:col-span-2">Motif {editing ? "(obligatoire)" : ""}<Textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>}
      <p className="text-xs text-muted-foreground sm:col-span-2">L'attente, l'arrêt du moteur ou une pause de paie ne sont jamais convertis en repos automatiquement. Aucune paie, facture, voyage ou écriture n'est créé.</p>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><Button onClick={submit} disabled={s.kind === "envoi"}>{editing ? "Envoyer la correction" : "Envoyer"}</Button>
        {editing && <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>}<SaveBadge s={s} /></div>
    </section>

    <section className="rounded-md border border-border p-4 text-sm"><h3 className="font-bold">Pièces jointes privées du jour</h3>
      <input type="file" accept="application/pdf,image/*" className="mt-2" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {atts.map((a) => <button key={a.id} className="block underline" onClick={() => openFile(a.storage_path)}>{a.file_name}</button>)}
    </section>
  </div>;
}

function Qualification({ companyId, driver }: { companyId: string; driver: string }) {
  const [hist, setHist] = useState<{ id: string; path: string; reasons: string | null; reviewed_at: string; hours_rules: string; report_obligation: string; dce_obligation: string; solution_coverage: string }[]>([]);
  const [a, setA] = useState<Record<string, boolean | string>>({});
  const [f, setF] = useState({ hours_rules: "a_determiner", report_obligation: "a_determiner", dce_obligation: "a_determiner", reasons: "" });
  const [s, setS] = useState<SaveState>({ kind: "idle" });
  const load = useCallback(async () => { const { data } = await supabase.from("log_qualifications").select("*").eq("company_id", companyId).eq("driver_user_id", driver).order("reviewed_at", { ascending: false }); setHist((data ?? []) as typeof hist); }, [companyId, driver]);
  useEffect(() => { void load(); }, [load]);
  const save = async () => { setS({ kind: "envoi" }); const { error } = await supabase.rpc("log_save_qualification", { p_company: companyId, p_driver: driver, p: { ...f, answers: a } }); setS(error ? { kind: "erreur", msg: error.message } : { kind: "confirme" }); void load(); };
  const PATHS: Record<string, string> = { A: "A — Registre local potentiellement admissible", B: "B — Rapport électronique hors obligation DCE", C: "C — DCE obligatoire (non pris en charge : DCE non connecté)", D: "D — À déterminer ou non pris en charge" };
  const chk = (k: string, l: string) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!a[k]} onChange={(e) => setA({ ...a, [k]: e.target.checked })} />{l}</label>;
  const op = (k: keyof typeof f, l: string, o: [string, string][]) => <label className="text-sm">{l}<select className={sel} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>{o.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>;
  return <div className="space-y-4">
    <section className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
      <p className="text-sm sm:col-span-2">Qualification <strong>préliminaire</strong>. Les quatre questions restent séparées : règles d'heures, rapport ou registre local, obligation DCE, couverture réelle de Vrac Québec. Aucune exemption n'est déduite d'une case « local », d'un camion ancien ou d'une donnée manquante.</p>
      {op("hours_rules", "1. Assujettissement aux règles d'heures", [["a_determiner", "À déterminer"], ["assujetti", "Assujetti"], ["non_assujetti_declare", "Non assujetti (motif requis)"]])}
      {op("report_obligation", "2. Rapport / registre local", [["a_determiner", "À déterminer"], ["rapport_requis", "Rapport requis"], ["registre_local_potentiel", "Registre local potentiellement admissible"]])}
      {op("dce_obligation", "3. Obligation DCE", [["a_determiner", "À déterminer"], ["dce_obligatoire", "DCE obligatoire"], ["hors_obligation_dce", "Hors obligation DCE"]])}
      <div className="text-sm">4. Couverture de notre solution : prototype non certifié; DCE non connecté.</div>
      <div className="space-y-1 sm:col-span-2"><p className="text-sm font-medium">Éléments vérifiés (requis pour un registre local)</p>
        {chk("rayon_km_verifie", "Rayon d'exploitation vérifié")}{chk("retour_terminus_verifie", "Retour quotidien au terminus vérifié")}{chk("repos_verifie", "Repos requis vérifié")}{chk("registres_exploitant_verifies", "Registres de l'exploitant vérifiés")}{chk("permis_particulier", "Permis particulier en cause")}</div>
      <label className="text-sm sm:col-span-2">Motifs et justificatifs (référence de document)<Textarea value={f.reasons} onChange={(e) => setF({ ...f, reasons: e.target.value })} /></label>
      <div className="flex items-center gap-3 sm:col-span-2"><Button onClick={save}>Enregistrer la revue</Button><SaveBadge s={s} /></div>
    </section>
    <section className="space-y-2"><h3 className="font-bold">Historique des revues</h3>
      {hist.map((h) => <div key={h.id} className="rounded-md border border-border p-3 text-sm"><strong>{PATHS[h.path]}</strong>
        <div className="text-xs text-muted-foreground">{new Date(h.reviewed_at).toLocaleString("fr-CA", { timeZone: "America/Toronto" })} · heures : {h.hours_rules} · rapport : {h.report_obligation} · DCE : {h.dce_obligation} · couverture : {h.solution_coverage}</div>
        {h.reasons && <div className="text-xs">Motifs : {h.reasons}</div>}</div>)}</section>
  </div>;
}

function Vehicles({ companyId, trucks }: { companyId: string; trucks: Truck[] }) {
  const [ext, setExt] = useState<Record<string, Record<string, string>>>({});
  const [dce, setDce] = useState<Record<string, string | null>[]>([]);
  const [s, setS] = useState<SaveState>({ kind: "idle" });
  const [d, setD] = useState({ truck_id: "", provider: "", model: "", device_identifier: "", certification_number: "", software_version: "" });
  const load = useCallback(async () => {
    const { data } = await supabase.from("log_vehicle_ext").select("*").eq("company_id", companyId);
    setExt(Object.fromEntries((data ?? []).map((r) => [r.truck_id, r as unknown as Record<string, string>])));
    const { data: dv } = await supabase.from("log_dce_devices").select("*").eq("company_id", companyId).order("created_at");
    setDce((dv ?? []) as typeof dce);
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);
  const saveV = async (id: string, patch: Record<string, string>) => { setS({ kind: "envoi" }); const { error } = await supabase.rpc("log_save_vehicle", { p_truck: id, p: { ...(ext[id] ?? {}), ...patch } }); setS(error ? { kind: "erreur", msg: error.message } : { kind: "confirme" }); void load(); };
  const saveD = async () => { setS({ kind: "envoi" }); const { error } = await supabase.rpc("log_save_dce", { p_company: companyId, p: d }); setS(error ? { kind: "erreur", msg: error.message } : { kind: "confirme" }); void load(); };
  const yn: [string, string][] = [["a_confirmer", "À confirmer"], ["oui", "Oui"], ["non", "Non"]];
  return <div className="space-y-4"><SaveBadge s={s} />
    {trucks.map((t) => { const e = ext[t.id] ?? {}; return <div key={t.id} className="grid gap-2 rounded-md border border-border p-3 text-sm sm:grid-cols-4">
      <div className="sm:col-span-4"><strong>{t.unit_number ?? t.name}</strong> · année {t.year ?? "à compléter"} · plaque {t.plate ?? "à compléter"} · NIV {t.vin ?? "à compléter"} · PNBV {t.pnbv_kg ? `${t.pnbv_kg} kg` : "à compléter"} <span className="text-muted-foreground">(modifiables dans Ma flotte)</span></div>
      <label>Couchette<select className={sel} value={e.has_sleeper ?? "a_confirmer"} onChange={(x) => saveV(t.id, { has_sleeper: x.target.value })}>{yn.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>Location<select className={sel} value={e.is_leased ?? "a_confirmer"} onChange={(x) => saveV(t.id, { is_leased: x.target.value })}>{yn.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>Locateur<Input defaultValue={e.lessor ?? ""} onBlur={(x) => x.target.value !== (e.lessor ?? "") && saveV(t.id, { lessor: x.target.value })} /></label>
      <label>Dispositif installé<Input defaultValue={e.device_installed ?? ""} onBlur={(x) => x.target.value !== (e.device_installed ?? "") && saveV(t.id, { device_installed: x.target.value })} /></label>
    </div>; })}
    <section className="grid gap-2 rounded-md border border-border p-4 text-sm sm:grid-cols-3">
      <h3 className="font-bold sm:col-span-3">Point d'intégration DCE — fournisseur certifié futur</h3>
      <p className="sm:col-span-3"><strong>DCE non connecté.</strong> Ces fiches documentent un futur fournisseur; aucune donnée n'est échangée et aucune certification n'est vérifiée ici.</p>
      <label>Véhicule<select className={sel} value={d.truck_id} onChange={(e) => setD({ ...d, truck_id: e.target.value })}><option value="">—</option>{trucks.map((t) => <option key={t.id} value={t.id}>{t.unit_number ?? t.name}</option>)}</select></label>
      {(["provider", "model", "device_identifier", "certification_number", "software_version"] as const).map((k) => <label key={k}>{{ provider: "Fournisseur", model: "Modèle", device_identifier: "Identifiant", certification_number: "N° de certification", software_version: "Version" }[k]}<Input value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} /></label>)}
      <Button className="sm:col-span-3 sm:w-fit" onClick={saveD}>Ajouter la fiche</Button>
      {dce.map((x) => <div key={String(x.id)} className="sm:col-span-3">{x.provider ?? "—"} {x.model ?? ""} · cert. {x.certification_number ?? "—"} · statut : <strong>non connecté</strong></div>)}
    </section>
  </div>;
}

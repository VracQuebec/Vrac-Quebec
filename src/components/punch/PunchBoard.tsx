import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import PayrollPanel from "./PayrollPanel";
import { Clock, Coffee, LogIn, LogOut, MapPin, Download } from "lucide-react";

const db = supabase as any;
const PLACES = [
  { v: "bureau", l: "Bureau" }, { v: "chantier", l: "Chantier" }, { v: "route", l: "Sur la route" },
  { v: "atelier", l: "Atelier / garage" }, { v: "autre", l: "Autre" },
];
const STATUS: Record<string, string> = { ouvert: "En cours", soumis: "À approuver", approuve: "Approuvé", refuse: "Refusé" };
const MANAGERS = ["support", "proprietaire", "gestionnaire"];
const fmtMin = (x: number) => { const m = Math.max(0, Number(x) || 0); return `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, "0")}`; };
const dt = (s: string) => new Date(s).toLocaleString("fr-CA", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const monday = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const ymd = (d: Date) => localInput(d).slice(0, 10);

type Entry = { id: string; user_id: string; kind: string; started_at: string; ended_at: string | null; place_type: string; site_label: string | null; status: string; source: string; note: string | null; decision_reason: string | null; geo_consent: boolean };

function getPos(): Promise<GeolocationPosition | null> {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(res, () => res(null), { enableHighAccuracy: true, timeout: 8000 });
  });
}

export default function PunchBoard({ companyId, role }: { companyId: string; role: string }) {
  const isMgr = MANAGERS.includes(role);
  const canPunch = role !== "lecture";
  const [me, setMe] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [members, setMembers] = useState<{ user_id: string; full_name: string | null; email: string | null }[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [place, setPlace] = useState("bureau");
  const [site, setSite] = useState("");
  const [client, setClient] = useState("");
  const [consent, setConsent] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [tab, setTab] = useState<"moi" | "equipe" | "paie" | "salaire">("moi");
  const [from, setFrom] = useState(ymd(monday()));
  const [to, setTo] = useState(ymd(new Date()));
  const [summary, setSummary] = useState<any[]>([]);
  const [manual, setManual] = useState<{ user: string; start: string; end: string; reason: string; replace?: string } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    setMe(u.user?.id ?? null);
    const start = new Date(from + "T00:00:00"); start.setDate(start.getDate() - 1);
    const [{ data: e }, { data: m }, { data: c }, { data: s }] = await Promise.all([
      db.from("pun_entries").select("*").eq("company_id", companyId).is("archived_at", null).or(`started_at.gte.${start.toISOString()},ended_at.is.null`).order("started_at", { ascending: false }).limit(500),
      db.from("jsc_company_members").select("user_id,full_name,email").eq("company_id", companyId).eq("is_active", true).is("archived_at", null),
      db.from("ent_crm_clients").select("id,name").eq("company_id", companyId).is("archived_at", null).order("name").limit(300),
      db.rpc("pun_summary", { _company: companyId, _from: from, _to: to }),
    ]);
    setEntries(e ?? []); setMembers(m ?? []); setClients(c ?? []); setSummary(s ?? []);
  }, [companyId, from, to]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const name = (id: string) => { const m = members.find((x) => x.user_id === id); return m?.full_name || m?.email || "Employé"; };
  const mine = entries.filter((e) => e.user_id === me);
  const openWork = mine.find((e) => e.kind === "travail" && !e.ended_at);
  const openBreak = mine.find((e) => e.kind === "pause" && !e.ended_at);
  const pending = entries.filter((e) => e.status === "soumis" && e.ended_at);

  const run = async (fn: () => Promise<{ error: any }>, ok: string) => {
    if (busy) return;
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) return toast({ title: "Action refusée", description: error.message, variant: "destructive" });
    toast({ title: ok });
    load();
  };

  const punchIn = () => run(async () => {
    const p = consent ? await getPos() : null;
    return db.rpc("pun_in", { _company: companyId, _place: place, _site: site, _client: client || null, _note: null, _consent: consent && !!p,
      _lat: p?.coords.latitude ?? null, _lng: p?.coords.longitude ?? null, _acc: p?.coords.accuracy ?? null });
  }, "Entrée enregistrée");
  const punchOut = () => run(async () => {
    const p = openWork?.geo_consent ? await getPos() : null;
    return db.rpc("pun_out", { _company: companyId, _lat: p?.coords.latitude ?? null, _lng: p?.coords.longitude ?? null, _acc: p?.coords.accuracy ?? null });
  }, "Sortie enregistrée — envoyée pour approbation");

  const saveManual = () => manual && run(() => db.rpc("pun_manual", {
    _company: companyId, _user: manual.user, _kind: "travail", _start: new Date(manual.start).toISOString(), _end: new Date(manual.end).toISOString(),
    _place: "bureau", _site: null, _client: null, _reason: manual.reason, _replace: manual.replace ?? null,
  }).then((r: any) => { if (!r.error) setManual(null); return r; }), "Saisie enregistrée — à approuver");

  const decide = (approve: boolean) => {
    const reason = approve ? "" : prompt("Motif du refus (obligatoire)") ?? "";
    if (!approve && reason.trim().length < 3) return;
    run(() => db.rpc("pun_decide", { _company: companyId, _ids: [...sel], _approve: approve, _reason: reason }).then((r: any) => { if (!r.error) setSel(new Set()); return r; }),
      approve ? "Heures approuvées" : "Heures refusées");
  };

  const exportCsv = () => {
    const rows = [["Employé", "Semaine", "Travail (h)", "Pauses (h)", "Net (h)", "Approuvé (h)", "En attente (h)", "Régulier (h)", "Supplémentaire (h)"],
      ...summary.map((s) => [s.full_name ?? name(s.user_id), s.week, ...[s.work_min, s.break_min, s.net_min, s.approved_min, s.pending_min, s.regular_min, s.overtime_min].map((m: number) => (m / 60).toFixed(2).replace(".", ","))])];
    const blob = new Blob(["\ufeff" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `heures-${from}-${to}.csv`; a.click();
  };

  const elapsed = openWork ? Math.max(0, (now - new Date(openWork.started_at).getTime()) / 60000) : 0;
  const weekMine = useMemo(() => mine.filter((e) => e.ended_at && new Date(e.started_at) >= monday()).reduce((t, e) =>
    t + (e.kind === "travail" ? 1 : -1) * (new Date(e.ended_at!).getTime() - new Date(e.started_at).getTime()) / 60000, 0), [mine]);

  const EntryRow = ({ e, who }: { e: Entry; who?: boolean }) => (
    <li className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 text-sm">
      {isMgr && e.status === "soumis" && e.ended_at && (
        <input type="checkbox" aria-label="Sélectionner" className="h-5 w-5 shrink-0" checked={sel.has(e.id)}
          onChange={(ev) => setSel((s) => { const n = new Set(s); ev.target.checked ? n.add(e.id) : n.delete(e.id); return n; })} />
      )}
      <div className="min-w-0 flex-1">
        <div className="font-medium">{who && <span>{name(e.user_id)} · </span>}{e.kind === "pause" ? "Pause" : PLACES.find((p) => p.v === e.place_type)?.l}{e.site_label ? ` — ${e.site_label}` : ""}</div>
        <div className="text-xs text-muted-foreground">{dt(e.started_at)} → {e.ended_at ? dt(e.ended_at) : "en cours"}{e.ended_at && ` · ${fmtMin((new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 60000)}`}{e.source === "manuel" && " · saisie manuelle"}{e.geo_consent && " · position"}</div>
        {(e.note || e.decision_reason) && <div className="text-xs text-muted-foreground break-words">{e.decision_reason ?? e.note}</div>}
      </div>
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{STATUS[e.status]}</span>
      {e.kind === "travail" && e.ended_at && (e.user_id === me || isMgr) && (e.status !== "approuve" || isMgr) && (
        <Button size="sm" variant="outline" onClick={() => setManual({ user: e.user_id, start: localInput(new Date(e.started_at)), end: localInput(new Date(e.ended_at!)), reason: "", replace: e.id })}>Corriger</Button>
      )}
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">
        {([["moi", "Mon punch"], ...(isMgr ? [["equipe", `Équipe (${pending.length})`]] : []), ["paie", "Heures pour la paie"], ["salaire", "Paie"]] as [typeof tab, string][]).map(([k, l]) => (
          <Button key={k} size="sm" variant={tab === k ? "default" : "outline"} onClick={() => setTab(k)}>{l}</Button>
        ))}
      </div>

      {tab === "moi" && (
        <>
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            {openWork ? (
              <>
                <div className="flex items-center gap-2 text-lg font-semibold"><Clock className="h-5 w-5 text-primary" /> En service depuis {fmtMin(elapsed)}</div>
                <p className="text-sm text-muted-foreground">{PLACES.find((p) => p.v === openWork.place_type)?.l}{openWork.site_label ? ` — ${openWork.site_label}` : ""} · entrée {dt(openWork.started_at)}{openBreak && " · en pause"}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button variant="outline" disabled={busy} onClick={() => run(() => db.rpc("pun_break", { _company: companyId, _start: !openBreak }), openBreak ? "Retour de pause" : "Pause commencée")}>
                    <Coffee className="mr-1 h-4 w-4" />{openBreak ? "Fin de la pause" : "Commencer une pause"}
                  </Button>
                  <Button disabled={busy} onClick={punchOut}><LogOut className="mr-1 h-4 w-4" />Puncher la sortie</Button>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <select aria-label="Lieu" className="h-10 rounded-md border border-border bg-background px-2 text-sm" value={place} onChange={(e) => setPlace(e.target.value)}>
                    {PLACES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
                  </select>
                  <Input aria-label="Chantier ou adresse" placeholder="Chantier ou adresse (facultatif)" value={site} onChange={(e) => setSite(e.target.value)} />
                  <select aria-label="Client" className="h-10 rounded-md border border-border bg-background px-2 text-sm" value={client} onChange={(e) => setClient(e.target.value)}>
                    <option value="">Client du CRM (facultatif)</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                  <span><MapPin className="mr-1 inline h-4 w-4" />J'accepte d'enregistrer ma position au moment de l'entrée et de la sortie seulement. Aucun suivi entre les deux.</span>
                </label>
                <Button className="w-full sm:w-auto" size="lg" disabled={busy || !canPunch} onClick={punchIn}><LogIn className="mr-1 h-4 w-4" />Puncher l'entrée</Button>
                {!canPunch && <p className="text-sm text-muted-foreground">Votre accès est en lecture seule.</p>}
              </>
            )}
            <p className="text-sm text-muted-foreground">Cette semaine : <strong>{fmtMin(Math.max(weekMine, 0))}</strong> net (pauses déduites)</p>
          </section>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Mes heures</h3>
            {canPunch && me && <Button size="sm" variant="outline" onClick={() => setManual({ user: me, start: localInput(new Date(Date.now() - 8 * 3600e3)), end: localInput(new Date()), reason: "" })}>Oubli de punch</Button>}
          </div>
          <ul className="space-y-2">{mine.length ? mine.map((e) => <EntryRow key={e.id} e={e} />) : <p className="text-sm text-muted-foreground">Aucune entrée.</p>}</ul>
        </>
      )}

      {tab === "equipe" && isMgr && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!sel.size || busy} onClick={() => decide(true)}>Approuver ({sel.size})</Button>
            <Button size="sm" variant="outline" disabled={!sel.size || busy} onClick={() => decide(false)}>Refuser</Button>
            <Button size="sm" variant="outline" onClick={() => setSel(new Set(pending.map((e) => e.id)))}>Tout sélectionner</Button>
            <Button size="sm" variant="outline" onClick={() => members[0] && setManual({ user: members[0].user_id, start: localInput(new Date(Date.now() - 8 * 3600e3)), end: localInput(new Date()), reason: "" })}>Saisir pour un employé</Button>
          </div>
          <h3 className="font-semibold">En service maintenant</h3>
          <ul className="space-y-2">{entries.filter((e) => e.kind === "travail" && !e.ended_at).map((e) => <EntryRow key={e.id} e={e} who />)}</ul>
          <h3 className="font-semibold">À approuver</h3>
          <ul className="space-y-2">{pending.length ? pending.map((e) => <EntryRow key={e.id} e={e} who />) : <p className="text-sm text-muted-foreground">Rien à approuver.</p>}</ul>
        </>
      )}

      {tab === "paie" && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">Du<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="text-xs">Au<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!summary.length}><Download className="mr-1 h-4 w-4" />Exporter</Button>
          </div>
          <p className="text-xs text-muted-foreground">Heures nettes (pauses déduites), par semaine. Au-delà de 40 h, les heures sont classées supplémentaires (taux majoré de 50 % selon les normes du travail du Québec). Seules les heures approuvées doivent être payées.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="p-2">Employé</th><th>Semaine du</th><th>Net</th><th>Approuvé</th><th>En attente</th><th>Régulier</th><th>Suppl.</th></tr></thead>
              <tbody>{summary.map((s, i) => (
                <tr key={i} className="border-t border-border"><td className="p-2">{s.full_name ?? name(s.user_id)}</td><td>{s.week}</td><td>{fmtMin(s.net_min)}</td><td>{fmtMin(s.approved_min)}</td><td>{fmtMin(s.pending_min)}</td><td>{fmtMin(s.regular_min)}</td><td>{fmtMin(s.overtime_min)}</td></tr>
              ))}</tbody>
            </table>
            {!summary.length && <p className="p-2 text-sm text-muted-foreground">Aucune heure sur cette période.</p>}
          </div>
        </section>
      )}

      {tab === "salaire" && <PayrollPanel companyId={companyId} canManage={isMgr} from={from} to={to} members={members} me={me} />}

      {manual && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-2 sm:items-center" role="dialog" aria-label="Saisie manuelle">
          <div className="w-full max-w-md space-y-3 rounded-lg border border-border bg-card p-4">
            <h3 className="font-semibold">{manual.replace ? "Corriger l'entrée" : "Saisie manuelle"}</h3>
            {isMgr && !manual.replace && (
              <select aria-label="Employé" className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm" value={manual.user} onChange={(e) => setManual({ ...manual, user: e.target.value })}>
                {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
              </select>
            )}
            <label className="block text-xs">Entrée<Input type="datetime-local" value={manual.start} onChange={(e) => setManual({ ...manual, start: e.target.value })} /></label>
            <label className="block text-xs">Sortie<Input type="datetime-local" value={manual.end} onChange={(e) => setManual({ ...manual, end: e.target.value })} /></label>
            <label className="block text-xs">Motif (obligatoire)<Input value={manual.reason} onChange={(e) => setManual({ ...manual, reason: e.target.value })} placeholder="Ex. oubli de punch au chantier" /></label>
            <p className="text-xs text-muted-foreground">L'entrée d'origine est conservée dans l'historique. La saisie devra être approuvée.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setManual(null)}>Annuler</Button>
              <Button disabled={busy || manual.reason.trim().length < 3} onClick={saveManual}>Enregistrer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

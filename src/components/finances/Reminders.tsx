// FIN-06 — Centre de rappels financiers. Génération et distribution côté serveur
// (fin_reminders_sweep, tâche planifiée) ; cet écran lit sous RLS et agit par RPC.
// Lire un rappel ne règle jamais la dette ; une prévision n'est jamais un paiement.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check, Clock, ExternalLink, RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase as _sb } from "@/integrations/supabase/client";
import { fmtDate, fmtMoney } from "@/lib/finances/period";
const sb = _sb as any;

type Rem = { id: string; kind: string; obligation_id: string | null; occurrence_id: string | null; payment_id: string | null; event_date: string; stage: string; amount_known: number | null; remaining: number | null; reason: string; meta: any; status: string; snoozed_until: string | null; resolved_reason: string | null; history: any[]; created_at: string };
type Del = { id: string; reminder_id: string; user_id: string; channel: string; state: string; attempts: number; last_error: string | null; read_at: string | null; next_attempt_at: string | null };
const KIND: Record<string, string> = { a_venir: "Paiement à venir", retard: "Paiement en retard", renouvellement: "Renouvellement", preavis: "Préavis", piece_manquante: "Pièce manquante", tresorerie: "Manque de trésorerie prévu" };
const LISTS = [["a_venir", "À venir"], ["a_traiter", "À traiter"], ["reporte", "Reportées"], ["resolu", "Résolues"], ["echecs", "Échecs"]] as const;
const STATE: Record<string, string> = { en_attente: "En attente", simule: "Simulé (mode test)", accepte: "Accepté par le prestataire", livre: "Livré", echoue: "Échoué", annule: "Annulé" };
const CH: Record<string, string> = { app: "Application", courriel: "Courriel", texto: "Texto" };
const RESOLVED: Record<string, string> = { paye: "Payée", date_modifiee: "Date modifiée — remplacé", etape_suivante: "Étape suivante", remplace_par_retard: "Passé en retard", echeance_annulee: "Échéance annulée", exception_obligation: "Rappels désactivés pour cette obligation", piece_recue_ou_sans_objet: "Pièce reçue ou sans objet", plus_de_manque_prevu: "Plus de manque prévu", prevision_recalculee: "Prévision recalculée", date_passee_ou_modifiee: "Date passée ou modifiée" };
const sel = "h-10 rounded-md border border-input bg-background px-2 text-sm";
const STAGES = [30, 14, 7, 3, 1, 0];

/** Modèles minimaux (aperçu) : aucun montant détaillé ni pièce, lien protégé par la connexion. */
export function renderTemplate(r: Pick<Rem, "kind" | "reason" | "event_date" | "remaining" | "meta">, company: string, channel: "courriel" | "texto") {
  const link = `${window.location.origin}/entrepreneur/finances?tab=rappels`;
  const when = fmtDate(r.event_date);
  const prev = r.kind === "tresorerie" ? " (prévision, aucun paiement effectué)" : "";
  if (channel === "texto") return `Vrac Québec — ${company} : ${KIND[r.kind]} le ${when}${prev}. Détails après connexion : ${link}`;
  return `Objet : ${KIND[r.kind]} — ${company}\n\nBonjour,\n\n${r.reason}${prev}.\nDate : ${when}.\n\nConsultez le détail dans votre espace (connexion requise) :\n${link}\n\nCe message ne règle pas la dette et ne constitue pas une preuve de paiement.`;
}

export default function Reminders({ companyId, companyName, canWrite, onOpenOcc, onOpenPayment, onOpenObligation }: {
  companyId: string; companyName: string; canWrite: boolean;
  onOpenOcc: (id: string) => void; onOpenPayment: (id: string) => void; onOpenObligation: (id: string) => void;
}) {
  const [rows, setRows] = useState<Rem[]>([]);
  const [dels, setDels] = useState<Del[]>([]);
  const [owners, setOwners] = useState<Record<string, { owner: string | null; label: string }>>({});
  const [members, setMembers] = useState<{ user_id: string; email: string | null; role: string }[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [list, setList] = useState<string>("a_traiter");
  const [period, setPeriod] = useState("90");
  const [kind, setKind] = useState("");
  const [owner, setOwner] = useState("");
  const [prefs, setPrefs] = useState(false);
  const [preview, setPreview] = useState<Rem | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await sb.auth.getUser(); setMe(u.user?.id ?? null);
    const [{ data: r }, { data: d }, { data: m }] = await Promise.all([
      sb.from("fin_reminders").select("*").eq("company_id", companyId).order("event_date").limit(500),
      sb.from("fin_reminder_deliveries").select("id,reminder_id,user_id,channel,state,attempts,last_error,read_at,next_attempt_at").eq("company_id", companyId).limit(2000),
      sb.rpc("entcrm_list_members", { _company_id: companyId }),
    ]);
    const rs = (r ?? []) as Rem[];
    setRows(rs); setDels((d ?? []) as Del[]); setMembers(((m ?? []) as any[]).filter((x) => x.is_active));
    const ids = [...new Set(rs.map((x) => x.obligation_id).filter(Boolean))];
    if (ids.length) {
      const { data: ob } = await sb.from("fin_obligations").select("id,label,owner_user_id").in("id", ids);
      setOwners(Object.fromEntries(((ob ?? []) as any[]).map((o) => [o.id, { owner: o.owner_user_id, label: o.label }])));
    }
    setLoading(false);
  }, [companyId]);
  useEffect(() => { load(); }, [load]);
  // Lien de la cloche : ?rappel=<id>. La lecture passe par la RLS : un rappel d'une autre
  // entreprise ou après retrait d'accès est simplement introuvable.
  const [deep, setDeep] = useState(() => new URLSearchParams(window.location.search).get("rappel"));
  useEffect(() => {
    if (!deep || loading) return;
    const r = rows.find((x) => x.id === deep);
    const q = new URLSearchParams(window.location.search); q.delete("rappel");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${q}`);
    setDeep(null);
    if (!r) { toast({ title: "Rappel indisponible", description: "Il n'existe plus ou vous n'y avez plus accès.", variant: "destructive" }); return; }
    setList(r.status === "resolu" ? "resolu" : r.status);
    open(r);
  }, [deep, loading, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  const delsBy = useMemo(() => { const m: Record<string, Del[]> = {}; dels.forEach((d) => (m[d.reminder_id] ??= []).push(d)); return m; }, [dels]);
  const isUnread = (r: Rem) => r.status !== "resolu" && (delsBy[r.id] ?? []).some((d) => d.user_id === me && d.channel === "app" && d.state === "livre" && !d.read_at);
  const failed = (r: Rem) => (delsBy[r.id] ?? []).some((d) => d.state === "echoue");
  const unread = rows.filter(isUnread).length;

  const visible = rows.filter((r) => {
    if (list === "echecs" ? !failed(r) : r.status !== list) return false;
    if (kind && r.kind !== kind) return false;
    if (owner && owners[r.obligation_id ?? ""]?.owner !== owner) return false;
    if (period !== "all") {
      const lim = Number(period) * 86400000; const t = new Date(`${r.event_date}T12:00:00`).getTime();
      if (Math.abs(t - Date.now()) > lim) return false;
    }
    return true;
  });
  const count = (k: string) => rows.filter((r) => (k === "echecs" ? failed(r) : r.status === k)).length;

  const act = async (fn: () => Promise<{ error: any }>, ok: string) => {
    const { error } = await fn();
    if (error) toast({ title: "Action refusée", description: error.message, variant: "destructive" }); else { toast({ title: ok }); load(); }
  };
  const open = (r: Rem) => {
    if (isUnread(r)) sb.rpc("fin_reminder_mark_read", { _reminder: r.id }).then(load);
    if (r.occurrence_id) onOpenOcc(r.occurrence_id);
    else if (r.payment_id) onOpenPayment(r.payment_id);
    else if (r.obligation_id) onOpenObligation(r.obligation_id);
    else setPreview(r);
  };
  const snooze = (r: Rem, days: number) => act(() => sb.rpc("fin_reminder_snooze", { _reminder: r.id, _until: new Date(Date.now() + days * 86400000).toISOString() }), `Reporté de ${days} jour${days > 1 ? "s" : ""}`);
  const memberName = (id: string | null) => members.find((m) => m.user_id === id)?.email ?? "—";

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Bell className="h-5 w-5 text-primary" />Rappels
        {unread > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground" aria-label={`${unread} non lus`}>{unread}</span>}</h2>
      <div className="ml-auto flex gap-2">
        {canWrite && <Button variant="outline" size="sm" onClick={() => act(() => sb.rpc("fin_reminders_run", { _company: companyId }), "Rappels recalculés")}><RefreshCw className="mr-1 h-4 w-4" />Recalculer</Button>}
        <Button variant="outline" size="sm" onClick={() => setPrefs(true)}><Settings2 className="mr-1 h-4 w-4" />Préférences</Button>
      </div>
    </div>
    <p className="text-xs text-muted-foreground">Calculés automatiquement par le serveur toutes les 10 minutes, même si cette page est fermée. Marquer comme lu ne règle pas la dette.</p>

    <div className="flex gap-1 overflow-x-auto rounded-xl bg-secondary p-1">
      {LISTS.map(([k, l]) => <button key={k} onClick={() => setList(k)} className={`min-h-10 whitespace-nowrap rounded-lg px-3 text-sm font-semibold ${list === k ? "bg-card shadow-sm" : "text-muted-foreground"}`}>{l} ({count(k)})</button>)}
    </div>
    <div className="flex flex-wrap gap-2">
      <select aria-label="Période" className={sel} value={period} onChange={(e) => setPeriod(e.target.value)}><option value="7">± 7 jours</option><option value="30">± 30 jours</option><option value="90">± 90 jours</option><option value="all">Toute période</option></select>
      <select aria-label="Type" className={sel} value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Tous les types</option>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select aria-label="Responsable" className={sel} value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Tous les responsables</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.email ?? m.user_id.slice(0, 8)}</option>)}</select>
    </div>

    {loading ? <p className="text-sm text-muted-foreground">Chargement…</p> : visible.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aucun rappel dans cette liste.</p> :
      <ul className="space-y-2">{visible.map((r) => {
        const ds = delsBy[r.id] ?? [];
        return <li key={r.id} className={`rounded-xl border p-3 ${isUnread(r) ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}>
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase text-muted-foreground">{KIND[r.kind]} · {r.stage === "unique" ? "" : r.stage.startsWith("R") ? `relance ${Number(r.stage.slice(1)) + 1}` : r.stage.startsWith("J-") ? (r.stage === "J-0" ? "jour J" : r.stage) : ""}</div>
              <div className="font-display text-sm font-bold">{r.reason}</div>
              <div className="text-xs text-muted-foreground">{companyName} · {fmtDate(r.event_date)}
                {r.kind === "tresorerie" ? <> · solde projeté {fmtMoney(r.remaining)} (seuil {fmtMoney(r.meta?.seuil)})</> :
                  r.kind === "piece_manquante" ? <> · règlement {fmtMoney(r.amount_known)}</> :
                  (r.kind === "a_venir" || r.kind === "retard") ? <> · reste à payer {r.remaining == null ? "montant inconnu" : fmtMoney(r.remaining)}{r.amount_known != null && r.remaining !== r.amount_known ? ` sur ${fmtMoney(r.amount_known)}` : ""}</> : null}
                {r.obligation_id && owners[r.obligation_id]?.owner ? <> · responsable {memberName(owners[r.obligation_id].owner)}</> : null}
              </div>
              {r.kind === "tresorerie" && <div className="mt-1 text-xs">Scénario : {r.meta?.scenario} · calculé le {new Date(r.meta?.calcule_le).toLocaleString("fr-CA", { timeZone: "America/Toronto" })}
                {r.meta?.partiel && <span className="ml-1 font-semibold text-destructive">· prévision partielle ({(r.meta?.raisons_partiel ?? []).join(", ")})</span>}</div>}
              {r.status === "reporte" && r.snoozed_until && <div className="text-xs">Reporté jusqu'au {new Date(r.snoozed_until).toLocaleString("fr-CA", { timeZone: "America/Toronto" })}</div>}
              {r.status === "resolu" && <div className="text-xs text-muted-foreground">Résolu : {RESOLVED[r.resolved_reason ?? ""] ?? r.resolved_reason} (historique conservé)</div>}
              {ds.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{ds.filter((d) => canWrite || d.user_id === me).map((d) => <span key={d.id} title={d.last_error === "coordonnees_a_completer" ? "Coordonnées à compléter" : d.last_error ?? ""} className={`rounded px-1.5 py-0.5 text-[10px] ${d.state === "echoue" ? "bg-destructive/15 text-destructive" : "bg-secondary"}`}>{CH[d.channel]}{canWrite && d.user_id !== me ? ` · ${memberName(d.user_id)}` : ""} : {d.last_error === "coordonnees_a_completer" ? "Coordonnées à compléter" : STATE[d.state]}{d.state === "en_attente" && d.attempts > 0 ? ` (reprise ${d.attempts}/3)` : ""}</span>)}</div>}
            </div>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" onClick={() => open(r)}><ExternalLink className="mr-1 h-3.5 w-3.5" />Ouvrir</Button>
              {isUnread(r) && <Button size="sm" variant="outline" onClick={() => act(() => sb.rpc("fin_reminder_mark_read", { _reminder: r.id }), "Marqué comme lu")}><Check className="mr-1 h-3.5 w-3.5" />Lu</Button>}
              {canWrite && r.status !== "resolu" && <select aria-label="Reporter" className="h-9 rounded-md border border-input bg-background px-1 text-xs" value="" onChange={(e) => e.target.value && snooze(r, Number(e.target.value))}><option value="">Reporter…</option><option value="1">1 jour</option><option value="3">3 jours</option><option value="7">7 jours</option></select>}
              <Button size="sm" variant="ghost" onClick={() => setPreview(r)} aria-label="Aperçu des messages"><Clock className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        </li>;
      })}</ul>}

    {preview && <Dialog open onOpenChange={() => setPreview(null)}><DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Aperçu des messages (mode test)</DialogTitle></DialogHeader>
      <p className="text-xs">Prestataire courriel et texto : <strong>Non configuré</strong>. Aucun message externe n'est envoyé ; les envois sont marqués « Simulé ».</p>
      {(["courriel", "texto"] as const).map((c) => <div key={c}><div className="text-xs font-semibold">{CH[c]}</div><pre className="whitespace-pre-wrap rounded-md bg-secondary p-2 text-xs">{renderTemplate(preview, companyName, c)}</pre></div>)}
      <div className="text-xs font-semibold">Historique</div>
      <ul className="max-h-40 overflow-auto text-xs text-muted-foreground">{(preview.history ?? []).map((h: any, i: number) => <li key={i}>{new Date(h.at).toLocaleString("fr-CA", { timeZone: "America/Toronto" })} — {h.action}{h.motif ? ` (${h.motif})` : ""}{h.apres != null ? ` : ${h.avant} → ${h.apres}` : ""}</li>)}</ul>
    </DialogContent></Dialog>}
    {prefs && <Prefs companyId={companyId} canWrite={canWrite} members={members} onClose={() => { setPrefs(false); load(); }} />}
  </div>;
}

function Prefs({ companyId, canWrite, members, onClose }: { companyId: string; canWrite: boolean; members: { user_id: string; email: string | null; role: string }[]; onClose: () => void }) {
  const [p, setP] = useState<any>(null);
  const [obls, setObls] = useState<{ id: string; label: string }[]>([]);
  const [ovr, setOvr] = useState<Record<string, { muted: boolean; stages: number[] | null }>>({});
  const [ob, setOb] = useState("");
  useEffect(() => {
    sb.from("fin_reminder_settings").select("*").eq("company_id", companyId).maybeSingle().then(({ data }: any) =>
      setP(data ?? { stages: STAGES, overdue_every_days: 7, renewal_days: 30, missing_docs: true, cash_alert: true, cash_threshold: 0, cash_horizon_days: 30, recipients: null, channels: ["app"], digest: "individuel", quiet_start: 21, quiet_end: 7 }));
    sb.from("fin_obligations").select("id,label").eq("company_id", companyId).eq("status", "active").order("label").limit(500).then(({ data }: any) => setObls(data ?? []));
    sb.from("fin_reminder_overrides").select("obligation_id,muted,stages").eq("company_id", companyId).then(({ data }: any) => setOvr(Object.fromEntries((data ?? []).map((o: any) => [o.obligation_id, o]))));
  }, [companyId]);
  if (!p) return null;
  const set = (k: string, v: any) => setP({ ...p, [k]: v });
  const toggle = (k: string, v: any) => set(k, (p[k] ?? []).includes(v) ? p[k].filter((x: any) => x !== v) : [...(p[k] ?? []), v]);
  const save = async () => {
    const { error } = await sb.rpc("fin_reminder_prefs_save", { _company: companyId, _p: p });
    if (error) toast({ title: "Enregistrement refusé", description: error.message, variant: "destructive" }); else { toast({ title: "Préférences enregistrées" }); onClose(); }
  };
  const saveOvr = async (muted: boolean, stages: number[] | null) => {
    const { error } = await sb.rpc("fin_reminder_override_save", { _obligation: ob, _muted: muted, _stages: stages });
    if (error) toast({ title: "Refusé", description: error.message, variant: "destructive" }); else { setOvr({ ...ovr, [ob]: { muted, stages } }); toast({ title: "Exception enregistrée" }); }
  };
  const box = (on: boolean, label: string, fn: () => void) => <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={on} onChange={fn} disabled={!canWrite} />{label}</label>;
  const cur = ovr[ob];
  return <Dialog open onOpenChange={onClose}><DialogContent className="max-h-[90vh] max-w-lg overflow-auto">
    <DialogHeader><DialogTitle>Préférences des rappels</DialogTitle></DialogHeader>
    <fieldset className="space-y-1"><legend className="text-sm font-semibold">Paiements à venir</legend>
      <div className="flex flex-wrap gap-3">{STAGES.map((s) => box((p.stages ?? []).includes(s), s === 0 ? "Jour J" : `J-${s}`, () => toggle("stages", s)))}</div></fieldset>
    <label className="text-sm">Relance des retards tous les <Input type="number" min={1} max={90} className="inline-block h-9 w-20" value={p.overdue_every_days} disabled={!canWrite} onChange={(e) => set("overdue_every_days", Number(e.target.value))} /> jours (sur le solde restant)</label>
    <label className="text-sm">Renouvellements et préavis : avertir <Input type="number" min={1} max={365} className="inline-block h-9 w-20" value={p.renewal_days} disabled={!canWrite} onChange={(e) => set("renewal_days", Number(e.target.value))} /> jours avant (si la date existe)</label>
    {box(p.missing_docs, "Pièces justificatives manquantes", () => set("missing_docs", !p.missing_docs))}
    {box(p.cash_alert, "Manque de trésorerie prévu", () => set("cash_alert", !p.cash_alert))}
    {p.cash_alert && <div className="flex flex-wrap gap-2 text-sm">Seuil <Input type="number" className="h-9 w-28" value={p.cash_threshold} disabled={!canWrite} onChange={(e) => set("cash_threshold", Number(e.target.value))} /> $ sur <Input type="number" min={7} max={365} className="h-9 w-20" value={p.cash_horizon_days} disabled={!canWrite} onChange={(e) => set("cash_horizon_days", Number(e.target.value))} /> jours</div>}
    <fieldset className="space-y-1"><legend className="text-sm font-semibold">Destinataires internes autorisés</legend>
      {box(p.recipients == null, "Par défaut (propriétaire et comptabilité)", () => set("recipients", p.recipients == null ? [] : null))}
      {p.recipients != null && members.map((m) => <div key={m.user_id}>{box(p.recipients.includes(m.user_id), `${m.email ?? m.user_id.slice(0, 8)} (${m.role})`, () => toggle("recipients", m.user_id))}</div>)}
      <p className="text-xs text-muted-foreground">Une notification n'accorde aucun accès financier : seuls les membres ayant déjà accès aux Finances peuvent être choisis.</p></fieldset>
    <fieldset className="space-y-1"><legend className="text-sm font-semibold">Canaux</legend>
      <div className="flex flex-wrap gap-3">{box(p.channels.includes("app"), "Application", () => toggle("channels", "app"))}{box(p.channels.includes("courriel"), "Courriel (non configuré — simulé)", () => toggle("channels", "courriel"))}{box(p.channels.includes("texto"), "Texto (non configuré — simulé)", () => toggle("channels", "texto"))}</div></fieldset>
    <label className="text-sm">Fréquence <select className={sel} value={p.digest} disabled={!canWrite} onChange={(e) => set("digest", e.target.value)}><option value="individuel">Rappel individuel</option><option value="quotidien">Résumé quotidien (8 h)</option><option value="hebdomadaire">Résumé hebdomadaire (lundi 8 h)</option></select></label>
    <div className="text-sm">Heures calmes (courriel, texto) de <select className={sel} value={p.quiet_start} disabled={!canWrite} onChange={(e) => set("quiet_start", Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h} h</option>)}</select> à <select className={sel} value={p.quiet_end} disabled={!canWrite} onChange={(e) => set("quiet_end", Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h} h</option>)}</select> · fuseau America/Toronto</div>
    {canWrite && <Button onClick={save}>Enregistrer</Button>}
    <fieldset className="space-y-2 border-t pt-3"><legend className="text-sm font-semibold">Exception par obligation</legend>
      <select aria-label="Obligation" className={`${sel} w-full`} value={ob} onChange={(e) => setOb(e.target.value)}><option value="">— Choisir une obligation —</option>{obls.map((o) => <option key={o.id} value={o.id}>{o.label}{ovr[o.id] ? " (exception)" : ""}</option>)}</select>
      {ob && canWrite && <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => saveOvr(!cur?.muted, cur?.stages ?? null)}>{cur?.muted ? "Réactiver les rappels" : "Désactiver les rappels"}</Button>
        <Button size="sm" variant="outline" onClick={() => saveOvr(false, [7, 1, 0])}>Seulement J-7, J-1, jour J</Button>
        {cur && <Button size="sm" variant="ghost" onClick={() => saveOvr(false, null)}>Revenir au réglage global</Button>}
      </div>}
    </fieldset>
  </DialogContent></Dialog>;
}

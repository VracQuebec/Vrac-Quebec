// ============================================================
// RONDE DE SÉCURITÉ (Québec, RNSVR art. 191 à 197) — Gestion de flotte
// ------------------------------------------------------------
// Référentiel officiel : rds_categories / rds_codes (lecture seule).
// Rapports, défauts, signatures : écrits SEULEMENT par les fonctions
// serveur rds_* (rapport figé après signature, correction = nouvelle
// version liée). Classement (mineur/majeur) ≠ statut de circulation :
// une mineure échue interdit de circuler mais reste une mineure.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, ClipboardCheck, History, Printer, Settings2, ShieldAlert, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast, toast as toastFn } from "@/hooks/use-toast";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;
type Cat = { no: number; label: string; verify: string };
type Code = { code: string; cat_no: number; severity: "mineur" | "majeur"; text: string; lists: number[]; ord: number };
type VStatus = { vehicle_id: string; name: string; plate: string | null; list_no: number | null; pnbv_kg: number | null; last_report_id: string | null; last_at: string | null; valid_until: string | null; ronde_valide: boolean; majeures: number; mineures: number; mineures_echues: number; prochaine_echeance: string | null; a_valider: number };
type Profile = { brakes?: "pneumatiques" | "hydrauliques" | "electriques"; coupling?: boolean; first_aid?: boolean; extinguisher?: boolean; bulk?: string[] };
type Answer = { state?: "conforme" | "defaut" | "na"; reason?: string };
type DraftDefect = { key: string; code: string; vehicle_id: string; location: string; description: string; details: Record<string, string>; photo_path?: string };

const TZ = "America/Toronto";
const fmt = (s?: string | null) => s ? new Date(s).toLocaleString("fr-CA", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }) : "—";
const LIST_LABEL: Record<number, string> = { 1: "Liste 1 — Véhicules lourds", 2: "Liste 2 — Autobus et minibus", 3: "Liste 3 — Autocars" };
const BULK = ["Benne", "Hayon", "Toile", "Verrouillages", "Circuit hydraulique de levage", "Prise de force", "Arrimage", "Équipement de déneigement"];
const uuid = () => crypto.randomUUID();

/** Systèmes applicables selon le profil (jamais devinés : sans profil, tout s'affiche). */
function applicable(c: Cat, p: Profile, list: number) {
  if (c.no === 20) return list !== 1;
  if (c.no === 17) return !p.brakes || p.brakes === "electriques";
  if (c.no === 18) return !p.brakes || p.brakes === "hydrauliques";
  if (c.no === 19) return !p.brakes || p.brakes === "pneumatiques";
  if (c.no === 7) return p.first_aid !== false || p.extinguisher !== false;
  return true;
}

/** Précisions demandées avant d'accepter un code (classement fondé sur les conditions observées). */
function prompts(code: string): { k: string; l: string; opts: string[] }[] {
  const cat = Number(code.split(".")[0]);
  const out: { k: string; l: string; opts: string[] }[] = [];
  if (cat === 1) out.push({ k: "accouple", l: "Véhicules accouplés?", opts: ["oui", "non"] });
  if (["1.C", "1.D", "2.C", "14.A"].includes(code)) out.push({ k: "pourcentage", l: "Pourcentage d'éléments touchés", opts: [] });
  if (cat === 6) out.push({ k: "cote", l: "Côté", opts: ["conducteur", "passager"] });
  if (cat === 8) { out.push({ k: "feux", l: "Feux touchés (nombre et position)", opts: [] }); out.push({ k: "derniere_unite", l: "Arrière du véhicule seul ou de la dernière unité?", opts: ["oui", "non"] }); }
  if (cat === 9 || cat === 12) { out.push({ k: "essieu", l: "Essieu et position", opts: [] }); }
  if (cat === 9) { out.push({ k: "montage", l: "Montage", opts: ["simple", "jumelé — un pneu", "jumelé — les deux pneus"] }); out.push({ k: "directeur", l: "Essieu directeur?", opts: ["oui", "non"] }); }
  if (cat === 19 && ["19.4", "19.C"].includes(code)) out.push({ k: "perte", l: "Perte de pression en 1 minute (kPa) et nombre d'unités", opts: [] });
  return out;
}

/** Contrôles de cohérence : refuse un code incompatible avec les conditions décrites. */
function incoherence(code: string, d: Record<string, string>): string | null {
  if (["1.B", "1.C", "1.D", "1.E", "1.F"].includes(code) && d.accouple === "non") return "Ce code majeur ne s'applique que si les véhicules sont accouplés.";
  if (code === "6.A" && d.cote === "passager") return "6.A vise le côté conducteur; côté passager = 6.1.";
  if (code === "6.1" && d.cote === "conducteur") return "6.1 vise le côté passager; côté conducteur = 6.A.";
  if (code === "9.A" && d.directeur === "non") return "9.A vise seulement l'essieu directeur.";
  if (["9.B", "9.C"].includes(code) && d.montage === "jumelé — un pneu") return "Un seul pneu jumelé relève de 9.2 / 9.3.";
  if (["9.2", "9.3"].includes(code) && (d.montage === "simple" || d.montage === "jumelé — les deux pneus")) return "Pneu simple ou deux pneus jumelés : 9.B / 9.C (majeur).";
  if (code === "8.B" && d.derniere_unite === "non") return "8.B vise l'arrière du véhicule seul ou de la dernière unité.";
  const pct = Number((d.pourcentage || "").replace(",", "."));
  if (d.pourcentage && !isNaN(pct)) {
    if (code === "1.C" && pct <= 20) return "1.C exige plus de 20 %.";
    if (code === "1.D" && pct < 25) return "1.D exige 25 % ou plus.";
    if (code === "2.C" && pct <= 25) return "2.C exige plus de 25 %.";
    if (code === "14.A" && pct < 25) return "14.A exige au moins 25 % des lames.";
  }
  for (const p of prompts(code)) if (!d[p.k]?.trim()) return `Précision requise : ${p.l}`;
  return null;
}

export default function SafetyRound({ companyId, canManage = true }: { companyId: string; canManage?: boolean }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"bord" | "ronde" | "defauts" | "historique" | "liste">("bord");
  const [cats, setCats] = useState<Cat[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [status, setStatus] = useState<VStatus[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [defects, setDefects] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [profileFor, setProfileFor] = useState<any | null>(null);
  const [roundFor, setRoundFor] = useState<{ vehicle: any; parent?: any } | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    const [c1, c2, s, v, d, r] = await Promise.all([
      db.from("rds_categories").select("*").order("no"),
      db.from("rds_codes").select("*").order("ord"),
      db.rpc("rds_fleet_status", { _company: companyId }),
      db.from("trucks").select("id,name,unit_number,plate,pnbv_kg,rds_list,rds_profile,odometer_km,archived_at").eq("company_id", companyId).is("archived_at", null).order("name"),
      db.from("rds_defects").select("*").eq("company_id", companyId).order("found_at", { ascending: false }).limit(300),
      db.from("rds_reports").select("*").eq("company_id", companyId).order("performed_at", { ascending: false }).limit(200),
    ]);
    const e = s.error || v.error || d.error || r.error || c1.error || c2.error;
    if (e) setErr(e.message);
    setCats(c1.data ?? []); setCodes(c2.data ?? []); setStatus(s.data ?? []); setVehicles(v.data ?? []); setDefects(d.data ?? []); setReports(r.data ?? []);
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);
  const [pending, setPending] = useState(outboxGet().length);
  useEffect(() => {
    const flush = async () => {
      const r = await outboxFlush(db);
      setPending(outboxGet().length);
      if (r.sent) { toast({ title: `${r.sent} ronde(s) hors ligne envoyée(s)` }); void load(); }
      if (r.refused.length) toast({ title: "Ronde en attente refusée", description: r.refused.join(" · "), variant: "destructive" });
    };
    void flush();
    window.addEventListener("online", flush);
    const t = window.setInterval(() => { if (navigator.onLine && outboxGet().length) void flush(); }, 30000);
    return () => { window.removeEventListener("online", flush); window.clearInterval(t); };
  }, [db, load, toast]);

  const vName = (id: string) => { const v = vehicles.find((x) => x.id === id); return v ? (v.unit_number || v.name) : "—"; };
  const codeOf = (c: string) => codes.find((x) => x.code === c);
  const rpc = async (fn: string, args: any, ok: string) => {
    const { error } = await db.rpc(fn, args);
    if (error) toast({ title: "Refusé", description: error.message, variant: "destructive" }); else { toast({ title: ok }); void load(); }
  };

  const tabs = [
    { k: "bord", l: "Tableau de bord", i: ShieldAlert }, { k: "ronde", l: "Faire une ronde", i: ClipboardCheck },
    { k: "defauts", l: "Défauts et réparations", i: Wrench }, { k: "historique", l: "Historique", i: History }, { k: "liste", l: "Liste officielle", i: BookOpen },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <Button key={t.k} size="sm" variant={tab === t.k ? "default" : "outline"} onClick={() => setTab(t.k)} className="shrink-0">
            <t.i className="mr-1.5 h-4 w-4" />{t.l}
          </Button>
        ))}
      </div>
      {err && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{err}</p>}
      {pending > 0 && <p className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">{pending} ronde(s) signée(s) hors ligne en attente — envoi automatique au retour du réseau.</p>}

      {tab === "bord" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[["Ronde valide", status.filter((s) => s.ronde_valide).length], ["À renouveler", status.filter((s) => !s.ronde_valide).length],
              ["Mineures ouvertes", status.reduce((a, s) => a + s.mineures, 0)], ["Départ interdit", status.filter((s) => s.majeures > 0 || s.mineures_echues > 0).length],
              ["Réparations à valider", status.reduce((a, s) => a + s.a_valider, 0)]].map(([l, n]) => (
              <div key={l as string} className="rounded-xl border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="font-display text-2xl font-bold">{n}</p></div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Le blocage affiché est une fonction du logiciel : il ne remplace pas l'immobilisation réelle du véhicule. Heures affichées à l'heure du Québec.</p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {status.map((s) => {
              const blocked = s.majeures > 0 || s.mineures_echues > 0;
              const v = vehicles.find((x) => x.id === s.vehicle_id);
              return (
                <li key={s.vehicle_id} className={`rounded-2xl border p-4 ${blocked ? "border-destructive bg-destructive/5" : "border-border bg-card"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><h3 className="truncate font-display font-bold">{s.name}</h3><p className="text-xs text-muted-foreground">{s.plate || "Plaque non inscrite"} · {s.list_no ? `Liste ${s.list_no}` : "Liste à préciser"}</p></div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${blocked ? "bg-destructive text-destructive-foreground" : s.ronde_valide ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                      {blocked ? "Départ interdit" : s.ronde_valide ? "Ronde valide" : "Ronde requise"}
                    </span>
                  </div>
                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Dernière ronde</dt><dd>{fmt(s.last_at)}</dd></div>
                    {s.ronde_valide && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Valide jusqu'au</dt><dd>{fmt(s.valid_until)}</dd></div>}
                    {s.majeures > 0 && <div className="flex justify-between gap-2 text-destructive"><dt>Majeures non réparées</dt><dd>{s.majeures}</dd></div>}
                    {s.mineures > 0 && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Mineures ouvertes</dt><dd>{s.mineures}{s.mineures_echues ? ` (dont ${s.mineures_echues} échue${s.mineures_echues > 1 ? "s" : ""})` : ""}</dd></div>}
                    {s.prochaine_echeance && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Prochaine échéance 48 h</dt><dd>{fmt(s.prochaine_echeance)}</dd></div>}
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setRoundFor({ vehicle: v })}><ClipboardCheck className="mr-1.5 h-4 w-4" />Faire la ronde</Button>
                    {canManage && <Button size="sm" variant="outline" onClick={() => setProfileFor(v)}><Settings2 className="mr-1.5 h-4 w-4" />Profil</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
          {status.length === 0 && <p className="text-sm text-muted-foreground">Aucun véhicule dans la flotte.</p>}
        </div>
      )}

      {tab === "ronde" && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Choisissez l'unité à inspecter. Dans un ensemble assujetti, chaque unité (tracteur et remorques) doit être inspectée.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {vehicles.map((v) => (
              <li key={v.id}><Button variant="outline" className="h-auto w-full justify-between py-3" onClick={() => setRoundFor({ vehicle: v })}>
                <span className="truncate">{v.unit_number || v.name}{v.plate ? ` · ${v.plate}` : ""}</span><span className="text-xs text-muted-foreground">{v.rds_list ? `Liste ${v.rds_list}` : "Liste à préciser"}</span>
              </Button></li>
            ))}
          </ul>
        </div>
      )}

      {tab === "defauts" && (
        <DefectsTab defects={defects} codeOf={codeOf} vName={vName} canManage={canManage} rpc={rpc} vehicles={vehicles} companyId={companyId} codes={codes} reload={load} />
      )}

      {tab === "historique" && (
        <HistoryTab reports={reports} defects={defects} vName={vName} codeOf={codeOf} canManage={canManage} rpc={rpc}
          onCorrect={(r) => setRoundFor({ vehicle: vehicles.find((v) => v.id === r.vehicle_id), parent: r })} />
      )}

      {tab === "liste" && <OfficialList cats={cats} codes={codes} />}

      {profileFor && <ProfileDialog vehicle={profileFor} onClose={() => setProfileFor(null)} onSaved={load} />}
      {roundFor?.vehicle && (
        <RoundDialog companyId={companyId} vehicle={roundFor.vehicle} parent={roundFor.parent} vehicles={vehicles} cats={cats} codes={codes}
          onClose={() => setRoundFor(null)} onDone={() => { setRoundFor(null); void load(); setTab("bord"); }} />
      )}
    </div>
  );
}

function OfficialList({ cats, codes }: { cats: Cat[]; codes: Code[] }) {
  const [list, setList] = useState(1);
  const shown = codes.filter((c) => c.lists.includes(list));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">{[1, 2, 3].map((n) => <Button key={n} size="sm" variant={list === n ? "default" : "outline"} onClick={() => setList(n)}>{LIST_LABEL[n]}</Button>)}</div>
      <p className="text-xs text-muted-foreground">
        {shown.filter((c) => c.severity === "mineur").length} codes mineurs · {shown.filter((c) => c.severity === "majeur").length} codes majeurs.
        Référentiel : RNSVR (C-24.2, r. 32), annexes, consolidation consultée au 1er mai 2026 (recherche du 2 octobre 2026). Le texte officiel prévaut; la version applicable doit être revérifiée avant la mise en service.
      </p>
      {cats.filter((c) => shown.some((x) => x.cat_no === c.no)).map((c) => (
        <section key={c.no} className="rounded-xl border border-border bg-card p-3">
          <h3 className="font-display font-bold">{c.no}. {c.label}</h3>
          {c.verify && <p className="mt-1 text-xs text-muted-foreground">À vérifier : {c.verify}</p>}
          {(["mineur", "majeur"] as const).map((sev) => {
            const rows = shown.filter((x) => x.cat_no === c.no && x.severity === sev);
            if (!rows.length) return <p key={sev} className="mt-2 text-xs italic text-muted-foreground">Aucun code {sev} dans cette catégorie de cette liste.</p>;
            return (
              <div key={sev} className="mt-2">
                <p className={`text-xs font-semibold uppercase ${sev === "majeur" ? "text-destructive" : "text-foreground"}`}>Défectuosités {sev}es</p>
                <ul className="mt-1 space-y-1 text-sm">{rows.map((r) => <li key={r.code}><span className="font-mono font-semibold">{r.code}</span> — {r.text}</li>)}</ul>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function ProfileDialog({ vehicle, onClose, onSaved }: { vehicle: any; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [pnbv, setPnbv] = useState<string>(vehicle.pnbv_kg?.toString() ?? "");
  const [list, setList] = useState<number | null>(vehicle.rds_list ?? null);
  const [p, setP] = useState<Profile>(vehicle.rds_profile ?? {});
  const [busy, setBusy] = useState(false);
  const suggested = 1;
  const save = async () => {
    setBusy(true);
    const { error } = await db.from("trucks").update({ pnbv_kg: pnbv ? Number(pnbv) : null, rds_list: list, rds_profile: p }).eq("id", vehicle.id);
    setBusy(false);
    if (error) toast({ title: "Refusé", description: error.message, variant: "destructive" }); else { toast({ title: "Profil enregistré" }); onSaved(); onClose(); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Profil de ronde — {vehicle.unit_number || vehicle.name}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="block">PNBV (kg) — poids nominal brut du fabricant, pas le poids à vide ni le chargement
            <Input inputMode="numeric" value={pnbv} onChange={(e) => setPnbv(e.target.value.replace(/[^\d]/g, ""))} /></label>
          {pnbv && Number(pnbv) < 4500 && <p className="text-xs text-muted-foreground">Moins de 4 500 kg : la ronde peut quand même s'appliquer (ensemble assujetti, dépanneuse, matières dangereuses). À vérifier.</p>}
          <div><p>Liste applicable {list == null && <span className="text-muted-foreground">(proposée : Liste {suggested} pour camions, tracteurs, remorques)</span>}</p>
            <div className="mt-1 flex flex-wrap gap-2">{[1, 2, 3].map((n) => <Button key={n} type="button" size="sm" variant={list === n ? "default" : "outline"} onClick={() => setList(n)}>Liste {n}</Button>)}</div></div>
          <div><p>Système de freinage</p>
            <div className="mt-1 flex flex-wrap gap-2">{(["pneumatiques", "hydrauliques", "electriques"] as const).map((b) => <Button key={b} type="button" size="sm" variant={p.brakes === b ? "default" : "outline"} onClick={() => setP({ ...p, brakes: b })}>{b === "electriques" ? "électriques" : b}</Button>)}</div></div>
          {([["coupling", "Dispositif d'attelage"], ["first_aid", "Trousse de premiers soins exigée"], ["extinguisher", "Extincteur exigé"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2"><Checkbox checked={!!p[k]} onCheckedChange={(c) => setP({ ...p, [k]: !!c })} />{l}</label>
          ))}
          <div><p>Équipements vrac / déneigement à vérifier (section distincte, hors codes officiels)</p>
            <div className="mt-1 grid grid-cols-2 gap-1">{BULK.map((b) => (
              <label key={b} className="flex items-center gap-2"><Checkbox checked={!!p.bulk?.includes(b)} onCheckedChange={(c) => setP({ ...p, bulk: c ? [...(p.bulk ?? []), b] : (p.bulk ?? []).filter((x) => x !== b) })} />{b}</label>
            ))}</div></div>
          <Button className="w-full" onClick={save} disabled={busy}>Enregistrer le profil</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RoundDialog({ companyId, vehicle, parent, vehicles, cats, codes, onClose, onDone }: {
  companyId: string; vehicle: any; parent?: any; vehicles: any[]; cats: Cat[]; codes: Code[]; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const draftKey = `vq.rds.draft.${companyId}.${vehicle.id}${parent ? "." + parent.id : ""}`;
  const listNo: number = parent?.list_no ?? vehicle.rds_list ?? 1;
  const profile: Profile = vehicle.rds_profile ?? {};
  const init = (() => { try { return JSON.parse(localStorage.getItem(draftKey) || "null"); } catch { return null; } })();
  const [st, setSt] = useState<any>(init ?? {
    client_key: uuid(), performed_at: new Date().toISOString(), place: parent?.place ?? "", odometer_km: vehicle.odometer_km?.toString() ?? "",
    operator_name: parent?.operator_name ?? "", inspector_name: "", inspector_role: "", unit_ids: [] as string[],
    answers: {} as Record<number, Answer>, bulk: {} as Record<string, Answer>, defects: [] as DraftDefect[], declaration: false, signature: "", reason: "",
  });
  const [picking, setPicking] = useState<{ cat: number } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { try { localStorage.setItem(draftKey, JSON.stringify(st)); } catch { /* */ } }, [st, draftKey]);
  const set = (patch: any) => setSt((s: any) => ({ ...s, ...patch }));
  const visCats = useMemo(() => cats.filter((c) => codes.some((x) => x.cat_no === c.no && x.lists.includes(listNo)) && applicable(c, profile, listNo)), [cats, codes, listNo, profile]);
  const unanswered = visCats.filter((c) => !st.answers[c.no]?.state || (st.answers[c.no].state === "na" && !st.answers[c.no].reason?.trim())
    || (st.answers[c.no].state === "defaut" && !st.defects.some((d: DraftDefect) => Number(d.code.split(".")[0]) === c.no)));
  const bulkList = profile.bulk ?? [];
  const bulkMissing = bulkList.filter((b) => !st.bulk[b]?.state);
  const noDefect = st.defects.length === 0;
  const local = new Date(st.performed_at).toLocaleString("sv-SE", { timeZone: TZ }).slice(0, 16).replace(" ", "T");

  const submit = async () => {
    if (busy) return;
    if (unanswered.length) { toast({ title: "Ronde incomplète", description: `À compléter : ${unanswered.map((c) => c.label).join(", ")}`, variant: "destructive" }); return; }
    if (bulkMissing.length) { toast({ title: "Équipements à vérifier", description: bulkMissing.join(", "), variant: "destructive" }); return; }
    setBusy(true);
    const payload = {
      company_id: companyId, vehicle_id: vehicle.id, client_key: st.client_key, list_no: listNo, performed_at: st.performed_at, place: st.place,
      odometer_km: st.odometer_km, operator_name: st.operator_name, inspector_name: st.inspector_name, inspector_role: st.inspector_role,
      unit_ids: st.unit_ids, declaration: st.declaration, signature: st.signature, no_defect: noDefect, parent_id: parent?.id ?? null, correction_reason: st.reason,
      offline: !navigator.onLine, checks: { categories: st.answers, equipements: st.bulk },
      defects: st.defects.map((d: DraftDefect) => ({ code: d.code, vehicle_id: d.vehicle_id, location: d.location, description: d.description, details: d.details, photo_path: d.photo_path, client_key: d.key })),
    };
    const offline = !navigator.onLine;
    const { error } = offline ? { error: { message: "offline" } as any } : await db.rpc("rds_submit", { p: payload });
    setBusy(false);
    if (error && (offline || /fetch|network|offline/i.test(error.message))) {
      outboxAdd(payload); localStorage.removeItem(draftKey);
      toast({ title: "Hors ligne — ronde signée en attente", description: "Elle sera envoyée automatiquement dès le retour du réseau." });
      onDone(); return;
    }
    if (error) { toast({ title: "Non enregistré — votre saisie est conservée", description: error.message, variant: "destructive" }); return; }
    localStorage.removeItem(draftKey);
    toast({ title: noDefect ? "Ronde signée — aucune défectuosité" : `Ronde signée — ${st.defects.length} défaut(s) transmis` });
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{parent ? `Correction (version ${parent.version + 1})` : "Ronde de sécurité"} — {vehicle.unit_number || vehicle.name}</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-xs text-muted-foreground">{LIST_LABEL[listNo]}{!vehicle.rds_list && " (liste non précisée au profil : Liste 1 utilisée)"} · Brouillon conservé sur cet appareil si le réseau coupe.</p>
          {parent && <label className="block">Motif de la correction<Textarea value={st.reason} onChange={(e) => set({ reason: e.target.value })} /></label>}
          <div className="grid gap-2 sm:grid-cols-2">
            <label>Date et heure réelles de la ronde<Input type="datetime-local" value={local} max={new Date().toLocaleString("sv-SE", { timeZone: TZ }).slice(0, 16).replace(" ", "T")}
              onChange={(e) => { const d = new Date(e.target.value + ":00"); if (!isNaN(+d)) set({ performed_at: d.toISOString() }); }} /></label>
            <label>Municipalité ou lieu<Input value={st.place} onChange={(e) => set({ place: e.target.value })} /></label>
            <label>Odomètre (km)<Input inputMode="numeric" value={st.odometer_km} onChange={(e) => set({ odometer_km: e.target.value.replace(/[^\d.]/g, "") })} /></label>
            <label>Exploitant<Input value={st.operator_name} placeholder="Nom de l'entreprise par défaut" onChange={(e) => set({ operator_name: e.target.value })} /></label>
          </div>
          {vehicles.length > 1 && (
            <div><p>Autres unités de l'ensemble (chacune doit avoir sa propre ronde)</p>
              <div className="mt-1 flex flex-wrap gap-2">{vehicles.filter((v) => v.id !== vehicle.id).map((v) => (
                <label key={v.id} className="flex items-center gap-1.5 rounded border border-border px-2 py-1"><Checkbox checked={st.unit_ids.includes(v.id)}
                  onCheckedChange={(c) => set({ unit_ids: c ? [...st.unit_ids, v.id] : st.unit_ids.filter((x: string) => x !== v.id) })} />{v.unit_number || v.name}</label>
              ))}</div></div>
          )}

          <div className="space-y-2">
            {visCats.map((c) => {
              const a: Answer = st.answers[c.no] ?? {};
              const ds = st.defects.filter((d: DraftDefect) => Number(d.code.split(".")[0]) === c.no);
              return (
                <div key={c.no} className="rounded-xl border border-border p-3">
                  <p className="font-semibold">{c.no}. {c.label}</p>
                  {c.verify && <p className="text-xs text-muted-foreground">{c.verify}</p>}
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {(["conforme", "defaut", "na"] as const).map((s) => (
                      <Button key={s} type="button" size="sm" variant={a.state === s ? (s === "defaut" ? "destructive" : "default") : "outline"}
                        disabled={s === "conforme" && ds.length > 0}
                        onClick={() => { set({ answers: { ...st.answers, [c.no]: { ...a, state: s } } }); if (s === "defaut" && !ds.length) setPicking({ cat: c.no }); }}>
                        {s === "conforme" ? "Conforme" : s === "defaut" ? "Défectuosité" : "Sans objet"}
                      </Button>
                    ))}
                  </div>
                  {a.state === "na" && <Input className="mt-2" placeholder="Justification (obligatoire)" value={a.reason ?? ""} onChange={(e) => set({ answers: { ...st.answers, [c.no]: { ...a, reason: e.target.value } } })} />}
                  {ds.map((d: DraftDefect) => { const cd = codes.find((x) => x.code === d.code); return (
                    <div key={d.key} className={`mt-2 rounded-lg border p-2 text-xs ${cd?.severity === "majeur" ? "border-destructive bg-destructive/5" : "border-border bg-muted/40"}`}>
                      <div className="flex items-start justify-between gap-2"><p><b className="font-mono">{d.code}</b> {cd?.severity === "majeur" ? "MAJEURE" : "mineure"} — {cd?.text}</p>
                        <button type="button" className="shrink-0 underline" onClick={() => set({ defects: st.defects.filter((x: DraftDefect) => x.key !== d.key) })}>Retirer</button></div>
                      {d.location && <p>Emplacement : {d.location}</p>}{Object.entries(d.details).map(([k, v]) => <span key={k} className="mr-2">{k} : {v}</span>)}
                    </div>); })}
                  {a.state === "defaut" && <Button type="button" variant="link" size="sm" className="px-0" onClick={() => setPicking({ cat: c.no })}>+ Ajouter un code</Button>}
                </div>
              );
            })}
          </div>

          {bulkList.length > 0 && (
            <div className="rounded-xl border border-border p-3"><p className="font-semibold">Équipements vrac / déneigement (vérification de l'entreprise, hors liste officielle)</p>
              {bulkList.map((b) => { const a: Answer = st.bulk[b] ?? {}; return (
                <div key={b} className="mt-2 flex flex-wrap items-center justify-between gap-2"><span>{b}</span>
                  <div className="flex gap-1">{(["conforme", "defaut", "na"] as const).map((s) => <Button key={s} type="button" size="sm" variant={a.state === s ? "default" : "outline"} onClick={() => set({ bulk: { ...st.bulk, [b]: { state: s } } })}>{s === "conforme" ? "OK" : s === "defaut" ? "Défaut" : "S. o."}</Button>)}</div>
                </div>); })}
            </div>
          )}

          <div className="rounded-xl border border-border p-3 space-y-2">
            <p className="font-semibold">{noDefect ? "Aucune défectuosité constatée" : `${st.defects.length} défectuosité(s) — ${st.defects.filter((d: DraftDefect) => codes.find((x) => x.code === d.code)?.severity === "majeur").length} majeure(s)`}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label>Nom lisible de la personne<Input value={st.inspector_name} onChange={(e) => set({ inspector_name: e.target.value })} /></label>
              <label>Rôle<Input value={st.inspector_role} placeholder="Chauffeur, personne désignée…" onChange={(e) => set({ inspector_role: e.target.value })} /></label>
            </div>
            <label className="flex items-start gap-2"><Checkbox checked={st.declaration} onCheckedChange={(c) => set({ declaration: !!c })} className="mt-0.5" />
              <span>Je déclare avoir inspecté ce véhicule conformément au Règlement sur les normes de sécurité des véhicules routiers et à la liste applicable.</span></label>
            <label className="block">Signature (tapez votre nom complet)<Input value={st.signature} onChange={(e) => set({ signature: e.target.value })} /></label>
            <Button className="h-11 w-full" onClick={submit} disabled={busy || !st.declaration || !st.signature.trim() || !st.inspector_name.trim() || !st.place.trim()}>
              {busy ? "Enregistrement…" : "Signer et transmettre"}
            </Button>
          </div>
        </div>
        {picking && <CodePicker companyId={companyId} cat={picking.cat} listNo={listNo} codes={codes} vehicles={[vehicle, ...vehicles.filter((v) => st.unit_ids.includes(v.id))]}
          onClose={() => setPicking(null)} onPick={(d) => { set({ defects: [...st.defects, d] }); setPicking(null); }} />}
      </DialogContent>
    </Dialog>
  );
}

function CodePicker({ companyId, cat, listNo, codes, vehicles, onClose, onPick }: { companyId: string; cat: number; listNo: number; codes: Code[]; vehicles: any[]; onClose: () => void; onPick: (d: DraftDefect) => void }) {
  const [code, setCode] = useState<string>("");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [location, setLocation] = useState(""); const [description, setDescription] = useState("");
  const [vid, setVid] = useState(vehicles[0]?.id);
  const [photo, setPhoto] = useState<string | undefined>(); const [up, setUp] = useState(false);
  const upload = async (f?: File) => {
    if (!f) return; if (f.size > 8 * 1024 * 1024) { toastFn({ title: "Photo trop lourde (8 Mo max)", variant: "destructive" }); return; }
    setUp(true); const path = `${companyId}/${uuid()}.${(f.name.split(".").pop() || "jpg").toLowerCase()}`;
    const { error } = await supabase.storage.from("rds-photos").upload(path, f, { contentType: f.type });
    setUp(false); if (error) toastFn({ title: "Photo non envoyée — réessayez", description: error.message, variant: "destructive" }); else setPhoto(path);
  };
  const opts = codes.filter((c) => c.cat_no === cat && c.lists.includes(listNo));
  const problem = code ? incoherence(code, details) : "Choisir un code";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>Défectuosité constatée</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          {vehicles.length > 1 && <div className="flex flex-wrap gap-1">{vehicles.map((v) => <Button key={v.id} size="sm" type="button" variant={vid === v.id ? "default" : "outline"} onClick={() => setVid(v.id)}>{v.unit_number || v.name}</Button>)}</div>}
          <ul className="space-y-1">{opts.map((c) => (
            <li key={c.code}><button type="button" onClick={() => { setCode(c.code); setDetails({}); }}
              className={`w-full rounded-lg border p-2 text-left ${code === c.code ? "border-primary bg-primary/10" : "border-border"}`}>
              <b className="font-mono">{c.code}</b> <span className={c.severity === "majeur" ? "font-semibold text-destructive" : ""}>{c.severity === "majeur" ? "Majeure" : "Mineure"}</span> — {c.text}
            </button></li>))}</ul>
          {code && prompts(code).map((p) => (
            <div key={p.k}><p>{p.l}</p>{p.opts.length ? (
              <div className="mt-1 flex flex-wrap gap-1">{p.opts.map((o) => <Button key={o} type="button" size="sm" variant={details[p.k] === o ? "default" : "outline"} onClick={() => setDetails({ ...details, [p.k]: o })}>{o}</Button>)}</div>
            ) : <Input value={details[p.k] ?? ""} onChange={(e) => setDetails({ ...details, [p.k]: e.target.value })} />}</div>
          ))}
          {code && <><Input placeholder="Emplacement (ex. avant gauche)" value={location} onChange={(e) => setLocation(e.target.value)} />
            <Textarea placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <label className="block text-xs">Photo (facultative){photo ? " — jointe ✓" : up ? " — envoi…" : ""}
              <Input type="file" accept="image/*" capture="environment" disabled={up} onChange={(e) => upload(e.target.files?.[0])} /></label></>}
          {code && problem && <p className="flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{problem}</p>}
          <Button className="w-full" disabled={!!problem || up} onClick={() => onPick({ key: uuid(), code, vehicle_id: vid, location, description, details, photo_path: photo })}>Ajouter</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DefectsTab({ defects, codeOf, vName, canManage, rpc, vehicles, companyId, codes, reload }: any) {
  const [f, setF] = useState<"ouverts" | "tous">("ouverts");
  const [repair, setRepair] = useState<any | null>(null);
  const [notes, setNotes] = useState(""); const [proof, setProof] = useState("");
  const [enRoute, setEnRoute] = useState(false);
  const { toast } = useToast();
  const now = Date.now();
  const rows = defects.filter((d: any) => f === "tous" || d.status !== "valide");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={f === "ouverts" ? "default" : "outline"} onClick={() => setF("ouverts")}>Non validés</Button>
        <Button size="sm" variant={f === "tous" ? "default" : "outline"} onClick={() => setF("tous")}>Tous</Button>
        <Button size="sm" variant="outline" onClick={() => setEnRoute(true)}><AlertTriangle className="mr-1.5 h-4 w-4" />Défaut constaté en route</Button>
      </div>
      <ul className="space-y-2">
        {rows.map((d: any) => {
          const c = codeOf(d.code); const overdue = d.severity === "mineur" && d.status !== "valide" && d.due_at && new Date(d.due_at).getTime() <= now;
          const blocks = d.status !== "valide" && (d.severity === "majeur" || overdue);
          return (
            <li key={d.id} className={`rounded-xl border p-3 text-sm ${blocks ? "border-destructive bg-destructive/5" : "border-border bg-card"}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0"><b className="font-mono">{d.code}</b> · <span className={d.severity === "majeur" ? "font-semibold text-destructive" : ""}>{d.severity === "majeur" ? "Majeure" : "Mineure"}</span> · {vName(d.vehicle_id)}{d.en_route ? " · en route" : ""}</p>
                <span className="text-xs font-semibold">{d.status === "ouvert" ? (blocks ? "Interdiction de circuler" : "Ouvert") : d.status === "repare" ? "Réparé — à valider" : "Réparation validée"}</span>
              </div>
              <p className="mt-1 text-muted-foreground">{c?.text}</p>
              {d.location && <p className="text-xs">Emplacement : {d.location}</p>}
              {d.photo_path && <PhotoLink path={d.photo_path} />}
              <p className="mt-1 text-xs text-muted-foreground">Premier constat : {fmt(d.found_at)} par {d.found_by_name || "—"}
                {d.due_at && d.severity === "mineur" && <> · Échéance 48 h : <b className={overdue ? "text-destructive" : ""}>{fmt(d.due_at)}{overdue ? " (échue — reste une mineure)" : ""}</b></>}</p>
              {d.repaired_at && <p className="text-xs">Réparé le {fmt(d.repaired_at)} : {d.repair_notes}{d.repair_proof ? ` · Preuve : ${d.repair_proof}` : ""}</p>}
              {d.validated_at && <p className="text-xs">Validé le {fmt(d.validated_at)}</p>}
              {canManage && d.status === "ouvert" && <Button size="sm" className="mt-2" onClick={() => { setRepair(d); setNotes(""); setProof(""); }}><Wrench className="mr-1.5 h-4 w-4" />Inscrire la réparation</Button>}
              {canManage && d.status === "repare" && <Button size="sm" className="mt-2" onClick={() => rpc("rds_repair_validate", { _defect: d.id }, "Réparation validée — blocage levé")}><CheckCircle2 className="mr-1.5 h-4 w-4" />Valider la réparation</Button>}
            </li>);
        })}
      </ul>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Aucun défaut.</p>}
      {repair && (
        <Dialog open onOpenChange={(o) => !o && setRepair(null)}>
          <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Réparation — {repair.code}</DialogTitle></DialogHeader>
            <div className="space-y-2 text-sm">
              <Textarea placeholder="Travaux réalisés (obligatoire)" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <Input placeholder="Preuve (n° de facture, bon de travail…)" value={proof} onChange={(e) => setProof(e.target.value)} />
              <p className="text-xs text-muted-foreground">Le blocage est levé seulement après la validation de la réparation.</p>
              <Button className="w-full" disabled={notes.trim().length < 3} onClick={async () => { await rpc("rds_repair_done", { _defect: repair.id, _notes: notes, _proof: proof }, "Réparation inscrite"); setRepair(null); }}>Enregistrer</Button>
            </div></DialogContent>
        </Dialog>
      )}
      {enRoute && <EnRouteDialog companyId={companyId} vehicles={vehicles} codes={codes} onClose={() => setEnRoute(false)} onPick={async (d: DraftDefect) => {
        const { error } = await (supabase as any).rpc("rds_report_en_route", { p: { company_id: companyId, vehicle_id: d.vehicle_id, code: d.code, location: d.location, description: d.description, details: d.details, photo_path: d.photo_path, client_key: d.key } });
        if (error) toast({ title: "Refusé", description: error.message, variant: "destructive" }); else { toast({ title: "Défaut signalé" }); setEnRoute(false); reload(); }
      }} />}
    </div>
  );
}

function EnRouteDialog({ companyId, vehicles, codes, onClose, onPick }: any) {
  const [v, setV] = useState<any>(vehicles[0]); const [cat, setCat] = useState<number | null>(null);
  const list = v?.rds_list ?? 1;
  const catNos = Array.from(new Set(codes.filter((c: Code) => c.lists.includes(list)).map((c: Code) => c.cat_no))) as number[];
  if (cat != null && v) return <CodePicker companyId={companyId} cat={cat} listNo={list} codes={codes} vehicles={[v]} onClose={onClose} onPick={onPick} />;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md"><DialogHeader><DialogTitle>Défaut constaté en route</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-1">{vehicles.map((x: any) => <Button key={x.id} size="sm" variant={v?.id === x.id ? "default" : "outline"} onClick={() => setV(x)}>{x.unit_number || x.name}</Button>)}</div>
          <p>Catégorie</p>
          <div className="grid grid-cols-2 gap-1">{catNos.map((n) => <Button key={n} size="sm" variant="outline" className="h-auto justify-start whitespace-normal text-left" onClick={() => setCat(n)}>{n}. {codes.find((c: Code) => c.cat_no === n) ? "" : ""}{CAT_SHORT[n] ?? ""}</Button>)}</div>
        </div></DialogContent>
    </Dialog>
  );
}
const CAT_SHORT: Record<number, string> = { 1: "Attelage", 2: "Châssis et carrosserie", 3: "Chauffage et dégivrage", 4: "Commandes", 5: "Direction", 6: "Essuie-glaces", 7: "Matériel d'urgence", 8: "Phares et feux", 9: "Pneus", 10: "Portières", 11: "Rétroviseurs et vitrage", 12: "Roues et moyeux", 13: "Siège", 14: "Suspension", 15: "Carburant", 16: "Échappement", 17: "Freins électriques", 18: "Freins hydrauliques", 19: "Freins pneumatiques", 20: "Passagers" };

function HistoryTab({ reports, defects, vName, codeOf, canManage, rpc, onCorrect }: any) {
  const [q, setQ] = useState("");
  const rows = reports.filter((r: any) => !q || [vName(r.vehicle_id), r.inspector_name, r.place, ...defects.filter((d: any) => d.report_id === r.id).map((d: any) => d.code)].join(" ").toLowerCase().includes(q.toLowerCase()));
  const print = (r: any) => {
    const ds = defects.filter((d: any) => d.report_id === r.id);
    const w = window.open("", "_blank", "width=760,height=900"); if (!w) return;
    const esc = (s: any) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
    w.document.write(`<html lang="fr"><head><title>Rapport de ronde</title><style>body{font-family:sans-serif;padding:24px;font-size:13px}td,th{border:1px solid #999;padding:4px;text-align:left}table{border-collapse:collapse;width:100%}</style></head><body>
      <h2>Rapport de ronde de sécurité — ${esc(LIST_LABEL[r.list_no])}</h2>
      <table><tr><th>Plaque / unité</th><td>${esc(r.plate)} (${esc(vName(r.vehicle_id))})</td></tr><tr><th>Exploitant</th><td>${esc(r.operator_name)}</td></tr>
      <tr><th>Date et heure</th><td>${esc(fmt(r.performed_at))}</td></tr><tr><th>Lieu</th><td>${esc(r.place)}</td></tr><tr><th>Odomètre</th><td>${esc(r.odometer_km ?? "—")} km</td></tr>
      <tr><th>Version</th><td>${r.version}${r.status === "remplace" ? " (remplacée)" : ""}${r.correction_reason ? " — motif : " + esc(r.correction_reason) : ""}</td></tr></table>
      <h3>Défectuosités</h3>${ds.length ? `<table><tr><th>Code</th><th>Gravité</th><th>Description</th><th>Constat</th></tr>${ds.map((d: any) => `<tr><td>${d.code}</td><td>${d.severity}</td><td>${esc(codeOf(d.code)?.text)} ${esc(d.location ?? "")}</td><td>${esc(fmt(d.found_at))}</td></tr>`).join("")}</table>` : "<p>Aucune défectuosité constatée.</p>"}
      <h3>Déclaration</h3><p>Je déclare avoir inspecté ce véhicule conformément au règlement. Signé : <b>${esc(r.signature)}</b> — ${esc(r.inspector_name)}${r.inspector_role ? " (" + esc(r.inspector_role) + ")" : ""}, le ${esc(fmt(r.signed_at))}.</p>
      ${r.operator_signed_at ? `<p>Exploitant : ${esc(r.operator_signed_name)}, le ${esc(fmt(r.operator_signed_at))}.</p>` : ""}
      <script>window.print()</script></body></html>`);
    w.document.close();
  };
  return (
    <div className="space-y-3">
      <Input placeholder="Rechercher : véhicule, conducteur, lieu, code" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="text-xs text-muted-foreground">Rondes conservées au moins 6 mois, réparations au moins 12 mois. Aucun rapport n'est supprimé.</p>
      <ul className="space-y-2">{rows.map((r: any) => { const ds = defects.filter((d: any) => d.report_id === r.id); return (
        <li key={r.id} className="rounded-xl border border-border bg-card p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-semibold">{vName(r.vehicle_id)} · {fmt(r.performed_at)}</p>
            <span className="text-xs">{r.status === "remplace" ? `v${r.version} remplacée` : `v${r.version}`}</span>
          </div>
          <p className="text-xs text-muted-foreground">{r.inspector_name} · {r.place} · {r.no_defect ? "Aucune défectuosité" : ds.map((d: any) => d.code).join(", ")}</p>
          {!r.no_defect && <p className="text-xs">{r.operator_signed_at ? `Signé par l'exploitant (${r.operator_signed_name}) le ${fmt(r.operator_signed_at)}` : "Signature de l'exploitant en attente"}</p>}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => print(r)}><Printer className="mr-1.5 h-4 w-4" />Imprimer / PDF</Button>
            {r.status === "signe" && <Button size="sm" variant="outline" onClick={() => rpc("rds_countersign", { _report: r.id }, "Prise de connaissance signée")}>Contresigner</Button>}
            {canManage && !r.no_defect && !r.operator_signed_at && r.status === "signe" && <Button size="sm" variant="outline" onClick={() => rpc("rds_operator_sign", { _report: r.id }, "Signé par l'exploitant")}>Signer (exploitant)</Button>}
            {r.status === "signe" && <Button size="sm" variant="ghost" onClick={() => onCorrect(r)}>Corriger</Button>}
          </div>
        </li>); })}</ul>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">Aucune ronde.</p>}
    </div>
  );
}

function PhotoLink({ path }: { path: string }) {
  return <button type="button" className="text-xs underline" onClick={async () => {
    const { data, error } = await supabase.storage.from("rds-photos").createSignedUrl(path, 300);
    if (error || !data) toastFn({ title: "Photo inaccessible", variant: "destructive" }); else window.open(data.signedUrl, "_blank", "noopener");
  }}>Voir la photo</button>;
}

const OUTBOX = "vq.rds.outbox";
function outboxGet(): any[] { try { return JSON.parse(localStorage.getItem(OUTBOX) || "[]"); } catch { return []; } }
function outboxAdd(p: any) { const q = outboxGet().filter((x) => x.client_key !== p.client_key); q.push(p); localStorage.setItem(OUTBOX, JSON.stringify(q)); }
let flushing = false;
async function outboxFlush(db: any): Promise<{ sent: number; refused: string[] }> {
  if (flushing || !navigator.onLine) return { sent: 0, refused: [] };
  flushing = true; let sent = 0; const refused: string[] = [];
  try {
    for (const p of outboxGet()) {
      const { error } = await db.rpc("rds_submit", { p: { ...p, offline: true } });
      if (error && /fetch|network/i.test(error.message)) break; // réseau encore instable : on réessaiera
      const left = outboxGet().filter((x) => x.client_key !== p.client_key);
      if (error) { refused.push(error.message); localStorage.setItem(`${OUTBOX}.refused.${p.client_key}`, JSON.stringify(p)); } else sent++;
      localStorage.setItem(OUTBOX, JSON.stringify(left));
    }
  } finally { flushing = false; }
  return { sent, refused };
}

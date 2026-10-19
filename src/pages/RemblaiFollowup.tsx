import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Check, Edit3, LockKeyhole, Pause, Play, X, Mail, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import ReceptionConditionsForm from "@/components/remblai/ReceptionConditionsForm";
import { conditionsSchema, quantityLabel, WAITING_MESSAGE, type ReceptionConditions } from "@/lib/remblai/conditions";
import { previewRepository, previewService, PREVIEW_EVENT, FICTIONAL_ID, startPreview, resetPreview, type PreviewSession } from "@/lib/remblai/preview";
import type { Action, RequestRecord } from "@/lib/remblai/service";
import { isLocalServerMode, takeFragment, isolatedService, readIsolatedCrm } from "@/lib/remblai/isolated-client";
import { REMBLAI_CLOUD_ENABLED } from "@/lib/remblai/activation";
import { cloudPortalService, cloudPortalCall } from "@/lib/remblai/cloud-client";
type PublicRequest = Omit<RequestRecord, "history">;
const availabilityLabels = { a_confirmer: "À confirmer", available: "Besoin confirmé", suspended: "En pause", owner_closed: "Fermée" };
const actions: { key: Action; label: string; icon: typeof Check }[] = [{ key: "modifier", label: "Modifier", icon: Edit3 }, { key: "confirmer", label: "Confirmer le besoin", icon: Check }, { key: "pause", label: "Mettre en pause", icon: Pause }, { key: "reprendre", label: "Reprendre", icon: Play }, { key: "fermer", label: "Fermer la demande", icon: X }];
export default function RemblaiFollowup({ crm = false }: { crm?: boolean }) {
  const [params] = useSearchParams();
  const scenario = params.get("scenario") ?? "normal";
  // Explicit opt-in to fictitious test data; no real portal without hosted service.
  const local = isLocalServerMode(window.location.search, window.location.hostname);
  const hosted = REMBLAI_CLOUD_ENABLED && !local && params.get("test") !== "1";
  const test = params.get("test") === "1" || local;
  const enabled = test || hosted;
  const service = local ? isolatedService : hosted ? cloudPortalService : previewService;
  const [session, setSession] = useState<PreviewSession | null>(null);
  const [row, setRow] = useState<PublicRequest | null>(null);
  const [history, setHistory] = useState<RequestRecord["history"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<ReceptionConditions | null>(null);
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [code, setCode] = useState("");
  const [testCode, setTestCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [emailPreview, setEmailPreview] = useState(false);
  const lock = useRef(false);
  const operation = useRef<string | null>(null);
  const reload = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    try {
      if (crm) {
        const result = local ? await readIsolatedCrm(params.get("requestId") ?? "") : hosted ? await cloudPortalCall<RequestRecord>({kind:'crm',requestId:params.get('requestId') ?? ''}) : await previewRepository.getRequest(FICTIONAL_ID);
        setRow(result); setHistory(result?.history ?? []);
      } else {
        const current = local || hosted ? takeFragment() : await startPreview(scenario);
        if (!current) throw new Error("Lien personnel requis. Ouvrez le lien capturé dans le courriel TEST.");
        setSession(current);
        const result = await service.read(current.linkId, current.secret, current.requestId);
        setRow(result); setDraft(result.conditions);
      }
      setError("");
    } catch (e) { setRow(null); setError(e instanceof Error ? e.message : "Lecture impossible."); }
    finally { setLoading(false); }
  }, [enabled, crm, scenario, local, hosted, service, params]);
  useEffect(() => {
    void reload();
    const update = () => { void reload(); };
    window.addEventListener(PREVIEW_EVENT, update); window.addEventListener("storage", update);
    const timer = (local || hosted) && crm ? window.setInterval(update, 2000) : null;
    return () => { window.removeEventListener(PREVIEW_EVENT, update); window.removeEventListener("storage", update); if (timer) window.clearInterval(timer); };
  }, [reload]);
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : "Action impossible."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function requestCode() {
    if (!session) return;
    await run(async () => { await service.requestCode(session.linkId, session.secret, session.requestId, async (_link: unknown, value: string) => { setTestCode(value); }); setMessage(hosted ? "Code préparé pour votre contact. Consultez votre courriel." : local ? "Courriel contenant le code capturé sur le serveur local. Aucun envoi réel." : "TEST : code préparé pour le contact fictif vérifié. Aucun courriel envoyé."); setVerified(false); });
  }
  async function verify() {
    if (!session) return;
    await run(async () => { await service.verifyCode(session.linkId, session.secret, session.requestId, code); setVerified(true); setTestCode(""); setCode(""); setMessage(hosted ? "Identité vérifiée pour 10 minutes." : "Identité fictive vérifiée pour 10 minutes."); if (local || hosted) await reload(); });
  }
  async function commit() {
    if (!session || !row || !action) return;
    const next = action;
    await run(async () => {
      const id = operation.current ?? crypto.randomUUID(); operation.current = id;
      const result = await service.act({ ...session, action: next, confirmed: true, operationId: id, version: row.version, conditions: next === "modifier" && draft ? draft : undefined });
      setRow(result); setDraft(result.conditions); setEditing(false); setAction(null); operation.current = null;
      setMessage(hosted ? "Dossier mis à jour. Aucune livraison autorisée ni réservée." : "Dossier TEST mis à jour. Aucune livraison autorisée ni réservée.");
    });
  }
  function choose(next: Action) {
    if (next === "modifier") { setEditing(true); return; }
    operation.current = crypto.randomUUID(); setAction(next);
  }
  function save() {
    const parsed = conditionsSchema.safeParse(draft);
    if (!parsed.success) { setError(parsed.error.issues.map(i => i.message).join(" ")); return; }
    operation.current = crypto.randomUUID(); setAction("modifier");
  }
  return <div className="min-h-screen bg-background text-foreground">
    <Helmet><title>Suivi de ma demande de remblai | Vrac Québec</title><meta name="robots" content="noindex, nofollow, noarchive" /><meta name="referrer" content="no-referrer" /></Helmet>
    <header className="border-b border-border bg-card"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4"><a href="/" className="inline-flex min-h-11 items-center gap-2 font-display font-bold"><ArrowLeft className="h-4 w-4" />Vrac Québec</a><Badge variant="outline"><LockKeyhole className="mr-2 h-3 w-3" />{test ? "TEST — contacts fictifs" : "Accès personnel"}</Badge></div></header>
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      {!enabled ? <section className="space-y-4"><h1 className="font-display text-2xl font-bold">Suivre ma demande</h1><p>Le suivi sans compte n’est pas encore activé pour les dossiers réels. Aucun dossier personnel n’est accessible ici.</p><Button asChild variant="outline"><a href="/contact">Contacter Vrac Québec</a></Button></section> : <>
        {!local && !hosted && <div className="mb-5 flex flex-wrap gap-3"><Button asChild variant="outline"><a href={crm ? "/portail/remblai?test=1" : "/admin/apercu-suivi-remblai?test=1"}><ClipboardList className="mr-2 h-4 w-4" />{crm ? "Voir le suivi personnel TEST" : "Voir le dossier CRM TEST"}</a></Button><Button variant="outline" onClick={() => setEmailPreview(v => !v)}><Mail className="mr-2 h-4 w-4" />Aperçu du courriel TEST</Button>{crm && <Button variant="outline" onClick={() => void run(async () => { await resetPreview(); await reload(); })}>Réinitialiser le dossier fictif</Button>}</div>}
        {emailPreview && <section aria-label="Courriel de confirmation TEST" className="mb-6 border-y border-border py-5"><h2 className="font-display text-lg font-semibold">Confirmation de votre demande — Vrac Québec</h2><p className="my-3">Bonjour Camille Exemple, nous avons bien reçu votre demande de remblai.</p><p className="mb-4 text-sm text-muted-foreground">{WAITING_MESSAGE}</p><Button asChild><a href="/portail/remblai?test=1">Suivre ou modifier ma demande</a></Button><p className="mt-3 text-xs text-muted-foreground">Aperçu TEST uniquement : aucun envoi ni consentement promotionnel.</p></section>}
        {loading && <p role="status">Chargement du dossier…</p>}
        {error && <div role="alert" className="mb-4 border-l-2 border-destructive bg-destructive/10 p-4 text-sm text-destructive">{error}{!row && <Button variant="outline" className="mt-3 block" onClick={() => void run(async () => { if (!session) return; await service.renew(session.linkId, async (_link: unknown, _secret: string) => { setMessage("TEST : nouveau lien préparé pour le contact fictif vérifié. Ancien lien révoqué; aucun courriel envoyé."); }); if(local) setMessage("Nouveau lien capturé pour le contact vérifié. Aucun envoi réel."); })}>Demander un nouveau lien</Button>}</div>}
        {(local || hosted) && session && !row && !crm && <section className="mb-5 border-y border-border py-5"><h2 className="mb-3 font-display font-semibold">Vérifier le contact avant de consulter le dossier</h2><Button variant="outline" disabled={busy} onClick={() => void requestCode()}>Recevoir un code</Button><div className="mt-3 flex flex-wrap gap-2"><Input className="max-w-48" aria-label="Code de vérification" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value)} /><Button disabled={busy || code.length !== 6} onClick={() => void verify()}>Vérifier le code</Button></div></section>}
        {message && <p role="status" className="mb-4 text-sm text-muted-foreground">{message}</p>}
        {row && <>
          <header className="mb-5"><p className="text-sm text-muted-foreground">{row.reference} · {row.city}</p><h1 className="mt-1 font-display text-3xl font-bold">{crm ? "Dossier remblai — TEST" : "Ma demande de remblai"}</h1><p className="mt-2 text-sm text-muted-foreground">{row.name}</p></header>
          <dl className="grid grid-cols-2 gap-4 border-y border-border py-5 sm:grid-cols-4"><div><dt className="text-sm text-muted-foreground">Statut commercial</dt><dd className="mt-1 font-semibold">{row.status}</dd></div><div><dt className="text-sm text-muted-foreground">Disponibilité du besoin</dt><dd className="mt-1 font-semibold" data-testid="availability">{availabilityLabels[row.availability]}</dd></div><div><dt className="text-sm text-muted-foreground">Dernière confirmation</dt><dd className="mt-1 font-semibold">{row.lastConfirmed ? new Date(row.lastConfirmed).toLocaleString("fr-CA") : "Jamais confirmée"}</dd></div><div><dt className="text-sm text-muted-foreground">Besoin restant</dt><dd className="mt-1 font-semibold" data-testid="remaining">{quantityLabel(row.conditions.remaining, row.conditions.unit)}</dd></div></dl>
          <p className="my-5 border-l-2 border-primary pl-4 text-sm leading-relaxed">{row.availability === "suspended" ? "Votre demande est en pause. Aucune livraison n’est confirmée." : row.availability === "owner_closed" ? "Votre demande est fermée. Aucune nouvelle livraison n’est autorisée." : row.deliveries.some(d => d.status === "confirmee") ? "Consultez les livraisons confirmées ci-dessous." : WAITING_MESSAGE}</p>
          {!crm && row.availability !== "owner_closed" && <>
            <section className="mb-5 border-y border-border py-5"><h2 className="mb-3 flex items-center gap-2 font-display font-semibold"><LockKeyhole className="h-4 w-4" />Vérification avant modification</h2>{verified ? <p className="text-sm">Identité vérifiée récemment.</p> : <><Button variant="outline" disabled={busy} onClick={() => void requestCode()}>{local || hosted ? "Recevoir un code" : "Recevoir un code TEST"}</Button>{testCode && <p className="mt-3 text-sm" data-testid="test-code">Code du contact fictif : <strong>{testCode}</strong></p>}<div className="mt-3 flex flex-wrap gap-2"><Input className="max-w-48" aria-label="Code de vérification" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value)} /><Button disabled={busy || code.length !== 6} onClick={() => void verify()}>Vérifier le code</Button></div></>}</section>
            <div className="mb-6 flex flex-wrap gap-2">{actions.filter(a => row.availability === "suspended" ? ["modifier", "reprendre", "fermer"].includes(a.key) : a.key !== "reprendre").map(a => <Button variant={a.key === "fermer" ? "outline" : "secondary"} key={a.key} disabled={busy || !verified} onClick={() => choose(a.key)}><a.icon className="mr-2 h-4 w-4" />{a.label}</Button>)}</div>
          </>}
          {editing && draft ? <section className="mb-6 border-y border-border py-6"><ReceptionConditionsForm value={draft} onChange={setDraft} /><div className="mt-6 flex flex-wrap gap-3"><Button disabled={busy} onClick={save}>Enregistrer les conditions</Button><Button variant="outline" onClick={() => { setEditing(false); setDraft(row.conditions); }}>Annuler</Button></div></section> : <section className="space-y-4 border-b border-border pb-6"><h2 className="font-display text-xl font-semibold">Conditions de réception</h2><dl className="grid gap-3 text-sm sm:grid-cols-2">{[
            ["Quantité totale", quantityLabel(row.conditions.total, row.conditions.unit)], ["Minimum par livraison", quantityLabel(row.conditions.minimumDelivery, row.conditions.unit)], ["Minimum par journée", quantityLabel(row.conditions.minimumDay, row.conditions.unit)], ["Réception progressive", row.conditions.progressive], ["Taille maximale de roche", row.conditions.maxRockCm == null ? "Inconnue" : `${row.conditions.maxRockCm} cm`], ["Compositions mixtes", `${row.conditions.mixed} — ${row.conditions.mixedDetails ?? "Composition inconnue"}`], ["Accès", row.conditions.access ?? "Inconnu"], ["Horaires", row.conditions.hours ?? "Inconnus"], ["Présence nécessaire", row.conditions.presence], ["Consignes", row.conditions.instructions ?? "Inconnues"], ["Mode souhaité", row.conditions.mode], ["Période et créneaux", `${row.conditions.periodStart ?? "Inconnu"} → ${row.conditions.periodEnd ?? "Inconnu"}; ${row.conditions.slots ?? "Non renseignés"}`], ["Conditions explicites", row.conditions.explicitConditions ?? "Inconnues"], ["Admissibilité environnementale/documentaire", row.conditions.environmental], ["Adéquation au projet", row.conditions.projectFit], ["Communications promotionnelles", row.conditions.promotional ? "Consentement explicite" : "Aucun consentement"],
          ].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}</dl><h3 className="font-semibold">Préférences propriétaire — matériaux</h3><div className="flex flex-wrap gap-2">{row.conditions.materials.map(m => <Badge variant="outline" key={m.name}>{m.name} : {m.stance.replace(/_/g, " ")}</Badge>)}</div><h3 className="font-semibold">Véhicules</h3><div className="flex flex-wrap gap-2">{row.conditions.vehicles.map(v => <Badge variant="outline" key={v.name}>{v.name} : {v.stance.replace(/_/g, " ")}</Badge>)}</div><p className="text-sm text-muted-foreground">Enregistrer ces préférences ne réserve ni n’autorise une livraison. L’admissibilité environnementale et l’adéquation au projet doivent être validées séparément.</p>{row.conditions.photos.length > 0 && <div className="grid grid-cols-2 gap-3">{row.conditions.photos.map((p, i) => <img className="aspect-video w-full rounded-md object-cover" key={i} src={p.preview} alt={p.name} />)}</div>}</section>}
          <div className="grid gap-6 py-6 sm:grid-cols-2">{[["Propositions", row.proposals], ["Livraisons", row.deliveries]].map(([title, items]) => <section key={String(title)}><h2 className="mb-3 font-display text-xl font-semibold">{String(title)}</h2>{(items as RequestRecord["proposals"]).length === 0 ? <p className="text-sm text-muted-foreground">{title === "Propositions" ? "Aucune proposition pour le moment." : "Aucune livraison confirmée."}</p> : (items as RequestRecord["proposals"]).map(item => <p className="text-sm" key={item.id}>{item.label} — {item.status}</p>)}</section>)}</div>
          {crm && <section className="border-t border-border py-5"><h2 className="mb-3 font-display text-xl font-semibold">Historique du dossier TEST</h2><p className="mb-2 text-sm">Version {row.version} · Même identifiant fictif que le suivi personnel.</p>{history.length === 0 ? <p className="text-sm text-muted-foreground">Aucune modification.</p> : <ol className="space-y-2">{history.map(h => <li className="text-sm" key={h.id}>{h.action} · {new Date(h.at).toLocaleString("fr-CA")} · version {h.version}</li>)}</ol>}</section>}
        </>}
      </>}
    </main>
    <AlertDialog open={action !== null} onOpenChange={open => { if (!open && !busy) setAction(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Confirmer : {actions.find(a => a.key === action)?.label}</AlertDialogTitle><AlertDialogDescription>{action === "fermer" ? "La fermeture conserve le dossier et son historique. Une réouverture devra être validée." : "Vous confirmez explicitement la modification de votre demande. Cela ne confirme aucune livraison."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void commit(); }}>Confirmer la modification</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}
import { useCallback, useEffect, useState } from "react";
import { Loader2, Pause, Play, Rocket, Square } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { autopilotPercent, controlAutopilot, isActive, kickAutopilot, loadPreview, loadStatus, previewLines, scopeLines, startAutopilot, type AutopilotPreview, type AutopilotStatus } from "@/lib/seo/autopilot";

const STATUS: Record<string, string> = { queued: "En attente de démarrage", running: "En cours", paused: "En pause", completed: "Terminé", cancelled: "Arrêté" };
const OUTCOME: Record<string, string> = { waiting_evidence: "En attente de preuve", excluded: "Exclue", kept_draft: "Brouillon conservé", error: "Erreur", generated: "Générée (brouillon)", fixed: "Corrigée (brouillon)" };

// Un seul lancement : START → résumé serveur → confirmation. Le traitement tourne ensuite côté serveur, ville par ville.
export default function AutopilotPanel() {
  const [status, setStatus] = useState<AutopilotStatus | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<AutopilotPreview | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { setStatus(await loadStatus()); setStatusErr(null); } catch (e) { setStatusErr(e instanceof Error ? e.message : "Lecture impossible"); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const active = isActive(status);
  const running = !!status?.run && ["queued", "running"].includes(status.run.status);
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(t);
  }, [active, refresh]);
  // Tant que la page est ouverte, relance le traitement serveur toutes les 30 s (sinon le superviseur le fait chaque minute).
  useEffect(() => {
    if (!running) return;
    void kickAutopilot();
    const t = window.setInterval(() => void kickAutopilot(), 30000);
    return () => window.clearInterval(t);
  }, [running]);

  const openStart = async () => {
    setBusy("preview"); setOpen(true); setPreview(null);
    try { setPreview(await loadPreview()); } catch (e) { toast({ title: "Résumé indisponible", description: e instanceof Error ? e.message : "", variant: "destructive" }); setOpen(false); }
    finally { setBusy(null); }
  };
  const confirmStart = async () => {
    setBusy("start");
    try {
      const r = await startAutopilot();
      toast({ title: r.created ? `Traitement lancé — ${r.cities} villes` : "Rien n'a été lancé", description: r.reason });
      setOpen(false);
      if (r.created) void kickAutopilot();
      await refresh();
    } catch (e) { toast({ title: "Lancement refusé", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
    finally { setBusy(null); }
  };
  const control = async (a: "pause" | "resume" | "stop") => {
    if (!status?.run) return;
    if (a === "stop" && !window.confirm("Arrêter le traitement ? Les pages déjà traitées sont conservées; les tâches restantes sont annulées.")) return;
    setBusy(a);
    try { await controlAutopilot(status.run.id, a); await refresh(); }
    catch (e) { toast({ title: "Action refusée", description: e instanceof Error ? e.message : "", variant: "destructive" }); }
    finally { setBusy(null); }
  };

  const s = status;
  const pct = autopilotPercent(s);
  const kpis: [string, number | string | undefined][] = s?.run ? [
    ["Villes terminées", `${s.cities_done ?? 0} / ${s.cities_total ?? 0}`], ["Villes restantes", (s.cities_total ?? 0) - (s.cities_done ?? 0)],
    ["Combinaisons traitées", `${s.tasks_done ?? 0} / ${s.tasks_total ?? 0}`],
    ["Pages générées", s.generated], ["Pages corrigées", s.fixed], ["Pages publiées", s.published], ["Brouillons conservés", s.not_published],
    ["En attente de preuve", s.waiting_evidence], ["Exclues", s.excluded], ["Erreurs réelles", s.errors],
    ["Coût IA depuis le lancement", `${Number(s.credits ?? 0).toFixed(2)} crédit(s)`],
  ] : [];

  return (
    <Card className="p-4 space-y-3 border-primary/40">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div>
          <h2 className="font-bold text-lg">Compléter le SEO des villes</h2>
          <p className="text-xs text-muted-foreground">Un seul lancement : chaque ville active est traitée automatiquement (génération, correction, qualité, publication des pages admissibles).</p>
        </div>
        {!active && (
          <Button size="lg" className="gap-2 w-full sm:w-auto" disabled={!!busy || !!statusErr} onClick={() => void openStart()}>
            <Rocket className="w-4 h-4" /> START — Compléter le SEO des villes
          </Button>
        )}
      </div>
      {statusErr && <p className="text-xs text-destructive">Suivi indisponible : {statusErr}</p>}

      {s?.run && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{STATUS[s.run.status] ?? s.run.status}</span>
            {s.run.current_city_slug && s.run.status === "running" && <span className="text-muted-foreground">· ville en cours : {s.run.current_city_slug}</span>}
            {s.run.started_at && <span className="text-xs text-muted-foreground">· lancé le {new Date(s.run.started_at).toLocaleString("fr-CA")}</span>}
            <div className="flex gap-1.5 ml-auto w-full sm:w-auto">
              {(s.run.status === "running" || s.run.status === "queued") && <Button size="sm" variant="outline" className="gap-1 flex-1 sm:flex-none" disabled={!!busy} onClick={() => void control("pause")}><Pause className="w-3 h-3" /> Pause</Button>}
              {s.run.status === "paused" && <Button size="sm" className="gap-1 flex-1 sm:flex-none" disabled={!!busy} onClick={() => void control("resume")}><Play className="w-3 h-3" /> Reprendre</Button>}
              {active && <Button size="sm" variant="outline" className="gap-1 flex-1 sm:flex-none text-destructive" disabled={!!busy} onClick={() => void control("stop")}><Square className="w-3 h-3" /> Arrêter</Button>}
            </div>
          </div>
          {s.run.pause_reason && <p className="text-xs text-amber-700">{s.run.pause_reason}</p>}
          <div className="flex items-center gap-2 text-xs"><span className="font-semibold text-base">{pct} %</span>
            {s.current_step && s.run.status === "running" && <span className="text-muted-foreground">· étape : {s.current_step}</span>}
            {s.run.last_progress_at && <span className="text-muted-foreground ml-auto">dernière activité {new Date(s.run.last_progress_at).toLocaleTimeString("fr-CA")}</span>}
          </div>
          <Progress value={pct} className="h-2" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
            {kpis.map(([l, v]) => <div key={l} className="rounded-md border border-border p-2"><div className="text-muted-foreground">{l}</div><div className="font-semibold text-base">{v ?? 0}</div></div>)}
          </div>
          {(s.recent_issues?.length ?? 0) > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer font-medium">Pages non traitées ou conservées, avec la raison ({s.recent_issues!.length} plus récentes)</summary>
              <ul className="mt-1 max-h-64 overflow-y-auto divide-y divide-border">
                {s.recent_issues!.map((i, n) => (
                  <li key={n} className="py-1"><span className="font-medium">{i.city} · {i.material ?? i.service ?? "page ville"}</span>
                    {i.outcome && <span className="text-muted-foreground"> — {OUTCOME[i.outcome] ?? i.outcome}</span>}<div className="text-muted-foreground">{i.reason}</div></li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>START — Compléter le SEO des villes</DialogTitle></DialogHeader>
          {!preview ? <div className="flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Calcul du travail prévu…</div> : (
            <div className="space-y-1.5 text-sm">
              <div className="rounded-md border p-2 space-y-1 mb-2">
                <p className="font-medium text-xs uppercase text-muted-foreground">Périmètres comparés</p>
                {scopeLines(preview).map((l) => <p key={l} className="text-xs">• {l}</p>)}
              </div>
              <p className="font-medium text-xs uppercase text-muted-foreground">Travail START (municipalités seulement)</p>
              {previewLines(preview).map((l) => <p key={l}>• {l}</p>)}
              <p className="text-xs text-muted-foreground pt-1">Aucune disponibilité inconnue n'est confirmée sans preuve. Aucune page n'est supprimée. Pause, reprise et arrêt sont possibles à tout moment.</p>
              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                <Button variant="outline" disabled={!!busy} onClick={() => setOpen(false)}>Annuler</Button>
                <Button disabled={!!busy} onClick={() => void confirmStart()}>{busy === "start" && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Confirmer et démarrer</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

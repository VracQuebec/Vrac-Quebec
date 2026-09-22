// ============================================================
// CRM — APPROBATION DOMPE PAR DOMPE.
// Chaque relation (demande + dompe) est traitée séparément :
// approuver une dompe n'approuve jamais les autres.
// L'approbation est la SEULE étape qui débloque l'adresse réelle
// pour l'entrepreneur propriétaire de cette demande.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/hooks/use-toast";
import {
  decideSubmissionSite,
  decisionLabel,
  loadSubmissionSites,
  type SiteDecisionStatus,
  type SubmissionSite,
} from "@/lib/parcours/site-decisions";

const tone: Record<SiteDecisionStatus, string> = {
  approuvee: "border-emerald-300 bg-emerald-100 text-emerald-800",
  refusee: "border-destructive/40 bg-destructive/10 text-destructive",
  en_attente: "border-border bg-muted text-muted-foreground",
};

export default function DompesApprobationPanel({ submissionId }: { submissionId: string }) {
  const [sites, setSites] = useState<SubmissionSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await loadSubmissionSites(submissionId);
    setSites(res.state === "ok" ? res.sites : []);
    setLoading(false);
  }, [submissionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const decide = async (siteId: string, decision: SiteDecisionStatus) => {
    if (busy) return;
    setBusy(siteId);
    const res = await decideSubmissionSite(submissionId, siteId, decision);
    setBusy(null);
    if (res.ok !== true) {
      toast({ title: "Décision impossible", description: res.message, variant: "destructive" });
      return;
    }
    toast({
      title: `Dompe ${decisionLabel(res.site.status).toLowerCase()}`,
      description: res.site.changed
        ? "L'entrepreneur a été avisé pour cette dompe uniquement."
        : "Aucun changement : l'état était déjà celui-ci.",
    });
    await reload();
  };

  return (
    <div className="mb-3 rounded-lg border border-border bg-card p-3 text-xs font-body">
      <div className="font-display text-[10px] font-bold uppercase tracking-wide text-primary">
        Dompes demandées — approbation individuelle
      </div>

      {loading ? (
        <div className="mt-1.5 text-muted-foreground">Chargement…</div>
      ) : sites.length === 0 ? (
        <div className="mt-1.5 text-muted-foreground">
          Aucune dompe n'est rattachée à cette demande pour l'instant.
        </div>
      ) : (
        <ul className="mt-2 space-y-2">
          {sites.map((s) => (
            <li key={s.siteId} className="rounded-lg border border-border bg-background p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-display text-[11px] font-bold">{s.siteLabel || "Dompe"}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide ${tone[s.status]}`}
                >
                  {decisionLabel(s.status)}
                </span>
              </div>
              <div className="mt-1 space-y-0.5 text-muted-foreground">
                <div>
                  <span className="font-semibold text-foreground">Adresse réelle : </span>
                  {s.siteAddress || "—"}
                </div>
                <div>
                  <span className="font-semibold text-foreground">Admissibilité : </span>
                  {s.siteStatus || "—"}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  onClick={() => void decide(s.siteId, "approuvee")}
                  disabled={busy === s.siteId || s.status === "approuvee"}
                  className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-display font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Approuver
                </button>
                <button
                  onClick={() => void decide(s.siteId, "refusee")}
                  disabled={busy === s.siteId || s.status === "refusee"}
                  className="rounded-lg border border-destructive/40 px-2.5 py-1 text-[11px] font-display font-semibold text-destructive disabled:opacity-50"
                >
                  Refuser
                </button>
                <button
                  onClick={() => void decide(s.siteId, "en_attente")}
                  disabled={busy === s.siteId || s.status === "en_attente"}
                  className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-display font-semibold text-muted-foreground disabled:opacity-50"
                >
                  Retirer la décision
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

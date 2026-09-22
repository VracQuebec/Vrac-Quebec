// ============================================================
// DOMPES D'UNE DEMANDE — vue entrepreneur.
// Chaque dompe possède SON état : en attente / approuvée / refusée.
// L'adresse réelle n'est affichée que si le serveur l'a transmise,
// c'est-à-dire uniquement pour une dompe APPROUVÉE dans CETTE demande.
// Aucune donnée n'est déduite ni inventée côté client.
// ============================================================
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, MapPin, XCircle } from "lucide-react";
import {
  loadSubmissionSites,
  decisionLabel,
  type SubmissionSite,
  type SiteDecisionStatus,
} from "@/lib/parcours/site-decisions";

const tone: Record<SiteDecisionStatus, string> = {
  approuvee: "border-emerald-300 bg-emerald-50 text-emerald-800",
  refusee: "border-destructive/40 bg-destructive/10 text-destructive",
  en_attente: "border-border bg-muted text-muted-foreground",
};

const Icon = ({ status }: { status: SiteDecisionStatus }) =>
  status === "approuvee" ? (
    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
  ) : status === "refusee" ? (
    <XCircle className="h-3.5 w-3.5" aria-hidden />
  ) : (
    <Clock className="h-3.5 w-3.5" aria-hidden />
  );

export const DompeDecisionRow = ({ site }: { site: SubmissionSite }) => (
  <li className="rounded-xl border border-border bg-background p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="font-display text-xs font-bold text-foreground">
        {site.siteLabel || "Dompe"}
      </span>
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide ${tone[site.status]}`}
      >
        <Icon status={site.status} />
        {decisionLabel(site.status)}
      </span>
    </div>
    <p className="mt-1.5 flex items-start gap-1.5 font-body text-xs text-muted-foreground">
      <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" aria-hidden />
      <span>
        {site.status === "approuvee" && site.siteAddress ? (
          <>
            <span className="font-semibold text-foreground">Adresse : </span>
            {site.siteAddress}
          </>
        ) : site.status === "refusee" ? (
          "Dompe refusée : l'adresse réelle n'est pas communiquée."
        ) : (
          "Adresse réelle communiquée uniquement après l'approbation de cette dompe."
        )}
      </span>
    </p>
    {site.status === "refusee" && site.decisionNote ? (
      <p className="mt-1 font-body text-xs text-muted-foreground">{site.decisionNote}</p>
    ) : null}
  </li>
);

export default function DompesDemandeList({ submissionId }: { submissionId: string }) {
  const [sites, setSites] = useState<SubmissionSite[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      const res = await loadSubmissionSites(submissionId);
      if (!alive) return;
      setSites(res.state === "ok" ? res.sites : []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [submissionId]);

  if (loading) {
    return (
      <p className="mt-3 flex items-center gap-2 font-body text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Chargement des dompes…
      </p>
    );
  }

  if (!sites || sites.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="font-display text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        Dompes de cette demande
      </p>
      <ul className="mt-1.5 space-y-2">
        {sites.map((s) => (
          <DompeDecisionRow key={s.siteId} site={s} />
        ))}
      </ul>
    </div>
  );
}

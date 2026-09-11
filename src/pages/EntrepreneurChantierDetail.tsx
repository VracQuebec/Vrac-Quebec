// ============================================================
// DOSSIER CHANTIER — tout ce qui touche un chantier, au même endroit.
// Données : vue calculée existante (aucune nouvelle structure).
// ============================================================
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  StatusBadge,
} from "@/components/entrepreneur-app/AppStates";
import { useEntrepreneurData } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import {
  Plus,
  Map as MapIcon,
  Truck,
  ClipboardList,
  MapPin,
  ChevronRight,
  CheckCircle2,
  Circle,
  Clock,
} from "lucide-react";

const toneFor = (status: string | null): "pending" | "active" | "done" | "refused" | "neutral" => {
  if (!status) return "neutral";
  if (["acceptee", "planifiee", "en_cours"].includes(status)) return "active";
  if (["terminee", "complete"].includes(status)) return "done";
  if (["refusee", "annulee"].includes(status)) return "refused";
  return "pending";
};

const labelFor = (status: string | null): string => {
  const map: Record<string, string> = {
    nouvelle: "Nouvelle",
    en_analyse: "En analyse",
    soumission_envoyee: "Soumission envoyée",
    en_attente_proprietaire: "En attente",
    acceptee: "Acceptée",
    planifiee: "Planifiée",
    en_cours: "En cours",
    terminee: "Terminée",
    refusee: "Refusée",
    annulee: "Annulée",
  };
  return (status && map[status]) || "À confirmer";
};

export default function EntrepreneurChantierDetail() {
  const { key } = useParams<{ key: string }>();
  const decoded = key ? decodeURIComponent(key) : "";
  const { loading, error, chantiers, refresh } = useEntrepreneurData();
  const chantier = useMemo(() => chantiers.find((c) => c.key === decoded), [chantiers, decoded]);

  const title = chantier?.label ?? "Chantier";

  return (
    <EntrepreneurAppShell
      title={title}
      subtitle={chantier?.address ?? chantier?.city ?? undefined}
      backTo="/entrepreneur/chantiers"
    >
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-5 space-y-8">
        {loading ? (
          <LoadingSkeleton lines={3} />
        ) : error ? (
          <ErrorState onRetry={refresh} />
        ) : !chantier ? (
          <EmptyState
            title="Chantier introuvable"
            message="Ce chantier ne correspond à aucune de vos demandes actuelles."
            actionLabel="Voir mes chantiers"
            actionTo="/entrepreneur/chantiers"
          />
        ) : (
          <>
            {/* ---------- Statut ---------- */}
            <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-display text-sm font-bold">{chantier.label}</p>
                  <p className="font-body text-xs text-muted-foreground">
                    {chantier.city ?? "Ville à confirmer"}
                  </p>
                </div>
              </div>
              <StatusBadge label="En cours" tone="active" />
            </div>

            {/* ---------- Actions ---------- */}
            <div className="grid grid-cols-3 gap-2.5">
              <Link
                to="/demande-transport"
                className="flex flex-col items-center gap-2 rounded-2xl bg-primary px-2 py-4 text-center text-primary-foreground shadow-md shadow-primary/25 active:scale-95 transition-transform"
              >
                <Plus className="h-5 w-5" />
                <span className="text-[11px] font-display font-bold leading-tight">Nouvelle<br />demande</span>
              </Link>
              <Link
                to={`/entrepreneur/carte?chantier=${encodeURIComponent(chantier.key)}`}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-2 py-4 text-center active:scale-95 transition-transform"
              >
                <MapIcon className="h-5 w-5 text-primary" />
                <span className="text-[11px] font-display font-bold leading-tight">Trouver<br />une dompe</span>
              </Link>
              <Link
                to="/entrepreneur/demandes"
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card px-2 py-4 text-center active:scale-95 transition-transform"
              >
                <Truck className="h-5 w-5 text-primary" />
                <span className="text-[11px] font-display font-bold leading-tight">Demander<br />un transport</span>
              </Link>
            </div>

            {/* ---------- Demandes du chantier ---------- */}
            <section aria-labelledby="chantier-demandes">
              <h2 className="mb-3 font-display text-lg font-bold">Demandes ({chantier.submissions.length})</h2>
              <div className="space-y-2.5">
                {chantier.submissions.map((s) => (
                  <Link
                    key={s.id}
                    to="/entrepreneur/demandes"
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 active:scale-[0.99] transition-transform"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <ClipboardList className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-sm font-bold">
                        {s.material ?? "Demande de matériau"}
                        {s.number ? ` · #${s.number}` : ""}
                      </p>
                      <p className="truncate font-body text-xs text-muted-foreground">
                        {s.quantity ?? "Quantité à confirmer"}
                        {s.createdAt && ` · ${new Date(s.createdAt).toLocaleDateString("fr-CA")}`}
                      </p>
                    </div>
                    <StatusBadge label={labelFor(s.status)} tone={toneFor(s.status)} />
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </section>

            {/* ---------- Site sélectionné (si réellement enregistré) ---------- */}
            {chantier.submissions.some((s) => s.selectedSiteLabel) && (
              <section aria-labelledby="chantier-sites">
                <h2 className="mb-3 font-display text-lg font-bold">Sites</h2>
                <div className="space-y-2.5">
                  {chantier.submissions
                    .filter((s) => s.selectedSiteLabel)
                    .map((s) => (
                      <div key={s.id} className="rounded-2xl border border-border bg-card p-4">
                        <p className="font-display text-sm font-bold">{s.selectedSiteLabel}</p>
                        {s.selectedSiteAddress && (
                          <p className="font-body text-xs text-muted-foreground">{s.selectedSiteAddress}</p>
                        )}
                        {s.distanceKm != null && (
                          <p className="mt-1 font-body text-xs text-muted-foreground">
                            {s.distanceKm.toFixed(1)} km du chantier
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              </section>
            )}

            {/* ---------- Chronologie (événements réels uniquement) ---------- */}
            <section aria-labelledby="chantier-activite">
              <h2 className="mb-3 font-display text-lg font-bold">Activité</h2>
              <ol className="space-y-0">
                {chantier.submissions
                  .slice()
                  .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
                  .map((s) => (
                    <li key={`ev-${s.id}`} className="relative flex gap-3 pb-5">
                      <div className="flex flex-col items-center">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        <span className="mt-1 w-px flex-1 bg-border" />
                      </div>
                      <div className="min-w-0 pb-1">
                        <p className="font-display text-sm font-semibold">Demande créée</p>
                        <p className="font-body text-xs text-muted-foreground">
                          {s.createdAt
                            ? new Date(s.createdAt).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" })
                            : "Date à confirmer"}
                        </p>
                      </div>
                    </li>
                  ))}
                {chantier.submissions
                  .filter((s) => s.siteValidatedAt)
                  .map((s) => (
                    <li key={`val-${s.id}`} className="relative flex gap-3 pb-5">
                      <div className="flex flex-col items-center">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        <span className="mt-1 w-px flex-1 bg-border" />
                      </div>
                      <div className="min-w-0 pb-1">
                        <p className="font-display text-sm font-semibold">Site validé</p>
                        <p className="font-body text-xs text-muted-foreground">
                          {new Date(s.siteValidatedAt as string).toLocaleString("fr-CA", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                    </li>
                  ))}
                <li className="flex gap-3">
                  <Clock className="h-5 w-5 text-amber-500" />
                  <div>
                    <p className="font-display text-sm font-semibold">Suivi en cours</p>
                    <p className="font-body text-xs text-muted-foreground">Les prochaines étapes apparaîtront ici.</p>
                  </div>
                </li>
              </ol>
            </section>
          </>
        )}
      </div>
    </EntrepreneurAppShell>
  );
}

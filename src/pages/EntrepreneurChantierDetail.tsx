// ============================================================
// DOSSIER CHANTIER — le centre de l'application.
// Statut · Demandes · Sites · Transports · Activité, puis les actions.
// Données : vue calculée existante (aucune nouvelle structure, lecture seule).
// ============================================================
import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  SectionHeader,
  StatusBadge,
} from "@/components/entrepreneur-app/AppStates";
import {
  AppCard,
  QuickActions,
  RequestCard,
  Timeline,
  type TimelineEvent,
} from "@/components/entrepreneur-app/ui";
import { useEntrepreneurData } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import {
  prefillFromChantier,
  saveActiveChantier,
  toActiveChantier,
} from "@/lib/entrepreneur-app/chantier-context";
import { buildHandoff, saveHandoff } from "@/lib/parcours/handoff";
import { Plus, Map as MapIcon, Truck, Scale, MapPin } from "lucide-react";

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

const dt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : null;

export default function EntrepreneurChantierDetail() {
  const { key } = useParams<{ key: string }>();
  const decoded = key ? decodeURIComponent(key) : "";
  const { loading, error, chantiers, refresh } = useEntrepreneurData();
  const chantier = useMemo(() => chantiers.find((c) => c.key === decoded), [chantiers, decoded]);
  const navigate = useNavigate();

  const active = useMemo(() => (chantier ? toActiveChantier(chantier) : null), [chantier]);

  // Le chantier ouvert devient le contexte actif : carte, comparateur et
  // formulaire de demande le reprennent sans aucune ressaisie.
  useEffect(() => {
    if (active) saveActiveChantier(active);
  }, [active]);

  const goNewRequest = () => {
    if (!active) return navigate("/demande-transport");
    navigate("/demande-transport", { state: { vqPrefill: prefillFromChantier(active) } });
  };

  const goComparateur = () => {
    if (active) {
      saveHandoff(
        buildHandoff({
          submissionId: active.submissionId,
          address: active.address ?? active.city ?? "",
          lat: active.coords?.lat ?? null,
          lng: active.coords?.lng ?? null,
          materials: active.material ? [active.material] : [],
          quantityLabel: active.quantity ?? "",
        }),
      );
    }
    navigate("/entrepreneur/comparateur");
  };

  // Statut global du chantier : dérivé des demandes réelles, jamais inventé.
  const globalStatus = useMemo(() => {
    if (!chantier) return { label: "—", tone: "neutral" as const };
    const st = chantier.submissions.map((s) => s.status ?? "");
    if (st.some((s) => ["acceptee", "planifiee", "en_cours"].includes(s)))
      return { label: "En cours", tone: "active" as const };
    if (st.length && st.every((s) => ["terminee", "annulee", "refusee"].includes(s)))
      return { label: "Terminé", tone: "done" as const };
    return { label: "En traitement", tone: "pending" as const };
  }, [chantier]);

  const events: TimelineEvent[] = useMemo(() => {
    if (!chantier) return [];
    const list: { at: string; ev: TimelineEvent }[] = [];
    for (const s of chantier.submissions) {
      if (s.createdAt) {
        list.push({
          at: s.createdAt,
          ev: {
            id: `ev-${s.id}`,
            title: s.material ? `Demande créée — ${s.material}` : "Demande créée",
            detail: dt(s.createdAt),
            done: true,
          },
        });
      }
      if (s.selectionUpdatedAt && s.selectedSiteLabel) {
        list.push({
          at: s.selectionUpdatedAt,
          ev: {
            id: `sel-${s.id}`,
            title: `Site choisi — ${s.selectedSiteLabel}`,
            detail: dt(s.selectionUpdatedAt),
            done: true,
          },
        });
      }
      if (s.siteValidatedAt) {
        list.push({
          at: s.siteValidatedAt,
          ev: { id: `val-${s.id}`, title: "Site validé", detail: dt(s.siteValidatedAt), done: true },
        });
      }
    }
    list.sort((a, b) => a.at.localeCompare(b.at));
    const out = list.map((l) => l.ev);
    if (globalStatus.tone !== "done") {
      out.push({
        id: "next",
        title: "Suivi en cours",
        detail: "Les prochaines étapes apparaîtront ici.",
        done: false,
      });
    }
    return out;
  }, [chantier, globalStatus]);

  return (
    <EntrepreneurAppShell
      title={chantier?.label ?? "Chantier"}
      subtitle={chantier?.address ?? chantier?.city ?? undefined}
      backTo="/entrepreneur/chantiers"
    >
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-5 space-y-7">
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
            <AppCard accent="primary">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <MapPin className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-bold">{chantier.label}</p>
                  <p className="truncate font-body text-xs text-muted-foreground">
                    {chantier.submissions.length} demande{chantier.submissions.length > 1 ? "s" : ""}
                    {chantier.materials.length > 0 && ` · ${chantier.materials.slice(0, 2).join(", ")}`}
                  </p>
                </div>
                <StatusBadge label={globalStatus.label} tone={globalStatus.tone} />
              </div>
            </AppCard>

            {/* ---------- Actions du chantier ---------- */}
            <QuickActions
              actions={[
                { label: "Nouvelle demande", icon: Plus, onClick: goNewRequest, primary: true },
                { label: "Trouver une dompe", icon: MapIcon, to: "/entrepreneur/carte" },
                { label: "Comparer les sites", icon: Scale, onClick: goComparateur },
                { label: "Suivre le transport", icon: Truck, to: "/entrepreneur/demandes" },
              ]}
            />

            {/* ---------- Demandes ---------- */}
            <section aria-labelledby="chantier-demandes">
              <SectionHeader title={`Demandes (${chantier.submissions.length})`} />
              <div className="space-y-2.5">
                {chantier.submissions.map((s) => (
                  <RequestCard
                    key={s.id}
                    to="/entrepreneur/demandes"
                    kind="materiau"
                    title={`${s.material ?? "Demande de matériau"}${s.number ? ` · #${s.number}` : ""}`}
                    place={s.location ?? chantier.label}
                    footer={`${s.quantity ?? "Quantité à confirmer"}${
                      s.createdAt ? ` · ${new Date(s.createdAt).toLocaleDateString("fr-CA")}` : ""
                    }`}
                    nextAction={
                      s.selectedSiteId && !s.siteValidatedAt ? "Valider le site proposé" : "Suivre la demande"
                    }
                    badge={{ label: labelFor(s.status), tone: toneFor(s.status) }}
                  />
                ))}
              </div>
            </section>

            {/* ---------- Sites réellement enregistrés ---------- */}
            {chantier.submissions.some((s) => s.selectedSiteLabel) && (
              <section aria-labelledby="chantier-sites">
                <SectionHeader title="Sites choisis" />
                <div className="space-y-2.5">
                  {chantier.submissions
                    .filter((s) => s.selectedSiteLabel)
                    .map((s) => (
                      <AppCard key={`site-${s.id}`}>
                        <p className="font-display text-sm font-bold">{s.selectedSiteLabel}</p>
                        {s.selectedSiteAddress && (
                          <p className="font-body text-xs text-muted-foreground">{s.selectedSiteAddress}</p>
                        )}
                        <p className="mt-1 font-body text-xs text-muted-foreground">
                          {s.distanceKm != null ? `${s.distanceKm.toFixed(1)} km du chantier` : "Distance à confirmer"}
                          {s.siteValidatedAt ? " · Validé" : " · En attente de validation"}
                        </p>
                      </AppCard>
                    ))}
                </div>
              </section>
            )}

            {/* ---------- Activité ---------- */}
            <section aria-labelledby="chantier-activite">
              <SectionHeader title="Activité" />
              <Timeline events={events} />
            </section>
          </>
        )}
      </div>
    </EntrepreneurAppShell>
  );
}

// ============================================================
// ACCUEIL de l'espace entrepreneur — un écran court, orienté action.
// Priorité : que dois-je faire maintenant ?
// ============================================================
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  SectionHeader,
  StatusBadge,
} from "@/components/entrepreneur-app/AppStates";
import { ChantierCard, ChantierContextBar, QuickActions } from "@/components/entrepreneur-app/ui";
import {
  loadActiveChantier,
  saveActiveChantier,
  type ActiveChantier,
} from "@/lib/entrepreneur-app/chantier-context";
import { useEntrepreneurData } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import { useEntrepreneurProfile } from "@/hooks/useEntrepreneurProfile";
import {
  Plus,
  Map as MapIcon,
  Truck,
  ArrowRight,
  Clock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
} from "lucide-react";

const statusMeta = (status: string | null): { label: string; tone: "pending" | "active" | "done" | "refused" | "neutral" } => {
  switch (status) {
    case "acceptee":
    case "planifiee":
    case "en_cours":
      return { label: "En cours", tone: "active" };
    case "terminee":
      return { label: "Terminée", tone: "done" };
    case "refusee":
    case "annulee":
      return { label: status === "refusee" ? "Refusée" : "Annulée", tone: "refused" };
    case "soumission_envoyee":
    case "en_attente_proprietaire":
      return { label: "En attente", tone: "pending" };
    default:
      return { label: "Nouvelle", tone: "pending" };
  }
};

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-CA", { day: "numeric", month: "short" })
    : null;

export default function EntrepreneurDashboard() {
  const { profile } = useEntrepreneurProfile();
  const { loading, error, submissions, chantiers, accessRequests, counts, refresh } = useEntrepreneurData();

  const firstName =
    profile?.contact_name?.split(" ")[0] || profile?.name?.split(" ")[0] || "";

  // « À faire » : uniquement ce qui attend réellement l'entrepreneur.
  const todo: { id: string; title: string; detail: string; to: string }[] = [];
  for (const r of accessRequests) {
    if (["nouvelle", "en_analyse"].includes(r.status)) {
      todo.push({
        id: r.id,
        title: "Demande d'accès en traitement",
        detail: `Créée le ${fmtDate(r.created_at) ?? "—"}`,
        to: "/entrepreneur/demandes",
      });
    }
  }
  for (const s of submissions) {
    if (s.selectedSiteId && !s.siteValidatedAt) {
      todo.push({
        id: s.id,
        title: "Un site attend votre validation",
        detail: s.selectedSiteLabel ?? s.location ?? "Site sélectionné",
        to: "/entrepreneur/demandes",
      });
    }
  }

  // Activité récente : 5 derniers événements réels (demandes + accès).
  const recent = [
    ...submissions.map((s) => ({
      id: `s-${s.id}`,
      title: s.material ? `Demande — ${s.material}` : "Demande envoyée",
      detail: s.location ?? "Lieu à confirmer",
      at: s.createdAt,
      to: "/entrepreneur/demandes",
      icon: ClipboardList,
    })),
    ...accessRequests.map((r) => ({
      id: `r-${r.id}`,
      title: "Demande d'accès à une dompe",
      detail: statusMeta(r.status).label,
      at: r.created_at,
      to: "/entrepreneur/demandes",
      icon: Truck,
    })),
  ]
    .filter((e) => e.at)
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    .slice(0, 5);

  return (
    <EntrepreneurAppShell title={`Bonjour${firstName ? ` ${firstName}` : ""}`} subtitle="Voici ce qui se passe aujourd'hui" showFab>
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-5 space-y-8">
        {/* ---------- Chantier actif : on reprend là où on était ---------- */}
        {active && (
          <ChantierContextBar
            label={active.label}
            detail={active.material ?? active.address}
            to={`/entrepreneur/chantiers/${encodeURIComponent(active.key)}`}
            onClear={() => { saveActiveChantier(null); setActive(null); }}
          />
        )}

        {/* ---------- Actions rapides ---------- */}
        <QuickActions
          actions={[
            { label: "Nouvelle demande", icon: Plus, to: "/demande-transport", primary: true },
            { label: "Trouver une dompe", icon: MapIcon, to: "/entrepreneur/carte" },
            { label: "Mes transports", icon: Truck, to: "/entrepreneur/demandes" },
          ]}
        />

        {loading ? (
          <LoadingSkeleton lines={3} />
        ) : error ? (
          <ErrorState onRetry={refresh} />
        ) : (
          <>
            {/* ---------- À faire ---------- */}
            {todo.length > 0 && (
              <section aria-labelledby="a-faire">
                <SectionHeader
                  title={
                    <span className="flex items-center gap-2">
                      À faire
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-display font-bold text-amber-600 dark:text-amber-400">
                        {todo.length}
                      </span>
                    </span>
                  }
                />
                <div className="space-y-2.5">
                  {todo.slice(0, 4).map((t) => (
                    <Link
                      key={t.id}
                      to={t.to}
                      className="flex items-center gap-3 rounded-2xl border-l-4 border-l-amber-500 border border-border bg-card p-4 active:scale-[0.99] transition-transform"
                    >
                      <Clock className="h-5 w-5 shrink-0 text-amber-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-sm font-bold">{t.title}</p>
                        <p className="truncate font-body text-xs text-muted-foreground">{t.detail}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* ---------- Mes chantiers ---------- */}
            <section aria-labelledby="mes-chantiers">
              <SectionHeader
                title="Mes chantiers"
                action={
                  chantiers.length > 0 && (
                    <Link to="/entrepreneur/chantiers" className="inline-flex items-center gap-1 font-display text-sm font-semibold text-primary">
                      Tout voir <ArrowRight className="h-4 w-4" />
                    </Link>
                  )
                }
              />
              {chantiers.length === 0 ? (
                <EmptyState
                  title="Aucun chantier pour l'instant"
                  message="Vos chantiers apparaîtront ici dès votre première demande."
                  actionLabel="Créer ma première demande"
                  actionTo="/demande-transport"
                />
              ) : (
                <div className="space-y-2.5">
                  {chantiers.slice(0, 3).map((c) => (
                    <ChantierCard
                      key={c.key}
                      to={`/entrepreneur/chantiers/${encodeURIComponent(c.key)}`}
                      label={c.label}
                      detail={`${c.submissions.length} demande${c.submissions.length > 1 ? "s" : ""}${
                        c.materials.length > 0 ? ` · ${c.materials.slice(0, 2).join(", ")}` : ""
                      }`}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* ---------- Activité récente ---------- */}
            <section aria-labelledby="activite-recente">
              <SectionHeader title="Activité récente" />
              {recent.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border bg-card/60 p-5 text-center font-body text-sm text-muted-foreground">
                  Aucune activité récente. Tout est calme.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {recent.map((e) => (
                    <Link
                      key={e.id}
                      to={e.to}
                      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 active:scale-[0.99] transition-transform"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                        <e.icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-sm font-semibold">{e.title}</p>
                        <p className="truncate font-body text-xs text-muted-foreground">
                          {fmtDate(e.at)} · {e.detail}
                        </p>
                      </div>
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {/* ---------- Compteurs discrets ---------- */}
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: "En attente", value: counts.pending, cls: "text-amber-600 dark:text-amber-400" },
                { label: "Acceptées", value: counts.accepted, cls: "text-emerald-600 dark:text-emerald-400" },
                { label: "Terminées", value: counts.completed, cls: "text-blue-600 dark:text-blue-400" },
                { label: "Refusées", value: counts.refused, cls: "text-destructive" },
              ].map((s) => (
                <Link key={s.label} to="/entrepreneur/demandes" className="rounded-2xl border border-border bg-card py-3">
                  <p className={`font-display text-xl font-bold ${s.cls}`}>{s.value}</p>
                  <p className="font-body text-[10px] text-muted-foreground">{s.label}</p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </EntrepreneurAppShell>
  );
}

// Référence conservée pour les imports existants.
export { StatusBadge };

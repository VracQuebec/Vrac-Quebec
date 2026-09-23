// ============================================================
// DOSSIER CHANTIER — le centre de l'application.
// Onglets : Aperçu · Demandes · Sites · Transports · Activité.
// Sur iPad/ordinateur : navigation de dossier + panneau détail.
// Données : vue calculée existante (aucune nouvelle structure, lecture seule).
// ============================================================
import { useEffect, useMemo, useState } from "react";
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
  AppTabs,
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
import { Plus, Map as MapIcon, Truck, Scale, MapPin, CalendarDays, Package } from "lucide-react";

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

const norm = (v: string | null | undefined) =>
  (v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

type TabId = "apercu" | "demandes" | "sites" | "transports" | "activite";

export default function EntrepreneurChantierDetail() {
  const { key } = useParams<{ key: string }>();
  const decoded = key ? decodeURIComponent(key) : "";
  const { loading, error, chantiers, accessRequests, refresh } = useEntrepreneurData();
  const chantier = useMemo(() => chantiers.find((c) => c.key === decoded), [chantiers, decoded]);
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>("apercu");

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

  // Transports déjà enregistrés rattachés à ce chantier (rapprochement par lieu).
  const transports = useMemo(() => {
    if (!chantier) return [];
    const city = norm(chantier.city);
    const addr = norm(chantier.address);
    return accessRequests.filter((r) => {
      const rCity = norm(r.site_city as string | null);
      const rAddr = norm(r.site_address as string | null);
      if (addr && rAddr && rAddr === addr) return true;
      const sameCity = Boolean(city) && rCity === city;
      const cityIsUnique = chantiers.filter((item) => norm(item.city) === city).length === 1;
      return sameCity && cityIsUnique;
    });
  }, [chantier, accessRequests, chantiers]);

  const sites = useMemo(
    () => (chantier ? chantier.submissions.filter((s) => s.selectedSiteLabel) : []),
    [chantier],
  );

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

  const nextStep = useMemo(() => {
    if (!chantier) return null;
    const waiting = chantier.submissions.find((s) => s.selectedSiteId && !s.siteValidatedAt);
    if (waiting) return "Un site attend votre validation.";
    if (sites.length === 0) return "Choisissez une dompe pour ce chantier.";
    if (transports.length === 0) return "Demandez un transport vers le site choisi.";
    return "Suivez vos transports en cours.";
  }, [chantier, sites.length, transports.length]);

  const tabs = [
    { id: "apercu", label: "Aperçu" },
    { id: "demandes", label: "Demandes", count: chantier?.submissions.length ?? 0 },
    { id: "sites", label: "Dompe", count: sites.length },
    { id: "transports", label: "Transports", count: transports.length },
    { id: "activite", label: "Activité" },
  ];

  const sectionDemandes = chantier && (
    <div className="space-y-2.5">
      {chantier.submissions.map((s) => (
        <RequestCard
          key={s.id}
          to={`/entrepreneur/demandes/s-${s.id}`}
          kind="materiau"
          title={`${s.material ?? "Demande de matériau"}${s.number ? ` · #${s.number}` : ""}`}
          place={s.location ?? chantier.label}
          footer={`${s.quantity ?? "Quantité à confirmer"}${
            s.createdAt ? ` · ${new Date(s.createdAt).toLocaleDateString("fr-CA")}` : ""
          }`}
          nextAction={s.selectedSiteId && !s.siteValidatedAt ? "Valider le site proposé" : "Suivre la demande"}
          badge={{ label: labelFor(s.status), tone: toneFor(s.status) }}
        />
      ))}
    </div>
  );

  const sectionSites =
    sites.length === 0 ? (
      <EmptyState
        title="Aucune dompe choisie"
        message="Ouvrez la carte pour choisir une dompe pour ce chantier."
        actionLabel="Trouver une dompe"
        actionTo="/entrepreneur/carte"
      />
    ) : (
      <div className="space-y-2.5">
        {sites.map((s) => (
          <AppCard key={`site-${s.id}`}>
            <p className="font-display text-sm font-bold">{s.selectedSiteLabel}</p>
            {/* Divulgation progressive : l'adresse réelle n'est transmise par le
                serveur qu'une fois CETTE demande approuvée. */}
            {s.siteValidatedAt && s.selectedSiteAddress ? (
              <p className="font-body text-xs text-muted-foreground">{s.selectedSiteAddress}</p>
            ) : (
              <p className="font-body text-xs text-muted-foreground">
                Adresse exacte communiquée après l'approbation de votre demande.
              </p>
            )}
            <p className="mt-1 font-body text-xs text-muted-foreground">
              {s.distanceKm != null ? `${s.distanceKm.toFixed(1)} km du chantier` : "Distance à confirmer"}
              {s.siteValidatedAt ? " · Validé" : " · En attente de validation"}
            </p>
          </AppCard>
        ))}
      </div>
    );

  const sectionTransports =
    transports.length === 0 ? (
      <EmptyState
        title="Aucun transport pour ce chantier"
        message="Après avoir choisi une dompe, demandez un transport en quelques secondes."
        actionLabel="Demander un transport"
        actionTo="/demande-transport"
      />
    ) : (
      <div className="space-y-2.5">
        {transports.map((r) => (
          <AppCard key={`tr-${r.id}`} to={`/entrepreneur/demandes/r-${String(r.id)}`}>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Truck className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-bold">
                  Transport{r.request_number ? ` #${r.request_number}` : ""}
                </p>
                <p className="truncate font-body text-xs text-muted-foreground">
                  {(r.material_type as string | null) ?? "Matériau à confirmer"}
                  {r.created_at ? ` · ${new Date(r.created_at as string).toLocaleDateString("fr-CA")}` : ""}
                </p>
              </div>
              <StatusBadge label={labelFor(r.status)} tone={toneFor(r.status)} />
            </div>
          </AppCard>
        ))}
      </div>
    );

  const sectionApercu = chantier && (
    <div className="space-y-5">
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
        {nextStep && (
          <p className="mt-3 border-t border-border/60 pt-3 font-display text-xs font-semibold text-primary">
            Prochaine étape : {nextStep}
          </p>
        )}
      </AppCard>

      <dl className="grid grid-cols-2 gap-x-4 border-y border-border py-1 sm:grid-cols-4">
        <div className="flex min-w-0 gap-2 py-3"><Package className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><dt className="font-body text-[10px] uppercase text-muted-foreground">Matériau</dt><dd className="truncate font-display text-sm font-semibold">{chantier.materials[0] || "À confirmer"}</dd></div></div>
        <div className="flex min-w-0 gap-2 py-3"><Scale className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><dt className="font-body text-[10px] uppercase text-muted-foreground">Quantité</dt><dd className="truncate font-display text-sm font-semibold">{chantier.submissions[0]?.quantity || "À confirmer"}</dd></div></div>
        <div className="flex min-w-0 gap-2 py-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><dt className="font-body text-[10px] uppercase text-muted-foreground">Zone</dt><dd className="truncate font-display text-sm font-semibold">{chantier.city || chantier.label}</dd></div></div>
        <div className="flex min-w-0 gap-2 py-3"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><dt className="font-body text-[10px] uppercase text-muted-foreground">Créé</dt><dd className="truncate font-display text-sm font-semibold">{chantier.submissions[0]?.createdAt ? new Date(chantier.submissions[0].createdAt).toLocaleDateString("fr-CA") : "À confirmer"}</dd></div></div>
      </dl>

      <div className="grid gap-2.5 sm:grid-cols-3">
        <AppCard onClick={() => setTab("demandes")}>
          <p className="font-display text-xl font-bold">{chantier.submissions.length}</p>
          <p className="font-body text-xs text-muted-foreground">Demandes</p>
        </AppCard>
        <AppCard onClick={() => setTab("sites")}>
          <p className="font-display text-xl font-bold">{sites.length}</p>
          <p className="font-body text-xs text-muted-foreground">Dompes choisies</p>
        </AppCard>
        <AppCard onClick={() => setTab("transports")}>
          <p className="font-display text-xl font-bold">{transports.length}</p>
          <p className="font-body text-xs text-muted-foreground">Transports</p>
        </AppCard>
      </div>
    </div>
  );

  const content: Record<TabId, React.ReactNode> = {
    apercu: sectionApercu,
    demandes: sectionDemandes,
    sites: sectionSites,
    transports: sectionTransports,
    activite: <Timeline events={events} />,
  };

  return (
    <EntrepreneurAppShell
      title={chantier?.label ?? "Chantier"}
      subtitle={chantier?.address ?? chantier?.city ?? undefined}
      backTo="/entrepreneur/chantiers"
    >
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-5 space-y-5">
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
            {/* Action principale toujours visible, au-dessus des onglets. */}
            <QuickActions
              actions={[
                { label: "Trouver une dompe", icon: MapIcon, to: "/entrepreneur/carte", primary: true },
                { label: "Nouvelle demande", icon: Plus, onClick: goNewRequest },
                { label: "Comparer", icon: Scale, onClick: goComparateur },
                { label: "Transports", icon: Truck, onClick: () => setTab("transports") },
              ]}
            />

            <AppTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} />

            {/* Téléphone : une seule section visible.
                iPad/ordinateur : section active + résumé permanent du dossier. */}
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6 lg:items-start">
              <div
                key={tab}
                role="tabpanel"
                className="animate-in fade-in duration-150 min-w-0 space-y-4"
              >
                {tab !== "apercu" && (
                  <SectionHeader title={tabs.find((t) => t.id === tab)?.label ?? ""} />
                )}
                {content[tab]}
              </div>

              <aside className="hidden lg:block space-y-4">
                <SectionHeader title="Le chantier" />
                <AppCard>
                  <p className="font-display text-sm font-bold">{chantier.label}</p>
                  {chantier.address && (
                    <p className="font-body text-xs text-muted-foreground">{chantier.address}</p>
                  )}
                  <p className="mt-2 font-body text-xs text-muted-foreground">
                    {chantier.submissions.length} demande{chantier.submissions.length > 1 ? "s" : ""} ·{" "}
                    {sites.length} dompe{sites.length > 1 ? "s" : ""} · {transports.length} transport
                    {transports.length > 1 ? "s" : ""}
                  </p>
                  {nextStep && (
                    <p className="mt-3 border-t border-border/60 pt-3 font-display text-xs font-semibold text-primary">
                      {nextStep}
                    </p>
                  )}
                </AppCard>
                <SectionHeader title="Activité" />
                <Timeline events={events.slice(-4)} />
              </aside>
            </div>
          </>
        )}
      </div>
    </EntrepreneurAppShell>
  );
}

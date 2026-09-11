// ============================================================
// MES DEMANDES — une seule liste, types clairement distingués.
// Deux circuits techniques existants, une seule présentation :
//   « Demande de matériau » (soumission initiale)
//   « Demande d'accès à une dompe » (avec estimation transport)
// Chaque carte : chantier, type, statut, date, prochaine action.
// ============================================================
import { useMemo, useState } from "react";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "@/components/entrepreneur-app/AppStates";
import { RequestCard } from "@/components/entrepreneur-app/ui";
import { useEntrepreneurData } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import { statusMeta, statusBucket } from "@/lib/access-requests/status";
import { formatCad } from "@/lib/transport/pricing";

const FILTERS = [
  { key: "all", label: "Toutes" },
  { key: "active", label: "En cours" },
  { key: "pending", label: "En attente" },
  { key: "done", label: "Terminées" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

interface UnifiedRequest {
  id: string;
  type: "matériau" | "accès";
  title: string;
  chantier: string;
  statusLabel: string;
  tone: "pending" | "active" | "done" | "refused" | "neutral";
  bucket: "pending" | "accepted" | "completed" | "refused";
  date: string | null;
  nextAction: string;
  price?: string | null;
  chantierKey?: string | null;
}

export default function EntrepreneurDemandes() {
  const { loading, error, submissions, chantiers, accessRequests, refresh } = useEntrepreneurData();
  const [filter, setFilter] = useState<FilterKey>("all");

  const chantierBySubmission = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of chantiers) for (const s of c.submissions) map.set(s.id, c.key);
    return map;
  }, [chantiers]);

  const list = useMemo<UnifiedRequest[]>(() => {
    const fromSubs: UnifiedRequest[] = submissions.map((s) => {
      const needsValidation = Boolean(s.selectedSiteId && !s.siteValidatedAt);
      const done = ["terminee", "annulee", "refusee"].includes(s.status ?? "");
      return {
        id: `s-${s.id}`,
        type: "matériau",
        title: s.material ? `${s.material}${s.quantity ? ` — ${s.quantity}` : ""}` : "Demande de matériau",
        chantier: s.location ?? "Lieu à confirmer",
        statusLabel: needsValidation ? "Site à valider" : done ? "Terminée" : "En cours",
        tone: needsValidation ? "pending" : done ? "done" : "active",
        bucket: needsValidation ? "pending" : done ? "completed" : "accepted",
        date: s.createdAt,
        nextAction: needsValidation ? "Valider le site proposé" : done ? "Consulter" : "Suivre la demande",
        chantierKey: chantierBySubmission.get(s.id) ?? null,
      };
    });
    const fromAccess: UnifiedRequest[] = accessRequests.map((r) => {
      const meta = statusMeta(String(r.status));
      const bucket = statusBucket(String(r.status));
      const addr = [r.site_city, r.site_address].filter(Boolean).join(" — ");
      return {
        id: `r-${String(r.id)}`,
        type: "accès",
        title: `${String(r.material_type ?? "Matériau")}${r.request_number ? ` · ${r.request_number}` : ""}`,
        chantier: addr || "Lieu à confirmer",
        statusLabel: meta.label,
        tone:
          bucket === "accepted"
            ? "active"
            : bucket === "completed"
              ? "done"
              : bucket === "refused"
                ? "refused"
                : "pending",
        bucket,
        date: (r.created_at as string | null) ?? null,
        nextAction:
          bucket === "pending"
            ? "En traitement par notre équipe"
            : bucket === "accepted"
              ? "Transport à planifier"
              : "Consulter",
        price:
          r.transport_total != null
            ? `Transport : ${formatCad(Number(r.transport_total))} taxes incl.`
            : r.transport_subtotal != null
              ? `Transport : ${formatCad(Number(r.transport_subtotal))} + taxes`
              : null,
      };
    });
    return [...fromAccess, ...fromSubs].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }, [submissions, accessRequests, chantierBySubmission]);

  const visible = list.filter((r) => {
    if (filter === "all") return true;
    if (filter === "pending") return r.bucket === "pending";
    if (filter === "active") return r.bucket === "accepted";
    return r.bucket === "completed" || r.bucket === "refused";
  });

  return (
    <EntrepreneurAppShell title="Demandes" backTo={null} showFab>
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-5 space-y-4">
        {/* Mêmes onglets tactiles que le dossier chantier : cohérence totale. */}
        <AppTabs
          tabs={FILTERS.map((f) => ({
            id: f.key,
            label: f.label,
            count:
              f.key === "all"
                ? list.length
                : list.filter((r) =>
                    f.key === "pending"
                      ? r.bucket === "pending"
                      : f.key === "active"
                        ? r.bucket === "accepted"
                        : r.bucket === "completed" || r.bucket === "refused",
                  ).length,
          }))}
          value={filter}
          onChange={(id) => setFilter(id as FilterKey)}
        />

        {loading ? (
          <LoadingSkeleton lines={4} />
        ) : error ? (
          <ErrorState onRetry={refresh} />
        ) : visible.length === 0 ? (
          <EmptyState
            title={list.length === 0 ? "Aucune demande pour l'instant" : "Aucune demande dans ce filtre"}
            message={
              list.length === 0
                ? "Créez votre première demande : elle apparaîtra ici avec son suivi."
                : "Essayez un autre filtre."
            }
            actionLabel={list.length === 0 ? "Nouvelle demande" : undefined}
            actionTo={list.length === 0 ? "/demande-transport" : undefined}
          />
        ) : (
          <div className="space-y-2.5">
            {visible.map((r) => (
              <RequestCard
                key={r.id}
                to={
                  r.chantierKey
                    ? `/entrepreneur/chantiers/${encodeURIComponent(r.chantierKey)}`
                    : "/entrepreneur/demandes"
                }
                kind={r.type === "accès" ? "acces" : "materiau"}
                title={r.title}
                place={r.chantier}
                footer={`${r.type === "accès" ? "Demande d'accès à une dompe" : "Demande de matériau"}${
                  r.date ? ` · ${new Date(r.date).toLocaleDateString("fr-CA")}` : ""
                }${r.price ? ` · ${r.price}` : ""}`}
                nextAction={r.nextAction}
                badge={{ label: r.statusLabel, tone: r.tone }}
              />
            ))}
          </div>
        )}
      </div>
    </EntrepreneurAppShell>
  );
}

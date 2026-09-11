// ============================================================
// MES DEMANDES — une seule liste, types clairement distingués.
// Deux circuits techniques existants, une seule présentation :
//   « Demande de matériau » (soumission initiale)
//   « Demande d'accès à une dompe » (avec estimation transport)
// Chaque carte : chantier, type, statut, date, prochaine action.
// ============================================================
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  StatusBadge,
} from "@/components/entrepreneur-app/AppStates";
import { useEntrepreneurData } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import { statusMeta, statusBucket } from "@/lib/access-requests/status";
import { formatCad } from "@/lib/transport/pricing";
import { ClipboardList, Truck, MapPin, ChevronRight } from "lucide-react";

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
    <EntrepreneurAppShell title="Mes demandes" subtitle="Toutes vos demandes au même endroit" showFab>
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-5 space-y-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
          {FILTERS.map((f) => {
            const n =
              f.key === "all"
                ? list.length
                : list.filter((r) =>
                    f.key === "pending"
                      ? r.bucket === "pending"
                      : f.key === "active"
                        ? r.bucket === "accepted"
                        : r.bucket === "completed" || r.bucket === "refused",
                  ).length;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`min-h-10 shrink-0 rounded-xl px-4 font-display text-sm font-semibold transition-colors ${
                  filter === f.key ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground"
                }`}
              >
                {f.label} ({n})
              </button>
            );
          })}
        </div>

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
              <Link
                key={r.id}
                to={r.chantierKey ? `/entrepreneur/chantiers/${encodeURIComponent(r.chantierKey)}` : "/entrepreneur/demandes"}
                className="block rounded-2xl border border-border bg-card p-4 active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      r.type === "accès" ? "bg-primary/10 text-primary" : "bg-secondary text-foreground"
                    }`}
                  >
                    {r.type === "accès" ? <Truck className="h-5 w-5" /> : <ClipboardList className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-bold">{r.title}</p>
                    <p className="flex items-center gap-1 truncate font-body text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" /> {r.chantier}
                    </p>
                  </div>
                  <StatusBadge label={r.statusLabel} tone={r.tone} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                  <div className="min-w-0">
                    <p className="truncate font-body text-xs text-muted-foreground">
                      {r.type === "accès" ? "Demande d'accès à une dompe" : "Demande de matériau"}
                      {r.date && ` · ${new Date(r.date).toLocaleDateString("fr-CA")}`}
                    </p>
                    <p className="truncate font-display text-xs font-semibold text-primary">{r.nextAction}</p>
                    {r.price && <p className="truncate font-body text-xs text-muted-foreground">{r.price}</p>}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </EntrepreneurAppShell>
  );
}

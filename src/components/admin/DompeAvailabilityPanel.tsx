// Bloc « Disponibilité du remblai » — indépendant du suivi commercial (CRM).
// La disponibilité est la seule source de vérité; la fraîcheur est calculée.
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const AVAILABILITY_LABELS: Record<string, string> = {
  available: "Disponible",
  limited: "Disponibilité limitée",
  unavailable: "Indisponible",
  completed: "Terminée",
  suspended: "Suspendue",
  owner_closed: "Fermée par le propriétaire",
};

export const FRESHNESS_LABELS: Record<string, string> = {
  confirmed: "Confirmée récemment",
  aging: "Confirmation vieillissante",
  needs_revalidation: "À revalider",
  unknown: "Jamais confirmée",
};

export interface DompeAvailabilityData {
  id: string;
  availability_status?: string | null;
  availability_updated_at?: string | null;
  availability_note?: string | null;
  availability_source?: string | null;
  availability_reason?: string | null;
  revalidation_requested_at?: string | null;
  remaining_capacity?: string | null;
  opening_hours?: string | null;
  materials?: string[] | null;
  truck_types_allowed?: string[] | null;
}

/** Fraîcheur affichée côté administration (même logique que la base : dérivée de la date). */
const freshnessOf = (d: DompeAvailabilityData): string => {
  if (d.revalidation_requested_at && (!d.availability_updated_at || d.availability_updated_at < d.revalidation_requested_at)) {
    return "needs_revalidation";
  }
  if (!d.availability_updated_at) return "unknown";
  const days = (Date.now() - new Date(d.availability_updated_at).getTime()) / 86_400_000;
  if (days <= 36) return "confirmed";
  if (days <= 60) return "aging";
  return "needs_revalidation";
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-wrap gap-1 text-xs font-body">
    <span className="font-semibold text-foreground">{label} :</span>
    <span className="text-muted-foreground">{value || "—"}</span>
  </div>
);

export default function DompeAvailabilityPanel({
  data,
  onChanged,
}: {
  data: DompeAvailabilityData;
  onChanged?: () => void;
}) {
  const [row, setRow] = useState<DompeAvailabilityData>(data);
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (
    key: string,
    args: { status?: string; confirm?: boolean; revalidate?: boolean; reason?: string },
  ) => {
    setBusy(key);
    const { data: updated, error } = await supabase.rpc("set_dompe_availability", {
      _submission_id: row.id,
      _status: args.status ?? undefined,
      _confirm: args.confirm ?? false,
      _request_revalidation: args.revalidate ?? false,
      _source: "administration",
      _reason: args.reason ?? undefined,
    });
    setBusy(null);
    if (error) {
      toast.error("Mise à jour impossible : " + error.message);
      return;
    }
    if (updated) setRow({ ...row, ...(updated as unknown as DompeAvailabilityData) });
    toast.success("Disponibilité mise à jour");
    onChanged?.();
  };

  const fresh = freshnessOf(row);
  const status = row.availability_status || "available";

  const actions: { key: string; label: string; run: () => void }[] = [
    { key: "ok", label: "Confirmer disponible", run: () => act("ok", { status: "available", confirm: true, reason: "Confirmation administrateur" }) },
    { key: "limited", label: "Disponibilité limitée", run: () => act("limited", { status: "limited", confirm: true }) },
    { key: "completed", label: "Marquer terminée", run: () => act("completed", { status: "completed", confirm: true }) },
    { key: "suspended", label: "Suspendre", run: () => act("suspended", { status: "suspended", confirm: true }) },
    { key: "owner_closed", label: "Fermée par propriétaire", run: () => act("owner_closed", { status: "owner_closed", confirm: true }) },
    { key: "revalidate", label: "À revalider", run: () => act("revalidate", { revalidate: true }) },
  ];

  return (
    <div className="mb-3 rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-display text-[10px] font-bold uppercase tracking-wide text-foreground">
          Disponibilité du remblai
        </span>
        <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-body text-primary">
          {AVAILABILITY_LABELS[status] ?? status}
        </span>
        <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-body text-muted-foreground">
          {FRESHNESS_LABELS[fresh]}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <Row
          label="Dernière confirmation"
          value={row.availability_updated_at ? new Date(row.availability_updated_at).toLocaleString("fr-CA") : "Jamais confirmée"}
        />
        <Row label="Provenance de la confirmation" value={row.availability_source || "Inconnue"} />
        <Row label="Capacité connue" value={row.remaining_capacity || "Inconnue"} />
        <Row label="Horaires" value={row.opening_hours || "Inconnus"} />
        <Row label="Matériaux acceptés" value={(row.materials || []).join(", ")} />
        <Row label="Camions acceptés" value={(row.truck_types_allowed || []).join(", ")} />
        <Row label="Raison du dernier changement" value={row.availability_reason || "—"} />
        <Row label="Note de disponibilité" value={row.availability_note || "—"} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={a.run}
            disabled={busy !== null}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-display font-bold uppercase tracking-wide text-foreground disabled:opacity-50"
          >
            {busy === a.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {a.label}
          </button>
        ))}
      </div>

      <p className="mt-2 font-body text-[11px] leading-relaxed text-muted-foreground">
        Le suivi commercial et la disponibilité sont indépendants : changer le statut CRM ne modifie jamais la
        disponibilité. « À revalider » ne rend pas la demande indisponible.
      </p>
    </div>
  );
}

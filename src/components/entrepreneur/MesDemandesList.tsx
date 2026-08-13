// ============================================================
// « MES DEMANDES » — liste des demandes réellement enregistrées pour
// l'entrepreneur connecté. Lecture seule : consulter ou recharger ne
// crée jamais de demande. Chaque demande affiche SA propre demande de
// transport via le composant existant LinkedTransportCard.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ClipboardList, Loader2, MapPin, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import LinkedTransportCard from "@/components/parcours/LinkedTransportCard";
import { loadMySubmissions, type MySubmission, type MySubmissionsResult } from "@/lib/parcours/mes-demandes";
import { statusMeta } from "@/lib/access-requests/status";

const Line = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <p className="flex items-start gap-1.5 font-body text-xs text-muted-foreground">
    <span className="mt-0.5 flex-shrink-0 text-primary">{icon}</span>
    <span>
      <span className="font-semibold text-foreground">{label} : </span>
      {value}
    </span>
  </p>
);

const SubmissionCard = ({ s }: { s: MySubmission }) => {
  const meta = s.status ? statusMeta(s.status) : null;
  return (
    <article className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-display text-sm font-bold">
          Demande {s.number != null ? `#${s.number}` : `#${s.id.slice(0, 8)}`}
        </span>
        {meta ? (
          <span
            className="rounded-full px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-white"
            style={{ background: meta.color }}
          >
            {meta.label}
          </span>
        ) : (
          <span className="rounded-full border border-border px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            À confirmer
          </span>
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        <Line icon={<Package className="h-3.5 w-3.5" />} label="Matériau" value={s.material || "À confirmer"} />
        <Line icon={<ClipboardList className="h-3.5 w-3.5" />} label="Quantité" value={s.quantity || "À confirmer"} />
        <Line icon={<MapPin className="h-3.5 w-3.5" />} label="Chantier" value={s.location || "À confirmer"} />
        <Line
          icon={<CalendarDays className="h-3.5 w-3.5" />}
          label="Date"
          value={s.createdAt ? new Date(s.createdAt).toLocaleDateString("fr-CA") : "À confirmer"}
        />
        <Line
          icon={<MapPin className="h-3.5 w-3.5" />}
          label="Site sélectionné"
          value={s.selectedSiteLabel || s.selectedSiteAddress || "Aucun site sélectionné pour l'instant"}
        />
      </div>

      {/* Rattachement existant réutilisé : chaque demande affiche uniquement SA demande de transport. */}
      <LinkedTransportCard submissionId={s.id} />
    </article>
  );
};

export default function MesDemandesList() {
  const [res, setRes] = useState<MySubmissionsResult | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setRes(await loadMySubmissions());
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (loading || !res) {
    return (
      <p className="flex items-center gap-2 py-6 font-body text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement de vos demandes…
      </p>
    );
  }

  if (res.state === "unauthorized") {
    return (
      <p className="rounded-xl border border-border bg-card p-5 font-body text-sm text-muted-foreground">
        Votre compte n'a pas accès à cette liste. Connectez-vous avec votre compte entrepreneur.
      </p>
    );
  }

  if (res.state === "error") {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="font-body text-sm font-semibold text-destructive">
          Impossible d'afficher vos demandes pour le moment.
        </p>
        <Button
          variant="outline"
          onClick={() => void reload()}
          className="mt-3 h-11 font-display text-sm font-bold uppercase tracking-wide"
        >
          Réessayer
        </Button>
      </div>
    );
  }

  if (res.submissions.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center font-body text-sm text-muted-foreground">
        Vous n'avez aucune demande enregistrée pour le moment.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {res.submissions.map((s) => (
        <SubmissionCard key={s.id} s={s} />
      ))}
    </div>
  );
}

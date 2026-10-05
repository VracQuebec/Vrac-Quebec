// Nature, provenance et fiabilité d'une demande — affichage seulement.
import { AlertTriangle, Compass, Eye, FileInput } from "lucide-react";
import type { MySubmission } from "@/lib/parcours/mes-demandes";
import {
  NEED_LABELS,
  isApproximateLocation,
  needDirection,
  originDateNote,
  originLabel,
  visibilityLabel,
} from "@/lib/parcours/sens-besoin";

const Line = ({ icon, children, warn }: { icon: React.ReactNode; children: React.ReactNode; warn?: boolean }) => (
  <p className={`flex items-start gap-2 font-body text-xs ${warn ? "text-destructive" : "text-muted-foreground"}`}>
    <span className="mt-0.5 shrink-0">{icon}</span>
    <span>{children}</span>
  </p>
);

export default function SubmissionProvenance({ s, duplicates = [] }: { s: MySubmission; duplicates?: string[] }) {
  const need = needDirection(s);
  const dateNote = originDateNote(s);
  return (
    <div className="space-y-1.5" data-testid="submission-provenance">
      <p className="font-display text-sm font-bold">
        <span className={need === "a_preciser" ? "text-destructive" : "text-primary"}>{NEED_LABELS[need]}</span>
      </p>
      <Line icon={<Eye className="h-3.5 w-3.5" />}>{visibilityLabel(s.visibilityReason)}</Line>
      <Line icon={<FileInput className="h-3.5 w-3.5" />}>
        {originLabel(s)} · non rattachée à un projet de l'entreprise
      </Line>
      {dateNote && <Line icon={<AlertTriangle className="h-3.5 w-3.5" />} warn>{dateNote}</Line>}
      {isApproximateLocation(s) && (
        <Line icon={<Compass className="h-3.5 w-3.5" />} warn>
          Lieu imprécis : position approximative, à confirmer par une adresse précise ou un point.
        </Line>
      )}
      {duplicates.length > 0 && (
        <Line icon={<AlertTriangle className="h-3.5 w-3.5" />} warn>
          Doublon possible avec {duplicates.join(", ")} (même adresse et même matériau) — rien n'a été fusionné.
        </Line>
      )}
    </div>
  );
}

export const transportKindLabel = (row: Record<string, unknown>) => {
  const kind = row.request_kind === "transport" ? "Commande de transport" : "Demande d'accès à une dompe";
  const mode =
    row.transport_mode === "own_trucks"
      ? "vos propres camions"
      : row.transport_mode === "requested"
        ? "transport demandé"
        : "transport non précisé";
  return `${kind} · ${mode}`;
};

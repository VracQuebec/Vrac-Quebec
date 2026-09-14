// ============================================================
// LOT 14 — Panneau de confirmation humaine (INTERNE / ADMIN).
// Les écritures réelles ne partent QUE si qualification_writes_v2 est vrai
// (faux par défaut et en production) : sinon les boutons sont désactivés.
// Mobile d'abord : une décision par ligne, gros boutons, aucun tableau.
// ============================================================
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { AcceptanceProfile } from "@/lib/qualification/lot13";
import {
  buildBroadAcceptance, buildBulkConfirmation, buildDecisionEntry, buildQualifiedProfile,
  buildRequestConfirmation, buildRollbackEntry, completeness, fastTrack, historyOf,
  type JournalDraft, type JournalEntry,
} from "@/lib/qualification/lot14";
import { writesEnabled } from "@/lib/qualification/writes";

interface Props {
  profile: AcceptanceProfile;
  entries: JournalEntry[];
  confirmedBy: string | null;
  onCommit: (drafts: JournalDraft[]) => void;
}

function Guarded({ label, description, onConfirm, disabled }: {
  label: string; description: string; onConfirm: () => void; disabled: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" className="h-10 w-full sm:w-auto" disabled={disabled}>{label}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirmer</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function QualificationDecisionPanel({ profile, entries, confirmedBy, onCommit }: Props) {
  const [showHistory, setShowHistory] = useState(false);
  const canWrite = writesEnabled() && !!confirmedBy;
  const author = useMemo(() => ({ confirmedBy: confirmedBy ?? "inconnu" }), [confirmedBy]);

  const qualified = useMemo(() => buildQualifiedProfile(profile, entries), [profile, entries]);
  const ft = useMemo(() => fastTrack(qualified), [qualified]);
  const score = useMemo(() => completeness(qualified), [qualified]);
  const mine = useMemo(
    () => entries.filter((e) => e.submissionId === profile.submissionId).slice().reverse(),
    [entries, profile.submissionId],
  );

  const decide = (subject: string, decision: "ACCEPTED" | "REFUSED" | "UNKNOWN") =>
    onCommit([buildDecisionEntry({
      submissionId: profile.submissionId, category: "material", subject, decision,
      proposedValue: "UNKNOWN", confirmedValue: decision,
      originalText: profile.originalText, author,
    })]);

  const lastSubject = mine[0];

  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant={score.essentialComplete ? "default" : "outline"}>
          Qualification {score.score} %
        </Badge>
        <Badge variant="outline">Essentiel complété : {score.essentialComplete ? "OUI" : "NON"}</Badge>
        <Badge variant="outline">Décisions au journal : {qualified.journalSize}</Badge>
        {!canWrite && <span className="text-muted-foreground">Écritures désactivées (qualification_writes_v2 = FALSE)</span>}
      </div>

      {score.missing.length > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground">Manquant : {score.missing.join(", ")}</p>
      )}

      {ft.certain.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold">Propositions certaines</p>
          <div className="flex flex-wrap gap-1">
            {ft.certain.map((m) => (
              <Badge key={m.materialKey} variant={m.status === "REFUSED" ? "destructive" : "default"} className="text-[10px]">
                {m.status === "REFUSED" ? "✕" : "✓"} {m.label}
              </Badge>
            ))}
          </div>
          <Guarded
            label="Confirmer les propositions certaines"
            description={`${ft.certain.length} décision(s) seront ajoutées au journal. Rien n'est écrasé : chaque décision reste corrigeable.`}
            disabled={!canWrite}
            onConfirm={() => onCommit(buildBulkConfirmation(profile, qualified, author))}
          />
        </div>
      )}

      {ft.questions.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold">Seulement les ambiguïtés</p>
          {ft.questions.map((q) => (
            <div key={q.subject} className="flex flex-col gap-2 border-t border-border pt-2 sm:flex-row sm:items-center">
              <span className="text-sm font-medium sm:w-40">{q.question}</span>
              <div className="grid grid-cols-1 gap-2 sm:flex">
                <Button size="sm" className="h-10" disabled={!canWrite} onClick={() => decide(q.subject, "ACCEPTED")}>Accepte</Button>
                <Button size="sm" variant="destructive" className="h-10" disabled={!canWrite} onClick={() => decide(q.subject, "REFUSED")}>Refuse</Button>
                <Button size="sm" variant="outline" className="h-10" disabled={!canWrite} onClick={() => decide(q.subject, "UNKNOWN")}>Je ne sais pas</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Guarded
          label="Accepte presque tout (avec exclusions)"
          description="Le mode « acceptation large » sera enregistré. Les refus explicites déjà au journal restent prioritaires."
          disabled={!canWrite}
          onConfirm={() => onCommit(buildBroadAcceptance(profile.submissionId, qualified.exclusions, author, profile.originalText))}
        />
        <Guarded
          label="Confirmer les informations de cette dompe"
          description="Enregistre une confirmation globale (auteur et date). Les informations inconnues restent inconnues."
          disabled={!canWrite}
          onConfirm={() => onCommit([buildRequestConfirmation(profile.submissionId, qualified, author)])}
        />
        <Guarded
          label="Corriger la dernière qualification"
          description="Aucune suppression : une nouvelle entrée remplace logiquement la précédente et revient à l'état antérieur."
          disabled={!canWrite || !lastSubject}
          onConfirm={() => {
            if (!lastSubject) return;
            const draft = buildRollbackEntry(entries, lastSubject.category, lastSubject.subject, author);
            if (draft) onCommit([draft]);
          }}
        />
        <Button size="sm" variant="ghost" className="h-10" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? "Masquer l'historique" : `Historique des décisions (${mine.length})`}
        </Button>
      </div>

      {showHistory && (
        <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
          {mine.length === 0 && <li>Aucune décision enregistrée.</li>}
          {mine.map((e) => (
            <li key={e.id}>
              {new Date(e.confirmedAt).toLocaleString("fr-CA")} · {e.category} / {e.subject} → {e.decision}
              {e.supersedesId ? " (correction)" : ""} · par {e.confirmedBy}
              {historyOf(entries, e.category, e.subject).length > 1 ? " · sujet corrigé" : ""}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[10px] text-muted-foreground">
        CRM, disponibilité et fraîcheur restent trois concepts distincts : une confirmation de matériaux
        ne modifie jamais la disponibilité.
      </p>
    </div>
  );
}

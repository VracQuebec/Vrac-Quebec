// ============================================================
// LOT 19 — EXPLORATEUR DES MATCHS DÉBLOCABLES (interne / simulation)
// Aucune écriture : toutes les réponses vivent en mémoire de session.
// ============================================================
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EnrichedProfile } from "@/lib/qualification/lot15";
import { decomposeLoad } from "@/lib/qualification/lot15";
import { ANSWER_LABELS, type AnswerKind } from "@/lib/qualification/lot16";
import { evaluateQualificationImpact, MATCH_STATE_LABELS, type StateCounts } from "@/lib/matching/impact";
import {
  buildUnlockableMatches, createSimulationJournal, currentCounts, describeDelta,
  type SimulationEntry, type UnlockableMatch,
} from "@/lib/matching/explorer";

export interface ProfileEntry { profile: EnrichedProfile; reference: string | null }

const ANSWERS: AnswerKind[] = ["OUI", "NON", "JE_NE_SAIS_PAS"];

function CountsBlock({ title, counts }: { title: string; counts: StateCounts }) {
  return (
    <div className="rounded-md bg-muted/30 p-2">
      <p className="text-xs font-semibold">{title}</p>
      {(Object.keys(MATCH_STATE_LABELS) as (keyof StateCounts)[]).map((s) => (
        <p key={s} className="text-[11px] text-muted-foreground">
          {MATCH_STATE_LABELS[s]} : {counts[s]}
        </p>
      ))}
    </div>
  );
}

export default function UnlockableMatchesPanel({ entries }: { entries: ProfileEntry[] }) {
  const [journal] = useState(() => createSimulationJournal());
  const [log, setLog] = useState<SimulationEntry[]>([]);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const loads = useMemo(
    () => [
      { load: decomposeLoad("terre sablonneuse avec un peu de glaise et quelques petites roches", "l1") },
      { load: decomposeLoad("20 voyages de terre", "l2") },
      { load: decomposeLoad("béton cassé", "l3") },
    ],
    [],
  );

  const rows: (UnlockableMatch & { profile: EnrichedProfile })[] = useMemo(
    () => entries.slice(0, 25).flatMap((e) =>
      buildUnlockableMatches({ profile: e.profile, reference: e.reference, loads, onlyUnlockable: true })
        .map((r) => ({ ...r, profile: e.profile }))),
    [entries, loads],
  );

  const answer = (row: UnlockableMatch & { profile: EnrichedProfile }, kind: AnswerKind) => {
    if (!row.question) return;
    const impact = evaluateQualificationImpact({
      profile: row.profile, loads, question: row.question, answer: kind,
    });
    setLog([journal.add(impact, `explorateur · ${row.requestReference ?? row.requestId.slice(0, 8)}`), ...log]);
  };

  return (
    <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="text-sm font-semibold">Matchs débloquables ({rows.length})</p>
      <p className="text-xs text-muted-foreground">
        Simulation seulement : aucune réponse n'est enregistrée, aucune demande n'est modifiée.
      </p>

      <div className="mt-3 space-y-3">
        {rows.map((row) => {
          const key = `${row.requestId}-${row.loadId}`;
          const before = currentCounts(row.profile, loads);
          return (
            <div key={key} className="rounded-md border border-border bg-background p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{row.requestReference ?? row.requestId.slice(0, 8)}</span>
                <Badge variant="outline">{row.stateLabel}</Badge>
                <span className="ml-auto text-[11px] text-muted-foreground">{row.distance}</span>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-md bg-muted/30 p-2">
                  <p className="text-xs font-semibold">Matériau</p>
                  <p className="text-xs text-muted-foreground">{row.materialSource}</p>
                  <p className="text-xs text-muted-foreground">
                    Principal : {row.principalMaterial}
                    {row.secondaryMaterials.length ? ` · aussi : ${row.secondaryMaterials.join(", ")}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">{row.granulometry} · {row.quantity}</p>
                </div>
                <div className="rounded-md bg-muted/30 p-2">
                  <p className="text-xs font-semibold">Demande de remblai</p>
                  <ul className="text-xs text-muted-foreground">
                    {row.acceptance.slice(0, 5).map((a, i) => <li key={i}>{a.mark} {a.text}</li>)}
                  </ul>
                  <p className="text-xs text-muted-foreground">Capacité restante : {row.remainingCapacity}</p>
                </div>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">Raison du blocage : {row.blockingReason}</p>
              {row.missing.length > 0 && (
                <p className="text-xs text-muted-foreground">Il manque : {row.missing.join(" · ")}</p>
              )}

              {row.question && (
                <div className="mt-2 rounded-md border border-primary/30 p-2">
                  <p className="text-sm font-semibold leading-snug">{row.question.text}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Cette réponse pourrait débloquer environ {row.potentialUnlocked} match(s).
                  </p>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {ANSWERS.map((a) => (
                      <Button key={a} size="sm" variant={a === "OUI" ? "default" : "outline"} onClick={() => answer(row, a)}>
                        {ANSWER_LABELS[a]}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <Button size="sm" variant="ghost" className="mt-2 w-full sm:w-auto"
                onClick={() => setOpenRow(openRow === key ? null : key)}>
                {openRow === key ? "Masquer l'état actuel" : "Voir l'état actuel des matchs"}
              </Button>
              {openRow === key && <div className="mt-2 grid gap-2 sm:grid-cols-2"><CountsBlock title="Maintenant" counts={before} /></div>}
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground">Aucun match débloquable dans les demandes chargées.</p>
        )}
      </div>

      {log.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold">Journal de simulation (mémoire seulement)</p>
          <div className="mt-2 space-y-2">
            {log.map((e) => (
              <div key={`${e.index}-${e.timestamp}`} className="rounded-md bg-background p-2 text-[11px] text-muted-foreground">
                <p className="font-semibold text-foreground">SIMULATION #{e.index} · {e.source}</p>
                <p>Question : {e.question}</p>
                <p>Valeur simulée : {ANSWER_LABELS[e.answer]} · {e.timestamp}</p>
                <p>Impact : {describeDelta(e.before, e.after)} ({e.affected} match(s) changés)</p>
                {e.changes.map((c, i) => <p key={i}>• {c.loadId} : {c.from} → {c.to} — {c.reason}</p>)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

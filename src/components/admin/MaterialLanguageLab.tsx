// ============================================================
// LOT 19 — « DÉCRIVEZ VOTRE MATÉRIEL » (admin / test seulement)
// Interprétation déterministe, correction manuelle, simulation de
// matchs. Aucune écriture, aucune donnée réelle modifiée.
// ============================================================
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { EnrichedProfile } from "@/lib/qualification/lot15";
import { matchInterpretation } from "@/lib/matching/explorer";
import {
  applyManualCorrection, parseMaterialDescription, toLoadComposition, toMatchContext,
  VEHICLE_LABELS, type ParsedMaterialDescription, type VehicleType,
} from "@/lib/material-language";

const EXAMPLE = "20 voyages de semi 2 essieux de sable terreux avec tuff de moins de 18 po à Beauport";

const VEHICLES: VehicleType[] = ["10_roues", "12_roues", "semi_2_essieux", "semi_3_essieux"];

export default function MaterialLanguageLab({
  requests,
}: { requests: { profile: EnrichedProfile; reference: string | null }[] }) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedMaterialDescription | null>(null);
  const [answers, setAnswers] = useState<{ question: string; value: string }[]>([]);
  const [editing, setEditing] = useState(false);

  const analyse = () => {
    setAnswers([]);
    setParsed(parseMaterialDescription(text));
  };

  const summary = useMemo(() => {
    if (!parsed) return null;
    return matchInterpretation({
      load: toLoadComposition(parsed, "interpretation"),
      ctx: toMatchContext(parsed),
      requests: requests.slice(0, 25),
    });
  }, [parsed, requests]);

  return (
    <div className="mt-4 rounded-lg border border-border p-3">
      <p className="text-sm font-semibold">Décrivez votre matériel</p>
      <p className="text-xs text-muted-foreground">Exemple : « {EXAMPLE} »</p>
      <Textarea
        className="mt-2"
        rows={3}
        value={text}
        placeholder={EXAMPLE}
        onChange={(e) => setText(e.target.value)}
      />
      <Button className="mt-2 w-full sm:w-auto" onClick={analyse} disabled={!text.trim()}>
        Analyser
      </Button>

      {parsed && (
        <div className="mt-3 space-y-3 text-sm">
          <div className="rounded-md bg-muted/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide">Nous avons compris</p>
            <p className="mt-1">
              {parsed.transport?.tripCount ? `${parsed.transport.tripCount} voyages · ` : ""}
              {VEHICLE_LABELS[parsed.transport?.vehicleType ?? "unknown"]}
            </p>
            <p>
              Quantité :{" "}
              {parsed.quantity?.value != null
                ? `${parsed.quantity.approximate ? "environ " : ""}${parsed.quantity.value} ${parsed.quantity.unit}`
                : "à préciser"}
            </p>
            <p>
              Matériau principal :{" "}
              <span className="font-semibold">
                {parsed.materials.find((m) => m.role === "principal")?.label ?? "à préciser"}
              </span>{" "}
              <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>Modifier</Button>
            </p>
            <p>
              Contient aussi :{" "}
              {parsed.materials.filter((m) => m.role !== "principal").map((m) => m.label).join(", ") || "—"}
            </p>
            <p>
              Grosseur maximale :{" "}
              {parsed.granulometry?.maxInches != null ? `${parsed.granulometry.maxInches} pouces` : "inconnue"}
            </p>
            {parsed.location?.raw && <p>Secteur : {parsed.location.raw}</p>}
            {parsed.contamination.declarations.map((d, i) => (
              <p key={i} className="mt-1 text-xs text-muted-foreground">{d}</p>
            ))}
          </div>

          {editing && (
            <div className="rounded-md border border-border p-2">
              <p className="text-xs font-semibold">Correction manuelle</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {parsed.materials.map((m) => (
                  <Button key={m.type} size="sm" variant="outline"
                    onClick={() => setParsed(applyManualCorrection(parsed, { principalMaterial: m.type }))}>
                    Principal : {m.label}
                  </Button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {VEHICLES.map((v) => (
                  <Button key={v} size="sm" variant="secondary"
                    onClick={() => setParsed(applyManualCorrection(parsed, { vehicleType: v }))}>
                    {VEHICLE_LABELS[v]}
                  </Button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {[4, 12, 18, 24].map((inches) => (
                  <Button key={inches} size="sm" variant="secondary"
                    onClick={() => setParsed(applyManualCorrection(parsed, { maxInches: inches }))}>
                    max {inches} po
                  </Button>
                ))}
              </div>
            </div>
          )}

          {parsed.clarificationQuestions.length > 0 && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide">À confirmer</p>
              {parsed.clarificationQuestions.slice(0, 3).map((q) => (
                <div key={q.id} className="mt-2">
                  <p className="text-sm font-semibold leading-snug">{q.text}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {q.options.map((o) => (
                      <Button key={o} size="sm" variant="outline"
                        onClick={() => setAnswers([...answers, { question: q.text, value: o }])}>
                        {o}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
              {answers.length > 0 && (
                <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                  {answers.map((a, i) => <li key={i}>• {a.question} → {a.value} (simulation)</li>)}
                </ul>
              )}
            </div>
          )}

          {parsed.ambiguities.length > 0 && (
            <ul className="space-y-1 text-[11px] text-muted-foreground">
              {parsed.ambiguities.map((a, i) => <li key={i}>• {a.message}</li>)}
            </ul>
          )}

          {summary && (
            <div className="rounded-md bg-muted/30 p-3">
              <p className="text-sm font-semibold">{summary.total} demandes de remblai analysées (simulation)</p>
              <p className="text-xs text-muted-foreground">
                {summary.confirmed} compatibles confirmées · {summary.probable} probablement compatibles ·{" "}
                {summary.needConfirmation} à confirmer · {summary.insufficient} information insuffisante ·{" "}
                {summary.incompatible} non compatibles
              </p>
              <div className="mt-2 space-y-1">
                {summary.rows.slice(0, 10).map((r) => (
                  <div key={`${r.requestId}-${r.loadId}`} className="text-[11px] text-muted-foreground">
                    <Badge variant="outline" className="mr-2">{r.stateLabel}</Badge>
                    {r.requestReference ?? r.requestId.slice(0, 8)} — {r.blockingReason}
                    {r.question ? ` · Question : ${r.question.text}` : ""}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

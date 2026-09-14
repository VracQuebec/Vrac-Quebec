// ============================================================
// LOT 15 — CENTRE D'ENRICHISSEMENT (INTERNE / ADMIN, LECTURE SEULE)
// Aucune écriture, aucun statut CRM, aucune disponibilité modifiée.
// ============================================================
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { buildAcceptanceProfile } from "@/lib/qualification/lot13";
import {
  buildEnrichedProfile, decomposeLoad, evaluateMixture, questionValue,
  summarizeEnrichment, STANCE_LABELS, type MixtureKind,
} from "@/lib/qualification/lot15";
import type { CenterRow } from "@/components/admin/QualificationControlCenter";

const KIND_LABELS: Record<MixtureKind, string> = {
  MATERIAU_PUR: "Matériau pur",
  MELANGE_ACCEPTABLE: "Mélange acceptable",
  MELANGE_A_CONFIRMER: "Mélange à confirmer",
  MELANGE_INCOMPATIBLE: "Mélange incompatible",
};

const kindVariant = (k: MixtureKind) =>
  k === "MELANGE_INCOMPATIBLE" ? "destructive" : k === "MELANGE_A_CONFIRMER" ? "outline" : "default";

export default function EnrichmentPanel({ rows }: { rows: CenterRow[] }) {
  const [text, setText] = useState("terre sablonneuse avec un peu de glaise et quelques petites roches");

  const load = useMemo(() => decomposeLoad(text || " ", "simulation"), [text]);

  const results = useMemo(() => {
    return rows.slice(0, 200).map((r) => {
      const profile = buildEnrichedProfile(
        buildAcceptanceProfile({
          submissionId: r.id, reference: r.reference, text: r.text,
          available: r.available, lastConfirmedAt: r.lastConfirmedAt,
        }),
      );
      const mixture = evaluateMixture(load, profile);
      const questions = questionValue(profile, [load]);
      const summary = summarizeEnrichment(profile, [load]);
      return { row: r, profile, mixture, questions, summary };
    }).sort((a, b) => {
      const rank = (k: MixtureKind) => (k === "MATERIAU_PUR" || k === "MELANGE_ACCEPTABLE" ? 0 : k === "MELANGE_A_CONFIRMER" ? 1 : 2);
      return rank(a.mixture.kind) - rank(b.mixture.kind) || (b.questions[0]?.score ?? 0) - (a.questions[0]?.score ?? 0);
    });
  }, [rows, load]);

  const counts = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.mixture.kind] = (acc[r.mixture.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="mt-6 rounded-xl border border-border p-3 sm:p-4">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold">
        <Sparkles className="h-5 w-5" /> Enrichissement et matching explicable
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Simulation interne en lecture seule. Une compatibilité probable n'est jamais une acceptation confirmée.
      </p>

      <label className="mt-3 block text-xs font-medium" htmlFor="lot15-load">
        Décrivez un chargement à placer
      </label>
      <Input id="lot15-load" value={text} onChange={(e) => setText(e.target.value)} className="mt-1" />

      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {load.materials.map((m) => (
          <Badge key={m.materialKey} variant="secondary">
            {m.label} · {m.role.toLowerCase()}{m.sharePct != null ? ` · ${m.sharePct} %` : ""}
          </Badge>
        ))}
        {!load.materials.length && <span className="text-muted-foreground">Aucun matériau reconnu.</span>}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {(Object.keys(KIND_LABELS) as MixtureKind[]).map((k) => (
          <Badge key={k} variant={kindVariant(k)}>{KIND_LABELS[k]} : {counts[k] ?? 0}</Badge>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {results.slice(0, 25).map(({ row, profile, mixture, questions, summary }) => (
          <div key={row.id} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{row.reference ?? row.id.slice(0, 8)}</span>
              <Badge variant={kindVariant(mixture.kind)}>{KIND_LABELS[mixture.kind]}</Badge>
              {mixture.reliesOnProbable && <Badge variant="outline">repose sur du probable</Badge>}
              <span className="ml-auto text-xs text-muted-foreground">
                {summary.confirmed} confirmé(s) · {summary.probable} probable(s) · {summary.toConfirm + summary.unknown} à confirmer
              </span>
            </div>

            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {mixture.components.map((c) => (
                <li key={c.materialKey}>
                  {c.explanation} <span className="opacity-70">({STANCE_LABELS[c.stance]})</span>
                </li>
              ))}
            </ul>

            {questions[0] && (
              <p className="mt-2 text-xs">
                Prochaine question utile : <strong>{questions[0].question}</strong>{" "}
                <span className="text-muted-foreground">({questions[0].unlocked} chargement(s) débloqué(s))</span>
              </p>
            )}

            <p className="mt-1 text-[11px] text-muted-foreground">
              Grosseur maximale : {profile.granulometry.maxInches ?? "inconnue"} · Disponibilité : {profile.availability.available ? "disponible" : "non disponible"} ·
              Fraîcheur : {profile.availability.freshness.state.toLowerCase().replace(/_/g, " ")}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

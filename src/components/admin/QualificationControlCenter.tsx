// ============================================================
// LOT 13 — Centre de contrôle intelligent des demandes de remblai.
// INTERNE / ADMIN · LECTURE SEULE · derrière le drapeau
// qualification_control_center_v2 (faux par défaut).
// Aucune écriture, aucune confirmation réelle, aucune communication.
// ============================================================
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  applyFilters, buildAcceptanceProfile, buildUnknownTermsQueue, bulkConfirmEligibility,
  classifyNoRelationBatch, computeCounters, computePriority, corpusStats, impactRanking,
  materialMatrix, searchProfiles, simulateQuickAction, thirtySecondCard, thirtySecondQueue,
  NO_RELATION_LABELS, type AcceptanceProfile, type CenterFilters,
} from "@/lib/qualification/lot13";
import { buildLoadFromInterpretation } from "@/lib/matching/compatibility";
import { interpretChantier } from "@/lib/nlu/chantier";

export interface CenterRow {
  id: string;
  reference: string | null;
  text: string;
  available: boolean;
  lastConfirmedAt: string | null;
  hasRelations: boolean;
}

const PAGE_SIZE = 25;

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function ProfileCard({ p, potential }: { p: AcceptanceProfile; potential: number }) {
  const prio = computePriority(p, { potentialMatches: potential });
  const bulk = bulkConfirmEligibility(p);
  return (
    <div className="rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{p.reference ?? p.submissionId.slice(0, 8)}</span>
        <Badge variant="outline">{prio.level}</Badge>
        <Badge variant={p.globalScore >= 70 ? "default" : p.globalScore >= 40 ? "secondary" : "outline"}>
          fiche {p.globalScore}/100
        </Badge>
        <Badge variant="outline">
          {p.freshness.state === "CONFIRMEE" ? "Confirmée" : p.freshness.state === "A_REVALIDER" ? "À revalider" : "Jamais confirmée"}
        </Badge>
        {p.contradictions.length > 0 && <Badge variant="destructive">Contradiction</Badge>}
      </div>

      <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">{p.summary}</p>

      <div className="mt-2 flex flex-wrap gap-1">
        {p.accepted.map((m, i) => <Badge key={`a${i}`} className="text-[10px]">✓ {m.label}</Badge>)}
        {p.unknown.map((m, i) => <Badge key={`u${i}`} variant="outline" className="text-[10px]">? {m.label}</Badge>)}
        {p.refused.map((m, i) => <Badge key={`r${i}`} variant="destructive" className="text-[10px]">✕ {m.label}</Badge>)}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Calibre : {p.dimensions.maxInches != null ? `max ${p.dimensions.maxInches} po` : "non précisé"}
        {" · "}Capacité : {p.capacity.value != null ? `${p.capacity.value} ${p.capacity.unit ?? ""}` : "inconnue"}
        {" · "}Environnement : inconnu (aucune déduction)
        {" · "}Confirmation rapide : {bulk.eligible ? "admissible" : bulk.blockers.join(", ")}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        {(["CONFIRMER", "CORRIGER", "PLUS_TARD", "IMPOSSIBLE"] as const).map((a) => (
          <Button key={a} size="sm" variant="outline" disabled title={simulateQuickAction(p, a).description}>
            {a === "CONFIRMER" ? "Confirmer tel quel" : a === "CORRIGER" ? "Corriger" : a === "PLUS_TARD" ? "Plus tard" : "Impossible à déterminer"}
          </Button>
        ))}
      </div>
    </div>
  );
}

export default function QualificationControlCenter({ rows }: { rows: CenterRow[] }) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<CenterFilters>({});
  const [page, setPage] = useState(0);
  const [cardIndex, setCardIndex] = useState(0);

  const profiles = useMemo(
    () => rows.map((r) => buildAcceptanceProfile({
      submissionId: r.id, reference: r.reference, text: r.text,
      available: r.available, lastConfirmedAt: r.lastConfirmedAt,
    })),
    [rows],
  );

  // Chargements réels observés dans le corpus : sert d'échantillon d'impact.
  const loads = useMemo(
    () => profiles.slice(0, 150).map((p) => buildLoadFromInterpretation(
      interpretChantier(p.originalText, { direction: "EVACUATION" }), { id: p.submissionId },
    )),
    [profiles],
  );

  const potential = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of profiles) m.set(p.submissionId, p.accepted.length * 2 + (p.broadAcceptance ? 3 : 0));
    return m;
  }, [profiles]);

  const counters = useMemo(() => computeCounters(profiles, potential), [profiles, potential]);
  const stats = useMemo(() => corpusStats(profiles), [profiles]);
  const matrix = useMemo(() => materialMatrix(profiles), [profiles]);
  const terms = useMemo(() => buildUnknownTermsQueue(profiles, 25), [profiles]);
  const impact = useMemo(() => impactRanking(profiles, loads, 20), [profiles, loads]);
  const noRelation = useMemo(
    () => classifyNoRelationBatch(rows.filter((r) => !r.hasRelations).map((r) => ({ id: r.id, text: r.text }))),
    [rows],
  );

  const filtered = useMemo(
    () => searchProfiles(applyFilters(profiles, filters, potential), query),
    [profiles, filters, potential, query],
  );
  const queue = useMemo(() => thirtySecondQueue(filtered, potential), [filtered, potential]);
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const card = queue.length ? thirtySecondCard(queue[Math.min(cardIndex, queue.length - 1)]) : null;
  const eligible = filtered.filter((p) => bulkConfirmEligibility(p).eligible).length;

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Counter label="Demandes actives" value={counters.active} />
        <Counter label="Qualification suffisante" value={counters.sufficient} />
        <Counter label="À confirmer" value={counters.toConfirm} />
        <Counter label="Informations manquantes" value={counters.missingInfo} />
        <Counter label="Anciennes / à revalider" value={counters.toRevalidate} />
        <Counter label="Sans matériau identifié" value={counters.noMaterial} />
        <Counter label="Restrictions détectées" value={counters.withRestrictions} />
        <Counter label="Fort potentiel de match" value={counters.highMatchPotential} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(0); }}
          placeholder="Rechercher : « pas de béton », « roche 18 pouces », « jamais confirmée »…"
          className="max-w-md"
        />
        {[
          { label: "Suffisante", f: { qualificationStatus: "suffisante" } as CenterFilters },
          { label: "À confirmer", f: { qualificationStatus: "a_confirmer" } as CenterFilters },
          { label: "Sans matériau", f: { qualificationStatus: "sans_materiau" } as CenterFilters },
          { label: "Jamais confirmée", f: { freshness: "JAMAIS_CONFIRMEE" } as CenterFilters },
          { label: "Capacité inconnue", f: { capacityKnown: false } as CenterFilters },
          { label: "Avec restriction", f: { hasRestriction: true } as CenterFilters },
          { label: "Tous", f: {} as CenterFilters },
        ].map((b) => (
          <Button key={b.label} size="sm" variant="outline" onClick={() => { setFilters(b.f); setPage(0); }}>
            {b.label}
          </Button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} demande(s) affichée(s) · {eligible} seraient admissibles à une confirmation rapide
        (fonction volontairement désactivée en Lot 13).
      </p>

      <Tabs defaultValue="liste">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="liste">Liste</TabsTrigger>
          <TabsTrigger value="rapide">Mode 30 secondes</TabsTrigger>
          <TabsTrigger value="matrice">Matrice matériaux</TabsTrigger>
          <TabsTrigger value="impact">Impact</TabsTrigger>
          <TabsTrigger value="termes">Termes non reconnus</TabsTrigger>
          <TabsTrigger value="stats">Statistiques</TabsTrigger>
        </TabsList>

        <TabsContent value="liste" className="mt-3 space-y-3">
          {pageItems.map((p) => (
            <ProfileCard key={p.submissionId} p={p} potential={potential.get(p.submissionId) ?? 0} />
          ))}
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>Précédent</Button>
            <span className="text-xs text-muted-foreground">
              page {page + 1} / {Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}
            </span>
            <Button
              size="sm" variant="outline"
              disabled={(page + 1) * PAGE_SIZE >= filtered.length}
              onClick={() => setPage((n) => n + 1)}
            >Suivant</Button>
          </div>
        </TabsContent>

        <TabsContent value="rapide" className="mt-3">
          {card ? (
            <div className="max-w-sm rounded-lg border border-border p-4">
              <p className="font-semibold">Dompe {card.reference ?? card.submissionId.slice(0, 8)}</p>
              <p className="text-xs text-muted-foreground">
                Disponible : {card.available ? "OUI" : "NON"} · Fraîcheur :{" "}
                {card.freshness === "CONFIRMEE" ? "confirmée" : card.freshness === "A_REVALIDER" ? "à revalider" : "jamais confirmée"}
              </p>
              <ul className="mt-2 space-y-0.5 text-sm">
                {card.lines.map((l, i) => <li key={i}>{l.symbol} {l.label}</li>)}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Roche : {card.sizeLimit} · Capacité : {card.capacity}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled>Confirmer</Button>
                <Button size="sm" variant="outline" disabled>Corriger</Button>
                <Button size="sm" variant="outline" onClick={() => setCardIndex((i) => i + 1)}>Passer</Button>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">Simulation seulement — aucune écriture.</p>
            </div>
          ) : <p className="text-sm text-muted-foreground">Aucune demande dans la file.</p>}
        </TabsContent>

        <TabsContent value="matrice" className="mt-3">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground">
              <th className="py-1">Matériau</th><th>Accepté / probable</th><th>Refusé</th><th>Inconnu</th><th>Demandes</th>
            </tr></thead>
            <tbody>
              {matrix.map((r) => (
                <tr key={r.materialKey} className="border-t border-border">
                  <td className="py-1">{r.label}</td><td>{r.accepted}</td><td>{r.refused}</td><td>{r.unknown}</td><td>{r.requests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabsContent>

        <TabsContent value="impact" className="mt-3 space-y-1 text-xs">
          {impact.length === 0 && <p className="text-muted-foreground">Aucune information inconnue à fort impact mesuré.</p>}
          {impact.map((it, i) => (
            <p key={i}>
              <span className="font-semibold">{it.reference ?? it.submissionId.slice(0, 8)}</span> — {it.sentence}{" "}
              <Badge variant="outline" className="text-[10px]">{it.level}</Badge>
            </p>
          ))}
        </TabsContent>

        <TabsContent value="termes" className="mt-3 space-y-1 text-xs">
          <p className="text-muted-foreground">Aucun alias n'est créé automatiquement : proposition seulement.</p>
          {terms.map((t) => (
            <p key={t.term}>
              « {t.term} » — {t.frequency} demande(s) · proposition : {t.proposedClassification}
            </p>
          ))}
        </TabsContent>

        <TabsContent value="stats" className="mt-3 space-y-1 text-xs">
          <p>1+ matériau : {stats.atLeastOne} · 2+ : {stats.twoPlus} · 3+ : {stats.threePlus}</p>
          <p>Refus explicite : {stats.explicitRefusal} · Restriction : {stats.restriction} · Granulométrie : {stats.granulometry} · Dimension : {stats.dimension}</p>
          <p>Condition : {stats.condition} · Capacité : {stats.capacity} · Camion : {stats.truck} · Environnement : {stats.environment}</p>
          <p>Acceptation large : {stats.broadAcceptance} · Contradiction : {stats.contradiction} · Aucune info exploitable : {stats.noUsableInfo}</p>
          <p className="pt-2 font-semibold">Demandes sans relation matériau ({noRelation.items.length})</p>
          {(["A", "B", "C", "D", "E"] as const).map((k) => (
            <p key={k}>{k} — {NO_RELATION_LABELS[k]} : {noRelation.counts[k]}</p>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

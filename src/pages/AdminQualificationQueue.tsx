// ============================================================
// LOT 16 — FILE INTELLIGENTE DE QUALIFICATION (INTERNE / ADMIN)
// ------------------------------------------------------------
// Lecture seule : aucune écriture, aucun statut CRM, aucune
// disponibilité modifiée, aucune communication. Les réponses
// humaines sont SIMULÉES et affichées avec leur brouillon de
// journal. Protégée par le drapeau qualification_queue_v2.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, PhoneCall, ListFilter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { isFeatureEnabled } from "@/lib/flags";
import { buildAcceptanceProfile } from "@/lib/qualification/lot13";
import { buildEnrichedProfile, decomposeLoad, type EnrichedProfile } from "@/lib/qualification/lot15";
import {
  ANSWER_LABELS, answerImpact, answerToJournalDraft, buildQueue, nextQuestion, queueIndicators,
  simulateAnswer, type AnswerDetail, type AnswerKind, type QueueCard,
} from "@/lib/qualification/lot16";
import {
  TEST_MODE_BADGE, buildOperatorCard, recordSessionAnswer, type SessionAnswer,
} from "@/lib/qualification/lot17";

interface Row {
  id: string;
  dompe_number: string | null;
  city: string | null;
  name: string | null;
  phone: string | null;
  status: string | null;
  availability_status: string | null;
  availability_confirmed_by: string | null;
  availability_updated_at: string | null;
  description: string | null;
  other_material: string | null;
  materials: string[] | null;
}

const textOf = (r: Row) =>
  [r.description, r.other_material, (r.materials ?? []).join(", ")].filter(Boolean).join(". ");

const ANSWERS: AnswerKind[] = ["OUI", "NON", "CA_DEPEND", "JE_NE_SAIS_PAS", "PASSER"];

function CallMode({
  card, profile, onClose,
}: { card: QueueCard; profile: EnrichedProfile; onClose: () => void }) {
  const [current, setCurrent] = useState(profile);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  // LOT 17 — les réponses vivent uniquement en mémoire de session.
  const [session, setSession] = useState<SessionAnswer[]>([]);
  const loads = useMemo(() => card.questions.length ? [] : [], [card]);
  void loads;

  const simulationLoads = useMemo(
    () => [
      decomposeLoad("20 voyages de terre", "l1"),
      decomposeLoad("terre sablonneuse avec un peu de glaise et quelques petites roches", "l2"),
      decomposeLoad("béton cassé", "l3"),
    ],
    [],
  );

  const question = nextQuestion(current, simulationLoads, skipped);

  const answer = (kind: AnswerKind, detail: AnswerDetail = {}) => {
    if (!question) return;
    const impact = answerImpact(current, simulationLoads, question, kind, detail);
    const draft = answerToJournalDraft({
      profile: current, question, answer: kind, detail, confirmedBy: "simulation",
    });
    setLog((l) => [
      `${ANSWER_LABELS[kind]} — ${question.text} · ${impact.explanation}` +
      (draft ? ` · journal simulé (${draft.category}:${draft.subject})` : " · aucune écriture"),
      ...l,
    ]);
    setSession((s) => recordSessionAnswer(s, question.id, kind, detail));
    setCurrent(simulateAnswer(current, question, kind, detail));
    setSkipped((s) => [...s, question.id]);
  };

  return (
    <div className="mt-3 rounded-lg border border-primary/40 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <PhoneCall className="h-4 w-4" />
        <span className="font-semibold">Qualification rapide</span>
        <span className="text-muted-foreground">
          {card.contactName ?? "Contact inconnu"} · {card.phone ?? "téléphone inconnu"} · {card.city ?? "ville inconnue"}
        </span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>Terminer</Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Disponibilité : {card.available ? "disponible" : "non disponible"} · Dernière confirmation :{" "}
        {card.freshness.lastConfirmedAt ?? "jamais"} · Aucun appel n'est déclenché automatiquement.
        {session.length > 0 && ` · ${session.length} réponse(s) gardée(s) en mémoire seulement.`}
      </p>

      {question ? (
        <>
          <p className="mt-3 text-base font-semibold">{question.text}</p>
          <p className="text-xs text-muted-foreground">
            Cette réponse pourrait débloquer environ {question.unlocked} match(s). ({question.reason})
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {ANSWERS.map((a) => (
              <Button key={a} size="lg" variant={a === "OUI" ? "default" : "outline"} onClick={() => answer(a)}>
                {ANSWER_LABELS[a]}
              </Button>
            ))}
          </div>
          {question.followUps.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">Si « ça dépend » :</span>
              {question.followUps.map((f) => (
                <Button key={f.label} size="sm" variant="secondary" onClick={() => answer("CA_DEPEND", f.detail)}>
                  {f.label}
                </Button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Aucune autre question utile pour l'instant.</p>
      )}

      {log.length > 0 && (
        <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
          {log.map((l, i) => <li key={i}>• {l}</li>)}
        </ul>
      )}
    </div>
  );
}

export default function AdminQualificationQueue() {
  const { isReady } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const enabled = isFeatureEnabled("qualification_queue_v2");

  useEffect(() => {
    if (!isReady || !isAdmin) return;
    setLoading(true);
    supabase
      .from("submissions")
      .select("id,dompe_number,city,name,phone,status,availability_status,availability_confirmed_by,availability_updated_at,description,other_material,materials")
      .eq("request_type", "remblai")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setRows((data ?? []) as Row[]);
        setLoading(false);
      });
  }, [isReady, isAdmin]);

  const simulationLoads = useMemo(
    () => [
      decomposeLoad("20 voyages de terre", "l1"),
      decomposeLoad("terre sablonneuse avec un peu de glaise et quelques petites roches", "l2"),
      decomposeLoad("béton cassé", "l3"),
    ],
    [],
  );

  const { cards, profiles } = useMemo(() => {
    const profiles = new Map<string, EnrichedProfile>();
    const inputs = (rows ?? []).map((r) => {
      const acceptance = buildAcceptanceProfile({
        submissionId: r.id, reference: r.dompe_number, text: textOf(r),
        available: r.availability_status === "available",
        lastConfirmedAt: r.availability_confirmed_by ? r.availability_updated_at ?? null : null,
      });
      const profile = buildEnrichedProfile(acceptance);
      profiles.set(r.id, profile);
      return {
        profile, loads: simulationLoads, acceptance,
        reference: r.dompe_number, city: r.city, contactName: r.name, phone: r.phone,
      };
    });
    return { cards: buildQueue(inputs), profiles };
  }, [rows, simulationLoads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) =>
      [c.reference, c.city, c.recommended?.text].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [cards, search]);

  const indicators = queueIndicators(cards, 0);

  if (!isReady || rolesLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!isAdmin) {
    return <div className="flex min-h-screen items-center justify-center p-6 text-center"><p className="text-muted-foreground">Accès réservé à l'administration.</p></div>;
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <Link to="/admin" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Administration
      </Link>

      <h1 className="mt-3 flex items-center gap-2 font-display text-2xl font-bold">
        <ListFilter className="h-6 w-6" /> File de qualification des demandes de remblai
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Interne, en simulation. Aucune réponse n'est enregistrée, aucune donnée historique n'est modifiée.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Demandes analysées", indicators.analyzed],
          ["Suffisamment qualifiées", indicators.sufficientlyQualified],
          ["À enrichir", indicators.toEnrich],
          ["Questions prioritaires", indicators.priorityQuestions],
          ["Matchs débloquables", indicators.unlockableMatches],
          ["Confirmées aujourd'hui", indicators.confirmedToday],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg border border-border p-2 text-center">
            <p className="text-lg font-bold">{value as number}</p>
            <p className="text-[11px] text-muted-foreground">{label as string}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant={enabled ? "secondary" : "outline"}>
          {enabled ? "aperçu activé (local)" : "file désactivée en production"}
        </Badge>
        <span className="text-muted-foreground">Simulation : 3 chargements types.</span>
      </div>

      <Input
        className="mt-3"
        placeholder="Rechercher une dompe, une ville ou une question"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading && (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
        </div>
      )}

      <div className="mt-4 space-y-3">
        {filtered.slice(0, 50).map((card) => (
          <div key={card.submissionId} className="rounded-lg border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{card.reference ?? card.submissionId.slice(0, 8)}</span>
              {card.city && <span className="text-muted-foreground">{card.city}</span>}
              <Badge variant={card.available ? "default" : "outline"}>
                {card.available ? "Disponible" : "Non disponible"}
                {card.freshness.state === "CONFIRMEE" ? "" : card.freshness.state === "A_REVALIDER" ? " — À revalider" : " — Jamais confirmée"}
              </Badge>
              <Badge variant="outline">{card.validationCase.label}</Badge>
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                priorité {card.priority.score} · qualité {card.quality.score}
              </span>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              {card.potential} chargement(s) simulé(s) · {card.counts.compatible} probable(s) ·{" "}
              {card.counts.toConfirm} bloqué(s) par une information manquante · {card.counts.incompatible} incompatible(s)
            </p>

            {card.recommended && (
              <div className="mt-2 rounded-md bg-muted/40 p-2">
                <p className="text-sm font-medium">Question recommandée : {card.recommended.text}</p>
                <p className="text-xs text-muted-foreground">
                  Impact estimé : +{Math.max(0, card.estimatedGain)} match(s) potentiel(s) · {card.recommended.reason}
                </p>
              </div>
            )}

            <p className="mt-1 text-[11px] text-muted-foreground">{card.priority.reasons.join(" · ")}</p>

            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => setOpenId(openId === card.submissionId ? null : card.submissionId)}
            >
              {openId === card.submissionId ? "Fermer" : "Qualification rapide (simulation)"}
            </Button>

            {openId === card.submissionId && profiles.get(card.submissionId) && (
              <CallMode
                card={card}
                profile={profiles.get(card.submissionId)!}
                onClose={() => setOpenId(null)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { publishResultMessage, repairResultMessage, cityPlan, slotKey, isNoindexOnly, generateReasonWithCatalog, catalogActionLine } from "@/lib/seo/cityActions";
import UnknownDecisionDialog from "@/components/seo/UnknownDecisionDialog";
import RefusedTasksPanel from "@/components/seo/RefusedTasksPanel";
import PublishConfirmDialog from "@/components/seo/PublishConfirmDialog";
import AutopilotPanel from "@/components/seo/AutopilotPanel";
import CityWorkbenchDialog, { type RowResult, type Evidence } from "@/components/seo/CityWorkbenchDialog";
import { buildWorkbench, type WbAction, type WbRow } from "@/lib/seo/cityWorkbench";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";
import { loadDecisions, saveDecisions, availabilityOf, decisionKey, type DecisionRow } from "@/lib/seo/slotDecisions";
import CityCoverageDialog from "@/components/seo/CityCoverageDialog";
import { buildCatInput, classify, summarizeCatalog, mergeSummaries, CAT_STATE_LABEL, estimateCredits, type CatState, type CatSummary } from "@/lib/seo/catalogStatus";
import { publishCityDrafts, publishOutcomeMessage, publishPrecheck, precheckReason, loadAllDraftsForPrecheck, type PublishPrecheck } from "@/lib/seo/cityPublish";
import { repairCity, repairOutcomeMessage, type RepairSlot } from "@/lib/seo/cityRepair";
import { coverageLabel, coveragePct, computeCoverage, splitAll, coverageFlags, catalogBreakdown, COVERAGE_BADGE_LABEL, type Coverage, type CoverageAllRaw } from "@/lib/seo/cityCoverage";
import { useSeoControlCenter, type ControlCityRow, type ControlProblem } from "@/lib/seo/useSeoControlCenter";
import { useSeoPipelineV2 } from "@/lib/seo/useSeoPipelineV2";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import CityPagesDialog from "@/components/seo/CityPagesDialog";
import { CityDetailDialog } from "@/components/seo/CityGenerator";
import { useCityGeneration } from "@/lib/seo/useCityGeneration";
import CityCombinationAudit from "@/components/seo/CityCombinationAudit";
import DraftAudit from "@/components/seo/DraftAudit";
import QaControlPanel from "@/components/seo/QaControlPanel";
import PublishReadyPanel from "@/components/seo/PublishReadyPanel";
import { useGlobalGeneration } from "@/lib/seo/useGlobalGeneration";
import { summarize } from "@/lib/seo/cityAudit";
import { collectFixes, type QualityFix } from "@/lib/seo/coverageDisplay";
import { fetchSeoStats, type SeoStats } from "@/lib/seo/api";
import {
  canStartGlobal, confirmationLines, finalSummary, failureNotice,
  globalPhase, PHASE_LABEL, runProgress, shouldOfferRetry,
} from "@/lib/seo/globalGeneration";
import {
  Play, Pause, Square, Rocket, RefreshCw, Send, ListRestart,
  Loader2, AlertTriangle, ExternalLink, FileText, CheckCircle2, Wand2,
} from "lucide-react";

/** Champs lus en lecture seule pour l'encadré « Pages à corriger » (critères de qualité). */
type SeoPageRow = {
  slug: string; city_slug: string; title: string | null;
  status: string; meta_title: string | null; internal_link_count: number | null;
};

type FilterKey = "all" | "done" | "partial" | "running" | "todo" | "error";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "Toutes" },
  { key: "done", label: "Pages prévues créées" },
  { key: "partial", label: "Partielles" },
  { key: "running", label: "En cours" },
  { key: "todo", label: "En attente" },
  { key: "error", label: "Avec erreurs" },
];

const STATUS_META: Record<ControlCityRow["status"], { label: string; className: string; dot: string }> = {
  done:    { label: "PAGES ACTUELLEMENT COUVERTES", className: "bg-green-500/15 text-green-700 border-green-500/30", dot: "bg-green-500" },
  partial: { label: "PAGES PRÉVUES À CRÉER", className: "bg-amber-500/15 text-amber-700 border-amber-500/30", dot: "bg-amber-500" },
  running: { label: "EN COURS", className: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30", dot: "bg-yellow-500" },
  error:   { label: "ERREUR",   className: "bg-destructive/15 text-destructive border-destructive/30", dot: "bg-destructive" },
  todo:    { label: "EN ATTENTE",  className: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
};

function nf(n: number) { return n.toLocaleString("fr-CA"); }

/** Clés des pages publiées d'une ville, d'après la lecture de couverture (même source pour toutes les villes). */
function publishedKeysOf(cv: Coverage | null): Set<string> {
  const out = new Set<string>();
  for (const it of cv?.items ?? []) if (it.page && it.published) out.add(slotKey(it.kind, it.kind === "material" ? it.slug : null, it.kind === "service" ? it.slug : null));
  return out;
}

export default function PipelineControlCenter() {
  const { state, loading, error, reload } = useSeoControlCenter();
  const { pause, resume, stop, retryErrors } = useSeoPipelineV2();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [showAudits, setShowAudits] = useState(false);
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(24);
  const [busy, setBusy] = useState<string | null>(null);
  const [logsCity, setLogsCity] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [pagesCity, setPagesCity] = useState<{ slug: string; name: string } | null>(null);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [workSlug, setWorkSlug] = useState<string | null>(null);
  // Couverture réelle : même moteur (cityCoverage.ts) pour toutes les municipalités actives.
  const [cov, setCov] = useState<Map<string, Coverage>>(new Map());
  const [covState, setCovState] = useState<"loading" | "error" | "ok">("loading");
  useEffect(() => {
    void supabase.rpc("seo_city_coverage_all" as never).then(({ data, error }) => {
      if (error || !data) { setCovState((s) => (s === "ok" ? "ok" : "error")); return; }
      setCovState("ok");
      const m = new Map<string, Coverage>();
      for (const r of splitAll(data as unknown as CoverageAllRaw)) m.set(r.city_slug, computeCoverage(r));
      setCov(m);
    });
  }, [state?.computed_at]);
  const [coverageCity, setCoverageCity] = useState<{ slug: string; name: string } | null>(null);
  // Verrou serveur de la génération globale (trigger seo_pipeline_runs_guard) : boutons désactivés avec la raison.
  const [globalLock, setGlobalLock] = useState<string | null>(null);
  const [lockKnown, setLockKnown] = useState(false);
  useEffect(() => {
    void supabase.from("seo_pipeline_guard" as never).select("global_disabled,reason").maybeSingle()
      .then(({ data }) => { const g = data as { global_disabled: boolean; reason: string } | null; setGlobalLock(g?.global_disabled ? g.reason : null); setLockKnown(true); });
  }, []);
  // Exclusions temporaires (ex. Terre contaminée, Neige) : lecture admin seulement.
  const [exclusions, setExclusions] = useState<Set<string>>(new Set());
  useEffect(() => {
    void supabase.from("seo_generation_exclusions" as never).select("kind,slug").eq("active", true)
      .then(({ data }) => setExclusions(new Set(((data ?? []) as Array<{ kind: string; slug: string }>).map((x) => `${x.kind}|${x.slug}`))));
  }, []);
  // Pré-contrôle de publication (lecture seule) : mêmes règles que l'action, calculées AVANT le clic.
  const [precheckRaw, setPrecheckRaw] = useState<Awaited<ReturnType<typeof loadAllDraftsForPrecheck>> | null>(null);
  const [precheckErr, setPrecheckErr] = useState(false);
  useEffect(() => {
    void loadAllDraftsForPrecheck().then((r) => { setPrecheckRaw(r); setPrecheckErr(false); }).catch(() => setPrecheckErr(true));
  }, [state?.computed_at]);
  const [unknownCity, setUnknownCity] = useState<{ slug: string; name: string } | null>(null);
  const [publishCity, setPublishCity] = useState<{ slug: string; name: string } | null>(null);
  // Décisions admin par ville (lecture) : jamais de génération déclenchée.
  const [decisions, setDecisions] = useState<Map<string, DecisionRow>>(new Map());
  const [decTick, setDecTick] = useState(0);
  useEffect(() => { void loadDecisions().then(setDecisions).catch(() => setDecisions(new Map())); }, [decTick]);
  // Catalogue serveur (28 combinaisons × ville) : disponibilité de RÉFÉRENCE pour les compteurs, les fiches et la fenêtre de ville.
  const [srvAvail, setSrvAvail] = useState<Map<string, "confirmee" | "exclue" | "inconnue"> | null>(null);
  const [srvErr, setSrvErr] = useState<string | null>(null);
  useEffect(() => {
    void supabase.rpc("seo_city_slots_availability_admin" as never).then(({ data, error }) => {
      // Un seul objet « ville|type|slug » → disponibilité : les 4 536 combinaisons, sans limite de lignes.
      if (error) { setSrvAvail(null); setSrvErr(error.message); return; }
      setSrvErr(null);
      setSrvAvail(new Map(Object.entries((data ?? {}) as Record<string, "confirmee" | "exclue" | "inconnue">)));
    });
  }, [state?.computed_at, decTick]);
  const srvOf = (city: string, kind: string, sl: string | null) => srvAvail ? (srvAvail.get(`${city}|${kind}|${sl ?? ""}`) ?? "inconnue") : undefined;
  const exclusionsFor = (city: string) => {
    const s0 = new Set(exclusions);
    for (const d of decisions.values()) if (d.city_slug === city && d.decision === "exclue") s0.add(`${d.kind}|${d.slug}`);
    return s0;
  };
  const precheckFor = (slug: string, name: string): PublishPrecheck | undefined => {
    if (!precheckRaw) return undefined;
    const items = cov.get(slug)?.items ?? [];
    const avail = (d: { material_slug?: string | null; service_slug?: string | null }) => {
      const kind = d.material_slug ? "material" : d.service_slug ? "service" : "hub";
      const sl = d.material_slug ?? d.service_slug ?? null;
      const it = items.find((x) => x.kind === kind && (x.slug ?? null) === sl);
      if (!it) return "inconnue" as const;
      return availabilityOf(it, decisions.get(decisionKey(slug, kind, sl))?.decision, srvOf(slug, kind, sl));
    };
    return publishPrecheck(precheckRaw.drafts.filter((d) => d.city_slug === slug), name, precheckRaw.copies, avail);
  };
  const [pubReport, setPubReport] = useState<Map<string, Awaited<ReturnType<typeof publishCityDrafts>>>>(new Map());
  // Couverture réelle du catalogue : une combinaison = un seul état (catalogStatus.ts).
  const catalogBySlug = useMemo(() => {
    const m = new Map<string, CatSummary>();
    const run = !!state?.active_run;
    for (const [slug, cv0] of cov) m.set(slug, summarizeCatalog(withConfirmed(slug, buildCatInput(slug, cv0.items as never, (state?.problems ?? []) as never, exclusionsFor(slug), { activeRun: run }))));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cov, state, exclusions, decisions, srvAvail]);
  function withConfirmed<T extends { queueKeys: Set<string> }>(city: string, inp: T): T {
    // Même règle partout : « confirmée » = catalogue serveur (preuve réelle) ou décision; la file du Générateur ne prouve rien.
    if (srvAvail) {
      inp.queueKeys.clear();
      for (const [k, v] of srvAvail) if (v === "confirmee" && k.startsWith(`${city}|`)) inp.queueKeys.add(k.slice(city.length + 1));
    }
    for (const d of decisions.values()) if (d.city_slug === city && d.decision === "confirmee") inp.queueKeys.add(`${d.kind}|${d.slug}`);
    return inp;
  }
  const catalogOf = (slug: string) => catalogBySlug.get(slug) ?? null;
  const catalogTotal = useMemo(() => catalogBySlug.size ? mergeSummaries([...catalogBySlug.values()]) : null, [catalogBySlug]);
  const catalogComplete = useMemo(() => [...catalogBySlug.values()].filter((x) => x.complete).length, [catalogBySlug]);
  const toRepairSlot = (p: ControlProblem): RepairSlot => ({
    key: `${p.city_slug}|${p.material_slug ?? ""}|${p.service_slug ?? ""}`, label: p.label, gen_state: p.gen_state,
    has_page: p.gen_state === "invalid", published: publishedKeysOf(cov.get(p.city_slug) ?? null).has(slotKey(p.kind, p.material_slug, p.service_slug)),
    noindex_volontaire: isNoindexOnly(p as never), issues: p.issues, attempts: p.task_attempts ?? 0,
    material_slug: p.material_slug, service_slug: p.service_slug,
  });
  // Même logique de génération que le Générateur (aucune architecture parallèle).
  const gen = useCityGeneration();
  const workCity = workSlug ? gen.bySlug.get(workSlug) ?? null : null;

  // ── Poste de travail par ville : une ligne par combinaison, actions manuelles avec résultat par page ──
  const [wbCity, setWbCity] = useState<{ slug: string; name: string } | null>(null);
  const [wbFocus, setWbFocus] = useState<WbAction | null>(null);
  const openWb = (c: { slug: string; name: string }, focus: WbAction | null) => { setWbFocus(focus); setWbCity({ slug: c.slug, name: c.name }); void verifyWb(); };
  // Noms officiels des villes (seo_cities) : affichage seulement, le slug reste l'identifiant des opérations.
  const [cityNames, setCityNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    void supabase.from("seo_cities").select("slug, name").then(({ data }) =>
      setCityNames(new Map(((data ?? []) as { slug: string; name: string | null }[]).filter((c) => c.name?.trim()).map((c) => [c.slug, c.name!.trim()]))));
  }, []);
  // Preuves de disponibilité de la ville ouverte (lecture seule) : distingue demande explicite et « Terre » seulement.
  const [wbEvidence, setWbEvidence] = useState<Evidence[]>([]);
  useEffect(() => {
    setWbEvidence([]);
    if (!wbCity) return;
    void supabase.rpc("seo_slot_evidence" as never, { _city_slug: wbCity.slug } as never)
      .then(({ data }) => setWbEvidence(((data ?? []) as unknown) as Evidence[]));
  }, [wbCity]);
  const availFor = (city: string) => (d: { material_slug?: string | null; service_slug?: string | null }) => {
    const kind = d.material_slug ? "material" : d.service_slug ? "service" : "hub";
    const sl = d.material_slug ?? d.service_slug ?? null;
    if (kind !== "hub" && exclusionsFor(city).has(`${kind}|${sl}`)) return false;
    const it = (cov.get(city)?.items ?? []).find((x) => x.kind === kind && (x.slug ?? null) === sl);
    return !!it && availabilityOf(it, decisions.get(decisionKey(city, kind, sl))?.decision, srvOf(city, kind, sl)) === "confirmee";
  };
  const wbRowsFor = (slug: string, name: string): WbRow[] => {
    const cv0 = cov.get(slug);
    if (!cv0 || !precheckRaw) return [];
    const excl = exclusionsFor(slug);
    const probs = ((state?.problems ?? []) as ControlProblem[]).filter((p) => p.city_slug === slug);
    return buildWorkbench({
      cityName: name, items: cv0.items as never, excluded: excl, slugCopies: precheckRaw.copies,
      cat: withConfirmed(slug, buildCatInput(slug, cv0.items as never, probs as never, excl, { activeRun: !!state?.active_run })),
      drafts: precheckRaw.drafts.filter((d) => d.city_slug === slug) as never,
      published: cv0.items.filter((i) => i.page && i.page.status === "published").map((i) => i.page!) as never,
      problems: probs as never,
      decisionOf: (k, s) => decisions.get(decisionKey(slug, k, s))?.decision,
      serverOf: (k, s) => srvOf(slug, k, s),
    });
  };
  const verifyWb = async () => {
    await reload();
    setDecisions(await loadDecisions().catch(() => new Map()));
    // Disponibilité serveur relue aussi (une décision change la disponibilité de référence).
    setDecTick((t) => t + 1);
    try { setPrecheckRaw(await loadAllDraftsForPrecheck()); setPrecheckErr(false); } catch { setPrecheckErr(true); }
  };
  // Décisions de disponibilité : une ligne enregistrée PAR combinaison cochée, motif obligatoire; aucune génération.
  const decideRows = (city: { slug: string; name: string }) => async (rows: WbRow[], decision: "confirmee" | "exclue", reason: string) => {
    const out = new Map<string, RowResult>();
    const valid = rows.filter((r) => r.kind !== "hub" && r.slug);
    for (const r of rows) if (!valid.includes(r)) out.set(r.key, { ok: false, msg: "La page ville n'a pas de décision de disponibilité." });
    const o = await saveDecisions(valid.map((r) => ({ city_slug: city.slug, kind: r.kind as "material" | "service", slug: r.slug!, decision, reason })));
    for (const r of valid) {
      const f = o.failed.find((x) => x.slug === r.slug);
      out.set(r.key, f ? { ok: false, msg: `Décision non enregistrée : ${f.error}` }
        : { ok: true, msg: decision === "confirmee" ? "Disponibilité confirmée et enregistrée (motif conservé). Aucune génération lancée — sélectionnable dans « Générer »." : "Combinaison exclue et enregistrée (motif conservé). Elle ne sera jamais générée." });
    }
    setDecTick((t) => t + 1);
    return out;
  };
  const wbRun = (city: { slug: string; name: string }) => ({
    generate: async (rows: WbRow[]) => {
      const out = new Map<string, RowResult>();
      const row = gen.bySlug.get(city.slug);
      for (const r of rows) {
        // Revérifié au moment de l'action : seules les combinaisons à disponibilité confirmée sont générées.
        const d = { material_slug: r.kind === "material" ? r.slug : null, service_slug: r.kind === "service" ? r.slug : null };
        if (!availFor(city.slug)(d)) { out.set(r.key, { ok: false, msg: "Disponibilité non confirmée — génération refusée." }); continue; }
        const m = d.material_slug ? gen.materials.find((x) => x.slug === d.material_slug) : undefined;
        const s = d.service_slug ? gen.services.find((x) => x.slug === d.service_slug) : undefined;
        // Référentiel non chargé : refuser plutôt que d'envoyer une demande sans matériau/service (qui viserait la page ville).
        if ((d.material_slug && !m) || (d.service_slug && !s)) { out.set(r.key, { ok: false, msg: "Référentiel des matériaux et services non chargé — rien envoyé. Actualisez puis réessayez." }); continue; }
        try {
          const { data, error } = await invokeWithFreshSession<Record<string, unknown>, { created?: boolean; skipped?: boolean; error?: string }>("seo-generate-page", {
            city: { slug: city.slug, name: city.name, region: row?.region ?? null },
            material: m ? { slug: m.slug, name: m.name, short_name: m.short_name, description: m.description } : undefined,
            service: s ? { slug: s.slug, name: s.name, description: s.description } : undefined,
            publish: false, allow_ai: true, force: false,
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          out.set(r.key, data?.skipped ? { ok: false, msg: "Page déjà existante — rien généré." } : { ok: true, msg: "Brouillon créé (noindex, non publié). Prochaine action : vérifier puis publier." });
        } catch (e) { out.set(r.key, { ok: false, msg: e instanceof Error ? e.message : "Erreur inconnue" }); }
      }
      return out;
    },
    repair: async (rows: WbRow[]) => {
      const out = new Map<string, RowResult>();
      const probs = ((state?.problems ?? []) as ControlProblem[]).filter((p) => p.city_slug === city.slug);
      for (const r of rows) {
        const p = probs.find((x) => slotKey(x.kind, x.material_slug, x.service_slug) === slotKey(r.kind, r.kind === "material" ? r.slug : null, r.kind === "service" ? r.slug : null));
        if (!p) { out.set(r.key, { ok: false, msg: "Aucune erreur serveur pour cette page — rien à régénérer." }); continue; }
        const o = await repairCity([toRepairSlot(p)]);
        out.set(r.key, o.done.length ? { ok: true, msg: "Régénéré (sauvegarde faite, reste brouillon noindex)." }
          : { ok: false, msg: o.failed[0]?.error ?? o.skipped[0]?.reason ?? "Ignoré." });
      }
      return out;
    },
    recheck: async (rows: WbRow[]) => {
      // Rapport de qualité seulement : enforce_draft=false → contenu, statut et noindex inchangés.
      const out = new Map<string, RowResult>();
      for (const r of rows) {
        if (!r.pageId) { out.set(r.key, { ok: false, msg: "Aucun brouillon." }); continue; }
        try {
          const { data, error } = await invokeWithFreshSession<Record<string, unknown>, { score?: number; blockers?: string[]; warnings?: string[]; error?: string }>("seo-qa-check", { page_id: r.pageId, enforce_draft: false });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          const left = [...(data?.blockers ?? []), ...(data?.warnings ?? [])];
          out.set(r.key, { ok: typeof data?.score === "number", msg: `Note : ${r.qaScore ?? "absente"} → ${data?.score ?? "?"}/100${(data?.score ?? 0) < 90 ? " (sous 90 : publication refusée)" : ""}.${left.length ? ` Reste : ${left.join(", ")}.` : ""} Contenu non modifié.` });
        } catch (e) { out.set(r.key, { ok: false, msg: e instanceof Error ? e.message : "Erreur inconnue" }); }
      }
      return out;
    },
    autofix: async (rows: WbRow[]) => {
      const out = new Map<string, RowResult>();
      for (const r of rows) {
        if (!r.pageId) { out.set(r.key, { ok: false, msg: "Aucun brouillon." }); continue; }
        try {
          // expected_updated_at : refus serveur (rien modifié) si la page a changé depuis la vérification.
          const { data, error } = await invokeWithFreshSession<Record<string, unknown>, { fixed?: string[]; changed_fields?: string[]; error?: string; message?: string; old_score?: number | null; new_score?: number | null; remaining?: string[] }>("seo-qa-autofix", { page_id: r.pageId, actions: [], allow_ai: false, expected_updated_at: r.updatedAt });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          const n = data?.fixed?.length ?? 0;
          const left = data?.remaining?.length ? ` Reste : ${data.remaining.join(", ")}.` : "";
          out.set(r.key, n
            ? { ok: true, msg: `Note ${data?.old_score ?? r.qaScore ?? "absente"} → ${data?.new_score ?? "?"}/100. Modifié : ${(data?.changed_fields ?? data!.fixed!).join(", ")} (version précédente sauvegardée, noindex conservé).${left}` }
            : { ok: false, msg: `${data?.message ?? "Aucune correction automatique possible"} — rien modifié. Note : ${r.qaScore ?? "absente"}.` });
        } catch (e) { out.set(r.key, { ok: false, msg: `${e instanceof Error ? e.message : "Erreur inconnue"} — rien modifié.` }); }
      }
      return out;
    },
    publish: async (rows: WbRow[]) => {
      const bySlug = new Map(rows.filter((r) => r.pageSlug).map((r) => [r.pageSlug!, r.key]));
      const o = await publishCityDrafts(city.slug, city.name, undefined, { removeGenerationNoindex: true, onlySlugs: [...bySlug.keys()], isAvailable: availFor(city.slug) });
      const out = new Map<string, RowResult>();
      for (const s of o.published) out.set(bySlug.get(s)!, { ok: true, msg: "Publiée — statut confirmé dans la base." });
      for (const b of o.blocked) out.set(bySlug.get(b.slug)!, { ok: false, msg: `Bloquée : ${b.reasons.join(" ")}` });
      for (const f of o.failed) out.set(bySlug.get(f.slug)!, { ok: false, msg: f.error });
      for (const [s, k] of bySlug) if (!out.has(k)) out.set(k, { ok: false, msg: `/${s} n'est plus un brouillon — rien publié.` });
      return out;
    },
  });

  // ── COUVERTURE SEO — lectures complémentaires (aucune écriture) ──
  // Pages totales / villes historiques : seo_dashboard_stats (même source que le reste du tableau de bord).
  const [stats, setStats] = useState<SeoStats | null>(null);
  // Pages à corriger : critères de qualité (audit) appliqués en lecture seule sur les pages réelles.
  const [fixRows, setFixRows] = useState<QualityFix<SeoPageRow>[] | null>(null);
  const mainLoaded = !!state;
  useEffect(() => { if (mainLoaded) void fetchSeoStats().then(setStats).catch(() => setStats(null)); }, [mainLoaded]);
  useEffect(() => {
    // Lecture complète (pagination) : la table dépasse 1 000 pages. Différée après l'écran principal.
    if (!mainLoaded) return;
    void (async () => {
      const all: SeoPageRow[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("seo_pages")
          .select("slug, city_slug, title, status, meta_title, internal_link_count")
          .range(from, from + 999);
        if (error) return; // lecture incomplète : ne jamais afficher un décompte partiel comme complet
        all.push(...((data ?? []) as SeoPageRow[]));
        if (!data || data.length < 1000) break;
      }
      setFixRows(collectFixes(all));
    })();
  }, [mainLoaded]);
  // Statuts des villes déduits uniquement des chiffres réels du Centre de pilotage.
  const citySummary = useMemo(() => summarize(state?.cities ?? []), [state]);
  // ── Génération globale (orchestration du moteur existant) ──
  const [confirmOpen, setConfirmOpen] = useState(false);
  const activeRun = state?.active_run ?? null;
  const phase = globalPhase(activeRun as never);
  // Aperçu global (lecture lourde) chargé seulement si le verrou serveur est levé.
  const global = useGlobalGeneration(phase === "running" || phase === "paused", lockKnown ? !globalLock : null);
  const startable = canStartGlobal(global.preview, activeRun as never);
  const prog = runProgress(activeRun as never);
  const globalActive = phase === "running" || phase === "paused";
  // Bilan global : mêmes règles que chaque carte de ville.
  const bilan = useMemo(() => {
    const t = { cities: 0, planned: 0, published: 0, drafts: 0, toDevelop: 0, offCriteria: 0, errDraft: 0, errPub: 0, noindex: 0, pending: 0, failed: 0 };
    const pubByCity = new Map<string, Set<string>>();
    for (const [slug, cv] of cov) { t.cities++; t.planned += cv.planned; t.published += cv.plannedCovered; t.drafts += cv.plannedDrafts; t.toDevelop += cv.toDevelop; t.offCriteria += cv.offCriteria; pubByCity.set(slug, publishedKeysOf(cv)); }
    for (const p of (state?.problems ?? []) as ControlProblem[]) {
      if (p.gen_state === "pending") t.pending++;
      else if (p.gen_state === "error") t.failed++;
      else if (p.gen_state === "invalid") {
        if (isNoindexOnly(p as never)) t.noindex++;
        else if (pubByCity.get(p.city_slug)?.has(slotKey(p.kind, p.material_slug, p.service_slug))) t.errPub++;
        else t.errDraft++;
      }
    }
    return t;
  }, [cov, state?.problems]);

  async function launchGlobal() {
    setConfirmOpen(false);
    try {
      const r = await global.start();
      await reload();
      toast({
        title: r.created
          ? `Génération lancée sur ${r.cities} ville(s)`
          : "Génération déjà en cours — rien n'a été relancé",
        description: "Les nouvelles pages sont créées en brouillon. Aucune publication automatique.",
      });
    } catch (e) {
      toast({ title: "Lancement impossible", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    }
  }

  const totals = state?.totals ?? null;
  const run = state?.active_run ?? null;
  const pipelineState = state?.pipeline_state ?? "completed";
  // Progression = GÉNÉRATION. La publication reste manuelle et ne change jamais un statut.
  const globalPct = totals && totals.target_total > 0
    ? Math.round((totals.generated / totals.target_total) * 100) : 0;
  const publishedPct = totals && totals.target_total > 0
    ? Math.round((totals.published / totals.target_total) * 100) : 0;
  // Une vraie alerte uniquement : erreurs réelles, tâches interrompues ou génération arrêtée.
  // Les combinaisons potentielles restantes ne déclenchent jamais d'alerte.
  const actionRequired =
    (totals?.errors ?? 0) > 0 ||
    (state?.stalled_tasks ?? 0) > 0 ||
    (!!run && !["running", "queued", "completed"].includes(run.status));

  const cities = useMemo(() => {
    const list = state?.cities ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((c) =>
      (filter === "all" || (filter === "error" ? c.errors > 0 : c.status === filter)) &&
      (!q || c.name.toLowerCase().includes(q) || c.slug.includes(q))
    );
  }, [state, filter, search]);

  const errorProblems = useMemo(
    () => (state?.problems ?? []).filter((p) => p.gen_state === "error" || p.gen_state === "invalid"),
    [state],
  );

  async function act(key: string, fn: () => Promise<void | string>, okMsg: string) {
    setBusy(key);
    try { const detail = await fn(); await reload(); toast({ title: okMsg, description: detail || undefined }); }
    catch (e) { toast({ title: "Erreur", description: e instanceof Error ? e.message : "Action impossible", variant: "destructive" }); }
    finally { setBusy(null); }
  }

  async function openLogs(slug: string) {
    setLogsCity(slug); setLogs([]);
    const { data } = await supabase.from("seo_page_tasks")
      .select("id, city_slug, material_slug, service_slug, kind, status, step, attempts, qa_score, last_error, updated_at")
      .eq("city_slug", slug).order("updated_at", { ascending: false }).limit(200);
    setLogs(data ?? []);
  }

  return (
    <div className="space-y-4">
      <AutopilotPanel />
      {/* ── En-tête + contrôles globaux ─────────────────────────── */}
      <Card className="p-4 md:p-6 space-y-4">
        <header className="flex flex-wrap items-start gap-3 justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-display font-bold flex items-center gap-2">
              <Rocket className="w-5 h-5 text-primary" /> Centre de pilotage SEO
            </h2>
            <p className="text-xs text-muted-foreground">
              Chiffres calculés en direct depuis la base (pages, villes, tâches). Aucune estimation.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void reload()} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Rafraîchir
            </Button>
            {!run && (
              <Button size="sm" className="gap-2" disabled={!!globalLock || !startable.allowed || global.starting || global.loading}
                title={globalLock ?? (startable.allowed ? "Génère uniquement les pages pertinentes manquantes" : startable.reason)}
                onClick={() => setConfirmOpen(true)}>
                {global.starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                Générer toutes les pages manquantes
              </Button>
            )}
            {run && ["running", "queued"].includes(run.status) && (
              <Button size="sm" variant="outline" onClick={() => act("pause", () => pause(run.id), "Pipeline en pause")} className="gap-2"><Pause className="w-4 h-4" /> Pause</Button>
            )}
            {run?.status === "paused" && (
              <Button size="sm" disabled={!!globalLock} title={globalLock ?? undefined} onClick={() => window.confirm("Reprendre la génération globale ? Des appels IA payants peuvent être lancés.") && act("resume", () => resume(run.id), "Pipeline reprise")} className="gap-2"><Play className="w-4 h-4" /> Reprendre</Button>
            )}
            {run && (
              <Button size="sm" variant="ghost" onClick={() => act("stop", () => stop(run.id), "Pipeline arrêtée")} className="gap-2"><Square className="w-4 h-4" /> Arrêter</Button>
            )}
          </div>
        </header>

        {error && <div className="text-sm text-destructive">{error}</div>}
        {loading && !state && (
          <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</div>
        )}

        {totals && (
          <>
            {/* ── COUVERTURE SEO — source officielle : seo_control_center() (même logique que le Générateur) ── */}
            <section className="rounded-xl border border-border p-4 md:p-5 space-y-4">
              <div>
                <h3 className="text-sm font-display font-bold tracking-wide">COUVERTURE SEO</h3>
                <p className="text-xs text-muted-foreground">
                  Même source que le Générateur : uniquement les combinaisons pertinentes (municipalité active du
                  registre × matériau réellement demandé sur le territoire × service actif). Aucune combinaison
                  théorique dans ces chiffres.
                </p>
              </div>

              {/* Métrique principale */}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Progression du générateur — combinaisons créées</div>
                    <div className="text-4xl font-display font-extrabold text-primary leading-tight">
                      {nf(totals.generated)} <span className="text-xl text-muted-foreground font-bold">/ {nf(totals.target_total)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Progression du générateur</div>
                    <div className="text-4xl font-display font-extrabold text-primary leading-tight">
                      {globalPct}<span className="text-lg text-muted-foreground font-bold"> %</span>
                    </div>
                  </div>
                </div>
                <Progress value={globalPct} className="h-2 mt-3" />
                <div className="text-xs text-muted-foreground mt-2">
                  Ces chiffres décrivent la file du générateur, pas la couverture réelle des pages publiées.
                  Publication (manuelle) : {publishedPct}% — {nf(totals.published)} publiée(s), {nf(totals.drafts)} en brouillon.
                  Une page générée n'est jamais publiée automatiquement.
                </div>
              </div>

              {/* Tuiles officielles */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
                <Kpi label="Municipalités analysées" value={nf(state.cities.length)} hint="Registre municipal actuel" />
                <Kpi label="Générateur — combinaisons pertinentes" value={nf(totals.target_total)} hint="Ville × matériau × service — file du générateur, pas des pages indexables" />
                <Kpi label="Générateur — combinaisons créées" value={nf(totals.generated)} tone="good" hint="Pages existantes, brouillons inclus" />
                <button type="button" onClick={() => setProblemsOpen(true)} className="text-left">
                  <Kpi label="Générateur — combinaisons manquantes" value={nf(totals.remaining)} tone={totals.remaining > 0 ? "bad" : "muted"} hint="Pages pertinentes non générées — voir la liste" />
                </button>
                <Kpi label="Couverture SEO — pages publiées" value={nf(totals.published)} tone="good" hint="Pages réellement publiées et admissibles (en ligne)" />
                <Kpi label="Pages en brouillon" value={nf(totals.drafts)} hint="Pages existantes non publiées — jamais comptées comme couvertes" />
                <Kpi label="Pages à corriger" value={fixRows ? nf(fixRows.length) : "…"} tone={fixRows && fixRows.length > 0 ? "bad" : "muted"} hint="Qualité — voir l'encadré" />
                <button type="button" onClick={() => setErrorsOpen(true)} className="text-left">
                  <Kpi label="Pages avec erreurs" value={nf(totals.errors)} tone={totals.errors > 0 ? "bad" : "muted"} hint="Génération — voir la liste" />
                </button>
                <Kpi label="Villes complètes" value={`${nf(citySummary.complete)} / ${nf(state.cities.length)}`} tone={citySummary.complete === state.cities.length ? "good" : undefined} hint="Toutes les combinaisons du générateur créées" />
                <Kpi label="Villes incomplètes" value={nf(citySummary.incomplete)} tone={citySummary.incomplete > 0 ? "bad" : "muted"} hint="Certaines combinaisons du générateur manquent" />
                <Kpi label="Villes à développer" value={nf(citySummary.none)} tone={citySummary.none > 0 ? "bad" : "muted"} hint="Opportunités admissibles sans page — aucune page générée" />
                <Kpi label="Villes à vérifier" value={nf(citySummary.check)} tone={citySummary.check > 0 ? "bad" : "muted"} hint="Incohérence à contrôler" />
              </div>

              {/* Pages existantes — jamais mélangées au taux de couverture */}
              <div className="rounded-lg border border-border bg-background/50 p-3 text-xs space-y-1">
                <div className="font-semibold text-sm">Pages existantes : {stats ? nf(stats.pages_total) : "…"} au total</div>
                <p className="text-muted-foreground">
                  {nf(totals.generated)} pages correspondent aux combinaisons pertinentes actuelles du Générateur.
                  {stats && stats.pages_total > totals.generated && (
                    <> Les {nf(stats.pages_total - totals.generated)} pages restantes correspondent aux{" "}
                    {nf(stats.cities_historical ?? 0)} villes historiques hors registre municipal actuel (pages
                    conservées, jamais supprimées).</>
                  )}
                </p>
              </div>

              {/* Encadré « Pages à corriger » — lecture seule, aucune correction automatique */}
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs space-y-2">
                <div className="font-semibold text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" /> Pages à corriger ({fixRows ? nf(fixRows.length) : "…"})
                </div>
                {fixRows === null ? (
                  <p className="text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Vérification de la qualité…</p>
                ) : fixRows.length === 0 ? (
                  <p className="text-green-700 flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5" /> Aucune page à corriger.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {fixRows.map((f) => {
                      const cityName = state.cities.find((c) => c.slug === f.city_slug)?.name ?? f.city_slug;
                      return (
                        <li key={f.slug} className="flex flex-wrap items-center gap-2">
                          <strong>{cityName}</strong>
                          <span className="text-muted-foreground">{f.title ?? f.slug}</span>
                          <Badge variant="outline" className="text-[10px]">{f.status === "published" ? "Publiée" : "Brouillon"}</Badge>
                          <span className="text-destructive">{f.reason}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            <div className="rounded-lg border border-border bg-background/50 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Badge variant="outline" className={
                  pipelineState === "running" ? "bg-primary/15 text-primary border-primary/30 gap-1"
                    : actionRequired ? "bg-destructive/15 text-destructive border-destructive/30"
                    : "bg-green-500/15 text-green-700 border-green-500/30"
                }>
                  {pipelineState === "running" && <Loader2 className="w-3 h-3 animate-spin" />}
                  {pipelineState === "running" ? "GÉNÉRATION EN COURS" : actionRequired ? "ACTION REQUISE" : "MODE MANUEL — VILLE PAR VILLE"}
                </Badge>
                {run?.current_city_slug && <span className="text-muted-foreground">Ville : <strong className="text-foreground">{run.current_city_slug}</strong></span>}
                <span className="text-muted-foreground">
                  File : {nf(state?.queued_tasks ?? 0)} tâche{(state?.queued_tasks ?? 0) > 1 ? "s" : ""}
                  {(state?.queued_tasks ?? 0) === 0 ? " — aucune tâche en attente" : ""}
                </span>
                {(state?.processing_tasks ?? 0) > 0 && <span className="text-muted-foreground">Traitement : {state?.processing_tasks}</span>}
                {(state?.stalled_tasks ?? 0) > 0 && <span className="text-destructive">Interrompues : {state?.stalled_tasks}</span>}
              </div>
              {actionRequired && (
                <div className="mt-2 text-xs text-destructive">
                  {[
                    totals.errors > 0 ? `${nf(totals.errors)} page(s) en erreur ou à corriger` : null,
                    (state?.stalled_tasks ?? 0) > 0 ? `${state?.stalled_tasks} tâche(s) interrompue(s)` : null,
                    run && run.status !== "running" && run.status !== "completed" ? `Génération ${run.status} sur ${run.current_city_slug ?? "une ville"}` : null,
                  ].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>

            {/* ── Génération globale : état, progression, résumé ───── */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="text-sm font-semibold flex items-center gap-2">
                  {phase === "running" && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                  {PHASE_LABEL[phase]}
                </div>
                {srvErr && <div className="w-full text-xs text-destructive">Disponibilité serveur illisible ({srvErr}) — compteurs approximatifs, ne pas s'y fier.</div>}
                {globalLock && <div className="w-full text-xs text-destructive">Verrou serveur actif : {globalLock}</div>}
                <div className="flex flex-wrap gap-2">
                  {(phase === "interrupted" || phase === "paused") && activeRun && (
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={!!globalLock} title={globalLock ?? undefined}
                      onClick={() => window.confirm("Reprendre la génération globale ? Des appels IA payants peuvent être lancés.") && act("resume-global", () => resume(activeRun.id), "Génération reprise")}>
                      <Play className="w-3 h-3" /> Reprendre la génération
                    </Button>
                  )}
                  {shouldOfferRetry(activeRun as never, global.preview) && activeRun && (
                    <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={!!globalLock} title={globalLock ?? undefined}
                      onClick={() => window.confirm("Remettre en file les tâches en erreur de la génération globale ?") && act("retry-global", () => retryErrors(activeRun.id), "Erreurs remises en file")}>
                      <ListRestart className="w-3 h-3" /> Régénérer les erreurs
                    </Button>
                  )}
                  {shouldOfferRetry(activeRun as never, global.preview) && (
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setErrorsOpen(true)}>
                      Voir les erreurs
                    </Button>
                  )}
                </div>
              </div>

              {phase === "running" || phase === "completed" ? (
                <>
                  <Progress value={prog.pct} className="h-2" />
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                    <span>{nf(prog.done)} / {nf(prog.total)} pages · {prog.pct} %</span>
                    {activeRun?.current_city_slug && <span>Ville actuelle : <strong className="text-foreground">{activeRun.current_city_slug}</strong></span>}
                    <span className="text-green-700">✓ Générées : {nf(prog.succeeded)}</span>
                    <span className="text-destructive">⚠ Erreurs : {nf(prog.failed)}</span>
                    <span>○ Restantes : {nf(prog.remaining)}</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {globalLock
                    ? "Aperçu global non chargé : la génération globale est verrouillée côté serveur."
                    : global.preview.remaining > 0
                    ? "Génère uniquement les pages pertinentes qui ne sont pas encore créées. Les pages existantes et publiées sont protégées."
                    : "Aucune page pertinente à générer."}
                </p>
              )}

              {phase === "completed" && global.baseline && (
                <div className="rounded-md border border-border bg-background/60 p-2 text-xs space-y-0.5">
                  <div className="font-semibold">Génération terminée</div>
                  {finalSummary(global.baseline, global.preview, activeRun as never).map((l) => <div key={l}>{l}</div>)}
                  {failureNotice(activeRun as never) && (
                    <div className="text-destructive">{failureNotice(activeRun as never)}</div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </Card>

      {cov.size > 0 && (
        <Card className="p-4 md:p-6 space-y-2">
          <h3 className="text-base font-display font-bold">Bilan de couverture — {nf(bilan.cities)} villes actives</h3>
          {catalogTotal && <CatalogTotals s={catalogTotal} complete={catalogComplete} cities={catalogBySlug.size} />}
          <div className="text-xs font-semibold pt-1">File du générateur (opportunités pertinentes seulement)</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div><div className="text-lg font-bold">{nf(bilan.planned)}</div>pages attendues (opportunités pertinentes)</div>
            <div><div className="text-lg font-bold">{nf(bilan.published)}</div>publiées</div>
            <div><div className="text-lg font-bold">{nf(bilan.drafts)}</div>en brouillon</div>
            <div><div className="text-lg font-bold">{nf(bilan.toDevelop)}</div>manquantes (dans la file)</div>
            <div><div className="text-lg font-bold">{nf(bilan.errDraft)}</div>brouillons en erreur (régénérables)</div>
            <div><div className="text-lg font-bold">{nf(bilan.errPub)}</div>pages en ligne à corriger (protégées)</div>
            <div><div className="text-lg font-bold">{nf(bilan.pending + bilan.failed)}</div>tâches en attente ou échouées</div>
            <div><div className="text-lg font-bold">{nf(bilan.noindex)}</div>non indexées volontairement (pas une erreur)</div>
          </div>
          <p className="text-xs text-muted-foreground">Exclues : {nf(bilan.offCriteria)} page(s) existante(s) hors critères — aucune demande ni service configuré ne les justifie; elles sont conservées mais ne comptent pas dans les pages attendues.</p>
        </Card>
      )}

      {/* ── Tâches refusées (consultation seule) ────────────────── */}
      <RefusedTasksPanel
        cityName={(s) => (state?.cities ?? []).find((c) => c.slug === s)?.name ?? cityNames.get(s) ?? null}
        comboLabel={(city, t) => {
          const kind = t.material_slug ? "material" : t.service_slug ? "service" : "hub";
          const sl = t.material_slug ?? t.service_slug ?? null;
          return (cov.get(city)?.items ?? []).find((x) => x.kind === kind && (x.slug ?? null) === sl)?.label ?? sl;
        }}
        availability={(city, t) => {
          const kind = t.material_slug ? "material" : t.service_slug ? "service" : "hub";
          const sl = t.material_slug ?? t.service_slug ?? null;
          if (kind !== "hub" && exclusionsFor(city).has(`${kind}|${sl}`)) return "exclue";
          const it = (cov.get(city)?.items ?? []).find((x) => x.kind === kind && (x.slug ?? null) === sl);
          return it ? (availabilityOf(it, decisions.get(decisionKey(city, kind, sl))?.decision, srvOf(city, kind, sl)) as "confirmee" | "exclue" | "inconnue") : null;
        }}
        onOpenCity={(slug, name) => { setWbCity({ slug, name }); void verifyWb(); }} />

      {/* ── État des villes ─────────────────────────────────────── */}
      <Card className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <h3 className="text-base font-display font-bold">État des villes ({state?.cities.length ?? 0})</h3>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une ville…" className="h-9 w-full sm:w-56" />
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"}
              className="h-8 text-xs" onClick={() => { setFilter(f.key); setVisible(24); }}>
              {f.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {cities.slice(0, visible).map((c) => {
            const genRow = gen.bySlug.get(c.slug) ?? null;
            const isRunning = gen.run?.citySlug === c.slug || gen.dbActive?.city_slug === c.slug;
            const lockedByOther = !!gen.lockedBy && gen.lockedBy !== c.slug;
            const cv = cov.get(c.slug) ?? null;
            const flags = cv ? coverageFlags(cv) : null;
            const plan = cityPlan({
              slug: c.slug, unpublished: c.unpublished, drafts: c.drafts,
              problems: (state?.problems ?? []) as never,
              publishedKeys: publishedKeysOf(cv),
              runningHere: isRunning, lockedByOther, globalRunActive: globalActive, hasGenRow: !!genRow,
              registryState: gen.registryState(c.slug),
              coverageState: covState === "ok" && !cv ? "error" : covState,
            });
            const cat = cv ? catalogBreakdown(cv, exclusions) : null;
            const catSum = catalogOf(c.slug);
            const queuePct = c.planned > 0 ? Math.round(((c.generated) / c.planned) * 100) : 0;
            const split = { realErrors: plan.invalidDrafts + plan.invalidPublished + plan.failed, noindex: plan.noindex };
            const retryReason = plan.retry.reason;
            const pre = precheckFor(c.slug, c.name);
            const publishReason = precheckErr ? "Lecture des brouillons impossible — publication bloquée; utilisez « Actualiser »." : precheckReason(pre);
            const genReason = generateReasonWithCatalog(plan.generate.reason, catSum);
            const catLine = catalogActionLine(catSum);
            const wbGen = wbRowsFor(c.slug, c.name).filter((r) => r.action === "generate").length; // eslint-disable-line
            const legacyMeta = STATUS_META[isRunning ? "running" : c.status];
            // Le badge ne dépend plus de la file du Générateur, sauf génération en cours ou erreur.
            const wbRows = wbRowsFor(c.slug, c.name);
            const gaps = missingGroups(wbRows);
            // Badge = couverture réelle des 28 combinaisons (même règle que la fenêtre de ville), jamais la file.
            const meta = isRunning || c.status === "error" || !catSum ? legacyMeta
              : catSum.complete
                ? { label: "Complète (28 combinaisons)", className: "bg-green-500/15 text-green-700 border-green-500/30", dot: "bg-green-500" }
                : catSum.draft_ready + catSum.draft_noindex + catSum.draft_error > 0
                  ? { label: COVERAGE_BADGE_LABEL.drafts, className: "bg-sky-500/15 text-sky-700 border-sky-500/30", dot: "bg-sky-500" }
                  : { label: "Incomplète", className: "bg-amber-500/15 text-amber-700 border-amber-500/30", dot: "bg-amber-500" };
            void flags;
            const _legacy = isRunning || c.status === "error" || !flags ? legacyMeta
              : flags.badge === "covered"
                ? { label: COVERAGE_BADGE_LABEL.covered, className: "bg-green-500/15 text-green-700 border-green-500/30", dot: "bg-green-500" }
                : flags.badge === "drafts"
                  ? { label: COVERAGE_BADGE_LABEL.drafts, className: "bg-sky-500/15 text-sky-700 border-sky-500/30", dot: "bg-sky-500" }
                  : { label: COVERAGE_BADGE_LABEL.to_develop, className: "bg-amber-500/15 text-amber-700 border-amber-500/30", dot: "bg-amber-500" };
            const liveDone = gen.run?.citySlug === c.slug ? gen.run.done : gen.dbActive?.city_slug === c.slug ? gen.dbActive.done : null;
            const liveTotal = gen.run?.citySlug === c.slug ? gen.run.total : gen.dbActive?.city_slug === c.slug ? gen.dbActive.total : null;
            return (
              <div key={c.slug} onClick={() => setWorkSlug(c.slug)}
                className="rounded-xl border border-border bg-card p-3 space-y-2.5 cursor-pointer hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`} />{c.name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{c.slug}</div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${meta.className}`}>{meta.label}</Badge>
                </div>

                {flags && (flags.toValidate || flags.toConfigure || flags.offCriteria) && (
                  <div className="flex flex-wrap gap-1">
                    {flags.toValidate && <Badge variant="outline" className="text-[10px]">À VALIDER</Badge>}
                    {flags.toConfigure && <Badge variant="outline" className="text-[10px]">À CONFIGURER</Badge>}
                    {flags.offCriteria && <Badge variant="outline" className="text-[10px]">{cv!.offCriteria} HORS CRITÈRES</Badge>}
                  </div>
                )}
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between"><span>File du générateur</span><span>{c.generated} / {c.planned} ({queuePct} %)</span></div>
                  <Progress value={queuePct} className="h-1.5" />
                  <div className="flex justify-between font-medium"><span>Couverture réelle du catalogue</span><span>{catSum ? `${catSum.published_indexable + catSum.published_noindex} / ${catSum.total - catSum.excluded_missing} (${catSum.coveredPct} %)` : "…"}</span></div>
                  <Progress value={catSum?.coveredPct ?? 0} className="h-2" />
                  {catSum && <CatStateLine s={catSum} />}
                </div>
                {gaps.length > 0 && (
                  <div className="rounded-md border border-border p-2 text-[11px] space-y-1" onClick={(e) => e.stopPropagation()}>
                    <div className="font-semibold">Sans page publiée ({gaps.reduce((n, g) => n + g.items.length, 0)})</div>
                    {gaps.map((g) => (
                      <div key={g.title}><span className="font-medium">{g.title} — </span><span className="text-muted-foreground">{g.reason}</span>
                        <div>{g.items.join(", ")}</div></div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-xs">
                  <span>{c.generated} page{c.generated > 1 ? "s" : ""} existante{c.generated > 1 ? "s" : ""}</span>
                  <span>{c.published} publiée{c.published > 1 ? "s" : ""}</span>
                  <span>{c.drafts} en brouillon</span>
                  <span>{catSum ? catSum.missing_confirmed + catSum.missing_unknown + catSum.failed + catSum.stalled : "…"} manquante(s) sur 28{catSum ? ` (${catSum.missing_unknown} inconnue(s), ${catSum.excluded_missing} exclue(s) à part)` : ""}</span>
                  {plan.pending > 0 && <span>{plan.pending} en file d'attente</span>}
                  <span className={split.realErrors > 0 ? "text-destructive font-medium" : ""}>{split.realErrors} erreur{split.realErrors > 1 ? "s" : ""}{plan.invalidPublished > 0 ? ` (dont ${plan.invalidPublished} en ligne)` : ""}</span>
                  {split.noindex > 0 && <span className="text-muted-foreground">{split.noindex} publiée(s) non indexée(s) volontairement</span>}
                  <span className="text-muted-foreground">File du générateur (secondaire) : {cv ? coverageLabel(cv.plannedCovered, cv.planned) : "…"}</span>
                  <span className="text-muted-foreground">Potentiel théorique : {state?.totals.per_city ?? "—"}</span>
                  {cat && (
                    <span className="col-span-full text-muted-foreground">
                      Catalogue complet : {cat.catalogPublished} / {cat.catalogTarget} publiées
                      {" · "}{cat.relevant} pertinente(s){" · "}{cat.unknownMissing} sans page, disponibilité inconnue
                      {cat.excluded > 0 ? ` · ${cat.excluded} exclue(s) temporairement` : ""}
                      {cat.offCriteriaPages > 0 ? ` · ${cat.offCriteriaPages} page(s) hors critères` : ""}
                    </span>
                  )}
                  {cv && cv.toDevelop > 0 && <span className="text-amber-700">{cv.toDevelop} opportunité(s) sans page — dans la file du générateur</span>}
                </div>

                {isRunning && liveTotal ? (
                  <div className="text-xs text-yellow-700">
                    🟡 {liveDone} / {liveTotal} page(s) traitée(s)
                    {gen.run?.citySlug === c.slug && gen.run.label ? ` · ${gen.run.label}` : ""}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1" onClick={() => setPagesCity({ slug: c.slug, name: c.name })}>
                    <FileText className="w-3 h-3" /> Voir les pages
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1" onClick={() => setCoverageCity({ slug: c.slug, name: c.name })}>
                    <FileText className="w-3 h-3" /> Couverture
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1"
                    disabled={gen.verifying === c.slug || isRunning}
                    onClick={() => openWb(c, null)}>
                    <CheckCircle2 className="w-3 h-3" /> Vérifier et gérer la ville
                  </Button>
                  {/* Ouvrent la fenêtre de la ville sur la section visée : sélection page par page, raisons chiffrées si rien n'est admissible. */}
                  <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1" disabled={isRunning}
                    title={retryReason ?? undefined} onClick={() => openWb(c, "repair")}>
                    <ListRestart className="w-3 h-3" /> Régénérer les erreurs ({plan.invalidDrafts})
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs gap-1" disabled={isRunning}
                    title={publishReason ?? undefined} onClick={() => openWb(c, "publish")}>
                    <Send className="w-3 h-3" /> Publier les non publiées ({pre?.eligible.length ?? 0})
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2.5 text-xs" onClick={() => openLogs(c.slug)}>Voir les logs</Button>
                  {catSum && catSum.missing_unknown > 0 && (
                    <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => openWb(c, "decide")}>
                      Décider les inconnues ({catSum.missing_unknown})
                    </Button>
                  )}
                  <Button size="sm" className="h-8 px-2.5 text-xs gap-1"
                    title={genReason ?? undefined}
                    disabled={!plan.generate.enabled && wbGen === 0}
                    onClick={() => !plan.generate.enabled ? openWb(c, "generate") : genRow && window.confirm(`${plan.generate.count} page(s) admissible(s) (disponibilité confirmée) pour ${c.name}. Coût IA estimé : ${estimateCredits(plan.generate.count)} crédit(s). Les combinaisons inconnues et exclues ne sont pas générées. Continuer ?`) && void gen.generateCity(genRow, { includeStalled: plan.stalled > 0 }).finally(() => void reload())}>
                    {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                    {c.generated > 0 ? "Reprendre la génération" : "Générer cette ville"}
                    {Math.max(plan.generate.count, wbGen) > 0 ? ` (${Math.max(plan.generate.count, wbGen)})` : ""}
                  </Button>
                </div>
                <div className="text-[10px] text-muted-foreground space-y-0.5" onClick={(e) => e.stopPropagation()}>
                  {catLine && <div className="font-medium text-foreground/80">{catLine}</div>}
                  {genReason && wbGen === 0 && <div>Générer : {genReason}</div>}
                  {wbGen > 0 && !plan.generate.enabled && <div>Générer : {wbGen} combinaison(s) confirmée(s) par vos décisions — ouvrez « Vérifier et gérer la ville » pour les sélectionner.</div>}
                  {pre && pre.eligible.length > 0 && <div>Publier : {pre.eligible.length} brouillon(s) admissible(s){pre.blocked.length ? `, ${pre.blocked.length} bloqué(s)` : ""}.</div>}
                  {pre?.blocked.map((b) => <div key={`pre-${b.slug}`}>Bloquée {b.slug} : {b.reasons.join(" ")}</div>)}
                  {plan.stalled > 0 && <div>{plan.stalled} génération(s) interrompue(s) — reprises par « Reprendre la génération ».</div>}
                  {retryReason && <div>Régénérer : {retryReason}</div>}
                  {plan.retry.enabled && plan.invalidPublished > 0 && <div>Régénérer : {plan.invalidDrafts} brouillon(s) visé(s); {plan.invalidPublished} page(s) en ligne protégée(s).</div>}
                  {publishReason && <div>Publier : {publishReason}</div>}
                  {pubReport.get(c.slug)?.blocked.map((b) => <div key={b.slug} className="text-destructive">Bloquée {b.slug} : {b.reasons.join(" ")}</div>)}
                  {pubReport.get(c.slug)?.failed.map((b) => <div key={b.slug} className="text-destructive">Échec {b.slug} : {b.error}</div>)}
                  {cv && cv.offCriteria > 0 && <div>Exclues : {cv.offCriteria} page(s) existante(s) hors critères (aucune demande ni service configuré) — conservées, jamais régénérées.</div>}
                </div>
              </div>
            );
          })}
        </div>

        {cities.length === 0 && !loading && (
          <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-lg">Aucune ville pour ce filtre.</div>
        )}
        {cities.length > visible && (
          <div className="text-center">
            <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + 24)}>Afficher plus ({cities.length - visible})</Button>
          </div>
        )}
      </Card>

      {/* ── Audits secondaires : lectures massives (contenu de toutes les pages) chargées sur demande seulement,
           sinon elles saturent la base au chargement et font échouer la liste des villes et la fiche de ville. ── */}
      {!showAudits ? (
        <Card className="p-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">Audits secondaires (combinaisons, qualité, brouillons, publication par lots) : non chargés pour garder la gestion des villes rapide.</p>
          <Button size="sm" variant="outline" onClick={() => setShowAudits(true)}>Afficher les audits secondaires</Button>
        </Card>
      ) : (<>
      {/* ── Audit lecture seule des combinaisons par ville ───────── */}
      <CityCombinationAudit />

      {/* ── Contrôle qualité lecture seule des pages à vérifier ─── */}
      <QaControlPanel cities={state?.cities ?? []} />

      {/* ── Audit lecture seule des brouillons ──────────────────── */}
      <DraftAudit cities={state?.cities ?? []} />

      {/* ── Publication par lots des pages prêtes ───────────────── */}
      <PublishReadyPanel cities={state?.cities ?? []} />
      </>)}

      {/* ── Dialogs ─────────────────────────────────────────────── */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Générer toutes les pages manquantes</DialogTitle></DialogHeader>
          <div className="space-y-1.5 text-sm">
            {confirmationLines(global.preview).map((l) => <p key={l}>{l}</p>)}
            <p className="pt-2 font-medium">Voulez-vous lancer la génération complète ?</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Annuler</Button>
            <Button onClick={() => void launchGlobal()} disabled={global.starting}>
              {global.starting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Lancer la génération
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={errorsOpen} onOpenChange={setErrorsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" /> Pages en erreur — {totals?.errors ?? 0}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-xs">
            {errorProblems.length === 0 && <div className="text-muted-foreground">Aucune erreur réelle : toutes les pages prévues existent et sont valides.</div>}
            {errorProblems.map((problem) => (
              <ProblemRow key={`${problem.city_slug}|${problem.material_slug ?? ""}|${problem.service_slug ?? ""}`} problem={problem} busy={busy}
                onRepair={() => act(`problem-${problem.city_slug}-${problem.material_slug ?? problem.service_slug ?? "hub"}`, async () => {
                  const o = await repairCity([toRepairSlot(problem)]);
                  if (o.skipped[0]) throw new Error(o.skipped[0].reason);
                  if (o.failed[0]) throw new Error(o.failed[0].error);
                  void reload();
                }, `Régénération terminée — ${problem.city_name} · ${problem.label}`)} />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={problemsOpen} onOpenChange={setProblemsOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
          <DialogHeader><DialogTitle>Pages prévues non encore générées — {state?.problems.length ?? 0}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {(state?.problems ?? []).map((problem) => (
              <ProblemRow key={`${problem.city_slug}|${problem.material_slug ?? ""}|${problem.service_slug ?? ""}`} problem={problem} busy={busy}
                onRepair={() => act(`problem-${problem.city_slug}-${problem.material_slug ?? problem.service_slug ?? "hub"}`, async () => {
                  const o = await repairCity([toRepairSlot(problem)]);
                  if (o.skipped[0]) throw new Error(o.skipped[0].reason);
                  if (o.failed[0]) throw new Error(o.failed[0].error);
                  void reload();
                }, `Régénération terminée — ${problem.city_name} · ${problem.label}`)} />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!logsCity} onOpenChange={(o) => !o && setLogsCity(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Logs — {logsCity}</DialogTitle></DialogHeader>
          <div className="space-y-1 text-xs font-mono">
            {logs.length === 0 && <div className="text-muted-foreground">Aucune tâche enregistrée pour cette ville.</div>}
            {logs.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-2 py-1 border-b border-border last:border-0">
                <Badge variant="outline" className="text-[10px]">{l.status}</Badge>
                <span>{[l.material_slug, l.service_slug].filter(Boolean).join(" · ") || "hub"}</span>
                <span className="text-muted-foreground">{l.step ?? "—"}</span>
                <span className="ml-auto text-muted-foreground">{new Date(l.updated_at).toLocaleString("fr-CA")}</span>
                {l.last_error && <span className="text-destructive w-full break-words">{l.last_error}</span>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <CityDetailDialog
        city={workCity}
        run={gen.run && workCity && gen.run.citySlug === workCity.slug ? gen.run : null}
        lockedByOther={!!gen.lockedBy && gen.lockedBy !== workCity?.slug}
        onClose={() => { setWorkSlug(null); void reload(); }}
        onGenerate={(city) => void gen.generateCity(city)}
        onRegenerateErrors={(city) => void gen.regenerateErrors(city)}
        onGenerateSlot={(city, slot) => void gen.generate(city, [slot], slot.state === "invalid" ? "repair" : "missing")}
      />

      <CityCoverageDialog city={coverageCity} onClose={() => setCoverageCity(null)} />
      <PublishConfirmDialog city={publishCity} pre={publishCity ? precheckFor(publishCity.slug, publishCity.name) : undefined}
        onClose={() => setPublishCity(null)}
        onConfirm={(slugs) => { const pc = publishCity!; setPublishCity(null); void act(`pub-${pc.slug}`, async () => {
          const o = await publishCityDrafts(pc.slug, pc.name, undefined, { removeGenerationNoindex: true, onlySlugs: slugs, isAvailable: availFor(pc.slug) });
          setPubReport((m) => new Map(m).set(pc.slug, o));
          void reload();
          return publishOutcomeMessage(o);
        }, `Publication — ${pc.name}`); }} />
      <UnknownDecisionDialog city={unknownCity} onClose={() => setUnknownCity(null)} onSaved={() => setDecTick((t) => t + 1)}
        items={(() => {
          const cv0 = unknownCity ? cov.get(unknownCity.slug) : null;
          if (!cv0 || !unknownCity) return [];
          const inp = withConfirmed(unknownCity.slug, buildCatInput(unknownCity.slug, cv0.items as never, (state?.problems ?? []) as never, exclusionsFor(unknownCity.slug), { activeRun: !!state?.active_run }));
          return cv0.items.filter((it) => it.kind !== "hub" && classify(it as never, inp) === "missing_unknown")
            .map((it) => ({ kind: it.kind as "material" | "service", slug: it.slug as string, label: it.label }));
        })()} />

      <CityWorkbenchDialog city={wbCity} rows={wbCity ? wbRowsFor(wbCity.slug, wbCity.name) : []} focus={wbFocus}
        loadState={!wbCity ? "ok" : precheckErr || srvErr || covState === "error" ? "error" : !cov.get(wbCity.slug) || !precheckRaw || !srvAvail ? "loading" : "ok"}
        onClose={() => { setWbCity(null); setWbFocus(null); }} onVerify={verifyWb}
        onDecideRows={wbCity ? decideRows(wbCity) : undefined}
        run={wbCity ? wbRun(wbCity) : {}} evidence={wbEvidence} />
      <CityPagesDialog
        citySlug={pagesCity?.slug ?? null}
        cityName={pagesCity?.name}
        onClose={() => setPagesCity(null)}
        onChanged={() => void reload()}
      />
    </div>
  );
}

function ProblemRow({ problem, busy, onRepair }: { problem: ControlProblem; busy: string | null; onRepair: () => void }) {
  const key = `problem-${problem.city_slug}-${problem.material_slug ?? problem.service_slug ?? "hub"}`;
  const status = problem.gen_state === "error" ? "ERREUR" : problem.gen_state === "invalid" ? "INVALIDE" : problem.gen_state === "pending" ? "EN ATTENTE" : "À GÉNÉRER";
  return (
    <div className="rounded-lg border border-border p-3 text-xs space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{problem.city_name}</strong><span>— {problem.label}</span>
        <Badge variant="outline">{problem.kind === "material" ? "Matériau" : problem.kind === "service" ? "Service" : "Hub"}</Badge>
        <Badge variant="outline" className={problem.gen_state === "error" ? "text-destructive border-destructive/30" : "text-amber-700 border-amber-500/30"}>{status}</Badge>
        <Button size="sm" className="h-7 ml-auto" disabled={busy === key || problem.gen_state === "pending"} onClick={onRepair}>
          {busy === key ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />} Régénérer
        </Button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
        <span>Statut tâche : {problem.task_status ?? "aucune"}</span>
        <span>Tentatives : {problem.task_attempts ?? 0}</span>
        <span>Dernière tentative : {problem.task_updated_at ? new Date(problem.task_updated_at).toLocaleString("fr-CA") : "jamais"}</span>
      </div>
      {(problem.task_error || problem.issues?.length) && <div className="text-destructive break-words">{problem.task_error ?? problem.issues?.join(" · ")}</div>}
    </div>
  );
}

function Kpi({ label, value, tone, hint }: { label: string; value: string; tone?: "good" | "bad" | "muted"; hint?: string }) {
  const cls = tone === "good" ? "text-green-700" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3 h-full">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold leading-tight ${cls}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

const SHOWN: CatState[] = ["published_indexable", "published_noindex", "draft_ready", "draft_noindex", "draft_error", "missing_confirmed", "missing_unknown", "excluded_missing", "pending", "stalled", "failed"];

function catalogGaps(k: CatSummary): string {
  return SHOWN.filter((x) => k[x] > 0).map((x) => `${CAT_STATE_LABEL[x]} : ${k[x]}`).join(" · ")
    + (k.excludedExisting > 0 ? ` · Exclues mais déjà publiées (à décider) : ${k.excludedExisting}` : "");
}

/** Combinaisons sans page publiée, regroupées par raison (même lignes que la fenêtre de ville). */
export function missingGroups(rows: WbRow[]): { title: string; reason: string; items: string[] }[] {
  const g: { title: string; reason: string; test: (r: WbRow) => boolean }[] = [
    { title: "Manquantes — disponibilité confirmée", reason: "générables par « Générer » (confirmation et coût affichés avant)", test: (r) => !r.pageSlug && r.availability === "confirmee" && !r.state.startsWith("published") },
    { title: "Manquantes — disponibilité inconnue", reason: "non générables : aucune preuve ni décision — décider d'abord", test: (r) => !r.pageSlug && r.availability === "inconnue" },
    { title: "Brouillons à corriger ou publier", reason: "voir « Vérifier et gérer la ville » (qualité ≥ 90 et disponibilité confirmée requises)", test: (r) => !!r.pageId },
    { title: "Exclues", reason: "jamais générées ni publiées", test: (r) => !r.pageSlug && r.availability === "exclue" },
  ];
  return g.map((x) => ({ title: x.title, reason: x.reason, items: rows.filter(x.test).map((r) => r.label) })).filter((x) => x.items.length > 0);
}

function CatStateLine({ s }: { s: CatSummary }) {
  return <div className="text-muted-foreground leading-snug">{catalogGaps(s)}</div>;
}

export function CatalogTotals({ s, complete, cities }: { s: CatSummary; complete: number; cities: number }) {
  return (
    <div className="rounded-lg border border-border p-3 text-xs space-y-1">
      <div className="font-semibold text-sm">Couverture réelle du catalogue : {s.published_indexable + s.published_noindex} / {s.total - s.excluded_missing} ({s.coveredPct} %) · {complete} / {cities} villes complètes</div>
      <div className="text-muted-foreground">{s.total} combinaisons théoriques. {catalogGaps(s)}</div>
      <div className="text-muted-foreground">Prochains lots : {s.missing_confirmed + s.failed + s.stalled} génération(s) admissible(s) ≈ {estimateCredits(s.missing_confirmed + s.failed + s.stalled)} crédit(s); {s.draft_error} brouillon(s) à régénérer ≈ {estimateCredits(s.draft_error)} crédit(s); {s.missing_unknown} combinaison(s) inconnue(s) non générées tant que leur admissibilité n'est pas confirmée.</div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";
import { toast } from "sonner";
import { generationTargets } from "@/lib/seo/cityActions";

/**
 * SOURCE UNIQUE de la génération SEO ville par ville.
 * Utilisée à la fois par le Générateur et par le Centre de pilotage :
 * aucune deuxième architecture parallèle, aucune génération automatique.
 */

export type CityRow = {
  slug: string; name: string; region: string | null; request_count: number;
  expected: number; existing: number; published: number; drafts: number;
  valid: number; missing: number; pending: number; errors: number;
  last_generated_at: string | null;
  run_total: number | null; run_done: number | null; run_label: string | null;
  status: "done" | "partial" | "errors" | "running" | "pending_start";
};

export type ActiveRun = {
  id: string; city_slug: string; total: number; done: number;
  succeeded: number; failed: number; started_at: string | null; current_label: string | null;
} | null;

export type Overview = {
  cities: CityRow[];
  computed_at: string;
  active_run: ActiveRun;
  totals: { cities: number; done: number; partial: number; errors: number; running: number; waiting: number };
};

export type Slot = {
  kind: "hub" | "material" | "service";
  material_slug: string | null; service_slug: string | null; label: string;
  page_id: string | null; page_slug: string | null; status: string | null; noindex: boolean;
  seo_score: number | null; qa_score: number | null; word_count: number | null;
  internal_link_count: number | null; last_generated_at: string | null;
  task_status: string | null; task_error: string | null; task_attempts: number | null;
  problems: string[] | null;
  state: "missing" | "pending" | "error" | "invalid" | "draft" | "published";
};

export type CityReport = {
  city_slug: string; city_name: string; computed_at: string; slots: Slot[];
  summary: { expected: number; existing: number; valid?: number; published: number; drafts: number; missing: number; pending: number; errors: number };
};

export type RunHistory = {
  id: string; status: string; total: number; succeeded: number; failed: number;
  started_at: string | null; finished_at: string | null; duration_seconds: number | null;
  created_by_email: string | null;
};

export type Ref = { slug: string; name: string; short_name?: string | null; description?: string | null };

/** Progression locale d'une génération manuelle en cours (miroir du job en base). */
export type LocalRun = {
  jobId: string | null; citySlug: string; cityName: string;
  total: number; done: number; created: number; errors: number;
  label: string | null; log: string[];
};

export async function fetchReport(slug: string): Promise<CityReport | null> {
  const { data, error } = await supabase.rpc("seo_city_generation_report" as never, { _city_slug: slug } as never);
  if (error) throw error;
  return (data as unknown as CityReport) ?? null;
}

export function useCityGeneration() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [materials, setMaterials] = useState<Ref[]>([]);
  const [services, setServices] = useState<Ref[]>([]);
  const [run, setRun] = useState<LocalRun | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const runRef = useRef<LocalRun | null>(null);
  runRef.current = run;

  /** Relecture pure des données réelles. Ne déclenche aucune génération. */
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const [ov, m, s] = await Promise.all([
        supabase.rpc("seo_city_generation_overview" as never),
        supabase.from("seo_materials").select("slug,name,short_name,description").eq("active", true).order("sort_order"),
        supabase.from("seo_services").select("slug,name,description").eq("active", true).order("sort_order"),
      ]);
      if (ov.error) throw ov.error;
      setOverview(ov.data as unknown as Overview);
      if (m.data) setMaterials(m.data as Ref[]);
      if (s.data) setServices(s.data as Ref[]);
    } catch (e) {
      if (!opts?.silent) toast.error(e instanceof Error ? e.message : "Chargement impossible");
    } finally { if (!opts?.silent) setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const dbActive = overview?.active_run ?? null;
  const hasActivity = !!run || !!dbActive;
  useEffect(() => {
    if (!hasActivity) return;
    const t = window.setInterval(() => { void load({ silent: true }); }, 6000);
    return () => window.clearInterval(t);
  }, [hasActivity, load]);

  const lockedBy = run?.citySlug ?? dbActive?.city_slug ?? null;

  const bySlug = useMemo(() => {
    const map = new Map<string, CityRow>();
    for (const c of overview?.cities ?? []) map.set(c.slug, c);
    return map;
  }, [overview]);

  /**
   * Génère UNIQUEMENT les emplacements demandés de CETTE ville.
   * Chaque page est enregistrée immédiatement par l'edge function et la
   * progression est écrite en base après chaque page (reprise possible).
   */
  const generate = useCallback(async (city: CityRow, targets: Slot[], mode: "missing" | "repair") => {
    if (targets.length === 0) return;
    if (runRef.current) { toast.error("Une autre ville est en cours de génération."); return; }
    const question = mode === "missing"
      ? `Générer ${targets.length} page(s) manquante(s) pour ${city.name} ? Les pages existantes ne seront pas touchées.`
      : `Régénérer ${targets.length} page(s) en défaut de ${city.name} ? Les pages valides ne seront pas touchées et aucune URL ne change.`;
    if (!window.confirm(question)) return;

    let jobId: string | null = null;
    try {
      const { data } = await supabase.rpc("seo_city_run_start" as never, { _city_slug: city.slug, _total: targets.length } as never);
      jobId = (data as unknown as string) ?? null;
    } catch { /* l'historique reste facultatif */ }

    const state: LocalRun = {
      jobId, citySlug: city.slug, cityName: city.name,
      total: targets.length, done: 0, created: 0, errors: 0, label: null, log: [],
    };
    setRun({ ...state });
    const details: Array<Record<string, unknown>> = [];

    for (const slot of targets) {
      state.label = slot.label;
      setRun({ ...state });
      const material = slot.material_slug ? materials.find((m) => m.slug === slot.material_slug) : undefined;
      const service = slot.service_slug ? services.find((x) => x.slug === slot.service_slug) : undefined;
      try {
        const { data, error } = await invokeWithFreshSession<Record<string, unknown>, { created?: boolean; skipped?: boolean; error?: string }>(
          "seo-generate-page",
          {
            city: { slug: city.slug, name: city.name, region: city.region },
            material: material ? { slug: material.slug, name: material.name, short_name: material.short_name, description: material.description } : undefined,
            service: service ? { slug: service.slug, name: service.name, description: service.description } : undefined,
            publish: false,
            allow_ai: true,
            force: mode === "repair",
            confirm_overwrite: mode === "repair",
            bypass_cache: mode === "repair",
          },
        );
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (data?.skipped) state.log = [`⏭️ ${slot.label} — déjà existante`, ...state.log].slice(0, 80);
        else { state.created += 1; state.log = [`✅ ${slot.label}`, ...state.log].slice(0, 80); }
        details.push({ label: slot.label, ok: true });
      } catch (e) {
        state.errors += 1;
        const msg = e instanceof Error ? e.message : "Erreur inconnue";
        state.log = [`❌ ${slot.label} — ${msg}`, ...state.log].slice(0, 80);
        details.push({ label: slot.label, ok: false, error: msg });
      }
      state.done += 1;
      setRun({ ...state });
      // Persistance de la progression après CHAQUE page
      if (jobId) {
        try {
          await supabase.rpc("seo_city_run_progress" as never, {
            _job_id: jobId, _done: state.done, _created: state.created,
            _errors: state.errors, _current_label: slot.label,
          } as never);
        } catch { /* la page reste enregistrée même si le suivi échoue */ }
      }
      void load({ silent: true });
    }

    if (jobId) {
      try { await supabase.rpc("seo_city_run_finish" as never, { _job_id: jobId, _created: state.created, _errors: state.errors, _details: details } as never); }
      catch { /* historique facultatif */ }
    }
    setRun(null);
    await load({ silent: true });
    toast.success(`${city.name} : ${state.created} page(s) créée(s), ${state.errors} erreur(s). Aucune publication automatique.`);
  }, [materials, services, load]);

  /**
   * Génère / reprend une ville : emplacements manquants, en échec et — si aucune exécution
   * n'est active — tâches interrompues. Chaque emplacement n'est ciblé qu'une fois; la fonction
   * serveur ignore toute page déjà existante (aucun doublon, aucun appel IA inutile).
   */
  const generateCity = useCallback(async (city: CityRow, opts?: { includeStalled?: boolean }) => {
    try {
      const report = await fetchReport(city.slug);
      const targets = generationTargets((report?.slots ?? []) as Slot[], !!opts?.includeStalled);
      if (targets.length === 0) { toast.info(`${city.name} : aucune page manquante.`); return; }
      await generate(city, targets, "missing");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Rapport indisponible"); }
  }, [generate]);

  /** Régénère uniquement les pages réellement en défaut de cette ville. */
  const regenerateErrors = useCallback(async (city: CityRow) => {
    try {
      const report = await fetchReport(city.slug);
      const targets = (report?.slots ?? []).filter((s) => s.state === "invalid");
      if (targets.length === 0) { toast.info(`${city.name} : aucune page en défaut.`); return; }
      await generate(city, targets, "repair");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Rapport indisponible"); }
  }, [generate]);

  /** Vérifie UNIQUEMENT cette ville (lecture seule, aucune page touchée). */
  const verifyCity = useCallback(async (city: CityRow) => {
    setVerifying(city.slug);
    try {
      const report = await fetchReport(city.slug);
      const s = report?.summary;
      await load({ silent: true });
      if (!s) return;
      const verdict = s.missing === 0 && s.errors === 0
        ? `🟢 ${city.name} : TERMINÉE — ${s.existing}/${s.expected} page(s) valides.`
        : s.errors > 0
          ? `🔴 ${city.name} : ${s.errors} page(s) à corriger sur ${s.expected}.`
          : `🟠 ${city.name} : PARTIELLE — ${s.existing}/${s.expected}, ${s.missing} manquante(s).`;
      toast.info(verdict);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Vérification impossible"); }
    finally { setVerifying(null); }
  }, [load]);

  return {
    overview, loading, materials, services, run, verifying, dbActive, lockedBy, bySlug,
    load, generate, generateCity, regenerateErrors, verifyCity,
  };
}

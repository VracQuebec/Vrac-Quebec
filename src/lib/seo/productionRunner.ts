/**
 * Production par lots de la File de production SEO.
 *
 * Ce module NE contient PAS de moteur de génération : il orchestre uniquement
 * des appels au moteur existant (seo-generate-page + seo-qa-check) fournis via
 * les dépendances. Aucune page existante n'est régénérée : chaque cible est
 * revérifiée en base juste avant génération (SKIP si elle existe déjà).
 */

export type RunTarget = {
  key: string;
  priority: 1 | 2 | 3 | 4;
  label: string;
  city?: { slug: string; name: string; region: string };
  material?: { slug: string; name: string; short_name?: string; description?: string };
  service?: { slug: string; name: string; description?: string };
  score: number;
};

export type GenerateResult = {
  ok: boolean;
  score?: number;
  blockers?: string[];
  warnings?: string[];
  slug?: string;
  error?: string;
};

export type BatchLog = {
  index: number;
  startedAt: number;
  finishedAt: number | null;
  requested: number;
  generated: number;
  conforme: number;
  aVerifier: number;
  errors: number;
  skipped: number;
};

export type RunIssue = { key: string; label: string; reason: string; kind: "error" | "qa" };

export type RunState = {
  status: "idle" | "running" | "paused" | "done";
  batchSize: number;
  threshold: number;
  startedAt: number | null;
  finishedAt: number | null;
  total: number;
  processedKeys: string[];
  produced: number;
  conforme: number;
  aVerifier: number;
  errors: number;
  skipped: number;
  currentLabel: string;
  batches: BatchLog[];
  issues: RunIssue[];
};

export type RunDeps = {
  /** Vérifie en base, juste avant génération, si la combinaison existe déjà. */
  exists: (target: RunTarget) => Promise<boolean>;
  /** Moteur existant : génération + contrôle qualité. */
  generate: (target: RunTarget, threshold: number) => Promise<GenerateResult>;
  log?: (msg: string, tone: "info" | "ok" | "warn" | "err") => void;
  onBatchEnd?: () => void | Promise<void>;
};

export const PRODUCTION_RUN_KEY = "seo_production_run_v1";

export function emptyRunState(batchSize = 25, threshold = 90): RunState {
  return {
    status: "idle",
    batchSize,
    threshold,
    startedAt: null,
    finishedAt: null,
    total: 0,
    processedKeys: [],
    produced: 0,
    conforme: 0,
    aVerifier: 0,
    errors: 0,
    skipped: 0,
    currentLabel: "",
    batches: [],
    issues: [],
  };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/** Cibles admissibles réellement manquantes, triées par priorité puis score. */
export function selectMissingTargets<T extends RunTarget & { existing?: unknown }>(
  items: T[],
  filterPriority: 0 | 1 | 2 | 3 | 4 = 0,
): RunTarget[] {
  const seen = new Set<string>();
  return items
    .filter((i) => !i.existing)
    .filter((i) => filterPriority === 0 || i.priority === filterPriority)
    .filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)))
    .sort((a, b) => (a.priority - b.priority) || (b.score - a.score))
    .map(({ key, priority, label, city, material, service, score }) => ({ key, priority, label, city, material, service, score }));
}

/** Reprise : on retire les cibles déjà traitées lors du run précédent. */
export function remainingTargets(targets: RunTarget[], processedKeys: string[]): RunTarget[] {
  const done = new Set(processedKeys);
  return targets.filter((t) => !done.has(t.key));
}

export function runProgress(state: RunState): { done: number; remaining: number; percent: number } {
  const done = state.processedKeys.length;
  const remaining = Math.max(0, state.total - done);
  const percent = state.total > 0 ? Math.round((done / state.total) * 100) : 0;
  return { done, remaining, percent };
}

type Listener = (state: RunState) => void;

class ProductionRunner {
  private state: RunState = emptyRunState();
  private listeners = new Set<Listener>();
  private pauseRequested = false;
  private active = false;

  getState(): RunState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => { this.listeners.delete(fn); };
  }

  hydrate() {
    if (this.active || typeof localStorage === "undefined") return this.state;
    try {
      const raw = localStorage.getItem(PRODUCTION_RUN_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RunState;
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.processedKeys)) {
          this.state = { ...emptyRunState(), ...parsed, status: parsed.status === "running" ? "paused" : parsed.status };
        }
      }
    } catch { /* état local illisible : on repart à vide */ }
    return this.state;
  }

  reset() {
    if (this.active) return;
    this.state = emptyRunState(this.state.batchSize, this.state.threshold);
    this.persist();
    this.emit();
  }

  pause() {
    if (!this.active) return;
    this.pauseRequested = true;
  }

  isActive() {
    return this.active;
  }

  private emit() {
    const snapshot = this.state;
    for (const fn of this.listeners) fn(snapshot);
  }

  private set(patch: Partial<RunState>) {
    this.state = { ...this.state, ...patch };
    this.persist();
    this.emit();
  }

  private persist() {
    if (typeof localStorage === "undefined") return;
    try { localStorage.setItem(PRODUCTION_RUN_KEY, JSON.stringify(this.state)); } catch { /* quota */ }
  }

  /**
   * Lance (ou reprend) la production. `targets` doit déjà être la liste des
   * cibles admissibles manquantes ; les cibles déjà traitées sont ignorées
   * quand `resume` est vrai.
   */
  async start(
    targets: RunTarget[],
    opts: { batchSize: number; threshold: number; resume?: boolean },
    deps: RunDeps,
  ): Promise<RunState> {
    if (this.active) return this.state;
    const resume = opts.resume === true;
    const pending = resume ? remainingTargets(targets, this.state.processedKeys) : targets;

    this.active = true;
    this.pauseRequested = false;
    const base = resume
      ? { ...this.state }
      : { ...emptyRunState(opts.batchSize, opts.threshold), startedAt: Date.now() };
    this.state = {
      ...base,
      batchSize: opts.batchSize,
      threshold: opts.threshold,
      status: "running",
      startedAt: base.startedAt ?? Date.now(),
      finishedAt: null,
      total: resume ? this.state.processedKeys.length + pending.length : pending.length,
    };
    this.persist();
    this.emit();

    const batches = chunk(pending, opts.batchSize);
    deps.log?.(
      `${resume ? "Reprise" : "Démarrage"} de la production : ${pending.length} page(s) manquante(s), lots de ${opts.batchSize}, seuil QA ${opts.threshold}.`,
      "info",
    );

    for (const batch of batches) {
      if (this.pauseRequested) break;
      const index = this.state.batches.length + 1;
      const entry: BatchLog = {
        index, startedAt: Date.now(), finishedAt: null,
        requested: batch.length, generated: 0, conforme: 0, aVerifier: 0, errors: 0, skipped: 0,
      };
      this.set({ batches: [...this.state.batches, entry] });

      for (const target of batch) {
        if (this.pauseRequested) break;
        this.set({ currentLabel: target.label });
        try {
          let already = false;
          try {
            already = await deps.exists(target);
          } catch {
            already = true; // en cas de doute on protège l'existant : SKIP
          }
          if (already) {
            entry.skipped++;
            this.applyEntry(entry, target.key, { skipped: this.state.skipped + 1 });
            deps.log?.(`⏭️ ${target.label} — déjà existante, ignorée (aucun doublon)`, "info");
            continue;
          }
          const res = await deps.generate(target, opts.threshold);
          if (!res.ok) {
            entry.errors++;
            this.applyEntry(entry, target.key, {
              errors: this.state.errors + 1,
              issues: [...this.state.issues, { key: target.key, label: target.label, reason: res.error || "Erreur inconnue", kind: "error" }],
            });
            deps.log?.(`❌ ${target.label} — ${res.error ?? "erreur"}`, "err");
            await sleep(1500);
            continue;
          }
          entry.generated++;
          const blockers = res.blockers ?? [];
          if (blockers.length > 0 || (typeof res.score === "number" && res.score < opts.threshold)) {
            entry.aVerifier++;
            this.applyEntry(entry, target.key, {
              produced: this.state.produced + 1,
              aVerifier: this.state.aVerifier + 1,
              issues: [...this.state.issues, {
                key: target.key, label: target.label, kind: "qa",
                reason: blockers.length > 0 ? blockers.join(" ; ") : `Score QA ${res.score}/${opts.threshold}`,
              }],
            });
            deps.log?.(`⚠️ ${target.label} — score ${res.score ?? "—"}, à vérifier`, "warn");
          } else {
            entry.conforme++;
            this.applyEntry(entry, target.key, {
              produced: this.state.produced + 1,
              conforme: this.state.conforme + 1,
            });
            deps.log?.(`✅ ${target.label} — score ${res.score ?? "—"} (brouillon non indexable)`, "ok");
          }
        } catch (e) {
          entry.errors++;
          this.applyEntry(entry, target.key, {
            errors: this.state.errors + 1,
            issues: [...this.state.issues, { key: target.key, label: target.label, reason: e instanceof Error ? e.message : String(e), kind: "error" }],
          });
          deps.log?.(`❌ ${target.label} — ${e instanceof Error ? e.message : String(e)}`, "err");
        }
        await sleep(300);
      }

      entry.finishedAt = Date.now();
      this.set({ batches: [...this.state.batches.slice(0, -1), { ...entry }] });
      deps.log?.(
        `Lot #${entry.index} — ${entry.requested} demandées · ${entry.generated} générées · ${entry.conforme} conformes · ${entry.aVerifier} à vérifier · ${entry.skipped} doublon(s) ignoré(s) · ${entry.errors} erreur(s)`,
        entry.errors > 0 ? "warn" : "info",
      );
      await deps.onBatchEnd?.();
    }

    const paused = this.pauseRequested && this.state.processedKeys.length < this.state.total;
    this.active = false;
    this.pauseRequested = false;
    this.set({
      status: paused ? "paused" : "done",
      currentLabel: "",
      finishedAt: paused ? null : Date.now(),
    });
    return this.state;
  }

  private applyEntry(entry: BatchLog, key: string, patch: Partial<RunState>) {
    const batches = [...this.state.batches.slice(0, -1), { ...entry }];
    const processedKeys = this.state.processedKeys.includes(key)
      ? this.state.processedKeys
      : [...this.state.processedKeys, key];
    this.set({ ...patch, batches, processedKeys });
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const productionRunner = new ProductionRunner();
export { ProductionRunner };

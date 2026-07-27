## Objectif

Rendre le moteur d'optimisation SEO complètement autonome : redémarrage auto, adaptation dynamique du parallélisme, rapport final, notification, et UI temps réel enrichie. Plus aucune surveillance manuelle requise.

---

## 1. Autonomie backend (cron + supervisor)

**Supervisor `seo-optimize-supervisor`** (déjà cron chaque minute) — enrichi pour :
- Relancer automatiquement tout run `running` sans progrès depuis > 60s (déjà présent, à durcir).
- **Auto-reprise des runs `paused` orphelins** > 10 min (probable oubli).
- **Requeue automatique des tâches `pending`/`error` avec `next_attempt_at` échu** sans attendre une action manuelle.
- **Adaptation dynamique du parallélisme** : lit le taux de 429 sur les 5 dernières minutes (via `ai_call_log` + tasks) et ajuste `seo_optimization_runs.concurrency` (1 → 5) pour le run actif.
- **Finalisation automatique** du run quand toutes les tâches sont dans un état terminal (`completed`/`skipped`/`error` sans retry) → génère le rapport final et déclenche la notification.

**Worker `seo-optimize-worker`** :
- Respecte la nouvelle valeur `concurrency` relue à chaque batch.
- Sur 429 : incrémente un compteur `rate_limit_hits` sur le run, augmente la pause inter-batch temporairement.

---

## 2. Rapport final + notification

**Nouvelle table `seo_optimization_reports`** liée à chaque run :
- pages_optimized, pages_skipped, pages_failed, errors_fixed
- duration_seconds, ai_calls, cost_estimate
- avg_qa_before, avg_qa_after, avg_qa_delta
- top_fixes (jsonb: comptage des actions appliquées)
- generated_at

**Génération** : RPC `seo_optimization_finalize(_run_id)` appelée par le supervisor à la clôture. Idempotente.

**Notification** :
- Insertion d'une ligne dans une table légère `admin_notifications` (title, body, level, link, read_at) → affichée dans un `<Toaster>` global déjà présent + badge dans le header admin.
- Optionnel : email admin via `send-transactional-email` (template court « Run terminé »). On garde ça derrière un toggle `ai_settings.notify_email_on_run_finish` (défaut off).

---

## 3. UI — `OptimizationEngine.tsx` enrichi

- **Barre de progression** temps réel (déjà partielle) + **ETA calculé** = `(pending_tasks × avg_duration_ms) / concurrency`.
- **Compteurs live** : traitées / restantes / échouées / ignorées / concurrence courante / 429 récents.
- **Bandeau autonome** : "Autopilot activé — aucune action requise". Boutons Pause/Reprendre/Stop restent disponibles.
- **Modal Rapport final** ouvert automatiquement à la fin du run : lit `seo_optimization_reports`, affiche les KPIs + top fixes + avant/après moyen. Bouton "Télécharger CSV" (client-side).
- **Toast** + son discret à la fin.
- Historique enrichi : chaque ligne montre un badge "Rapport" cliquable.

---

## 4. Détails techniques

<details>
<summary>Migrations SQL</summary>

- `seo_optimization_runs` : ajouter `rate_limit_hits int default 0`, `auto_adjusted_concurrency boolean default false`.
- `seo_optimization_reports` : nouvelle table (grants + RLS admin only).
- `admin_notifications` : nouvelle table (grants + RLS admin only, realtime activé).
- RPCs : `seo_optimization_finalize(_run_id uuid)`, `seo_optimization_autotune(_run_id uuid)`.
- Watchdog `seo_optimization_watchdog` : élargi pour finaliser les runs terminés et adapter la concurrence.
</details>

<details>
<summary>Fichiers touchés</summary>

- `supabase/migrations/*` : 1 migration
- `supabase/functions/seo-optimize-supervisor/index.ts` : logique autotune + finalize
- `supabase/functions/seo-optimize-worker/index.ts` : relit concurrency, incrémente rate_limit_hits
- `src/components/seo/OptimizationEngine.tsx` : ETA, compteurs enrichis, modal rapport
- `src/components/seo/OptimizationReportModal.tsx` : nouveau
- `src/hooks/useAdminNotifications.ts` : nouveau (realtime + toasts)
- `src/pages/Admin.tsx` (ou shell admin) : monte le hook global
</details>

<details>
<summary>Hors scope</summary>

- Pas de refonte du scoring QA.
- Pas de changement des règles d'autofix.
- Pas de facturation ni de quotas.
</details>

---

## Résultat attendu

Un clic sur **Démarrer** suffit. Le moteur tourne, s'auto-ajuste, se relance seul en cas d'arrêt, finalise le run, affiche un rapport complet et notifie l'admin. Zéro babysitting.

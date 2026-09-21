import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ExternalLink, Save, X, RotateCcw, Check, AlertTriangle, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ActionGroup, ActionPriorityPage } from "@/lib/seo/actionGroups";
import {
  CAPABILITY_LABEL, MODE_LABEL, availableModes, buildBatchPlan, applyBatchResult, batchProgress, retryErrors,
  buildContentProposal, contentDiffSummary, contentWordCount, currentInternalLinks, ctaDestinations,
  extractCta, mergeInternalLinks, suggestCta, suggestInternalLinks, upsertCtaBlock,
  validateCta, validateContent, validateInternalLinks,
  buildLogEntry, capabilityOfGroup, hasChanges, runVerification, suggestMeta, validateMeta,
  publishState, validatePublish, detectConcurrentChange, buildRestorePlan, canRestore,
  type BatchItem, type ContentDraft, type CtaDraft, type EditablePage, type InternalLinkItem,
  type LinkCandidate, type MetaDraft, type WorkCapability, type WorkMode,
} from "@/lib/seo/workflow";

type LogRow = {
  id: string; status: string; action_type: string; page_id: string | null; page_slug: string | null;
  before_data: unknown; after_data: unknown; error: string | null; created_at: string; note: string | null;
};

const fmtNum = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("fr-CA"));
const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(2)} %`);
const fmtPos = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1));

export default function OpportunityWorkPanel({
  group, priorityPages, open, onClose, onStatus,
}: {
  group: ActionGroup | null;
  priorityPages: ActionPriorityPage[];
  open: boolean;
  onClose: () => void;
  onStatus: (id: string, status: "in_progress" | "completed" | "error" | "open", extra?: { error?: string | null }) => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState<EditablePage[]>([]);
  const [drafts, setDrafts] = useState<Record<string, MetaDraft>>({});
  const [contentDrafts, setContentDrafts] = useState<Record<string, ContentDraft>>({});
  const [ctaDrafts, setCtaDrafts] = useState<Record<string, CtaDraft>>({});
  const [linkSel, setLinkSel] = useState<Record<string, Set<string>>>({});
  const [candidates, setCandidates] = useState<LinkCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<BatchItem[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<WorkMode>("titles_meta");
  const [confirming, setConfirming] = useState<string[] | null>(null);
  const [restoring, setRestoring] = useState<LogRow | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);

  const capability: WorkCapability = group ? capabilityOfGroup(group) : "not_configured";
  const modes: WorkMode[] = group ? availableModes(group.primary.type) : [];

  const loadLogs = useCallback(async (oppId: string) => {
    const { data } = await supabase
      .from("seo_opportunity_actions")
      .select("id,status,action_type,page_id,page_slug,before_data,after_data,error,created_at,note")
      .eq("opportunity_id", oppId)
      .order("created_at", { ascending: false })
      .limit(50);
    setLogs((data ?? []) as LogRow[]);
  }, []);

  const load = useCallback(async (opts?: { keepBatch?: boolean }) => {
    if (!group) return;
    setLoading(true);
    setLoadError(null);
    try {
      const slugs = priorityPages.map((p) => p.slug).filter((s): s is string => Boolean(s));
      const cols = "id,slug,title,meta_title,meta_description,city_slug,service_slug,status,noindex,google_index_status,qa_last_score,qa_blockers,intro,word_count,internal_links,content_html";
      let query = supabase.from("seo_pages").select(cols);
      if (group.kind === "page") {
        const pid = group.primary.page_id;
        query = pid ? query.eq("id", pid) : query.in("slug", slugs.length ? slugs : ["__none__"]);
      } else if (slugs.length) {
        query = query.in("slug", slugs);
      } else if (group.service && group.city) {
        query = query.eq("service_slug", group.service).eq("city_slug", group.city);
      } else if (group.service) {
        query = query.eq("service_slug", group.service);
      } else if (group.city) {
        query = query.eq("city_slug", group.city);
      } else {
        query = query.in("slug", ["__none__"]);
      }
      const { data, error } = await query.limit(200);
      if (error) throw error;
      const rows = (data ?? []) as unknown as EditablePage[];
      setPages(rows);
      const d: Record<string, MetaDraft> = {};
      const c: Record<string, ContentDraft> = {};
      const ct: Record<string, CtaDraft> = {};
      const ls: Record<string, Set<string>> = {};
      for (const p of rows) {
        d[p.id] = { title: p.title ?? "", meta_description: p.meta_description ?? "" };
        c[p.id] = { intro: p.intro ?? "", content_html: p.content_html ?? "" };
        ct[p.id] = extractCta(p.content_html ?? "") ?? suggestCta(p);
        ls[p.id] = new Set();
      }
      setDrafts(d); setContentDrafts(c); setCtaDrafts(ct); setLinkSel(ls);
      if (!opts?.keepBatch) {
        setSelected(new Set(rows.map((p) => p.id)));
        setBatch(null);
        setMode((availableModes(group.primary.type)[0] ?? "titles_meta") as WorkMode);
      }
      setConfirming(null);

      // Candidats de maillage : uniquement des pages SEO réelles du même territoire/service.
      const cities = [...new Set(rows.map((p) => p.city_slug).filter(Boolean))] as string[];
      const services = [...new Set(rows.map((p) => p.service_slug).filter(Boolean))] as string[];
      if (cities.length || services.length) {
        const ors: string[] = [];
        if (cities.length) ors.push(`city_slug.in.(${cities.join(",")})`);
        if (services.length) ors.push(`service_slug.in.(${services.join(",")})`);
        const { data: cand } = await supabase
          .from("seo_pages")
          .select("slug,title,city_slug,service_slug")
          .eq("status", "published")
          .or(ors.join(","))
          .limit(120);
        setCandidates((cand ?? []) as LinkCandidate[]);
      } else {
        setCandidates([]);
      }
      await loadLogs(group.primary.id);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Impossible de charger les données de cette opportunité");
    } finally {
      setLoading(false);
    }
  }, [group, priorityPages, loadLogs]);

  useEffect(() => { if (open && group) void load(); }, [open, group, load]);

  const metrics = useMemo(() => new Map(priorityPages.map((p) => [p.slug ?? "", p])), [priorityPages]);
  const knownSlugs = useMemo(() => candidates.map((c) => c.slug), [candidates]);

  if (!group) return null;
  const o = group.primary;

  const log = async (entry: ReturnType<typeof buildLogEntry>) => {
    const { data: session } = await supabase.auth.getUser();
    await supabase.from("seo_opportunity_actions").insert({
      opportunity_id: entry.opportunity_id,
      action_key: entry.action_key,
      action_kind: entry.action_kind,
      action_type: entry.action_type,
      capability: entry.capability,
      status: entry.status,
      page_id: entry.page_id,
      page_slug: entry.page_slug,
      before_data: entry.before_data as never,
      after_data: entry.after_data as never,
      error: entry.error,
      note: entry.note,
      user_id: session.user?.id ?? null,
    });
  };

  /** Ce qui changerait réellement pour une page, selon le mode. Null = rien à faire. */
  const buildChange = (p: EditablePage): { update: Record<string, unknown>; before: Record<string, unknown>; after: Record<string, unknown>; summary: string } | null => {
    if (mode === "titles_meta") {
      const draft = drafts[p.id];
      if (!draft || !hasChanges(p, draft)) return null;
      return {
        update: { title: draft.title, meta_description: draft.meta_description },
        before: { title: p.title, meta_description: p.meta_description },
        after: { title: draft.title, meta_description: draft.meta_description },
        summary: `/${p.slug} — titre et meta description`,
      };
    }
    if (mode === "content") {
      const draft = contentDrafts[p.id];
      if (!draft) return null;
      const before: ContentDraft = { intro: p.intro ?? "", content_html: p.content_html ?? "" };
      if (draft.content_html === before.content_html && draft.intro === before.intro) return null;
      const diff = contentDiffSummary(before, draft);
      return {
        update: { intro: draft.intro, content_html: draft.content_html, word_count: contentWordCount(draft.content_html) },
        before: { intro: before.intro, content_html: before.content_html, words: diff.wordsBefore },
        after: { intro: draft.intro, content_html: draft.content_html, words: diff.wordsAfter },
        summary: `/${p.slug} — contenu (${diff.addedWords >= 0 ? "+" : ""}${diff.addedWords} mots${diff.introChanged ? ", intro modifiée" : ""})`,
      };
    }
    if (mode === "cta") {
      const draft = ctaDrafts[p.id];
      if (!draft) return null;
      const current = p.content_html ?? "";
      const existing = extractCta(current);
      if (existing && existing.text === draft.text && existing.href === draft.href) return null;
      const next = upsertCtaBlock(current, draft);
      return {
        update: { content_html: next },
        before: { cta: existing ?? null },
        after: { cta: draft },
        summary: `/${p.slug} — CTA « ${draft.text} » → ${draft.href}`,
      };
    }
    if (mode === "publish") {
      const st = publishState(p);
      if (!st.canPublish) return null;
      return {
        update: { status: "published", published_at: new Date().toISOString() },
        before: { status: p.status ?? null },
        after: { status: "published" },
        summary: `/${p.slug} — publication du brouillon (statut « ${p.status ?? "inconnu"} » → publié)`,
      };
    }
    // maillage interne
    const sel = linkSel[p.id];
    if (!sel || sel.size === 0) return null;
    const current = currentInternalLinks(p);
    const suggestions = suggestInternalLinks(p, candidates);
    const added: InternalLinkItem[] = suggestions.filter((s) => sel.has(s.href)).map((s) => ({ label: s.label, href: s.href, kind: s.kind }));
    if (added.length === 0) return null;
    const merged = mergeInternalLinks(current, added);
    return {
      update: { internal_links: merged, internal_link_count: merged.length },
      before: { internal_links: current, count: current.length },
      after: { internal_links: merged, count: merged.length },
      summary: `/${p.slug} — ${added.length} lien(s) interne(s) ajouté(s)`,
    };
  };

  const validateFor = (p: EditablePage): string | null => {
    if (mode === "titles_meta") {
      const others = pages.filter((x) => x.id !== p.id).map((x) => drafts[x.id]?.title ?? x.title ?? "");
      return validateMeta(drafts[p.id], others)[0]?.message ?? null;
    }
    if (mode === "content") {
      return validateContent({ intro: p.intro ?? "", content_html: p.content_html ?? "" }, contentDrafts[p.id])[0]?.message ?? null;
    }
    if (mode === "cta") return validateCta(ctaDrafts[p.id], p)[0]?.message ?? null;
    if (mode === "publish") return validatePublish(p)[0]?.message ?? null;
    const sel = linkSel[p.id] ?? new Set<string>();
    const added = suggestInternalLinks(p, candidates).filter((s) => sel.has(s.href));
    return validateInternalLinks(added, knownSlugs)[0]?.message ?? null;
  };

  const pendingChanges = () =>
    pages.filter((p) => selected.has(p.id)).map((p) => ({ page: p, change: buildChange(p) })).filter((x) => x.change !== null) as Array<{ page: EditablePage; change: NonNullable<ReturnType<typeof buildChange>> }>;

  const askConfirm = () => {
    const list = pendingChanges();
    if (list.length === 0) { toast.info("Aucune modification à enregistrer."); return; }
    for (const { page } of list) {
      const issue = validateFor(page);
      if (issue) { toast.error(`/${page.slug} : ${issue}`); return; }
    }
    setConfirming(list.map((x) => x.change.summary));
  };

  const errMessage = (e: unknown): string => {
    if (e instanceof Error && e.message) return e.message;
    if (e && typeof e === "object") {
      const r = e as Record<string, unknown>;
      const parts = [r.message, r.details, r.hint, r.code].filter((x) => typeof x === "string" && x) as string[];
      if (parts.length) return parts.join(" · ");
    }
    return "Erreur inconnue";
  };

  const applyChanges = async (restrict?: Set<string>) => {
    const list = pendingChanges().filter((x) => !restrict || restrict.has(x.page.id));
    setConfirming(null);
    setSaving(true);
    let items = buildBatchPlan(pages.map((p) => p.id), new Set(list.map((x) => x.page.id)), Object.fromEntries(pages.map((p) => [p.id, p.slug])));
    setBatch(items);
    await onStatus(o.id, "in_progress");
    await log(buildLogEntry(group, { status: "started", note: `${MODE_LABEL[mode]} — ${list.length} page(s)` }));
    let failures = 0;
    for (const { page, change } of list) {
      try {
        // 16. Protection contre les modifications concurrentes : on relit la page
        // et on refuse d'écraser une modification survenue depuis le chargement.
        const { data: fresh, error: freshError } = await supabase
          .from("seo_pages")
          .select("id,title,meta_description,intro,content_html,internal_links,status")
          .eq("id", page.id)
          .maybeSingle();
        if (freshError) throw freshError;
        const conflict = detectConcurrentChange(page, fresh as never);
        if (conflict) throw new Error(conflict);

        const { error } = await supabase.from("seo_pages")
          .update({ ...change.update, updated_at: new Date().toISOString() } as never)
          .eq("id", page.id);
        if (error) throw error;
        items = applyBatchResult(items, page.id, true);
        await log(buildLogEntry(group, {
          status: "applied", page_id: page.id, page_slug: page.slug,
          before_data: change.before, after_data: change.after, note: MODE_LABEL[mode],
        }));
      } catch (e) {
        failures++;
        const msg = errMessage(e);
        items = applyBatchResult(items, page.id, false, msg);
        await log(buildLogEntry(group, { status: "failed", page_id: page.id, page_slug: page.slug, error: msg, note: MODE_LABEL[mode] }));
      }
      setBatch([...items]);
    }
    setSaving(false);
    if (failures > 0) {
      await onStatus(o.id, "error", { error: `${failures} page(s) en erreur` });
      toast.error(`${failures} page(s) en erreur — vous pouvez réessayer les erreurs.`);
      const failedIds = items.filter((b) => b.status === "error").map((b) => b.page_id);
      await load({ keepBatch: true });
      setBatch([...items]);
      setSelected(new Set(failedIds));
      return;
    } else {
      await onStatus(o.id, "completed");
      toast.success("Modifications enregistrées et opportunité marquée terminée.");
    }
    await load();
  };

  /** 8. Restauration sécurisée : réécrit les valeurs « avant » réellement journalisées. */
  const runRestore = async (entry: LogRow) => {
    const plan = buildRestorePlan(entry.before_data as Record<string, unknown>, entry.page_slug);
    if (!plan || !entry.page_id) { toast.error("Aucune version précédente restaurable pour cette entrée."); return; }
    setRestoreBusy(true);
    try {
      const { data: current, error: readErr } = await supabase
        .from("seo_pages")
        .select("id,title,meta_description,intro,content_html,internal_links,status")
        .eq("id", entry.page_id)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!current) throw new Error("La page n'existe plus en base.");
      const { error } = await supabase.from("seo_pages")
        .update({ ...plan.update, updated_at: new Date().toISOString() } as never)
        .eq("id", entry.page_id);
      if (error) throw error;
      await log(buildLogEntry(group, {
        status: "applied", page_id: entry.page_id, page_slug: entry.page_slug,
        before_data: current as Record<string, unknown>, after_data: plan.update,
        note: `Restauration de la version précédente (${MODE_LABEL[mode]})`,
      }));
      toast.success("Version précédente restaurée. L'historique est conservé.");
      setRestoring(null);
      await load();
    } catch (e) {
      const msg = errMessage(e);
      await log(buildLogEntry(group, {
        status: "failed", page_id: entry.page_id, page_slug: entry.page_slug,
        error: msg, note: "Restauration",
      }));
      toast.error(`Restauration impossible : ${msg}`);
      await loadLogs(o.id);
    } finally {
      setRestoreBusy(false);
    }
  };

  const progress = batch ? batchProgress(batch) : null;
  const toggleSel = (id: string, on: boolean) =>
    setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Travailler sur cette opportunité</DialogTitle>
        </DialogHeader>

        {/* A. ACTION */}
        <div className="rounded-md border border-border p-3 text-xs space-y-1">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="font-display font-bold text-sm text-foreground">{group.title}</span>
            <span className="px-2 py-0.5 rounded border border-border uppercase">{group.kind}</span>
            <span className="px-2 py-0.5 rounded bg-secondary">Score {group.score}</span>
            <span className="px-2 py-0.5 rounded bg-secondary uppercase">{group.priority}</span>
            <span className="px-2 py-0.5 rounded bg-secondary">Statut {o.status}</span>
            <span className="px-2 py-0.5 rounded bg-primary/15 text-primary">{CAPABILITY_LABEL[capability]}</span>
          </div>
          <div className="text-muted-foreground"><span className="text-foreground font-semibold">Pourquoi :</span> {o.reason ?? o.rationale}</div>
          <div className="text-muted-foreground"><span className="text-foreground font-semibold">Action recommandée :</span> {o.recommended_action ?? group.actionLabel}</div>
        </div>

        {/* C. DONNÉES */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
          {[
            ["Pages", group.kind === "page" ? "1" : String(group.pages || "—")],
            ["Impressions", fmtNum(group.impressions)],
            ["Clics", fmtNum(group.clicks)],
            ["CTR", fmtPct(group.ctr)],
            ["Position", fmtPos(group.position)],
            ["Conversions", fmtNum(group.conversions)],
          ].map(([l, v]) => (
            <div key={l} className="rounded-md bg-secondary/40 p-2">
              <div className="text-muted-foreground">{l}</div>
              <div className="font-display font-bold text-foreground">{v}</div>
            </div>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          Territoire {group.city ?? "—"} · Service {group.service ?? "—"} · {group.members.length} signal(aux) regroupé(s)
          {group.kind !== "page" && " · constat de groupe : aucune page n'est créée, seules les pages existantes sont modifiables."}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement des données de cette opportunité…
          </div>
        )}

        {loadError && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            <div className="font-display font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Impossible d'effectuer cette action</div>
            <div>{loadError}</div>
            <button onClick={() => void load()} className="mt-2 underline">Réessayer</button>
          </div>
        )}

        {!loading && !loadError && modes.length === 0 && capability !== "verification" && (
          <div className="rounded-md border border-border p-3 text-sm text-muted-foreground">
            Action à configurer — ce type de signal n'a pas encore d'exécution automatisée. Les pages concernées restent consultables ci-dessous.
          </div>
        )}

        {!loading && !loadError && capability === "verification" && (
          <div className="space-y-3">
            {pages.map((p) => (
              <div key={p.id} className="rounded-md border border-border p-3 text-xs space-y-1">
                <div className="font-display font-semibold text-foreground">{p.title ?? p.slug}</div>
                <a href={`/${p.slug}`} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1"><ExternalLink className="w-3 h-3" /> /{p.slug}</a>
                <ul className="mt-1 space-y-0.5">
                  {runVerification(p).map((c) => (
                    <li key={c.label} className="flex gap-2 text-muted-foreground">
                      <span className={c.ok === true ? "text-primary" : c.ok === false ? "text-destructive" : "text-muted-foreground"}>
                        {c.ok === true ? "✓" : c.ok === false ? "✕" : "•"}
                      </span>
                      <span className="text-foreground">{c.label}</span> — {c.detail}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {pages.length === 0 && <div className="text-xs text-muted-foreground">Aucune page source rattachée à ce signal.</div>}
          </div>
        )}

        {!loading && !loadError && modes.length > 0 && (
          <div className="space-y-3">
            {/* Choix de l'action à exécuter */}
            <div className="flex flex-wrap gap-2 text-xs" data-testid="work-modes">
              {modes.map((m) => (
                <button key={m} onClick={() => { setMode(m); setBatch(null); setConfirming(null); }}
                  data-mode={m}
                  className={`px-2.5 py-1 rounded-md border ${mode === m ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"}`}>
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 text-xs flex-wrap">
              <span className="text-muted-foreground">{pages.length} page(s) chargée(s)</span>
              <button onClick={() => setSelected(new Set(pages.map((p) => p.id)))} className="underline">Tout sélectionner</button>
              <button onClick={() => setSelected(new Set())} className="underline">Tout désélectionner</button>
              {mode === "titles_meta" && (
                <button
                  onClick={() => setDrafts((d) => {
                    const next = { ...d };
                    for (const p of pages) if (selected.has(p.id)) next[p.id] = suggestMeta(p);
                    return next;
                  })}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-secondary">
                  <Wand2 className="w-3 h-3" /> Utiliser les suggestions du Copilote
                </button>
              )}
              {mode === "content" && (
                <button
                  onClick={() => setContentDrafts((d) => {
                    const next = { ...d };
                    for (const p of pages) if (selected.has(p.id)) next[p.id] = buildContentProposal(p).draft;
                    return next;
                  })}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-secondary">
                  <Wand2 className="w-3 h-3" /> Préparer une proposition
                </button>
              )}
              {mode === "cta" && (
                <button
                  onClick={() => setCtaDrafts((d) => {
                    const next = { ...d };
                    for (const p of pages) if (selected.has(p.id)) next[p.id] = suggestCta(p);
                    return next;
                  })}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-secondary">
                  <Wand2 className="w-3 h-3" /> Utiliser le CTA proposé
                </button>
              )}
              {progress && <span className="text-muted-foreground" data-testid="batch-progress">{progress.done + progress.errors} / {progress.total} · ✓ {progress.done} · ⚠ {progress.errors}</span>}
            </div>

            {pages.map((p) => {
              const m = metrics.get(p.slug);
              const item = batch?.find((b) => b.page_id === p.id);
              const metaDraft = drafts[p.id] ?? { title: "", meta_description: "" };
              const cDraft = contentDrafts[p.id] ?? { intro: "", content_html: "" };
              const ctaDraft = ctaDrafts[p.id] ?? { text: "", href: "#soumission" };
              const proposal = mode === "content" ? buildContentProposal(p) : null;
              const suggestions = mode === "internal_links" ? suggestInternalLinks(p, candidates) : [];
              const currentLinks = mode === "internal_links" ? currentInternalLinks(p) : [];
              const sel = linkSel[p.id] ?? new Set<string>();
              const issue = selected.has(p.id) && buildChange(p) ? validateFor(p) : null;
              return (
                <div key={p.id} className="rounded-md border border-border p-3 text-xs space-y-2" data-page-slug={p.slug}>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={selected.has(p.id)}
                      onChange={(e) => toggleSel(p.id, e.target.checked)} />
                    <div className="min-w-0 flex-1">
                      <a href={`/${p.slug}`} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 font-mono truncate">
                        <ExternalLink className="w-3 h-3" /> /{p.slug}
                      </a>
                      <div className="text-muted-foreground flex flex-wrap gap-x-3">
                        <span>{fmtNum(m?.impressions)} impressions</span>
                        <span>{fmtNum(m?.clicks)} clics</span>
                        <span>CTR {fmtPct(m?.ctr)}</span>
                        <span>Position {fmtPos(m?.position)}</span>
                        <span>{fmtNum(m?.conversions)} conversion(s)</span>
                        <span>Indexation {p.google_index_status ?? "inconnue"}</span>
                      </div>
                      <div className="text-muted-foreground">Titre actuel : {p.title ?? "—"} · Meta actuelle : {p.meta_description ?? "—"}</div>
                    </div>
                    {item && (
                      <span className={item.status === "done" ? "text-primary" : item.status === "error" ? "text-destructive" : "text-muted-foreground"}>
                        {item.status === "done" ? "✓" : item.status === "error" ? "✕" : item.status === "skipped" ? "—" : "…"}
                      </span>
                    )}
                  </div>

                  {mode === "titles_meta" && (<>
                    <label className="block">
                      <span className="text-muted-foreground">Titre ({metaDraft.title.length})</span>
                      <input value={metaDraft.title} onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: { ...metaDraft, title: e.target.value } }))}
                        className="w-full rounded border border-border bg-background p-1.5" />
                    </label>
                    <label className="block">
                      <span className="text-muted-foreground">Meta description ({metaDraft.meta_description.length})</span>
                      <textarea rows={2} value={metaDraft.meta_description}
                        onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: { ...metaDraft, meta_description: e.target.value } }))}
                        className="w-full rounded border border-border bg-background p-1.5" />
                    </label>
                  </>)}

                  {mode === "content" && (<>
                    <div className="rounded border border-border bg-secondary/30 p-2">
                      <div className="text-foreground font-semibold">Contenu actuel ({contentWordCount(p.content_html ?? "")} mots)</div>
                      <div className="max-h-28 overflow-y-auto whitespace-pre-wrap text-muted-foreground">{(p.content_html ?? "").slice(0, 1200) || "—"}</div>
                    </div>
                    <div className="rounded border border-primary/30 bg-primary/5 p-2">
                      <div className="text-foreground font-semibold">Recommandations du Copilote</div>
                      <ul className="list-disc pl-4 text-muted-foreground">
                        {proposal?.additions.map((a) => <li key={a.slice(0, 40)}>{a.replace(/<[^>]*>/g, " ").slice(0, 120)}…</li>)}
                        {proposal?.notes.map((n) => <li key={n}>{n}</li>)}
                      </ul>
                    </div>
                    <label className="block">
                      <span className="text-muted-foreground">Intro</span>
                      <textarea rows={2} value={cDraft.intro}
                        onChange={(e) => setContentDrafts((d) => ({ ...d, [p.id]: { ...cDraft, intro: e.target.value } }))}
                        className="w-full rounded border border-border bg-background p-1.5" />
                    </label>
                    <label className="block">
                      <span className="text-muted-foreground">Proposition du Copilote / contenu à enregistrer ({contentWordCount(cDraft.content_html)} mots)</span>
                      <textarea rows={8} value={cDraft.content_html}
                        onChange={(e) => setContentDrafts((d) => ({ ...d, [p.id]: { ...cDraft, content_html: e.target.value } }))}
                        className="w-full rounded border border-border bg-background p-1.5 font-mono" />
                    </label>
                  </>)}

                  {mode === "cta" && (<>
                    <div className="rounded border border-border bg-secondary/30 p-2 text-muted-foreground">
                      CTA actuel : {extractCta(p.content_html ?? "") ? `« ${extractCta(p.content_html ?? "")!.text} » → ${extractCta(p.content_html ?? "")!.href}` : "aucun CTA géré par le Copilote dans le contenu"}
                    </div>
                    <label className="block">
                      <span className="text-muted-foreground">Texte du nouveau CTA</span>
                      <input value={ctaDraft.text} onChange={(e) => setCtaDrafts((d) => ({ ...d, [p.id]: { ...ctaDraft, text: e.target.value } }))}
                        className="w-full rounded border border-border bg-background p-1.5" />
                    </label>
                    <label className="block">
                      <span className="text-muted-foreground">Destination (parcours réellement disponibles)</span>
                      <select value={ctaDraft.href} onChange={(e) => setCtaDrafts((d) => ({ ...d, [p.id]: { ...ctaDraft, href: e.target.value } }))}
                        className="w-full rounded border border-border bg-background p-1.5">
                        {ctaDestinations(p).map((dest) => <option key={dest.href} value={dest.href}>{dest.label} — {dest.href}</option>)}
                      </select>
                    </label>
                  </>)}

                  {mode === "internal_links" && (<>
                    <div className="text-muted-foreground">Liens actuels ({currentLinks.length}) : {currentLinks.map((l) => l.href).join(", ") || "aucun"}</div>
                    <div className="space-y-1">
                      {suggestions.length === 0 && <div className="text-muted-foreground">Aucune page pertinente disponible en base pour cette page.</div>}
                      {suggestions.map((s) => (
                        <label key={s.href} className="flex items-start gap-2">
                          <input type="checkbox" checked={sel.has(s.href)}
                            onChange={(e) => setLinkSel((m2) => {
                              const n = new Set(m2[p.id] ?? []);
                              if (e.target.checked) n.add(s.href); else n.delete(s.href);
                              return { ...m2, [p.id]: n };
                            })} />
                          <span>
                            <span className="text-foreground font-semibold">{s.label}</span>{" "}
                            <span className="font-mono text-primary">{s.href}</span>
                            <span className="text-muted-foreground"> · {s.city ?? "—"} · {s.service ?? "—"} · {s.reason}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </>)}

                  {mode === "publish" && (() => {
                    const st = publishState(p);
                    const blockers = validatePublish(p);
                    return (
                      <div className="rounded border border-border bg-secondary/30 p-2 space-y-1" data-testid="publish-state">
                        <div className="text-foreground font-semibold">{st.isPublished ? "Page publiée" : "Brouillon"}</div>
                        <div className="text-muted-foreground">{st.label}</div>
                        {st.isPublished && <div className="text-muted-foreground">Aucune publication nécessaire : cette page est déjà en ligne.</div>}
                        {!st.isPublished && blockers.length > 0 && (
                          <div className="text-destructive">{blockers.map((b) => b.message).join(" ")}</div>
                        )}
                        {!st.isPublished && blockers.length === 0 && (
                          <div className="text-foreground">Après confirmation : statut « {p.status ?? "inconnu"} » → <span className="font-semibold">publié</span>.</div>
                        )}
                      </div>
                    );
                  })()}



                  {issue && <div className="text-destructive">{issue}</div>}
                  {item?.error && <div className="text-destructive">Erreur : {item.error}</div>}
                </div>
              );
            })}

            {confirming && (
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-xs space-y-2" data-testid="confirm-panel">
                <div className="font-display font-bold text-foreground">{confirming.length} modification(s) seront appliquées</div>
                <ul className="list-disc pl-4 text-muted-foreground">{confirming.map((c) => <li key={c}>{c}</li>)}</ul>
                <div className="flex gap-2">
                  <button onClick={() => void applyChanges()} disabled={saving}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-display font-semibold disabled:opacity-60">
                    <Check className="w-3.5 h-3.5" /> Confirmer et enregistrer
                  </button>
                  <button onClick={() => setConfirming(null)} className="px-3 py-1.5 rounded-md border border-border">Annuler</button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <button disabled={saving} onClick={askConfirm} data-testid="save-selection"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-display font-semibold disabled:opacity-60">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Appliquer aux pages sélectionnées
              </button>
              {batch && progress && progress.errors > 0 && (
                <button disabled={saving} onClick={() => {
                    const failed = new Set(batch.filter((b) => b.status === "error").map((b) => b.page_id));
                    setBatch(retryErrors(batch));
                    void applyChanges(failed);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs">
                  <RotateCcw className="w-3.5 h-3.5" /> Réessayer les erreurs
                </button>
              )}
              <button onClick={onClose} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-border text-xs">
                <X className="w-3.5 h-3.5" /> Annuler
              </button>
            </div>
          </div>
        )}

        {/* HISTORIQUE */}
        <div className="rounded-md border border-border p-3 text-xs space-y-1" data-testid="work-history">
          <div className="font-display font-bold text-foreground">Historique de cette opportunité ({logs.length})</div>
          {logs.length === 0 && <div className="text-muted-foreground">Aucune action enregistrée pour le moment.</div>}
          {logs.map((l) => (
            <div key={l.id} className="text-muted-foreground flex flex-wrap items-center gap-x-1">
              <span className={l.status === "applied" ? "text-primary" : l.status === "failed" ? "text-destructive" : ""}>
                {l.status === "applied" ? <Check className="w-3 h-3 inline" /> : null} {l.status}
              </span>
              <span>{" · "}{new Date(l.created_at).toLocaleString("fr-CA")}</span>
              {l.note ? <span>{` · ${l.note}`}</span> : null}
              {l.page_slug ? <span>{` · /${l.page_slug}`}</span> : null}
              {l.error ? <span className="text-destructive">{` · ${l.error}`}</span> : null}
              {canRestore({ status: l.status, page_id: l.page_id, before_data: l.before_data as Record<string, unknown> }) && (
                <button onClick={() => setRestoring(l)} data-testid="restore-entry"
                  className="ml-1 underline text-foreground">Restaurer la version précédente</button>
              )}
            </div>
          ))}
          {restoring && (
            <div className="mt-2 rounded-md border border-primary/40 bg-primary/5 p-2 space-y-2" data-testid="restore-confirm">
              <div className="text-foreground font-display font-bold">Restaurer la version précédente ?</div>
              <div className="text-muted-foreground">
                {buildRestorePlan(restoring.before_data as Record<string, unknown>, restoring.page_slug)?.summary}
                {" "}— l'historique existant est conservé et une nouvelle entrée est ajoutée.
              </div>
              <div className="flex gap-2">
                <button disabled={restoreBusy} onClick={() => void runRestore(restoring)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-display font-semibold disabled:opacity-60">
                  {restoreBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Confirmer la restauration
                </button>
                <button onClick={() => setRestoring(null)} className="px-3 py-1.5 rounded-md border border-border">Annuler</button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

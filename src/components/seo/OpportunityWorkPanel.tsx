import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, ExternalLink, Save, X, RotateCcw, Check, AlertTriangle, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ActionGroup, ActionPriorityPage } from "@/lib/seo/actionGroups";
import {
  CAPABILITY_LABEL, buildBatchPlan, applyBatchResult, batchProgress, retryErrors,
  buildLogEntry, capabilityOfGroup, hasChanges, runVerification, suggestMeta, validateMeta,
  type BatchItem, type EditablePage, type MetaDraft, type WorkCapability,
} from "@/lib/seo/workflow";

type LogRow = {
  id: string; status: string; action_type: string; page_slug: string | null;
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<BatchItem[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const capability: WorkCapability = group ? capabilityOfGroup(group) : "not_configured";

  const loadLogs = useCallback(async (oppId: string) => {
    const { data } = await supabase
      .from("seo_opportunity_actions")
      .select("id,status,action_type,page_slug,before_data,after_data,error,created_at,note")
      .eq("opportunity_id", oppId)
      .order("created_at", { ascending: false })
      .limit(30);
    setLogs((data ?? []) as LogRow[]);
  }, []);

  const load = useCallback(async () => {
    if (!group) return;
    setLoading(true);
    setLoadError(null);
    try {
      const slugs = priorityPages.map((p) => p.slug).filter((s): s is string => Boolean(s));
      let query = supabase
        .from("seo_pages")
        .select("id,slug,title,meta_title,meta_description,city_slug,service_slug,status,noindex,google_index_status,qa_last_score,qa_blockers,intro,word_count,internal_links");
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
      for (const p of rows) d[p.id] = { title: p.title ?? "", meta_description: p.meta_description ?? "" };
      setDrafts(d);
      setSelected(new Set(rows.map((p) => p.id)));
      setBatch(null);
      await loadLogs(group.primary.id);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Impossible de charger les données de cette opportunité");
    } finally {
      setLoading(false);
    }
  }, [group, priorityPages, loadLogs]);

  useEffect(() => { if (open && group) void load(); }, [open, group, load]);

  const metrics = useMemo(() => new Map(priorityPages.map((p) => [p.slug ?? "", p])), [priorityPages]);

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

  const saveSelection = async () => {
    const ids = pages.map((p) => p.id).filter((id) => selected.has(id));
    const toSave = ids.filter((id) => {
      const page = pages.find((p) => p.id === id)!;
      return hasChanges(page, drafts[id]);
    });
    if (toSave.length === 0) { toast.info("Aucune modification à enregistrer."); return; }
    // validation avant toute écriture
    for (const id of toSave) {
      const others = pages.filter((p) => p.id !== id).map((p) => drafts[p.id]?.title ?? p.title ?? "");
      const issues = validateMeta(drafts[id], others);
      if (issues.length) { toast.error(`${pages.find((p) => p.id === id)?.slug} : ${issues[0].message}`); return; }
    }
    setSaving(true);
    let items = buildBatchPlan(pages.map((p) => p.id), new Set(toSave), Object.fromEntries(pages.map((p) => [p.id, p.slug])));
    setBatch(items);
    await onStatus(o.id, "in_progress");
    await log(buildLogEntry(group, { status: "started", note: `${toSave.length} page(s) sélectionnée(s)` }));
    let failures = 0;
    for (const id of toSave) {
      const page = pages.find((p) => p.id === id)!;
      const draft = drafts[id];
      try {
        const { error } = await supabase.from("seo_pages")
          .update({ title: draft.title, meta_description: draft.meta_description, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
        items = applyBatchResult(items, id, true);
        await log(buildLogEntry(group, {
          status: "applied", page_id: id, page_slug: page.slug,
          before_data: { title: page.title, meta_description: page.meta_description },
          after_data: { title: draft.title, meta_description: draft.meta_description },
        }));
      } catch (e) {
        failures++;
        const msg = e instanceof Error ? e.message : "Erreur inconnue";
        items = applyBatchResult(items, id, false, msg);
        await log(buildLogEntry(group, { status: "failed", page_id: id, page_slug: page.slug, error: msg }));
      }
      setBatch([...items]);
    }
    setSaving(false);
    if (failures > 0) {
      await onStatus(o.id, "error", { error: `${failures} page(s) en erreur` });
      toast.error(`${failures} page(s) en erreur — vous pouvez réessayer les erreurs.`);
    } else {
      await onStatus(o.id, "completed");
      toast.success("Modifications enregistrées et opportunité marquée terminée.");
    }
    await load();
  };

  const progress = batch ? batchProgress(batch) : null;

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

        {!loading && !loadError && capability === "not_configured" && (
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

        {!loading && !loadError && (capability === "titles_meta" || capability === "content" || capability === "internal_links") && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <span className="text-muted-foreground">{pages.length} page(s) chargée(s)</span>
              <button onClick={() => setSelected(new Set(pages.map((p) => p.id)))} className="underline">Tout sélectionner</button>
              <button onClick={() => setSelected(new Set())} className="underline">Tout désélectionner</button>
              <button
                onClick={() => setDrafts((d) => {
                  const next = { ...d };
                  for (const p of pages) if (selected.has(p.id)) next[p.id] = suggestMeta(p);
                  return next;
                })}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-secondary">
                <Wand2 className="w-3 h-3" /> Utiliser les suggestions du Copilote
              </button>
              {progress && <span className="text-muted-foreground">{progress.done + progress.errors} / {progress.total}</span>}
            </div>

            {capability !== "titles_meta" && (
              <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
                {capability === "content"
                  ? "Le signal porte sur le contenu. L'édition disponible ici couvre le titre et la meta description ; la réécriture complète du contenu reste à configurer."
                  : "Le signal porte sur le CTA et le maillage interne. L'édition disponible ici couvre le titre et la meta description ; l'éditeur de maillage reste à configurer."}
              </div>
            )}

            {pages.map((p) => {
              const m = metrics.get(p.slug);
              const draft = drafts[p.id] ?? { title: "", meta_description: "" };
              const issues = validateMeta(draft, pages.filter((x) => x.id !== p.id).map((x) => drafts[x.id]?.title ?? ""));
              const item = batch?.find((b) => b.page_id === p.id);
              return (
                <div key={p.id} className="rounded-md border border-border p-3 text-xs space-y-2">
                  <div className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={selected.has(p.id)}
                      onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
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
                    </div>
                    {item && (
                      <span className={item.status === "done" ? "text-primary" : item.status === "error" ? "text-destructive" : "text-muted-foreground"}>
                        {item.status === "done" ? "✓" : item.status === "error" ? "✕" : item.status === "skipped" ? "—" : "…"}
                      </span>
                    )}
                  </div>
                  <label className="block">
                    <span className="text-muted-foreground">Titre actuel / proposé ({draft.title.length})</span>
                    <input value={draft.title} onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: { ...draft, title: e.target.value } }))}
                      className="w-full rounded border border-border bg-background p-1.5" />
                  </label>
                  <label className="block">
                    <span className="text-muted-foreground">Meta actuelle / proposée ({draft.meta_description.length})</span>
                    <textarea rows={2} value={draft.meta_description}
                      onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: { ...draft, meta_description: e.target.value } }))}
                      className="w-full rounded border border-border bg-background p-1.5" />
                  </label>
                  {issues.length > 0 && selected.has(p.id) && hasChanges(p, draft) && (
                    <ul className="text-destructive">{issues.map((i) => <li key={i.field + i.message}>{i.message}</li>)}</ul>
                  )}
                  {item?.error && <div className="text-destructive">Erreur : {item.error}</div>}
                </div>
              );
            })}

            <div className="flex items-center gap-2 flex-wrap">
              <button disabled={saving} onClick={() => void saveSelection()}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-display font-semibold disabled:opacity-60">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Enregistrer la sélection
              </button>
              {batch && progress && progress.errors > 0 && (
                <button disabled={saving} onClick={() => { setBatch(retryErrors(batch)); void saveSelection(); }}
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
        <div className="rounded-md border border-border p-3 text-xs space-y-1">
          <div className="font-display font-bold text-foreground">Historique de cette opportunité ({logs.length})</div>
          {logs.length === 0 && <div className="text-muted-foreground">Aucune action enregistrée pour le moment.</div>}
          {logs.map((l) => (
            <div key={l.id} className="text-muted-foreground">
              <span className={l.status === "applied" ? "text-primary" : l.status === "failed" ? "text-destructive" : ""}>
                {l.status === "applied" ? <Check className="w-3 h-3 inline" /> : null} {l.status}
              </span>
              {" · "}{new Date(l.created_at).toLocaleString("fr-CA")}
              {l.page_slug ? ` · /${l.page_slug}` : ""}
              {l.error ? ` · ${l.error}` : ""}
              {l.status === "applied" && (
                <div className="pl-4">
                  Avant : {String((l.before_data as Record<string, unknown>)?.title ?? "—")} → Après : {String((l.after_data as Record<string, unknown>)?.title ?? "—")}
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  useSeoCityMatrix, repairSeoPages, GEN_LABEL, type SlotRow,
} from "@/lib/seo/useSeoCityMatrix";
import {
  Loader2, RefreshCw, Send, ExternalLink, AlertTriangle, Pencil, CheckCircle2, ListRestart,
} from "lucide-react";

type Props = { citySlug: string | null; cityName?: string; onClose: () => void; onChanged?: () => void };

const GEN_CLASS: Record<SlotRow["gen_state"], string> = {
  ok: "bg-green-500/15 text-green-700 border-green-500/30",
  invalid: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
  pending: "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  missing: "bg-muted text-muted-foreground border-border",
};

type FilterKey = "all" | "ok" | "problem" | "unpublished";

export default function CityPagesDialog({ citySlug, cityName, onClose, onChanged }: Props) {
  const { matrix, loading, reload } = useSeoCityMatrix(citySlug);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [editing, setEditing] = useState<SlotRow | null>(null);

  const s = matrix?.summary;
  const pct = s && s.planned > 0 ? Math.round((s.published / s.planned) * 100) : 0;

  const slots = useMemo(() => {
    const list = matrix?.slots ?? [];
    if (filter === "ok") return list.filter((r) => r.gen_state === "ok" && r.pub_state === "published");
    if (filter === "problem") return list.filter((r) => ["error", "invalid", "missing"].includes(r.gen_state));
    if (filter === "unpublished") return list.filter((r) => r.pub_state === "unpublished");
    return list;
  }, [matrix, filter]);

  async function act(key: string, fn: () => Promise<string>) {
    setBusy(key);
    try {
      const msg = await fn();
      await reload();
      onChanged?.();
      toast({ title: msg });
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Action impossible", variant: "destructive" });
    } finally { setBusy(null); }
  }

  return (
    <>
      <Dialog open={!!citySlug} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-wide">{cityName ?? citySlug}</DialogTitle>
          </DialogHeader>

          {loading && !matrix && (
            <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</div>
          )}

          {s && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                <Stat label="Prévues" value={s.planned} />
                <Stat label="Générées" value={s.generated} tone="good" />
                <Stat label="Publiées" value={s.published} tone="good" />
                <Stat label="Restantes" value={s.remaining} />
                <Stat label="Erreurs" value={s.errors} tone={s.errors > 0 ? "bad" : undefined} />
              </div>
              <Progress value={pct} className="h-2" />

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => void reload()}>
                  <RefreshCw className="w-3 h-3" /> Rafraîchir
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={s.errors + s.remaining === 0 || busy === "all"}
                  onClick={() => act("all", async () => {
                    const r = await repairSeoPages({ citySlug: citySlug!, allErrors: true });
                    return `Régénération lancée sur ${r.queued ?? 0} page(s) en erreur`;
                  })}>
                  {busy === "all" ? <Loader2 className="w-3 h-3 animate-spin" /> : <ListRestart className="w-3 h-3" />} Régénérer les erreurs
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={s.unpublished === 0 || busy === "pub"}
                  onClick={() => act("pub", async () => {
                    const { data, error } = await supabase.rpc("seo_city_publish_missing" as never, { _city_slug: citySlug } as never);
                    if (error) throw error;
                    const d = data as unknown as { published: number; skipped_invalid: number };
                    return `${d.published} page(s) publiée(s)${d.skipped_invalid ? ` — ${d.skipped_invalid} ignorée(s) (invalides)` : ""}`;
                  })}>
                  <Send className="w-3 h-3" /> Publier les non publiées ({s.unpublished})
                </Button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {([["all", "Toutes"], ["problem", "Problèmes"], ["unpublished", "Non publiées"], ["ok", "OK"]] as Array<[FilterKey, string]>).map(([k, l]) => (
                  <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} className="h-7 text-[11px]" onClick={() => setFilter(k)}>{l}</Button>
                ))}
              </div>

              <div className="space-y-1.5">
                {slots.map((r) => {
                  const key = `${r.material_slug ?? ""}|${r.service_slug ?? ""}`;
                  const problem = ["error", "invalid", "missing"].includes(r.gen_state);
                  return (
                    <div key={key} className="rounded-lg border border-border p-2.5 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <strong className="truncate max-w-[220px]">{r.label}</strong>
                        <Badge variant="outline" className={`text-[10px] ${GEN_CLASS[r.gen_state]}`}>{GEN_LABEL[r.gen_state]}</Badge>
                        <Badge variant="outline" className={`text-[10px] ${r.pub_state === "published" ? "bg-green-500/15 text-green-700 border-green-500/30" : ""}`}>
                          {r.pub_state === "published" ? "Publiée" : r.pub_state === "unpublished" ? "Non publiée" : "—"}
                        </Badge>
                        <span className="text-muted-foreground">{r.kind === "hub" ? "Hub ville" : r.kind === "material" ? "Matériau" : "Service"}</span>
                        {r.page_slug && <span className="text-muted-foreground truncate">/{r.page_slug}</span>}
                        {typeof r.task_attempts === "number" && r.task_attempts > 0 && (
                          <span className="text-muted-foreground">Tentatives : {r.task_attempts}</span>
                        )}
                        {r.task_updated_at && (
                          <span className="text-muted-foreground ml-auto">{new Date(r.task_updated_at).toLocaleString("fr-CA")}</span>
                        )}
                      </div>

                      {r.issues && r.issues.length > 0 && (
                        <div className="text-[11px] text-amber-700 flex items-start gap-1">
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                          <span>Validation : {r.issues.join(" · ")}</span>
                        </div>
                      )}
                      {r.gen_state === "error" && r.task_error && (
                        <div className="text-[11px] text-destructive break-words">Erreur : {r.task_error}</div>
                      )}
                      {r.gen_state === "missing" && <div className="text-[11px] text-muted-foreground">Page jamais générée.</div>}

                      <div className="flex flex-wrap gap-1.5">
                        {r.page_slug && (
                          <a href={`/${r.page_slug}`} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-primary border border-border rounded-md h-7 px-2">
                            Voir <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {r.page_id && (
                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={() => setEditing(r)}>
                            <Pencil className="w-3 h-3" /> Modifier
                          </Button>
                        )}
                        {r.pub_state === "unpublished" && r.page_id && (
                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" disabled={busy === `pub-${key}`}
                            onClick={() => act(`pub-${key}`, async () => {
                              const { data, error } = await supabase.rpc("seo_page_publish" as never, { _page_id: r.page_id } as never);
                              if (error) throw error;
                              const d = data as unknown as { ok: boolean; issues: string[] };
                              if (!d.ok) throw new Error(d.issues.join(" · "));
                              return "Page publiée";
                            })}>
                            <CheckCircle2 className="w-3 h-3" /> Publier
                          </Button>
                        )}
                        {(problem || r.gen_state === "ok") && (
                          <Button size="sm" variant={problem ? "default" : "ghost"} className="h-7 text-[11px] gap-1" disabled={busy === `re-${key}`}
                            onClick={() => act(`re-${key}`, async () => {
                              await repairSeoPages({ citySlug: citySlug!, materialSlug: r.material_slug, serviceSlug: r.service_slug });
                              return `Page régénérée — ${r.label}`;
                            })}>
                            {busy === `re-${key}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Régénérer
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {slots.length === 0 && !loading && (
                  <div className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-lg">Aucune page pour ce filtre.</div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <EditPageDialog slot={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); onChanged?.(); }} />
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" }) {
  const cls = tone === "good" ? "text-green-700" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold leading-tight ${cls}`}>{value}</div>
    </div>
  );
}

function EditPageDialog({ slot, onClose, onSaved }: { slot: SlotRow | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (slot && loaded !== slot.page_id) {
    setLoaded(slot.page_id);
    void supabase.from("seo_pages")
      .select("title,meta_title,meta_description,h1,intro,content_html,slug")
      .eq("id", slot.page_id!).maybeSingle()
      .then(({ data }) => setForm({
        title: data?.title ?? "", meta_title: data?.meta_title ?? "",
        meta_description: data?.meta_description ?? "", h1: data?.h1 ?? "",
        intro: data?.intro ?? "", content_html: data?.content_html ?? "", slug: data?.slug ?? "",
      }));
  }

  const set = (k: string) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={!!slot} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader><DialogTitle>Modifier — {slot?.label}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-xs">
          <Field label="Titre SEO (meta title)"><Input value={form.meta_title ?? ""} onChange={set("meta_title")} /></Field>
          <Field label="Meta description"><Textarea rows={3} value={form.meta_description ?? ""} onChange={set("meta_description")} /></Field>
          <Field label="H1"><Input value={form.h1 ?? ""} onChange={set("h1")} /></Field>
          <Field label="Titre interne"><Input value={form.title ?? ""} onChange={set("title")} /></Field>
          <Field label="Slug (URL)"><Input value={form.slug ?? ""} onChange={set("slug")} /></Field>
          <Field label="Introduction"><Textarea rows={3} value={form.intro ?? ""} onChange={set("intro")} /></Field>
          <Field label="Contenu HTML"><Textarea rows={12} className="font-mono text-[11px]" value={form.content_html ?? ""} onChange={set("content_html")} /></Field>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={onClose}>Annuler</Button>
            <Button size="sm" disabled={saving} onClick={async () => {
              setSaving(true);
              try {
                const { data, error } = await supabase.rpc("seo_page_save" as never, { _page_id: slot!.page_id, _patch: form } as never);
                if (error) throw error;
                const d = data as unknown as { ok: boolean; issues: string[] };
                if (!d.ok) throw new Error((d.issues ?? []).join(" · "));
                toast({
                  title: "Page enregistrée",
                  description: d.issues?.length ? `Validation : ${d.issues.join(" · ")}` : "Aucun problème de validation.",
                });
                onSaved();
              } catch (e) {
                toast({ title: "Erreur", description: e instanceof Error ? e.message : "Enregistrement impossible", variant: "destructive" });
              } finally { setSaving(false); }
            }}>
              {saving && <Loader2 className="w-3 h-3 animate-spin mr-1" />} Enregistrer
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

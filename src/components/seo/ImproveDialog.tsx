import { useState } from "react";
import { Loader2, Sparkles, X, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";

type Snapshot = {
  title?: string; meta_title?: string; meta_description?: string;
  intro?: string; content_html?: string; faq?: Array<{ question: string; answer: string }>;
  word_count?: number; seo_score?: number; internal_link_count?: number;
};

export default function ImproveDialog({
  pageId, pageTitle, onClose, onApplied,
}: {
  pageId: string; pageTitle: string; onClose: () => void; onApplied: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [improvementId, setImprovementId] = useState<string | null>(null);
  const [before, setBefore] = useState<Snapshot | null>(null);
  const [after, setAfter] = useState<Snapshot | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [delta, setDelta] = useState<{ score: number; words: number; internal_links: number; faq: number } | null>(null);

  const runImprove = async () => {
    setLoading(true);
    try {
      const { data, error } = await invokeWithFreshSession("seo-improve-page", { page_id: pageId, mode: "propose" });
      if (error) throw new Error(error.message);
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      const d = data as { improvement_id: string; before: Snapshot; after: Snapshot; notes: string; delta: typeof delta };
      setImprovementId(d.improvement_id);
      setBefore(d.before);
      setAfter(d.after);
      setNotes(d.notes ?? "");
      setDelta(d.delta);
      toast.success("Proposition IA prête");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur IA");
    } finally {
      setLoading(false);
    }
  };

  const apply = async () => {
    if (!improvementId) return;
    setApplying(true);
    try {
      const { data, error } = await invokeWithFreshSession("seo-improve-page", { page_id: pageId, mode: "apply", improvement_id: improvementId });
      if (error) throw new Error(error.message);
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success("Page mise à jour");
      onApplied();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <header className="p-4 border-b border-border flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="font-display font-extrabold text-foreground truncate flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> Améliorer la page
            </h2>
            <p className="text-xs text-muted-foreground truncate">{pageTitle}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
        </header>

        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {!before && (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground font-body mb-4 max-w-md mx-auto">
                L'IA va analyser cette page, réécrire le contenu, enrichir les FAQ, optimiser les balises et régénérer le maillage interne. Rien n'est appliqué tant que vous n'avez pas cliqué sur "Appliquer".
              </p>
              <button
                onClick={runImprove}
                disabled={loading}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-display font-bold shadow hover:opacity-90 disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {loading ? "Analyse et réécriture…" : "Lancer l'amélioration IA"}
              </button>
            </div>
          )}

          {before && after && (
            <>
              {notes && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm font-body text-foreground">
                  <strong className="font-display">Résumé IA :</strong> {notes}
                </div>
              )}
              {delta && (
                <div className="grid grid-cols-4 gap-2">
                  <DeltaBox label="Score" value={delta.score} />
                  <DeltaBox label="Mots" value={delta.words} />
                  <DeltaBox label="Liens internes" value={delta.internal_links} />
                  <DeltaBox label="FAQ" value={delta.faq} />
                </div>
              )}
              <DiffField label="Titre H1" before={before.title} after={after.title} />
              <DiffField label="Meta title" before={before.meta_title} after={after.meta_title} />
              <DiffField label="Meta description" before={before.meta_description} after={after.meta_description} />
              <DiffField label="Introduction" before={before.intro} after={after.intro} />
              <details className="rounded-lg border border-border">
                <summary className="p-3 cursor-pointer font-display font-semibold text-sm">Contenu HTML complet (avant / après)</summary>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 border-t border-border">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Avant</p>
                    <div className="prose prose-sm max-w-none max-h-96 overflow-y-auto p-3 rounded bg-muted/30" dangerouslySetInnerHTML={{ __html: before.content_html ?? "" }} />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-primary mb-1">Après</p>
                    <div className="prose prose-sm max-w-none max-h-96 overflow-y-auto p-3 rounded bg-primary/5" dangerouslySetInnerHTML={{ __html: after.content_html ?? "" }} />
                  </div>
                </div>
              </details>
              <details className="rounded-lg border border-border">
                <summary className="p-3 cursor-pointer font-display font-semibold text-sm">FAQ ({after.faq?.length ?? 0})</summary>
                <ul className="p-3 border-t border-border space-y-2">
                  {(after.faq ?? []).map((f, i) => (
                    <li key={i} className="text-sm font-body">
                      <strong className="text-foreground">{f.question}</strong>
                      <p className="text-muted-foreground">{f.answer}</p>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </div>

        {before && after && (
          <footer className="p-4 border-t border-border flex items-center justify-end gap-2 shrink-0">
            <button onClick={onClose} className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-display font-semibold hover:opacity-90">
              Annuler
            </button>
            <button onClick={runImprove} disabled={loading} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-muted text-foreground text-sm font-display font-semibold hover:bg-muted/80 disabled:opacity-60">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Regénérer
            </button>
            <button onClick={apply} disabled={applying} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold shadow hover:opacity-90 disabled:opacity-60">
              {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Appliquer
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function DeltaBox({ label, value }: { label: string; value: number }) {
  const positive = value > 0;
  const negative = value < 0;
  const color = positive ? "text-green-600 dark:text-green-400" : negative ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-2 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-display font-extrabold ${color}`}>{positive ? "+" : ""}{value}</div>
    </div>
  );
}

function DiffField({ label, before, after }: { label: string; before?: string; after?: string }) {
  const changed = (before ?? "") !== (after ?? "");
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-3 py-2 bg-muted/50 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider font-display font-bold text-muted-foreground">{label}</span>
        {changed && <span className="text-[10px] text-primary font-display font-semibold">MODIFIÉ</span>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <div className="p-3 text-sm font-body text-muted-foreground line-through decoration-destructive/40">
          {before || <em className="opacity-50">(vide)</em>}
        </div>
        <div className="p-3 text-sm font-body text-foreground bg-primary/5">
          {after || <em className="opacity-50">(vide)</em>}
        </div>
      </div>
    </div>
  );
}
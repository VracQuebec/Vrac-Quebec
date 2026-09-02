import { useEffect, useState } from "react";
import { X, Loader2, ArrowRight, AlertTriangle, CheckCircle2, MinusCircle } from "lucide-react";
import { fetchPageHistory } from "@/lib/seo/useBulkOptimization";

type Entry = {
  task_id: string; run_id: string; status: string; qa_before: number | null; qa_after: number | null;
  fixed_actions: string[]; skip_reason: string | null; error: string | null; finished_at: string; mode: string;
};

const ACTION_LABELS: Record<string, string> = {
  rewrite_meta_title: "Title SEO amélioré",
  rewrite_meta_description: "Meta description améliorée",
  rewrite_open_graph: "Open Graph amélioré",
  generate_keywords: "Mots-clés générés",
  regenerate_faq: "FAQ régénérée",
  add_internal_links: "Liens internes ajoutés",
  fix_images_alt: "Textes alternatifs corrigés",
  insert_ctas: "Appels à l'action ajoutés",
  expand_content: "Contenu enrichi",
  rebuild_headings: "Structure des titres améliorée",
  improve_readability: "Lisibilité améliorée",
};

export default function PageHistoryDialog({ pageId, pageTitle, onClose }: { pageId: string; pageTitle: string; onClose: () => void }) {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPageHistory(pageId).then(setRows).catch((e) => setError(e instanceof Error ? e.message : "Erreur"));
  }, [pageId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-5 max-w-2xl w-full max-h-[80vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="font-display font-bold">Historique d'optimisation</h4>
            <p className="text-xs text-muted-foreground truncate max-w-[420px]">{pageTitle}</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {!rows && !error && <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
        {rows && rows.length === 0 && <p className="text-sm text-muted-foreground">Aucune optimisation enregistrée pour cette page.</p>}

        {rows?.map((r) => (
          <div key={r.task_id} className="border border-border rounded-md p-3 space-y-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {new Date(r.finished_at).toLocaleString("fr-CA")} · {r.mode === "refresh" ? "Rafraîchissement" : "Optimisation"}
              </span>
              {r.status === "completed" ? (
                <span className="inline-flex items-center gap-1 font-mono text-xs">
                  {r.qa_before ?? "—"} <ArrowRight className="w-3 h-3" /> <span className="text-primary font-bold">{r.qa_after ?? "—"}</span>/100
                </span>
              ) : r.status === "error" ? (
                <span className="inline-flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="w-3 h-3" /> Erreur</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><MinusCircle className="w-3 h-3" /> Aucune modification nécessaire</span>
              )}
            </div>
            {r.status === "completed" && r.fixed_actions?.length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {r.fixed_actions.map((a) => (
                  <li key={a} className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-primary" /> {ACTION_LABELS[a] ?? a}</li>
                ))}
              </ul>
            )}
            {r.skip_reason && <p className="text-xs text-muted-foreground">{r.skip_reason}</p>}
            {r.error && <p className="text-xs text-destructive break-words">{r.error}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

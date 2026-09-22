// Affichage LECTURE SEULE des compteurs du Centre de pilotage SEO.
// Séparation stricte : ERREURS RÉELLES vs OPTIMISATIONS POTENTIELLES.
// Aucun bouton de ce panneau ne modifie, ne régénère ni ne publie une page.
import { AlertTriangle, CheckCircle2, Link2, Loader2, RefreshCw, ShieldCheck, PenSquare, Wrench, Search } from "lucide-react";
import type { CounterItem, StrategicCounters as Counters } from "@/lib/seo/strategicCounters";

function Row({
  icon: Icon, label, value, items, tone,
}: {
  icon: typeof AlertTriangle;
  label: string;
  value: number | string;
  items: CounterItem[];
  tone: "error" | "opt";
}) {
  const zero = items.length === 0;
  return (
    <details className={`rounded-lg border p-3 ${tone === "error" ? (zero ? "border-border" : "border-red-300 bg-red-50/60") : "border-border bg-muted/30"}`}>
      <summary className="flex items-center gap-2 cursor-pointer text-sm font-display font-bold">
        <Icon className={`w-4 h-4 ${tone === "error" && !zero ? "text-red-600" : "text-muted-foreground"}`} />
        <span className="flex-1">{label}</span>
        <span className={tone === "error" && !zero ? "text-red-600" : "text-foreground"}>{value}</span>
      </summary>
      {items.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground max-h-56 overflow-auto">
          {items.slice(0, 100).map((i) => (
            <li key={i.url} className="flex flex-wrap gap-x-2">
              <span className="font-mono">{i.url}</span>
              <span>· {i.detail}</span>
              <span className="opacity-70">· touche : {i.target}</span>
            </li>
          ))}
          {items.length > 100 && <li>… et {items.length - 100} autres pages</li>}
        </ul>
      )}
    </details>
  );
}

export default function StrategicCounters({
  counters, loading, error, onReload,
}: {
  counters: Counters | null;
  loading: boolean;
  error: string | null;
  onReload: () => void;
}) {
  if (loading) {
    return <div className="text-sm text-muted-foreground flex items-center gap-2 py-3"><Loader2 className="w-4 h-4 animate-spin" /> Analyse complète de toutes les pages…</div>;
  }
  if (error || !counters) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
        Compteurs indisponibles — {error ?? "aucune donnée"}
        <button onClick={onReload} className="ml-2 underline">Réessayer</button>
      </div>
    );
  }

  const e = counters.errors;
  const o = counters.optimizations;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Analyse sur l'ensemble de la base : {counters.pagesTotal.toLocaleString("fr-CA")} pages lues,
        {" "}{counters.published.toLocaleString("fr-CA")} publiées analysées. Score QA recalculé sur l'état actuel des pages
        {counters.qaAverage != null ? ` (moyenne ${counters.qaAverage}/100)` : ""} — aucune page n'est modifiée.
      </p>

      <section>
        <h3 className="text-sm font-display font-extrabold mb-2 flex items-center gap-2">
          {e.total === 0 ? <CheckCircle2 className="w-4 h-4 text-primary" /> : <AlertTriangle className="w-4 h-4 text-red-600" />}
          ERREURS RÉELLES — {e.total}
        </h3>
        <div className="grid gap-2 md:grid-cols-2">
          <Row icon={AlertTriangle} label="Problèmes SEO" value={e.seo.length} items={e.seo} tone="error" />
          <Row icon={Wrench} label="Problèmes techniques" value={e.technical.length} items={e.technical} tone="error" />
          <Row icon={Link2} label="Liens internes < 2" value={e.links.length} items={e.links} tone="error" />
          <Row icon={Search} label="Problèmes d'indexation" value={e.indexation.length} items={e.indexation} tone="error" />
        </div>
      </section>

      <section>
        <h3 className="text-sm font-display font-extrabold mb-2">OPTIMISATIONS POTENTIELLES — {o.total}</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <Row icon={RefreshCw} label="Pages de plus de 60 jours (âge uniquement)" value={o.stale.length} items={o.stale} tone="opt" />
          <Row icon={Link2} label={`Liens à ajouter pour passer de 2-4 à 5 (${o.linksDeficit} liens)`} value={o.links.length} items={o.links} tone="opt" />
          <Row icon={ShieldCheck} label="Amélioration facultative du contenu" value={o.content.length} items={o.content} tone="opt" />
          <Row icon={ShieldCheck} label="Amélioration facultative du score QA (< 80)" value={o.qa.length} items={o.qa} tone="opt" />
        </div>
      </section>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <PenSquare className="w-3.5 h-3.5" />
        Articles à publier : {counters.blogToPublish} (brouillons et articles planifiés réels)
      </div>
    </div>
  );
}

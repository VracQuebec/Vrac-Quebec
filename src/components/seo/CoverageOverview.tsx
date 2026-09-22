// Couverture territoriale — SOURCE OFFICIELLE UNIQUE : seo_control_center()
// (exactement la même logique de pertinence que le Générateur) complétée par
// seo_dashboard_stats() pour les matériaux/services couverts (calculés côté base).
// Aucun calcul théorique ici, aucune lecture paginée côté client.
import { useEffect, useState } from "react";
import { Loader2, MapPin, Package, Wrench, Grid3x3, FileText } from "lucide-react";
import { fetchSeoStats, type SeoStats } from "@/lib/seo/api";
import { useSeoControlCenter } from "@/lib/seo/useSeoControlCenter";

const nf = (n: number) => n.toLocaleString("fr-CA");

export default function CoverageOverview() {
  const { state, loading: ccLoading } = useSeoControlCenter();
  const [stats, setStats] = useState<SeoStats | null>(null);

  useEffect(() => {
    void fetchSeoStats().then(setStats).catch(() => setStats(null));
  }, []);

  if (ccLoading && !state) {
    return <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement de la couverture…</div>;
  }
  if (!state) return <div className="text-sm text-muted-foreground">Couverture indisponible.</div>;

  const t = state.totals;
  const cities = state.cities;
  const withPublished = cities.filter((c) => c.published > 0).length;
  const draftOnly = cities.filter((c) => c.published === 0 && c.generated > 0).length;
  const withoutPage = cities.filter((c) => c.generated === 0).length;
  const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

  return (
    <div className="space-y-3">
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CoverageCard icon={MapPin} label="Municipalités avec page publiée"
          pct={pct(withPublished, cities.length)} sub={`${nf(withPublished)}/${nf(cities.length)} municipalités du registre`} />
        <CoverageCard icon={Package} label="Matériaux couverts"
          pct={stats ? pct(stats.materials_covered, stats.materials_total) : 0}
          sub={stats ? `${stats.materials_covered}/${stats.materials_total} matériaux` : "—"} />
        <CoverageCard icon={Wrench} label="Services couverts"
          pct={stats ? pct(stats.services_covered, stats.services_total) : 0}
          sub={stats ? `${stats.services_covered}/${stats.services_total} services` : "—"} />
        <CoverageCard icon={Grid3x3} label="Combinaisons pertinentes créées"
          pct={pct(t.generated, t.target_total)} sub={`${nf(t.generated)} / ${nf(t.target_total)}`} />
      </section>

      <div className="rounded-lg border border-border bg-card p-4 text-xs space-y-1.5">
        <div className="font-semibold text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> Définitions officielles</div>
        <p><strong>Combinaisons pertinentes ({nf(t.target_total)})</strong> — combinaisons ville × matériau × service validées par la logique actuelle du Générateur : municipalité active du registre, matériau réellement demandé dans les soumissions du territoire, service actif du territoire, plus la page ville (hub).</p>
        <p><strong>Combinaisons créées ({nf(t.generated)})</strong> — combinaisons pertinentes pour lesquelles une page SEO existe réellement, brouillons inclus.</p>
        <p><strong>Pages manquantes ({nf(t.remaining)})</strong> — pertinentes moins créées.</p>
        <p><strong>Pages du périmètre pertinent</strong> — {nf(t.published)} publiées, {nf(t.drafts)} en brouillon, {nf(t.errors)} en erreur.</p>
        <p><strong>Territoires</strong> — {nf(cities.length)} municipalités analysées : {nf(withPublished)} avec au moins une page publiée, {nf(draftOnly)} avec uniquement des brouillons, {nf(withoutPage)} sans aucune page.</p>
        {stats && (
          <p className="text-muted-foreground">
            À titre indicatif seulement : la base contient {nf(stats.pages_total)} pages au total, dont {nf(stats.pages_total - t.generated)} rattachées à des villes hors registre municipal actuel (pages historiques). Les combinaisons théoriques ({nf(stats.combinations_possible)}) ne sont jamais une file de production.
          </p>
        )}
      </div>
    </div>
  );
}

function CoverageCard({ icon: Icon, label, pct, sub }: { icon: typeof MapPin; label: string; pct: number; sub: string }) {
  const barColor = pct >= 80 ? "bg-primary" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  const textColor = pct >= 80 ? "text-primary" : pct >= 50 ? "text-amber-500" : "text-red-500";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-[10px] uppercase font-display tracking-wider">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`text-3xl font-display font-extrabold ${textColor} mt-1`}>{pct}<span className="text-base text-muted-foreground">%</span></div>
      <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden mt-2">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-muted-foreground mt-1.5">{sub}</div>
    </div>
  );
}

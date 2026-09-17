import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Target, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type Candidate = { kind: "material" | "service"; slug: string; name: string; requests: number };
type Signal = { slug: string; name: string; requests: number; availability?: string };
type ExistingPage = { slug: string; status: string; material: string | null; service: string | null };

type City = {
  slug: string; name: string; region: string | null; population: number | null;
  requests_total: number; requests_remblai: number; requests_disposition: number;
  requests_dompe: number; requests_livraison: number; requests_vrac: number;
  requests_transport: number; requests_machinerie: number;
  pages_total: number; pages_published: number; pages_draft: number;
  materials_count: number; services_count: number;
  tier: "forte" | "moyenne" | "faible" | "non_pertinente";
  reasons: string[]; services: Signal[]; materials: Signal[];
  existing_pages: ExistingPage[]; candidates: Candidate[];
};

type Payload = {
  computed_at: string; cities: City[];
  crm_active: number; seo_cities: number; cities_with_pages: number;
};

const TIERS: Record<City["tier"], { label: string; dot: string; cls: string }> = {
  forte: { label: "Opportunité forte", dot: "🟢", cls: "text-green-700" },
  moyenne: { label: "Opportunité moyenne", dot: "🟡", cls: "text-amber-600" },
  faible: { label: "Peu de données", dot: "⚪", cls: "text-muted-foreground" },
  non_pertinente: { label: "Non pertinente", dot: "🔴", cls: "text-destructive" },
};

export default function OpportunityAnalysis() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyWithout, setOnlyWithout] = useState(true);
  const [tier, setTier] = useState<"all" | City["tier"]>("all");
  const [open, setOpen] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("seo_opportunity_analysis");
    if (error) toast.error(error.message);
    else setData(data as unknown as Payload);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const cities = data?.cities ?? [];
  const filtered = useMemo(() => cities.filter((c) => {
    if (onlyWithout && c.pages_total > 0) return false;
    if (tier !== "all" && c.tier !== tier) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [cities, onlyWithout, tier, search]);

  const counts = useMemo(() => {
    const without = cities.filter((c) => c.pages_total === 0);
    return {
      total: cities.length,
      with_pages: cities.filter((c) => c.pages_total > 0).length,
      without: without.length,
      forte: without.filter((c) => c.tier === "forte").length,
      moyenne: without.filter((c) => c.tier === "moyenne").length,
      faible: without.filter((c) => c.tier === "faible").length,
      nulle: without.filter((c) => c.tier === "non_pertinente").length,
    };
  }, [cities]);

  if (loading || !data) {
    return <div className="p-8 text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Analyse des opportunités…</div>;
  }

  return (
    <Card className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-display font-bold flex items-center gap-2"><Target className="w-5 h-5 text-primary" /> Opportunités SEO par territoire</h2>
          <p className="text-xs text-muted-foreground">Statut établi uniquement à partir des demandes, services et matériaux réels du CRM. Aucune page n'est créée ici.</p>
        </div>
        <Button size="sm" variant="outline" className="gap-2" onClick={load}><RefreshCw className="w-4 h-4" /> Actualiser</Button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-center">
        <Mini label="Municipalités CRM" value={counts.total} />
        <Mini label="Avec pages" value={counts.with_pages} />
        <Mini label="Sans page" value={counts.without} />
        <Mini label="🟢 Forte" value={counts.forte} />
        <Mini label="🟡 Moyenne" value={counts.moyenne} />
        <Mini label="⚪ Peu de données" value={counts.faible} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Rechercher une ville…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs h-9" />
        <Button size="sm" variant={onlyWithout ? "default" : "outline"} onClick={() => setOnlyWithout((v) => !v)}>Sans page seulement</Button>
        {(["all", "forte", "moyenne", "faible", "non_pertinente"] as const).map((t) => (
          <Button key={t} size="sm" variant={tier === t ? "default" : "outline"} onClick={() => setTier(t)}>
            {t === "all" ? "Tous" : `${TIERS[t].dot} ${TIERS[t].label}`}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} ville(s)</span>
      </div>

      <div className="overflow-auto max-h-[620px] border border-border rounded-lg">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background z-10">
            <tr className="text-left border-b border-border">
              <th className="p-2">Ville</th>
              <th className="p-2">Statut</th>
              <th className="p-2 text-right">Demandes</th>
              <th className="p-2 text-right">Remblai</th>
              <th className="p-2 text-right">Dompe</th>
              <th className="p-2 text-right">Livraison</th>
              <th className="p-2 text-right">Vrac</th>
              <th className="p-2 text-right">Services</th>
              <th className="p-2 text-right">Matériaux</th>
              <th className="p-2 text-right">Pages</th>
              <th className="p-2 text-right">Candidates</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <Fragment key={c.slug}>
                <tr className="border-b border-border/50 hover:bg-muted/40 cursor-pointer" onClick={() => setOpen(open === c.slug ? null : c.slug)}>
                  <td className="p-2 font-medium flex items-center gap-1">
                    {open === c.slug ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    {c.name}
                  </td>
                  <td className={`p-2 ${TIERS[c.tier].cls}`}>{TIERS[c.tier].dot} {TIERS[c.tier].label}</td>
                  <td className="p-2 text-right font-semibold">{c.requests_total}</td>
                  <td className="p-2 text-right">{c.requests_remblai}</td>
                  <td className="p-2 text-right">{c.requests_dompe}</td>
                  <td className="p-2 text-right">{c.requests_livraison}</td>
                  <td className="p-2 text-right">{c.requests_vrac}</td>
                  <td className="p-2 text-right">{c.services_count}</td>
                  <td className="p-2 text-right">{c.materials_count}</td>
                  <td className="p-2 text-right">{c.pages_published}{c.pages_draft > 0 ? ` (+${c.pages_draft})` : ""}</td>
                  <td className="p-2 text-right">{c.candidates.length}</td>
                </tr>
                {open === c.slug && (
                  <tr className="bg-muted/30 border-b border-border/50">
                    <td colSpan={11} className="p-3 space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {c.reasons.map((r) => <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>)}
                      </div>
                      <Detail title="Services demandés" items={c.services.map((s) => `${s.name} — ${s.requests} demande(s)${s.availability ? ` · ${s.availability}` : ""}`)} />
                      <Detail title="Matériaux demandés" items={c.materials.map((m) => `${m.name} — ${m.requests} demande(s)`)} />
                      <Detail title="Pages existantes" items={c.existing_pages.map((p) => `/${p.slug} · ${p.status}`)} />
                      <Detail title="Combinaisons pertinentes à créer (aucune création automatique)" items={c.candidates.map((x) => `${x.kind === "material" ? "Matériau" : "Service"} : ${x.name} — ${x.requests} demande(s)`)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background/50 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-base font-bold">{value}</div>
    </div>
  );
}

function Detail({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">{title}</div>
      {items.length === 0 ? <div className="text-xs text-muted-foreground">Aucune donnée</div> : (
        <ul className="text-xs space-y-0.5">{items.map((i) => <li key={i}>• {i}</li>)}</ul>
      )}
    </div>
  );
}

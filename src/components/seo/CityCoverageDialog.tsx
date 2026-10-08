// Couverture SEO réelle d'une ville — LECTURE SEULE (aucune génération, aucune publication).
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { computeCoverage, coverageLabel, ITEM_STATUS_LABEL, type CoverageRaw, type ItemStatus } from "@/lib/seo/cityCoverage";

const TONE: Record<ItemStatus, string> = {
  covered: "text-green-700 border-green-500/30",
  draft: "text-amber-700 border-amber-500/30",
  covered_equiv: "text-green-700 border-green-500/30",
  off_criteria: "text-amber-700 border-amber-500/30",
  to_develop: "text-primary border-primary/40",
  to_develop_equiv: "text-primary border-primary/40",
  not_configured: "text-muted-foreground",
  not_requested: "text-muted-foreground",
  not_linked: "text-muted-foreground",
};

export default function CityCoverageDialog({ city, onClose }: { city: { slug: string; name: string } | null; onClose: () => void }) {
  const [raw, setRaw] = useState<CoverageRaw | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRaw(null); setError(null);
    if (!city) return;
    void supabase.rpc("seo_city_coverage" as never, { _city_slug: city.slug } as never).then(({ data, error }) => {
      if (error) setError(error.message); else setRaw(data as unknown as CoverageRaw);
    });
  }, [city]);

  const c = raw ? computeCoverage(raw) : null;
  const groups: Array<{ title: string; st: ItemStatus[] }> = [
    { title: "Couvert", st: ["covered"] },
    { title: "En brouillon", st: ["draft"] },
    { title: "À développer", st: ["to_develop"] },
    { title: "Hors critères", st: ["off_criteria"] },
    { title: "Correspondance à confirmer", st: ["covered_equiv", "to_develop_equiv"] },
    { title: "Services à configurer", st: ["not_configured"] },
    { title: "Non demandé / non applicable", st: ["not_requested", "not_linked"] },
  ];

  return (
    <Dialog open={!!city} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
        <DialogHeader><DialogTitle>Couverture SEO — {city?.name}</DialogTitle></DialogHeader>
        {error && <div className="text-sm text-destructive">Lecture impossible : {error}</div>}
        {!c && !error && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</div>}
        {c && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Pages existantes" value={String(c.existing)} />
              <Stat label="Publiées" value={String(c.published)} />
              <Stat label="Brouillons" value={String(c.drafts)} />
              <Stat label="Opportunités SEO pertinentes" value={String(c.planned)} hint="Ville + matériaux demandés + services configurés avec demandes" />
              <Stat label="Couverture des opportunités" value={`${c.plannedCovered} / ${c.planned}`} hint={c.plannedDrafts ? `dont ${c.plannedDrafts} en brouillon` : undefined} />
              <Stat label="Potentiel théorique du catalogue" value={String(c.theoretical)} hint="Indicatif — jamais un dénominateur" />
              <Stat label="Hors critères" value={String(c.offCriteria)} />
              <Stat label="Correspondances à confirmer" value={String(c.toConfirm)} />
              <Stat label="À développer" value={String(c.toDevelop)} />
              <Stat label="Services non configurés" value={String(c.notConfigured)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Aucune page n'est créée ni publiée depuis cet écran. Les pages « à développer » restent à valider avant toute génération.
            </p>

            {groups.map((g) => {
              const rows = c.items.filter((i) => g.st.includes(i.status));
              if (!rows.length) return null;
              return (
                <section key={g.title} className="space-y-1.5">
                  <h3 className="font-semibold">{g.title} ({rows.length})</h3>
                  {rows.map((i) => (
                    <div key={`${i.kind}-${i.slug ?? "hub"}`} className="rounded-lg border border-border p-2 text-xs flex flex-wrap items-center gap-2">
                      <strong>{i.label}</strong>
                      <Badge variant="outline">{i.kind === "hub" ? "Ville" : i.kind === "material" ? "Matériau" : "Service"}</Badge>
                      <Badge variant="outline" className={TONE[i.status]}>{ITEM_STATUS_LABEL[i.status]}</Badge>
                      {i.page && <Badge variant="outline">{i.published ? "Publiée" : "Brouillon"} · /{i.page.slug}</Badge>}
                      <span className="w-full text-muted-foreground">{i.reason}</span>
                      {i.sources.length > 0 && (
                        <span className="w-full text-muted-foreground">
                          Source : {i.sources.map((x) => `« ${x.raw} » (${x.count})${x.match === "equiv" ? " — correspondance à confirmer" : ""}`).join(", ")}
                        </span>
                      )}
                    </div>
                  ))}
                </section>
              );
            })}

            {c.unmappedServices.length > 0 && (
              <section className="space-y-1">
                <h3 className="font-semibold">Services configurés sans page SEO correspondante ({c.unmappedServices.length})</h3>
                {c.unmappedServices.map((u) => <div key={u.key} className="text-xs">{u.key} — {u.status}, {u.requests} demande(s) — non compté, correspondance à valider</div>)}
              </section>
            )}

            {c.outsideCatalog.length > 0 && (
              <section className="space-y-1">
                <h3 className="font-semibold">Hors catalogue actif ({c.outsideCatalog.length})</h3>
                {c.outsideCatalog.map((p) => <div key={p.slug} className="text-xs">/{p.slug}</div>)}
              </section>
            )}

            <section className="space-y-1.5">
              <h3 className="font-semibold">Matériaux demandés dans la ville ({c.terms.length})</h3>
              {c.terms.length === 0 && <div className="text-xs text-muted-foreground">Aucun matériau mentionné dans les demandes.</div>}
              {c.terms.map((t) => (
                <div key={t.slug} className="text-xs flex flex-wrap gap-2">
                  <span>« {t.raw} » ({t.count})</span>
                  <span className="text-muted-foreground">
                    {t.match === "exact" ? `→ correspondance exacte : ${t.material}` : t.match === "equiv" ? `→ nom équivalent à confirmer : ${t.material}` : "→ sans correspondance dans le catalogue"}
                  </span>
                </div>
              ))}
            </section>

            <section className="space-y-1">
              <h3 className="font-semibold">Configuration territoriale</h3>
              <div className="text-xs">Configurés : {c.territoryConfigured.join(", ") || "aucun"}</div>
              <div className="text-xs text-muted-foreground">Non configurés : {c.territoryUnconfigured.join(", ") || "aucun"}</div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

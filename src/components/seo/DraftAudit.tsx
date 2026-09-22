// Audit des brouillons et des municipalités — LECTURE SEULE.
// Ce composant ne génère, ne publie, ne modifie et ne supprime jamais une page.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ClipboardList } from "lucide-react";
import type { ControlCityRow } from "@/lib/seo/useSeoControlCenter";
import {
  classifyDraft, draftReason, summarizeDrafts, draftSentence,
  cityAuditStatus, cityCompletion, summarizeCityAudit,
  DRAFT_CLASS_LABEL, CITY_AUDIT_LABEL,
  type DraftPage, type DraftClass, type CityAuditStatus,
} from "@/lib/seo/draftAudit";

const SELECT =
  "slug, city_slug, material_slug, service_slug, title, status, meta_title, meta_description, " +
  "internal_link_count, word_count, qa_last_score, qa_last_checked_at, qa_blockers, proc_status, " +
  "proc_error, priority_locked, last_generated_at";

const CITY_FILTERS: Array<{ key: CityAuditStatus | "all"; label: string }> = [
  { key: "all", label: "Toutes" },
  { key: "complete", label: "Complètes" },
  { key: "to_publish", label: "À publier" },
  { key: "error", label: "Avec erreurs" },
  { key: "incomplete", label: "Incomplètes" },
  { key: "check", label: "À vérifier" },
];

const CITY_TONE: Record<CityAuditStatus, string> = {
  complete: "bg-green-500/15 text-green-700 border-green-500/30",
  to_publish: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
  incomplete: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  check: "bg-muted text-muted-foreground border-border",
};

const DRAFT_TONE: Record<DraftClass, string> = {
  ready: "bg-green-500/15 text-green-700 border-green-500/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
  incomplete: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  check: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  held: "bg-muted text-muted-foreground border-border",
  legacy: "bg-muted text-muted-foreground border-border",
};

function nf(n: number) { return n.toLocaleString("fr-CA"); }

export default function DraftAudit({ cities }: { cities: ControlCityRow[] }) {
  const [pages, setPages] = useState<DraftPage[] | null>(null);
  const [cityFilter, setCityFilter] = useState<CityAuditStatus | "all">("all");
  const [draftsOnly, setDraftsOnly] = useState(false);
  const [draftFilter, setDraftFilter] = useState<DraftClass | "all">("all");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(30);

  useEffect(() => {
    void (async () => {
      const all: DraftPage[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("seo_pages").select(SELECT).range(from, from + 999);
        if (error) break;
        all.push(...((data ?? []) as unknown as DraftPage[]));
        if (!data || data.length < 1000) break;
      }
      setPages(all);
    })();
  }, []);

  const drafts = useMemo(() => (pages ?? []).filter((p) => p.status === "draft"), [pages]);
  const summary = useMemo(() => summarizeDrafts(drafts), [drafts]);
  const cityAudit = useMemo(() => summarizeCityAudit(cities), [cities]);

  const draftsByCity = useMemo(() => {
    const m = new Map<string, DraftPage[]>();
    for (const d of drafts) {
      const list = m.get(d.city_slug) ?? [];
      list.push(d);
      m.set(d.city_slug, list);
    }
    return m;
  }, [drafts]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cities
      .filter((c) => (cityFilter === "all" || cityAuditStatus(c) === cityFilter))
      .filter((c) => (!draftsOnly || c.drafts > 0))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.slug.includes(q))
      .sort((a, b) => b.drafts - a.drafts || a.name.localeCompare(b.name, "fr-CA"));
  }, [cities, cityFilter, draftsOnly, search]);

  const draftList = useMemo(
    () => (draftFilter === "all" ? drafts : drafts.filter((d) => classifyDraft(d) === draftFilter)),
    [drafts, draftFilter],
  );

  return (
    <Card className="p-4 md:p-6 space-y-5">
      <header>
        <h3 className="text-base font-display font-bold flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" /> Audit des brouillons (lecture seule)
        </h3>
        <p className="text-xs text-muted-foreground">
          Diagnostic uniquement : aucune page n'est générée, publiée, modifiée ni supprimée depuis cet écran.
        </p>
      </header>

      {pages === null ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Lecture des pages…
        </div>
      ) : (
        <>
          {/* Résumé des brouillons */}
          <div className="rounded-lg border border-border bg-background/50 p-3 space-y-3">
            <p className="text-sm font-medium">{draftSentence(summary)}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {(Object.keys(DRAFT_CLASS_LABEL) as DraftClass[]).map((k) => (
                <button key={k} type="button"
                  onClick={() => { setDraftFilter(draftFilter === k ? "all" : k); setVisible(30); }}
                  className={`rounded-lg border p-2 text-left transition-colors ${draftFilter === k ? "border-primary" : "border-border"} bg-background/60`}>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight">{DRAFT_CLASS_LABEL[k]}</div>
                  <div className="text-xl font-bold">{nf(summary[k])}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Détail des brouillons filtrés */}
          {draftFilter !== "all" && (
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">{DRAFT_CLASS_LABEL[draftFilter]} — {nf(draftList.length)} page(s)</div>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDraftFilter("all")}>Effacer le filtre</Button>
              </div>
              <ul className="space-y-1 text-xs max-h-72 overflow-auto">
                {draftList.slice(0, 200).map((d) => (
                  <li key={d.slug} className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-1 last:border-0">
                    <strong>{cities.find((c) => c.slug === d.city_slug)?.name ?? d.city_slug}</strong>
                    <span className="text-muted-foreground">{d.material_slug ?? d.service_slug ?? "hub"}</span>
                    <span className="text-muted-foreground">{d.slug}</span>
                    <Badge variant="outline" className={`text-[10px] ${DRAFT_TONE[classifyDraft(d)]}`}>{draftReason(d)}</Badge>
                  </li>
                ))}
              </ul>
              {draftList.length > 200 && <div className="text-[11px] text-muted-foreground">200 premières pages affichées sur {nf(draftList.length)}.</div>}
            </div>
          )}

          {/* Filtres municipalités */}
          <div className="flex flex-wrap items-center gap-2">
            {CITY_FILTERS.map((f) => (
              <Button key={f.key} size="sm" variant={cityFilter === f.key ? "default" : "outline"} className="h-8 text-xs"
                onClick={() => { setCityFilter(f.key); setVisible(30); }}>
                {f.label}
              </Button>
            ))}
            <Button size="sm" variant={draftsOnly ? "default" : "outline"} className="h-8 text-xs"
              onClick={() => { setDraftsOnly((v) => !v); setVisible(30); }}>
              Uniquement les brouillons ({nf(summary.total)})
            </Button>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une municipalité…" className="h-8 w-full sm:w-52 text-xs" />
          </div>

          <div className="text-xs text-muted-foreground">
            Villes : {nf(cityAudit.complete)} complètes · {nf(cityAudit.to_publish)} à publier ·{" "}
            {nf(cityAudit.error)} avec erreur · {nf(cityAudit.incomplete)} incomplètes · {nf(cityAudit.check)} à vérifier.
          </div>

          {/* Tableau par municipalité */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[720px]">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-2">Municipalité</th>
                  <th className="py-2 px-2 text-right">Combinaisons</th>
                  <th className="py-2 px-2 text-right">Générées</th>
                  <th className="py-2 px-2 text-right">Publiées</th>
                  <th className="py-2 px-2 text-right">Brouillons</th>
                  <th className="py-2 px-2 text-right">Erreurs</th>
                  <th className="py-2 px-2 text-right">Manquantes</th>
                  <th className="py-2 px-2 text-right">% complétion</th>
                  <th className="py-2 pl-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, visible).map((c) => {
                  const st = cityAuditStatus(c);
                  const cityDrafts = draftsByCity.get(c.slug) ?? [];
                  const ready = cityDrafts.filter((d) => classifyDraft(d) === "ready").length;
                  return (
                    <tr key={c.slug} className="border-b border-border/60">
                      <td className="py-1.5 pr-2">
                        <div className="font-medium">{c.name}</div>
                        {cityDrafts.length > 0 && (
                          <div className="text-[10px] text-muted-foreground">{ready} brouillon(s) prêt(s) à publier</div>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right">{nf(c.planned)}</td>
                      <td className="py-1.5 px-2 text-right">{nf(c.generated)}</td>
                      <td className="py-1.5 px-2 text-right">{nf(c.published)}</td>
                      <td className="py-1.5 px-2 text-right">{nf(c.drafts)}</td>
                      <td className={`py-1.5 px-2 text-right ${c.errors > 0 ? "text-destructive font-medium" : ""}`}>{nf(c.errors)}</td>
                      <td className={`py-1.5 px-2 text-right ${c.remaining > 0 ? "text-amber-700 font-medium" : ""}`}>{nf(c.remaining)}</td>
                      <td className="py-1.5 px-2 text-right font-semibold">{cityCompletion(c)} %</td>
                      <td className="py-1.5 pl-2">
                        <Badge variant="outline" className={`text-[10px] ${CITY_TONE[st]}`}>{CITY_AUDIT_LABEL[st]}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-lg">Aucune municipalité pour ce filtre.</div>}
          {rows.length > visible && (
            <div className="text-center">
              <Button size="sm" variant="outline" onClick={() => setVisible((v) => v + 30)}>Afficher plus ({rows.length - visible})</Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

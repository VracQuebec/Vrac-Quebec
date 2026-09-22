// Audit LECTURE SEULE des combinaisons par ville.
// Source unique : seo_control_center() (mêmes chiffres que le Générateur),
// détail des combinaisons manquantes : seo_city_generation_report(_city_slug).
// Ce composant n'écrit jamais : aucune génération, aucune publication.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useSeoControlCenter, type ControlCityRow } from "@/lib/seo/useSeoControlCenter";
import { auditStatus, sortAuditRows, type AuditSortKey, AUDIT_STATUS_LABEL } from "@/lib/seo/cityAudit";
import { Loader2, Search, ClipboardList } from "lucide-react";

const nf = (n: number) => n.toLocaleString("fr-CA");

type Slot = {
  kind: string; label: string; material_slug: string | null; service_slug: string | null;
  state: string; page_slug: string | null; task_error: string | null;
};

const SORTS: Array<{ key: AuditSortKey; label: string }> = [
  { key: "missing", label: "Plus de pages manquantes" },
  { key: "generated", label: "Moins de pages générées" },
  { key: "errors", label: "Erreurs" },
  { key: "name", label: "Ville" },
  { key: "completeness", label: "Complétude" },
];

export default function CityCombinationAudit() {
  const { state, loading } = useSeoControlCenter();
  const [sort, setSort] = useState<AuditSortKey>("missing");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(25);
  const [detail, setDetail] = useState<{ city: ControlCityRow; slots: Slot[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = state?.cities ?? [];
    const needle = q.trim().toLowerCase();
    const filtered = needle ? list.filter((c) => c.name.toLowerCase().includes(needle) || c.slug.includes(needle)) : list;
    return sortAuditRows(filtered, sort);
  }, [state, q, sort]);

  const summary = useMemo(() => {
    const list = state?.cities ?? [];
    const acc = { total: list.length, complete: 0, incomplete: 0, none: 0, errors: 0, check: 0 };
    for (const c of list) {
      const s = auditStatus(c);
      if (s === "complete") acc.complete++;
      else if (s === "incomplete") acc.incomplete++;
      else if (s === "none") acc.none++;
      else if (s === "error") acc.errors++;
      else acc.check++;
    }
    return acc;
  }, [state]);

  async function openMissing(city: ControlCityRow) {
    setDetailLoading(city.slug);
    try {
      const { data, error } = await supabase.rpc("seo_city_generation_report" as never, { _city_slug: city.slug } as never);
      if (error) throw error;
      const slots = ((data as unknown as { slots?: Slot[] })?.slots ?? [])
        .filter((s) => s.state === "missing" || s.state === "error" || s.state === "pending");
      setDetail({ city, slots });
    } finally {
      setDetailLoading(null);
    }
  }

  return (
    <Card className="p-4 md:p-6 space-y-4">
      <header className="space-y-1">
        <h3 className="text-base font-display font-bold flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-primary" /> Audit des combinaisons par ville
        </h3>
        <p className="text-xs text-muted-foreground">
          Lecture seule. « Pertinentes » = combinaisons validées par la logique actuelle du Générateur
          (municipalité active du registre × matériau réellement demandé × service actif + page hub).
          « Générées » = combinaisons pertinentes pour lesquelles une page existe réellement.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
        <Tile label="Villes analysées" value={summary.total} />
        <Tile label="Complètes" value={summary.complete} tone="good" />
        <Tile label="Incomplètes" value={summary.incomplete} tone={summary.incomplete ? "warn" : undefined} />
        <Tile label="Sans page" value={summary.none} tone={summary.none ? "warn" : undefined} />
        <Tile label="Avec erreurs" value={summary.errors} tone={summary.errors ? "bad" : undefined} />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une ville…" className="h-8 pl-7 text-xs" />
        </div>
        {SORTS.map((s) => (
          <Button key={s.key} size="sm" variant={sort === s.key ? "default" : "outline"} className="h-8 text-xs"
            onClick={() => setSort(s.key)}>{s.label}</Button>
        ))}
      </div>

      {loading && !state && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</div>}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr className="border-b border-border">
              <th className="text-left py-2 pr-2">Ville</th>
              <th className="text-right px-2">Pertinentes</th>
              <th className="text-right px-2">Générées</th>
              <th className="text-right px-2">Publiées</th>
              <th className="text-right px-2">Brouillons</th>
              <th className="text-right px-2">Erreurs</th>
              <th className="text-right px-2">Manquantes</th>
              <th className="text-left px-2">Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((c) => {
              const st = auditStatus(c);
              return (
                <tr key={c.slug} className="border-b border-border/60">
                  <td className="py-1.5 pr-2 font-medium">{c.name}<div className="text-[10px] text-muted-foreground">{c.slug}</div></td>
                  <td className="text-right px-2">{nf(c.planned)}</td>
                  <td className="text-right px-2">{nf(c.generated)}</td>
                  <td className="text-right px-2">{nf(c.published)}</td>
                  <td className="text-right px-2">{nf(c.drafts)}</td>
                  <td className={`text-right px-2 ${c.errors ? "text-destructive font-semibold" : ""}`}>{nf(c.errors)}</td>
                  <td className={`text-right px-2 ${c.remaining ? "text-amber-600 font-semibold" : ""}`}>{nf(c.remaining)}</td>
                  <td className="px-2"><Badge variant="outline" className="text-[10px]">{AUDIT_STATUS_LABEL[st]}</Badge></td>
                  <td className="text-right">
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" disabled={detailLoading === c.slug}
                      onClick={() => void openMissing(c)}>
                      {detailLoading === c.slug ? <Loader2 className="w-3 h-3 animate-spin" /> : "Voir les combinaisons manquantes"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length > limit && (
        <div className="text-center">
          <Button size="sm" variant="outline" onClick={() => setLimit((v) => v + 25)}>Afficher plus ({rows.length - limit})</Button>
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>Combinaisons manquantes — {detail?.city.name}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-xs">
            {detail?.slots.length === 0 && (
              <div className="text-muted-foreground">
                Aucune combinaison pertinente manquante : les {nf(detail.city.planned)} combinaisons prévues existent déjà.
              </div>
            )}
            {detail?.slots.map((s) => (
              <div key={`${s.kind}-${s.material_slug ?? s.service_slug ?? "hub"}`} className="rounded border border-border p-2 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{detail.city.name}</strong>
                  <Badge variant="outline" className="text-[10px]">{s.kind === "material" ? "Matériau" : s.kind === "service" ? "Service" : "Hub"}</Badge>
                  <span>{s.label}</span>
                  <Badge variant="outline" className="text-[10px] ml-auto">{s.state === "missing" ? "Page existante : NON" : s.state === "error" ? "En erreur" : "En file"}</Badge>
                </div>
                <div className="text-muted-foreground">
                  Pertinence : {s.kind === "material"
                    ? "matériau demandé dans des soumissions rattachées à cette municipalité"
                    : s.kind === "service"
                      ? "service actif configuré sur ce territoire avec au moins une demande"
                      : "page ville obligatoire pour une municipalité active du registre"}
                </div>
                {s.task_error && <div className="text-destructive break-words">{s.task_error}</div>}
              </div>
            ))}
            <p className="text-muted-foreground pt-1">Aucune page n'est créée depuis cette fenêtre : diagnostic uniquement.</p>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" | "bad" }) {
  const cls = tone === "good" ? "text-green-700" : tone === "warn" ? "text-amber-600" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-background/50 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${cls}`}>{nf(value)}</div>
    </div>
  );
}

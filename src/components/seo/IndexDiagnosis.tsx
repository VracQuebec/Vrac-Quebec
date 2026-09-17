import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Sample = { slug: string; cause: string; city: string | null; material: string | null; service: string | null; words: number | null; internal_links: number };
type Payload = {
  computed_at: string; published: number; indexed: number; not_indexed: number;
  unknown_status: number; never_checked: number; not_tracked: number;
  gsc_connected: boolean;
  buckets: Array<{ cause: string; count: number }>;
  content_flags: Array<{ cause: string; count: number }>;
  samples: Sample[];
  orphans: Array<{ slug: string; city: string | null; material: string | null; service: string | null }>;
};

const CAUSE_LABELS: Record<string, string> = {
  indexee_confirmee: "Indexée — confirmé par Search Console",
  non_indexee_confirmee: "Non indexée — confirmé par Search Console",
  sans_statut_gsc: "Statut Search Console inconnu",
  jamais_verifiee: "Jamais vérifiée",
  non_suivie: "Non suivie (noindex volontaire)",
  page_orpheline: "Page orpheline (aucun lien interne)",
  contenu_insuffisant: "Contenu insuffisant (< 300 mots)",
};

export default function IndexDiagnosis() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("seo_index_diagnosis");
    if (error) toast.error(error.message);
    else setData(data as unknown as Payload);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  if (loading || !data) {
    return <div className="p-8 text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Diagnostic d'indexation…</div>;
  }

  return (
    <Card className="p-4 md:p-6 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-display font-bold flex items-center gap-2"><Search className="w-5 h-5 text-primary" /> Diagnostic d'indexation</h2>
          <p className="text-xs text-muted-foreground">
            {data.published} pages publiées · {data.indexed} indexées · {data.not_indexed} non indexées.
            {data.gsc_connected ? " Données Search Console présentes." : " Aucune donnée Search Console : les causes exactes ne peuvent pas être déterminées."}
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-2" onClick={load}><RefreshCw className="w-4 h-4" /> Actualiser</Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {data.causes.map((c) => (
          <div key={c.cause} className="flex items-center justify-between rounded-md border border-border bg-background/50 p-2 text-xs">
            <span>{CAUSE_LABELS[c.cause] ?? c.cause}</span>
            <Badge variant="outline">{c.count}</Badge>
          </div>
        ))}
        {data.causes.length === 0 && <div className="text-xs text-muted-foreground">Aucune page non indexée.</div>}
      </div>

      {data.orphans.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Pages orphelines</div>
          <ul className="text-xs space-y-0.5">
            {data.orphans.map((o) => <li key={o.slug}>• /{o.slug} — {o.city ?? "—"} · {o.material ?? o.service ?? "—"}</li>)}
          </ul>
        </div>
      )}

      <div className="overflow-auto max-h-[420px] border border-border rounded-lg">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background z-10">
            <tr className="text-left border-b border-border">
              <th className="p-2">Page</th><th className="p-2">Cause</th>
              <th className="p-2 text-right">Mots</th><th className="p-2 text-right">Liens internes</th>
            </tr>
          </thead>
          <tbody>
            {data.samples.map((s) => (
              <tr key={s.slug} className="border-b border-border/50">
                <td className="p-2">/{s.slug}</td>
                <td className="p-2">{CAUSE_LABELS[s.cause] ?? s.cause}</td>
                <td className="p-2 text-right">{s.words ?? "—"}</td>
                <td className="p-2 text-right">{s.internal_links}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground">Échantillon limité à 200 pages. Aucune cause n'est déduite lorsqu'aucune donnée ne permet de la déterminer.</p>
    </Card>
  );
}

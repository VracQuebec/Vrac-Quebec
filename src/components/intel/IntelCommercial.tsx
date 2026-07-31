// IA commerciale et rapport quotidien de direction.
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CAD, invokeIntelligence, type CommercialSuggestion } from "@/lib/jsc/intelligence";

export function CommercialPanel({ companyId }: { companyId: string | null }) {
  const [items, setItems] = useState<CommercialSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await invokeIntelligence<{ suggestions: CommercialSuggestion[] }>({
        action: "commercial", company_id: companyId,
      });
      setItems(res.suggestions ?? []);
      if (!res.suggestions?.length) toast.info("Données insuffisantes pour générer des suggestions fiables.");
    } catch (e) { toast.error((e as Error).message); }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <Button onClick={() => void run()} disabled={loading}>
        {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
        Générer les recommandations commerciales
      </Button>
      {items.map((s, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline">{s.type}</Badge>
              <span className="text-sm font-semibold">{s.titre}</span>
              {s.cible && <Badge variant="secondary">{s.cible}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{s.argumentaire}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Impact estimé {CAD(s.impact_estime)} · confiance {Math.round((s.confiance ?? 0) * 100)} %
            </p>
            {!!s.preuves?.length && (
              <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                {s.preuves.map((p, j) => <li key={j}>{p}</li>)}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DailyReportPanel({ companyId, lastReport }: {
  companyId: string | null;
  lastReport: { report_date: string; summary: string | null } | null;
}) {
  const [summary, setSummary] = useState<string | null>(lastReport?.summary ?? null);
  const [loading, setLoading] = useState(false);

  const run = async (email: boolean) => {
    setLoading(true);
    try {
      const res = await invokeIntelligence<{ summary: string; emailed: boolean }>({
        action: "daily_report", company_id: companyId, email,
      });
      setSummary(res.summary);
      toast.success(email
        ? (res.emailed ? "Rapport généré et envoyé par courriel" : "Rapport généré (aucun courriel configuré pour l'entreprise)")
        : "Rapport généré");
    } catch (e) { toast.error((e as Error).message); }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void run(false)} disabled={loading}>
          {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
          Générer le rapport du jour
        </Button>
        <Button variant="outline" onClick={() => void run(true)} disabled={loading}>
          <Mail className="mr-1.5 h-4 w-4" /> Générer et envoyer par courriel
        </Button>
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Rapport de direction {lastReport?.report_date ? `· ${lastReport.report_date}` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary
            ? <div className="whitespace-pre-wrap text-sm leading-relaxed">{summary}</div>
            : <p className="text-sm text-muted-foreground">Aucun rapport généré pour l'instant.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
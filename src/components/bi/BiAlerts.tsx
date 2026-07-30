// Centre d'alertes intelligent + résumés IA (quotidien / hebdomadaire / mensuel).
import { useState } from "react";
import { AlertTriangle, Bot, Info, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SectionCard } from "./BiShared";
import type { Alert } from "@/lib/bi/api";

const STYLES: Record<string, { cls: string; Icon: typeof Info }> = {
  critical: { cls: "border-destructive/40 bg-destructive/5 text-destructive", Icon: ShieldAlert },
  warning: { cls: "border-amber-500/40 bg-amber-500/5 text-amber-600", Icon: AlertTriangle },
  info: { cls: "border-border bg-muted/40 text-muted-foreground", Icon: Info },
};

const SCOPES = [
  { id: "daily", label: "Résumé quotidien" },
  { id: "weekly", label: "Résumé hebdomadaire" },
  { id: "monthly", label: "Résumé mensuel" },
];

export default function BiAlerts({ alerts, metrics }: { alerts: Alert[]; metrics: unknown }) {
  const [brief, setBrief] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  const generate = async (scope: string) => {
    setBusy(scope);
    const { data, error } = await supabase.functions.invoke("vqos-bi-brief", { body: { scope, metrics } });
    setBusy(null);
    if (error) { toast.error("Génération impossible pour le moment."); return; }
    const payload = data as { brief?: string; error?: string };
    if (payload?.error) { toast.error(payload.error); return; }
    setBrief(payload?.brief ?? "");
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Centre d'alertes" subtitle="Anomalies détectées automatiquement sur les données réelles">
        {alerts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucune anomalie détectée. Tout est sous contrôle.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a, i) => {
              const s = STYLES[a.level] ?? STYLES.info;
              return (
                <li key={i} className={`flex gap-3 rounded-lg border p-3 ${s.cls}`}>
                  <s.Icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{a.title}</p>
                    <p className="text-xs">{a.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Analyste IA"
        subtitle="Résumés, explication des variations, opportunités, risques et recommandations"
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            {SCOPES.map((s) => (
              <Button key={s.id} size="sm" variant="outline" disabled={busy !== null} onClick={() => generate(s.id)}>
                {busy === s.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                {s.label}
              </Button>
            ))}
          </div>
        }
      >
        {brief ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{brief}</div>
        ) : (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Bot className="h-4 w-4" /> Choisissez une période pour générer une analyse à partir des indicateurs affichés.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
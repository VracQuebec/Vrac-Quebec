// Vue d'ensemble du Centre IA — indicateurs issus des moteurs serveur.
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CAD, ENTITY_LABELS, type IntelDashboard } from "@/lib/jsc/intelligence";

const Kpi = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <Card>
    <CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </CardContent>
  </Card>
);

export default function IntelOverview({ data }: { data: IntelDashboard }) {
  const confidence = Math.round((data.learning?.avg_confidence ?? 0) * 100);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Niveau de confiance de l'IA" value={`${confidence} %`}
          hint={`${data.learning?.rows ?? 0} apprentissages · ${data.learning?.topics ?? 0} domaines`} />
        <Kpi label="Gains potentiels détectés" value={CAD(data.optimizations?.potential_gain)}
          hint={`${data.optimizations?.pending ?? 0} optimisation(s) en attente`} />
        <Kpi label="Gains déjà appliqués" value={CAD(data.optimizations?.realized_gain)}
          hint={`${data.optimizations?.applied ?? 0} proposition(s) appliquée(s)`} />
        <Kpi label="Anomalies ouvertes" value={String(data.anomalies?.open ?? 0)}
          hint={`${data.anomalies?.high ?? 0} critique(s) · impact ${CAD(data.anomalies?.impact)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Apprentissage par domaine</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(data.learning_topics ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun apprentissage encore calculé.</p>
            )}
            {(data.learning_topics ?? []).map((t) => (
              <div key={t.topic}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium">{t.topic}</span>
                  <span className="text-muted-foreground">{t.rows} entrée(s) · {Math.round(t.confidence * 100)} %</span>
                </div>
                <Progress value={Math.round(t.confidence * 100)} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Scores dynamiques</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data.scores ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Aucun score calculé pour l'instant.</p>
            )}
            {(data.scores ?? []).map((s) => (
              <div key={s.entity_type} className="flex items-center justify-between text-sm">
                <span>{ENTITY_LABELS[s.entity_type] ?? s.entity_type}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="secondary">{s.count}</Badge>
                  <span className="font-semibold">{s.avg_score}/100</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Meilleures performances</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data.top_scores ?? []).length === 0 && <p className="text-sm text-muted-foreground">—</p>}
            {(data.top_scores ?? []).map((s) => (
              <div key={`${s.entity_type}-${s.entity_id}`} className="flex items-center justify-between text-sm">
                <span className="truncate">
                  <Badge variant="outline" className="mr-2">{ENTITY_LABELS[s.entity_type] ?? s.entity_type}</Badge>
                  {s.label ?? s.entity_id.slice(0, 8)}
                </span>
                <span className="font-semibold">{s.score} · {s.grade}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">À surveiller</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(data.weak_scores ?? []).length === 0 && <p className="text-sm text-muted-foreground">—</p>}
            {(data.weak_scores ?? []).map((s) => (
              <div key={`${s.entity_type}-${s.entity_id}`} className="flex items-center justify-between text-sm">
                <span className="truncate">
                  <Badge variant="outline" className="mr-2">{ENTITY_LABELS[s.entity_type] ?? s.entity_type}</Badge>
                  {s.label ?? s.entity_id.slice(0, 8)}
                </span>
                <span className="font-semibold text-destructive">{s.score} · {s.grade}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
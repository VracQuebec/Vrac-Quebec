// Prévisions, saisonnalité et tendances calculées sur l'historique réel.
import { LineChart, TrendingUp } from "lucide-react";
import { BarBlock, DataTable, KpiCard, LineBlock, SectionCard, type Col } from "./BiShared";
import { money, num, type Forecast } from "@/lib/bi/api";

const HISTORY_COLS: Col[] = [
  { key: "month", label: "Mois" },
  { key: "revenue", label: "Chiffre d'affaires", format: "money" },
  { key: "orders", label: "Commandes", format: "number" },
];

const FORECAST_COLS: Col[] = [
  { key: "month", label: "Mois" },
  { key: "forecast", label: "Prévision", format: "money" },
];

export default function BiForecast({ data }: { data: Forecast }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="Moyenne 3 mois" value={money(data.avg_3m)} Icon={TrendingUp} />
        <KpiCard label="Moyenne 12 mois" value={money(data.avg_12m)} Icon={TrendingUp} />
        <KpiCard label="Croissance estimée" value={`${num(data.growth_pct, 1)} %`} hint="3 derniers mois vs 12 mois" Icon={LineChart} />
      </div>

      <SectionCard title="Historique et évolution mensuelle" subtitle="Chiffre d'affaires réel par mois">
        <LineBlock rows={data.history} xKey="month" series={[{ key: "revenue", label: "Chiffre d'affaires" }]} />
        <div className="mt-3"><DataTable rows={data.history} cols={HISTORY_COLS} filename="historique-mensuel" /></div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Prévisions des ventes" subtitle="Projection 6 mois basée sur la moyenne récente et la croissance">
          <LineBlock rows={data.projection} xKey="month" series={[{ key: "forecast", label: "Prévision" }]} height={240} />
          <div className="mt-3"><DataTable rows={data.projection} cols={FORECAST_COLS} filename="previsions" /></div>
        </SectionCard>
        <SectionCard title="Saisonnalité" subtitle="Chiffre d'affaires cumulé par mois de l'année">
          <BarBlock rows={data.seasonality} xKey="label" yKey="revenue" height={240} />
        </SectionCard>
      </div>
    </div>
  );
}
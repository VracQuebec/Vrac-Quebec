// Analyses clients, matériaux, transporteurs, fournisseurs et opérations.
import { AlertTriangle, Clock, PackageX, Timer, TrendingDown, TrendingUp, Truck } from "lucide-react";
import { BarBlock, DataTable, KpiCard, SectionCard, type Col } from "./BiShared";
import { num, type Analytics, type Row } from "@/lib/bi/api";

const CLIENT_COLS: Col[] = [
  { key: "name", label: "Client" },
  { key: "orders", label: "Commandes", format: "number" },
  { key: "lifetime_value", label: "Valeur à vie", format: "money" },
  { key: "profit", label: "Profit", format: "money" },
  { key: "frequency_days", label: "Fréquence (j)", format: "number" },
  { key: "last_order", label: "Dernière commande" },
];

const MATERIAL_COLS: Col[] = [
  { key: "name", label: "Matériau" },
  { key: "revenue", label: "Ventes", format: "money" },
  { key: "previous_revenue", label: "Période précédente", format: "money" },
  { key: "growth", label: "Croissance", format: "pct" },
  { key: "quantity", label: "Quantité", format: "number" },
  { key: "profit", label: "Profit", format: "money" },
];

const CARRIER_COLS: Col[] = [
  { key: "name", label: "Transporteur" },
  { key: "deliveries", label: "Livraisons", format: "number" },
  { key: "completed", label: "Complétées", format: "number" },
  { key: "late", label: "Retards", format: "number" },
  { key: "cancelled", label: "Annulations", format: "number" },
  { key: "avg_minutes", label: "Temps moyen (min)", format: "number" },
  { key: "cost", label: "Coût transport", format: "money" },
];

const TRUCK_COLS: Col[] = [
  { key: "name", label: "Camion" },
  { key: "status", label: "État" },
  { key: "deliveries", label: "Livraisons", format: "number" },
];

const SUPPLIER_COLS: Col[] = [
  { key: "name", label: "Fournisseur" },
  { key: "orders", label: "Commandes", format: "number" },
  { key: "purchase_value", label: "Valeur des achats", format: "money" },
  { key: "revenue", label: "CA généré", format: "money" },
  { key: "incidents", label: "Incidents", format: "number" },
  { key: "reliability", label: "Fiabilité", format: "pct" },
];

export default function BiEntities({ data }: { data: Analytics }) {
  const clients = ((data.clients as Row[]) ?? []);
  const materialsRaw = ((data.materials_trend as Row[]) ?? []);
  const materials: Row[] = materialsRaw.map((m) => {
    const prev = Number(m.previous_revenue ?? 0), cur = Number(m.revenue ?? 0);
    return { ...m, growth: prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : cur ? 100 : 0 };
  });
  const bestSellers = [...materials].sort((a, b) => Number(b.revenue) - Number(a.revenue));
  const worstSellers = [...materials].sort((a, b) => Number(a.revenue) - Number(b.revenue));
  const mostProfitable = [...materials].sort((a, b) => Number(b.profit) - Number(a.profit));
  const carriers = ((data.carriers as Row[]) ?? []);
  const trucks = ((data.trucks as Row[]) ?? []);
  const suppliers = ((data.suppliers as Row[]) ?? []).map((s) => ({
    ...s,
    reliability: Number(s.orders ?? 0)
      ? Math.max(0, 100 - (Number(s.incidents ?? 0) / Number(s.orders)) * 100)
      : 100,
  }));
  const ops = (data.operations as Record<string, number>) ?? {};
  const availableTrucks = trucks.filter((t) => String(t.status).toLowerCase().includes("dispon")).length;

  return (
    <div className="space-y-4">
      <SectionCard title="Clients les plus rentables" subtitle="Valeur à vie, fréquence d'achat et dernière commande">
        <BarBlock rows={clients} xKey="name" yKey="lifetime_value" />
        <div className="mt-3"><DataTable rows={clients} cols={CLIENT_COLS} filename="clients" /></div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Matériaux les plus vendus" subtitle="Croissance vs période précédente">
          <DataTable rows={bestSellers} cols={MATERIAL_COLS} filename="materiaux-top" />
        </SectionCard>
        <SectionCard title="Matériaux les moins vendus" subtitle="Produits à relancer ou à retirer">
          <DataTable rows={worstSellers} cols={MATERIAL_COLS} filename="materiaux-faibles" />
        </SectionCard>
      </div>

      <SectionCard title="Matériaux les plus rentables" subtitle="Profit net généré sur la période">
        <BarBlock rows={mostProfitable} xKey="name" yKey="profit" />
      </SectionCard>

      <SectionCard title="Performance des transporteurs" subtitle="Livraisons, retards, temps moyen et coûts">
        <DataTable rows={carriers} cols={CARRIER_COLS} filename="transporteurs" />
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Utilisation de la flotte" subtitle={`${availableTrucks} camion(s) disponible(s) sur ${trucks.length}`}>
          <DataTable rows={trucks} cols={TRUCK_COLS} filename="camions" />
        </SectionCard>
        <SectionCard title="Performance des fournisseurs" subtitle="Achats, incidents et fiabilité">
          <DataTable rows={suppliers} cols={SUPPLIER_COLS} filename="fournisseurs" />
        </SectionCard>
      </div>

      <SectionCard title="Analyse opérationnelle" subtitle="Délais réels mesurés sur les livraisons">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Demande → livraison" value={`${num(ops.avg_request_to_delivery_days, 1)} j`} Icon={Clock} />
          <KpiCard label="Temps de préparation" value={`${num(ops.avg_prep_hours, 1)} h`} Icon={Timer} />
          <KpiCard label="Temps de chargement" value={`${num(ops.avg_loading_minutes, 1)} min`} Icon={Timer} />
          <KpiCard label="Temps de transport" value={`${num(ops.avg_transport_minutes, 1)} min`} Icon={Truck} />
          <KpiCard label="Incidents (période)" value={num(ops.incidents)} hint={`${num(ops.incidents_open)} non résolu(s)`} Icon={AlertTriangle} />
          <KpiCard label="Annulations" value={num(ops.cancellations)} Icon={PackageX} />
          <KpiCard label="Livraisons en retard" value={num(ops.late_deliveries)} Icon={TrendingDown} />
          <KpiCard label="Camions actifs" value={num(trucks.length)} hint={`${availableTrucks} disponible(s)`} Icon={TrendingUp} />
        </div>
      </SectionCard>
    </div>
  );
}
// Analyse des ventes et de la rentabilité par dimension.
import { BarBlock, DataTable, PieBlock, SectionCard, type Col } from "./BiShared";
import type { Analytics, Row } from "@/lib/bi/api";

const SALES_COLS: Col[] = [
  { key: "name", label: "Nom" },
  { key: "revenue", label: "Ventes", format: "money" },
  { key: "orders", label: "Commandes", format: "number" },
  { key: "profit", label: "Profit", format: "money" },
];

const DIMENSIONS: Array<{ key: string; title: string; subtitle: string; chart: "bar" | "pie" }> = [
  { key: "sales_by_material", title: "Ventes par matériau", subtitle: "Volume et rentabilité par produit", chart: "bar" },
  { key: "sales_by_category", title: "Ventes par catégorie", subtitle: "Répartition du chiffre d'affaires", chart: "pie" },
  { key: "sales_by_city", title: "Ventes par ville", subtitle: "Territoires les plus actifs", chart: "bar" },
  { key: "sales_by_region", title: "Ventes par région", subtitle: "Répartition territoriale", chart: "pie" },
  { key: "sales_by_carrier", title: "Ventes par transporteur", subtitle: "Contribution de chaque transporteur", chart: "bar" },
  { key: "sales_by_supplier", title: "Ventes par fournisseur", subtitle: "Valeur générée par source d'approvisionnement", chart: "bar" },
  { key: "sales_by_client", title: "Ventes par client", subtitle: "Clients les plus importants", chart: "bar" },
  { key: "profit_by_project", title: "Rentabilité par projet", subtitle: "Profit net par chantier", chart: "bar" },
];

export default function BiSales({ data }: { data: Analytics }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {DIMENSIONS.map((d) => {
        const rows = (data[d.key] as Row[]) ?? [];
        return (
          <SectionCard key={d.key} title={d.title} subtitle={d.subtitle}>
            {d.chart === "pie"
              ? <PieBlock rows={rows} nameKey="name" valueKey="revenue" />
              : <BarBlock rows={rows} xKey="name" yKey="revenue" />}
            <div className="mt-3">
              <DataTable rows={rows} cols={SALES_COLS} filename={d.key} />
            </div>
          </SectionCard>
        );
      })}
    </div>
  );
}
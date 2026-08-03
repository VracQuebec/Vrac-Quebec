// Jumeau numérique — représentation temps réel de tous les éléments de la plateforme.
import { CAD, NUM, type TwinData } from "@/lib/jsc/orchestrator";

const COUNT_LABELS: Record<string, string> = {
  companies: "Entreprises", suppliers: "Fournisseurs", carriers: "Transporteurs du réseau",
  trucks: "Camions", drivers: "Chauffeurs", clients: "Clients", materials: "Matériaux",
  pickup_locations: "Lieux de chargement", projects: "Chantiers", orders_open: "Commandes ouvertes",
  deliveries_today: "Livraisons aujourd'hui", incidents_open: "Incidents ouverts",
};

function Table({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{title} <span className="text-muted-foreground">({rows.length})</span></h3>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Aucune donnée.</p> : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
              <tr>{head.map((h) => <th key={h} className="py-1.5 text-left font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border/50">
                  {r.map((c, j) => <td key={j} className="py-1.5 pr-2">{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function DigitalTwin({ data }: { data: TwinData }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Object.entries(data.counts).map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border bg-card p-3">
            <div className="text-2xl font-bold">{NUM(v)}</div>
            <div className="text-xs text-muted-foreground">{COUNT_LABELS[k] ?? k}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Table title="Camions" head={["Camion", "Type", "Capacité", "État", "Aujourd'hui"]}
          rows={data.trucks.map((t) => [t.name, t.truck_type ?? "—", t.capacity_tonnes ? `${NUM(t.capacity_tonnes, 1)} t` : "—", t.operational_status ?? t.availability ?? "—", t.today_deliveries])} />
        <Table title="Chauffeurs" head={["Chauffeur", "Statut", "Aujourd'hui"]}
          rows={data.drivers.map((d) => [d.name, d.status ?? "—", d.today_deliveries])} />
        <Table title="Fournisseurs" head={["Fournisseur", "Ville", "Commandes 90 j"]}
          rows={data.suppliers.map((s) => [s.name, s.city ?? "—", s.orders_90d])} />
        <Table title="Matériaux" head={["Matériau", "Unité", "Prix", "Disponibilité", "Commandes 90 j"]}
          rows={data.materials.map((m) => [m.name, m.unit ?? "—", m.selling_price != null ? CAD(m.selling_price) : "—", m.availability ?? "—", m.orders_90d])} />
        <Table title="Livraisons (J-1 à J+7)" head={["N°", "Statut", "Ville", "Date"]}
          rows={data.deliveries.map((d) => [d.delivery_number ?? "—", d.status, d.city ?? "—", d.scheduled_date ?? "—"])} />
      </div>
    </div>
  );
}

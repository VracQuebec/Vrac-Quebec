// Tableau de bord exécutif — indicateurs temps réel calculés sur les données réelles.
import {
  DollarSign, Inbox, FileText, ClipboardList, Truck, Users, Percent, Wallet, TrendingUp, HardHat,
} from "lucide-react";
import { KpiCard, LineBlock, SectionCard } from "./BiShared";
import { money, num, pct, type Overview } from "@/lib/bi/api";

export default function BiExecutive({ data }: { data: Overview }) {
  const r = data.revenue, c = data.counts, a = data.averages, p = data.profitability;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="CA aujourd'hui" value={money(r.today)} Icon={DollarSign} />
        <KpiCard label="CA cette semaine" value={money(r.week)} Icon={DollarSign} />
        <KpiCard label="CA ce mois" value={money(r.month)} Icon={DollarSign} />
        <KpiCard label="CA cette année" value={money(r.year)} Icon={DollarSign} />
        <KpiCard label="CA de la période" value={money(r.period)} current={r.period} previous={r.previous} Icon={TrendingUp} />
        <KpiCard label="Demandes" value={num(c.requests)} current={c.requests} previous={c.requests_previous} Icon={Inbox} />
        <KpiCard label="Soumissions" value={num(c.quotes)} hint={`${num(c.quotes_accepted)} acceptée(s)`} Icon={FileText} />
        <KpiCard label="Commandes" value={num(c.orders)} current={c.orders} previous={c.orders_previous} Icon={ClipboardList} />
        <KpiCard label="Taux de conversion" value={pct(a.conversion_pct)} hint="Commandes / demandes" Icon={Percent} />
        <KpiCard label="Valeur moyenne d'une commande" value={money(a.order_value)} Icon={Wallet} />
        <KpiCard label="Livraisons" value={num(c.deliveries)} Icon={Truck} />
        <KpiCard label="Nouveaux clients" value={num(c.new_clients)} Icon={Users} />
        <KpiCard label="Entrepreneurs actifs" value={num(c.active_entrepreneurs)} Icon={HardHat} />
        <KpiCard label="Marge brute" value={money(p.gross_margin)} hint={`${num(p.gross_margin_pct, 1)} % du CA`} Icon={TrendingUp} />
        <KpiCard label="Marge nette" value={money(p.net_margin)} hint={`${num(p.net_margin_pct, 1)} % du CA`} Icon={TrendingUp} />
        <KpiCard label="Profit moyen par commande" value={money(p.profit_per_order)} Icon={DollarSign} />
      </div>

      <SectionCard title="Évolution mensuelle" subtitle="Chiffre d'affaires et marge nette par mois">
        <LineBlock
          rows={data.monthly}
          xKey="month"
          series={[{ key: "revenue", label: "Chiffre d'affaires" }, { key: "net_margin", label: "Marge nette" }]}
        />
      </SectionCard>
    </div>
  );
}
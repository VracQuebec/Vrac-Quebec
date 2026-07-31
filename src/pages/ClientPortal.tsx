// Vrac Québec OS — Portail client (données cloisonnées, aucune info stratégique).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, FileText, Inbox, Truck, Receipt, ClipboardList, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

type Row = Record<string, unknown>;
type Portal = {
  client: Row | null; requests: Row[]; quotes: Row[]; orders: Row[]; deliveries: Row[]; invoices: Row[];
};

const money = (v: unknown) =>
  typeof v === "number" ? v.toLocaleString("fr-CA", { style: "currency", currency: "CAD" }) : "—";
const date = (v: unknown) => (typeof v === "string" ? new Date(v).toLocaleDateString("fr-CA") : "—");

function List({ rows, numberKey, amountKey, dateKey, empty }: {
  rows: Row[]; numberKey: string; amountKey?: string; dateKey: string; empty: string;
}) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="divide-y">
      {rows.map((r) => (
        <div key={String(r.id)} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div>
            <p className="text-sm font-medium">{String(r[numberKey] ?? "—")}</p>
            <p className="text-xs text-muted-foreground">{date(r[dateKey])}</p>
          </div>
          <div className="flex items-center gap-3">
            {amountKey && <span className="text-sm font-semibold">{money(r[amountKey])}</span>}
            <Badge variant="secondary">{String(r.status ?? "—")}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ClientPortal() {
  const { isReady, user } = useAuthReady();
  const [data, setData] = useState<Portal | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: res, error } = await supabase.rpc("jsc_client_portal");
    if (error) console.error("client portal:", error.message);
    setData((res as unknown as Portal) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { if (isReady && user) void load(); else if (isReady) setLoading(false); }, [isReady, user, load]);

  const stats = useMemo(() => [
    { label: "Demandes", value: data?.requests?.length ?? 0, icon: Inbox },
    { label: "Soumissions", value: data?.quotes?.length ?? 0, icon: FileText },
    { label: "Commandes", value: data?.orders?.length ?? 0, icon: ClipboardList },
    { label: "Livraisons", value: data?.deliveries?.length ?? 0, icon: Truck },
  ], [data]);

  if (!isReady || loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement de votre portail…
    </div>;
  }

  if (!user || !data?.client) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-semibold">Portail client</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Votre compte n'est pas encore relié à un dossier client. Contactez-nous pour activer votre accès.
        </p>
        <Button asChild><Link to="/soumission">Demander une soumission</Link></Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <Link to="/" className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Retour au site
          </Link>
          <h1 className="text-2xl font-bold">Bonjour {String(data.client.name ?? "")}</h1>
          <p className="text-sm text-muted-foreground">
            Suivez vos demandes, soumissions, livraisons et factures en temps réel.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Mon dossier</CardTitle></CardHeader>
          <CardContent>
            <Tabs defaultValue="requests">
              <TabsList className="flex flex-wrap">
                <TabsTrigger value="requests">Demandes</TabsTrigger>
                <TabsTrigger value="quotes">Soumissions</TabsTrigger>
                <TabsTrigger value="orders">Commandes</TabsTrigger>
                <TabsTrigger value="deliveries">Livraisons</TabsTrigger>
                <TabsTrigger value="invoices">Factures</TabsTrigger>
              </TabsList>
              <TabsContent value="requests">
                <List rows={data.requests ?? []} numberKey="request_number" dateKey="created_at" empty="Aucune demande." />
              </TabsContent>
              <TabsContent value="quotes">
                <List rows={data.quotes ?? []} numberKey="quote_number" amountKey="total" dateKey="created_at" empty="Aucune soumission." />
              </TabsContent>
              <TabsContent value="orders">
                <List rows={data.orders ?? []} numberKey="order_number" amountKey="total" dateKey="created_at" empty="Aucune commande." />
              </TabsContent>
              <TabsContent value="deliveries">
                <List rows={data.deliveries ?? []} numberKey="delivery_number" dateKey="scheduled_date" empty="Aucune livraison planifiée." />
              </TabsContent>
              <TabsContent value="invoices">
                <List rows={data.invoices ?? []} numberKey="invoice_number" amountKey="total" dateKey="created_at" empty="Aucune facture." />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Receipt className="h-3.5 w-3.5" /> Les montants affichés incluent les taxes applicables.
        </p>
      </main>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ClipboardList, MapPin, Ticket, Truck } from "lucide-react";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { useEntrepreneurData } from "@/lib/entrepreneur-app/EntrepreneurDataProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SERVICE_KINDS, type ServiceKind } from "@/components/ops/ServiceOffers";
import type { Database } from "@/integrations/supabase/types";

type Book = Database["public"]["Tables"]["cpn_books"]["Row"];
type Service = Database["public"]["Tables"]["svc_requests"]["Row"];
type Mission = Database["public"]["Tables"]["drv_missions"]["Row"];

export default function EntrepreneurActivites() {
  const [params, setParams] = useSearchParams();
  const requestedView = params.get("vue");
  const view = requestedView === "coupons" || requestedView === "services" ? requestedView : "voyages";
  const { submissions, loading: requestsLoading } = useEntrepreneurData();
  const [books, setBooks] = useState<Book[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.from("cpn_books").select("*").eq("recipient_type", "entrepreneur").order("created_at", { ascending: false }).limit(50),
      supabase.from("svc_requests").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("drv_missions").select("*").order("started_at", { ascending: false }).limit(50),
    ]).then(([b, s, m]) => {
      if (!active) return;
      setBooks(b.data ?? []);
      setServices(s.data ?? []);
      setMissions(m.data ?? []);
      setError(Boolean(b.error || s.error || m.error));
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  return (
    <EntrepreneurAppShell title={view === "coupons" ? "Coupons" : view === "services" ? "Services des chantiers" : "Voyages"} backTo={null}>
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6">
        {loading || requestsLoading ? <p className="text-sm text-muted-foreground">Chargement…</p> : error ? <p role="alert" className="text-sm text-destructive">Certaines informations ne sont pas disponibles pour le moment.</p> : null}

        <Tabs value={view} onValueChange={value => { const next = new URLSearchParams(params); next.set("vue", value); setParams(next); }}>
        <TabsList className="grid h-11 w-full grid-cols-3">
          <TabsTrigger value="voyages">Voyages</TabsTrigger>
          <TabsTrigger value="coupons">Coupons</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
        </TabsList>
        <TabsContent value="coupons" className="mt-6 space-y-6">
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 font-display font-bold"><Ticket className="h-5 w-5 text-primary" /> Mes carnets de coupons</h3>
          {books.length === 0 && !loading ? <p className="text-sm text-muted-foreground">Aucun carnet attribué à votre entreprise.</p> : books.map((book) => (
            <div key={book.id} className="border-b border-border py-2 text-sm">
              <p className="font-semibold">{book.book_number} · {book.status.replace(/_/g, " ")}</p>
              <p className="text-muted-foreground">Coupons {book.first_coupon} à {book.last_coupon}{book.shipped_at ? ` · expédié le ${new Date(book.shipped_at).toLocaleDateString("fr-CA")}` : ""}</p>
            </div>
          ))}
        </section>
        </TabsContent>
        <TabsContent value="voyages" className="mt-6 space-y-6">
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 font-display font-bold"><Truck className="h-5 w-5 shrink-0 text-primary" /> Décompte des voyages par demande</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {submissions.map((sub) => (
              <div key={sub.id} className="space-y-2 border-b border-border py-3 text-sm">
                <p className="font-semibold">{sub.location || "Chantier à confirmer"}</p>
                <p className="text-muted-foreground">{sub.material || "Matériau à confirmer"}</p>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline"><Link to={`/compteur/${sub.id}?cote=livre`}>Voyages livrés</Link></Button>
                  <Button asChild size="sm" variant="outline"><Link to={`/entrepreneur/demandes/s-${sub.id}`}>Voir la demande</Link></Button>
                </div>
              </div>
            ))}
          </div>
          {submissions.length === 0 && !requestsLoading && <p className="text-sm text-muted-foreground">Aucun chantier associé à votre compte.</p>}
        </section>
        </TabsContent>

        <TabsContent value="services" className="mt-6 space-y-6">
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 font-display font-bold"><ClipboardList className="h-5 w-5 text-primary" /> Services et analyses de sols</h3>
          {services.length === 0 && !loading ? <p className="text-sm text-muted-foreground">Aucune demande de service envoyée.</p> : services.map((service) => (
            <div key={service.id} className="border-b border-border py-2 text-sm">
              <p className="font-semibold">{SERVICE_KINDS[service.kind as ServiceKind]?.label ?? service.kind} · {service.status.replace(/_/g, " ")}</p>
              <p className="text-muted-foreground">{service.site_address || "Chantier non précisé"} · {new Date(service.created_at).toLocaleDateString("fr-CA")}</p>
            </div>
          ))}
          <Button asChild variant="outline" size="sm"><Link to="/entrepreneur/demandes">Demander un service pour un chantier</Link></Button>
        </section>
        </TabsContent>
        </Tabs>

        <div className="space-y-6">
        <h2 className="border-b border-border pb-2 font-display text-lg font-bold">Suivi et relances</h2>
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 font-display font-bold"><MapPin className="h-5 w-5 text-primary" /> Missions des chauffeurs</h3>
          {missions.slice(0, 5).map((mission) => (
            <p key={mission.id} className="border-b border-border py-2 text-sm">{mission.driver_label || "Chauffeur"} · {mission.truck_label || "Camion non précisé"} · {mission.ended_at ? "Terminée" : "En cours"} · {new Date(mission.started_at).toLocaleDateString("fr-CA")}</p>
          ))}
          <Button asChild variant="outline" size="sm"><Link to="/chauffeur/mission">Ma mission</Link></Button>
        </section>

        <section className="border-t border-border pt-5">
          <h3 className="font-display font-bold">Relances</h3>
          <p className="mt-1 text-sm text-muted-foreground">Les campagnes promotionnelles ne sont pas activées. Les préférences d’envoi ne sont pas encore disponibles.</p>
        </section>
        </div>
      </div>
    </EntrepreneurAppShell>
  );
}
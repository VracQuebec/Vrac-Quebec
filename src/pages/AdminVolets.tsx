import { Link } from "react-router-dom";
import { Activity, Bell, ClipboardList, MapPin, Ticket, Truck } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import PageHeader from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";

const sections = [
  { title: "Carnets de coupons", detail: "Préparation, expédition, pertes et impression", to: "/admin/coupons", icon: Ticket },
  { title: "Compteur de voyages", detail: "Décomptes reçus et livrés par demande", to: "/admin/volets/voyages", icon: Truck },
  { title: "Pépine, camions et matériaux", detail: "Demandes et vérifications avant confirmation", to: "/admin/services", icon: ClipboardList },
  { title: "Analyses de sols", detail: "Soumissions, rendez-vous, prélèvements et résultats", to: "/admin/services?volet=sols", icon: Activity },
  { title: "Missions des chauffeurs", detail: "Missions et arrêts horodatés", to: "/admin/missions", icon: MapPin },
  { title: "Relances commerciales", detail: "Calendrier prévisionnel sans envoi promotionnel", to: "/admin/relances", icon: Bell },
] as const;

export default function AdminVolets() {
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading } = useUserRoles(user, isReady);
  if (!isReady || loading) return <p className="p-8 text-muted-foreground">Chargement…</p>;
  if (!isAdmin) return <p className="p-8 text-muted-foreground">Accès réservé à l’équipe Vrac Québec.</p>;
  return <div className="min-h-screen bg-background">
    <PageHeader title="Coupons, voyages et services" />
    <main className="mx-auto grid max-w-5xl gap-3 px-4 py-6 sm:grid-cols-2">
      {sections.map(({ title, detail, to, icon: Icon }) => <div key={to} className="flex min-h-36 flex-col justify-between gap-3 rounded-md border border-border p-4">
        <div><h2 className="flex items-center gap-2 font-display font-bold"><Icon className="h-5 w-5 text-primary" />{title}</h2><p className="mt-2 text-sm text-muted-foreground">{detail}</p></div>
        <Button asChild variant="outline" size="sm" className="self-start"><Link to={to}>Ouvrir</Link></Button>
      </div>)}
    </main>
  </div>;
}
// Transport JSC — Console d'administration (Architecture « Admin First »).
// Toutes les données de l'entreprise se configurent ici avant tout calcul.
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Layers, Building2, MapPin, DollarSign, Truck, Route, Globe2, Percent, Settings2, ShieldCheck,
} from "lucide-react";
import { JSC_RESOURCES } from "@/lib/jsc/config";
import ResourceManager from "@/components/jsc/ResourceManager";

const ICONS: Record<string, typeof Layers> = {
  Layers, Building2, MapPin, DollarSign, Truck, Route, Globe2, Percent, Settings2,
};

export default function AdminJsc() {
  const [activeId, setActiveId] = useState(JSC_RESOURCES[0].id);
  const active = JSC_RESOURCES.find((r) => r.id === activeId) ?? JSC_RESOURCES[0];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link to="/admin" className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Retour à l'administration
            </Link>
            <h1 className="text-2xl font-bold">Transport JSC — Paramètres</h1>
            <p className="text-sm text-muted-foreground">
              Source de vérité unique : matériaux, fournisseurs, camions, tarifs, taxes et zones.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Données internes — jamais visibles par les clients
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl gap-6 px-4 py-6 lg:flex">
        <nav className="mb-4 flex gap-2 overflow-x-auto lg:mb-0 lg:w-64 lg:flex-col lg:overflow-visible">
          {JSC_RESOURCES.map((r) => {
            const Icon = ICONS[r.icon] ?? Settings2;
            const isActive = r.id === activeId;
            return (
              <button
                key={r.id}
                onClick={() => setActiveId(r.id)}
                className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "border-primary bg-primary/10 font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{r.title}</span>
              </button>
            );
          })}
        </nav>

        <main className="min-w-0 flex-1">
          <ResourceManager key={active.id} resource={active} />
        </main>
      </div>
    </div>
  );
}
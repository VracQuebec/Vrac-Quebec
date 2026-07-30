// Transport JSC — Console d'administration (Architecture « Admin First »).
// Toutes les données de l'entreprise se configurent ici avant tout calcul.
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Layers, Building2, Building, MapPin, DollarSign, Truck, Route, Globe2, Percent,
  Settings2, ShieldCheck, History, DatabaseBackup, Loader2,
} from "lucide-react";
import { JSC_RESOURCES, JSC_COMPANY_RESOURCE } from "@/lib/jsc/config";
import ResourceManager from "@/components/jsc/ResourceManager";
import AuditTrail from "@/components/jsc/AuditTrail";
import ConfigBackup from "@/components/jsc/ConfigBackup";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";

const ICONS: Record<string, typeof Layers> = {
  Layers, Building2, Building, MapPin, DollarSign, Truck, Route, Globe2, Percent, Settings2,
};

const RESOURCES = [...JSC_RESOURCES, JSC_COMPANY_RESOURCE];

export default function AdminJsc() {
  const { isReady, user } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles(user, isReady);
  const [activeId, setActiveId] = useState(RESOURCES[0].id);
  const [reloadKey, setReloadKey] = useState(0);
  const active = RESOURCES.find((r) => r.id === activeId);

  if (!isReady || rolesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Vérification des permissions…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <ShieldCheck className="h-8 w-8 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Accès réservé</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Les paramètres de la plateforme sont accessibles uniquement aux administrateurs.
        </p>
        <Link to="/" className="text-sm text-primary hover:underline">Retour à l'accueil</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link to="/admin" className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Retour à l'administration
            </Link>
            <h1 className="text-2xl font-bold">Vrac Québec — Paramètres de la plateforme</h1>
            <p className="text-sm text-muted-foreground">
              Source de vérité unique : transporteurs, fournisseurs, matériaux, camions, tarifs, taxes et zones.
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
          {RESOURCES.map((r) => {
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
          {[
            { id: "audit", title: "Journal d'audit", Icon: History },
            { id: "backup", title: "Sauvegarde", Icon: DatabaseBackup },
          ].map(({ id, title, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveId(id)}
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                activeId === id
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="whitespace-nowrap">{title}</span>
            </button>
          ))}
        </nav>

        <main className="min-w-0 flex-1">
          {activeId === "audit" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Journal d'audit</h2>
                <p className="text-sm text-muted-foreground">
                  Chaque création, modification, archivage ou suppression est historisée avec
                  l'utilisateur, la date, l'ancienne et la nouvelle valeur.
                </p>
              </div>
              <AuditTrail />
            </div>
          )}
          {activeId === "backup" && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold">Export / import de la configuration</h2>
                <p className="text-sm text-muted-foreground">
                  Sauvegarde complète et restauration de tous les paramètres.
                </p>
              </div>
              <ConfigBackup onImported={() => setReloadKey((k) => k + 1)} />
            </div>
          )}
          {active && <ResourceManager key={`${active.id}-${reloadKey}`} resource={active} />}
        </main>
      </div>
    </div>
  );
}
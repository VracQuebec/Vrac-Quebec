// ============================================================
// MA FLOTTE — portail entrepreneur
// ------------------------------------------------------------
// Réutilise EXACTEMENT le registre de flotte du CRM (`trucks`) :
// aucune table parallèle, aucune copie locale. L'entrepreneur est
// rattaché à SA propre entreprise (`jsc_companies`) via la
// fonction serveur `fleet_ensure_my_company`. L'isolation est
// garantie par les politiques RLS existantes de `trucks`
// (`fleet_can_access` / `fleet_can_administer`).
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Pencil, Plus, Truck } from "lucide-react";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { ErrorState, LoadingSkeleton } from "@/components/entrepreneur-app/AppStates";
import { Button } from "@/components/ui/button";
import { VehicleDialog } from "@/components/fleet/FleetDialogs";
import { supabase } from "@/integrations/supabase/client";
import { setActiveCompanyId } from "@/lib/fleet/tenant";
import type { Vehicle } from "@/lib/fleet/api";
import { adminStatusLabel, categoryLabel, opsStatus, TONE_CLASS } from "@/lib/fleet/v2";
import { TRUCK_TYPE_LABELS } from "@/lib/calendar-utils";

export default function EntrepreneurFlotte() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  // Fenêtre ouverte gardée dans l'adresse (?vehicule=<id|nouveau>) : Retour et actualisation la rouvrent.
  const [sp, setSp] = useSearchParams(); const vid = sp.get("vehicule");
  const editing = vehicles.find((v) => v.id === vid) ?? null;
  const open = vid === "nouveau" || !!editing;
  const openFor = (id: string | null) => { const n = new URLSearchParams(sp); id ? n.set("vehicule", id) : n.delete("vehicule"); setSp(n); };
  const setOpen = (o: boolean) => { if (!o) openFor(null); };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDenied(false);
    try {
      const { data: cid, error: e1 } = await supabase.rpc("fleet_ensure_my_company");
      if (e1) {
        if (/approuv|Authentification/i.test(e1.message)) { setDenied(true); setVehicles([]); return; }
        throw e1;
      }
      const id = cid as string;
      setCompanyId(id);
      setActiveCompanyId(id); // les enregistrements créés sont rattachés à SON entreprise
      const { data, error: e2 } = await supabase
        .from("trucks").select("*").eq("company_id", id).order("name");
      if (e2) throw e2;
      setVehicles(data ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const add = () => openFor("nouveau");

  return (
    <EntrepreneurAppShell title="Ma flotte" subtitle="Vos véhicules" backTo={null}>
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 lg:py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="font-body text-sm text-muted-foreground">
            {loading ? "Chargement…" : denied ? "" : `${vehicles.length} véhicule${vehicles.length !== 1 ? "s" : ""}`}
          </p>
          {companyId && !denied && (
            <Button onClick={add} className="h-11 font-display font-bold">
              <Plus className="mr-2 h-4 w-4" />Ajouter un véhicule
            </Button>
          )}
        </div>

        {loading ? <LoadingSkeleton lines={3} /> : denied ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <Truck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <h2 className="font-display text-lg font-bold text-foreground">Gestion de flotte non disponible</h2>
            <p className="mt-1 font-body text-sm text-muted-foreground">« Ma flotte » est offerte aux entrepreneurs dont le compte est approuvé.</p>
          </div>
        ) : error ? <ErrorState onRetry={load} /> : vehicles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <Truck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <h2 className="font-display text-lg font-bold text-foreground">Votre flotte est prête</h2>
            <p className="mt-1 font-body text-sm text-muted-foreground">Aucun véhicule n’est encore enregistré.</p>
            <Button onClick={add} className="mt-4 h-11 font-display font-bold"><Plus className="mr-2 h-4 w-4" />Ajouter un véhicule</Button>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {vehicles.map((v) => {
              const ops = opsStatus(v);
              const rows: [string, string | null][] = [
                ["Identifiant", v.name],
                ["N° d'unité", v.unit_number],
                ["Type de camion", v.type ? TRUCK_TYPE_LABELS[v.type] ?? String(v.type) : null],
                ["Marque / modèle", [v.make, v.model].filter(Boolean).join(" ") || null],
                ["Année", v.year ? String(v.year) : null],
                ["Immatriculation", v.plate],
                ["Capacité", v.capacity],
                ["Statut", adminStatusLabel(v)],
              ];
              return (
                <li key={v.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <h3 className="font-display text-base font-bold text-foreground">{categoryLabel(v.category)}</h3>
                    <span className={`rounded-full border px-2 py-0.5 font-body text-xs ${TONE_CLASS[ops.tone]}`}>{ops.label}</span>
                  </div>
                  <dl className="space-y-1 font-body text-sm">
                    {rows.filter(([, val]) => val).map(([k, val]) => (
                      <div key={k} className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="text-right text-foreground">{val}</dd>
                      </div>
                    ))}
                  </dl>
                  <Button variant="outline" size="sm" className="mt-3 w-full"
                    onClick={() => openFor(v.id)}>
                    <Pencil className="mr-2 h-4 w-4" />Modifier
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <VehicleDialog open={open} onOpenChange={setOpen} vehicle={editing} onSaved={load} />
    </EntrepreneurAppShell>
  );
}

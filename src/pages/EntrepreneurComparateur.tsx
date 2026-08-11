// ============================================================
// Points 14, 20, 31, 42 — Comparateur de dompes pour entrepreneurs :
// distance routière réelle (Google Routes via edge function),
// temps, kilométrage total, disponibilité et fraîcheur des données.
// Aucune donnée simulée : si la distance est inconnue, on l'indique.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Loader2, MapPin, Route, Search, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import TransportBanner from "@/components/TransportBanner";
import FullPageState from "@/components/FullPageState";
import GooglePlaceAutocomplete from "@/components/GooglePlaceAutocomplete";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Lead = {
  id: string;
  submission_number: number;
  dompe_number: string | null;
  materials: string[] | null;
  postal_prefix: string | null;
  latitude: number | null;
  longitude: number | null;
  availability_status: string | null;
  availability_note: string | null;
  availability_updated_at: string | null;
  accessibility: string[] | null;
};

type Ranked = Lead & { distance_km: number | null; duration_minutes: number | null };

const AVAIL: Record<string, { label: string; cls: string }> = {
  available: { label: "🟢 Disponible", cls: "text-primary" },
  limited: { label: "🟡 Sur approbation", cls: "text-amber-600" },
  unavailable: { label: "🔴 Indisponible", cls: "text-destructive" },
};

const freshness = (iso: string | null) => {
  if (!iso) return "Disponibilité à confirmer";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Mis à jour aujourd'hui";
  if (days === 1) return "Mis à jour hier";
  if (days <= 7) return `Mis à jour il y a ${days} jours`;
  return "À confirmer";
};

const label = (l: Lead) =>
  (l.dompe_number && l.dompe_number.replace(/^dompe\s*/i, "").trim()) || String(l.submission_number);

export default function EntrepreneurComparateur() {
  const navigate = useNavigate();
  const { user, isReady } = useAuthReady();
  const { isEntrepreneur, isAdmin, loading: roleLoading } = useUserRoles(user, isReady);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [trips, setTrips] = useState("1");
  const [ranked, setRanked] = useState<Ranked[] | null>(null);
  const [computing, setComputing] = useState(false);

  useEffect(() => {
    document.title = "Comparateur de dompes | Vrac Québec";
  }, []);

  useEffect(() => {
    if (isReady && !user) navigate("/login", { replace: true });
  }, [isReady, user, navigate]);

  useEffect(() => {
    if (!isReady || roleLoading || (!isEntrepreneur && !isAdmin)) return;
    void (async () => {
      const { data, error } = await supabase.rpc("get_entrepreneur_leads");
      if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
      else setLeads((data ?? []) as unknown as Lead[]);
      setLoading(false);
    })();
  }, [isReady, roleLoading, isEntrepreneur, isAdmin]);

  const geoLeads = useMemo(() => leads.filter((l) => l.latitude && l.longitude), [leads]);
  const tripCount = Math.max(1, Math.floor(Number(trips) || 1));

  const compare = async () => {
    if (!coords) return;
    setComputing(true);
    try {
      const { data, error } = await supabase.functions.invoke("transport-distance-matrix", {
        body: {
          origin: coords,
          dumps: geoLeads.slice(0, 100).map((l) => ({ id: l.id, lat: l.latitude!, lng: l.longitude! })),
        },
      });
      if (error) throw error;
      const results = (data?.results ?? data ?? {}) as Record<
        string, { distance_km: number; duration_minutes: number } | null
      >;
      const rows: Ranked[] = geoLeads.map((l) => ({
        ...l,
        distance_km: results[l.id]?.distance_km ?? null,
        duration_minutes: results[l.id]?.duration_minutes ?? null,
      }));
      rows.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
      setRanked(rows);
    } catch (e) {
      toast({
        title: "Distance indisponible",
        description: "Le calcul routier n'a pas pu être effectué. Réessayez dans un instant.",
        variant: "destructive",
      });
    } finally {
      setComputing(false);
    }
  };

  const withDistance = (ranked ?? []).filter((r) => r.distance_km != null);
  const best = withDistance[0] ?? null;
  const worst = withDistance.length > 1 ? withDistance[withDistance.length - 1] : null;

  if (!isReady || roleLoading || loading) return <FullPageState title="Chargement des sites" />;
  if (!isEntrepreneur && !isAdmin)
    return (
      <FullPageState
        showSpinner={false}
        title="Accès réservé"
        message="Cet outil est réservé aux entrepreneurs approuvés."
      />
    );

  return (
    <div className="min-h-screen bg-background">
      <TransportBanner />
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-display text-2xl font-extrabold text-foreground sm:text-3xl">
          Comparateur de dompes
        </h1>
        <p className="mt-2 font-body text-sm text-muted-foreground">
          Entrez l'adresse de votre chantier : nous classons les sites de dépôt selon la distance
          routière réelle et le temps de déplacement.
        </p>

        <section className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="space-y-1.5">
            <Label>Adresse du chantier</Label>
            <GooglePlaceAutocomplete
              value={address}
              placeholder="123 rue Principale, Québec, QC"
              className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(v) => { setAddress(v); setCoords(null); setRanked(null); }}
              onSelect={(p) => {
                setAddress(p.formattedAddress);
                setCoords(p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null);
                setRanked(null);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cmp-trips">Nombre de voyages prévus</Label>
            <Input id="cmp-trips" inputMode="numeric" value={trips} onChange={(e) => setTrips(e.target.value)}
              className="h-12 text-base" />
          </div>
          <Button onClick={compare} disabled={!coords || computing || geoLeads.length === 0}
            className="h-12 w-full font-display text-sm font-bold uppercase tracking-wide">
            {computing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Comparer les sites
          </Button>
          {geoLeads.length === 0 && (
            <p className="font-body text-sm text-muted-foreground">
              Aucun site géolocalisé n'est disponible pour le moment.
            </p>
          )}
        </section>

        {best && worst && best.distance_km != null && worst.distance_km != null && (
          <div className="mt-6 rounded-2xl border-2 border-primary/40 bg-primary/5 p-5">
            <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-foreground">
              <TrendingDown className="h-4 w-4 text-primary" aria-hidden /> Économie potentielle
            </p>
            <p className="mt-2 font-body text-sm text-foreground">
              En choisissant le site le plus proche plutôt que le plus éloigné :{" "}
              <strong>
                {Math.round((worst.distance_km - best.distance_km) * 2 * tripCount)} km
              </strong>{" "}
              de moins au total
              {best.duration_minutes != null && worst.duration_minutes != null && (
                <> et environ <strong>{Math.round((worst.duration_minutes - best.duration_minutes) * 2 * tripCount)} minutes</strong> de route en moins</>
              )}{" "}
              pour {tripCount} voyage{tripCount > 1 ? "s" : ""} aller-retour.
            </p>
          </div>
        )}

        {ranked && (
          <section className="mt-6 space-y-3">
            {ranked.map((r, i) => {
              const av = AVAIL[r.availability_status || "available"] ?? AVAIL.available;
              return (
                <article key={r.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display text-base font-extrabold text-foreground">
                        {i === 0 && r.distance_km != null ? "⭐ " : ""}Dompe {label(r)}
                      </p>
                      <p className="mt-0.5 truncate font-body text-xs text-muted-foreground">
                        Secteur {r.postal_prefix || "—"} • {(r.materials ?? []).slice(0, 2).join(", ") || "Matériaux à confirmer"}
                      </p>
                    </div>
                    <span className={`shrink-0 font-body text-xs font-semibold ${av.cls}`}>{av.label}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 font-body text-sm text-foreground">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
                      {r.distance_km != null ? `${r.distance_km.toFixed(1)} km` : "Distance à confirmer"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
                      {r.duration_minutes != null ? `${Math.round(r.duration_minutes)} min` : "—"}
                    </span>
                    {r.distance_km != null && (
                      <span className="flex items-center gap-1.5">
                        <Route className="h-4 w-4 text-muted-foreground" aria-hidden />
                        {Math.round(r.distance_km * 2 * tripCount)} km au total
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-body text-xs text-muted-foreground">
                    {freshness(r.availability_updated_at)}
                    {r.availability_note ? ` • ${r.availability_note}` : ""}
                  </p>
                </article>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
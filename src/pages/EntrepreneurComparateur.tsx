// ============================================================
// Points 14, 20, 31, 42 — Comparateur de sites de dépôt :
// filtres matériau + camion, compatibilité réelle (accès,
// disponibilité), distance routière Google Routes, sélection
// du site et poursuite du parcours de demande.
// Aucune donnée simulée : information absente = « à confirmer ».
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight, CheckCircle2, Clock, Loader2, MapPin, Route, Search, TrendingDown, Truck,
} from "lucide-react";
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
import {
  MATERIAL_OPTIONS, TRUCK_OPTIONS, STATUS_META, evaluateSite, accessConstraints,
  siteMaterialKeys, siteTruckKeys, type MaterialKey, type TruckKey, type SiteLike,
} from "@/lib/entrepreneur/site-match";

type Lead = SiteLike & {
  id: string;
  submission_number: number;
  dompe_number: string | null;
  postal_prefix: string | null;
  latitude: number | null;
  longitude: number | null;
  opening_hours: string | null;
  remaining_capacity: string | null;
  availability_note: string | null;
};

type Ranked = Lead & { distance_km: number | null; duration_minutes: number | null };

const label = (l: Lead) =>
  (l.dompe_number && l.dompe_number.replace(/^dompe\s*/i, "").trim()) || String(l.submission_number);

const MATERIAL_TO_WIZARD: Record<MaterialKey, string> = {
  terre: "terre_propre",
  terre_vegetale: "terre_propre",
  sable: "sable",
  gravier: "gravier",
  pierre: "pierre",
  roc: "roc",
  beton: "beton",
  asphalte: "asphalte",
  remblai: "materiaux_mixtes",
  autre: "autre",
};

export default function EntrepreneurComparateur() {
  const navigate = useNavigate();
  const { user, isReady } = useAuthReady();
  const { isEntrepreneur, isAdmin, loading: roleLoading } = useUserRoles(user, isReady);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [material, setMaterial] = useState<MaterialKey | "">("");
  const [truck, setTruck] = useState<TruckKey | "">("");
  const [trips, setTrips] = useState("1");
  const [ranked, setRanked] = useState<Ranked[] | null>(null);
  const [computing, setComputing] = useState(false);
  const [showIncompatible, setShowIncompatible] = useState(false);

  useEffect(() => {
    document.title = "Comparateur de sites de dépôt | Vrac Québec";
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
    setRanked(null);
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
      const rank = { compatible: 0, unknown: 1, incompatible: 2 } as const;
      const fit = (l: Ranked) => {
        const ev = evaluateSite(l, material || null, truck || null);
        return rank[ev.status] * 10 + (ev.material === "compatible" ? 0 : ev.material === "unknown" ? 2 : 4)
          + (ev.truck === "compatible" ? 0 : ev.truck === "unknown" ? 1 : 3);
      };
      rows.sort((a, b) => {
        const fa = fit(a), fb = fit(b);
        if (fa !== fb) return fa - fb;
        return (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity);
      });
      setRanked(rows);
    } catch {
      toast({
        title: "Distance indisponible",
        description: "Le calcul routier Google n'a pas pu être effectué. Réessayez dans un instant.",
        variant: "destructive",
      });
    } finally {
      setComputing(false);
    }
  };

  const evaluated = useMemo(
    () => (ranked ?? []).map((r) => ({ row: r, ev: evaluateSite(r, material || null, truck || null) })),
    [ranked, material, truck],
  );
  const main = evaluated.filter((e) => e.ev.status !== "incompatible");
  const rejected = evaluated.filter((e) => e.ev.status === "incompatible");

  const withDistance = main.filter((e) => e.row.distance_km != null);
  const best = withDistance[0]?.row ?? null;
  const worst = withDistance.length > 1 ? withDistance[withDistance.length - 1].row : null;

  const selectSite = (r: Ranked) => {
    navigate("/demande-transport", {
      state: {
        vqPrefill: {
          dumpId: r.id,
          dumpName: r.dompe_number || `#${r.submission_number}`,
          dumpSubmissionNumber: r.submission_number,
          material: material ? MATERIAL_TO_WIZARD[material] : "",
          truckType: truck ? TRUCK_OPTIONS.find((t) => t.key === truck)?.label ?? "" : "",
          address,
          coords,
          distance_km: r.distance_km,
          duration_minutes: r.duration_minutes,
          trips: String(tripCount),
        },
      },
    });
  };

  if (!isReady || roleLoading || loading) return <FullPageState title="Chargement des sites" />;
  if (!isEntrepreneur && !isAdmin)
    return (
      <FullPageState
        showSpinner={false}
        title="Accès réservé"
        message="Cet outil est réservé aux entrepreneurs approuvés."
      />
    );

  const card = (r: Ranked, ev: ReturnType<typeof evaluateSite>, index: number) => {
    const meta = STATUS_META[ev.status];
    const mats = siteMaterialKeys(r).map((k) => MATERIAL_OPTIONS.find((m) => m.key === k)?.label ?? k);
    const trucks = siteTruckKeys(r).map((k) => TRUCK_OPTIONS.find((t) => t.key === k)?.label ?? k);
    const constraints = accessConstraints(r);
    return (
      <article key={r.id} className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-base font-extrabold text-foreground">
              {index === 0 && ev.material === "compatible" && ev.truck === "compatible" && r.distance_km != null ? "⭐ " : ""}
              Dompe {label(r)}
            </p>
            <p className="mt-0.5 font-body text-xs text-muted-foreground">
              Secteur {r.postal_prefix || "—"}
            </p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 font-body text-[11px] font-bold ${meta.cls}`}>
            {meta.dot} {meta.label}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 font-body text-sm text-foreground">
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

        <dl className="mt-3 space-y-1 font-body text-xs text-muted-foreground">
          <div><dt className="inline font-semibold text-foreground">Matériaux acceptés : </dt>
            <dd className="inline">{mats.length ? mats.join(", ") : "À confirmer"}</dd></div>
          <div><dt className="inline font-semibold text-foreground">Camions acceptés : </dt>
            <dd className="inline">{trucks.length ? trucks.join(", ") : "À confirmer"}</dd></div>
          <div><dt className="inline font-semibold text-foreground">Disponibilité : </dt>
            <dd className="inline">{ev.availability.label} • {ev.availability.freshness}</dd></div>
          {r.opening_hours && (
            <div><dt className="inline font-semibold text-foreground">Heures : </dt>
              <dd className="inline">{r.opening_hours}</dd></div>
          )}
          {r.remaining_capacity && (
            <div><dt className="inline font-semibold text-foreground">Capacité restante : </dt>
              <dd className="inline">{r.remaining_capacity}</dd></div>
          )}
          {constraints.length > 0 && (
            <div><dt className="inline font-semibold text-foreground">Restrictions : </dt>
              <dd className="inline">{constraints.join(" • ")}</dd></div>
          )}
          {r.availability_note && (
            <div><dt className="inline font-semibold text-foreground">Note : </dt>
              <dd className="inline">{r.availability_note}</dd></div>
          )}
        </dl>

        {ev.reasons.length > 0 && (
          <p className="mt-2 font-body text-xs text-amber-700">{ev.reasons.join(" • ")}</p>
        )}

        {ev.status !== "incompatible" && (
          <Button
            onClick={() => selectSite(r)}
            className="mt-4 h-12 w-full font-display text-sm font-bold uppercase tracking-wide"
          >
            <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />
            Sélectionner ce site
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </Button>
        )}
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <TransportBanner />
      <main className="container mx-auto max-w-3xl px-4 py-8">
        <h1 className="font-display text-2xl font-extrabold text-foreground sm:text-3xl">
          Comparateur de sites de dépôt
        </h1>
        <p className="mt-2 font-body text-sm text-muted-foreground">
          Indiquez votre chantier, votre matériau et votre camion : nous classons les sites
          compatibles selon la distance routière réelle (Google Routes).
        </p>

        <section className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
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
            <Label>Matériau à disposer</Label>
            <div className="flex flex-wrap gap-2">
              {MATERIAL_OPTIONS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMaterial(material === m.key ? "" : m.key)}
                  className={`min-h-11 rounded-full border px-4 py-2 font-body text-sm transition-colors ${
                    material === m.key
                      ? "border-primary bg-primary/10 font-semibold text-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Type de camion</Label>
            <div className="flex flex-wrap gap-2">
              {TRUCK_OPTIONS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTruck(truck === t.key ? "" : t.key)}
                  className={`min-h-11 rounded-full border px-4 py-2 font-body text-sm transition-colors ${
                    truck === t.key
                      ? "border-primary bg-primary/10 font-semibold text-foreground"
                      : "border-border bg-background text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  <Truck className="mr-1.5 inline h-4 w-4" aria-hidden />{t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cmp-trips">Nombre de voyages prévus</Label>
            <Input id="cmp-trips" inputMode="numeric" value={trips} onChange={(e) => setTrips(e.target.value)}
              className="h-12 text-base" />
          </div>

          <Button onClick={compare} disabled={!coords || computing || geoLeads.length === 0}
            className="h-12 w-full font-display text-sm font-bold uppercase tracking-wide">
            {computing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            {computing ? "Calcul des trajets Google…" : "Comparer les sites"}
          </Button>
          {!coords && address && (
            <p className="font-body text-xs text-muted-foreground">
              Sélectionnez une suggestion d'adresse pour obtenir la localisation exacte.
            </p>
          )}
          {geoLeads.length === 0 && (
            <p className="font-body text-sm text-muted-foreground">
              Aucun site géolocalisé n'est disponible pour le moment.
            </p>
          )}
        </section>

        {best && worst && best.distance_km != null && worst.distance_km != null && (
          <div className="mt-6 rounded-2xl border-2 border-primary/40 bg-primary/5 p-4 sm:p-5">
            <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-foreground">
              <TrendingDown className="h-4 w-4 text-primary" aria-hidden /> Économie potentielle
            </p>
            <p className="mt-2 font-body text-sm text-foreground">
              En choisissant le site le plus proche plutôt que le plus éloigné :{" "}
              <strong>{Math.round((worst.distance_km - best.distance_km) * 2 * tripCount)} km</strong> de moins au total
              {best.duration_minutes != null && worst.duration_minutes != null && (
                <> et environ <strong>{Math.round((worst.duration_minutes - best.duration_minutes) * 2 * tripCount)} minutes</strong> de route en moins</>
              )}{" "}
              pour {tripCount} voyage{tripCount > 1 ? "s" : ""} aller-retour.
            </p>
          </div>
        )}

        {ranked && (
          <section className="mt-6 space-y-3">
            <p className="font-body text-sm text-muted-foreground">
              {main.length} site{main.length > 1 ? "s" : ""} retenu{main.length > 1 ? "s" : ""}
              {rejected.length > 0 && ` • ${rejected.length} écarté${rejected.length > 1 ? "s" : ""}`}
            </p>
            {main.map((e, i) => card(e.row, e.ev, i))}

            {rejected.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowIncompatible((v) => !v)}
                  className="min-h-11 w-full rounded-xl border border-border bg-background px-4 font-body text-sm text-muted-foreground"
                >
                  {showIncompatible ? "Masquer" : "Afficher"} les {rejected.length} site
                  {rejected.length > 1 ? "s" : ""} non compatible{rejected.length > 1 ? "s" : ""}
                </button>
                {showIncompatible && rejected.map((e, i) => card(e.row, e.ev, i))}
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

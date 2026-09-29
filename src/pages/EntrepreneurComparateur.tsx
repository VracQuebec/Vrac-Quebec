// ============================================================
// Points 14, 20, 31, 42 — Comparateur de sites de dépôt :
// filtres matériau + camion, compatibilité réelle (accès,
// disponibilité), distance routière Google Routes, sélection
// du site et poursuite du parcours de demande.
// Aucune donnée simulée : information absente = « à confirmer ».
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight, CheckCircle2, Clock, Loader2, MapPin, Route, Search, TrendingDown, Truck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getEligibleEntrepreneurDumpSites, crmDompeNumber } from "@/lib/entrepreneur/dompes";
import { routingBatches } from "@/lib/entrepreneur/comparateur-candidates";
import { toast } from "@/hooks/use-toast";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import { ChantierContextBar } from "@/components/entrepreneur-app/ui";
import { loadActiveChantier } from "@/lib/entrepreneur-app/chantier-context";
import FullPageState from "@/components/FullPageState";
import GooglePlaceAutocomplete from "@/components/GooglePlaceAutocomplete";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  MATERIAL_OPTIONS, TRUCK_OPTIONS, BULK_TRUCK_OPTIONS, STATUS_META, evaluateSite, accessConstraints,
  normalizeMaterial, normalizeTruck,
  siteMaterialKeys, siteTruckKeys, type MaterialKey, type TruckKey, type SiteLike,
} from "@/lib/entrepreneur/site-match";
import {
  loadHandoff, saveHandoff, tripsFromHandoff, type ParcoursHandoff,
  saveSelection, loadSelection, clearSelection, type ComparateurSelection,
} from "@/lib/parcours/handoff";
import {
  persistSelection, fetchPersistedSelection, type PersistedSelection,
} from "@/lib/parcours/selection";
import LinkedTransportCard from "@/components/parcours/LinkedTransportCard";
import { usePublicTrucks } from "@/lib/vrac/units";
import { useCalcMaterials } from "@/lib/vrac/calculator";
import { computeBesoin } from "@/lib/parcours/besoin";
import { QUANTITY_UNIT_OPTIONS } from "@/lib/questionnaire-data";

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

// Numéro CRM réel uniquement — aucun repli (les fiches sans numéro sont écartées au chargement).
const label = (l: Lead) => crmDompeNumber(l) ?? "";

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
  const location = useLocation();
  const { user, isReady } = useAuthReady();
  const { isEntrepreneur, isAdmin, loading: roleLoading } = useUserRoles(user, isReady);

  // Chantier actif (lecture seule) : rappel du contexte pendant la comparaison.
  const [activeChantier] = useState(() => loadActiveChantier());
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [material, setMaterial] = useState<MaterialKey | "">("");
  const [truck, setTruck] = useState<TruckKey | "">("");
  const [quantityValue, setQuantityValue] = useState("");
  const [quantityUnit, setQuantityUnit] = useState<string>("voyages");
  const [ranked, setRanked] = useState<Ranked[] | null>(null);
  const [computing, setComputing] = useState(false);
  const [showIncompatible, setShowIncompatible] = useState(false);
  const [request, setRequest] = useState<ParcoursHandoff | null>(null);
  const [selection, setSelection] = useState<ComparateurSelection | null>(null);
  const [persisted, setPersisted] = useState<PersistedSelection | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Référentiel administré (aucune valeur en dur) : capacités de camions
  // et densités de matériaux servent au calcul du nombre de voyages.
  const publicTrucks = usePublicTrucks();
  const { materials: calcMaterials } = useCalcMaterials();

  useEffect(() => {
    document.title = "Comparateur de sites de dépôt | Vrac Québec";
  }, []);

  // Préremplissage depuis un parcours déjà complété (/depot-materiaux) :
  // aucune information n'est redemandée. La demande existante est reprise
  // par `location.state.vqPrefill` puis conservée (sessionStorage) afin de
  // survivre à un rechargement. Aucune nouvelle demande n'est créée ici.
  useEffect(() => {
    const fromState = (location.state as { vqPrefill?: Record<string, unknown> } | null)?.vqPrefill;
    const stored = loadHandoff();
    const pf = (fromState ?? stored ?? null) as Record<string, unknown> | null;
    if (!pf) return;
    if (fromState && fromState.submissionId !== undefined) {
      saveHandoff(fromState as unknown as ParcoursHandoff);
    }
    if (typeof pf.submissionId === "string" || pf.quantityLabel || pf.desiredDate) {
      setRequest(pf as unknown as ParcoursHandoff);
    }
    if (typeof pf.address === "string" && pf.address) setAddress(pf.address);
    const c = pf.coords as { lat?: number; lng?: number } | null | undefined;
    if (c && typeof c.lat === "number" && typeof c.lng === "number") setCoords({ lat: c.lat, lng: c.lng });
    if (typeof pf.material === "string" && pf.material) {
      const key = normalizeMaterial(pf.material);
      if (key) setMaterial(key);
    }
    if (typeof pf.materialKey === "string" && pf.materialKey) setMaterial(pf.materialKey as MaterialKey);
    if (typeof pf.truckType === "string" && pf.truckType) {
      const tk = normalizeTruck(pf.truckType);
      if (tk) setTruck(tk);
    }
    if (typeof pf.truckKey === "string" && pf.truckKey) setTruck(pf.truckKey as TruckKey);
    const tripsValue =
      typeof pf.trips === "string" && pf.trips.trim()
        ? pf.trips.trim()
        : tripsFromHandoff(pf as unknown as ParcoursHandoff);
    // Quantité reprise telle quelle (valeur + unité), sans conversion.
    if (typeof pf.quantityValue === "string" && pf.quantityValue.trim()) {
      setQuantityValue(pf.quantityValue.trim());
      if (typeof pf.quantityUnit === "string" && pf.quantityUnit) setQuantityUnit(pf.quantityUnit);
    } else if (tripsValue) {
      setQuantityValue(tripsValue);
      setQuantityUnit("voyages");
    }
  }, [location.state]);

  useEffect(() => {
    if (!activeChantier) return;
    setAddress((current) => current || activeChantier.address || activeChantier.city || "");
    setCoords((current) => current ?? activeChantier.coords);
    setMaterial((current) => current || (activeChantier.material ? normalizeMaterial(activeChantier.material) ?? "" : ""));
    const quantityMatch = activeChantier.quantity?.match(/[\d.,]+/);
    setQuantityValue((current) => current || quantityMatch?.[0]?.replace(",", ".") || "");
  }, [activeChantier]);

  // Sélection déjà effectuée : restaurée au retour arrière ou au rechargement.
  useEffect(() => {
    const s = loadSelection();
    if (s) setSelection(s);
  }, []);

  // Source de vérité après sélection : la demande existante (CRM).
  // Au rechargement, on relit la sélection réellement enregistrée.
  useEffect(() => {
    const id = request?.submissionId;
    if (!id || !isReady || roleLoading || (!isEntrepreneur && !isAdmin)) return;
    void (async () => {
      const p = await fetchPersistedSelection(id);
      if (!p) return;
      setPersisted(p);
      // Reload sans brouillon local : la demande existante fait foi.
      setSelection((cur) => cur ?? {
        submissionId: p.submissionId,
        siteId: p.siteId ?? "",
        siteLabel: p.siteLabel ?? "Site sélectionné",
        distanceKm: p.distanceKm,
        durationMinutes: p.durationMinutes,
        trips: p.trips,
        tonnes: p.tonnes,
        quantityValue: p.quantity != null ? String(p.quantity) : "",
        quantityUnit: p.unit ?? "",
        materialKey: null,
        materialLabel: p.material ?? "",
        truckKey: null,
        truckLabel: p.truck ?? "",
        capacityTonnes: null,
        address: "",
        coords: null,
        desiredDate: p.desiredDate ?? "",
        timeframe: p.timeframe ?? "",
        accessDetails: Array.isArray(p.accessDetails) ? (p.accessDetails as string[]) : [],
        createdAt: Date.now(),
      });
    })();
  }, [request?.submissionId, isReady, roleLoading, isEntrepreneur, isAdmin]);

  useEffect(() => {
    if (isReady && !user) navigate("/login", { replace: true });
  }, [isReady, user, navigate]);

  useEffect(() => {
    if (!isReady || roleLoading || (!isEntrepreneur && !isAdmin)) return;
    void (async () => {
      const { sites, error } = await getEligibleEntrepreneurDumpSites();
      if (error) toast({ title: "Erreur", description: error, variant: "destructive" });
      else setLeads((sites as unknown as Lead[]).filter((d) => crmDompeNumber(d) !== null));
      setLoading(false);
    })();
  }, [isReady, roleLoading, isEntrepreneur, isAdmin]);

  const geoLeads = useMemo(() => leads.filter((l) => l.latitude && l.longitude), [leads]);

  // Capacité du camion choisi : administrée (jsc_trucks), jamais inventée.
  const capacityTonnes = useMemo(() => {
    if (!truck) return null;
    const match = publicTrucks.filter((t) => t.truck_type === truck);
    if (!match.length) return null;
    return Math.max(...match.map((t) => t.capacity_tonnes));
  }, [truck, publicTrucks]);

  // Densité du matériau : administrée (jsc_materials), jamais inventée.
  const densityKgPerM3 = useMemo(() => {
    if (!material) return null;
    const m = calcMaterials.find((c) => normalizeMaterial(c.name) === material);
    return m?.density_kg_per_m3 ?? null;
  }, [material, calcMaterials]);

  const besoin = useMemo(
    () => computeBesoin({ quantityValue, quantityUnit, densityKgPerM3, capacityTonnes }),
    [quantityValue, quantityUnit, densityKgPerM3, capacityTonnes],
  );
  const tripCount = besoin.trips;

  const truckLabel = truck ? TRUCK_OPTIONS.find((t) => t.key === truck)?.label ?? "" : "";
  const materialLabel = material ? MATERIAL_OPTIONS.find((m) => m.key === material)?.label ?? "" : "";
  const unitLabelFr =
    QUANTITY_UNIT_OPTIONS.find((u) => u.value === quantityUnit)?.label ?? quantityUnit;

  /** Ce qui empêche encore de comparer, en langage clair. */
  const blockers = useMemo(() => {
    const out: string[] = [];
    if (!address.trim()) out.push("Indiquez l'adresse du chantier.");
    else if (!coords) out.push("Sélectionnez une suggestion d'adresse Google : les coordonnées sont nécessaires au calcul des trajets.");
    if (!material) out.push("Choisissez le matériau à disposer.");
    if (!truck) out.push("Choisissez le type de camion.");
    if (!quantityValue.trim()) out.push("Indiquez la quantité à évacuer.");
    return out;
  }, [address, coords, material, truck, quantityValue]);

  const compare = async () => {
    if (!coords || blockers.length > 0) return;
    setComputing(true);
    setRanked(null);
    try {
      // Candidates : dompes non écartées, les plus proches du chantier, par lots.
      // (Jamais « les 100 premières de la liste ».)
      const eligible = geoLeads.filter(
        (l) => evaluateSite(l as Ranked, material || null, truck || null).status !== "incompatible",
      );
      const batches = routingBatches(eligible, coords);
      const results: Record<string, { distance_km: number; duration_minutes: number } | null> = {};
      let anyOk = false;
      for (const batch of batches) {
        const { data, error } = await supabase.functions.invoke("transport-distance-matrix", {
          body: {
            origin: coords,
            dumps: batch.map((l) => ({ id: l.id, lat: l.latitude!, lng: l.longitude! })),
          },
        });
        if (error) continue; // ce lot reste « Distance à confirmer »
        anyOk = true;
        Object.assign(results, (data?.results ?? {}) as typeof results);
      }
      if (batches.length > 0 && !anyOk) throw new Error("matrix");
      const rows: Ranked[] = geoLeads.map((l) => ({
        ...l,
        distance_km: typeof results[l.id]?.distance_km === "number" ? results[l.id]!.distance_km : null,
        duration_minutes: typeof results[l.id]?.duration_minutes === "number" ? results[l.id]!.duration_minutes : null,
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
        // Sans itinéraire : Infinity → toujours après les distances routières connues.
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

  // Sélection : rattachée à la demande existante et persistée.
  // Aucune écriture en base ici → aucune nouvelle demande créée.
  const selectSite = async (r: Ranked) => {
    if (saving) return; // anti double-clic : aucune double écriture
    const sel: ComparateurSelection = {
      submissionId: request?.submissionId ?? null,
      siteId: r.id,
      siteLabel: `Dompe ${label(r)}`,
      distanceKm: r.distance_km,
      durationMinutes: r.duration_minutes,
      trips: tripCount,
      tonnes: besoin.tonnes,
      quantityValue: quantityValue.trim(),
      quantityUnit,
      materialKey: material || null,
      materialLabel,
      truckKey: truck || null,
      truckLabel,
      capacityTonnes,
      address,
      coords,
      desiredDate: request?.desiredDate ?? "",
      timeframe: request?.timeframe ?? "",
      accessDetails: request?.accessDetails ?? [],
      createdAt: Date.now(),
    };
    // Le brouillon local est toujours conservé : même en cas d'échec
    // d'écriture, l'entrepreneur ne perd pas son choix.
    saveSelection(sel);
    setSelection(sel);
    setSaveError(null);

    if (!sel.submissionId) {
      // Aucune demande existante : rien n'est écrit au CRM (pas de doublon).
      setPersisted(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setSaving(true);
    const res = await persistSelection(sel);
    setSaving(false);
    if (res.ok === true) {
      setPersisted(res.saved);
    } else {
      const msg = res.message;
      setPersisted(null);
      setSaveError(msg);
      toast({ title: "Enregistrement impossible", description: msg, variant: "destructive" });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const continueToRequest = (sel: ComparateurSelection) => {
    navigate("/demande-transport", {
      state: {
        vqPrefill: {
          submissionId: sel.submissionId,
          dumpId: sel.siteId,
          dumpName: sel.siteLabel,
          material: sel.materialKey ? MATERIAL_TO_WIZARD[sel.materialKey as MaterialKey] : "",
          truckType: sel.truckLabel,
          address: sel.address,
          coords: sel.coords,
          distance_km: sel.distanceKm,
          duration_minutes: sel.durationMinutes,
          trips: sel.trips != null ? String(sel.trips) : "",
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
          {r.distance_km != null && tripCount != null && (
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
            onClick={() => void selectSite(r)}
            disabled={saving}
            className="mt-4 h-12 w-full font-display text-sm font-bold uppercase tracking-wide"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden />}
            {saving ? "Enregistrement…" : "Sélectionner ce site"}
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
          </Button>
        )}
      </article>
    );
  };

  return (
    <EntrepreneurAppShell
      title="Meilleur choix de site"
      subtitle="Comparaison par distance réelle"
      backTo="/entrepreneur"
    >
      <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-5 sm:px-6">
        {/* Contexte : le chantier ouvert reste visible pendant la comparaison. */}
        {activeChantier && (
          <div className="mb-4">
            <ChantierContextBar
              label={activeChantier.label}
              detail={activeChantier.material ?? activeChantier.address}
              to={`/entrepreneur/chantiers/${encodeURIComponent(activeChantier.key)}`}
            />
          </div>
        )}
        <div className="border-b border-border pb-5">
          <p className="font-body text-xs uppercase text-muted-foreground">Comparer les dompes</p>
          <h2 className="mt-1 font-display text-xl font-extrabold leading-tight">
            Complétez les informations de votre chantier.
          </h2>
          <p className="mt-1.5 font-body text-sm text-muted-foreground">
            Le classement utilise la distance routière et la compatibilité des sites admissibles.
          </p>
        </div>


        {request && (
          <section className="mt-5 rounded-2xl border-2 border-primary/40 bg-primary/5 p-4">
            <p className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
              Demande déjà enregistrée
              {request.submissionId ? ` · réf. ${request.submissionId.slice(0, 8)}` : ""}
            </p>
            <p className="mt-1 font-body text-xs text-muted-foreground">
              Les informations ci-dessous proviennent de votre demande. Aucune nouvelle demande
              n'est créée ici.
            </p>
            <dl className="mt-3 grid gap-1.5 font-body text-sm text-foreground sm:grid-cols-2">
              {request.address && (
                <div><dt className="inline font-semibold">Adresse : </dt><dd className="inline">{request.address}</dd></div>
              )}
              {request.materials?.length > 0 && (
                <div><dt className="inline font-semibold">Matériaux : </dt><dd className="inline">{request.materials.join(", ")}</dd></div>
              )}
              {request.quantityLabel && (
                <div><dt className="inline font-semibold">Quantité : </dt><dd className="inline">{request.quantityLabel}</dd></div>
              )}
              {request.truckType && (
                <div><dt className="inline font-semibold">Camion : </dt><dd className="inline">{request.truckType}</dd></div>
              )}
              {request.desiredDate && (
                <div><dt className="inline font-semibold">Date souhaitée : </dt><dd className="inline">{request.desiredDate}</dd></div>
              )}
              {request.timeframe && (
                <div><dt className="inline font-semibold">Délai : </dt><dd className="inline">{request.timeframe}</dd></div>
              )}
              {request.accessHeavyTruck && (
                <div><dt className="inline font-semibold">Accès camion lourd : </dt><dd className="inline">{request.accessHeavyTruck}</dd></div>
              )}
              {request.accessDetails?.length > 0 && (
                <div className="sm:col-span-2"><dt className="inline font-semibold">Restrictions : </dt><dd className="inline">{request.accessDetails.join(" • ")}</dd></div>
              )}
            </dl>
            {!request.coords && request.address && (
              <p className="mt-2 font-body text-xs text-amber-700">
                Aucune coordonnée GPS n'a été validée pour cette adresse : sélectionnez une
                suggestion Google ci-dessous pour lancer la comparaison.
              </p>
            )}
          </section>
        )}

        {/* Rattachement inverse : demande de transport déjà créée pour cette
            demande (lecture seule, la base fait foi). */}
        <LinkedTransportCard submissionId={request?.submissionId ?? persisted?.submissionId ?? null} />

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
              {/* Sites de dépôt de matériaux : le fardier (machinerie) est hors périmètre */}
              {BULK_TRUCK_OPTIONS.map((t) => (
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
            <Label htmlFor="cmp-qty">Quantité à évacuer</Label>
            <div className="flex gap-2">
              <Input
                id="cmp-qty"
                inputMode="decimal"
                value={quantityValue}
                placeholder="Ex. 25"
                onChange={(e) => setQuantityValue(e.target.value)}
                className="h-12 flex-1 text-base"
              />
              <select
                aria-label="Unité de quantité"
                value={quantityUnit}
                onChange={(e) => setQuantityUnit(e.target.value)}
                className="h-12 rounded-md border border-input bg-background px-3 font-body text-base"
              >
                {QUANTITY_UNIT_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Calcul du besoin — réutilise le calculateur existant. */}
          <div className="rounded-md border border-border bg-background p-3">
            <p className="font-display text-xs font-bold uppercase tracking-wide text-foreground">
              Besoin en transport
            </p>
            <dl className="mt-2 space-y-1 font-body text-sm text-foreground">
              <div><dt className="inline font-semibold">Quantité : </dt>
                <dd className="inline">{quantityValue.trim() ? `${quantityValue.trim()} ${unitLabelFr}` : "À compléter"}</dd></div>
              <div><dt className="inline font-semibold">Camion : </dt>
                <dd className="inline">{truckLabel || "À sélectionner"}</dd></div>
              {capacityTonnes != null && <div><dt className="inline font-semibold">Capacité du camion : </dt><dd className="inline">{capacityTonnes} t par voyage</dd></div>}
              {besoin.tonnes != null && (
                <div><dt className="inline font-semibold">Tonnage estimé : </dt>
                  <dd className="inline">{besoin.tonnes.toFixed(1)} t</dd></div>
              )}
              {tripCount != null && <div><dt className="inline font-semibold">Voyages estimés : </dt><dd className="inline">{tripCount} voyage{tripCount > 1 ? "s" : ""}</dd></div>}
            </dl>
            {tripCount == null && besoin.missing.length > 0 && (
              <p className="mt-2 font-body text-xs text-amber-700">
                Complétez {besoin.missing.join(", ")} pour obtenir le nombre de voyages.
              </p>
            )}
          </div>

          <Button onClick={compare} disabled={!coords || computing || geoLeads.length === 0}
            className="h-12 w-full font-display text-sm font-bold uppercase tracking-wide">
            {computing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            {computing ? "Calcul des trajets Google…" : "Comparer les sites"}
          </Button>
          {blockers.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 font-body text-xs text-muted-foreground">
              {blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
          )}
          {geoLeads.length === 0 && (
            <p className="font-body text-sm text-muted-foreground">
              Aucun site géolocalisé n'est disponible pour le moment.
            </p>
          )}
        </section>

        {selection && (
          <section className="mt-6 rounded-2xl border-2 border-primary bg-primary/5 p-4 sm:p-5">
            <p className="flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-foreground">
              <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
              {persisted ? "Votre demande est enregistrée" : "Site sélectionné"}
            </p>
            {persisted ? (
              <p className="mt-1 font-body text-xs text-muted-foreground">
                Choix rattaché à la demande #{persisted.submissionNumber ?? "—"} · enregistré le{" "}
                {persisted.updatedAt ? new Date(persisted.updatedAt).toLocaleString("fr-CA") : "—"}.
              </p>
            ) : saveError ? (
              <p className="mt-1 font-body text-xs font-semibold text-destructive">
                {saveError} Votre choix est conservé localement : réessayez la sélection.
              </p>
            ) : (
              <p className="mt-1 font-body text-xs text-muted-foreground">
                Choix conservé sur cet appareil : aucune demande existante à mettre à jour.
              </p>
            )}
            <dl className="mt-3 grid gap-1.5 font-body text-sm text-foreground sm:grid-cols-2">
              <div><dt className="inline font-semibold">Référence de la demande : </dt>
                <dd className="inline">
                  {persisted?.submissionNumber != null
                    ? `#${persisted.submissionNumber}`
                    : selection.submissionId ? selection.submissionId.slice(0, 8) : "Non rattachée"}
                </dd></div>
              <div><dt className="inline font-semibold">Site : </dt>
                <dd className="inline">{persisted?.siteLabel ?? selection.siteLabel}</dd></div>
              {persisted?.siteAddress && (
                <div className="sm:col-span-2"><dt className="inline font-semibold">Adresse du site : </dt>
                  <dd className="inline">{persisted.siteAddress}</dd></div>
              )}
              <div><dt className="inline font-semibold">Matériau : </dt>
                <dd className="inline">{selection.materialLabel || "À compléter"}</dd></div>
              <div><dt className="inline font-semibold">Quantité : </dt>
                <dd className="inline">
                  {selection.quantityValue
                    ? `${selection.quantityValue} ${QUANTITY_UNIT_OPTIONS.find((u) => u.value === selection.quantityUnit)?.label ?? selection.quantityUnit}`
                    : "À compléter"}
                </dd></div>
              <div><dt className="inline font-semibold">Camion : </dt>
                <dd className="inline">{selection.truckLabel || "À compléter"}</dd></div>
              <div><dt className="inline font-semibold">Voyages : </dt>
                <dd className="inline">{(persisted?.trips ?? selection.trips) != null ? (persisted?.trips ?? selection.trips) : "Non calculable"}</dd></div>
              <div><dt className="inline font-semibold">Distance : </dt>
                <dd className="inline">{selection.distanceKm != null ? `${selection.distanceKm.toFixed(1)} km` : "À confirmer"}</dd></div>
              <div><dt className="inline font-semibold">Durée : </dt>
                <dd className="inline">{selection.durationMinutes != null ? `${Math.round(selection.durationMinutes)} min` : "À confirmer"}</dd></div>
              <div className="sm:col-span-2"><dt className="inline font-semibold">Adresse : </dt>
                <dd className="inline">{selection.address || "À compléter"}</dd></div>
              {(selection.desiredDate || selection.timeframe) && (
                <div className="sm:col-span-2"><dt className="inline font-semibold">Date / délai : </dt>
                  <dd className="inline">{[selection.desiredDate, selection.timeframe].filter(Boolean).join(" • ")}</dd></div>
              )}
              {selection.accessDetails.length > 0 && (
                <div className="sm:col-span-2"><dt className="inline font-semibold">Contraintes d'accès : </dt>
                  <dd className="inline">{selection.accessDetails.join(" • ")}</dd></div>
              )}
            </dl>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => continueToRequest(selection)}
                className="h-12 flex-1 font-display text-sm font-bold uppercase tracking-wide">
                Poursuivre la demande de transport
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Button>
              <Button variant="outline" onClick={() => { clearSelection(); setSelection(null); setSaveError(null); }}
                className="h-12 font-display text-sm font-bold uppercase tracking-wide">
                Changer de site
              </Button>
            </div>
          </section>
        )}

        {best && worst && tripCount != null && best.distance_km != null && worst.distance_km != null && (
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
      </div>
    </EntrepreneurAppShell>
  );
}

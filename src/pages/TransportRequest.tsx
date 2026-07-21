import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuthReady } from "@/hooks/useAuthReady";
import TransportBanner from "@/components/TransportBanner";
import GooglePlaceAutocomplete from "@/components/GooglePlaceAutocomplete";
import {
  Truck, MapPin, Package, Ruler, Loader2, ChevronLeft, ChevronRight,
  CheckCircle2, LocateFixed, Sparkles, Phone, Clock, Download,
  MessageCircle, ShieldCheck, Zap, Network, Target, HelpCircle,
} from "lucide-react";

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const MATERIALS = [
  { id: "terre", label: "Terre", icon: "🟫", desc: "Remblai, nivellement et aménagement." },
  { id: "sable", label: "Sable", icon: "🟨", desc: "Compaction, drainage et pose de pavé." },
  { id: "pierre_concassee", label: "Pierre concassée", icon: "⬜", desc: "Fondation, entrée et stationnement." },
  { id: "remblai", label: "Remblai", icon: "🟩", desc: "Solution économique pour remplir rapidement." },
  { id: "enrochement", label: "Enrochement", icon: "🪨", desc: "Stabilisation, soutènement et protection des berges." },
  { id: "autre", label: "Autre", icon: "❓", desc: "Vous avez un besoin spécifique ? On vous guide." },
] as const;

const STEP_LABELS = [
  { n: 1, label: "Matériau", icon: "📦" },
  { n: 2, label: "Chantier", icon: "📍" },
  { n: 3, label: "Quantité", icon: "⚖️" },
  { n: 4, label: "Recommandations", icon: "🗺️" },
  { n: 5, label: "Confirmation", icon: "🚛" },
];

// "Je ne sais pas" project assistant → material recommendation
const PROJECT_TYPES: { id: string; label: string; icon: string; material: string; trucks: string }[] = [
  { id: "fondation",   label: "Fondation",           icon: "🏗️", material: "pierre_concassee", trucks: "10 ou 12 roues" },
  { id: "entree",      label: "Entrée / stationnement", icon: "🚗", material: "pierre_concassee", trucks: "10 roues" },
  { id: "drain",       label: "Drain français",      icon: "💧", material: "pierre_concassee", trucks: "10 roues" },
  { id: "nivellement", label: "Nivellement",         icon: "📐", material: "terre",             trucks: "12 roues" },
  { id: "soutenement", label: "Mur de soutènement",  icon: "🧱", material: "enrochement",       trucks: "12 roues" },
  { id: "enrochement", label: "Enrochement / berge", icon: "🪨", material: "enrochement",       trucks: "12 roues" },
  { id: "terrassement",label: "Terrassement",        icon: "⛏️", material: "terre",             trucks: "12 roues" },
  { id: "autre",       label: "Autre projet",        icon: "❓", material: "autre",             trucks: "À déterminer" },
];

interface DumpCandidate {
  id: string;
  submission_number: number;
  dompe_number: string | null;
  materials: string[];
  latitude: number;
  longitude: number;
  availability_status: string | null;
  truck_types_allowed: string[] | null;
  opening_hours: string | null;
  remaining_capacity: string | null;
  accessibility: string[] | null;
  distance_km?: number | null;
  duration_minutes?: number | null;
  score?: number;
  reason?: string;
}

const RANKS = [
  { emoji: "🥇", label: "Recommandée", color: "#eab308" },
  { emoji: "🥈", label: "Bonne alternative", color: "#94a3b8" },
  { emoji: "🥉", label: "Autre option", color: "#b45309" },
];

const availDot = (s: string | null | undefined) =>
  s === "unavailable" ? "🔴" : s === "limited" ? "🟡" : "🟢";
const availLabel = (s: string | null | undefined) =>
  s === "unavailable" ? "Indisponible" : s === "limited" ? "Capacité limitée" : "Disponible";

const matchesMaterial = (dumpMaterials: string[], selected: string): boolean => {
  const joined = (dumpMaterials || []).join("|").toLowerCase();
  if (selected === "autre") return true;
  if (selected === "remblai") return /remblai|remplissage|d[ée]p[ôo]t/.test(joined);
  if (selected === "pierre_concassee") return /pierre|concass|gravier|roche/.test(joined);
  return joined.includes(selected);
};

const TransportRequest = () => {
  const navigate = useNavigate();
  const { user } = useAuthReady();
  const [step, setStep] = useState<Step>(1);
  const [showMaterialHelper, setShowMaterialHelper] = useState(false);

  // Step 1: material
  const [material, setMaterial] = useState<string>("");

  // Step 2: site address
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [city, setCity] = useState<string>("");
  const [locating, setLocating] = useState(false);

  // Step 3: quantity
  const [quantity, setQuantity] = useState<string>("");
  const [unit, setUnit] = useState<"tonnes" | "verges" | "inconnu">("tonnes");

  // Step 4: results
  const [loadingResults, setLoadingResults] = useState(false);
  const [dumps, setDumps] = useState<DumpCandidate[]>([]);
  const [selectedDump, setSelectedDump] = useState<DumpCandidate | null>(null);

  // Step 5: form
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [truckType, setTruckType] = useState<string>("");
  const [trips, setTrips] = useState<string>("");
  const [desiredDate, setDesiredDate] = useState<string>("");
  const [desiredTime, setDesiredTime] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmedNumber, setConfirmedNumber] = useState<string | null>(null);

  // Prefill email if logged in
  useEffect(() => {
    if (user?.email) setClientEmail(user.email);
  }, [user]);

  const useMyPosition = () => {
    if (!navigator.geolocation) {
      toast({ title: "Géolocalisation indisponible", variant: "destructive" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setCoords({ lat, lng });
        // reverse geocode via edge? Use approximation
        setAddress(`Ma position (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
        setLocating(false);
      },
      () => {
        toast({ title: "Impossible d'obtenir votre position", variant: "destructive" });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const loadDumps = async () => {
    if (!coords || !material) return;
    setLoadingResults(true);
    try {
      // Fetch all available dumps from public RPC (entrepreneur view is auth-gated).
      // Instead: query submissions directly for public wizard? public users can't SELECT submissions.
      // Use the RPC only when authenticated. For public, use a new lightweight fetch through an edge later.
      // For Phase 2 we require authenticated OR fall back to a public list function.
      // Simpler: call the RPC if user; otherwise use public materialized fallback via .rpc('get_entrepreneur_leads') — no.
      // We create a public read using existing available data by calling a small function.
      const { data, error } = await supabase.rpc("get_public_dumps");
      if (error) throw error;
      const all = (data as any[]) || [];
      // Filter by material
      const filtered = all.filter((d) =>
        matchesMaterial(d.materials || [], material)
      ) as DumpCandidate[];

      // Compute driving distance via edge function
      const withCoords = filtered.filter((d) => d.latitude && d.longitude);
      let matrix: Record<string, { distance_km: number; duration_minutes: number } | null> = {};
      try {
        const { data: mx } = await supabase.functions.invoke("transport-distance-matrix", {
          body: {
            origin: coords,
            dumps: withCoords.map((d) => ({ id: d.id, lat: d.latitude, lng: d.longitude })),
          },
        });
        matrix = (mx as any)?.results || {};
      } catch (e) {
        console.warn("Distance matrix unavailable, using Haversine fallback", e);
      }

      const ranked = withCoords
        .map((d) => {
          const mx = matrix[d.id];
          const distance_km = mx?.distance_km ?? haversine(coords, { lat: d.latitude, lng: d.longitude });
          const duration_minutes = mx?.duration_minutes ?? Math.round((distance_km / 60) * 60);

          // Scoring: lower distance = better; boost available; penalize unavailable
          let score = 100 - Math.min(80, distance_km);
          if (d.availability_status === "unavailable") score -= 200;
          else if (d.availability_status === "limited") score -= 15;
          else score += 10;
          if (d.truck_types_allowed && d.truck_types_allowed.length > 0) score += 3;
          if (d.accessibility && d.accessibility.length > 0) score += 2;

          const reasons: string[] = [];
          reasons.push(`${distance_km} km`);
          if (d.availability_status !== "unavailable") reasons.push(availLabel(d.availability_status));
          if (d.truck_types_allowed?.length) reasons.push(`Camions: ${d.truck_types_allowed.join(", ")}`);

          return { ...d, distance_km, duration_minutes, score, reason: reasons.join(" • ") };
        })
        .filter((d) => d.availability_status !== "unavailable")
        .sort((a, b) => (b.score! - a.score!))
        .slice(0, 10);

      setDumps(ranked);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
      setDumps([]);
    } finally {
      setLoadingResults(false);
    }
  };

  const submitRequest = async () => {
    if (!selectedDump || !coords) return;
    setSubmitting(true);
    const { data, error } = await supabase
      .from("transport_requests")
      .insert({
        client_name: clientName.trim(),
        client_company: clientCompany.trim() || null,
        client_phone: clientPhone.trim(),
        client_email: clientEmail.trim() || null,
        user_id: user?.id ?? null,
        site_address: address,
        site_latitude: coords.lat,
        site_longitude: coords.lng,
        site_city: city || null,
        material_type: material,
        quantity: quantity ? Number(quantity) : null,
        quantity_unit: unit,
        dump_submission_id: selectedDump.id,
        dump_name: selectedDump.dompe_number || `#${selectedDump.submission_number}`,
        distance_km: selectedDump.distance_km ?? null,
        travel_time_minutes: selectedDump.duration_minutes ?? null,
        truck_type: truckType || null,
        estimated_trips: trips ? Number(trips) : null,
        desired_date: desiredDate || null,
        desired_time: desiredTime || null,
        source: user ? "wizard_authenticated" : "wizard_public",
      })
      .select("request_number")
      .single();
    setSubmitting(false);
    if (error) {
      toast({ title: "Erreur d'envoi", description: error.message, variant: "destructive" });
      return;
    }
    setConfirmedNumber((data as any)?.request_number || "envoyée");
    setStep(6);
  };

  const canNext = useMemo(() => {
    if (step === 1) return !!material;
    if (step === 2) return !!coords && !!address.trim();
    if (step === 3) return unit === "inconnu" || (!!quantity && Number(quantity) > 0);
    if (step === 4) return !!selectedDump;
    if (step === 5) return !!clientName.trim() && !!clientPhone.trim();
    return false;
  }, [step, material, coords, address, quantity, unit, selectedDump, clientName, clientPhone]);

  const next = async () => {
    if (step === 3) {
      setStep(4);
      await loadDumps();
      return;
    }
    if (step === 5) {
      await submitRequest();
      return;
    }
    setStep((step + 1) as Step);
  };

  const back = () => step > 1 && setStep((step - 1) as Step);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TransportBanner />
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" />
            <span className="font-display font-bold text-lg">Vrac<span className="text-primary">Québec</span></span>
          </Link>
          <span className="text-xs text-muted-foreground font-body hidden sm:inline">Assistant de transport</span>
        </div>
      </header>

      {/* Progress */}
      {step < 6 && (
        <div className="container mx-auto px-4 pt-4">
          <div className="flex items-center gap-2 max-w-3xl mx-auto">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="flex-1 flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-display font-bold transition-all ${
                    step === n
                      ? "bg-primary text-primary-foreground scale-110"
                      : step > n
                        ? "bg-primary/20 text-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step > n ? <CheckCircle2 className="w-4 h-4" /> : n}
                </div>
                {n < 5 && <div className={`h-0.5 w-full mt-4 -mb-4 ${step > n ? "bg-primary/40" : "bg-muted"}`} />}
              </div>
            ))}
          </div>
        </div>
      )}

      <main className="flex-1 container mx-auto px-4 py-6 max-w-3xl w-full">
        {/* Step 1 */}
        {step === 1 && (
          <section className="animate-in fade-in duration-300">
            <h1 className="font-display font-bold text-2xl sm:text-3xl mb-2 flex items-center gap-2">
              <Package className="w-7 h-7 text-primary" /> Quel matériau cherchez-vous ?
            </h1>
            <p className="text-muted-foreground text-sm mb-5">Choisissez le matériau à transporter.</p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {MATERIALS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMaterial(m.id)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    material === m.id
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="text-3xl mb-2">{m.icon}</div>
                  <div className="font-display font-bold text-sm">{m.label}</div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowMaterialHelper((v) => !v)}
              className="mt-4 text-sm text-primary hover:underline flex items-center gap-1.5 font-body"
            >
              <Sparkles className="w-4 h-4" /> Je ne sais pas quel matériau choisir
            </button>
            {showMaterialHelper && (
              <div className="mt-3 p-4 bg-primary/5 border border-primary/20 rounded-lg text-sm space-y-2">
                <p><b>Terre</b> — nivellement, jardins, aménagement paysager.</p>
                <p><b>Sable</b> — coulis, mortier, base sous pavés.</p>
                <p><b>Pierre concassée</b> — entrées, drains, allées carrossables.</p>
                <p><b>Remblai</b> — recevoir des matériaux excavés (dompe destination).</p>
                <p><b>Enrochement</b> — protection berge, mur de soutènement.</p>
                <p className="text-xs text-muted-foreground pt-1">
                  Toujours hésitant ? Choisissez "Autre" — Transport JSC vous rappellera pour préciser.
                </p>
              </div>
            )}
          </section>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <section className="animate-in fade-in duration-300">
            <h1 className="font-display font-bold text-2xl sm:text-3xl mb-2 flex items-center gap-2">
              <MapPin className="w-7 h-7 text-primary" /> Où est votre chantier ?
            </h1>
            <p className="text-muted-foreground text-sm mb-5">
              Nous calculons automatiquement les meilleures dompes autour de vous.
            </p>

            <label className="block text-xs font-display font-bold uppercase text-muted-foreground mb-1.5">
              Adresse du chantier
            </label>
            <GooglePlaceAutocomplete
              value={address}
              onChange={setAddress}
              onSelect={(d) => {
                if (d.lat && d.lng) setCoords({ lat: d.lat, lng: d.lng });
                setCity(d.formattedAddress.split(",").slice(-3, -2)[0]?.trim() || "");
              }}
              placeholder="123 rue Principale, Québec"
              className="w-full px-3 py-3 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
            />

            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <button
                onClick={useMyPosition}
                disabled={locating}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card hover:border-primary/40 text-sm font-display font-semibold"
              >
                {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
                Utiliser ma position
              </button>
              <button
                disabled
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-border bg-muted/30 text-sm text-muted-foreground font-display font-semibold cursor-not-allowed"
                title="Bientôt disponible"
              >
                📁 Chantier enregistré (bientôt)
              </button>
            </div>

            {coords && (
              <p className="text-xs text-primary mt-3 font-body">
                ✅ Coordonnées confirmées ({coords.lat.toFixed(4)}, {coords.lng.toFixed(4)})
              </p>
            )}
          </section>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <section className="animate-in fade-in duration-300">
            <h1 className="font-display font-bold text-2xl sm:text-3xl mb-2 flex items-center gap-2">
              <Ruler className="w-7 h-7 text-primary" /> Quelle quantité ?
            </h1>
            <p className="text-muted-foreground text-sm mb-5">Estimation approximative acceptée.</p>

            <div className="grid grid-cols-3 gap-2 mb-4">
              {(["tonnes", "verges", "inconnu"] as const).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  className={`p-3 rounded-lg border-2 text-sm font-display font-bold transition-all ${
                    unit === u ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  {u === "tonnes" ? "Tonnes" : u === "verges" ? "Verges³" : "Je ne sais pas"}
                </button>
              ))}
            </div>

            {unit !== "inconnu" ? (
              <div>
                <label className="block text-xs font-display font-bold uppercase text-muted-foreground mb-1.5">
                  Quantité ({unit})
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Ex. 25"
                  className="w-full px-3 py-3 rounded-lg border border-border bg-background text-lg font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
                  autoFocus
                />
              </div>
            ) : (
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg text-sm">
                Aucun souci — Transport JSC vous aidera à estimer la quantité lors de l'appel.
              </div>
            )}
          </section>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <section className="animate-in fade-in duration-300">
            <h1 className="font-display font-bold text-2xl sm:text-3xl mb-2">
              🎯 Meilleures dompes pour vous
            </h1>
            <p className="text-muted-foreground text-sm mb-5">
              Classées selon distance, disponibilité et compatibilité.
            </p>

            {loadingResults ? (
              <div className="py-16 flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Analyse en cours…</p>
              </div>
            ) : dumps.length === 0 ? (
              <div className="p-6 bg-card border border-border rounded-lg text-center">
                <p className="text-sm text-muted-foreground mb-2">Aucune dompe compatible pour l'instant.</p>
                <p className="text-xs text-muted-foreground">Essayez un autre matériau ou contactez Transport JSC directement.</p>
                <a href="tel:5819947717" className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm">
                  <Phone className="w-4 h-4" /> 581-994-7717
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                {dumps.map((d, i) => {
                  const rank = RANKS[Math.min(i, 2)];
                  const isSelected = selectedDump?.id === d.id;
                  return (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDump(d)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                        isSelected ? "border-primary bg-primary/5 shadow-md" : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{rank.emoji}</span>
                          <div>
                            <div className="font-display font-bold text-base">
                              Dompe #{d.dompe_number?.replace(/^dompe\s*/i, "").trim() || d.submission_number}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-body uppercase tracking-wide">{rank.label}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-display font-bold text-lg text-primary">{d.distance_km} km</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                            <Clock className="w-3 h-3" /> {d.duration_minutes} min
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        <span className="px-2 py-0.5 rounded-full bg-background border border-border font-body">
                          {availDot(d.availability_status)} {availLabel(d.availability_status)}
                        </span>
                        {d.truck_types_allowed?.map((t) => (
                          <span key={t} className="px-2 py-0.5 rounded-full bg-background border border-border font-body">🚛 {t}</span>
                        ))}
                        {d.opening_hours && (
                          <span className="px-2 py-0.5 rounded-full bg-background border border-border font-body">🕐 {d.opening_hours}</span>
                        )}
                      </div>
                      {d.accessibility && d.accessibility.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-2">Accès : {d.accessibility.join(", ")}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Step 5 */}
        {step === 5 && selectedDump && coords && (
          <section className="animate-in fade-in duration-300">
            <h1 className="font-display font-bold text-2xl sm:text-3xl mb-2">📞 Vos coordonnées</h1>
            <p className="text-muted-foreground text-sm mb-5">
              Presque terminé — Transport JSC vous rappellera pour confirmer.
            </p>

            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4 text-sm">
              <p className="font-display font-bold mb-1">Récapitulatif</p>
              <ul className="space-y-0.5 text-xs">
                <li>📍 <b>Chantier :</b> {address}</li>
                <li>📦 <b>Matériau :</b> {MATERIALS.find((m) => m.id === material)?.label}</li>
                <li>📏 <b>Quantité :</b> {unit === "inconnu" ? "À déterminer" : `${quantity} ${unit}`}</li>
                <li>🎯 <b>Dompe :</b> #{selectedDump.dompe_number?.replace(/^dompe\s*/i, "").trim() || selectedDump.submission_number} — {selectedDump.distance_km} km ({selectedDump.duration_minutes} min)</li>
              </ul>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nom complet *" value={clientName} onChange={setClientName} placeholder="Jean Tremblay" />
              <Field label="Entreprise" value={clientCompany} onChange={setClientCompany} placeholder="Construction ABC inc." />
              <Field label="Téléphone *" value={clientPhone} onChange={setClientPhone} placeholder="418-555-0000" type="tel" />
              <Field label="Courriel" value={clientEmail} onChange={setClientEmail} placeholder="vous@exemple.com" type="email" />
              <Field label="Type de camion" value={truckType} onChange={setTruckType} placeholder="Ex. 12 roues" />
              <Field label="Voyages estimés" value={trips} onChange={setTrips} placeholder="Ex. 3" type="number" />
              <Field label="Date souhaitée" value={desiredDate} onChange={setDesiredDate} type="date" />
              <Field label="Heure souhaitée" value={desiredTime} onChange={setDesiredTime} type="time" />
            </div>
          </section>
        )}

        {/* Step 6: confirmation */}
        {step === 6 && (
          <section className="animate-in fade-in duration-300 text-center py-8">
            <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-12 h-12 text-primary" />
            </div>
            <h1 className="font-display font-bold text-2xl sm:text-3xl mb-2">Demande envoyée !</h1>
            <p className="text-muted-foreground text-sm mb-1">Votre numéro de demande :</p>
            <p className="font-display font-bold text-2xl text-primary mb-6">{confirmedNumber}</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
              Transport JSC va vous rappeler sous peu pour confirmer les détails et planifier le transport.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <a href="tel:5819947717" className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold">
                <Phone className="w-4 h-4" /> 581-994-7717
              </a>
              <button
                onClick={() => navigate("/")}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-border font-display font-bold"
              >
                Retour à l'accueil
              </button>
            </div>
          </section>
        )}

        {/* Navigation */}
        {step < 6 && (
          <div className="flex justify-between mt-8 pt-4 border-t border-border">
            <button
              onClick={back}
              disabled={step === 1}
              className="px-4 py-2.5 rounded-lg border border-border font-display font-semibold text-sm disabled:opacity-40 flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" /> Retour
            </button>
            <button
              onClick={next}
              disabled={!canNext || submitting}
              className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm disabled:opacity-40 flex items-center gap-1.5"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {step === 5 ? "Envoyer ma demande" : "Continuer"}
              {step !== 5 && !submitting && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

const Field = ({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) => (
  <label className="block">
    <span className="block text-xs font-display font-bold uppercase text-muted-foreground mb-1.5">{label}</span>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
    />
  </label>
);

const haversine = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
};

export default TransportRequest;
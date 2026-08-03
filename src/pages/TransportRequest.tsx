import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useEntrepreneurProfile } from "@/hooks/useEntrepreneurProfile";
import TransportBanner from "@/components/TransportBanner";
import GooglePlaceAutocomplete from "@/components/GooglePlaceAutocomplete";
import {
  submitTransportRequest,
  newIdempotencyKey,
  bootSubmitQueue,
} from "@/lib/transport/submitQueue";
import {
  Truck, MapPin, Package, Ruler, Loader2, ChevronLeft, ChevronRight,
  CheckCircle2, LocateFixed, Sparkles, Phone, Clock, Download,
  MessageCircle, ShieldCheck, Zap, Network, Target, HelpCircle,
  Home, X,
} from "lucide-react";

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const STORAGE_KEY = "vq_transport_wizard_v1";

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
  { n: 5, label: "Confirmation", icon: "✅" },
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
  const { profile, saveProfile } = useEntrepreneurProfile();
  const [savingProfile, setSavingProfile] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [showMaterialHelper, setShowMaterialHelper] = useState(false);
  const [helperStep, setHelperStep] = useState(0);
  const [helperProject, setHelperProject] = useState<string>("");
  const [helperArea, setHelperArea] = useState<string>("");
  const [helperDepth, setHelperDepth] = useState<string>("");
  const [helperGoal, setHelperGoal] = useState<string>("");
  const [suggestedTruck, setSuggestedTruck] = useState<string>("");

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
  const [clientNotes, setClientNotes] = useState<string>("");
  const [billingAddress, setBillingAddress] = useState("");
  const [taxTps, setTaxTps] = useState("");
  const [taxTvq, setTaxTvq] = useState("");
  const [contactName, setContactName] = useState("");
  const [editIdentity, setEditIdentity] = useState<boolean>(false);
  const [profileLoaded, setProfileLoaded] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedNumber, setConfirmedNumber] = useState<string | null>(null);
  // "queued" = accepted locally, still finishing its send in the background.
  // "confirmed" = server acknowledged with a request_number.
  const [confirmationMode, setConfirmationMode] = useState<"confirmed" | "queued">("confirmed");
  const idempotencyRef = useRef<string>("");

  // Navigation helpers: exit confirmation + resume-previous-session
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const hydratedRef = useRef(false);

  const hasProgress = () =>
    step > 1 || !!material || !!address || !!quantity || !!clientName || !!clientPhone;

  // Hydrate from localStorage on mount → offer to resume
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { hydratedRef.current = true; return; }
      const saved = JSON.parse(raw);
      if (saved && (saved.step > 1 || saved.material)) {
        setShowResumePrompt(true);
      } else {
        localStorage.removeItem(STORAGE_KEY);
        hydratedRef.current = true;
      }
    } catch {
      hydratedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resumeSaved = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.step) setStep(s.step);
      if (s.material) setMaterial(s.material);
      if (s.address) setAddress(s.address);
      if (s.coords) setCoords(s.coords);
      if (s.city) setCity(s.city);
      if (s.quantity) setQuantity(s.quantity);
      if (s.unit) setUnit(s.unit);
      if (s.clientName) setClientName(s.clientName);
      if (s.clientCompany) setClientCompany(s.clientCompany);
      if (s.clientPhone) setClientPhone(s.clientPhone);
      if (s.clientEmail) setClientEmail(s.clientEmail);
      if (s.truckType) setTruckType(s.truckType);
      if (s.trips) setTrips(s.trips);
      if (s.desiredDate) setDesiredDate(s.desiredDate);
      if (s.desiredTime) setDesiredTime(s.desiredTime);
      if (s.clientNotes) setClientNotes(s.clientNotes);
      if (s.billingAddress) setBillingAddress(s.billingAddress);
      if (s.taxTps) setTaxTps(s.taxTps);
      if (s.taxTvq) setTaxTvq(s.taxTvq);
      if (s.contactName) setContactName(s.contactName);
    } catch { /* ignore */ }
    setShowResumePrompt(false);
    hydratedRef.current = true;
  };

  const clearSavedAndStartNew = () => {
    localStorage.removeItem(STORAGE_KEY);
    setShowResumePrompt(false);
    hydratedRef.current = true;
  };

  // Autosave progress on any relevant change (skip after final confirmation)
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (step === 6) return;
    try {
      const payload = {
        step, material, address, coords, city, quantity, unit,
        clientName, clientCompany, clientPhone, clientEmail,
        truckType, trips, desiredDate, desiredTime, clientNotes,
        billingAddress, taxTps, taxTvq, contactName,
        savedAt: Date.now(),
      };
      if (
        step > 1 || material || address || quantity ||
        clientName || clientPhone
      ) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }
    } catch { /* ignore */ }
  }, [step, material, address, coords, city, quantity, unit, clientName, clientCompany, clientPhone, clientEmail, truckType, trips, desiredDate, desiredTime, clientNotes, billingAddress, taxTps, taxTvq, contactName]);

  // Clear saved draft after successful submission
  useEffect(() => {
    if (step === 6) {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
  }, [step]);

  const requestExit = () => {
    if (hasProgress() && step < 6) {
      setShowExitConfirm(true);
    } else {
      navigate("/");
    }
  };

  const confirmExit = () => {
    setShowExitConfirm(false);
    navigate("/");
  };

  // Prefill email if logged in
  useEffect(() => {
    if (user?.email) setClientEmail(user.email);
  }, [user]);

  // Prefill the full identity from the entrepreneur profile when the user is
  // signed in. The entrepreneur should never have to retype what we already
  // know about them — this is the whole point of the connected experience.
  useEffect(() => {
    if (!profile) { setProfileLoaded(false); return; }
    if (profile.name) setClientName((p) => p || profile.name);
    if (profile.company) setClientCompany((p) => p || profile.company);
    if (profile.phone) setClientPhone((p) => p || profile.phone);
    if (profile.email) setClientEmail((p) => p || profile.email);
    if (profile.billing_address || profile.address)
      setBillingAddress((p) => p || profile.billing_address || profile.address);
    if (profile.tax_tps) setTaxTps((p) => p || profile.tax_tps);
    if (profile.tax_tvq) setTaxTvq((p) => p || profile.tax_tvq);
    if (profile.contact_name || profile.name)
      setContactName((p) => p || profile.contact_name || profile.name);
    setProfileLoaded(true);
  }, [profile]);

  // Save the (possibly edited) identity back to the CRM profile — only on an
  // explicit user action.
  const updateProfile = async () => {
    setSavingProfile(true);
    try {
      await saveProfile({
        name: clientName.trim(),
        company: clientCompany.trim(),
        phone: clientPhone.trim(),
        email: clientEmail.trim(),
        billing_address: billingAddress.trim(),
        tax_tps: taxTps.trim(),
        tax_tvq: taxTvq.trim(),
        contact_name: contactName.trim(),
      });
      toast({ title: "Profil mis à jour", description: "Vos informations ont été enregistrées." });
    } catch (e) {
      toast({
        title: "Mise à jour impossible",
        description: e instanceof Error ? e.message : "Réessayez plus tard.",
        variant: "destructive",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  // Boot the persistent submit queue once. Any pending submissions saved in
  // a previous session (page reload, crash, connection loss) are retried
  // automatically as soon as the app mounts.
  useEffect(() => {
    bootSubmitQueue();
  }, []);

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

    // Stable idempotency key per submission. If the user double-clicks or the
    // network hiccups mid-send, retries reuse the same key so we never create
    // a duplicate row.
    if (!idempotencyRef.current) idempotencyRef.current = newIdempotencyKey();

    const result = await submitTransportRequest({
      idempotency_key: idempotencyRef.current,
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
      client_notes: clientNotes.trim() || null,
      source: user ? "wizard_authenticated" : "wizard_public",
    });

    setSubmitting(false);
    setConfirmationMode(result.status);
    setConfirmedNumber(result.request_number ?? null);
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
        <div className="container mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2">
          <button
            onClick={requestExit}
            className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
            aria-label="Retour à l'accueil"
          >
            <Truck className="w-6 h-6 text-primary flex-shrink-0" />
            <span className="font-display font-bold text-base sm:text-lg truncate">
              Vrac<span className="text-primary">Québec</span>
            </span>
          </button>

          <nav className="flex items-center gap-1 sm:gap-2">
            {step > 1 && step < 6 && (
              <button
                onClick={back}
                className="flex items-center gap-1 px-2.5 sm:px-3 py-2 rounded-lg border border-border bg-card hover:border-primary/40 text-xs sm:text-sm font-display font-semibold"
                aria-label="Étape précédente"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Retour</span>
              </button>
            )}
            <button
              onClick={requestExit}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-2 rounded-lg border border-border bg-card hover:border-primary/40 text-xs sm:text-sm font-display font-semibold"
              aria-label="Accueil"
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">Accueil</span>
            </button>
            {step < 6 && (
              <button
                onClick={requestExit}
                className="flex items-center gap-1 px-2.5 sm:px-3 py-2 rounded-lg text-destructive hover:bg-destructive/10 text-xs sm:text-sm font-display font-semibold"
                aria-label="Quitter l'assistant"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Quitter</span>
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Exit confirmation */}
      {showExitConfirm && (
        <div
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in"
          onClick={() => setShowExitConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-card rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-xl border border-border"
          >
            <h2 className="font-display font-bold text-lg sm:text-xl mb-2">Voulez-vous quitter l'assistant ?</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Votre progression sera sauvegardée automatiquement. Vous pourrez reprendre lors de votre prochaine visite.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                onClick={confirmExit}
                className="px-4 py-2.5 rounded-lg border border-border font-display font-semibold text-sm hover:bg-muted"
              >
                Quitter et revenir à l'accueil
              </button>
              <button
                onClick={() => setShowExitConfirm(false)}
                className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm"
              >
                Continuer le questionnaire
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resume previous session */}
      {showResumePrompt && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-in fade-in">
          <div className="bg-card rounded-2xl w-full max-w-md p-5 sm:p-6 shadow-xl border border-border">
            <h2 className="font-display font-bold text-lg sm:text-xl mb-2">Reprendre votre demande précédente ?</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Une demande en cours a été sauvegardée sur cet appareil.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                onClick={clearSavedAndStartNew}
                className="px-4 py-2.5 rounded-lg border border-border font-display font-semibold text-sm hover:bg-muted"
              >
                Commencer une nouvelle demande
              </button>
              <button
                onClick={resumeSaved}
                className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm"
              >
                Reprendre
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress */}
      {step < 6 && (
        <div className="container mx-auto px-4 pt-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-1 sm:gap-2">
              {STEP_LABELS.map((s, idx) => {
                const active = step === s.n;
                const done = step > s.n;
                return (
                  <div key={s.n} className="flex-1 flex items-center">
                    <div className="flex flex-col items-center flex-shrink-0 w-full">
                      <div
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-base font-display font-bold transition-all ${
                          active
                            ? "bg-primary text-primary-foreground scale-110 shadow-md"
                            : done
                              ? "bg-primary/20 text-primary"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {done ? <CheckCircle2 className="w-4 h-4" /> : <span>{s.icon}</span>}
                      </div>
                      <span className={`mt-1 text-[10px] sm:text-xs font-display font-semibold text-center leading-tight ${active ? "text-foreground" : "text-muted-foreground"}`}>
                        {s.label}
                      </span>
                    </div>
                    {idx < STEP_LABELS.length - 1 && (
                      <div className={`h-0.5 flex-1 mb-5 ${done ? "bg-primary/40" : "bg-muted"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 container mx-auto px-4 py-6 max-w-3xl w-full">
        {/* Bloc « Mes informations » — visible dès qu'un entrepreneur est connecté */}
        {user && profileLoaded && step < 6 && (
          <div className="mb-5 rounded-xl border border-primary/25 bg-primary/5 p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-[10px] font-display font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
                  Mes informations
                </p>
                <p className="text-sm font-body">✔ Connecté comme : <b>{clientCompany || clientName || "Mon entreprise"}</b></p>
                {(contactName || clientName) && <p className="text-sm font-body">✔ Contact : {contactName || clientName}</p>}
                {clientPhone && <p className="text-sm font-body">✔ Téléphone : {clientPhone}</p>}
                {clientEmail && <p className="text-sm font-body truncate">✔ Courriel : {clientEmail}</p>}
              </div>
              <Link
                to="/entrepreneur/compte"
                className="text-xs font-display font-bold px-3 py-2 rounded-lg border border-primary/40 text-primary hover:bg-primary/10"
              >
                Modifier mon profil
              </Link>
            </div>
          </div>
        )}

        {/* Step 1 */}
        {step === 1 && (
          <section className="animate-in fade-in duration-300">
            {/* Reassuring hero */}
            <div className="text-center mb-6">
              <h1 className="font-display font-bold text-2xl sm:text-4xl leading-tight mb-2">
                Trouvez le meilleur matériau et le meilleur point de dépôt en quelques clics.
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto">
                Nous analysons votre chantier afin de vous recommander les meilleures options disponibles près de chez vous.
              </p>
              <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-display font-bold">
                <Clock className="w-3.5 h-3.5" /> Temps estimé : moins de 60 secondes
              </div>
            </div>

            <h2 className="font-display font-bold text-lg sm:text-xl mb-3 flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" /> Quel matériau cherchez-vous ?
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {MATERIALS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMaterial(m.id)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    material === m.id
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border bg-card hover:border-primary/40 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-3xl flex-shrink-0">{m.icon}</div>
                    <div className="min-w-0">
                      <div className="font-display font-bold text-base">{m.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{m.desc}</div>
                    </div>
                    {material === m.id && (
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 ml-auto" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => { setShowMaterialHelper((v) => !v); setHelperStep(0); }}
              className="mt-4 w-full sm:w-auto text-sm text-primary hover:underline flex items-center gap-1.5 font-display font-semibold"
            >
              <Sparkles className="w-4 h-4" /> Je ne sais pas — aidez-moi à choisir
            </button>

            {showMaterialHelper && (
              <div className="mt-4 p-4 sm:p-5 bg-primary/5 border border-primary/20 rounded-xl">
                {helperStep === 0 && (
                  <>
                    <p className="font-display font-bold mb-3 flex items-center gap-2"><HelpCircle className="w-4 h-4 text-primary" /> Quel est votre projet ?</p>
                    <div className="grid grid-cols-2 gap-2">
                      {PROJECT_TYPES.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => { setHelperProject(p.id); setHelperStep(1); }}
                          className="p-3 rounded-lg border border-border bg-card hover:border-primary text-left text-sm font-display font-semibold flex items-center gap-2"
                        >
                          <span className="text-lg">{p.icon}</span> {p.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {helperStep === 1 && (
                  <>
                    <p className="font-display font-bold mb-3">Quelle superficie approximative ?</p>
                    <input
                      value={helperArea}
                      onChange={(e) => setHelperArea(e.target.value)}
                      placeholder="Ex. 50 m² ou 500 pi²"
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm mb-3"
                    />
                    <p className="font-display font-bold mb-2">Quelle profondeur ?</p>
                    <input
                      value={helperDepth}
                      onChange={(e) => setHelperDepth(e.target.value)}
                      placeholder="Ex. 6 pouces"
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm mb-3"
                    />
                    <p className="font-display font-bold mb-2">Objectif principal ?</p>
                    <input
                      value={helperGoal}
                      onChange={(e) => setHelperGoal(e.target.value)}
                      placeholder="Ex. drainage, base solide, aménagement"
                      className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm mb-4"
                    />
                    <button
                      onClick={() => {
                        const proj = PROJECT_TYPES.find((p) => p.id === helperProject);
                        if (proj) {
                          setMaterial(proj.material);
                          setSuggestedTruck(proj.trucks);
                        }
                        setHelperStep(2);
                      }}
                      className="w-full px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm"
                    >
                      Voir la recommandation →
                    </button>
                  </>
                )}
                {helperStep === 2 && (() => {
                  const proj = PROJECT_TYPES.find((p) => p.id === helperProject);
                  const mat = MATERIALS.find((m) => m.id === (proj?.material || ""));
                  return (
                    <div>
                      <p className="font-display font-bold text-base mb-2 flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> Notre recommandation</p>
                      <div className="bg-card rounded-lg border border-primary/30 p-3 space-y-1.5 text-sm">
                        <p>📦 <b>Matériau :</b> {mat?.label} {mat?.icon}</p>
                        {helperArea && helperDepth && <p>📏 <b>Chantier :</b> {helperArea} × {helperDepth}</p>}
                        {proj && <p>🚛 <b>Type de camion suggéré :</b> {proj.trucks}</p>}
                        <p className="text-xs text-muted-foreground pt-1">Vous ajusterez la quantité à l'étape suivante.</p>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => { setShowMaterialHelper(false); setHelperStep(0); }}
                          className="flex-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm"
                        >
                          Utiliser cette recommandation
                        </button>
                        <button
                          onClick={() => setHelperStep(0)}
                          className="px-3 py-2 rounded-lg border border-border font-display font-semibold text-sm"
                        >
                          Recommencer
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Trust section */}
            <div className="mt-8 p-4 sm:p-5 rounded-xl bg-muted/40 border border-border">
              <p className="font-display font-bold text-sm mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" /> Pourquoi utiliser Vrac Québec ?
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-2"><Target className="w-3.5 h-3.5 text-primary" /> Recommandations intelligentes</li>
                <li className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-primary" /> Recherche des meilleures dompes</li>
                <li className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-primary" /> Gain de temps</li>
                <li className="flex items-center gap-2"><Truck className="w-3.5 h-3.5 text-primary" /> Demande de transport simplifiée</li>
                <li className="flex items-center gap-2 sm:col-span-2"><Network className="w-3.5 h-3.5 text-primary" /> Réseau de partenaires au Québec</li>
              </ul>
            </div>
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
            <h1 className="font-display font-bold text-2xl sm:text-3xl mb-2">
              ✅ Confirmation de votre demande d'accès
            </h1>
            <p className="text-muted-foreground text-sm mb-5">
              L'assistant a déjà fait le travail — il ne vous reste qu'à confirmer votre demande d'accès à la dompe recommandée.
            </p>

            {/* Full summary card */}
            <div className="bg-card rounded-2xl border-2 border-primary/30 p-4 sm:p-5 mb-5 shadow-md">
              <p className="font-display font-bold text-base mb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" /> Votre chantier
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-sm">
                <SummaryRow icon="📍" label="Adresse" value={address} />
                <SummaryRow icon="📦" label="Matériau recommandé" value={MATERIALS.find((m) => m.id === material)?.label || material} />
                <SummaryRow icon="📏" label="Quantité estimée" value={unit === "inconnu" ? "À déterminer" : `${quantity} ${unit}`} />
                <SummaryRow icon="🚛" label="Voyages estimés" value={trips || "À confirmer"} />
                <SummaryRow icon="⏱️" label="Temps de trajet" value={`${selectedDump.duration_minutes} min`} />
                <SummaryRow icon="🎯" label="Dompe recommandée" value={`#${selectedDump.dompe_number?.replace(/^dompe\s*/i, "").trim() || selectedDump.submission_number} • ${selectedDump.distance_km} km`} />
              </div>
              {dumps.length > 1 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs font-display font-bold uppercase text-muted-foreground mb-1.5">Alternatives</p>
                  <div className="space-y-1 text-xs">
                    {dumps.filter((d) => d.id !== selectedDump.id).slice(0, 2).map((d, i) => (
                      <p key={d.id}>
                        {i === 0 ? "🥈" : "🥉"} Dompe #{d.dompe_number?.replace(/^dompe\s*/i, "").trim() || d.submission_number} — {d.distance_km} km ({d.duration_minutes} min)
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Identity — prefilled from the entrepreneur profile when signed in */}
            {user && profileLoaded && !editIdentity ? (
              <div className="bg-muted/40 rounded-xl border border-border p-4 mb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-display font-bold uppercase text-muted-foreground tracking-wide mb-1">
                      Demande faite au nom de
                    </p>
                    <p className="font-display font-bold text-base truncate">
                      {clientName}{clientCompany ? ` — ${clientCompany}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {clientPhone}{clientEmail ? ` · ${clientEmail}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => setEditIdentity(true)}
                    className="text-xs font-display font-semibold text-primary hover:underline flex-shrink-0"
                  >
                    Modifier
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <Field label="Nom complet *" value={clientName} onChange={setClientName} placeholder="Jean Tremblay" />
                <Field label="Entreprise" value={clientCompany} onChange={setClientCompany} placeholder="Construction ABC inc." />
                <Field label="Téléphone *" value={clientPhone} onChange={setClientPhone} placeholder="418-555-0000" type="tel" />
                <Field label="Courriel" value={clientEmail} onChange={setClientEmail} placeholder="vous@exemple.com" type="email" />
              </div>
            )}

            {/* Chantier-specific fields only */}
            <p className="text-[10px] font-display font-bold uppercase text-muted-foreground tracking-wide mb-2">
              Informations sur ce chantier
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Type de camion" value={truckType} onChange={setTruckType} placeholder={suggestedTruck || "Ex. 12 roues"} />
              <Field label="Date souhaitée" value={desiredDate} onChange={setDesiredDate} type="date" />
              <Field label="Heure souhaitée" value={desiredTime} onChange={setDesiredTime} type="time" />
              <Field label="Voyages estimés (facultatif)" value={trips} onChange={setTrips} placeholder="Ex. 3" type="number" />
            </div>

            <label className="block mt-3">
              <span className="block text-xs font-display font-bold uppercase text-muted-foreground mb-1.5">
                Commentaires particuliers (facultatif)
              </span>
              <textarea
                value={clientNotes}
                onChange={(e) => setClientNotes(e.target.value)}
                rows={3}
                placeholder="Contraintes d'accès, précisions sur le chantier, etc."
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
            </label>

            <div className="mt-5 p-3.5 rounded-xl bg-primary/5 border border-primary/20 text-sm text-foreground/90 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
              <p>
                Votre demande sera transmise à <b>Transport JSC</b> qui validera la disponibilité de la dompe et communiquera avec vous rapidement.
              </p>
            </div>
          </section>
        )}

        {/* Step 6: confirmation */}
        {step === 6 && (
          <ConfirmationView
            requestNumber={confirmedNumber}
            pending={confirmationMode === "queued"}
            clientName={clientName}
            clientPhone={clientPhone}
            clientEmail={clientEmail}
            address={address}
            material={MATERIALS.find((m) => m.id === material)?.label || material}
            quantity={unit === "inconnu" ? "À déterminer" : `${quantity} ${unit}`}
            trips={trips}
            truckType={truckType || suggestedTruck}
            desiredDate={desiredDate}
            desiredTime={desiredTime}
            dump={selectedDump ? `#${selectedDump.dompe_number?.replace(/^dompe\s*/i, "").trim() || selectedDump.submission_number} — ${selectedDump.distance_km} km (${selectedDump.duration_minutes} min)` : ""}
            onHome={() => navigate("/")}
          />
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
              {step === 5 ? "Envoyer ma demande d'accès" : "Continuer"}
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

const SummaryRow = ({ icon, label, value }: { icon: string; label: string; value: string }) => (
  <div className="flex items-start gap-2">
    <span className="text-base leading-none pt-0.5">{icon}</span>
    <div className="min-w-0 flex-1">
      <div className="text-[10px] font-display font-bold uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="text-sm font-display font-semibold text-foreground truncate">{value || "—"}</div>
    </div>
  </div>
);

const ConfirmationView = ({
  requestNumber, pending, clientName, clientPhone, clientEmail,
  address, material, quantity, trips, truckType, desiredDate, desiredTime, dump, onHome,
}: {
  requestNumber: string | null;
  pending?: boolean;
  clientName: string; clientPhone: string; clientEmail: string;
  address: string; material: string; quantity: string; trips: string;
  truckType: string; desiredDate: string; desiredTime: string; dump: string;
  onHome: () => void;
}) => {
  const downloadSummary = () => {
    const lines = [
      "VRAC QUÉBEC — RÉSUMÉ DE LA DEMANDE D'ACCÈS À LA DOMPE",
      "================================================",
      `Numéro de demande : ${requestNumber || "—"}`,
      `Date : ${new Date().toLocaleString("fr-CA")}`,
      "",
      "CLIENT",
      `Nom       : ${clientName}`,
      `Téléphone : ${clientPhone}`,
      `Courriel  : ${clientEmail || "—"}`,
      "",
      "CHANTIER",
      `Adresse   : ${address}`,
      "",
      "TRANSPORT",
      `Matériau       : ${material}`,
      `Quantité       : ${quantity}`,
      `Voyages estimés: ${trips || "à confirmer"}`,
      `Type de camion : ${truckType || "à confirmer"}`,
      `Date souhaitée : ${desiredDate || "—"} ${desiredTime || ""}`.trim(),
      `Dompe          : ${dump || "—"}`,
      "",
      "SUIVI",
      "Transport JSC — 581-994-7717 / 819-592-3495",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `demande-${requestNumber || "vrac-quebec"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const hour = new Date().getHours();
  const isOpen = hour >= 7 && hour < 19;

  return (
    <section className="animate-in fade-in duration-300 py-4">
      <div className="text-center">
        <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
          {pending ? (
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
          ) : (
            <CheckCircle2 className="w-12 h-12 text-primary" />
          )}
        </div>
        <h1 className="font-display font-bold text-2xl sm:text-3xl mb-2">
          {pending ? "✅ Votre demande d'accès est enregistrée" : "🎉 Votre demande d'accès est bien reçue !"}
        </h1>
        <p className="text-muted-foreground text-sm mb-6">
          {pending
            ? "Nous terminons son envoi automatiquement. Vous pouvez fermer cette page en toute tranquillité."
            : `Merci ${clientName ? clientName.split(" ")[0] : ""} — Transport JSC valide la disponibilité de la dompe et vous recontacte rapidement.`}
        </p>
      </div>

      <div className="bg-card rounded-2xl border-2 border-primary/30 p-4 sm:p-5 shadow-md space-y-3 mb-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">✅</div>
          <div>
            <div className="text-[10px] font-display font-bold uppercase text-muted-foreground">
              {pending ? "État" : "Numéro de demande"}
            </div>
            <div className="font-display font-bold text-lg text-primary">
              {pending ? "Envoi en cours…" : requestNumber}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">👤</div>
          <div>
            <div className="text-[10px] font-display font-bold uppercase text-muted-foreground">Votre conseiller</div>
            <div className="font-display font-semibold text-sm">Équipe Transport JSC</div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">⏱️</div>
          <div>
            <div className="text-[10px] font-display font-bold uppercase text-muted-foreground">Délai estimé</div>
            <div className="font-display font-semibold text-sm">
              {isOpen ? "Moins de 30 minutes (heures d'ouverture)" : "Réponse dès l'ouverture (7h)"}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        <a href="tel:5819947717" className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm">
          <Phone className="w-4 h-4" /> Appeler maintenant
        </a>
        <a
          href="https://wa.me/15819947717?text=Bonjour%2C%20je%20fais%20suite%20%C3%A0%20ma%20demande%20de%20transport."
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[#25D366] text-white font-display font-bold text-sm"
        >
          <MessageCircle className="w-4 h-4" /> Discuter avec nous
        </a>
        <button
          onClick={downloadSummary}
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-border font-display font-bold text-sm hover:border-primary/40"
        >
          <Download className="w-4 h-4" /> Télécharger le résumé
        </button>
      </div>

      <button
        onClick={onHome}
        className="w-full text-center text-sm text-muted-foreground hover:text-foreground underline font-body py-2"
      >
        Retour à l'accueil
      </button>
    </section>
  );
};

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
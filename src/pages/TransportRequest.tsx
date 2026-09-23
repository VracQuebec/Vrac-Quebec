import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { getEligibleEntrepreneurDumpSites, crmDompeNumber } from "@/lib/entrepreneur/dompes";
import { toast } from "@/hooks/use-toast";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useEntrepreneurProfile } from "@/hooks/useEntrepreneurProfile";
import { useUnsavedChangesGuard } from "@/lib/navigation/unsavedChanges";
import TransportBanner from "@/components/TransportBanner";
import GooglePlaceAutocomplete from "@/components/GooglePlaceAutocomplete";
import { buildTransportPrefill, type TransportPrefillSource } from "@/lib/parcours/validation";
import TransportEstimate from "@/components/transport/TransportEstimate";
import { useTransportRates, computeTransportPricing, formatCad } from "@/lib/transport/pricing";

import {
  submitTransportRequest,
  newIdempotencyKey,
  bootSubmitQueue,
} from "@/lib/transport/submitQueue";
import {
  Truck, MapPin, Package, Ruler, Loader2, ChevronLeft, ChevronRight,
  CheckCircle2, LocateFixed, Sparkles, Phone, Clock, Download, Route,
  MessageCircle, ShieldCheck, Zap, Network, Target, HelpCircle,
  Home, X,
} from "lucide-react";

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const STORAGE_KEY = "vq_transport_wizard_v1";

// Vignettes photoréalistes des catégories de remblai (WebP optimisé, 256px).
import imgTerrePropre from "@/assets/materials/terre-propre.webp";
import imgTerreGravier from "@/assets/materials/terre-gravier.webp";
import imgTerreArgileuse from "@/assets/materials/terre-argileuse.webp";
import imgSable from "@/assets/materials/sable.webp";
import imgGravier from "@/assets/materials/gravier.webp";
import imgPierre from "@/assets/materials/pierre.webp";
import imgRoc from "@/assets/materials/roc.webp";
import imgAsphalte from "@/assets/materials/asphalte.webp";
import imgBeton from "@/assets/materials/beton.webp";
import imgMelangeTerrePierre from "@/assets/materials/melange-terre-pierre.webp";
import imgMateriauxMixtes from "@/assets/materials/materiaux-mixtes.webp";
import imgAutre from "@/assets/materials/autre.webp";

// Photos réalistes des grandes catégories (présentation uniquement).
import photoTerre from "@/assets/materials/photos/terre.webp";
import photoSable from "@/assets/materials/photos/sable.webp";
import photoGravier from "@/assets/materials/photos/gravier.webp";
import photoPierre from "@/assets/materials/photos/pierre.webp";
import photoRoc from "@/assets/materials/photos/roc.webp";
import photoBeton from "@/assets/materials/photos/beton.webp";
import photoAsphalte from "@/assets/materials/photos/asphalte.webp";
import photoMixtes from "@/assets/materials/photos/mixtes.webp";
import photoAutre from "@/assets/materials/photos/autre.webp";

const GROUP_PHOTOS: Record<string, string> = {
  terre: photoTerre,
  sable: photoSable,
  gravier: photoGravier,
  pierre: photoPierre,
  roc: photoRoc,
  beton: photoBeton,
  asphalte: photoAsphalte,
  mixtes: photoMixtes,
  autre: photoAutre,
};

const MATERIAL_IMAGES: Record<string, string> = {
  terre_propre: imgTerrePropre,
  terre_gravier: imgTerreGravier,
  terre_argileuse: imgTerreArgileuse,
  sable: imgSable,
  gravier: imgGravier,
  pierre: imgPierre,
  roc: imgRoc,
  asphalte: imgAsphalte,
  beton: imgBeton,
  melange_terre_pierre: imgMelangeTerrePierre,
  materiaux_mixtes: imgMateriauxMixtes,
  autre: imgAutre,
};

// Catégories de remblai à évacuer vers une dompe. Chaque catégorie porte son
// « profil matière » : ces attributs servent au moteur de recommandations pour
// filtrer les dompes compatibles (sans changer son fonctionnement).
export interface MaterialProfile {
  id: string;
  label: string;
  icon: string;
  desc: string;
  /** Matériau principal */
  main: string;
  stone: boolean;
  clay: boolean;
  sand: boolean;
  /** Contaminants possibles (asphalte, béton, matériaux mixtes) */
  contaminants: boolean;
  /** Niveau de propreté : propre | mixte | contamine */
  cleanliness: "propre" | "mixte" | "contamine";
  /** Mots-clés utilisés pour associer la dompe */
  keywords: RegExp;
}

const MATERIALS: MaterialProfile[] = [
  { id: "terre_propre", label: "Terre propre", icon: "🟫", desc: "Terre d'excavation sans pierre ni débris.", main: "terre", stone: false, clay: false, sand: false, contaminants: false, cleanliness: "propre", keywords: /terre|remblai|remplissage/ },
  { id: "terre_gravier", label: "Terre avec gravier", icon: "🟤", desc: "Terre mélangée à du gravier ou de la petite pierre.", main: "terre", stone: true, clay: false, sand: false, contaminants: false, cleanliness: "mixte", keywords: /terre|gravier|pierre|remblai/ },
  { id: "terre_argileuse", label: "Terre argileuse", icon: "🧱", desc: "Terre lourde et collante, peu drainante.", main: "terre", stone: false, clay: true, sand: false, contaminants: false, cleanliness: "mixte", keywords: /terre|argile|remblai/ },
  { id: "sable", label: "Sable", icon: "🟨", desc: "Sable d'excavation ou de tranchée.", main: "sable", stone: false, clay: false, sand: true, contaminants: false, cleanliness: "propre", keywords: /sable/ },
  { id: "gravier", label: "Gravier", icon: "⚪", desc: "Gravier récupéré de fondation ou d'entrée.", main: "gravier", stone: true, clay: false, sand: true, contaminants: false, cleanliness: "propre", keywords: /gravier|pierre|concass/ },
  { id: "pierre", label: "Pierre", icon: "⬜", desc: "Pierre concassée ou pierre nette.", main: "pierre", stone: true, clay: false, sand: false, contaminants: false, cleanliness: "propre", keywords: /pierre|concass|roche/ },
  { id: "roc", label: "Roches", icon: "🪨", desc: "Roches dynamitées ou blocs d'excavation.", main: "roc", stone: true, clay: false, sand: false, contaminants: false, cleanliness: "propre", keywords: /roc|roche|enrochement|pierre/ },
  { id: "asphalte", label: "Asphalte", icon: "⬛", desc: "Planage ou morceaux d'asphalte à disposer.", main: "asphalte", stone: true, clay: false, sand: false, contaminants: true, cleanliness: "contamine", keywords: /asphalte|pavage|planage/ },
  { id: "beton", label: "Béton", icon: "🏗️", desc: "Dalles, fondations ou béton concassé.", main: "beton", stone: true, clay: false, sand: false, contaminants: true, cleanliness: "contamine", keywords: /b[ée]ton|dalle|ciment/ },
  { id: "melange_terre_pierre", label: "Mélange terre / pierre", icon: "🟫", desc: "Excavation mixte de terre et de pierre.", main: "melange", stone: true, clay: false, sand: false, contaminants: false, cleanliness: "mixte", keywords: /terre|pierre|gravier|remblai/ },
  { id: "materiaux_mixtes", label: "Matériaux mixtes", icon: "♻️", desc: "Excavation variée pouvant contenir des débris.", main: "mixte", stone: true, clay: true, sand: true, contaminants: true, cleanliness: "contamine", keywords: /mixte|remblai|d[ée]bris|terre/ },
  { id: "autre", label: "Autre (description)", icon: "❓", desc: "Matériel particulier — décrivez-le, on vous guide.", main: "autre", stone: false, clay: false, sand: false, contaminants: false, cleanliness: "mixte", keywords: /.*/ },
];

const HUMIDITY_OPTIONS = ["Sec", "Humide", "Détrempé"];

/* ------------------------------------------------------------------
   Regroupement UI des catégories de remblai (présentation uniquement).
   Chaque sous-type renvoie EXACTEMENT un identifiant MATERIALS existant :
   le moteur de recommandations reçoit les mêmes valeurs qu'avant.
------------------------------------------------------------------- */
interface MaterialSubtype { key: string; label: string; desc?: string; id: string }
interface MaterialGroup { key: string; label: string; image: string; subtypes: MaterialSubtype[] }

const MATERIAL_GROUPS: MaterialGroup[] = [
  {
    key: "terre", label: "Terre", image: imgTerrePropre,
    subtypes: [
      { key: "terre_propre", label: "Terre propre", desc: "Sans pierre ni débris.", id: "terre_propre" },
      { key: "terre_gravier", label: "Terre avec gravier", desc: "Mélangée à de la petite pierre.", id: "terre_gravier" },
      { key: "terre_argileuse", label: "Terre argileuse", desc: "Lourde, collante, peu drainante.", id: "terre_argileuse" },
      { key: "terre_vegetale", label: "Terre végétale", desc: "Couche de surface organique.", id: "terre_propre" },
      { key: "terre_noire", label: "Terre noire", desc: "Terre riche, foncée.", id: "terre_propre" },
      { key: "terre_autre", label: "Autre type de terre", desc: "Décrivez-la, on vous guide.", id: "autre" },
    ],
  },
  { key: "sable", label: "Sable", image: imgSable, subtypes: [
      { key: "sable", label: "Sable", desc: "Sable d'excavation ou de tranchée.", id: "sable" },
      { key: "sable_autre", label: "Autre", desc: "Sable particulier à décrire.", id: "autre" },
  ] },
  { key: "gravier", label: "Gravier", image: imgGravier, subtypes: [
      { key: "gravier", label: "Gravier", desc: "Fondation, entrée, chemin.", id: "gravier" },
      { key: "gravier_terre", label: "Gravier mélangé de terre", desc: "Excavation mixte.", id: "melange_terre_pierre" },
      { key: "gravier_autre", label: "Autre", desc: "À décrire.", id: "autre" },
  ] },
  { key: "pierre", label: "Pierre", image: imgPierre, subtypes: [
      { key: "pierre_concassee", label: "Pierre concassée", desc: "Calibre concassé.", id: "pierre" },
      { key: "pierre_nette", label: "Pierre nette", desc: "Lavée, sans fines.", id: "pierre" },
      { key: "melange_pierre", label: "Mélange pierre / terre", desc: "Excavation mixte.", id: "melange_terre_pierre" },
      { key: "pierre_autre", label: "Autre", desc: "À décrire.", id: "autre" },
  ] },
  { key: "roc", label: "Roches", image: imgRoc, subtypes: [
      { key: "roc", label: "Roches / dynamitage", desc: "Blocs d'excavation.", id: "roc" },
      { key: "roc_autre", label: "Autre", desc: "À décrire.", id: "autre" },
  ] },
  { key: "beton", label: "Béton", image: imgBeton, subtypes: [
      { key: "beton_concasse", label: "Béton concassé", desc: "Béton broyé.", id: "beton" },
      { key: "dalles_beton", label: "Dalles de béton", desc: "Morceaux de dalle.", id: "beton" },
      { key: "fondation", label: "Fondation", desc: "Démolition de fondation.", id: "beton" },
      { key: "beton_autre", label: "Autre", desc: "À décrire.", id: "autre" },
  ] },
  { key: "asphalte", label: "Asphalte", image: imgAsphalte, subtypes: [
      { key: "asphalte", label: "Asphalte / planage", desc: "Morceaux ou planage.", id: "asphalte" },
      { key: "asphalte_autre", label: "Autre", desc: "À décrire.", id: "autre" },
  ] },
  { key: "mixtes", label: "Matériaux mixtes", image: imgMateriauxMixtes, subtypes: [
      { key: "materiaux_mixtes", label: "Matériaux mixtes", desc: "Excavation variée, débris possibles.", id: "materiaux_mixtes" },
      { key: "melange_terre_pierre", label: "Mélange terre / pierre", desc: "Terre et pierre combinées.", id: "melange_terre_pierre" },
      { key: "mixtes_autre", label: "Autre", desc: "À décrire.", id: "autre" },
  ] },
  { key: "autre", label: "Autre", image: imgAutre, subtypes: [
      { key: "autre", label: "Autre (description)", desc: "Matériel particulier — décrivez-le.", id: "autre" },
  ] },
];


const STEP_LABELS = [
  { n: 1, label: "Remblai", icon: "📦" },
  { n: 2, label: "Chantier", icon: "📍" },
  { n: 3, label: "Quantité", icon: "⚖️" },
  { n: 4, label: "Recommandations", icon: "🗺️" },
  { n: 5, label: "Confirmation", icon: "✅" },
];

// "Je ne sais pas" project assistant → material recommendation
const PROJECT_TYPES: { id: string; label: string; icon: string; material: string; trucks: string }[] = [
  { id: "excavation_fondation", label: "Excavation de fondation", icon: "🏗️", material: "melange_terre_pierre", trucks: "12 roues" },
  { id: "piscine",              label: "Creusage de piscine",     icon: "🏊", material: "terre_propre",         trucks: "12 roues" },
  { id: "tranchee",             label: "Tranchée / services",     icon: "🕳️", material: "sable",               trucks: "10 roues" },
  { id: "nivellement",          label: "Nivellement de terrain",  icon: "📐", material: "terre_propre",         trucks: "12 roues" },
  { id: "demolition_asphalte",  label: "Démolition d'asphalte",   icon: "⬛", material: "asphalte",             trucks: "10 roues" },
  { id: "demolition_beton",     label: "Démolition de béton",     icon: "🧱", material: "beton",                trucks: "10 roues" },
  { id: "dynamitage",           label: "Roches / dynamitage",        icon: "🪨", material: "roc",                  trucks: "12 roues" },
  { id: "autre",                label: "Autre chantier",          icon: "❓", material: "autre",                trucks: "À déterminer" },
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
  /** true : distance/temps routiers retournés par le serveur. false : repli à vol d'oiseau (affichage « à confirmer »). */
  road_distance?: boolean;
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
  if (!selected || selected === "autre") return true;
  const profile = MATERIALS.find((m) => m.id === selected);
  if (profile) return profile.keywords.test(joined);
  return joined.includes(selected);
};

const TransportRequest = () => {
  const navigate = useNavigate();
  const location = useLocation();
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
  const [materialOther, setMaterialOther] = useState<string>("");
  // Navigation UI de l'étape 1 (présentation seulement)
  const [materialGroup, setMaterialGroup] = useState<string>("");
  const [materialSubKey, setMaterialSubKey] = useState<string>("");
  const [humidity, setHumidity] = useState<string>("");
  const [hasContaminants, setHasContaminants] = useState(false);

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
  // Tarifs et taxes administrés (jamais codés en dur).
  const { rates: truckRates, taxes: taxRates } = useTransportRates();
  const selectedRate = useMemo(
    () => truckRates.find((r) => r.code === truckType) ?? null,
    [truckRates, truckType],
  );
  /** Estimation recalculée dès que le camion ou le nombre de voyages change. */
  const transportPricing = useMemo(
    () => (taxRates ? computeTransportPricing(selectedRate, trips, taxRates) : null),
    [selectedRate, trips, taxRates],
  );
  const [desiredDate, setDesiredDate] = useState<string>("");
  const [desiredTime, setDesiredTime] = useState<string>("");
  const [clientNotes, setClientNotes] = useState<string>("");
  const [billingAddress, setBillingAddress] = useState("");
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
  // Site pré-sélectionné depuis le comparateur (aucune ressaisie demandée).
  const preselectDumpRef = useRef<string | null>(null);
  // Demande existante (source de vérité) transmise par le CRM ou le parcours.
  const submissionIdRef = useRef<string | null>(null);

  const hasProgress = () =>
    step > 1 || !!material || !!address || !!quantity || !!clientName || !!clientPhone;

  // Signale au bandeau de navigation universel qu'une saisie est en cours.
  useUnsavedChangesGuard(
    step < 6 &&
      (step > 1 || !!material || !!address || !!quantity || !!clientName || !!clientPhone),
  );

  // Hydrate from localStorage on mount → offer to resume
  useEffect(() => {
    try {
      // Prefill provenant du comparateur de sites : il a priorité sur un
      // éventuel brouillon local (le parcours vient d'être choisi).
      const pf = (location.state as { vqPrefill?: Record<string, unknown> } | null)?.vqPrefill;
      if (pf) {
        applyPrefill(pf as Record<string, unknown>);
        hydratedRef.current = true;
        return;
      }
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

  /** Applique un préremplissage (CRM ou comparateur) sans rien inventer. */
  function applyPrefill(pf: Record<string, unknown>) {
    const p = pf as {
      submissionId?: string | null; dumpId?: string; material?: string; truckType?: string;
      address?: string; coords?: { lat: number; lng: number } | null; trips?: string;
      quantity?: string; unit?: string; desiredDate?: string;
      clientName?: string; clientCompany?: string; clientPhone?: string; clientEmail?: string;
    };
    if (p.submissionId) submissionIdRef.current = p.submissionId;
    if (p.material && MATERIALS.some((m) => m.id === p.material)) {
      setMaterial(p.material);
      const g = MATERIAL_GROUPS.find((gr) => gr.subtypes.some((st) => st.id === p.material));
      if (g) {
        setMaterialGroup(g.key);
        setMaterialSubKey(g.subtypes.find((st) => st.id === p.material)?.key || "");
      }
    }
    if (p.address) setAddress(p.address);
    if (p.coords) setCoords(p.coords);
    if (p.truckType) setTruckType(p.truckType);
    if (p.trips) setTrips(p.trips);
    if (p.quantity) setQuantity(String(p.quantity));
    const u = (p.unit || "").toLowerCase();
    if (u.startsWith("tonne")) setUnit("tonnes");
    else if (u.includes("verge")) setUnit("verges");
    if (p.desiredDate) setDesiredDate(p.desiredDate);
    if (p.clientName) setClientName(p.clientName);
    if (p.clientCompany) setClientCompany(p.clientCompany);
    if (p.clientPhone) setClientPhone(p.clientPhone);
    if (p.clientEmail) setClientEmail(p.clientEmail);
    if (p.dumpId) preselectDumpRef.current = p.dumpId;
    setStep(3);
  }

  // Arrivée avec ?submission=<id> : la DEMANDE reste la source de vérité,
  // on relit la sélection réellement enregistrée (jamais le sessionStorage seul).
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("submission");
    if (!id || submissionIdRef.current) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_comparateur_selection", {
        p_submission_id: id,
      });
      if (cancelled || error || !data) return;
      const prefill = buildTransportPrefill(data as unknown as TransportPrefillSource);
      if (prefill) applyPrefill(prefill as unknown as Record<string, unknown>);
      hydratedRef.current = true;
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const resumeSaved = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.step) setStep(s.step);
      if (s.material && MATERIALS.some((m) => m.id === s.material)) {
        setMaterial(s.material);
        const g = MATERIAL_GROUPS.find((gr) => gr.subtypes.some((st) => st.id === s.material));
        if (g) {
          setMaterialGroup(g.key);
          setMaterialSubKey(g.subtypes.find((st) => st.id === s.material)?.key || "");
        }
      }
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
        billingAddress, contactName,
        savedAt: Date.now(),
      };
      if (
        step > 1 || material || address || quantity ||
        clientName || clientPhone
      ) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }
    } catch { /* ignore */ }
  }, [step, material, address, coords, city, quantity, unit, clientName, clientCompany, clientPhone, clientEmail, truckType, trips, desiredDate, desiredTime, clientNotes, billingAddress, contactName]);

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
      // Source unique du bassin entrepreneur (temps réel, positions publiques anonymisées).
      const { sites, error } = await getEligibleEntrepreneurDumpSites();
      if (error) throw new Error(error);
      const all = sites as any[];
      // Filter by material
      // Le serveur ne retourne que les dompes au statut CRM « en attente de livraison ».
      // On exclut en plus toute dompe sans numéro CRM valide (jamais de numéro fabriqué).
      const filtered = all.filter((d) =>
        crmDompeNumber(d) !== null && matchesMaterial(d.materials || [], material)
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
          // Distance routière UNIQUEMENT lorsque le serveur retourne les deux valeurs.
          // Sinon, repli à vol d'oiseau pour le classement, mais JAMAIS affiché comme routier.
          const road = typeof mx?.distance_km === "number" && typeof mx?.duration_minutes === "number";
          const distance_km = road ? (mx!.distance_km as number) : haversine(coords, { lat: d.latitude, lng: d.longitude });
          const duration_minutes = road ? (mx!.duration_minutes as number) : Math.round((distance_km / 60) * 60);

          // Classement uniquement : la disponibilité n'exclut jamais une dompe admissible.
          let score = 100 - Math.min(80, distance_km);
          if (d.availability_status === "unavailable" || d.availability_status === "owner_closed") score -= 20;
          else if (d.availability_status === "limited") score -= 5;
          else score += 10;
          if (d.truck_types_allowed && d.truck_types_allowed.length > 0) score += 3;
          if (d.accessibility && d.accessibility.length > 0) score += 2;

          const reasons: string[] = [];
          reasons.push(road ? `${distance_km} km` : "Distance routière à confirmer");
          if (d.availability_status !== "unavailable") reasons.push(availLabel(d.availability_status));
          if (d.truck_types_allowed?.length) reasons.push(`Camions: ${d.truck_types_allowed.join(", ")}`);

          return { ...d, distance_km, duration_minutes, road_distance: road, score, reason: reasons.join(" • ") };
        })
        .sort((a, b) => (b.score! - a.score!));

      const top = ranked.slice(0, 10);
      // Le site choisi dans le comparateur reste toujours visible, même hors top 10.
      if (preselectDumpRef.current && !top.some((d) => d.id === preselectDumpRef.current)) {
        const pre = ranked.find((d) => d.id === preselectDumpRef.current);
        if (pre) top.unshift(pre);
      }

      setDumps(top);
      // Réapplique le site choisi dans le comparateur, s'il est toujours listé.
      if (preselectDumpRef.current) {
        const pre = top.find((d) => d.id === preselectDumpRef.current);
        if (pre) setSelectedDump(pre);
      }
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

    try {
      const result = await submitTransportRequest({
      idempotency_key: idempotencyRef.current,
      client_name: clientName.trim() || clientCompany.trim() || clientEmail.trim() || "Entrepreneur",
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
      dump_name: selectedDump.dompe_number,
      material_other: materialOther.trim() || null,
      alternative_dumps: dumps
        .filter((d) => d.id !== selectedDump.id)
        .slice(0, 3)
        .map((d) => ({
          id: d.id,
          name: d.dompe_number,
          distance_km: d.road_distance ? (d.distance_km ?? null) : null,
          duration_minutes: d.road_distance ? (d.duration_minutes ?? null) : null,
          availability_status: d.availability_status ?? null,
        })),
      distance_km: selectedDump.road_distance ? (selectedDump.distance_km ?? null) : null,
      travel_time_minutes: selectedDump.road_distance ? (selectedDump.duration_minutes ?? null) : null,
      // Le libellé sert à l'affichage CRM ; le code sert au recalcul serveur.
      truck_type: selectedRate?.label ?? truckType ?? null,
      truck_rate_code: selectedRate?.code ?? null,
      estimated_trips: trips ? Number(trips) : null,
      desired_date: desiredDate || null,
      desired_time: desiredTime || null,
      client_notes: [
        clientNotes.trim(),
        (() => {
          const p = MATERIALS.find((m) => m.id === material);
          if (!p) return "";
          const traits = [
            p.stone && "pierre",
            p.clay && "argile",
            p.sand && "sable",
            (p.contaminants || hasContaminants) && "contaminants",
          ].filter(Boolean).join(", ");
          return `Profil du remblai : ${p.label}${materialOther.trim() ? ` (${materialOther.trim()})` : ""} — principal ${p.main}, propreté ${p.cleanliness}${traits ? `, contient ${traits}` : ""}${humidity ? `, ${humidity.toLowerCase()}` : ""}`;
        })(),
      ].filter(Boolean).join("\n") || null,
      source: user ? "wizard_authenticated" : "wizard_public",
      // Rattachement explicite à la demande existante (source de vérité DB).
      origin_submission_id: submissionIdRef.current,
      origin_stage: "transport_request",
    });

      if (result.status === "rejected") {
        toast({
          title: "Demande impossible",
          description:
            result.message === "site_non_valide"
              ? "Le site sélectionné n'a pas encore été validé par notre équipe."
              : result.message === "submission_introuvable"
                ? "La demande d'origine est introuvable."
                : "Cette demande n'a pas pu être rattachée à votre dossier.",
          variant: "destructive",
        });
        return;
      }
      setConfirmationMode(result.status);
      setConfirmedNumber(result.request_number ?? null);
      setStep(6);
    } catch (e: any) {
      console.error("[TransportRequest] submit failed", e);
      toast({ title: "Envoi impossible", description: e?.message ?? "Erreur inconnue", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // Validation: only real missing requirements block the button. When the user
  // is signed in, identity comes from the CRM profile and is considered valid
  // as soon as any identifier (name, company, phone or email) is available.
  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (step === 1 && !material) missing.push("Type de remblai à disposer");
    if (step === 2) {
      if (!address.trim()) missing.push("Adresse du chantier");
      else if (!coords) missing.push("Localisation de l'adresse (sélectionnez une suggestion)");
    }
    if (step === 3 && unit !== "inconnu" && !(quantity && Number(quantity) > 0)) {
      missing.push("Quantité estimée");
    }
    if (step === 4 && !selectedDump) missing.push("Choix de la dompe");
    if (step === 5) {
      const hasSessionIdentity =
        !!user && (!!clientName.trim() || !!clientCompany.trim() || !!clientEmail.trim());
      if (!hasSessionIdentity && !clientName.trim()) missing.push("Nom complet");
      // Le serveur exige toujours un numéro de téléphone.
      if (!clientPhone.trim()) missing.push("Téléphone");
      // Le prix du transport doit pouvoir être calculé avant l'envoi.
      if (!truckType) missing.push("Type de camion");
      else if (!selectedRate) missing.push("Tarif du camion (introuvable)");
      if (!(Number(trips) > 0)) missing.push("Nombre de voyages");
      else if (transportPricing && "error" in transportPricing) missing.push(transportPricing.error);
    }
    return missing;
  }, [step, material, coords, address, quantity, unit, selectedDump, user, clientName, clientCompany, clientPhone, clientEmail, truckType, trips, selectedRate, transportPricing]);

  const canNext = missingFields.length === 0;

  useEffect(() => {
    if (step !== 5) return;
    // Temporary validation diagnostics
    console.info("[TransportRequest] validation step 5", {
      signedIn: !!user,
      profileLoaded,
      clientName,
      clientCompany,
      clientPhone,
      clientEmail,
      missingFields,
      canNext,
    });
  }, [step, user, profileLoaded, clientName, clientCompany, clientPhone, clientEmail, missingFields, canNext]);

  const next = async () => {
    if (!canNext) return;
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
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background flex flex-col">
      <Helmet>
        <title>Demande de transport | Vrac Québec</title>
        <meta
          name="description"
          content="Formulaire de demande de transport de matériaux en vrac — étape opérationnelle du parcours Vrac Québec."
        />
        <meta name="robots" content="noindex, follow" />
        <link rel="canonical" href="https://vracquebec.ca/demande-transport" />
      </Helmet>
      <TransportBanner />
      <header className="border-b border-border bg-card/95 backdrop-blur sticky-below-nav z-30 w-full">
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
            <h2 className="font-display font-bold text-lg sm:text-xl mb-2">Reprendre votre demande d'accès précédente ?</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Une demande d'accès en cours a été sauvegardée sur cet appareil.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                onClick={clearSavedAndStartNew}
                className="px-4 py-2.5 rounded-lg border border-border font-display font-semibold text-sm hover:bg-muted"
              >
                Commencer une nouvelle demande d'accès
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
                Trouvez la meilleure dompe pour disposer de votre remblai.
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base max-w-xl mx-auto">
                Nous analysons votre chantier d'excavation afin de vous recommander les dompes compatibles les plus proches.
              </p>
              <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-display font-bold">
                <Clock className="w-3.5 h-3.5" /> Temps estimé : moins de 60 secondes
              </div>
            </div>

            {(() => {
              const group = MATERIAL_GROUPS.find((g) => g.key === materialGroup) || null;
              if (!group) {
                return (
                <>
                  <h2 className="font-display font-bold text-lg sm:text-2xl mb-1.5 flex items-center gap-2">
                    <Package className="w-5 h-5 text-primary" /> Quel type de remblai devez-vous disposer ?
                  </h2>
                  <p className="text-sm text-muted-foreground max-w-2xl mb-6">
                    Choisissez le matériau que vous devez évacuer. Nous nous occupons de trouver les sites compatibles en arrière-plan.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-5">
                    {MATERIAL_GROUPS.map((g) => {
                      const isSelected = !!material && g.subtypes.some((st) => st.id === material);
                      return (
                        <button
                          key={g.key}
                          onClick={() => { setMaterialGroup(g.key); if (g.subtypes.length === 1) { setMaterial(g.subtypes[0].id); setMaterialSubKey(g.subtypes[0].key); } }}
                          className={`group relative overflow-hidden rounded-2xl border-2 bg-card text-left transition-all duration-200 ease-out hover:-translate-y-1.5 hover:shadow-2xl hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            isSelected
                              ? "border-primary ring-2 ring-primary/40 shadow-xl -translate-y-0.5"
                              : "border-border/60 shadow-md"
                          }`}
                        >
                          <div className="relative aspect-[4/3] overflow-hidden">
                            <img
                              src={GROUP_PHOTOS[g.key] ?? g.image}
                              alt={`Remblai — ${g.label}`}
                              loading="lazy"
                              decoding="async"
                              width={560}
                              height={420}
                              className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                            />
                            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/55 via-black/20 to-transparent" />
                            {isSelected && (
                              <span className="absolute top-2 right-2 rounded-full bg-background/95 p-0.5 shadow-lg animate-scale-in">
                                <CheckCircle2 className="w-5 h-5 text-primary" />
                              </span>
                            )}
                            <div className="absolute inset-x-0 bottom-0 p-3">
                              <div className="font-display font-bold text-white text-base sm:text-lg leading-tight [text-shadow:0_1px_4px_rgba(0,0,0,0.7)]">
                                {g.label}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>

                );
              }
              return (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={() => { setMaterialGroup(""); setMaterialSubKey(""); setMaterial(""); }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-border bg-card text-xs font-display font-semibold hover:border-primary transition-colors"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Retour
                    </button>
                    <h2 className="font-display font-bold text-lg sm:text-xl flex items-center gap-2">
                      <Package className="w-5 h-5 text-primary" /> {group.label} — précisez
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {group.subtypes.map((st) => {
                      const active = materialSubKey === st.key && material === st.id;
                      return (
                        <button
                          key={st.key}
                          onClick={() => { setMaterial(st.id); setMaterialSubKey(st.key); }}
                          aria-pressed={active}
                          className={`group relative overflow-hidden p-3 rounded-2xl border-2 text-left transition-all duration-300 ease-out ${
                            active
                              ? "border-primary bg-gradient-to-br from-primary/10 to-transparent shadow-lg -translate-y-0.5"
                              : "border-border bg-card hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5"
                          }`}
                        >
                          <div className="flex items-center gap-3.5">
                            <div className={`relative flex-shrink-0 w-[88px] h-[88px] rounded-xl overflow-hidden ring-1 transition-all duration-300 ${active ? "ring-2 ring-primary" : "ring-border"}`}>
                              <img
                                src={MATERIAL_IMAGES[st.id] || group.image}
                                alt={`Remblai — ${st.label}`}
                                loading="lazy"
                                decoding="async"
                                width={256}
                                height={256}
                                className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                              />
                              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
                            </div>
                            <div className="min-w-0 pr-6">
                              <div className="font-display font-bold text-base">{st.label}</div>
                              {st.desc && <div className="text-xs text-muted-foreground mt-0.5">{st.desc}</div>}
                            </div>
                          </div>
                          <CheckCircle2
                            className={`absolute top-2.5 right-2.5 w-5 h-5 text-primary transition-all duration-300 ${active ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </>
              );
            })()}

            {material === "autre" && (
              <input
                value={materialOther}
                onChange={(e) => setMaterialOther(e.target.value)}
                placeholder="Décrivez le matériel à évacuer"
                className="mt-3 w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm font-body"
              />
            )}

            {material && (
              <div className="mt-4 p-4 rounded-xl border border-border bg-card">
                <p className="text-[10px] font-display font-bold uppercase tracking-wide text-muted-foreground mb-2">
                  Précisions sur le matériel (facultatif)
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {HUMIDITY_OPTIONS.map((h) => (
                    <button
                      key={h}
                      onClick={() => setHumidity(humidity === h ? "" : h)}
                      className={`px-3 py-1.5 rounded-full border text-xs font-display font-semibold ${
                        humidity === h ? "border-primary bg-primary/10 text-primary" : "border-border bg-background"
                      }`}
                    >
                      💧 {h}
                    </button>
                  ))}
                  <button
                    onClick={() => setHasContaminants((v) => !v)}
                    className={`px-3 py-1.5 rounded-full border text-xs font-display font-semibold ${
                      hasContaminants ? "border-primary bg-primary/10 text-primary" : "border-border bg-background"
                    }`}
                  >
                    ⚠️ Présence de contaminants
                  </button>
                </div>
                {(() => {
                  const p = MATERIALS.find((m) => m.id === material);
                  if (!p) return null;
                  const traits = [
                    p.stone && "pierre",
                    p.clay && "argile",
                    p.sand && "sable",
                    (p.contaminants || hasContaminants) && "contaminants possibles",
                  ].filter(Boolean) as string[];
                  return (
                    <p className="text-xs text-muted-foreground">
                      Profil détecté : {p.main} • propreté {p.cleanliness}
                      {traits.length > 0 ? ` • contient ${traits.join(", ")}` : ""}
                      {humidity ? ` • ${humidity.toLowerCase()}` : ""}
                    </p>
                  );
                })()}
              </div>
            )}

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
                          {
                            const g = MATERIAL_GROUPS.find((gr) => gr.subtypes.some((st) => st.id === proj.material));
                            setMaterialGroup(g?.key || "");
                            setMaterialSubKey(g?.subtypes.find((st) => st.id === proj.material)?.key || "");
                          }
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
                        <p>📦 <b>Remblai :</b> {mat?.label} {mat?.icon}</p>
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
                <li className="flex items-center gap-2"><Truck className="w-3.5 h-3.5 text-primary" /> Demande d'accès simplifiée</li>
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
                Aucun souci — l'équipe Vrac Québec vous aidera à estimer la quantité lors de l'appel.
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
              Dompes au statut « en attente de livraison », classées selon distance et compatibilité.
            </p>

            {loadingResults ? (
              <div className="py-16 flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Analyse en cours…</p>
              </div>
            ) : dumps.length === 0 ? (
              <div className="p-6 bg-card border border-border rounded-lg text-center">
                <p className="text-sm font-semibold mb-2">Aucune dompe disponible pour ce chantier actuellement.</p>
                <p className="text-xs text-muted-foreground">Nous n'avons actuellement aucune dompe admissible correspondant à votre recherche.</p>
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
                              Dompe #{crmDompeNumber(d)}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-body uppercase tracking-wide">{rank.label}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          {d.road_distance ? (
                            <>
                              <div className="font-display font-bold text-lg text-primary">{d.distance_km} km</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                                <Clock className="w-3 h-3" /> {d.duration_minutes} min
                              </div>
                            </>
                          ) : (
                            <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end max-w-[9rem]">
                              <Route className="w-3 h-3 flex-shrink-0" /> Distance routière à confirmer
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        <span className="px-2 py-0.5 rounded-full bg-background border border-border font-body">
                          🟢 Disponible
                        </span>
                        {d.opening_hours && (
                          <span className="px-2 py-0.5 rounded-full bg-background border border-border font-body">🕐 {d.opening_hours}</span>
                        )}
                      </div>
                      {/* Matériaux : tels qu'enregistrés dans la fiche CRM, sans ajout ni déduction. */}
                      {d.materials && d.materials.length > 0 && (
                        <div className="mt-2" data-testid="reco-materials">
                          <p className="text-[10px] font-display font-bold uppercase tracking-wide text-muted-foreground">Matériaux acceptés</p>
                          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                            {d.materials.map((m, mi) => {
                              const hit = material && material !== "autre" && matchesMaterial([m], material);
                              return (
                                <span
                                  key={`${m}-${mi}`}
                                  className={`px-2 py-0.5 rounded-full border font-body ${hit ? "border-primary bg-primary/10 text-foreground font-semibold" : "border-border bg-background"}`}
                                >
                                  {m}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {/* Camions : uniquement ceux de la fiche CRM. */}
                      {d.truck_types_allowed && d.truck_types_allowed.length > 0 && (
                        <div className="mt-2" data-testid="reco-trucks">
                          <p className="text-[10px] font-display font-bold uppercase tracking-wide text-muted-foreground">Camions acceptés</p>
                          <p className="mt-1 text-xs font-body">{d.truck_types_allowed.join(" · ")}</p>
                        </div>
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
                <SummaryRow icon="📦" label="Remblai à disposer" value={MATERIALS.find((m) => m.id === material)?.label || material} />
                <SummaryRow icon="📏" label="Quantité estimée" value={unit === "inconnu" ? "À déterminer" : `${quantity} ${unit}`} />
                <SummaryRow icon="🚛" label="Voyages estimés" value={trips || "À confirmer"} />
                <SummaryRow icon="⏱️" label="Temps de trajet" value={selectedDump.road_distance ? `${selectedDump.duration_minutes} min` : "À confirmer"} />
                <SummaryRow icon="🎯" label="Dompe recommandée" value={selectedDump.road_distance ? `#${crmDompeNumber(selectedDump)} • ${selectedDump.distance_km} km` : `#${crmDompeNumber(selectedDump)} • distance à confirmer`} />
              </div>
              {dumps.length > 1 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs font-display font-bold uppercase text-muted-foreground mb-1.5">Alternatives</p>
                  <div className="space-y-1 text-xs">
                    {dumps.filter((d) => d.id !== selectedDump.id).slice(0, 2).map((d, i) => (
                      <p key={d.id}>
                        {i === 0 ? "🥈" : "🥉"} Dompe #{crmDompeNumber(d)} — {d.road_distance ? `${d.distance_km} km (${d.duration_minutes} min)` : "distance routière à confirmer"}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Identity — prefilled (read-only) from the entrepreneur profile when signed in */}
            {user ? (
              <div className="mb-4">
                <div className="bg-muted/40 rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <p className="text-[10px] font-display font-bold uppercase text-muted-foreground tracking-wide">
                      Demande faite au nom de
                    </p>
                    <Link
                      to="/entrepreneur/compte"
                      className="text-xs font-display font-semibold text-primary hover:underline flex-shrink-0"
                    >
                      Modifier mes informations
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-sm">
                    <ReadOnlyRow label="Nom du contact" value={contactName || clientName} />
                    <ReadOnlyRow label="Entreprise" value={clientCompany} />
                    <ReadOnlyRow label="Téléphone" value={clientPhone} />
                    <ReadOnlyRow label="Courriel" value={clientEmail} />
                    {billingAddress && (
                      <ReadOnlyRow label="Adresse de facturation" value={billingAddress} />
                    )}
                  </div>
                </div>

                {profileLoaded && (!clientPhone.trim() || !clientCompany.trim()) && (
                  <div className="mt-3 rounded-xl border-2 border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-4">
                    <p className="text-sm font-body text-foreground">
                      Certaines informations de votre profil sont manquantes. Complétez votre profil
                      pour poursuivre.
                    </p>
                    {!clientPhone.trim() && (
                      <div className="mt-3">
                        <Field
                          label="Téléphone *"
                          value={clientPhone}
                          onChange={setClientPhone}
                          placeholder="418-555-0000"
                          type="tel"
                        />
                      </div>
                    )}
                    <Link
                      to="/entrepreneur/compte"
                      className="mt-3 inline-flex items-center rounded-lg bg-primary px-3.5 py-2 font-display font-bold text-xs text-primary-foreground"
                    >
                      Compléter mon profil
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="mb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Nom complet *" value={clientName} onChange={setClientName} placeholder="Jean Tremblay" />
                  <Field label="Entreprise" value={clientCompany} onChange={setClientCompany} placeholder="Construction ABC inc." />
                  <Field label="Téléphone *" value={clientPhone} onChange={setClientPhone} placeholder="418-555-0000" type="tel" />
                  <Field label="Courriel" value={clientEmail} onChange={setClientEmail} placeholder="vous@exemple.com" type="email" />
                </div>
              </div>
            )}

            {/* Chantier-specific fields only */}
            <p className="text-[10px] font-display font-bold uppercase text-muted-foreground tracking-wide mb-2">
              Informations sur ce chantier
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-display font-bold uppercase text-muted-foreground mb-1.5">
                  Type de camion *
                </span>
                <select
                  value={truckType}
                  onChange={(e) => setTruckType(e.target.value)}
                  className="h-12 w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm text-foreground"
                >
                  <option value="">Choisir un type de camion…</option>
                  {truckRates.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label} — {formatCad(r.price_per_trip)} / voyage
                    </option>
                  ))}
                  {/* Valeur historique ou préremplie hors grille : conservée */}
                  {truckType && !truckRates.some((r) => r.code === truckType) && (
                    <option value={truckType}>{truckType}</option>
                  )}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-display font-bold uppercase text-muted-foreground mb-1.5">
                  Nombre de voyages *
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={trips}
                  onChange={(e) => setTrips(e.target.value)}
                  placeholder="Ex. 3"
                  className="h-12 w-full rounded-lg border border-input bg-background px-3 text-base sm:text-sm text-foreground"
                />
              </label>
              <Field label="Date souhaitée" value={desiredDate} onChange={setDesiredDate} type="date" />
              <Field label="Heure souhaitée" value={desiredTime} onChange={setDesiredTime} type="time" />
            </div>

            <div className="mt-4">
              <TransportEstimate pricing={transportPricing} />
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
                Votre demande est prise en charge par <b>Vrac Québec</b>, qui l'achemine automatiquement vers la dompe ou le partenaire le plus approprié et communique avec vous rapidement.
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
            dump={selectedDump ? `#${crmDompeNumber(selectedDump)} — ${selectedDump.road_distance ? `${selectedDump.distance_km} km (${selectedDump.duration_minutes} min)` : "distance routière à confirmer"}` : ""}
            onHome={() => navigate("/")}
          />
        )}

        {/* Navigation */}
        {step < 6 && (
          <div className="mt-8 pt-4 border-t border-border">
            {missingFields.length > 0 && (
              <p className="mb-3 text-xs font-body text-destructive">
                Champs à compléter : {missingFields.join(", ")}
              </p>
            )}
            <div className="flex justify-between">
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

const ReadOnlyRow = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-display font-bold uppercase text-muted-foreground tracking-wide">{label}</p>
    <p className="font-body text-sm text-foreground break-words">{value || "—"}</p>
  </div>
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
      "VRAC QUÉBEC — PLATEFORME DE DISPOSITION DE REMBLAI",
      "RÉSUMÉ DE LA DEMANDE D'ACCÈS À LA DOMPE",
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
      "Vrac Québec — 581-994-7717",
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
            : `Merci ${clientName ? clientName.split(" ")[0] : ""} — votre demande a bien été reçue par Vrac Québec. Notre équipe l'analyse et l'achemine automatiquement vers la dompe ou le partenaire le plus approprié selon votre remblai, votre localisation et les disponibilités.`}
        </p>
      </div>

      <div className="bg-card rounded-2xl border-2 border-primary/30 p-4 sm:p-5 shadow-md space-y-3 mb-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">✅</div>
          <div>
            <div className="text-[10px] font-display font-bold uppercase text-muted-foreground">
              {pending ? "État" : "Numéro de demande d'accès"}
            </div>
            <div className="font-display font-bold text-lg text-primary">
              {pending ? "Envoi en cours…" : requestNumber}
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">👤</div>
          <div>
            <div className="text-[10px] font-display font-bold uppercase text-muted-foreground">Prise en charge par</div>
            <div className="font-display font-semibold text-sm">Équipe Vrac Québec</div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">⏱️</div>
          <div>
            <div className="text-[10px] font-display font-bold uppercase text-muted-foreground">Suivi de votre demande d'accès</div>
            <div className="font-display font-semibold text-sm">
              {isOpen
                ? "Notre équipe vous contactera dès que votre demande aura été analysée."
                : "Une confirmation vous sera envoyée dès qu'une dompe compatible aura accepté votre demande."}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
        <a href="tel:5819947717" className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm">
          <Phone className="w-4 h-4" /> Appeler maintenant
        </a>
        <a
          href="https://wa.me/15819947717?text=Bonjour%2C%20je%20fais%20suite%20%C3%A0%20ma%20demande%20sur%20Vrac%20Qu%C3%A9bec."
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
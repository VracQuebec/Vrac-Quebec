import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LeadPhotos } from "@/components/admin/LeadPhotos";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { MATERIAL_TYPES, REQUEST_TYPES, LEAD_PRIORITIES, serviceTypeMeta, normalizeRequestType, requestTypeMeta } from "@/lib/questionnaire-data";
import { CONTAMINATION_OPTIONS, DELIVER_OR_REMOVE_OPTIONS, PROJECT_TYPES, TRUCK_ACCESS_OPTIONS } from "@/lib/questionnaire-data";
import InlineField from "@/components/InlineField";
import { useLeadStatuses, findStatus, type LeadStatus } from "@/hooks/useLeadStatuses";
import { Switch } from "@/components/ui/switch";
import StatusManagerModal from "@/components/StatusManagerModal";
import FullPageState from "@/components/FullPageState";
import NotificationBell from "@/components/notifications/NotificationBell";
import {
  validateSelectedSite,
  buildTransportPrefill,
  fetchLinkedTransportRequest,
  type LinkedTransportRequest,
  type TransportPrefillSource,
} from "@/lib/parcours/validation";
import {
  Truck, LogOut, Trash2, Loader2, ChevronDown, ChevronUp, Map, List,
  Phone, MessageSquare, Mail, MapPin, Archive, Download, Upload, Users, Plus, Eye, EyeOff, Save, Settings,
} from "lucide-react";
import AdminMap from "@/components/AdminMap";
import BillingSection from "@/components/BillingSection";
import BillingOverview from "@/components/BillingOverview";
import EntrepreneursAdmin from "@/components/EntrepreneursAdmin";
import { overdueBucket as tripOverdueBucket } from "@/lib/billing";
import { useUserRoles } from "@/hooks/useUserRole";
import { useAuthReady } from "@/hooks/useAuthReady";
import CsvImportModal from "@/components/CsvImportModal";
import GoogleSheetImportModal from "@/components/GoogleSheetImportModal";
import ExcelImportModal from "@/components/ExcelImportModal";
import NewLeadModal, { LEAD_SOURCES } from "@/components/NewLeadModal";
import { Link } from "react-router-dom";
import { Database as DatabaseIcon } from "lucide-react";
import { Search, CalendarDays, Menu, BookOpen as BookOpenIcon, TrendingUp } from "lucide-react";
import { Ban, Activity } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import TransportBanner from "@/components/TransportBanner";
import {
  ACCESS_RESTRICTION_OPTIONS,
  TRUCK_OPTIONS,
  availabilityInfo,
  type SiteLike,
} from "@/lib/entrepreneur/site-match";

/** Champs « site de dépôt » exposés aux entrepreneurs (remblai uniquement). */
const SITE_AVAILABILITY_OPTIONS = [
  { value: "available", label: "Disponible" },
  { value: "limited", label: "Disponibilité limitée" },
  { value: "approval", label: "Sur approbation" },
  { value: "unavailable", label: "Indisponible" },
];

/** Champs réellement essentiels à la fiche site : sans eux, la fiche n'est pas
 *  exploitable par les entrepreneurs. */
const siteGaps = (sub: Submission): string[] => {
  const gaps: string[] = [];
  if (!(sub.materials?.length) && !sub.other_material) gaps.push("Matériaux non renseignés");
  if (!sub.address?.trim()) gaps.push("Adresse du site non renseignée");
  if (sub.latitude == null || sub.longitude == null) gaps.push("Coordonnées GPS non disponibles");
  return gaps;
};

/** Informations facultatives : jamais inventées, simplement « à confirmer ». */
const siteToConfirm = (sub: Submission): string[] => {
  const list: string[] = [];
  if (!(sub.truck_types_allowed?.length)) list.push("Camions acceptés");
  if (!sub.access_details || Object.keys(sub.access_details).length === 0) list.push("Restrictions d'accès");
  if (!sub.remaining_capacity) list.push("Capacité restante");
  if (!sub.opening_hours) list.push("Heures d'ouverture");
  if (!sub.availability_updated_at) list.push("Disponibilité");
  return list;
};

interface Submission {
  id: string;
  submission_number: number | null;
  dompe_number?: string | null;
  latitude: number | null;
  longitude: number | null;
  postal_latitude?: number | null;
  postal_longitude?: number | null;
  geocoding_status?: string | null;
  materials: string[];
  other_material: string | null;
  property_type: string;
  quantity: string;
  tonnage: string;
  budget_unit: string | null;
  budget_max: string | null;
  machinery_available: boolean | null;
  machinery_description: string | null;
  accessibility: string[] | null;
  address: string;
  postal_code: string | null;
  name: string;
  email: string;
  phone: string | null;
  description: string | null;
  created_at: string;
  status: string;
  request_type: string;
  deliver_or_remove: string | null;
  contamination: string | null;
  photos: string[] | null;
  length_ft: string | null;
  width_ft: string | null;
  depth_in: string | null;
  priority: string;
  delivery_deadline?: string | null;
  delivery_timeframe?: string | null;
  visible_to_entrepreneur: boolean;
  internal_notes: string;
  assigned_entrepreneur: string | null;
  show_on_admin_map?: boolean;
  lead_source?: string | null;
  lead_category?: string | null;
  creation_origin?: string | null;
  company?: string | null;
  availability_status?: string | null;
  availability_note?: string | null;
  availability_updated_at?: string | null;
  remaining_capacity?: string | null;
  opening_hours?: string | null;
  truck_types_allowed?: string[] | null;
  access_details?: Record<string, unknown> | null;
  access_heavy_truck?: string | null;
  selected_site_id?: string | null;
  selected_site_label?: string | null;
  selected_site_address?: string | null;
  selected_site_latitude?: number | null;
  selected_site_longitude?: number | null;
  selection_updated_at?: string | null;
  site_validated_at?: string | null;
  quote_material?: string | null;
  quote_quantity?: number | null;
  quote_unit?: string | null;
  quote_trips?: number | null;
  quote_truck?: string | null;
  quote_distance_km?: number | null;
  quote_duration_minutes?: number | null;
}

interface LeadNote {
  id: string;
  note: string;
  author_email: string | null;
  created_at: string;
}

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

const parseEstimatedTrips = (quantity: string | null): number | null => {
  if (!quantity) return null;
  const match = quantity.match(/(\d+)(?:\s*(?:-|à|a|to)\s*(\d+))?/i);
  if (!match) return null;
  const first = parseInt(match[1], 10);
  if (isNaN(first)) return null;
  // "X et plus", "X+", "X et +" → use X
  if (/et\s+(plus|\+|plusieurs)|\+/.test(quantity)) return first;
  return first;
};

const getMaterialLabels = (ids: string[]) =>
  ids.map((id) => MATERIAL_TYPES.find((m) => m.id === id)?.label || id).join(", ");

const Admin = () => {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showUsers, setShowUsers] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSheetImport, setShowSheetImport] = useState(false);
  const [showExcelImport, setShowExcelImport] = useState(false);
  const [geocoding, setGeocoding] = useState<{ done: number; total: number } | null>(null);
  const [rechecking, setRechecking] = useState<{ done: number; total: number } | null>(null);
  const [showStatusManager, setShowStatusManager] = useState(false);
  const [showNewLead, setShowNewLead] = useState(false);
  const [filterSource, setFilterSource] = useState<string>("all");
  const [showArchivedOnMap, setShowArchivedOnMap] = useState(false);
  const [tab, setTab] = useState<"leads" | "billing" | "entrepreneurs">("leads");
  const [filterTrips, setFilterTrips] = useState<string>("all");
  const [sortTrips, setSortTrips] = useState<string>("default");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterAssigned, setFilterAssigned] = useState<string>("all");
  const [filterMaterial, setFilterMaterial] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [entrepreneursList, setEntrepreneursList] = useState<{ user_id: string; email: string }[]>([]);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const overdueNotifiedRef = useRef(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { statuses: leadStatuses } = useLeadStatuses();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isReady: authReady } = useAuthReady();
  const { isAdmin, isEntrepreneur, loading: roleLoading } = useUserRoles(user, authReady);

  useEffect(() => {
    if (!authReady || roleLoading) return;
    if (!isAdmin && isEntrepreneur) navigate("/entrepreneur", { replace: true });
  }, [authReady, isAdmin, isEntrepreneur, roleLoading, navigate]);

  // Lien direct depuis une notification : /admin?lead=<uuid> ouvre la fiche.
  useEffect(() => {
    const leadId = searchParams.get("lead");
    if (!leadId) return;
    setTab("leads");
    setExpanded(leadId);
    const next = new URLSearchParams(searchParams);
    next.delete("lead");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    fetchSubmissions();
  }, [authReady, user, navigate]);

  // Load entrepreneur list once for filters + dispatch panel
  useEffect(() => {
    if (!isAdmin) return;
    supabase.rpc("list_users_with_roles").then(({ data }) => {
      const list = ((data as any) || [])
        .filter((u: any) => (u.roles || []).includes("entrepreneur"))
        .map((u: any) => ({ user_id: u.user_id, email: u.email }));
      setEntrepreneursList(list);
    });
  }, [isAdmin]);

  // Realtime: reflect submission changes made by other admins immediately
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel(`admin-submissions-live-` + Math.random().toString(36).slice(2))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "submissions" },
        (payload: any) => {
          if (payload.eventType === "INSERT" && payload.new) {
            setSubmissions((prev) => (prev.find((s) => s.id === payload.new.id) ? prev : [payload.new as any, ...prev]));
          } else if (payload.eventType === "UPDATE" && payload.new) {
            setSubmissions((prev) => prev.map((s) => (s.id === payload.new.id ? { ...s, ...payload.new } : s)));
          } else if (payload.eventType === "DELETE" && payload.old) {
            setSubmissions((prev) => prev.filter((s) => s.id !== payload.old.id));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAdmin]);

  // Check overdue invoices on admin load and notify
  useEffect(() => {
    if (!isAdmin || overdueNotifiedRef.current) return;
    overdueNotifiedRef.current = true;
    (async () => {
      const { data } = await supabase.from("lead_trips" as any).select("*").limit(2000);
      const trips = (data as any) || [];
      const overdue = trips.filter((t: any) => tripOverdueBucket(t));
      if (overdue.length > 0) {
        const b7 = overdue.filter((t: any) => tripOverdueBucket(t)?.bucket === 7).length;
        const b14 = overdue.filter((t: any) => tripOverdueBucket(t)?.bucket === 14).length;
        const b28 = overdue.filter((t: any) => tripOverdueBucket(t)?.bucket === 28).length;
        toast({
          title: `${overdue.length} paiement(s) en retard`,
          description: `≥7j : ${b7} · ≥14j : ${b14} · ≥28j : ${b28}`,
          variant: "destructive",
        });
      }
    })();
  }, [isAdmin]);

  // Empêcher le bouton "précédent" du navigateur/téléphone de quitter le site
  // depuis la page admin. On pousse un état factice puis on le re-pousse à
  // chaque popstate tant que l'utilisateur reste sur /admin.
  useEffect(() => {
    const tag = "vq_admin_guard";
    if (!window.history.state || window.history.state.tag !== tag) {
      window.history.pushState({ tag }, "");
    }
    const onPop = () => {
      if (window.location.pathname.startsWith("/admin")) {
        window.history.pushState({ tag }, "");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const fetchSubmissions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("submissions").select("*").order("created_at", { ascending: false });
    if (error) toast({ title: "Erreur", description: "Impossible de charger les demandes.", variant: "destructive" });
    else setSubmissions((data as any) || []);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer définitivement cette demande ?")) return;
    const { error } = await supabase.from("submissions").delete().eq("id", id);
    if (error) toast({ title: "Erreur", description: "Impossible de supprimer.", variant: "destructive" });
    else { setSubmissions((prev) => prev.filter((s) => s.id !== id)); toast({ title: "Supprimée" }); }
  };

  const updateStatus = async (id: string, status: string) => {
    const { data, error } = await supabase
      .from("submissions")
      .update({ status })
      .eq("id", id)
      .select("id, status")
      .maybeSingle();
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    if (!data) {
      toast({
        title: "Modification refusée",
        description: "La mise à jour n'a affecté aucune ligne (permissions ou session expirée). Reconnectez-vous.",
        variant: "destructive",
      });
      return;
    }
    setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
    toast({ title: "Statut mis à jour", description: status });
  };

  const updateField = async (id: string, patch: Partial<Submission>) => {
    const { data, error } = await supabase
      .from("submissions")
      .update(patch as any)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    if (!data) {
      toast({
        title: "Modification refusée",
        description: "La mise à jour n'a affecté aucune ligne (permissions ou session expirée). Reconnectez-vous.",
        variant: "destructive",
      });
      return;
    }
    setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    toast({ title: "Enregistré" });
  };

  const archive = (id: string) => updateStatus(id, "archivé");

  // Statuts de géolocalisation :
  //  - validated_address : adresse civique validée par Google (ROOFTOP/RANGE_INTERPOLATED)
  //  - validated_postal  : centre du code postal seulement
  //  - approximate       : ville/rue sans numéro, requête libre
  //  - error             : aucun résultat
  type GeoStatus = "validated_address" | "validated_postal" | "approximate" | "error";
  type GeoResult = {
    lat: number | null;
    lon: number | null;
    postalLat: number | null;
    postalLon: number | null;
    status: GeoStatus;
    formattedAddress?: string | null;
    placeId?: string | null;
    locationType?: string | null;
  };

  // Géocodage via Google Geocoding API (edge function `google-geocode`).
  // On retourne aussi le centre du code postal pour la carte des entrepreneurs
  // (anonymisation côté DB).
  const geocodeOne = async (
    address: string,
    postal: string | null
  ): Promise<GeoResult> => {
    try {
      const { data, error } = await supabase.functions.invoke("google-geocode", {
        body: { address, postalCode: postal },
      });
      if (error || !data) {
        return { lat: null, lon: null, postalLat: null, postalLon: null, status: "error" };
      }
      return {
        lat: data.lat ?? null,
        lon: data.lng ?? null,
        postalLat: data.postalLat ?? null,
        postalLon: data.postalLng ?? null,
        status: (data.status as GeoStatus) || "error",
        formattedAddress: data.formattedAddress ?? null,
        placeId: data.placeId ?? null,
        locationType: data.locationType ?? null,
      };
    } catch {
      return { lat: null, lon: null, postalLat: null, postalLon: null, status: "error" };
    }
  };

  const geocodeMissing = async () => {
    const missing = submissions.filter(
      (s) => (!s.latitude || !s.longitude) && (s.address || s.postal_code)
    );
    if (missing.length === 0) {
      toast({ title: "Tout est déjà géolocalisé." });
      return;
    }
    if (!confirm(`Géocoder ${missing.length} adresse(s) avec Google ? (~0.3s/adresse)`)) return;
    setGeocoding({ done: 0, total: missing.length });
    let ok = 0;
    for (let i = 0; i < missing.length; i++) {
      const s = missing[i];
      const found = await geocodeOne(s.address, s.postal_code);
      const patch: any = { geocoding_status: found.status, geocoding_provider: "google" };
      if (found.lat != null && found.lon != null) {
        patch.latitude = found.lat; patch.longitude = found.lon;
      }
      if (found.postalLat != null && found.postalLon != null) {
        patch.postal_latitude = found.postalLat; patch.postal_longitude = found.postalLon;
      }
      if (found.formattedAddress) patch.formatted_address = found.formattedAddress;
      if (found.placeId) patch.place_id = found.placeId;
      if (found.locationType) patch.location_type = found.locationType;
      const { error } = await supabase.from("submissions").update(patch).eq("id", s.id);
      if (!error) {
        if (found.status !== "error") ok++;
        setSubmissions((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...patch } : x)));
      }
      setGeocoding({ done: i + 1, total: missing.length });
      await new Promise((r) => setTimeout(r, 250));
    }
    setGeocoding(null);
    toast({ title: "Géocodage terminé", description: `${ok}/${missing.length} adresses localisées.` });
  };

  // Re-vérifie TOUTES les adresses : recroisement Nominatim + geocoder.ca,
  // met à jour seulement si la nouvelle position diffère de plus de ~250 m.
  const recheckAllAddresses = async () => {
    const targets = submissions.filter((s) => s.address && s.address.trim().length > 3);
    if (targets.length === 0) {
      toast({ title: "Aucune adresse à vérifier." });
      return;
    }
    if (!confirm(
      `Re-géocoder ${targets.length} adresse(s) avec Google Maps ?\n\nLes coordonnées seront remplacées par les coordonnées Google précises. (~0.3 sec/adresse)`
    )) return;

    const distMeters = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
      const R = 6371000;
      const toRad = (x: number) => (x * Math.PI) / 180;
      const dLat = toRad(b.lat - a.lat);
      const dLon = toRad(b.lon - a.lon);
      const s1 = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(s1)));
    };

    setRechecking({ done: 0, total: targets.length });
    let updated = 0; let unchanged = 0; let notFound = 0;
    for (let i = 0; i < targets.length; i++) {
      const s = targets[i];
      const found = await geocodeOne(s.address, s.postal_code);
      if (found.lat == null || found.lon == null) {
        notFound++;
        await supabase.from("submissions").update({ geocoding_status: "error" } as any).eq("id", s.id);
        setSubmissions((prev) => prev.map((x) => (x.id === s.id ? { ...x, geocoding_status: "error" } : x)));
      } else {
        const current = (s.latitude && s.longitude)
          ? { lat: s.latitude as number, lon: s.longitude as number }
          : null;
        const drift = current ? distMeters(current, { lat: found.lat, lon: found.lon }) : Infinity;
        const patch: any = { geocoding_status: found.status, geocoding_provider: "google" };
        if (found.postalLat != null && found.postalLon != null) {
          patch.postal_latitude = found.postalLat; patch.postal_longitude = found.postalLon;
        }
        if (found.formattedAddress) patch.formatted_address = found.formattedAddress;
        if (found.placeId) patch.place_id = found.placeId;
        if (found.locationType) patch.location_type = found.locationType;
        // Google = source de vérité : on remplace toujours les anciennes coords
        // Nominatim, qui étaient souvent imprécises.
        if (!current || drift > 50) {
          patch.latitude = found.lat; patch.longitude = found.lon;
          const { error } = await supabase.from("submissions").update(patch).eq("id", s.id);
          if (!error) {
            updated++;
            setSubmissions((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...patch } : x)));
          }
        } else {
          await supabase.from("submissions").update(patch).eq("id", s.id);
          setSubmissions((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...patch } : x)));
          unchanged++;
        }
      }
      setRechecking({ done: i + 1, total: targets.length });
      await new Promise((r) => setTimeout(r, 250));
    }
    setRechecking(null);
    toast({
      title: "Vérification terminée",
      description: `${updated} corrigée(s) · ${unchanged} déjà OK · ${notFound} introuvable(s).`,
    });
  };

  const handleLogout = async () => { await supabase.auth.signOut(); navigate("/login"); };

  const downloadCSV = (filename: string, cols: string[], rowsData: any[]) => {
    const escape = (v: any) => {
      if (v == null) return "";
      const s = Array.isArray(v) ? v.join("|") : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows = [cols.join(",")];
    for (const s of rowsData) rows.push(cols.map((c) => escape(s[c])).join(","));
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const exportCSVAdmin = () => {
    const cols = [
      "submission_number","created_at","name","phone","email","address","postal_code",
      "materials","request_type","property_type","quantity","tonnage","accessibility",
      "machinery_available","machinery_description","description",
      "status","priority","internal_notes","assigned_entrepreneur","visible_to_entrepreneur",
    ];
    downloadCSV("vracquebec-admin", cols, filtered);
  };

  const exportCSVEntrepreneur = () => {
    const cols = [
      "submission_number","request_type","materials","quantity","tonnage",
      "accessibility","postal_prefix","latitude","longitude","status",
    ];
    const data = filtered
      .filter((s: any) => s.visible_to_entrepreneur !== false)
      .map((s: any) => ({
        ...s,
        postal_prefix: (s.postal_code || "").slice(0, 3),
        latitude: s.latitude != null ? Math.round(s.latitude * 100) / 100 : null,
        longitude: s.longitude != null ? Math.round(s.longitude * 100) / 100 : null,
      }));
    downloadCSV("vracquebec-entrepreneur", cols, data);
  };

  const filtered = useMemo(() => {
    const norm = (v: any) => (v ?? "").toString().toLowerCase();
    const normPhone = (v: any) => (v ?? "").toString().replace(/\D/g, "");
    const q = searchQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    const list = submissions.filter((s) => {
      if (filterStatus !== "all" && s.status !== filterStatus) return false;
      if (filterType !== "all" && normalizeRequestType(s.request_type) !== filterType) return false;
      if (filterSource !== "all" && (s.lead_source || "") !== filterSource) return false;
      if (filterPriority !== "all" && (s.priority || "normal") !== filterPriority) return false;
      if (filterAssigned !== "all") {
        if (filterAssigned === "none") { if (s.assigned_entrepreneur) return false; }
        else if (s.assigned_entrepreneur !== filterAssigned) return false;
      }
      if (filterMaterial !== "all" && !(s.materials || []).includes(filterMaterial)) return false;
      if (filterDateFrom) {
        if (new Date(s.created_at) < new Date(filterDateFrom + "T00:00:00")) return false;
      }
      if (filterDateTo) {
        if (new Date(s.created_at) > new Date(filterDateTo + "T23:59:59")) return false;
      }
      if (filterTrips !== "all") {
        const trips = parseEstimatedTrips(s.quantity);
        if (trips == null) return false;
        switch (filterTrips) {
          case "1-5":   if (trips < 1 || trips > 5) return false; break;
          case "5-10":  if (trips < 5 || trips > 10) return false; break;
          case "10-25": if (trips < 10 || trips > 25) return false; break;
          case "25-50": if (trips < 25 || trips > 50) return false; break;
          case "50-100": if (trips < 50 || trips > 100) return false; break;
          case "100+":  if (trips < 100) return false; break;
        }
      }
      if (!q) return true;
      const haystack = [s.dompe_number, s.name, s.address, s.postal_code, s.email]
        .map(norm)
        .join(" | ");
      if (haystack.includes(q)) return true;
      if (qDigits && normPhone(s.phone).includes(qDigits)) return true;
      if (qDigits && normPhone(s.dompe_number).includes(qDigits)) return true;
      return false;
    });
    const dompeNum = (s: Submission) => {
      const m = (s.dompe_number || "").match(/\d+/);
      return m ? parseInt(m[0], 10) : NaN;
    };
    const sorted = [...list].sort((a, b) => {
      const na = dompeNum(a);
      const nb = dompeNum(b);
      const aHas = !isNaN(na);
      const bHas = !isNaN(nb);
      if (aHas && bHas) return na - nb;
      if (aHas) return -1;
      if (bHas) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    if (sortTrips === "trips-desc") {
      sorted.sort((a, b) => {
        const ta = parseEstimatedTrips(a.quantity) ?? -1;
        const tb = parseEstimatedTrips(b.quantity) ?? -1;
        return tb - ta;
      });
    } else if (sortTrips === "trips-asc") {
      sorted.sort((a, b) => {
        const ta = parseEstimatedTrips(a.quantity) ?? Number.MAX_SAFE_INTEGER;
        const tb = parseEstimatedTrips(b.quantity) ?? Number.MAX_SAFE_INTEGER;
        return ta - tb;
      });
    }
    return sorted;
  }, [submissions, filterStatus, filterType, filterSource, searchQuery, filterTrips, sortTrips, filterPriority, filterAssigned, filterMaterial, filterDateFrom, filterDateTo]);

  if (!authReady || !user || roleLoading) {
    return <FullPageState title="Connexion en cours" message="Votre session est en vérification, la page va s’ouvrir automatiquement." />;
  }
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Accès refusé.</p>
          <button onClick={handleLogout} className="text-primary underline">Se déconnecter</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <nav className="sticky-below-nav z-50 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
            <span className="font-display font-bold text-base sm:text-xl text-foreground">
              Vrac<span className="text-primary">Québec</span>
            </span>
            <span className="ml-2 px-2 py-0.5 rounded text-[10px] sm:text-xs bg-primary/10 text-primary font-display font-semibold hidden sm:inline">Admin CRM</span>
          </div>

          {/* Desktop nav */}
          <div className="hidden lg:flex flex-wrap items-center gap-x-3 gap-y-1 justify-end">
            <Link to="/admin/business-intelligence" className="flex items-center gap-1.5 text-sm text-primary hover:opacity-80 font-body font-semibold">
              <TrendingUp className="w-4 h-4" /> BI
            </Link>
            <Link to="/admin/calendrier" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-body">
              <CalendarDays className="w-4 h-4" /> Calendrier
            </Link>
            <Link to="/admin/flotte" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-body">
              <Truck className="w-4 h-4" /> Flotte
            </Link>
            <Link to="/admin/demandes-acces" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-body">
              <Truck className="w-4 h-4" /> Demandes d'accès
            </Link>
            <Link to="/admin/blogue" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-body">
              <BookOpenIcon className="w-4 h-4" /> Blogue
            </Link>
            <Link to="/admin/liste-noire" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-body">
              <Ban className="w-4 h-4" /> Liste noire
            </Link>
            <Link to="/admin/seo" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-body">
              <MapPin className="w-4 h-4" /> SEO
            </Link>
            <button onClick={() => setShowUsers(true)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-body">
              <Users className="w-4 h-4" /> Entrepreneurs
            </button>
            <Link to="/admin/settings" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-body">
              <Settings className="w-4 h-4" /> Paramètres
            </Link>
            <NotificationBell />
            <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-body">
              <LogOut className="w-4 h-4" /> Déconnexion
            </button>
          </div>

          {/* Mobile : cloche + hamburger */}
          <div className="lg:hidden flex items-center -mr-2">
            <NotificationBell />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button className="p-2 rounded-md hover:bg-secondary/80" aria-label="Menu">
                <Menu className="w-5 h-5 text-foreground" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[86%] max-w-xs sm:max-w-sm safe-bottom">
              <SheetTitle className="sr-only">Menu de navigation</SheetTitle>
              <div className="flex flex-col gap-1 mt-6">
                <div className="px-3 py-2 text-xs font-display font-bold uppercase text-muted-foreground tracking-wide">Navigation</div>
                <button onClick={() => { setTab("leads"); setMobileOpen(false); }} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-body ${tab === "leads" ? "bg-primary text-primary-foreground font-semibold" : "text-foreground hover:bg-secondary"}`}>
                  <List className="w-4 h-4" /> Demandes (CRM)
                </button>
                <button onClick={() => { setTab("billing"); setMobileOpen(false); }} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-body ${tab === "billing" ? "bg-primary text-primary-foreground font-semibold" : "text-foreground hover:bg-secondary"}`}>
                  <DatabaseIcon className="w-4 h-4" /> Facturation
                </button>
                <button onClick={() => { setTab("entrepreneurs"); setMobileOpen(false); }} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-body ${tab === "entrepreneurs" ? "bg-primary text-primary-foreground font-semibold" : "text-foreground hover:bg-secondary"}`}>
                  <Users className="w-4 h-4" /> Entrepreneurs
                </button>
                <button onClick={() => { setShowUsers(true); setMobileOpen(false); }} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-body text-foreground hover:bg-secondary">
                  <Settings className="w-4 h-4" /> Gestion entrepreneurs
                </button>
                <Link to="/admin/calendrier" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-body text-foreground hover:bg-secondary">
                  <CalendarDays className="w-4 h-4" /> Calendrier
                </Link>
                <Link to="/admin/flotte" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-body text-foreground hover:bg-secondary">
                  <Truck className="w-4 h-4" /> Gestion de la flotte
                </Link>
                <Link to="/admin/business-intelligence" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-body text-primary font-semibold hover:bg-secondary">
                  <TrendingUp className="w-4 h-4" /> Business Intelligence
                </Link>
                <Link to="/admin/demandes-acces" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-body text-foreground hover:bg-secondary">
                  <Truck className="w-4 h-4" /> Demandes d'accès aux dompes
                </Link>
                <Link to="/admin/blogue" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-body text-foreground hover:bg-secondary">
                  <BookOpenIcon className="w-4 h-4" /> Blogue
                </Link>
                <Link to="/admin/liste-noire" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-body text-foreground hover:bg-secondary">
                  <Ban className="w-4 h-4" /> Liste noire
                </Link>
                <Link to="/admin/seo" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-body text-foreground hover:bg-secondary">
                  <MapPin className="w-4 h-4" /> SEO
                </Link>
                <Link to="/admin/donnees" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-body text-foreground hover:bg-secondary">
                  <DatabaseIcon className="w-4 h-4" /> Données
                </Link>
                <Link to="/admin/settings" onClick={() => setMobileOpen(false)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-body text-foreground hover:bg-secondary">
                  <Settings className="w-4 h-4" /> Paramètres
                </Link>
                <div className="border-t border-border my-2" />
                <button onClick={() => { setMobileOpen(false); handleLogout(); }} className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-body text-muted-foreground hover:text-foreground hover:bg-secondary">
                  <LogOut className="w-4 h-4" /> Déconnexion
                </button>
              </div>
            </SheetContent>
          </Sheet>
          </div>
        </div>
      </nav>

      <TransportBanner />

      <main className="container mx-auto px-4 sm:px-6 py-8">
        
        <div className="flex flex-wrap gap-2 mb-5">
          <button onClick={() => setTab("leads")}
            className={`px-4 py-2 rounded-lg text-sm font-display font-semibold ${tab === "leads" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
            Demandes (CRM)
          </button>
          <button onClick={() => setTab("billing")}
            className={`px-4 py-2 rounded-lg text-sm font-display font-semibold ${tab === "billing" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
            Facturation
          </button>
          <button onClick={() => setTab("entrepreneurs")}
            className={`px-4 py-2 rounded-lg text-sm font-display font-semibold ${tab === "entrepreneurs" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
            Entrepreneurs
          </button>
        </div>

        {tab === "entrepreneurs" ? (
          <EntrepreneursAdmin />
        ) : tab === "billing" ? (
          <>
            <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-5">Facturation et paiements</h1>
            <BillingOverview onOpenLead={(id) => { setTab("leads"); setExpanded(id); }} />
          </>
        ) : (
        <>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
              Demandes ({filtered.length})
            </h1>
            {REQUEST_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setFilterType(filterType === t.value ? "all" : t.value)}
                title={`Afficher uniquement les demandes ${t.label}`}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-display font-bold border transition-all ${filterType === t.value ? t.color : "bg-card text-muted-foreground border-border hover:border-foreground/30"}`}
              >
                {t.label} : {filtered.filter((s) => normalizeRequestType(s.request_type) === t.value).length}
              </button>
            ))}
          </div>
          <div className="grid w-full grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center [&>*]:justify-center sm:[&>*]:justify-start">
            <div className="flex bg-secondary rounded-lg p-0.5">
              <button onClick={() => setView("list")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-display font-semibold ${view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                <List className="w-4 h-4" /> Liste
              </button>
              <button onClick={() => setView("map")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-display font-semibold ${view === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                <Map className="w-4 h-4" /> Carte
              </button>
            </div>
            <button
              onClick={() => setShowNewLead(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold hover:opacity-90"
            >
              <Plus className="w-4 h-4" /> Ajouter un Lead
            </button>
            <button
              onClick={geocodeMissing}
              disabled={!!geocoding}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-display font-semibold hover:opacity-90 disabled:opacity-60"
            >
              <MapPin className="w-4 h-4" />
              {geocoding
                ? `Géocodage ${geocoding.done}/${geocoding.total}…`
                : "Géocoder adresses"}
            </button>
            <button
              onClick={recheckAllAddresses}
              disabled={!!rechecking || !!geocoding}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold hover:opacity-90 disabled:opacity-60"
              title="Re-vérifie toutes les adresses et corrige celles mal positionnées (>250 m d'écart)"
            >
              <MapPin className="w-4 h-4" />
              {rechecking
                ? `Vérification ${rechecking.done}/${rechecking.total}…`
                : "Re-vérifier adresses"}
            </button>
            <button onClick={exportCSVAdmin} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-sm font-display font-semibold hover:opacity-90">
              <Download className="w-4 h-4" /> CSV admin
            </button>
            <button onClick={exportCSVEntrepreneur} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground border border-border text-sm font-display font-semibold hover:opacity-90">
              <Download className="w-4 h-4" /> CSV entrepreneur
            </button>
            <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-display font-semibold hover:opacity-90">
              <Upload className="w-4 h-4" /> Importer CSV
            </button>
            <button onClick={() => setShowSheetImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-display font-semibold hover:opacity-90">
              <Upload className="w-4 h-4" /> Importer Google Sheet
            </button>
            <button onClick={() => setShowExcelImport(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-sm font-display font-semibold hover:opacity-90">
              <Upload className="w-4 h-4" /> Importer Excel (.xlsx)
            </button>
            <Link to="/admin/donnees" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground border border-border text-sm font-display font-semibold hover:opacity-90">
              <DatabaseIcon className="w-4 h-4" /> Données importées
            </Link>
            <Link to="/admin/crm" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold hover:opacity-90">
              <Users className="w-4 h-4" /> CRM unifié
            </Link>
            <Link to="/admin/operations" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold hover:opacity-90">
              <Truck className="w-4 h-4" /> Opérations
            </Link>
            <Link to="/admin/jsc" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground border border-border text-sm font-display font-semibold hover:opacity-90">
              <Settings className="w-4 h-4" /> Paramètres plateforme
            </Link>
            <Link to="/admin/configuration-soumissions" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground border border-border text-sm font-display font-semibold hover:opacity-90">
              <Settings className="w-4 h-4" /> Configuration des soumissions
            </Link>
            <Link to="/admin/centre-operations" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-sm font-display font-semibold hover:opacity-90">
              <Truck className="w-4 h-4" /> Centre des Opérations
            </Link>
            <Link to="/admin/intelligence" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold hover:opacity-90">
              <TrendingUp className="w-4 h-4" /> Intelligence d'affaires
            </Link>
            <Link to="/admin/direction" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold hover:opacity-90">
              <TrendingUp className="w-4 h-4" /> Direction
            </Link>
            <Link to="/admin/supervision" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground border border-border text-sm font-display font-semibold hover:opacity-90">
              <Activity className="w-4 h-4" /> Supervision
            </Link>
            <button onClick={fetchSubmissions} className="text-sm text-primary hover:underline font-body">Actualiser</button>
            <button onClick={() => setShowStatusManager(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground border border-border text-sm font-display font-semibold hover:opacity-90">
              <Settings className="w-4 h-4" /> Statuts
            </button>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap [&>select]:w-full sm:[&>select]:w-auto">
          <div className="relative col-span-full min-w-0 max-w-full sm:max-w-md sm:flex-1 sm:min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher : nom, téléphone, adresse, # dompe…"
              className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-border bg-card font-body focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Effacer la recherche"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-lg leading-none px-1"
              >
                ×
              </button>
            )}
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-border bg-card font-body max-w-full min-w-0">
            <option value="all">Tous statuts</option>
            {leadStatuses.map((s) => <option key={s.id} value={s.value}>{s.label}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-border bg-card font-body max-w-full min-w-0">
            <option value="all">Tous types</option>
            {REQUEST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-border bg-card font-body max-w-full min-w-0">
            <option value="all">Toutes sources</option>
            {LEAD_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={filterTrips} onChange={(e) => setFilterTrips(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-border bg-card font-body max-w-full min-w-0">
            <option value="all">Tous voyages</option>
            <option value="1-5">1 à 5 voyages</option>
            <option value="5-10">5 à 10 voyages</option>
            <option value="10-25">10 à 25 voyages</option>
            <option value="25-50">25 à 50 voyages</option>
            <option value="50-100">50 à 100 voyages</option>
            <option value="100+">100+ voyages</option>
          </select>
          <select value={sortTrips} onChange={(e) => setSortTrips(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-border bg-card font-body max-w-full min-w-0">
            <option value="default">Trier par…</option>
            <option value="trips-desc">Plus grand nombre de voyages</option>
            <option value="trips-asc">Plus petit nombre de voyages</option>
          </select>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-border bg-card font-body max-w-full min-w-0">
            <option value="all">Toutes priorités</option>
            {LEAD_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select value={filterMaterial} onChange={(e) => setFilterMaterial(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-border bg-card font-body max-w-full min-w-0">
            <option value="all">Tous matériaux</option>
            {MATERIAL_TYPES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <select value={filterAssigned} onChange={(e) => setFilterAssigned(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-border bg-card font-body max-w-full min-w-0">
            <option value="all">Tous entrepreneurs</option>
            <option value="none">— Non assigné —</option>
            {entrepreneursList.map((e) => <option key={e.user_id} value={e.user_id}>{e.email}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Du
            <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="px-2 py-1 text-xs rounded-lg border border-border bg-card font-body" />
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            Au
            <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="px-2 py-1 text-xs rounded-lg border border-border bg-card font-body" />
          </label>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : view === "map" ? (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground font-body">
              <span>💡 Glissez une pin pour corriger sa position.</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{ background: "#8B4513" }} /> Terre</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{ background: "#eab308" }} /> Sable</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{ background: "#6b7280" }} /> Gravier</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{ background: "#2563eb" }} /> Béton</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{ background: "#0a0a0a" }} /> Asphalte</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{ background: "#16a34a" }} /> Remblai</span>
              <label className="inline-flex items-center gap-2 ml-auto cursor-pointer select-none">
                <Switch
                  checked={showArchivedOnMap}
                  onCheckedChange={setShowArchivedOnMap}
                />
                <span className="text-xs font-medium text-foreground">Afficher les leads archivés sur la map</span>
              </label>
            </div>
            <AdminMap
              submissions={filtered as any}
              showInactive={showArchivedOnMap}
              leadStatuses={leadStatuses}
              onStatusChange={(id, s) => updateStatus(id, s)}
              onMove={async (id, lat, lon) => {
                const { error } = await supabase
                  .from("submissions")
                  .update({ latitude: lat, longitude: lon })
                  .eq("id", id);
                if (error) {
                  toast({ title: "Erreur", description: error.message, variant: "destructive" });
                  return;
                }
                setSubmissions((prev) =>
                  prev.map((x) => (x.id === id ? { ...x, latitude: lat, longitude: lon } : x))
                );
                toast({ title: "Position enregistrée" });
              }}
            />
          </>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20"><p className="text-muted-foreground font-body">Aucune demande.</p></div>
        ) : (
          <div className="space-y-3">
            {filtered.map((sub) => (
              <LeadCard
                key={sub.id}
                sub={sub}
                expanded={expanded === sub.id}
                onToggle={() => setExpanded(expanded === sub.id ? null : sub.id)}
                onStatusChange={(s) => updateStatus(sub.id, s)}
                onUpdate={(patch) => updateField(sub.id, patch)}
                onDelete={() => handleDelete(sub.id)}
                onArchive={() => archive(sub.id)}
                userEmail={user.email || ""}
                leadStatuses={leadStatuses}
              />
            ))}
          </div>
        )}
        </>
        )}
      </main>

      {showUsers && <UsersModal onClose={() => setShowUsers(false)} />}
      {showImport && <CsvImportModal onClose={() => setShowImport(false)} onImported={fetchSubmissions} />}
      {showSheetImport && <GoogleSheetImportModal onClose={() => setShowSheetImport(false)} onImported={fetchSubmissions} />}
      {showExcelImport && <ExcelImportModal onClose={() => setShowExcelImport(false)} onImported={fetchSubmissions} />}
      {showStatusManager && <StatusManagerModal onClose={() => setShowStatusManager(false)} />}
      <NewLeadModal
        open={showNewLead}
        onClose={() => setShowNewLead(false)}
        onCreated={() => { fetchSubmissions(); }}
      />

      {/* Mobile FAB */}
      <button
        type="button"
        aria-label="Ajouter un Lead"
        onClick={() => setShowNewLead(true)}
        style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
        className="md:hidden fixed right-4 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 active:scale-95 transition"
      >
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
};

const StatusBadgePicker = ({
  status, statuses, onChange,
}: { status: string; statuses: LeadStatus[]; onChange: (v: string) => void }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const s = findStatus(statuses, status);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-display font-bold uppercase cursor-pointer hover:opacity-90"
        style={{ backgroundColor: s.color, color: s.text_color }}
        title="Changer le statut"
      >
        {s.label} <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute z-30 left-0 mt-1 bg-card border border-border rounded-lg shadow-lg p-1 min-w-[180px] max-h-72 overflow-auto">
          {statuses.filter((x) => x.enabled || x.value === status).map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onChange(x.value); }}
              className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-display font-bold uppercase mb-0.5 ${x.value === status ? "" : "hover:bg-secondary"}`}
              style={x.value === status ? { backgroundColor: x.color, color: x.text_color } : undefined}
            >
              {x.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const TypeBadgePicker = ({
  type, onChange,
}: { type: string; onChange: (v: string) => void }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const t = requestTypeMeta(type);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-display font-bold border cursor-pointer hover:opacity-90 ${t.color}`}
        title="Changer le type"
      >
        {t.label} <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute z-30 left-0 mt-1 bg-card border border-border rounded-lg shadow-lg p-1 min-w-[180px]">
          {REQUEST_TYPES.map((x) => (
            <button
              key={x.value}
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onChange(x.value); }}
              className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-display font-bold border mb-0.5 ${x.value === normalizeRequestType(type) ? x.color : "bg-card text-muted-foreground border-border hover:border-foreground/30"}`}
            >
              {x.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const LeadSection = ({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 bg-secondary/40 text-left"
      >
        <span className="text-xs font-display font-bold uppercase tracking-wide text-foreground">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>
      {open && <div className="p-3 sm:p-4 space-y-3 min-w-0">{children}</div>}
    </section>
  );
};

interface CardProps {
  sub: Submission;
  expanded: boolean;
  onToggle: () => void;
  onStatusChange: (s: string) => void;
  onUpdate: (patch: Partial<Submission>) => void;
  onDelete: () => void;
  onArchive: () => void;
  userEmail: string;
  leadStatuses: LeadStatus[];
}

const LeadCard = ({ sub, expanded, onToggle, onStatusChange, onUpdate, onDelete, onArchive, userEmail, leadStatuses }: CardProps) => {
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [internalDraft, setInternalDraft] = useState(sub.internal_notes || "");
  const [entrepreneurs, setEntrepreneurs] = useState<{ user_id: string; email: string }[]>([]);
  const cardNavigate = useNavigate();
  const [validating, setValidating] = useState(false);
  const [validatedAt, setValidatedAt] = useState<string | null>(sub.site_validated_at ?? null);
  const [linkedTransport, setLinkedTransport] = useState<LinkedTransportRequest | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Validation admin du site sélectionné : UPDATE idempotent sur CETTE demande.
  const onValidateSite = async () => {
    if (validating) return; // double clic → une seule validation
    setValidating(true);
    const res = await validateSelectedSite(sub.id, { hasSelection: !!sub.selected_site_id });
    setValidating(false);
    if (res.ok !== true) {
      toast({ title: "Validation impossible", description: res.message, variant: "destructive" });
      return;
    }
    setValidatedAt(res.validated.validatedAt);
    toast({ title: "Site validé", description: res.validated.siteLabel || "Site confirmé pour cette demande." });
  };

  const goToTransportRequest = () => {
    if (linkedTransport) {
      // La relation en base est la source de vérité : on rouvre la demande
      // existante au lieu d'en créer une nouvelle.
      cardNavigate(`/demande-transport?submission=${sub.id}`);
      return;
    }
    const prefill = buildTransportPrefill(sub as unknown as TransportPrefillSource);
    cardNavigate("/demande-transport", { state: { vqPrefill: prefill } });
  };

  // Rattachement submission → demande de transport (relu depuis la DB).
  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    fetchLinkedTransportRequest(sub.id).then((row) => {
      if (!cancelled) setLinkedTransport(row);
    });
    return () => { cancelled = true; };
  }, [expanded, sub.id, validatedAt]);

  useEffect(() => {
    if (expanded && cardRef.current) {
      const timer = setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [expanded]);

  useEffect(() => { setInternalDraft(sub.internal_notes || ""); }, [sub.internal_notes]);

  useEffect(() => {
    if (!expanded) return;
    supabase.rpc("list_users_with_roles").then(({ data }) => {
      const list = ((data as any) || [])
        .filter((u: any) => (u.roles || []).includes("entrepreneur"))
        .map((u: any) => ({ user_id: u.user_id, email: u.email }));
      setEntrepreneurs(list);
    });
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    supabase.from("lead_notes").select("*").eq("submission_id", sub.id).order("created_at", { ascending: false })
      .then(({ data }) => setNotes((data as any) || []));
  }, [expanded, sub.id]);

  const addNote = async () => {
    if (!newNote.trim()) return;
    setSavingNote(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data, error } = await supabase.from("lead_notes").insert({
      submission_id: sub.id, author_id: session.user.id, author_email: userEmail, note: newNote.trim(),
    }).select().single();
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else { setNotes((prev) => [data as any, ...prev]); setNewNote(""); }
    setSavingNote(false);
  };

  const phoneClean = (sub.phone || "").replace(/\D/g, "");
  const mapsUrl = sub.latitude && sub.longitude
    ? `https://www.google.com/maps?q=${sub.latitude},${sub.longitude}`
    : `https://www.google.com/maps?q=${encodeURIComponent(`${sub.address} ${sub.postal_code || ""}`)}`;

  return (
    <div ref={cardRef} className="bg-card rounded-xl border border-border overflow-hidden" style={{ boxShadow: "var(--shadow-sm)" }}>
      <button onClick={onToggle} className="w-full px-4 sm:px-5 py-4 flex items-center justify-between text-left gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {sub.dompe_number ? (
              <span className="text-xs font-display font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{sub.dompe_number}</span>
            ) : null}
            <span className="font-display font-bold text-foreground">{sub.name}</span>
            <StatusBadgePicker status={sub.status} statuses={leadStatuses} onChange={(v) => onStatusChange(v)} />
            <TypeBadgePicker type={sub.request_type} onChange={(v) => {
              const updates: any = { request_type: v };
              updates.visible_to_entrepreneur = v === "remblai";
              onUpdate(updates);
            }} />
            {(() => {
              const svc = serviceTypeMeta((sub as unknown as { service_type?: string | null }).service_type);
              return svc ? (
                <span className={`px-2 py-0.5 rounded text-[11px] font-display font-bold border ${svc.color}`}>
                  {svc.label}
                </span>
              ) : null;
            })()}
            {(() => {
              const trips = parseEstimatedTrips(sub.quantity);
              return trips != null ? (
                <span className="text-[10px] font-display font-bold px-2 py-0.5 rounded bg-emerald-600/10 text-emerald-700 border border-emerald-600/20">
                  {trips} voyage{trips > 1 ? "s" : ""}
                </span>
              ) : null;
            })()}
            {(() => {
              if (normalizeRequestType(sub.request_type) !== "remblai") return null;
              const n = siteGaps(sub).length;
              return n > 0 ? (
                <span className="text-[10px] font-display font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 border border-amber-500/30">
                  Fiche site incomplète ({n})
                </span>
              ) : null;
            })()}
          </div>
          <p className="text-xs text-muted-foreground font-body truncate">
            {formatDate(sub.created_at)} • {getMaterialLabels(sub.materials)} • {sub.address}
          </p>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="px-3 sm:px-5 pb-5 border-t border-border pt-4 space-y-4 min-w-0">
          {/* 1. Résumé du lead */}
          <div className="rounded-xl border border-border bg-secondary/30 p-3 sm:p-4">
            <div className="text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-2">Résumé du lead</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 text-xs font-body min-w-0">
              <D label="Numéro" v={sub.submission_number ? `#${sub.submission_number}` : "Non renseigné"} />
              <D label="Client" v={sub.name || "Non renseigné"} />
              <D label="Type de demande" v={requestTypeMeta(sub.request_type)?.label || sub.request_type || "Non renseigné"} />
              <D label="Matériau principal" v={getMaterialLabels(sub.materials || []) || sub.other_material || "Non renseigné"} />
              <D label="Voyages" v={sub.quantity || "Non renseigné"} />
              <D label="Transport" v={sub.quote_truck || "Non renseigné"} />
              <D label="Dompe / site" v={sub.selected_site_label || sub.dompe_number || "Aucun site sélectionné"} />
              <D label="Priorité" v={LEAD_PRIORITIES.find((x) => x.value === sub.priority)?.label || sub.priority || "Non renseigné"} />
              <D label="Créé le" v={formatDate(sub.created_at)} />
              <D label="Dernière modification" v={(sub as unknown as { updated_at?: string | null }).updated_at ? formatDate((sub as unknown as { updated_at: string }).updated_at) : "Non renseigné"} />
              <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-2 pt-1">
                <span className="text-muted-foreground">Statut :</span>
                <StatusBadgePicker status={sub.status} statuses={leadStatuses} onChange={(v) => onStatusChange(v)} />
              </div>
            </div>
          </div>
          <LeadSection title="Client et coordonnées" defaultOpen={true}>
            <div className="text-[10px] text-muted-foreground italic">Sauvegarde automatique à chaque modification.</div>
          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            {sub.phone && (
              <>
                <a href={`tel:${phoneClean}`} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold"><Phone className="w-3.5 h-3.5" /> Appeler</a>
                <a href={`sms:${phoneClean}`} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-display font-semibold"><MessageSquare className="w-3.5 h-3.5" /> SMS</a>
                <a href={`https://wa.me/1${phoneClean}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#25D366] text-white text-xs font-display font-semibold">🟢 WhatsApp</a>
              </>
            )}
            <a href={`mailto:${sub.email}`} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-display font-semibold"><Mail className="w-3.5 h-3.5" /> Courriel</a>
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-display font-semibold"><MapPin className="w-3.5 h-3.5" /> Carte</a>
            <Link to={`/admin/calendrier?from_submission=${sub.id}`} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold">
              <CalendarDays className="w-3.5 h-3.5" /> Planifier au calendrier
            </Link>
            <button onClick={onArchive} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-display font-semibold"><Archive className="w-3.5 h-3.5" /> Archiver</button>
          </div>
            {/* Contact */}
            <div className="bg-secondary/30 rounded-lg p-3 mb-3">
              <div className="text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-2">Contact</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <InlineField label="Nom du client" type="text" value={sub.name || ""} onSave={(v) => onUpdate({ name: v })} />
                <InlineField label="Téléphone" type="tel" value={sub.phone || ""} onSave={(v) => onUpdate({ phone: v })} />
                <InlineField label="Courriel" type="email" value={sub.email || ""} onSave={(v) => onUpdate({ email: v })} />
                <InlineField label="Adresse" type="text" value={sub.address || ""} onSave={(v) => onUpdate({ address: v })} />
                <InlineField label="Code postal" type="text" value={sub.postal_code || ""} onSave={(v) => onUpdate({ postal_code: v })} />
              </div>
            </div>
          </LeadSection>
          <LeadSection title="Demande et projet" defaultOpen={true}>
            {/* Matériaux & projet */}
            <div className="bg-secondary/30 rounded-lg p-3 mb-3">
              <div className="text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-2">Matériaux et projet</div>
              <div className="grid grid-cols-1 gap-3">
                <InlineField
                  label="Matériaux"
                  type="multiselect"
                  value={sub.materials || []}
                  options={MATERIAL_TYPES.map((m) => ({ value: m.id, label: m.label }))}
                  onSave={(v) => onUpdate({ materials: v })}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InlineField label="Autre matériau" type="text" value={sub.other_material || ""} onSave={(v) => onUpdate({ other_material: v })} />
                  <InlineField
                    label="Type de projet"
                    type="select"
                    value={sub.property_type || ""}
                    allowEmpty
                    options={PROJECT_TYPES.map((p) => ({ value: p.value, label: p.value }))}
                    onSave={(v) => onUpdate({ property_type: v })}
                  />
                  <InlineField label="Voyages" type="text" value={sub.quantity || ""} onSave={(v) => onUpdate({ quantity: v })} />
                  <InlineField label="Tonnage" type="text" value={sub.tonnage || ""} onSave={(v) => onUpdate({ tonnage: v })} />
                  <InlineField
                    label="Livrer / Sortir"
                    type="select"
                    value={sub.deliver_or_remove || ""}
                    allowEmpty
                    options={DELIVER_OR_REMOVE_OPTIONS.map((o) => ({ value: o, label: o }))}
                    onSave={(v) => onUpdate({ deliver_or_remove: v || null })}
                  />
                  <InlineField
                    label="Contamination"
                    type="select"
                    value={sub.contamination || ""}
                    allowEmpty
                    options={CONTAMINATION_OPTIONS.map((o) => ({ value: o, label: o }))}
                    onSave={(v) => onUpdate({ contamination: v || null })}
                  />
                </div>
              </div>
            </div>
            {/* Notes client */}
            <div className="bg-secondary/30 rounded-lg p-3 mb-3">
              <InlineField
                label="Notes du client (description)"
                type="textarea"
                rows={3}
                value={sub.description || ""}
                onSave={(v) => onUpdate({ description: v || null })}
              />
            </div>
          {sub.photos && sub.photos.length > 0 && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-display font-semibold uppercase">Photos</label>
              <LeadPhotos photos={sub.photos} />
            </div>
          )}
          </LeadSection>
          <LeadSection title="Statut et suivi" defaultOpen={true}>
          {/* Status selector */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 font-display font-semibold uppercase">Statut du lead</label>
            <div className="flex flex-wrap gap-2">
              {leadStatuses.filter((s) => s.enabled || s.value === sub.status).map((s) => {
                const active = sub.status === s.value;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onStatusChange(s.value)}
                    style={active ? { backgroundColor: s.color, color: s.text_color, borderColor: "transparent" } : undefined}
                    className={`px-3 py-2 min-h-[36px] rounded-md text-[11px] font-display font-bold uppercase border transition-all touch-manipulation ${active ? "" : "bg-card text-muted-foreground border-border hover:border-foreground/30 active:bg-secondary"}`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Request type selector */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 font-display font-semibold uppercase">Type de demande</label>
            <div className="flex flex-wrap gap-1.5">
              {REQUEST_TYPES.map((t) => (
                <button key={t.value} onClick={() => {
                  const updates: any = { request_type: t.value };
                  updates.visible_to_entrepreneur = t.value === "remblai";
                  onUpdate(updates);
                }}
                  className={`px-2.5 py-1 rounded text-[11px] font-display font-bold border transition-all ${normalizeRequestType(sub.request_type) === t.value ? t.color : "bg-card text-muted-foreground border-border hover:border-foreground/30"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {/* Priority + visibility + assigned */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-display font-semibold uppercase">Priorité</label>
              <div className="flex gap-1.5">
                {LEAD_PRIORITIES.map((p) => (
                  <button key={p.value} onClick={() => onUpdate({ priority: p.value })}
                    className={`px-2.5 py-1 rounded text-[11px] font-display font-bold uppercase border transition-all ${sub.priority === p.value ? p.color + " border-transparent" : "bg-card text-muted-foreground border-border hover:border-foreground/30"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-display font-semibold uppercase">Entrepreneur assigné</label>
              <select value={sub.assigned_entrepreneur || ""}
                onChange={(e) => onUpdate({ assigned_entrepreneur: e.target.value || null })}
                className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background font-body">
                <option value="">— Aucun —</option>
                {entrepreneurs.map((e) => (
                  <option key={e.user_id} value={e.user_id}>{e.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-display font-semibold uppercase">Afficher sur carte entrepreneurs</label>
              <button onClick={() => onUpdate({ visible_to_entrepreneur: !sub.visible_to_entrepreneur })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-bold uppercase border ${sub.visible_to_entrepreneur ? "bg-emerald-600 text-white border-transparent" : "bg-card text-muted-foreground border-border"}`}>
                {sub.visible_to_entrepreneur ? <><Eye className="w-3.5 h-3.5" /> Oui</> : <><EyeOff className="w-3.5 h-3.5" /> Non</>}
              </button>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-display font-semibold uppercase">Afficher sur carte administration</label>
              <button onClick={() => onUpdate({ show_on_admin_map: !(sub.show_on_admin_map !== false) })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-bold uppercase border ${sub.show_on_admin_map !== false ? "bg-emerald-600 text-white border-transparent" : "bg-card text-muted-foreground border-border"}`}>
                {sub.show_on_admin_map !== false ? <><Eye className="w-3.5 h-3.5" /> Oui</> : <><EyeOff className="w-3.5 h-3.5" /> Non</>}
              </button>
            </div>
          </div>
          </LeadSection>
          <LeadSection title="Transport" defaultOpen={false}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 text-xs font-body min-w-0">
              <D label="Type de camion" v={sub.quote_truck || "Non renseigné"} />
              <D label="Nombre de voyages" v={sub.quote_trips != null ? String(sub.quote_trips) : (sub.quantity || "Non renseigné")} />
              <D label="Distance" v={sub.quote_distance_km != null ? `${sub.quote_distance_km} km` : "Non renseigné"} />
              <D label="Durée estimée" v={sub.quote_duration_minutes != null ? `${sub.quote_duration_minutes} min` : "Non renseigné"} />
              <D label="Camions acceptés" v={(sub.truck_types_allowed || []).join(", ") || "Non renseigné"} />
              <D label="Camions lourds" v={sub.access_heavy_truck || "Non renseigné"} />
              <D label="Accessibilité camion" v={(sub.accessibility || []).join(", ") || "Non renseigné"} />
              <D label="Demande de transport" v={linkedTransport ? (linkedTransport.requestNumber || linkedTransport.id.slice(0, 8)) : "Aucune"} />
            </div>

          </LeadSection>
          <LeadSection title="Livraison et accessibilité" defaultOpen={false}>
            {/* Dimensions & livraison */}
            <div className="bg-secondary/30 rounded-lg p-3 mb-3">
              <div className="text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-2">Dimensions et livraison</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <InlineField label="Longueur (pi)" type="text" value={sub.length_ft || ""} onSave={(v) => onUpdate({ length_ft: v || null })} />
                <InlineField label="Largeur (pi)" type="text" value={sub.width_ft || ""} onSave={(v) => onUpdate({ width_ft: v || null })} />
                <InlineField label="Profondeur (po)" type="text" value={sub.depth_in || ""} onSave={(v) => onUpdate({ depth_in: v || null })} />
                <InlineField label="Date limite" type="date" value={sub.delivery_deadline || ""} onSave={(v) => onUpdate({ delivery_deadline: v || null })} />
                <InlineField label="Délai souhaité" type="text" value={sub.delivery_timeframe || ""} onSave={(v) => onUpdate({ delivery_timeframe: v || null })} />
              </div>
              <div className="mt-3">
                <InlineField
                  label="Accessibilité camion"
                  type="multiselect"
                  value={sub.accessibility || []}
                  options={TRUCK_ACCESS_OPTIONS.map((o) => ({ value: o.value, label: o.value }))}
                  onSave={(v) => onUpdate({ accessibility: v })}
                />
              </div>
            </div>
          </LeadSection>
          <LeadSection title="Dompe / site" defaultOpen={false}>
            {/* Budget & machinerie */}
            {normalizeRequestType(sub.request_type) === "remblai" && (() => {
              const site: SiteLike = {
                materials: sub.materials ?? null,
                other_material: sub.other_material,
                truck_types_allowed: sub.truck_types_allowed ?? null,
                accessibility: sub.accessibility ?? null,
                access_heavy_truck: sub.access_heavy_truck ?? null,
                access_details: sub.access_details ?? null,
                availability_status: sub.availability_status ?? null,
                availability_updated_at: sub.availability_updated_at ?? null,
              };
              const info = availabilityInfo(site);
              const details = (sub.access_details ?? {}) as Record<string, unknown>;
              const activeRestrictions = ACCESS_RESTRICTION_OPTIONS
                .map((o) => o.key)
                .filter((k) => details[k] === true);
              const gaps = siteGaps(sub);
              const toConfirm = siteToConfirm(sub);
              return (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-3">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <div className="text-[10px] uppercase tracking-wide font-display font-bold text-foreground">
                      Fiche site (dompe) — visible par les entrepreneurs
                    </div>
                    <span className="text-[10px] font-body text-muted-foreground">{info.label} • {info.freshness}</span>
                    <button
                      type="button"
                      onClick={() => onUpdate({ availability_updated_at: new Date().toISOString() } as Partial<Submission>)}
                      className="ml-auto px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-display font-bold uppercase"
                    >
                      Confirmer la disponibilité aujourd'hui
                    </button>
                  </div>
                  {(gaps.length > 0 || toConfirm.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {gaps.map((g) => (
                        <span key={g} className="px-2 py-0.5 rounded text-[10px] font-body bg-destructive/10 text-destructive border border-destructive/30">
                          {g}
                        </span>
                      ))}
                      {toConfirm.map((g) => (
                        <span key={g} className="px-2 py-0.5 rounded text-[10px] font-body bg-muted text-muted-foreground border border-border">
                          {g} : à confirmer
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <InlineField
                      label="Statut de disponibilité"
                      type="select"
                      value={sub.availability_status || ""}
                      allowEmpty
                      options={SITE_AVAILABILITY_OPTIONS}
                      onSave={(v) => onUpdate({ availability_status: v || null } as Partial<Submission>)}
                    />
                    <InlineField
                      label="Capacité restante"
                      type="text"
                      value={sub.remaining_capacity || ""}
                      onSave={(v) => onUpdate({ remaining_capacity: v || null } as Partial<Submission>)}
                    />
                    <InlineField
                      label="Heures d'ouverture"
                      type="text"
                      value={sub.opening_hours || ""}
                      onSave={(v) => onUpdate({ opening_hours: v || null } as Partial<Submission>)}
                    />
                    <InlineField
                      label="Camions lourds acceptés"
                      type="select"
                      value={sub.access_heavy_truck || ""}
                      allowEmpty
                      options={[{ value: "oui", label: "Oui" }, { value: "non", label: "Non" }]}
                      onSave={(v) => onUpdate({ access_heavy_truck: v || null } as Partial<Submission>)}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    <InlineField
                      label="Types de camions acceptés"
                      type="multiselect"
                      value={sub.truck_types_allowed ?? []}
                      options={TRUCK_OPTIONS.map((t) => ({ value: t.key, label: t.label }))}
                      onSave={(v) => onUpdate({ truck_types_allowed: (v as string[]).length ? (v as string[]) : null } as Partial<Submission>)}
                    />
                    <InlineField
                      label="Restrictions d'accès réelles"
                      type="multiselect"
                      value={activeRestrictions}
                      options={ACCESS_RESTRICTION_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
                      onSave={(v) => {
                        const keys = v as string[];
                        const next: Record<string, unknown> = {};
                        Object.entries(details).forEach(([k, val]) => {
                          if (val !== true) next[k] = val; // conserve les notes texte existantes
                        });
                        keys.forEach((k) => { next[k] = true; });
                        onUpdate({ access_details: Object.keys(next).length ? next : null } as Partial<Submission>);
                      }}
                    />
                    <InlineField
                      label="Autre restriction (texte libre)"
                      type="text"
                      value={typeof details.autre === "string" ? (details.autre as string) : ""}
                      onSave={(v) => {
                        const next: Record<string, unknown> = { ...details };
                        if (v) next.autre = v; else delete next.autre;
                        onUpdate({ access_details: Object.keys(next).length ? next : null } as Partial<Submission>);
                      }}
                    />
                    <InlineField
                      label="Note de disponibilité (visible entrepreneurs)"
                      type="textarea"
                      rows={2}
                      value={sub.availability_note || ""}
                      onSave={(v) => onUpdate({ availability_note: v || null } as Partial<Submission>)}
                    />
                  </div>
                </div>
              );
            })()}
            {/* Sélection du comparateur — rattachée à cette demande (lecture seule) */}
            {!sub.selected_site_id ? (
              <div className="mb-3 rounded-lg border border-border bg-muted/30 p-3 text-xs font-body text-muted-foreground">
                <span className="font-display font-bold uppercase tracking-wide text-[10px]">Site non sélectionné</span>
                <div className="mt-1">L'entrepreneur n'a pas encore choisi de site pour cette demande. La validation du site est indisponible.</div>
              </div>
            ) : (
              <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs font-body text-foreground">
                <div className="mb-1.5 font-display text-[10px] font-bold uppercase tracking-wide text-primary">
                  Site sélectionné par l'entrepreneur
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  <div><span className="font-semibold">Site : </span>{sub.selected_site_label || "—"}</div>
                  <div><span className="font-semibold">Adresse du site : </span>{sub.selected_site_address || "—"}</div>
                  <div><span className="font-semibold">GPS du site : </span>
                    {sub.selected_site_latitude != null && sub.selected_site_longitude != null
                      ? `${sub.selected_site_latitude.toFixed(4)}, ${sub.selected_site_longitude.toFixed(4)}`
                      : "—"}</div>
                  <div><span className="font-semibold">Matériau : </span>{sub.quote_material || "—"}</div>
                  <div><span className="font-semibold">Quantité : </span>
                    {sub.quote_quantity != null ? `${sub.quote_quantity} ${sub.quote_unit || ""}`.trim() : "—"}</div>
                  <div><span className="font-semibold">Voyages : </span>{sub.quote_trips ?? "—"}</div>
                  <div><span className="font-semibold">Camion : </span>{sub.quote_truck || "—"}</div>
                  <div><span className="font-semibold">Distance : </span>
                    {sub.quote_distance_km != null ? `${sub.quote_distance_km} km` : "—"}</div>
                  <div><span className="font-semibold">Durée : </span>
                    {sub.quote_duration_minutes != null ? `${sub.quote_duration_minutes} min` : "—"}</div>
                  <div><span className="font-semibold">Mise à jour : </span>
                    {sub.selection_updated_at ? formatDate(sub.selection_updated_at) : "—"}</div>
                </div>

                {/* Action admin : valider le site puis poursuivre vers la demande de transport */}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-primary/20 pt-2">
                  {validatedAt ? (
                    <span className="inline-flex items-center rounded border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[11px] font-display font-semibold text-emerald-800">
                      Site validé le {formatDate(validatedAt)}
                    </span>
                  ) : (
                    <button
                      onClick={onValidateSite}
                      disabled={validating}
                      className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-display font-semibold text-primary-foreground disabled:opacity-60"
                    >
                      {validating ? "Validation…" : "Valider le site"}
                    </button>
                  )}
                  <button
                    onClick={goToTransportRequest}
                    disabled={!validatedAt}
                    className="rounded-lg border border-primary/40 px-3 py-1.5 text-[11px] font-display font-semibold text-primary disabled:opacity-50"
                  >
                    {linkedTransport ? "Ouvrir la demande de transport" : "Poursuivre la demande de transport"}
                  </button>
                </div>

                {/* Rattachement : Submission → Site sélectionné → Site validé → Demande de transport */}
                <div className="mt-2 border-t border-primary/20 pt-2 text-[11px] font-body">
                  <div className="font-display text-[10px] font-bold uppercase tracking-wide text-primary">
                    Demande de transport rattachée
                  </div>
                  {linkedTransport ? (
                    <div className="mt-1 space-y-0.5">
                      <div>
                        <span className="font-semibold">Numéro : </span>
                        {linkedTransport.requestNumber || linkedTransport.id.slice(0, 8)}
                        {linkedTransport.status ? ` — ${linkedTransport.status}` : ""}
                      </div>
                      <div>
                        <span className="font-semibold">Créée le : </span>
                        {linkedTransport.createdAt ? formatDate(linkedTransport.createdAt) : "—"}
                      </div>
                      <div className="text-muted-foreground">Rattachée à la demande #{sub.submission_number}</div>
                    </div>
                  ) : (
                    <div className="mt-1 text-muted-foreground">
                      Aucune demande de transport n'est encore rattachée à cette demande.
                    </div>
                  )}
                </div>
              </div>
            )}
          </LeadSection>
          <LeadSection title="Budget et machinerie" defaultOpen={false}>
            <div className="bg-secondary/30 rounded-lg p-3 mb-3">
              <div className="text-[10px] uppercase tracking-wide font-display font-bold text-muted-foreground mb-2">Budget et machinerie</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <InlineField label="Budget max" type="text" value={sub.budget_max || ""} onSave={(v) => onUpdate({ budget_max: v || null })} />
                <InlineField
                  label="Unité budget"
                  type="select"
                  value={sub.budget_unit || ""}
                  allowEmpty
                  options={[
                    { value: "$ / voyage", label: "$ / voyage" },
                    { value: "$ / tonne", label: "$ / tonne" },
                    { value: "$ total", label: "$ total" },
                  ]}
                  onSave={(v) => onUpdate({ budget_unit: v || null })}
                />
                <InlineField
                  label="Machinerie sur place"
                  type="boolean"
                  value={!!sub.machinery_available}
                  onSave={(v) => onUpdate({ machinery_available: v })}
                />
              </div>
              <div className="mt-3">
                <InlineField
                  label="Description machinerie"
                  type="textarea"
                  rows={2}
                  value={sub.machinery_description || ""}
                  onSave={(v) => onUpdate({ machinery_description: v || null })}
                />
              </div>
            </div>
          </LeadSection>
          <LeadSection title="Communication et historique" defaultOpen={false}>
            <div className="text-xs font-body text-muted-foreground">
              Dernier contact : {notes[0] ? formatDate(notes[0].created_at) : "Non renseigné"}
            </div>
          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            {sub.phone && (
              <>
                <a href={`tel:${phoneClean}`} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold"><Phone className="w-3.5 h-3.5" /> Appeler</a>
                <a href={`sms:${phoneClean}`} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-display font-semibold"><MessageSquare className="w-3.5 h-3.5" /> SMS</a>
                <a href={`https://wa.me/1${phoneClean}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#25D366] text-white text-xs font-display font-semibold">🟢 WhatsApp</a>
              </>
            )}
            <a href={`mailto:${sub.email}`} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-display font-semibold"><Mail className="w-3.5 h-3.5" /> Courriel</a>
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-display font-semibold"><MapPin className="w-3.5 h-3.5" /> Carte</a>
            <Link to={`/admin/calendrier?from_submission=${sub.id}`} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold">
              <CalendarDays className="w-3.5 h-3.5" /> Planifier au calendrier
            </Link>
            <button onClick={onArchive} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-display font-semibold"><Archive className="w-3.5 h-3.5" /> Archiver</button>
          </div>
            <div className="space-y-2 max-h-60 overflow-auto min-w-0">
              {notes.length === 0 && <p className="text-xs text-muted-foreground italic">Aucun échange enregistré.</p>}
              {notes.map((n) => (
                <div key={`comm-${n.id}`} className="text-sm bg-secondary/50 rounded-lg p-3 break-words">
                  <div className="text-[10px] text-muted-foreground font-display uppercase mb-1">
                    {formatDate(n.created_at)} {n.author_email && `• ${n.author_email}`}
                  </div>
                  <p className="font-body whitespace-pre-wrap">{n.note}</p>
                </div>
              ))}
            </div>

          </LeadSection>
          <LeadSection title="Facturation et paiements" defaultOpen={false}>
          {/* Facturation */}
          <BillingSection submissionId={sub.id} />
          </LeadSection>
          <LeadSection title="Notes internes" defaultOpen={false}>
          {/* Internal notes timeline */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 font-display font-semibold uppercase">Notes internes (privées)</label>
            <div className="mb-3">
              <textarea value={internalDraft} onChange={(e) => setInternalDraft(e.target.value)}
                placeholder="Bloc-notes libre (toujours visible sur ce lead)…"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background font-body resize-none mb-1.5" rows={2} />
              <button onClick={() => onUpdate({ internal_notes: internalDraft })}
                disabled={internalDraft === (sub.internal_notes || "")}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-foreground text-background text-xs font-display font-semibold disabled:opacity-40">
                <Save className="w-3.5 h-3.5" /> Enregistrer le bloc-notes
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)}
                placeholder="Ajouter une note horodatée à l'historique…"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-background font-body resize-none" rows={2} />
              <button onClick={addNote} disabled={savingNote || !newNote.trim()}
                className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold disabled:opacity-40 self-start">
                {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </button>
            </div>
            <div className="space-y-2 max-h-60 overflow-auto">
              {notes.length === 0 && <p className="text-xs text-muted-foreground italic">Aucune note pour ce lead.</p>}
              {notes.map((n) => (
                <div key={n.id} className="text-sm bg-secondary/50 rounded-lg p-3">
                  <div className="text-[10px] text-muted-foreground font-display uppercase mb-1">
                    {formatDate(n.created_at)} {n.author_email && `• ${n.author_email}`}
                  </div>
                  <p className="font-body whitespace-pre-wrap">{n.note}</p>
                </div>
              ))}
            </div>
          </div>
          </LeadSection>
          <LeadSection title="Informations du dossier" defaultOpen={false}>
            {/* Lecture seule */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground font-body bg-muted/30 rounded-lg p-3">
              <div><span className="uppercase tracking-wide text-[10px] font-display font-bold">Numéro :</span> #{sub.submission_number}</div>
              {sub.dompe_number && <div><span className="uppercase tracking-wide text-[10px] font-display font-bold">Dompe :</span> {sub.dompe_number}</div>}
              <div><span className="uppercase tracking-wide text-[10px] font-display font-bold">Créé le :</span> {formatDate(sub.created_at)}</div>
              <div><span className="uppercase tracking-wide text-[10px] font-display font-bold">GPS :</span> {sub.latitude && sub.longitude ? `${sub.latitude.toFixed(4)}, ${sub.longitude.toFixed(4)}` : "—"}</div>
              <div className="sm:col-span-2">
                <span className="uppercase tracking-wide text-[10px] font-display font-bold">Validation géo :</span>{" "}
                {(() => {
                  const st = sub.geocoding_status || "pending";
                  const map: Record<string, { label: string; cls: string }> = {
                    validated_address: { label: "Adresse validée", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" },
                    validated_postal:  { label: "Centre code postal", cls: "bg-blue-100 text-blue-800 border-blue-300" },
                    approximate:       { label: "Position approximative", cls: "bg-amber-100 text-amber-800 border-amber-300" },
                    error:             { label: "Erreur géocodage", cls: "bg-rose-100 text-rose-800 border-rose-300" },
                    pending:           { label: "Non vérifiée", cls: "bg-slate-100 text-slate-700 border-slate-300" },
                  };
                  const v = map[st] || map.pending;
                  return <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-display font-semibold ${v.cls}`}>{v.label}</span>;
                })()}
              </div>
            </div>
          </LeadSection>
          <div className="flex justify-end pt-2 border-t border-border">
            <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-destructive hover:bg-destructive/10 font-display font-semibold">
              <Trash2 className="w-3.5 h-3.5" /> Supprimer définitivement
            </button>
          </div>        </div>
      )}
    </div>
  );
};

const D = ({ label, v }: { label: string; v: string }) => (
  <div><span className="text-muted-foreground">{label}:</span> <span className="text-foreground font-medium">{v}</span></div>
);

// --- Entrepreneur management modal ---
interface UserRow { user_id: string; email: string; roles: string[]; approved: boolean; created_at: string }

const UsersModal = ({ onClose }: { onClose: () => void }) => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_users_with_roles");
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else setUsers((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleRole = async (uid: string, hasIt: boolean) => {
    if (hasIt) {
      await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", "entrepreneur");
    } else {
      await supabase.from("user_roles").insert({ user_id: uid, role: "entrepreneur", approved: true });
    }
    load();
  };

  // Validation manuelle d'un compte entrepreneur auto-inscrit (approved = false à l'inscription).
  const setApproval = async (uid: string, approved: boolean) => {
    const { error } = await supabase
      .from("user_roles")
      .update({ approved })
      .eq("user_id", uid)
      .eq("role", "entrepreneur");
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else toast({ title: approved ? "Compte approuvé ✓" : "Approbation retirée" });
    load();
  };


  const createEntrepreneur = async () => {
    if (!newEmail || !newPass) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-entrepreneur", {
        body: { email: newEmail, password: newPass },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Entrepreneur créé ✓", description: `${newEmail} peut maintenant se connecter sur /entrepreneur` });
      setNewEmail(""); setNewPass(""); await load();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally { setCreating(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-foreground/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background rounded-2xl max-w-lg w-full max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold text-lg">Gestion des entrepreneurs</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-card rounded-lg p-4 border border-border">
            <p className="font-display font-semibold text-sm mb-3">Créer un nouveau compte entrepreneur</p>
            <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@exemple.com"
              type="email" className="w-full px-3 py-2 mb-2 text-sm rounded-lg border border-border bg-background font-body" />
            <input value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Mot de passe (min 6 car.)"
              type="text" className="w-full px-3 py-2 mb-2 text-sm rounded-lg border border-border bg-background font-body" />
            <button onClick={createEntrepreneur} disabled={creating}
              className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold disabled:opacity-50">
              {creating ? "Création…" : "Créer le compte"}
            </button>
            <p className="text-[11px] text-muted-foreground mt-2">L'entrepreneur se connectera sur <code>/entrepreneur</code></p>
          </div>

          <div>
            <p className="font-display font-semibold text-sm mb-2">Utilisateurs existants</p>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
              <div className="space-y-2">
                {users.map((u) => {
                  const hasEnt = u.roles.includes("entrepreneur");
                  const isAdm = u.roles.includes("admin");
                  return (
                    <div key={u.user_id} className="flex items-center justify-between gap-2 p-3 bg-card rounded-lg border border-border">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-body truncate">{u.email}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {u.roles.join(", ") || "aucun rôle"}
                          {hasEnt && !isAdm && (u.approved ? " · approuvé" : " · en attente d'approbation")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {hasEnt && !isAdm && (
                          <button onClick={() => setApproval(u.user_id, !u.approved)}
                            className={`px-3 py-1.5 rounded text-xs font-display font-semibold ${u.approved ? "bg-amber-600 text-white" : "bg-primary text-primary-foreground"}`}>
                            {u.approved ? "Suspendre" : "Approuver"}
                          </button>
                        )}
                        {!isAdm && (
                          <button onClick={() => toggleRole(u.user_id, hasEnt)}
                            className={`px-3 py-1.5 rounded text-xs font-display font-semibold ${hasEnt ? "bg-rose-600 text-white" : "bg-slate-600 text-white"}`}>
                            {hasEnt ? "Retirer" : "Activer"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Admin;
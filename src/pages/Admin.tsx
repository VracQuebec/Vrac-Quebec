import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { MATERIAL_TYPES, REQUEST_TYPES, LEAD_PRIORITIES } from "@/lib/questionnaire-data";
import { useLeadStatuses, findStatus, type LeadStatus } from "@/hooks/useLeadStatuses";
import StatusManagerModal from "@/components/StatusManagerModal";
import {
  Truck, LogOut, Trash2, Loader2, ChevronDown, ChevronUp, Map, List,
  Phone, MessageSquare, Mail, MapPin, Archive, Download, Upload, Users, Plus, Eye, EyeOff, Save, Settings,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import AdminMap from "@/components/AdminMap";
import { useUserRoles } from "@/hooks/useUserRole";
import CsvImportModal from "@/components/CsvImportModal";
import GoogleSheetImportModal from "@/components/GoogleSheetImportModal";
import ExcelImportModal from "@/components/ExcelImportModal";
import { Link } from "react-router-dom";
import { Database as DatabaseIcon } from "lucide-react";
import { Search } from "lucide-react";

interface Submission {
  id: string;
  submission_number: number | null;
  dompe_number?: string | null;
  latitude: number | null;
  longitude: number | null;
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
}

interface LeadNote {
  id: string;
  note: string;
  author_email: string | null;
  created_at: string;
}

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

const getMaterialLabels = (ids: string[]) =>
  ids.map((id) => MATERIAL_TYPES.find((m) => m.id === id)?.label || id).join(", ");

const Admin = () => {
  const [user, setUser] = useState<User | null>(null);
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
  const [showStatusManager, setShowStatusManager] = useState(false);
  const { statuses: leadStatuses } = useLeadStatuses();
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRoles();

  useEffect(() => {
    // Only react to explicit sign-out events to avoid redirecting during
    // the brief window where Supabase is still restoring the session from storage.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === "SIGNED_OUT") navigate("/login", { replace: true });
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) navigate("/login", { replace: true });
      else { setUser(session.user); fetchSubmissions(); }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

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

  // Géocode adresses via plusieurs sources (Nominatim structuré + geocoder.ca en fallback)
  // Pour précision maximale on combine numéro+rue, ville, province, code postal.
  const geocodeOne = async (
    address: string,
    postal: string | null
  ): Promise<{ lat: number; lon: number } | null> => {
    // Parse "15 rue Griffin, Shannon" -> number, street, city
    const cleaned = (address || "").trim();
    const parts = cleaned.split(",").map((p) => p.trim()).filter(Boolean);
    const streetPart = parts[0] || "";
    const cityPart = parts[1] || "";
    const m = streetPart.match(/^(\d+[A-Za-z]?)\s+(.+)$/);
    const number = m?.[1];
    const street = m?.[2] || streetPart;

    // 1) Nominatim structuré (le plus précis quand on a numéro + rue + ville)
    try {
      const params = new URLSearchParams({
        format: "json",
        limit: "1",
        countrycodes: "ca",
        state: "Quebec",
      });
      if (number) params.set("street", `${number} ${street}`);
      else if (street) params.set("street", street);
      if (cityPart) params.set("city", cityPart);
      if (postal) params.set("postalcode", postal);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
      const data = await res.json();
      if (data?.[0]) {
        // On accepte uniquement si c'est une adresse précise (house/building) ou rue avec numéro
        const t = data[0].addresstype || data[0].type;
        if (number || ["house", "building", "place"].includes(t)) {
          return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
        }
      }
    } catch { /* ignore */ }

    // 2) Fallback geocoder.ca (souvent meilleur pour adresses civiques au Québec)
    try {
      const q = [cleaned, postal, "QC"].filter(Boolean).join(", ");
      const res = await fetch(
        `https://geocoder.ca/?locate=${encodeURIComponent(q)}&json=1`
      );
      const data = await res.json();
      if (data?.latt && data?.longt) {
        return { lat: parseFloat(data.latt), lon: parseFloat(data.longt) };
      }
    } catch { /* ignore */ }

    // 3) Dernier recours: requête libre Nominatim
    try {
      const q = [cleaned, postal, "Québec, Canada"].filter(Boolean).join(", ");
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=ca`
      );
      const data = await res.json();
      if (data?.[0]) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    } catch { /* ignore */ }

    return null;
  };

  const geocodeMissing = async () => {
    const missing = submissions.filter(
      (s) => (!s.latitude || !s.longitude) && (s.address || s.postal_code)
    );
    if (missing.length === 0) {
      toast({ title: "Tout est déjà géolocalisé." });
      return;
    }
    if (!confirm(`Géocoder ${missing.length} adresse(s) ? (~1 seconde par adresse)`)) return;
    setGeocoding({ done: 0, total: missing.length });
    let ok = 0;
    for (let i = 0; i < missing.length; i++) {
      const s = missing[i];
      const found = await geocodeOne(s.address, s.postal_code);
      if (found) {
        const { error } = await supabase
          .from("submissions")
          .update({ latitude: found.lat, longitude: found.lon })
          .eq("id", s.id);
        if (!error) {
          ok++;
          setSubmissions((prev) =>
            prev.map((x) => (x.id === s.id ? { ...x, latitude: found.lat, longitude: found.lon } : x))
          );
        }
      }
      setGeocoding({ done: i + 1, total: missing.length });
      await new Promise((r) => setTimeout(r, 1100));
    }
    setGeocoding(null);
    toast({ title: "Géocodage terminé", description: `${ok}/${missing.length} adresses localisées.` });
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
      if (filterType !== "all" && s.request_type !== filterType) return false;
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
    return [...list].sort((a, b) => {
      const na = dompeNum(a);
      const nb = dompeNum(b);
      const aHas = !isNaN(na);
      const bHas = !isNaN(nb);
      if (aHas && bHas) return na - nb;
      if (aHas) return -1;
      if (bHas) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [submissions, filterStatus, filterType, searchQuery]);

  if (!user || roleLoading) return null;
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
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-6 h-6 text-primary" />
            <span className="font-display font-bold text-xl text-foreground">
              Vrac<span className="text-primary">Québec</span>
            </span>
            <span className="ml-2 px-2 py-0.5 rounded text-xs bg-primary/10 text-primary font-display font-semibold">Admin CRM</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowUsers(true)} className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-body">
              <Users className="w-4 h-4" /> Entrepreneurs
            </button>
            <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-body">
              <LogOut className="w-4 h-4" /> Déconnexion
            </button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
            Demandes ({filtered.length})
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-secondary rounded-lg p-0.5">
              <button onClick={() => setView("list")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-display font-semibold ${view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                <List className="w-4 h-4" /> Liste
              </button>
              <button onClick={() => setView("map")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-display font-semibold ${view === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                <Map className="w-4 h-4" /> Carte
              </button>
            </div>
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
            <button onClick={fetchSubmissions} className="text-sm text-primary hover:underline font-body">Actualiser</button>
            <button onClick={() => setShowStatusManager(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground border border-border text-sm font-display font-semibold hover:opacity-90">
              <Settings className="w-4 h-4" /> Statuts
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-5">
          <div className="relative flex-1 min-w-[220px] max-w-md">
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
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-border bg-card font-body">
            <option value="all">Tous statuts</option>
            {leadStatuses.map((s) => <option key={s.id} value={s.value}>{s.label}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-border bg-card font-body">
            <option value="all">Tous types</option>
            {REQUEST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : view === "map" ? (
          <>
            <div className="mb-2 text-xs text-muted-foreground font-body">
              💡 Glissez une pin sur la carte pour corriger sa position.
            </div>
            <AdminMap
              submissions={filtered as any}
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
      </main>

      {showUsers && <UsersModal onClose={() => setShowUsers(false)} />}
      {showImport && <CsvImportModal onClose={() => setShowImport(false)} onImported={fetchSubmissions} />}
      {showSheetImport && <GoogleSheetImportModal onClose={() => setShowSheetImport(false)} onImported={fetchSubmissions} />}
      {showExcelImport && <ExcelImportModal onClose={() => setShowExcelImport(false)} onImported={fetchSubmissions} />}
      {showStatusManager && <StatusManagerModal onClose={() => setShowStatusManager(false)} />}
    </div>
  );
};

const statusBadge = (status: string, statuses: LeadStatus[]) => {
  const s = findStatus(statuses, status);
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[10px] font-display font-bold uppercase"
      style={{ backgroundColor: s.color, color: s.text_color }}
    >
      {s.label}
    </span>
  );
};

const typeBadge = (type: string) => {
  const t = REQUEST_TYPES.find((x) => x.value === type) || REQUEST_TYPES[0];
  return <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-display font-bold border ${t.color}`}>{t.label}</span>;
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

  useEffect(() => { setInternalDraft(sub.internal_notes || ""); }, [sub.internal_notes]);

  useEffect(() => {
    if (!expanded) return;
    supabase.rpc("list_users_with_roles").then(({ data }) => {
      const list = ((data as any) || []).filter((u: any) => (u.roles || []).includes("entrepreneur"))
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
    <div className="bg-card rounded-xl border border-border overflow-hidden" style={{ boxShadow: "var(--shadow-sm)" }}>
      <button onClick={onToggle} className="w-full px-4 sm:px-5 py-4 flex items-center justify-between text-left gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {sub.dompe_number ? (
              <span className="text-xs font-display font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{sub.dompe_number}</span>
            ) : null}
            <span className="font-display font-bold text-foreground">{sub.name}</span>
            {statusBadge(sub.status)}
            {typeBadge(sub.request_type)}
          </div>
          <p className="text-xs text-muted-foreground font-body truncate">
            {formatDate(sub.created_at)} • {getMaterialLabels(sub.materials)} • {sub.address}
          </p>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-5 border-t border-border pt-4 space-y-5">
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
            <button onClick={onArchive} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-display font-semibold"><Archive className="w-3.5 h-3.5" /> Archiver</button>
          </div>

          {/* Status selector */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 font-display font-semibold uppercase">Statut du lead</label>
            <div className="flex flex-wrap gap-1.5">
              {LEAD_STATUSES.map((s) => (
                <button key={s.value} onClick={() => onStatusChange(s.value)}
                  className={`px-2.5 py-1 rounded text-[11px] font-display font-bold uppercase border transition-all ${sub.status === s.value ? s.color + " border-transparent" : "bg-card text-muted-foreground border-border hover:border-foreground/30"}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Request type selector */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5 font-display font-semibold uppercase">Type de demande</label>
            <div className="flex flex-wrap gap-1.5">
              {REQUEST_TYPES.map((t) => (
                <button key={t.value} onClick={() => onUpdate({ request_type: t.value })}
                  className={`px-2.5 py-1 rounded text-[11px] font-display font-bold border transition-all ${sub.request_type === t.value ? t.color : "bg-card text-muted-foreground border-border hover:border-foreground/30"}`}>
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
              <label className="block text-xs text-muted-foreground mb-1.5 font-display font-semibold uppercase">Visible entrepreneur</label>
              <button onClick={() => onUpdate({ visible_to_entrepreneur: !sub.visible_to_entrepreneur })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-bold uppercase border ${sub.visible_to_entrepreneur ? "bg-emerald-600 text-white border-transparent" : "bg-card text-muted-foreground border-border"}`}>
                {sub.visible_to_entrepreneur ? <><Eye className="w-3.5 h-3.5" /> Oui</> : <><EyeOff className="w-3.5 h-3.5" /> Non</>}
              </button>
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm font-body">
            <D label="Matériaux" v={getMaterialLabels(sub.materials)} />
            {sub.other_material && <D label="Autre" v={sub.other_material} />}
            <D label="Type projet" v={sub.property_type} />
            <D label="Voyages" v={sub.quantity} />
            <D label="Tonnage" v={sub.tonnage} />
            {sub.deliver_or_remove && <D label="Livrer/Sortir" v={sub.deliver_or_remove} />}
            {sub.contamination && <D label="Contamination" v={sub.contamination} />}
            {sub.budget_unit && <D label="Budget" v={`${sub.budget_max || ""} ${sub.budget_unit}`} />}
            {sub.delivery_deadline && (
              <D
                label="Date limite réception"
                v={new Date(sub.delivery_deadline + "T00:00:00").toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" })}
              />
            )}
            {sub.delivery_timeframe && <D label="Délai souhaité" v={sub.delivery_timeframe} />}
            <D label="Camion accessible" v={(sub.accessibility || []).join(", ") || "—"} />
            <D label="Machinerie" v={sub.machinery_available ? `Oui — ${sub.machinery_description || ""}` : "Non"} />
            {(sub.length_ft || sub.width_ft || sub.depth_in) && (
              <D label="Dimensions" v={`${sub.length_ft || "?"}pi × ${sub.width_ft || "?"}pi × ${sub.depth_in || "?"}po`} />
            )}
            <D label="Adresse" v={`${sub.address}${sub.postal_code ? `, ${sub.postal_code}` : ""}`} />
            <D label="Code postal" v={sub.postal_code || "—"} />
            <D label="GPS" v={sub.latitude && sub.longitude ? `${sub.latitude.toFixed(4)}, ${sub.longitude.toFixed(4)}` : "—"} />
            <D label="Courriel" v={sub.email} />
            <D label="Téléphone" v={sub.phone || "—"} />
            {sub.description && <D label="Notes client" v={sub.description} />}
          </div>

          {sub.photos && sub.photos.length > 0 && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5 font-display font-semibold uppercase">Photos</label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {sub.photos.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="" className="w-full h-24 object-cover rounded" />
                  </a>
                ))}
              </div>
            </div>
          )}

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

          <div className="flex justify-end pt-2 border-t border-border">
            <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-destructive hover:bg-destructive/10 font-display font-semibold">
              <Trash2 className="w-3.5 h-3.5" /> Supprimer définitivement
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const D = ({ label, v }: { label: string; v: string }) => (
  <div><span className="text-muted-foreground">{label}:</span> <span className="text-foreground font-medium">{v}</span></div>
);

// --- Entrepreneur management modal ---
interface UserRow { user_id: string; email: string; roles: string[] }

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
      await supabase.from("user_roles").insert({ user_id: uid, role: "entrepreneur" });
    }
    load();
  };

  const createEntrepreneur = async () => {
    if (!newEmail || !newPass) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: newEmail, password: newPass,
        options: { emailRedirectTo: `${window.location.origin}/entrepreneur` },
      });
      if (error) throw error;
      if (data.user) {
        await supabase.from("user_roles").insert({ user_id: data.user.id, role: "entrepreneur" });
        toast({ title: "Entrepreneur créé", description: newEmail });
        setNewEmail(""); setNewPass(""); load();
      }
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
                        <p className="text-[10px] text-muted-foreground">{u.roles.join(", ") || "aucun rôle"}</p>
                      </div>
                      {!isAdm && (
                        <button onClick={() => toggleRole(u.user_id, hasEnt)}
                          className={`px-3 py-1.5 rounded text-xs font-display font-semibold ${hasEnt ? "bg-rose-600 text-white" : "bg-emerald-600 text-white"}`}>
                          {hasEnt ? "Retirer" : "Activer entrepreneur"}
                        </button>
                      )}
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
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { MATERIAL_TYPES, LEAD_STATUSES, REQUEST_TYPES, LEAD_PRIORITIES } from "@/lib/questionnaire-data";
import {
  Truck, LogOut, Trash2, Loader2, ChevronDown, ChevronUp, Map, List,
  Phone, MessageSquare, Mail, MapPin, Archive, Download, Users, Plus, Eye, EyeOff, Save,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import AdminMap from "@/components/AdminMap";
import { useUserRoles } from "@/hooks/useUserRole";

interface Submission {
  id: string;
  submission_number: number | null;
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
  const [showUsers, setShowUsers] = useState(false);
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRoles();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) navigate("/login");
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) navigate("/login");
      else { setUser(session.user); fetchSubmissions(); }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

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
    const { error } = await supabase.from("submissions").update({ status }).eq("id", id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  };

  const updateField = async (id: string, patch: Partial<Submission>) => {
    const { error } = await supabase.from("submissions").update(patch as any).eq("id", id);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    else setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const archive = (id: string) => updateStatus(id, "archivé");

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
    return submissions.filter((s) =>
      (filterStatus === "all" || s.status === filterStatus) &&
      (filterType === "all" || s.request_type === filterType)
    );
  }, [submissions, filterStatus, filterType]);

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
            <button onClick={exportCSVAdmin} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground text-background text-sm font-display font-semibold hover:opacity-90">
              <Download className="w-4 h-4" /> CSV admin
            </button>
            <button onClick={exportCSVEntrepreneur} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground border border-border text-sm font-display font-semibold hover:opacity-90">
              <Download className="w-4 h-4" /> CSV entrepreneur
            </button>
            <button onClick={fetchSubmissions} className="text-sm text-primary hover:underline font-body">Actualiser</button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-5">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-border bg-card font-body">
            <option value="all">Tous statuts</option>
            {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-3 py-2 text-sm rounded-lg border border-border bg-card font-body">
            <option value="all">Tous types</option>
            {REQUEST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : view === "map" ? (
          <AdminMap submissions={filtered as any} />
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
              />
            ))}
          </div>
        )}
      </main>

      {showUsers && <UsersModal onClose={() => setShowUsers(false)} />}
    </div>
  );
};

const statusBadge = (status: string) => {
  const s = LEAD_STATUSES.find((x) => x.value === status) || LEAD_STATUSES[0];
  return <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-display font-bold uppercase ${s.color}`}>{s.label}</span>;
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
}

const LeadCard = ({ sub, expanded, onToggle, onStatusChange, onUpdate, onDelete, onArchive, userEmail }: CardProps) => {
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
            <span className="font-display font-bold text-foreground">#{sub.submission_number}</span>
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
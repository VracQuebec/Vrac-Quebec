import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import EntrepreneursAdmin from "@/components/EntrepreneursAdmin";
import TransportBanner from "@/components/TransportBanner";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft, Users, Truck, MapPin, Building2, Plus, Loader2, Search, Trash2,
  Star, Archive, ArchiveRestore, ExternalLink,
} from "lucide-react";

type Tab = "clients" | "entrepreneurs" | "carriers" | "dumps";

interface ClientRow {
  id: string; name: string; company: string | null; email: string | null;
  phone: string | null; city: string | null; is_active: boolean;
  submissions_count?: number; transport_requests_count?: number; revenue_total?: number;
}
interface CarrierRow {
  id: string; name: string; contact_name: string | null; email: string | null;
  phone: string | null; city: string | null; is_active: boolean;
  service_zones: string[]; truck_types: string[];
  insurance_expires_at: string | null; permit_expires_at: string | null;
  trucks_count?: number; drivers_count?: number;
}
interface DumpRow {
  id: string; name: string; city: string | null; postal_code: string | null;
  materials_accepted: string[]; truck_types_allowed: string[];
  availability_status: string; capacity_remaining_m3: number | null;
  is_active: boolean; owner_name?: string | null;
}

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "clients", label: "Clients", icon: Users },
  { key: "entrepreneurs", label: "Entrepreneurs", icon: Building2 },
  { key: "carriers", label: "Transporteurs", icon: Truck },
  { key: "dumps", label: "Dompes", icon: MapPin },
];

export default function AdminCrm() {
  const navigate = useNavigate();
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, isReady);
  const [tab, setTab] = useState<Tab>("clients");

  useEffect(() => {
    if (!isReady || roleLoading) return;
    if (!user || !isAdmin) navigate("/login", { replace: true });
  }, [isReady, roleLoading, user, isAdmin, navigate]);

  if (!isReady || !user || roleLoading) {
    return <FullPageState title="Chargement du CRM" message="Vérification des permissions…" />;
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card safe-x">
        <div className="container mx-auto flex min-h-16 items-center gap-3 px-3 py-2 sm:px-6">
          <Link
            to="/admin"
            aria-label="Retour à l'administration"
            className="flex shrink-0 items-center gap-2 text-sm font-display font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Retour à l'admin</span>
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-center font-display font-bold sm:text-left">CRM unifié</h1>
        </div>
      </nav>

      <TransportBanner />

      <main className="container mx-auto px-3 py-5 sm:px-6 sm:py-6">
        <div className="tabs-scroll mb-6 flex gap-2">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-display font-semibold transition-colors ${
                tab === key ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {tab === "clients" && <ClientsTab />}
        {tab === "entrepreneurs" && <EntrepreneursAdmin />}
        {tab === "carriers" && <CarriersTab />}
        {tab === "dumps" && <DumpsTab />}
      </main>
    </div>
  );
}

/* ---------------- SHARED FILTERS ---------------- */

type Sort = "recent" | "name" | "last_activity";
function FilterBar(props: {
  q: string; setQ: (v: string) => void;
  favOnly: boolean; setFavOnly: (v: boolean) => void;
  includeArchived: boolean; setIncludeArchived: (v: boolean) => void;
  status: string; setStatus: (v: string) => void;
  sort: Sort; setSort: (v: Sort) => void;
  count: number; label: string;
  onNew: () => void; newLabel: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-auto sm:min-w-56">
        <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={props.q} onChange={(e) => props.setQ(e.target.value)} placeholder="Recherche instantanée…"
          className="w-full min-h-10 pl-8 pr-3 py-2 text-sm rounded-lg border border-border bg-card font-body" />
      </div>
      <select value={props.status} onChange={(e) => props.setStatus(e.target.value)}
        className="min-h-10 w-full px-2 py-2 text-sm rounded-lg border border-border bg-card min-[420px]:w-[calc(50%-0.25rem)] sm:w-auto sm:flex-none">
        <option value="all">Tous statuts</option>
        <option value="active">Actif</option><option value="prospect">Prospect</option>
        <option value="vip">VIP</option><option value="pause">En pause</option><option value="lost">Perdu</option>
      </select>
      <select value={props.sort} onChange={(e) => props.setSort(e.target.value as Sort)}
        className="min-h-10 w-full px-2 py-2 text-sm rounded-lg border border-border bg-card min-[420px]:w-[calc(50%-0.25rem)] sm:w-auto sm:flex-none">
        <option value="recent">Récents</option>
        <option value="name">Nom (A-Z)</option>
        <option value="last_activity">Dernière activité</option>
      </select>
      <button onClick={() => props.setFavOnly(!props.favOnly)}
        className={`inline-flex min-h-10 items-center gap-1 whitespace-nowrap px-3 py-2 rounded-lg text-sm ${props.favOnly ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
        <Star className="w-4 h-4" /> Favoris
      </button>
      <button onClick={() => props.setIncludeArchived(!props.includeArchived)}
        className={`inline-flex min-h-10 items-center gap-1 whitespace-nowrap px-3 py-2 rounded-lg text-sm ${props.includeArchived ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
        <Archive className="w-4 h-4" /> <span className="hidden sm:inline">Inclure archivés</span><span className="sm:hidden">Archivés</span>
      </button>
      <div className="text-sm text-muted-foreground font-body">{props.count} {props.label}</div>
      <button onClick={props.onNew}
        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-display font-semibold text-primary-foreground sm:ml-auto sm:w-auto">
        <Plus className="w-4 h-4" /> {props.newLabel}
      </button>
    </div>
  );
}

function useCrmFilters() {
  const [q, setQ] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<Sort>("recent");
  return { q, setQ, favOnly, setFavOnly, includeArchived, setIncludeArchived, status, setStatus, sort, setSort };
}

function applyFilters<T extends Record<string, any>>(rows: T[], f: ReturnType<typeof useCrmFilters>, searchFields: (keyof T)[]) {
  let out = rows.filter((r) => {
    if (!f.includeArchived && r.archived_at) return false;
    if (f.favOnly && !r.is_favorite) return false;
    if (f.status !== "all" && (r.status_label ?? "active") !== f.status) return false;
    if (f.q) {
      const s = searchFields.map((k) => String(r[k] ?? "")).join(" ").toLowerCase();
      if (!s.includes(f.q.toLowerCase())) return false;
    }
    return true;
  });
  out.sort((a, b) => {
    if (f.sort === "name") return String(a.name ?? "").localeCompare(String(b.name ?? ""));
    if (f.sort === "last_activity") return new Date(b.last_activity_at ?? 0).getTime() - new Date(a.last_activity_at ?? 0).getTime();
    return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
  });
  return out;
}

/* ---------------- SHARED TABLE ---------------- */

function CrmTable(props: {
  ownerType: "client" | "carrier" | "dump";
  rows: any[];
  columns: { key: string; label: string; render?: (r: any) => React.ReactNode }[];
  onRemove: (id: string) => void;
  onReload: () => void;
}) {
  const table = props.ownerType === "client" ? "clients" : props.ownerType === "carrier" ? "carriers" : "dumps";

  const toggleFav = async (id: string, cur: boolean) => {
    await supabase.from(table as never).update({ is_favorite: !cur } as never).eq("id", id);
    props.onReload();
  };
  const toggleArchive = async (id: string, archived: boolean) => {
    const next = archived ? null : new Date().toISOString();
    await supabase.from(table as never).update({ archived_at: next, is_active: !next } as never).eq("id", id);
    props.onReload();
  };

  return (
    <div className="overflow-x-auto bg-card rounded-lg border border-border">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-secondary">
          <tr>
            <th className="w-8"></th>
            <th className="text-left px-3 py-2 font-display font-bold text-xs uppercase">Nom</th>
            {props.columns.map((c) => (
              <th key={c.key} className="text-left px-3 py-2 font-display font-bold text-xs uppercase">{c.label}</th>
            ))}
            <th className="text-left px-3 py-2 font-display font-bold text-xs uppercase">Statut</th>
            <th className="text-left px-3 py-2 font-display font-bold text-xs uppercase">Dernière activité</th>
            <th className="w-28"></th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((r) => (
            <tr key={r.id} className={`border-t border-border hover:bg-secondary/50 ${r.archived_at ? "opacity-60" : ""}`}>
              <td className="px-2 py-2">
                <button onClick={() => toggleFav(r.id, !!r.is_favorite)} aria-label="Favori">
                  <Star className={`w-4 h-4 ${r.is_favorite ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                </button>
              </td>
              <td className="px-3 py-2 font-body font-semibold">
                <Link to={`/admin/crm/${props.ownerType}/${r.id}`} className="hover:underline inline-flex items-center gap-1">
                  {r.name} <ExternalLink className="w-3 h-3 text-muted-foreground" />
                </Link>
              </td>
              {props.columns.map((c) => (
                <td key={c.key} className="px-3 py-2 font-body">{c.render ? c.render(r) : (r[c.key] ?? "—")}</td>
              ))}
              <td className="px-3 py-2 font-body">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-display font-semibold bg-primary/10 text-primary">
                  {r.status_label ?? "active"}
                </span>
              </td>
              <td className="px-3 py-2 font-body text-xs text-muted-foreground">
                {r.last_activity_at ? new Date(r.last_activity_at).toLocaleDateString("fr-CA") : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                <button onClick={() => toggleArchive(r.id, !!r.archived_at)} className="p-1 text-muted-foreground hover:text-foreground" aria-label="Archiver">
                  {r.archived_at ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                </button>
                <button onClick={() => props.onRemove(r.id)} className="p-1 text-muted-foreground hover:text-destructive" aria-label="Supprimer">
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- CLIENTS ---------------- */

function ClientsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const filters = useCrmFilters();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", city: "" });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim()) { toast({ title: "Nom requis", variant: "destructive" }); return; }
    const { error } = await supabase.from("clients").insert({
      name: form.name.trim(),
      company: form.company.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      city: form.city.trim() || null,
    });
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    setForm({ name: "", company: "", email: "", phone: "", city: "" });
    setShowForm(false);
    toast({ title: "Client créé" });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer ce client ?")) return;
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const filtered = applyFilters(rows, filters, ["name", "company", "email", "phone", "city"]);

  return (
    <section>
      <FilterBar {...filters} count={filtered.length} label="client(s)"
        onNew={() => setShowForm((s) => !s)} newLabel="Nouveau client" />

      {showForm && (
        <div className="bg-card rounded-lg border border-border p-4 mb-4 grid gap-3 md:grid-cols-5">
          <input placeholder="Nom *"        value={form.name}    onChange={(e) => setForm({ ...form, name: e.target.value })}    className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          <input placeholder="Entreprise"  value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          <input placeholder="Courriel"    value={form.email}   onChange={(e) => setForm({ ...form, email: e.target.value })}   className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          <input placeholder="Téléphone"   value={form.phone}   onChange={(e) => setForm({ ...form, phone: e.target.value })}   className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          <input placeholder="Ville"       value={form.city}    onChange={(e) => setForm({ ...form, city: e.target.value })}    className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          <div className="md:col-span-5 flex justify-end">
            <button onClick={create} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold">Créer</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground font-body">Aucun client. Créez-en un pour démarrer.</div>
      ) : (
        <CrmTable ownerType="client" rows={filtered} columns={[
          { key: "company", label: "Entreprise" },
          { key: "email", label: "Courriel" },
          { key: "phone", label: "Téléphone" },
          { key: "city", label: "Ville" },
        ]} onRemove={remove} onReload={load} />
      )}
    </section>
  );
}

/* ---------------- CARRIERS ---------------- */

function CarriersTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const filters = useCrmFilters();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", contact_name: "", email: "", phone: "", city: "" });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("carriers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim()) { toast({ title: "Nom requis", variant: "destructive" }); return; }
    const { error } = await supabase.from("carriers").insert({
      name: form.name.trim(),
      contact_name: form.contact_name.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      city: form.city.trim() || null,
    });
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    setForm({ name: "", contact_name: "", email: "", phone: "", city: "" });
    setShowForm(false);
    toast({ title: "Transporteur créé" });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer ce transporteur ?")) return;
    const { error } = await supabase.from("carriers").delete().eq("id", id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const filtered = applyFilters(rows, filters, ["name", "contact_name", "email", "phone", "city"]);

  return (
    <section>
      <FilterBar {...filters} count={filtered.length} label="transporteur(s)"
        onNew={() => setShowForm((s) => !s)} newLabel="Nouveau transporteur" />

      {showForm && (
        <div className="bg-card rounded-lg border border-border p-4 mb-4 grid gap-3 md:grid-cols-5">
          <input placeholder="Nom *"       value={form.name}         onChange={(e) => setForm({ ...form, name: e.target.value })}         className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          <input placeholder="Contact"     value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          <input placeholder="Courriel"    value={form.email}        onChange={(e) => setForm({ ...form, email: e.target.value })}        className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          <input placeholder="Téléphone"   value={form.phone}        onChange={(e) => setForm({ ...form, phone: e.target.value })}        className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          <input placeholder="Ville"       value={form.city}         onChange={(e) => setForm({ ...form, city: e.target.value })}         className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          <div className="md:col-span-5 flex justify-end">
            <button onClick={create} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold">Créer</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground font-body">Aucun transporteur enregistré. Ajoutez-en un pour élargir votre réseau.</div>
      ) : (
        <CrmTable ownerType="carrier" rows={filtered} columns={[
          { key: "contact_name", label: "Contact" },
          { key: "phone", label: "Téléphone" },
          { key: "city", label: "Ville" },
          { key: "insurance_expires_at", label: "Assurance" },
          { key: "permit_expires_at", label: "Permis" },
        ]} onRemove={remove} onReload={load} />
      )}
    </section>
  );
}

/* ---------------- DUMPS ---------------- */

function DumpsTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const filters = useCrmFilters();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", city: "", postal_code: "", availability_status: "available" });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("dumps")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim()) { toast({ title: "Nom requis", variant: "destructive" }); return; }
    const { error } = await supabase.from("dumps").insert({
      name: form.name.trim(),
      city: form.city.trim() || null,
      postal_code: form.postal_code.trim() || null,
      availability_status: form.availability_status,
    });
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    setForm({ name: "", city: "", postal_code: "", availability_status: "available" });
    setShowForm(false);
    toast({ title: "Dompe créée" });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer cette dompe ?")) return;
    const { error } = await supabase.from("dumps").delete().eq("id", id);
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const filtered = applyFilters(rows, filters, ["name", "city", "postal_code"]);

  return (
    <section>
      <FilterBar {...filters} count={filtered.length} label="dompe(s)"
        onNew={() => setShowForm((s) => !s)} newLabel="Nouvelle dompe" />

      {showForm && (
        <div className="bg-card rounded-lg border border-border p-4 mb-4 grid gap-3 md:grid-cols-4">
          <input placeholder="Nom *"          value={form.name}        onChange={(e) => setForm({ ...form, name: e.target.value })}        className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          <input placeholder="Ville"          value={form.city}        onChange={(e) => setForm({ ...form, city: e.target.value })}        className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          <input placeholder="Code postal"    value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} className="px-3 py-2 rounded-lg border border-border bg-background text-sm" />
          <select value={form.availability_status} onChange={(e) => setForm({ ...form, availability_status: e.target.value })}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm">
            <option value="available">Disponible</option>
            <option value="limited">Capacité limitée</option>
            <option value="full">Pleine</option>
            <option value="closed">Fermée</option>
          </select>
          <div className="md:col-span-4 flex justify-end">
            <button onClick={create} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold">Créer</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground font-body">
          Aucune dompe enregistrée dans la nouvelle table. Les dompes historiques restent visibles sur la carte /admin.
        </div>
      ) : (
        <CrmTable ownerType="dump" rows={filtered} columns={[
          { key: "city", label: "Ville" },
          { key: "materials_accepted", label: "Matériaux", render: (r) => (r.materials_accepted ?? []).join(", ") || "—" },
          { key: "availability_status", label: "Disponibilité" },
          { key: "capacity_remaining_m3", label: "Capacité restante" },
        ]} onRemove={remove} onReload={load} />
      )}
    </section>
  );
}
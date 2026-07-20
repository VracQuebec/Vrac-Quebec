import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRole";
import { useAuthReady } from "@/hooks/useAuthReady";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";
import { toast } from "sonner";
import {
  ArrowLeft, LayoutDashboard, MapPin, Package, Wrench, Sparkles, Lightbulb,
  Loader2, Plus, Trash2, Play, Pause, RotateCcw, Save, ExternalLink, Gauge, RefreshCw,
} from "lucide-react";

type Tab = "dashboard" | "cities" | "materials" | "uses" | "services" | "generator" | "suggestions" | "analytics";

type City = {
  id: string; slug: string; name: string; region: string;
  latitude: number | null; longitude: number | null; population: number | null;
  intro: string | null; neighbors: string[]; active: boolean; sort_order: number;
};
type Material = {
  id: string; slug: string; name: string; short_name: string; description: string;
  keywords: string[]; use_cases: string[]; delivery_unit: string; related_materials: string[];
  active: boolean; sort_order: number;
};
type Use = {
  id: string; slug: string; material_slug: string; name: string; description: string;
  active: boolean; sort_order: number;
};
type Service = { id: string; slug: string; name: string; short_name: string | null; description: string; keywords: string[]; active: boolean; sort_order: number };
type Page = { id: string; slug: string; city_slug: string; material_slug: string | null; service_slug: string | null; title: string; status: string; last_generated_at: string | null; created_at: string; view_count: number; seo_score?: number | null; word_count?: number | null; internal_link_count?: number | null; needs_refresh?: boolean };

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "");
}

export default function AdminSeoManager() {
  const { isReady: authReady, user } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, authReady);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("dashboard");

  useEffect(() => {
    if (authReady && !user) navigate("/login");
    if (authReady && user && !roleLoading && !isAdmin) navigate("/");
  }, [authReady, user, isAdmin, roleLoading, navigate]);
  if (!isAdmin) return null;

  const tabs: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard }> = [
    { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    { id: "cities", label: "Villes", icon: MapPin },
    { id: "materials", label: "Matériaux", icon: Package },
    { id: "uses", label: "Usages", icon: Wrench },
    { id: "services", label: "Services", icon: Wrench },
    { id: "generator", label: "Générateur", icon: Sparkles },
    { id: "analytics", label: "Analyse SEO", icon: Gauge },
    { id: "suggestions", label: "Suggestions", icon: Lightbulb },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Link to="/admin" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> CRM
          </Link>
          <h1 className="text-lg font-display font-bold text-foreground">SEO</h1>
        </div>
      </header>
      <div className="container mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <nav className="flex md:flex-col gap-1 md:sticky md:top-20 h-fit overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-display font-semibold whitespace-nowrap ${
                tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
              }`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </nav>
        <main>
          {tab === "dashboard" && <Dashboard />}
          {tab === "cities" && <CitiesTab />}
          {tab === "materials" && <MaterialsTab />}
          {tab === "uses" && <UsesTab />}
          {tab === "services" && <ServicesTab />}
          {tab === "generator" && <GeneratorTab />}
          {tab === "analytics" && <AnalyticsTab />}
          {tab === "suggestions" && <SuggestionsTab />}
        </main>
      </div>
    </div>
  );
}

/* =========================================================================
 * DASHBOARD
 * ========================================================================= */
function Dashboard() {
  const [stats, setStats] = useState<{ total: number; published: number; drafts: number; today: number } | null>(null);
  const [top, setTop] = useState<Page[]>([]);
  const [stale, setStale] = useState<Page[]>([]);

  useEffect(() => {
    (async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const [{ count: total }, { count: published }, { count: drafts }, { count: today }] = await Promise.all([
        supabase.from("seo_pages").select("*", { count: "exact", head: true }),
        supabase.from("seo_pages").select("*", { count: "exact", head: true }).eq("status", "published"),
        supabase.from("seo_pages").select("*", { count: "exact", head: true }).eq("status", "draft"),
        supabase.from("seo_pages").select("*", { count: "exact", head: true }).gte("created_at", start.toISOString()),
      ]);
      setStats({ total: total ?? 0, published: published ?? 0, drafts: drafts ?? 0, today: today ?? 0 });
      const { data: topRows } = await supabase.from("seo_pages").select("*").order("view_count", { ascending: false }).limit(10);
      setTop((topRows ?? []) as unknown as Page[]);
      const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
      const { data: staleRows } = await supabase.from("seo_pages").select("*").lt("last_generated_at", cutoff).order("last_generated_at", { ascending: true }).limit(10);
      setStale((staleRows ?? []) as unknown as Page[]);
    })();
  }, []);

  if (!stats) return <Spinner />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Publiées" value={stats.published} />
        <StatCard label="Brouillons" value={stats.drafts} />
        <StatCard label="Aujourd'hui" value={stats.today} />
      </div>
      <PageList title="Pages les plus consultées" rows={top} emptyText="Aucune donnée de vues." />
      <PageList title="Pages à optimiser (> 90 jours)" rows={stale} emptyText="Toutes les pages sont récentes." />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground font-body">{label}</div>
      <div className="text-2xl font-display font-bold text-foreground mt-1">{value}</div>
    </div>
  );
}

function PageList({ title, rows, emptyText }: { title: string; rows: Page[]; emptyText: string }) {
  return (
    <div>
      <h2 className="font-display font-bold text-foreground mb-2">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-body text-foreground truncate">{r.title}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">/{r.slug}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-muted-foreground">{r.view_count} vues</span>
                <Link to={`/${r.slug}`} target="_blank" className="text-primary hover:underline text-xs inline-flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Voir
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* =========================================================================
 * CITIES / MATERIALS / SERVICES — simple lists with toggle + delete
 * ========================================================================= */
function CitiesTab() {
  const [rows, setRows] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<City | null>(null);
  const [q, setQ] = useState("");
  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("seo_cities").select("*").order("sort_order");
    setRows((data ?? []) as City[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(t) || r.slug.toLowerCase().includes(t) || (r.region || "").toLowerCase().includes(t));
  }, [rows, q]);
  const save = async (form: City) => {
    if (!form.name.trim()) return toast.error("Nom requis");
    const slug = (form.slug.trim() || slugify(form.name));
    const payload = { ...form, slug } as Partial<City>;
    delete (payload as { id?: string }).id;
    const { error } = form.id
      ? await supabase.from("seo_cities").update(payload).eq("id", form.id)
      : await supabase.from("seo_cities").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(form.id ? "Ville mise à jour" : "Ville créée");
    setEditing(null); load();
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher..." className="flex-1 max-w-md px-3 py-2 rounded-md border border-border bg-card text-sm" />
        <button
          onClick={() => setEditing({ id: "", slug: "", name: "", region: "", latitude: null, longitude: null, population: null, intro: "", neighbors: [], active: true, sort_order: (rows.at(-1)?.sort_order ?? 0) + 10 })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>
      {loading ? <Spinner /> : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {filtered.map((r) => (
            <li key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-body text-foreground truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">{r.region} · /{r.slug} · {r.neighbors?.length ?? 0} voisines</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={async () => { await supabase.from("seo_cities").update({ active: !r.active }).eq("id", r.id); load(); }}
                  className={`px-2 py-0.5 rounded text-xs font-semibold ${r.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {r.active ? "Active" : "Inactive"}
                </button>
                <button onClick={() => setEditing(r)} className="text-xs text-primary hover:underline">Modifier</button>
                <button onClick={async () => { if (confirm(`Supprimer ${r.name} ?`)) { await supabase.from("seo_cities").delete().eq("id", r.id); load(); } }}
                  className="text-destructive hover:opacity-80"><Trash2 className="w-4 h-4" /></button>
              </div>
            </li>
          ))}
          {filtered.length === 0 && <li className="p-6 text-center text-muted-foreground text-sm">Aucune ville.</li>}
        </ul>
      )}
      {editing && <CityEditor initial={editing} allCities={rows} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function CityEditor({ initial, allCities, onClose, onSave }: {
  initial: City; allCities: City[]; onClose: () => void; onSave: (c: City) => void;
}) {
  const [form, setForm] = useState<City>(initial);
  return (
    <Modal title={initial.id ? `Modifier ${initial.name}` : "Nouvelle ville"} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Nom" value={form.name} onChange={(v) => setForm({ ...form, name: v, slug: form.slug || slugify(v) })} />
          <LabeledInput label="Slug" mono value={form.slug} onChange={(v) => setForm({ ...form, slug: slugify(v) })} />
          <LabeledInput label="Région" value={form.region} onChange={(v) => setForm({ ...form, region: v })} />
          <LabeledInput label="Population" type="number" value={form.population?.toString() ?? ""} onChange={(v) => setForm({ ...form, population: v ? Number(v) : null })} />
          <LabeledInput label="Latitude" type="number" value={form.latitude?.toString() ?? ""} onChange={(v) => setForm({ ...form, latitude: v ? Number(v) : null })} />
          <LabeledInput label="Longitude" type="number" value={form.longitude?.toString() ?? ""} onChange={(v) => setForm({ ...form, longitude: v ? Number(v) : null })} />
        </div>
        <LabeledTextarea label="Introduction" value={form.intro ?? ""} onChange={(v) => setForm({ ...form, intro: v })} />
        <div>
          <div className="text-xs font-display font-semibold text-muted-foreground mb-1">Villes voisines</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-40 overflow-y-auto p-2 rounded border border-border">
            {allCities.filter((c) => c.slug !== form.slug).map((c) => (
              <label key={c.slug} className="flex items-center gap-1.5 text-xs font-body">
                <input type="checkbox" checked={form.neighbors.includes(c.slug)}
                  onChange={(e) => setForm({ ...form, neighbors: e.target.checked ? [...form.neighbors, c.slug] : form.neighbors.filter((s) => s !== c.slug) })} />
                {c.name}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Ordre" type="number" value={String(form.sort_order)} onChange={(v) => setForm({ ...form, sort_order: Number(v) || 0 })} />
          <label className="flex items-center gap-2 mt-6">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            <span>Active</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-border text-sm">Annuler</button>
          <button onClick={() => onSave(form)} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold">
            <Save className="w-4 h-4" /> Enregistrer
          </button>
        </div>
      </div>
    </Modal>
  );
}

function MaterialsTab() {
  const [rows, setRows] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Material | null>(null);
  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("seo_materials").select("*").order("sort_order");
    setRows((data ?? []) as Material[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const save = async (form: Material) => {
    if (!form.name.trim()) return toast.error("Nom requis");
    const slug = form.slug.trim() || slugify(form.name);
    const payload = { ...form, slug, short_name: form.short_name || form.name } as Partial<Material>;
    delete (payload as { id?: string }).id;
    const { error } = form.id
      ? await supabase.from("seo_materials").update(payload).eq("id", form.id)
      : await supabase.from("seo_materials").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(form.id ? "Matériau mis à jour" : "Matériau créé");
    setEditing(null); load();
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-lg">Matériaux</h2>
        <button
          onClick={() => setEditing({ id: "", slug: "", name: "", short_name: "", keywords: [], use_cases: [], delivery_unit: "tonne", related_materials: [], description: "", active: true, sort_order: (rows.at(-1)?.sort_order ?? 0) + 10 })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>
      {loading ? <Spinner /> : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-body text-foreground truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">/{r.slug} · {r.delivery_unit}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={async () => { await supabase.from("seo_materials").update({ active: !r.active }).eq("id", r.id); load(); }}
                  className={`px-2 py-0.5 rounded text-xs font-semibold ${r.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {r.active ? "Actif" : "Inactif"}
                </button>
                <button onClick={() => setEditing(r)} className="text-xs text-primary hover:underline">Modifier</button>
                <button onClick={async () => { if (confirm(`Supprimer ${r.name} ?`)) { await supabase.from("seo_materials").delete().eq("id", r.id); load(); } }}
                  className="text-destructive hover:opacity-80"><Trash2 className="w-4 h-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <MaterialEditor initial={editing} allMaterials={rows} onClose={() => setEditing(null)} onSave={save} />}
    </div>
  );
}

function MaterialEditor({ initial, allMaterials, onClose, onSave }: {
  initial: Material; allMaterials: Material[]; onClose: () => void; onSave: (m: Material) => void;
}) {
  const [form, setForm] = useState<Material>(initial);
  return (
    <Modal title={initial.id ? `Modifier ${initial.name}` : "Nouveau matériau"} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Nom complet" value={form.name} onChange={(v) => setForm({ ...form, name: v, slug: form.slug || slugify(v) })} />
          <LabeledInput label="Nom court" value={form.short_name} onChange={(v) => setForm({ ...form, short_name: v })} />
          <LabeledInput label="Slug" mono value={form.slug} onChange={(v) => setForm({ ...form, slug: slugify(v) })} />
          <label className="block">
            <span className="text-xs font-display font-semibold text-muted-foreground">Unité de livraison</span>
            <select value={form.delivery_unit} onChange={(e) => setForm({ ...form, delivery_unit: e.target.value })}
              className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm">
              <option value="tonne">tonne</option>
              <option value="verge cube">verge cube</option>
            </select>
          </label>
        </div>
        <LabeledTextarea label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
        <LabeledTextarea label="Mots-clés (un par ligne)" value={form.keywords.join("\n")} onChange={(v) => setForm({ ...form, keywords: v.split("\n").map((s) => s.trim()).filter(Boolean) })} />
        <LabeledTextarea label="Utilisations courantes (une par ligne)" value={form.use_cases.join("\n")} onChange={(v) => setForm({ ...form, use_cases: v.split("\n").map((s) => s.trim()).filter(Boolean) })} />
        <div>
          <div className="text-xs font-display font-semibold text-muted-foreground mb-1">Matériaux similaires</div>
          <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto p-2 rounded border border-border">
            {allMaterials.filter((m) => m.slug !== form.slug).map((m) => (
              <label key={m.slug} className="flex items-center gap-1.5 text-xs font-body">
                <input type="checkbox" checked={form.related_materials.includes(m.slug)}
                  onChange={(e) => setForm({ ...form, related_materials: e.target.checked ? [...form.related_materials, m.slug] : form.related_materials.filter((s) => s !== m.slug) })} />
                {m.name}
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Ordre" type="number" value={String(form.sort_order)} onChange={(v) => setForm({ ...form, sort_order: Number(v) || 0 })} />
          <label className="flex items-center gap-2 mt-6">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            <span>Actif</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-border text-sm">Annuler</button>
          <button onClick={() => onSave(form)} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold">
            <Save className="w-4 h-4" /> Enregistrer
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* =========================================================================
 * USAGES — pages "par utilisation" (ex: terre-pour-gazon)
 * ========================================================================= */
function UsesTab() {
  const [rows, setRows] = useState<Use[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Use | null>(null);
  const load = async () => {
    setLoading(true);
    const [u, m] = await Promise.all([
      supabase.from("seo_material_uses").select("*").order("sort_order"),
      supabase.from("seo_materials").select("*").order("sort_order"),
    ]);
    setRows((u.data ?? []) as Use[]);
    setMaterials((m.data ?? []) as Material[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const save = async (row: Use) => {
    if (!row.name.trim()) return toast.error("Nom requis");
    if (!row.material_slug) return toast.error("Matériau requis");
    const slug = row.slug.trim() || slugify(row.name);
    const payload = { ...row, slug } as Partial<Use>;
    delete (payload as { id?: string }).id;
    const { error } = row.id
      ? await supabase.from("seo_material_uses").update(payload).eq("id", row.id)
      : await supabase.from("seo_material_uses").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Enregistré");
    setEditing(null); load();
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-lg">Usages</h2>
          <p className="text-xs text-muted-foreground font-body">Pages ciblées comme <code>terre-pour-gazon</code>, <code>gravier-pour-entree</code>, etc.</p>
        </div>
        <button
          onClick={() => setEditing({ id: "", slug: "", material_slug: materials[0]?.slug ?? "", name: "", description: "", active: true, sort_order: (rows.at(-1)?.sort_order ?? 0) + 10 })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>
      {loading ? <Spinner /> : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-body text-foreground truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">/{r.slug} · {r.material_slug}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={async () => { await supabase.from("seo_material_uses").update({ active: !r.active }).eq("id", r.id); load(); }}
                  className={`px-2 py-0.5 rounded text-xs font-semibold ${r.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {r.active ? "Actif" : "Inactif"}
                </button>
                <button onClick={() => setEditing(r)} className="text-xs text-primary hover:underline">Modifier</button>
                <button onClick={async () => { if (confirm("Supprimer ?")) { await supabase.from("seo_material_uses").delete().eq("id", r.id); load(); } }}
                  className="text-destructive hover:opacity-80"><Trash2 className="w-4 h-4" /></button>
              </div>
            </li>
          ))}
          {rows.length === 0 && <li className="p-6 text-center text-muted-foreground text-sm">Aucun usage. Créez-en pour ouvrir des pages par utilisation (ex: terre-pour-gazon).</li>}
        </ul>
      )}
      {editing && (
        <Modal title={editing.id ? "Modifier l'usage" : "Nouvel usage"} onClose={() => setEditing(null)}>
          <div className="space-y-3 text-sm">
            <LabeledInput label="Nom (ex : Terre pour gazon)" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v, slug: editing.slug || slugify(v) })} />
            <LabeledInput label="Slug" mono value={editing.slug} onChange={(v) => setEditing({ ...editing, slug: slugify(v) })} />
            <label className="block">
              <span className="text-xs font-display font-semibold text-muted-foreground">Matériau associé</span>
              <select value={editing.material_slug} onChange={(e) => setEditing({ ...editing, material_slug: e.target.value })}
                className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm">
                {materials.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
              </select>
            </label>
            <LabeledTextarea label="Description SEO courte" value={editing.description} onChange={(v) => setEditing({ ...editing, description: v })} />
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Ordre" type="number" value={String(editing.sort_order)} onChange={(v) => setEditing({ ...editing, sort_order: Number(v) || 0 })} />
              <label className="flex items-center gap-2 mt-6">
                <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                <span>Actif</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-md border border-border text-sm">Annuler</button>
              <button onClick={() => save(editing)} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold">
                <Save className="w-4 h-4" /> Enregistrer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ServicesTab() {
  const [rows, setRows] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Service | null>(null);
  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("seo_services").select("*").order("sort_order");
    setRows((data ?? []) as Service[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    const payload = {
      slug: editing.slug || slugify(editing.name),
      name: editing.name,
      short_name: editing.short_name,
      description: editing.description,
      keywords: editing.keywords,
      active: editing.active,
      sort_order: editing.sort_order,
    };
    const { error } = editing.id
      ? await supabase.from("seo_services").update(payload).eq("id", editing.id)
      : await supabase.from("seo_services").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Enregistré");
    setEditing(null);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-lg">Services</h2>
        <button onClick={() => setEditing({ id: "", slug: "", name: "", short_name: "", description: "", keywords: [], active: true, sort_order: (rows.at(-1)?.sort_order ?? 0) + 10 })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </div>
      {loading ? <Spinner /> : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-body text-foreground truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">/{r.slug}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={async () => { await supabase.from("seo_services").update({ active: !r.active }).eq("id", r.id); load(); }}
                  className={`px-2 py-0.5 rounded text-xs font-semibold ${r.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {r.active ? "Actif" : "Inactif"}
                </button>
                <button onClick={() => setEditing(r)} className="text-xs text-primary hover:underline">Modifier</button>
                <button onClick={async () => { if (confirm(`Supprimer ${r.name} ?`)) { await supabase.from("seo_services").delete().eq("id", r.id); load(); } }}
                  className="text-destructive hover:opacity-80"><Trash2 className="w-4 h-4" /></button>
              </div>
            </li>
          ))}
          {rows.length === 0 && <li className="p-6 text-center text-muted-foreground text-sm">Aucun service.</li>}
        </ul>
      )}

      {editing && (
        <Modal onClose={() => setEditing(null)} title={editing.id ? `Modifier ${editing.name}` : "Nouveau service"}>
          <div className="space-y-3 text-sm">
            <LabeledInput label="Nom" value={editing.name} onChange={(v) => setEditing({ ...editing, name: v, slug: editing.slug || slugify(v) })} />
            <LabeledInput label="Slug" mono value={editing.slug} onChange={(v) => setEditing({ ...editing, slug: slugify(v) })} />
            <LabeledInput label="Nom court" value={editing.short_name ?? ""} onChange={(v) => setEditing({ ...editing, short_name: v })} />
            <LabeledTextarea label="Description" value={editing.description} onChange={(v) => setEditing({ ...editing, description: v })} />
            <LabeledInput label="Mots-clés (séparés par virgule)" value={editing.keywords.join(", ")} onChange={(v) => setEditing({ ...editing, keywords: v.split(",").map((s) => s.trim()).filter(Boolean) })} />
            <div className="grid grid-cols-2 gap-3">
              <LabeledInput label="Ordre" type="number" value={String(editing.sort_order)} onChange={(v) => setEditing({ ...editing, sort_order: Number(v) || 0 })} />
              <label className="flex items-center gap-2 mt-6">
                <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                <span>Actif</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-md border border-border text-sm">Annuler</button>
              <button onClick={save} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold">
                <Save className="w-4 h-4" /> Enregistrer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SimpleAdminList({ title, rows, loading, onToggle, onDelete, extra }: {
  title: string;
  rows: Array<{ id: string; name: string; sub: string; active: boolean }>;
  loading: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-lg">{title}</h2>
        {extra}
      </div>
      {loading ? <Spinner /> : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-body text-foreground truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">{r.sub}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => onToggle(r.id)} className={`px-2 py-0.5 rounded text-xs font-semibold ${r.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {r.active ? "Actif" : "Inactif"}
                </button>
                <button onClick={() => onDelete(r.id)} className="text-destructive hover:opacity-80"><Trash2 className="w-4 h-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* =========================================================================
 * GENERATOR
 * ========================================================================= */
type Combo = { city: City; material?: Material; service?: Service };

function buildSlug(c: Combo) {
  const parts = [c.service?.slug, c.material?.slug, c.city.slug].filter(Boolean) as string[];
  return parts.join("-");
}

function GeneratorTab() {
  const [cities, setCities] = useState<City[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [existingSlugs, setExistingSlugs] = useState<Set<string>>(new Set());
  const [selCities, setSelCities] = useState<Set<string>>(new Set());
  const [selMaterials, setSelMaterials] = useState<Set<string>>(new Set());
  const [selServices, setSelServices] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const [c, m, s, p] = await Promise.all([
        supabase.from("seo_cities").select("id,slug,name,region,active,sort_order").eq("active", true).order("sort_order"),
        supabase.from("seo_materials").select("id,slug,name,short_name,description,active,sort_order").eq("active", true).order("sort_order"),
        supabase.from("seo_services").select("*").eq("active", true).order("sort_order"),
        supabase.from("seo_pages").select("slug"),
      ]);
      setCities((c.data ?? []) as City[]);
      setMaterials((m.data ?? []) as Material[]);
      setServices((s.data ?? []) as Service[]);
      setExistingSlugs(new Set((p.data ?? []).map((r) => r.slug)));
    })();
  }, []);

  const combos: Combo[] = useMemo(() => {
    const out: Combo[] = [];
    const selC = cities.filter((c) => selCities.has(c.id));
    const selM = materials.filter((m) => selMaterials.has(m.id));
    const selS = services.filter((s) => selServices.has(s.id));
    if (selC.length === 0) return out;
    if (selM.length === 0 && selS.length === 0) return out;
    for (const city of selC) {
      if (selS.length === 0) {
        for (const material of selM) out.push({ city, material });
      } else if (selM.length === 0) {
        for (const service of selS) out.push({ city, service });
      } else {
        for (const service of selS) for (const material of selM) out.push({ city, service, material });
      }
    }
    return out;
  }, [cities, materials, services, selCities, selMaterials, selServices]);

  const toCreate = combos.filter((c) => !existingSlugs.has(buildSlug(c)));
  const existingCount = combos.length - toCreate.length;
  const estimatedSeconds = toCreate.length * 6;

  const run = async () => {
    if (toCreate.length === 0) return;
    setRunning(true);
    setPaused(false);
    setProgress({ done: 0, total: toCreate.length, errors: 0 });
    setLog([]);
    let done = 0, errors = 0;
    for (const c of toCreate) {
      // Poll pause flag between iterations
      // eslint-disable-next-line no-await-in-loop
      while ((window as unknown as { __seoPaused?: boolean }).__seoPaused) await new Promise((r) => setTimeout(r, 500));
      const slug = buildSlug(c);
      try {
        // eslint-disable-next-line no-await-in-loop
        const { data, error } = await invokeWithFreshSession<Record<string, unknown>, { created?: boolean; skipped?: boolean; error?: string }>("seo-generate-page", {
          city: { slug: c.city.slug, name: c.city.name, region: c.city.region },
          material: c.material ? { slug: c.material.slug, name: c.material.name, short_name: c.material.short_name, description: c.material.description } : undefined,
          service: c.service ? { slug: c.service.slug, name: c.service.name, description: c.service.description } : undefined,
        });
        if (error) throw error;
        setExistingSlugs((s) => new Set(s).add(slug));
        setLog((l) => [`${data?.skipped ? "⏭️" : "✅"} ${slug}`, ...l].slice(0, 40));
      } catch (e) {
        errors += 1;
        setLog((l) => [`❌ ${slug} — ${(e as Error).message}`, ...l].slice(0, 40));
      }
      done += 1;
      setProgress({ done, total: toCreate.length, errors });
    }
    setRunning(false);
    toast.success(`Génération terminée : ${done - errors} pages créées, ${errors} erreurs.`);
  };

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    (window as unknown as { __seoPaused?: boolean }).__seoPaused = next;
  };

  const toggleAll = (list: Array<{ id: string }>, sel: Set<string>, setSel: (s: Set<string>) => void) => {
    if (sel.size === list.length) setSel(new Set());
    else setSel(new Set(list.map((r) => r.id)));
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PickerColumn title="Villes" items={cities} selected={selCities} onChange={setSelCities} onToggleAll={() => toggleAll(cities, selCities, setSelCities)} />
        <PickerColumn title="Matériaux" items={materials} selected={selMaterials} onChange={setSelMaterials} onToggleAll={() => toggleAll(materials, selMaterials, setSelMaterials)} />
        <PickerColumn title="Services" items={services} selected={selServices} onChange={setSelServices} onToggleAll={() => toggleAll(services, selServices, setSelServices)} />
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Metric label="Combinaisons" value={combos.length} />
          <Metric label="À créer" value={toCreate.length} />
          <Metric label="Déjà existantes" value={existingCount} />
          <Metric label="Temps estimé" value={`~${Math.max(1, Math.round(estimatedSeconds / 60))} min`} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={run} disabled={running || toCreate.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold disabled:opacity-50">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? "Génération en cours..." : `Générer ${toCreate.length} page(s)`}
          </button>
          <button onClick={togglePause} disabled={!running} className="flex items-center gap-1.5 px-4 py-2 rounded-md border border-border text-sm disabled:opacity-50">
            {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />} {paused ? "Reprendre" : "Pause"}
          </button>
        </div>
        {progress.total > 0 && (
          <div className="space-y-1">
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            <div className="text-xs text-muted-foreground">
              {progress.done} / {progress.total} · {progress.errors} erreur(s)
            </div>
          </div>
        )}
        {log.length > 0 && (
          <div className="rounded-md bg-muted/40 p-3 max-h-48 overflow-auto text-xs font-mono space-y-0.5">
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-display font-bold text-foreground">{value}</div>
    </div>
  );
}

function PickerColumn({ title, items, selected, onChange, onToggleAll }: {
  title: string;
  items: Array<{ id: string; name: string; slug: string }>;
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
  onToggleAll: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display font-bold text-sm">{title}</h3>
        <button onClick={onToggleAll} className="text-xs text-primary hover:underline">
          {selected.size === items.length ? "Tout désélectionner" : "Tout sélectionner"}
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto space-y-0.5">
        {items.map((it) => (
          <label key={it.id} className="flex items-center gap-2 text-sm hover:bg-secondary rounded px-1.5 py-1 cursor-pointer">
            <input type="checkbox" checked={selected.has(it.id)}
              onChange={(e) => {
                const next = new Set(selected);
                if (e.target.checked) next.add(it.id); else next.delete(it.id);
                onChange(next);
              }} />
            <span className="font-body truncate">{it.name}</span>
          </label>
        ))}
        {items.length === 0 && <p className="text-xs text-muted-foreground p-2">Aucun élément actif.</p>}
      </div>
    </div>
  );
}

/* =========================================================================
 * SUGGESTIONS
 * ========================================================================= */
function SuggestionsTab() {
  const [suggestions, setSuggestions] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [c, m, s, p] = await Promise.all([
      supabase.from("seo_cities").select("id,slug,name,region,active,sort_order").eq("active", true).order("sort_order").limit(30),
      supabase.from("seo_materials").select("id,slug,name,short_name,description,active,sort_order").eq("active", true).order("sort_order").limit(20),
      supabase.from("seo_services").select("*").eq("active", true).order("sort_order").limit(20),
      supabase.from("seo_pages").select("slug"),
    ]);
    const existing = new Set((p.data ?? []).map((r) => r.slug));
    const out: Combo[] = [];
    for (const city of (c.data ?? []) as City[]) {
      for (const material of (m.data ?? []) as Material[]) {
        const slug = `${material.slug}-${city.slug}`;
        if (!existing.has(slug)) out.push({ city, material });
        if (out.length >= 50) break;
      }
      if (out.length >= 50) break;
    }
    setSuggestions(out);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const createOne = async (c: Combo) => {
    const slug = buildSlug(c);
    setCreating(slug);
    try {
      const { error } = await invokeWithFreshSession("seo-generate-page", {
        city: { slug: c.city.slug, name: c.city.name, region: c.city.region },
        material: c.material ? { slug: c.material.slug, name: c.material.name, short_name: c.material.short_name, description: c.material.description } : undefined,
        service: c.service ? { slug: c.service.slug, name: c.service.name, description: c.service.description } : undefined,
      });
      if (error) throw error;
      toast.success(`Page créée : /${slug}`);
      setSuggestions((list) => list.filter((x) => buildSlug(x) !== slug));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(null);
    }
  };

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-lg">Combinaisons manquantes</h2>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <RotateCcw className="w-4 h-4" /> Actualiser
        </button>
      </div>
      {suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Toutes les combinaisons ville × matériau sont déjà générées.</p>
      ) : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border">
          {suggestions.map((c) => {
            const slug = buildSlug(c);
            const label = [c.material?.name, "à", c.city.name].filter(Boolean).join(" ");
            return (
              <li key={slug} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-body text-foreground truncate">{label}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate">/{slug}</div>
                </div>
                <button onClick={() => createOne(c)} disabled={creating === slug}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-display font-semibold disabled:opacity-50">
                  {creating === slug ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Créer
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* =========================================================================
 * UI helpers
 * ========================================================================= */
function Spinner() {
  return <div className="text-center py-10 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg border border-border max-w-lg w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function LabeledInput({ label, value, onChange, mono, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; mono?: boolean; type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-display font-semibold text-muted-foreground">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm ${mono ? "font-mono" : ""}`} />
    </label>
  );
}

function LabeledTextarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-display font-semibold text-muted-foreground">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3}
        className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm" />
    </label>
  );
}

/* =========================================================================
 * ANALYTICS TAB — SEO score, structure, refresh queue
 * ========================================================================= */
function AnalyticsTab() {
  const [rows, setRows] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "needs_refresh" | "low_score">("all");
  const [regenerating, setRegenerating] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    let q = supabase.from("seo_pages").select("id, slug, city_slug, material_slug, service_slug, title, status, last_generated_at, created_at, view_count, seo_score, word_count, internal_link_count, needs_refresh").order("seo_score", { ascending: true, nullsFirst: true }).limit(500);
    if (filter === "needs_refresh") q = q.eq("needs_refresh", true);
    if (filter === "low_score") q = q.lt("seo_score", 70);
    const { data } = await q;
    setRows((data ?? []) as unknown as Page[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [filter]);

  const stats = useMemo(() => {
    const scored = rows.filter((r) => typeof r.seo_score === "number");
    const avg = scored.length ? Math.round(scored.reduce((s, r) => s + (r.seo_score ?? 0), 0) / scored.length) : 0;
    const excellent = rows.filter((r) => (r.seo_score ?? 0) >= 85).length;
    const good = rows.filter((r) => (r.seo_score ?? 0) >= 65 && (r.seo_score ?? 0) < 85).length;
    const weak = rows.filter((r) => typeof r.seo_score === "number" && r.seo_score < 65).length;
    const refresh = rows.filter((r) => r.needs_refresh).length;
    return { avg, excellent, good, weak, refresh };
  }, [rows]);

  const regenerate = async (page: Page) => {
    setRegenerating(page.id);
    try {
      const { data: city } = await supabase.from("seo_cities").select("slug, name, region").eq("slug", page.city_slug).maybeSingle();
      const { data: material } = page.material_slug ? await supabase.from("seo_materials").select("slug, name, short_name, description").eq("slug", page.material_slug).maybeSingle() : { data: null };
      const { data: service } = page.service_slug ? await supabase.from("seo_services").select("slug, name, description").eq("slug", page.service_slug).maybeSingle() : { data: null };
      const res = await invokeWithFreshSession("seo-generate-page", { body: { city, material, service, force: true } });
      if ((res as any)?.error) throw new Error((res as any).error?.message || "Erreur");
      toast.success("Page régénérée");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de régénération");
    } finally {
      setRegenerating(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Score moyen" value={stats.avg} />
        <StatCard label="Excellent (85+)" value={stats.excellent} />
        <StatCard label="Bon (65-84)" value={stats.good} />
        <StatCard label="À améliorer" value={stats.weak} />
        <StatCard label="À rafraîchir" value={stats.refresh} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "needs_refresh", "low_score"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-sm font-display font-semibold ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}>
            {f === "all" ? "Toutes" : f === "needs_refresh" ? "À rafraîchir" : "Score faible"}
          </button>
        ))}
      </div>

      {loading ? <Spinner /> : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune page.</p>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-3">Page</th>
                <th className="text-center p-3">Score</th>
                <th className="text-center p-3">Mots</th>
                <th className="text-center p-3">Liens int.</th>
                <th className="text-center p-3">Statut</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="p-3 min-w-0">
                    <div className="font-body text-foreground truncate max-w-[420px]">{r.title}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">/{r.slug}</div>
                  </td>
                  <td className="p-3 text-center">
                    <ScoreBadge score={r.seo_score} />
                  </td>
                  <td className="p-3 text-center text-foreground">{r.word_count ?? "—"}</td>
                  <td className="p-3 text-center text-foreground">{r.internal_link_count ?? "—"}</td>
                  <td className="p-3 text-center">
                    {r.needs_refresh ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 font-display font-semibold">
                        <RefreshCw className="w-3 h-3" /> À rafraîchir
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">À jour</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end items-center gap-2">
                      <Link to={`/${r.slug}`} target="_blank" className="text-primary hover:underline text-xs inline-flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> Voir
                      </Link>
                      <button onClick={() => regenerate(r)} disabled={regenerating === r.id}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-primary text-primary-foreground font-display font-semibold hover:opacity-90 disabled:opacity-50">
                        {regenerating === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        Régénérer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>;
  const color = score >= 85 ? "bg-primary/20 text-primary" : score >= 65 ? "bg-amber-500/15 text-amber-600" : "bg-destructive/15 text-destructive";
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-display font-bold ${color}`}>{score}/100</span>;
}
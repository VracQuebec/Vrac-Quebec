import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRole";
import { useAuthReady } from "@/hooks/useAuthReady";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";
import { toast } from "sonner";
import {
  ArrowLeft, LayoutDashboard, MapPin, Package, Wrench, Sparkles, Lightbulb,
  Loader2, Plus, Trash2, Play, Pause, RotateCcw, Save, ExternalLink,
} from "lucide-react";

type Tab = "dashboard" | "cities" | "materials" | "services" | "generator" | "suggestions";

type City = { id: string; slug: string; name: string; region: string; active: boolean; sort_order: number };
type Material = { id: string; slug: string; name: string; short_name: string; description: string; active: boolean; sort_order: number };
type Service = { id: string; slug: string; name: string; short_name: string | null; description: string; keywords: string[]; active: boolean; sort_order: number };
type Page = { id: string; slug: string; city_slug: string; material_slug: string | null; service_slug: string | null; title: string; status: string; last_generated_at: string | null; created_at: string; view_count: number };

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
    { id: "services", label: "Services", icon: Wrench },
    { id: "generator", label: "Générateur", icon: Sparkles },
    { id: "suggestions", label: "Suggestions", icon: Lightbulb },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Link to="/admin" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> CRM
          </Link>
          <h1 className="text-lg font-display font-bold text-foreground">SEO Manager</h1>
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
          {tab === "services" && <ServicesTab />}
          {tab === "generator" && <GeneratorTab />}
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
  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("seo_cities").select("id,slug,name,region,active,sort_order").order("sort_order");
    setRows((data ?? []) as City[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  return (
    <SimpleAdminList
      title="Villes"
      rows={rows.map((r) => ({ id: r.id, name: r.name, sub: `${r.region} · /${r.slug}`, active: r.active }))}
      loading={loading}
      onToggle={async (id) => {
        const row = rows.find((r) => r.id === id)!;
        await supabase.from("seo_cities").update({ active: !row.active }).eq("id", id);
        load();
      }}
      onDelete={async (id) => {
        if (!confirm("Supprimer cette ville ?")) return;
        await supabase.from("seo_cities").delete().eq("id", id);
        load();
      }}
      extra={
        <Link to="/admin/seo" className="text-sm text-primary hover:underline">
          Éditeur complet (villes / matériaux / usages) →
        </Link>
      }
    />
  );
}

function MaterialsTab() {
  const [rows, setRows] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("seo_materials").select("id,slug,name,short_name,description,active,sort_order").order("sort_order");
    setRows((data ?? []) as Material[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  return (
    <SimpleAdminList
      title="Matériaux"
      rows={rows.map((r) => ({ id: r.id, name: r.name, sub: `/${r.slug}`, active: r.active }))}
      loading={loading}
      onToggle={async (id) => {
        const row = rows.find((r) => r.id === id)!;
        await supabase.from("seo_materials").update({ active: !row.active }).eq("id", id);
        load();
      }}
      onDelete={async (id) => {
        if (!confirm("Supprimer ce matériau ?")) return;
        await supabase.from("seo_materials").delete().eq("id", id);
        load();
      }}
      extra={<Link to="/admin/seo" className="text-sm text-primary hover:underline">Éditeur complet →</Link>}
    />
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
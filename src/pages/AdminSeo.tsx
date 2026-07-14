import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRole";
import { useAuthReady } from "@/hooks/useAuthReady";
import { refreshSeoData } from "@/hooks/useSeoData";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Save, Loader2, Search as SearchIcon } from "lucide-react";

type Tab = "cities" | "materials" | "uses";

type CityRow = {
  id?: string;
  slug: string;
  name: string;
  region: string;
  latitude: number | null;
  longitude: number | null;
  population: number | null;
  intro: string | null;
  neighbors: string[];
  active: boolean;
  sort_order: number;
};

type MaterialRow = {
  id?: string;
  slug: string;
  name: string;
  short_name: string;
  keywords: string[];
  use_cases: string[];
  delivery_unit: string;
  related_materials: string[];
  description: string;
  active: boolean;
  sort_order: number;
};

type UseRow = {
  id?: string;
  slug: string;
  material_slug: string;
  name: string;
  description: string;
  active: boolean;
  sort_order: number;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

export default function AdminSeo() {
  const { isReady: authReady, user } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, authReady);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("cities");

  useEffect(() => {
    if (authReady && !user) navigate("/login");
    if (authReady && user && !roleLoading && !isAdmin) navigate("/");
  }, [authReady, user, isAdmin, roleLoading, navigate]);

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Link to="/admin" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> CRM
          </Link>
          <h1 className="text-lg font-display font-bold text-foreground">SEO Local</h1>
          <nav className="ml-auto flex items-center gap-1">
            {(["cities", "materials", "uses"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-md text-sm font-display font-semibold ${
                  tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
                }`}
              >
                {t === "cities" ? "Villes" : t === "materials" ? "Matériaux" : "Usages"}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {tab === "cities" && <CitiesTab />}
        {tab === "materials" && <MaterialsTab />}
        {tab === "uses" && <UsesTab />}
      </main>
    </div>
  );
}

/* ============================================================
 * VILLES
 * ============================================================ */
function CitiesTab() {
  const [rows, setRows] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<CityRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("seo_cities").select("*").order("sort_order");
    if (error) toast.error(error.message);
    setRows((data ?? []) as CityRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(t) || r.slug.toLowerCase().includes(t) || (r.region || "").toLowerCase().includes(t));
  }, [rows, q]);

  const toggleActive = async (row: CityRow) => {
    const { error } = await supabase.from("seo_cities").update({ active: !row.active }).eq("id", row.id!);
    if (error) return toast.error(error.message);
    toast.success(row.active ? "Ville désactivée" : "Ville activée");
    load(); refreshSeoData();
  };

  const remove = async (row: CityRow) => {
    if (!confirm(`Supprimer définitivement ${row.name} ?`)) return;
    const { error } = await supabase.from("seo_cities").delete().eq("id", row.id!);
    if (error) return toast.error(error.message);
    toast.success("Ville supprimée");
    load(); refreshSeoData();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher une ville..."
            className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-card text-sm"
          />
        </div>
        <button
          onClick={() => setEditing({
            slug: "", name: "", region: "", latitude: null, longitude: null,
            population: null, intro: "", neighbors: [], active: true,
            sort_order: (rows.at(-1)?.sort_order ?? 0) + 10,
          })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold"
        >
          <Plus className="w-4 h-4" /> Ajouter une ville
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-display">Nom</th>
                <th className="px-3 py-2 font-display">Slug</th>
                <th className="px-3 py-2 font-display">Région</th>
                <th className="px-3 py-2 font-display">Voisins</th>
                <th className="px-3 py-2 font-display">Statut</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-2 font-body">{r.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.slug}</td>
                  <td className="px-3 py-2 font-body">{r.region}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.neighbors.length} villes</td>
                  <td className="px-3 py-2">
                    <button onClick={() => toggleActive(r)} className={`px-2 py-0.5 rounded text-xs font-semibold ${r.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {r.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setEditing(r)} className="px-2 py-1 text-xs text-primary hover:underline">Modifier</button>
                    <button onClick={() => remove(r)} className="px-2 py-1 text-xs text-destructive hover:underline"><Trash2 className="w-3.5 h-3.5 inline" /></button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Aucune ville</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <CityEditor
          initial={editing}
          allCities={rows}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); refreshSeoData(); }}
        />
      )}
    </div>
  );
}

function CityEditor({ initial, allCities, onClose, onSaved }: {
  initial: CityRow; allCities: CityRow[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<CityRow>(initial);
  const [saving, setSaving] = useState(false);
  const isNew = !initial.id;

  const save = async () => {
    if (!form.name.trim()) return toast.error("Nom requis");
    const slug = form.slug.trim() || slugify(form.name);
    setSaving(true);
    const payload = { ...form, slug };
    const { error } = isNew
      ? await supabase.from("seo_cities").insert(payload)
      : await supabase.from("seo_cities").update(payload).eq("id", initial.id!);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isNew ? "Ville créée" : "Ville mise à jour");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold text-lg">{isNew ? "Nouvelle ville" : `Modifier ${initial.name}`}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: form.slug || slugify(e.target.value) })} className={input} />
            </Field>
            <Field label="Slug (URL)">
              <input value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} className={`${input} font-mono`} />
            </Field>
            <Field label="Région">
              <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className={input} />
            </Field>
            <Field label="Population">
              <input type="number" value={form.population ?? ""} onChange={(e) => setForm({ ...form, population: e.target.value ? Number(e.target.value) : null })} className={input} />
            </Field>
            <Field label="Latitude">
              <input type="number" step="0.0001" value={form.latitude ?? ""} onChange={(e) => setForm({ ...form, latitude: e.target.value ? Number(e.target.value) : null })} className={input} />
            </Field>
            <Field label="Longitude">
              <input type="number" step="0.0001" value={form.longitude ?? ""} onChange={(e) => setForm({ ...form, longitude: e.target.value ? Number(e.target.value) : null })} className={input} />
            </Field>
          </div>
          <Field label="Introduction (optionnel)">
            <textarea value={form.intro ?? ""} onChange={(e) => setForm({ ...form, intro: e.target.value })} rows={2} className={input} />
          </Field>
          <Field label="Villes voisines">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-48 overflow-y-auto p-2 rounded border border-border">
              {allCities.filter((c) => c.slug !== form.slug).map((c) => (
                <label key={c.slug} className="flex items-center gap-1.5 text-xs font-body">
                  <input
                    type="checkbox"
                    checked={form.neighbors.includes(c.slug)}
                    onChange={(e) => setForm({
                      ...form,
                      neighbors: e.target.checked
                        ? [...form.neighbors, c.slug]
                        : form.neighbors.filter((s) => s !== c.slug),
                    })}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ordre d'affichage">
              <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} className={input} />
            </Field>
            <Field label="Active">
              <label className="flex items-center gap-2 mt-2">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                <span className="text-sm">Affichée publiquement</span>
              </label>
            </Field>
          </div>
        </div>
        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-border text-sm">Annuler</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * MATÉRIAUX
 * ============================================================ */
function MaterialsTab() {
  const [rows, setRows] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<MaterialRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("seo_materials").select("*").order("sort_order");
    if (error) toast.error(error.message);
    setRows((data ?? []) as MaterialRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(t) || r.slug.toLowerCase().includes(t));
  }, [rows, q]);

  const toggleActive = async (row: MaterialRow) => {
    const { error } = await supabase.from("seo_materials").update({ active: !row.active }).eq("id", row.id!);
    if (error) return toast.error(error.message);
    load(); refreshSeoData();
  };
  const remove = async (row: MaterialRow) => {
    if (!confirm(`Supprimer ${row.name} ?`)) return;
    const { error } = await supabase.from("seo_materials").delete().eq("id", row.id!);
    if (error) return toast.error(error.message);
    toast.success("Matériau supprimé");
    load(); refreshSeoData();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher..." className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-card text-sm" />
        </div>
        <button
          onClick={() => setEditing({
            slug: "", name: "", short_name: "", keywords: [], use_cases: [],
            pricing_hint: "", delivery_unit: "tonne", related_materials: [],
            description: "", active: true, sort_order: (rows.at(-1)?.sort_order ?? 0) + 10,
          })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold"
        >
          <Plus className="w-4 h-4" /> Ajouter un matériau
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-display">Nom</th>
                <th className="px-3 py-2 font-display">Slug</th>
                <th className="px-3 py-2 font-display">Prix indicatif</th>
                <th className="px-3 py-2 font-display">Unité</th>
                <th className="px-3 py-2 font-display">Statut</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-2 font-body">{r.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.slug}</td>
                  <td className="px-3 py-2 text-xs">{r.pricing_hint}</td>
                  <td className="px-3 py-2 text-xs">{r.delivery_unit}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => toggleActive(r)} className={`px-2 py-0.5 rounded text-xs font-semibold ${r.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {r.active ? "Actif" : "Inactif"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setEditing(r)} className="px-2 py-1 text-xs text-primary hover:underline">Modifier</button>
                    <button onClick={() => remove(r)} className="px-2 py-1 text-xs text-destructive hover:underline"><Trash2 className="w-3.5 h-3.5 inline" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <MaterialEditor
          initial={editing}
          allMaterials={rows}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); refreshSeoData(); }}
        />
      )}
    </div>
  );
}

function MaterialEditor({ initial, allMaterials, onClose, onSaved }: {
  initial: MaterialRow; allMaterials: MaterialRow[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<MaterialRow>(initial);
  const [saving, setSaving] = useState(false);
  const isNew = !initial.id;

  const save = async () => {
    if (!form.name.trim()) return toast.error("Nom requis");
    const slug = form.slug.trim() || slugify(form.name);
    const payload = { ...form, slug, short_name: form.short_name || form.name };
    setSaving(true);
    const { error } = isNew
      ? await supabase.from("seo_materials").insert(payload)
      : await supabase.from("seo_materials").update(payload).eq("id", initial.id!);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(isNew ? "Matériau créé" : "Matériau mis à jour");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg border border-border max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold text-lg">{isNew ? "Nouveau matériau" : `Modifier ${initial.name}`}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom complet">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: form.slug || slugify(e.target.value) })} className={input} />
            </Field>
            <Field label="Nom court">
              <input value={form.short_name} onChange={(e) => setForm({ ...form, short_name: e.target.value })} className={input} />
            </Field>
            <Field label="Slug (URL)">
              <input value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} className={`${input} font-mono`} />
            </Field>
            <Field label="Unité de livraison">
              <select value={form.delivery_unit} onChange={(e) => setForm({ ...form, delivery_unit: e.target.value })} className={input}>
                <option value="tonne">tonne</option>
                <option value="verge cube">verge cube</option>
              </select>
            </Field>
          </div>
          <Field label="Prix indicatif">
            <input value={form.pricing_hint} onChange={(e) => setForm({ ...form, pricing_hint: e.target.value })} placeholder="ex : à partir de 30 $ / tonne livrée" className={input} />
          </Field>
          <Field label="Description (1–2 phrases)">
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className={input} />
          </Field>
          <Field label="Mots-clés (un par ligne)">
            <textarea
              value={form.keywords.join("\n")}
              onChange={(e) => setForm({ ...form, keywords: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
              rows={3} className={input}
            />
          </Field>
          <Field label="Utilisations courantes (une par ligne)">
            <textarea
              value={form.use_cases.join("\n")}
              onChange={(e) => setForm({ ...form, use_cases: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
              rows={4} className={input}
            />
          </Field>
          <Field label="Matériaux similaires">
            <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto p-2 rounded border border-border">
              {allMaterials.filter((m) => m.slug !== form.slug).map((m) => (
                <label key={m.slug} className="flex items-center gap-1.5 text-xs font-body">
                  <input
                    type="checkbox"
                    checked={form.related_materials.includes(m.slug)}
                    onChange={(e) => setForm({
                      ...form,
                      related_materials: e.target.checked
                        ? [...form.related_materials, m.slug]
                        : form.related_materials.filter((s) => s !== m.slug),
                    })}
                  />
                  {m.name}
                </label>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ordre">
              <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} className={input} />
            </Field>
            <Field label="Actif">
              <label className="flex items-center gap-2 mt-2">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                <span className="text-sm">Affiché publiquement</span>
              </label>
            </Field>
          </div>
        </div>
        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-border text-sm">Annuler</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * USAGES (pages « par utilisation »)
 * ============================================================ */
function UsesTab() {
  const [rows, setRows] = useState<UseRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UseRow | null>(null);

  const load = async () => {
    setLoading(true);
    const [u, m] = await Promise.all([
      supabase.from("seo_material_uses").select("*").order("sort_order"),
      supabase.from("seo_materials").select("*").order("sort_order"),
    ]);
    setRows((u.data ?? []) as UseRow[]);
    setMaterials((m.data ?? []) as MaterialRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async (row: UseRow) => {
    if (!row.name.trim()) return toast.error("Nom requis");
    if (!row.material_slug) return toast.error("Matériau requis");
    const slug = row.slug.trim() || slugify(row.name);
    const payload = { ...row, slug };
    const { error } = row.id
      ? await supabase.from("seo_material_uses").update(payload).eq("id", row.id)
      : await supabase.from("seo_material_uses").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Enregistré");
    setEditing(null); load(); refreshSeoData();
  };

  const remove = async (row: UseRow) => {
    if (!confirm("Supprimer ?")) return;
    await supabase.from("seo_material_uses").delete().eq("id", row.id!);
    load(); refreshSeoData();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground font-body">
          Créez des pages ciblées comme <code>terre-pour-gazon</code>, <code>gravier-pour-entree</code>, etc.
        </p>
        <button
          onClick={() => setEditing({
            slug: "", material_slug: materials[0]?.slug ?? "", name: "",
            description: "", active: true, sort_order: (rows.at(-1)?.sort_order ?? 0) + 10,
          })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold"
        >
          <Plus className="w-4 h-4" /> Ajouter un usage
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="px-3 py-2 font-display">Nom</th>
                <th className="px-3 py-2 font-display">Slug</th>
                <th className="px-3 py-2 font-display">Matériau</th>
                <th className="px-3 py-2 font-display">Statut</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-2 font-body">{r.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.slug}</td>
                  <td className="px-3 py-2 text-xs">{r.material_slug}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${r.active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {r.active ? "Actif" : "Inactif"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setEditing(r)} className="px-2 py-1 text-xs text-primary hover:underline">Modifier</button>
                    <button onClick={() => remove(r)} className="px-2 py-1 text-xs text-destructive hover:underline"><Trash2 className="w-3.5 h-3.5 inline" /></button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Aucun usage défini pour l'instant</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <UseEditor
          initial={editing}
          materials={materials}
          onClose={() => setEditing(null)}
          onSaved={save}
        />
      )}
    </div>
  );
}

function UseEditor({ initial, materials, onClose, onSaved }: {
  initial: UseRow; materials: MaterialRow[]; onClose: () => void; onSaved: (r: UseRow) => void;
}) {
  const [form, setForm] = useState<UseRow>(initial);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg border border-border max-w-xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold text-lg">{initial.id ? "Modifier l'usage" : "Nouvel usage"}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <Field label="Nom (ex : Terre pour gazon)">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: form.slug || slugify(e.target.value) })} className={input} />
          </Field>
          <Field label="Slug (URL)">
            <input value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} className={`${input} font-mono`} />
          </Field>
          <Field label="Matériau associé">
            <select value={form.material_slug} onChange={(e) => setForm({ ...form, material_slug: e.target.value })} className={input}>
              {materials.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="Description SEO courte">
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className={input} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ordre">
              <input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} className={input} />
            </Field>
            <Field label="Actif">
              <label className="flex items-center gap-2 mt-2">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                <span>Affiché publiquement</span>
              </label>
            </Field>
          </div>
        </div>
        <div className="p-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-md border border-border text-sm">Annuler</button>
          <button onClick={() => onSaved(form)} className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold">
            <Save className="w-4 h-4" /> Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * Utils
 * ============================================================ */
const input = "w-full px-3 py-2 rounded-md border border-border bg-background text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-display font-semibold text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}
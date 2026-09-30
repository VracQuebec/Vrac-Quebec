// TAXONOMIE DES SERVICES — administration de la place de marché.
// Catégorie → sous-catégorie → service : renommer, trier, activer/désactiver, ajouter.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useDraft } from "@/lib/drafts/useDraft";
import DraftStatusBar from "@/components/drafts/DraftStatusBar";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ChevronDown, ChevronRight, Plus, Save, Search } from "lucide-react";
import { fetchCategories, saveCategory } from "@/lib/marketplace/api";
import type { ServiceCategory } from "@/lib/marketplace/types";

type Node = ServiceCategory & { children: Node[] };

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function tree(rows: ServiceCategory[]): Node[] {
  const byParent = new Map<string | null, ServiceCategory[]>();
  rows.forEach((r) => {
    const list = byParent.get(r.parent_id) ?? [];
    list.push(r);
    byParent.set(r.parent_id, list);
  });
  const build = (id: string | null): Node[] =>
    (byParent.get(id) ?? []).map((c) => ({ ...c, children: build(c.id) }));
  return build(null);
}

export default function AdminMarketplaceCategories() {
  const { isReady, isAuthenticated } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles();
  const { toast } = useToast();
  const [rows, setRows] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  // NAV-01B : modifications non enregistrées par catégorie + ajout en préparation (remplace la question native).
  // Rien n'est écrit au serveur avant le bouton d'enregistrement de la ligne ou « Ajouter ».
  const [edits, setEdits] = useState<Record<string, Partial<ServiceCategory>>>({});
  const [adding, setAdding] = useState<{ parentId: string | null; name: string } | null>(null);
  const { user: me } = useAuthReady();
  const catDraft = useDraft({
    id: me && isAdmin ? { module: "admin", form: "marche-categories", owner: me.id, company: null, recordId: "arbre" } : null,
    data: { edits, adding }, label: () => "Place de marché — catégories (modifications en cours)", route: "/admin/marche/categories",
    isEmpty: (d) => !Object.keys(d.edits ?? {}).length && !d.adding?.name?.trim(),
    onRestore: (d) => { setEdits(d.edits ?? {}); setAdding(d.adding ?? null); },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await fetchCategories(false);
      setRows(fresh);
    } catch (e) {
      toast({ title: "Chargement impossible", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isReady && !roleLoading && isAdmin) void load();
  }, [isReady, roleLoading, isAdmin, load]);

  const nodes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tree(view);
    const match = (r: ServiceCategory) => r.name.toLowerCase().includes(term);
    const keep = new Set<string>();
    view.forEach((r) => {
      if (match(r)) {
        keep.add(r.id);
        let parent = r.parent_id;
        while (parent) {
          keep.add(parent);
          parent = view.find((x) => x.id === parent)?.parent_id ?? null;
        }
      }
    });
    return tree(view.filter((r) => keep.has(r.id)));
  }, [view, search]);

  // Les modifications en cours (restaurées ou saisies) s'appliquent par-dessus la version serveur, sans l'écraser.
  const view = useMemo(() => rows.map((r) => (edits[r.id] ? { ...r, ...edits[r.id] } : r)), [rows, edits]);
  const patch = (id: string, updates: Partial<ServiceCategory>) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...updates } }));

  const persist = async (row: ServiceCategory) => {
    setSaving(true);
    try {
      await saveCategory({
        id: row.id,
        parent_id: row.parent_id,
        level: row.level,
        name: row.name,
        slug: row.slug || slugify(row.name),
        sort_order: Number(row.sort_order) || 0,
        is_active: row.is_active,
      } as Partial<ServiceCategory> & { name: string; slug: string });
      toast({ title: "Enregistré" });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...row } : r)));
      setEdits((prev) => { const n = { ...prev }; delete n[row.id]; if (!Object.keys(n).length && !adding?.name?.trim()) catDraft.finalize(); return n; });
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addChild = async (parent: Node | null) => {
    const level = parent === null ? "categorie" : parent.level === "categorie" ? "sous_categorie" : "service";
    const label = level === "categorie" ? "Nouvelle catégorie" : level === "sous_categorie" ? "Nouvelle sous-catégorie" : "Nouveau service";
    if (!adding || adding.parentId !== (parent?.id ?? null) || !adding.name.trim()) { setAdding({ parentId: parent?.id ?? null, name: adding?.parentId === (parent?.id ?? null) ? adding.name : "" }); void label; return; }
    const name = adding.name.trim();
    const siblings = parent ? parent.children : nodes;
    try {
      await saveCategory({
        parent_id: parent?.id ?? null,
        level,
        name,
        slug: slugify(name),
        sort_order: (siblings.length + 1) * 10,
        is_active: true,
      } as Partial<ServiceCategory> & { name: string; slug: string });
      setAdding(null); if (!Object.keys(edits).length) catDraft.finalize();
      await load();
    } catch (e) {
      toast({ title: "Ajout impossible", description: String((e as Error).message), variant: "destructive" });
    }
  };

  if (!isReady || roleLoading) return <FullPageState title="Chargement des catégories" />;
  if (!isAuthenticated) return <FullPageState title="Connexion requise" message="Connectez-vous pour accéder à cette page." showSpinner={false} />;
  if (!isAdmin) return <FullPageState title="Accès refusé" message="Réservé aux administrateurs Vrac Québec." showSpinner={false} />;

  const renderNode = (node: Node, depth: number) => {
    const expanded = open[node.id] ?? false;
    return (
      <div key={node.id} className="border-b border-border/60 last:border-0">
        <div className="flex flex-wrap items-center gap-2 py-2" style={{ paddingLeft: depth * 16 }}>
          <button
            type="button"
            className="p-1 text-muted-foreground shrink-0"
            aria-label={expanded ? "Réduire" : "Déplier"}
            onClick={() => setOpen((p) => ({ ...p, [node.id]: !expanded }))}
          >
            {node.children.length === 0 ? <span className="inline-block w-4" /> : expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <Input
            value={node.name}
            onChange={(e) => patch(node.id, { name: e.target.value })}
            className="h-9 flex-1 min-w-[180px]"
          />
          <Input
            type="number"
            value={node.sort_order ?? 0}
            onChange={(e) => patch(node.id, { sort_order: Number(e.target.value) })}
            className="h-9 w-20"
            aria-label="Ordre"
          />
          <div className="flex items-center gap-2">
            <Switch checked={node.is_active} onCheckedChange={(v) => patch(node.id, { is_active: v })} aria-label="Actif" />
            <span className="text-xs font-body text-muted-foreground">{node.is_active ? "Actif" : "Inactif"}</span>
          </div>
          <Button size="sm" variant="outline" disabled={saving} onClick={() => void persist(node)}>
            <Save className="h-4 w-4" />
          </Button>
          {node.level !== "service" && (
            <Button size="sm" variant="ghost" onClick={() => void addChild(node)}>
              <Plus className="h-4 w-4 mr-1" />
              {node.level === "categorie" ? "Sous-catégorie / service" : "Service"}
            </Button>
          )}
        </div>
        {expanded && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex flex-wrap items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" />Admin</Link>
          </Button>
          <h1 className="text-xl font-display font-bold">Catégories de services</h1>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="h-9 pl-8 w-44" />
            </div>
            <Button size="sm" onClick={() => void addChild(null)}>
              <Plus className="h-4 w-4 mr-1" />Catégorie
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <p className="text-sm font-body text-muted-foreground mb-4">
          Structure officielle des services offerts par les entreprises partenaires. Une entreprise peut être associée à
          plusieurs catégories et services.
        </p>
        {loading ? (
          <p className="font-body text-muted-foreground">Chargement…</p>
        ) : nodes.length === 0 ? (
          <p className="font-body text-muted-foreground">Aucune catégorie.</p>
        ) : (
          <div className="rounded-xl border border-border bg-card px-3">
            {nodes.map((n) => renderNode(n, 0))}
          </div>
        )}
      </main>
    </div>
  );
}

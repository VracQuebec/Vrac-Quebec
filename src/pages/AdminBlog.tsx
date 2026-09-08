import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRole";
import { useAuthReady } from "@/hooks/useAuthReady";
import { toast } from "sonner";
import {
  Plus, Search as SearchIcon, ArrowLeft, Edit3, Copy, Trash2, Eye, EyeOff, Calendar as CalIcon, Loader2,
} from "lucide-react";
import type { BlogPostWithRelations } from "@/lib/blog/types";
import { formatDateFr } from "@/lib/blog/utils";

type Status = "all" | "draft" | "published" | "scheduled" | "archived";

export default function AdminBlog() {
  const { isReady: authReady, user } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, authReady);
  const navigate = useNavigate();
  const [posts, setPosts] = useState<BlogPostWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Status>("all");

  useEffect(() => {
    if (authReady && !user) navigate("/login");
    if (authReady && user && !roleLoading && !isAdmin) navigate("/");
  }, [authReady, user, isAdmin, roleLoading, navigate]);

  const load = async () => {
    setLoading(true);
    let query = supabase
      .from("blog_posts")
      .select(
        "id, slug, title, excerpt, status, published_at, scheduled_at, view_count, is_featured, is_popular, reading_time_minutes, created_at, updated_at, cover_image_url, category_id, author_id, blog_categories:category_id (id, slug, name, color), blog_authors:author_id (id, slug, name, avatar_url, title)"
      )
      .order("updated_at", { ascending: false })
      .limit(200);
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setPosts((data ?? []) as unknown as BlogPostWithRelations[]);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, status]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return posts;
    return posts.filter(
      (p) => p.title.toLowerCase().includes(t) || p.slug.toLowerCase().includes(t) || (p.excerpt ?? "").toLowerCase().includes(t)
    );
  }, [posts, q]);

  const duplicate = async (p: BlogPostWithRelations) => {
    const payload = {
      title: `${p.title} (copie)`,
      slug: `${p.slug}-copie-${Math.random().toString(36).slice(2, 7)}`,
      excerpt: p.excerpt,
      content: p.content,
      cover_image_url: p.cover_image_url,
      cover_image_alt: p.cover_image_alt,
      category_id: p.category_id,
      author_id: p.author_id,
      status: "draft" as const,
      meta_title: p.meta_title,
      meta_description: p.meta_description,
    };
    const { data, error } = await supabase
      .from("blog_posts")
      .insert(payload)
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    toast.success("Article dupliqué");
    if (data) navigate(`/admin/blogue/editer/${data.id}`);
  };

  const remove = async (p: BlogPostWithRelations) => {
    if (!confirm(`Supprimer définitivement « ${p.title} » ?`)) return;
    const { error } = await supabase.from("blog_posts").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Article supprimé");
    load();
  };

  const togglePublish = async (p: BlogPostWithRelations) => {
    const next = p.status === "published" ? "draft" : "published";
    const { error } = await supabase
      .from("blog_posts")
      .update({ status: next, ...(next === "published" && !p.published_at ? { published_at: new Date().toISOString() } : {}) })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(next === "published" ? "Publié" : "Repassé en brouillon");
    load();
  };

  if (!authReady || roleLoading) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky-below-nav z-40">
        <div className="container mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Admin
            </Link>
            <h1 className="font-display font-extrabold text-lg text-foreground">Blogue — CMS</h1>
          </div>
          <div className="flex gap-2">
            <Link
              to="/admin/blogue/idees"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground font-display font-bold text-sm shadow hover:opacity-90"
            >
              Plan éditorial
            </Link>
            <Link
              to="/admin/blogue/maillage"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary/15 text-primary font-display font-bold text-sm shadow hover:opacity-90"
            >
              Maillage SEO
            </Link>
            <Link
              to="/admin/blogue/generer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-foreground text-background font-display font-bold text-sm shadow hover:opacity-90"
            >
              Génération IA
            </Link>
            <Link
              to="/admin/blogue/editer/nouveau"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm shadow hover:opacity-90"
            >
              <Plus className="w-4 h-4" /> Nouvel article
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card font-body text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {(["all", "draft", "published", "scheduled", "archived"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-display font-semibold ${
                  status === s ? "bg-foreground text-background" : "bg-muted text-foreground hover:bg-foreground/10"
                }`}
              >
                {s === "all" ? "Tous" : s === "draft" ? "Brouillons" : s === "published" ? "Publiés" : s === "scheduled" ? "Planifiés" : "Archivés"}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground font-body">
            Aucun article. Cliquez sur « Nouvel article » pour commencer.
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Titre</th>
                  <th className="text-left px-4 py-2 font-semibold hidden md:table-cell">Catégorie</th>
                  <th className="text-left px-4 py-2 font-semibold">Statut</th>
                  <th className="text-left px-4 py-2 font-semibold hidden lg:table-cell">Publié</th>
                  <th className="text-left px-4 py-2 font-semibold hidden lg:table-cell">Vues</th>
                  <th className="text-right px-4 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <Link to={`/admin/blogue/editer/${p.id}`} className="font-semibold text-foreground hover:text-primary line-clamp-1">
                        {p.title}
                      </Link>
                      <div className="text-xs text-muted-foreground truncate">/{p.slug}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {p.blog_categories ? (
                        <span
                          className="inline-block px-2 py-0.5 rounded-full text-white text-[10px] uppercase font-bold"
                          style={{ backgroundColor: p.blog_categories.color || "#7ED321" }}
                        >
                          {p.blog_categories.name}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">
                      {p.status === "scheduled" ? (
                        <span className="flex items-center gap-1"><CalIcon className="w-3 h-3" /> {formatDateFr(p.scheduled_at)}</span>
                      ) : (
                        formatDateFr(p.published_at) || "—"
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">{p.view_count}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Link to={`/admin/blogue/editer/${p.id}`} className="p-2 rounded hover:bg-muted" title="Modifier">
                          <Edit3 className="w-4 h-4" />
                        </Link>
                        <button onClick={() => togglePublish(p)} className="p-2 rounded hover:bg-muted" title={p.status === "published" ? "Retirer" : "Publier"}>
                          {p.status === "published" ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button onClick={() => duplicate(p)} className="p-2 rounded hover:bg-muted" title="Dupliquer">
                          <Copy className="w-4 h-4" />
                        </button>
                        <button onClick={() => remove(p)} className="p-2 rounded hover:bg-muted text-destructive" title="Supprimer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    published: { bg: "bg-green-500/15 text-green-700 dark:text-green-400", label: "Publié" },
    draft: { bg: "bg-muted text-muted-foreground", label: "Brouillon" },
    scheduled: { bg: "bg-blue-500/15 text-blue-700 dark:text-blue-400", label: "Planifié" },
    archived: { bg: "bg-orange-500/15 text-orange-700 dark:text-orange-400", label: "Archivé" },
  };
  const s = map[status] || map.draft;
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.bg}`}>{s.label}</span>;
}
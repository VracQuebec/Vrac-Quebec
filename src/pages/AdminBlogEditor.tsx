import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRole";
import { useAuthReady } from "@/hooks/useAuthReady";
import { toast } from "sonner";
import {
  ArrowLeft, Save, Eye, Trash2, Image as ImageIcon, Loader2, ExternalLink, Copy as CopyIcon,
  Sparkles,
} from "lucide-react";
import type { BlogAuthor, BlogCategory, BlogPost, BlogTag } from "@/lib/blog/types";
import { estimateReadingTime, sanitizeHtml, slugify, SITE_URL } from "@/lib/blog/utils";

type Tab = "content" | "seo" | "related" | "settings";

export default function AdminBlogEditor() {
  const { id = "nouveau" } = useParams();
  const isNew = id === "nouveau";
  const navigate = useNavigate();
  const { isReady: authReady, user } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, authReady);

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [tab, setTab] = useState<Tab>("content");

  const [postId, setPostId] = useState<string | null>(isNew ? null : id);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [coverAlt, setCoverAlt] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [authorId, setAuthorId] = useState<string | null>(null);
  const [status, setStatus] = useState<BlogPost["status"]>("draft");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [canonical, setCanonical] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [isPopular, setIsPopular] = useState(false);
  const [noindex, setNoindex] = useState(false);

  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [authors, setAuthors] = useState<BlogAuthor[]>([]);
  const [allTags, setAllTags] = useState<BlogTag[]>([]);
  const [tags, setTags] = useState<string[]>([]); // tag ids
  const [newTag, setNewTag] = useState("");
  const [uploading, setUploading] = useState(false);
  const [aiKeyword, setAiKeyword] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (authReady && !user) navigate("/login");
    if (authReady && user && !roleLoading && !isAdmin) navigate("/");
  }, [authReady, user, isAdmin, roleLoading, navigate]);

  useEffect(() => {
    (async () => {
      const [cats, auths, tgs] = await Promise.all([
        supabase.from("blog_categories").select("*").order("sort_order"),
        supabase.from("blog_authors").select("*").order("name"),
        supabase.from("blog_tags").select("*").order("name"),
      ]);
      setCategories(cats.data ?? []);
      setAuthors(auths.data ?? []);
      setAllTags(tgs.data ?? []);
    })();
  }, []);

  // Load post
  useEffect(() => {
    if (isNew || !isAdmin) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("blog_posts").select("*").eq("id", id).single();
      if (error) { toast.error(error.message); setLoading(false); return; }
      setPostId(data.id);
      setTitle(data.title);
      setSlug(data.slug);
      setSlugTouched(true);
      setExcerpt(data.excerpt ?? "");
      setContent(data.content ?? "");
      setCoverUrl(data.cover_image_url ?? "");
      setCoverAlt(data.cover_image_alt ?? "");
      setCategoryId(data.category_id);
      setAuthorId(data.author_id);
      setStatus(data.status);
      setScheduledAt(data.scheduled_at ? data.scheduled_at.slice(0, 16) : "");
      setMetaTitle(data.meta_title ?? "");
      setMetaDescription(data.meta_description ?? "");
      setOgImage(data.og_image_url ?? "");
      setCanonical(data.canonical_url ?? "");
      setIsFeatured(data.is_featured);
      setIsPopular(data.is_popular);
      setNoindex(data.noindex);
      const { data: tagRows } = await supabase.from("blog_post_tags").select("tag_id").eq("post_id", data.id);
      setTags((tagRows ?? []).map((t) => t.tag_id));
      setLoading(false);
    })();
  }, [id, isNew, isAdmin]);

  // Auto-slug from title
  useEffect(() => {
    if (!slugTouched && title) setSlug(slugify(title));
  }, [title, slugTouched]);

  const readingMinutes = useMemo(() => estimateReadingTime(content), [content]);

  const generateWithAI = async () => {
    const kw = aiKeyword.trim();
    if (!kw) { toast.error("Entrez un mot-clé"); return; }
    setAiLoading(true);
    try {
      const cat = categories.find((c) => c.id === categoryId);
      const { data, error } = await supabase.functions.invoke("blog-ai-generate", {
        body: { keyword: kw, category: cat?.name || "" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.title) { setTitle(data.title); }
      if (data?.slug) { setSlug(data.slug); setSlugTouched(true); }
      if (data?.excerpt) setExcerpt(data.excerpt);
      if (data?.meta_title) setMetaTitle(data.meta_title);
      if (data?.meta_description) setMetaDescription(data.meta_description);
      if (data?.content_html) setContent(data.content_html);
      // Create/attach suggested tags
      const suggested: string[] = Array.isArray(data?.suggested_tags) ? data.suggested_tags : [];
      if (suggested.length) {
        const newTagIds: string[] = [];
        for (const name of suggested) {
          const clean = name.trim();
          if (!clean) continue;
          const existing = allTags.find((t) => t.name.toLowerCase() === clean.toLowerCase());
          if (existing) {
            if (!tags.includes(existing.id)) newTagIds.push(existing.id);
          } else {
            const { data: inserted } = await supabase.from("blog_tags").insert({ name: clean, slug: slugify(clean) }).select("*").single();
            if (inserted) {
              setAllTags((prev) => [...prev, inserted]);
              newTagIds.push(inserted.id);
            }
          }
        }
        if (newTagIds.length) setTags((prev) => Array.from(new Set([...prev, ...newTagIds])));
      }
      toast.success("Brouillon généré par IA");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur IA");
    } finally {
      setAiLoading(false);
    }
  };

  const buildPayload = () => ({
    title: title.trim() || "Sans titre",
    slug: slug.trim() || slugify(title) || null,
    excerpt: excerpt.trim() || null,
    content,
    cover_image_url: coverUrl || null,
    cover_image_alt: coverAlt || null,
    category_id: categoryId,
    author_id: authorId,
    status,
    scheduled_at: status === "scheduled" && scheduledAt ? new Date(scheduledAt).toISOString() : null,
    meta_title: metaTitle || null,
    meta_description: metaDescription || null,
    og_image_url: ogImage || null,
    canonical_url: canonical || null,
    is_featured: isFeatured,
    is_popular: isPopular,
    noindex,
  });

  const persistTags = async (pid: string) => {
    await supabase.from("blog_post_tags").delete().eq("post_id", pid);
    if (tags.length) {
      await supabase.from("blog_post_tags").insert(tags.map((tag_id) => ({ post_id: pid, tag_id })));
    }
  };

  const save = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!title.trim()) {
      if (!opts.silent) toast.error("Le titre est requis");
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (!postId) {
        const { data, error } = await supabase.from("blog_posts").insert(payload).select("id, slug").single();
        if (error) throw error;
        setPostId(data.id);
        await persistTags(data.id);
        setSavedAt(new Date());
        if (!opts.silent) toast.success("Article créé");
        navigate(`/admin/blogue/editer/${data.id}`, { replace: true });
      } else {
        const { error } = await supabase.from("blog_posts").update(payload).eq("id", postId);
        if (error) throw error;
        await persistTags(postId);
        setSavedAt(new Date());
        if (!opts.silent) toast.success("Enregistré");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!opts.silent) toast.error(msg);
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, slug, excerpt, content, coverUrl, coverAlt, categoryId, authorId, status, scheduledAt, metaTitle, metaDescription, ogImage, canonical, isFeatured, isPopular, noindex, postId, tags]);

  // Auto-save (debounced) — only for existing posts to avoid firing on empty new post
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!postId) return;
    if (loading) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      save({ silent: true });
    }, 3000);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, slug, excerpt, content, coverUrl, coverAlt, categoryId, authorId, status, scheduledAt, metaTitle, metaDescription, ogImage, canonical, isFeatured, isPopular, noindex, tags]);

  const uploadCover = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `covers/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("blog-media").upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      // Signed URL — bucket is private
      const { data: signed } = await supabase.storage.from("blog-media").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signed?.signedUrl) {
        setCoverUrl(signed.signedUrl);
        toast.success("Image téléversée");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const addTag = async () => {
    const name = newTag.trim();
    if (!name) return;
    const existing = allTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!tags.includes(existing.id)) setTags([...tags, existing.id]);
      setNewTag("");
      return;
    }
    const { data, error } = await supabase.from("blog_tags").insert({ name, slug: slugify(name) }).select("*").single();
    if (error) return toast.error(error.message);
    setAllTags([...allTags, data]);
    setTags([...tags, data.id]);
    setNewTag("");
  };

  if (!authReady || roleLoading || loading) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/admin/blogue" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground shrink-0">
              <ArrowLeft className="w-4 h-4" /> Retour
            </Link>
            <h1 className="font-display font-extrabold text-base sm:text-lg text-foreground truncate">
              {isNew ? "Nouvel article" : title || "Sans titre"}
            </h1>
            {savedAt && <span className="hidden sm:inline text-[11px] text-muted-foreground">Enregistré {savedAt.toLocaleTimeString("fr-CA")}</span>}
          </div>
          <div className="flex items-center gap-2">
            {postId && status === "published" && (
              <a href={`/blog/${slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted">
                <ExternalLink className="w-4 h-4" /> Voir
              </a>
            )}
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as BlogPost["status"])}
              className="px-3 py-2 rounded-lg border border-border bg-card text-sm font-body"
            >
              <option value="draft">Brouillon</option>
              <option value="published">Publié</option>
              <option value="scheduled">Planifié</option>
              <option value="archived">Archivé</option>
            </select>
            <button
              onClick={() => save()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm shadow hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer
            </button>
          </div>
        </div>
        <div className="container mx-auto px-4 sm:px-6 pb-2 flex gap-1 overflow-x-auto">
          {(["content", "seo", "related", "settings"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-display font-semibold ${
                tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t === "content" ? "Contenu" : t === "seo" ? "SEO" : t === "related" ? "Articles reliés" : "Options"}
            </button>
          ))}
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 py-6 max-w-5xl">
        {tab === "content" && (
          <div className="space-y-5">
            {/* AI generator */}
            <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-display font-extrabold uppercase tracking-wider text-foreground">Générer avec l'IA</h2>
              </div>
              <p className="text-xs text-muted-foreground font-body mb-3">
                Entrez un mot-clé (ex : « livraison de remblai à Laval »). L'IA rédige un brouillon SEO complet — titre, extrait, contenu HTML, meta et étiquettes.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={aiKeyword}
                  onChange={(e) => setAiKeyword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !aiLoading) { e.preventDefault(); generateWithAI(); } }}
                  placeholder="Mot-clé principal…"
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-card font-body text-sm"
                />
                <button
                  type="button"
                  onClick={generateWithAI}
                  disabled={aiLoading}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm shadow hover:opacity-90 disabled:opacity-50"
                >
                  {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Générer le brouillon
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">Le contenu généré remplace les champs actuels — sauvegardez avant si nécessaire.</p>
            </div>
            <Field label="Titre">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Titre de l'article"
                className="w-full text-2xl font-display font-extrabold px-4 py-3 rounded-lg border border-border bg-card"
              />
            </Field>
            <Field label="URL (slug)">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground font-mono">{SITE_URL}/blog/</span>
                <input
                  value={slug}
                  onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-card font-mono text-sm"
                />
              </div>
            </Field>
            <Field label="Extrait">
              <textarea
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                rows={2}
                placeholder="Court résumé affiché dans les listes et Google."
                className="w-full px-4 py-3 rounded-lg border border-border bg-card font-body text-sm"
              />
              <div className="text-xs text-muted-foreground mt-1">{excerpt.length}/160 idéal pour Google</div>
            </Field>

            <div className="grid md:grid-cols-2 gap-4">
              <Field label="Catégorie">
                <select
                  value={categoryId ?? ""}
                  onChange={(e) => setCategoryId(e.target.value || null)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-card font-body text-sm"
                >
                  <option value="">— Aucune —</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Auteur">
                <select
                  value={authorId ?? ""}
                  onChange={(e) => setAuthorId(e.target.value || null)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-card font-body text-sm"
                >
                  <option value="">— Aucun —</option>
                  {authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Image de couverture">
              <div className="flex flex-wrap items-center gap-3">
                {coverUrl && (
                  <img src={coverUrl} alt="cover" className="w-40 h-24 object-cover rounded-lg border border-border" />
                )}
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-border cursor-pointer hover:bg-muted">
                  <ImageIcon className="w-4 h-4" />
                  {uploading ? "Téléversement…" : coverUrl ? "Remplacer" : "Téléverser une image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCover(f); }}
                  />
                </label>
                {coverUrl && (
                  <button onClick={() => setCoverUrl("")} className="text-sm text-destructive inline-flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Retirer
                  </button>
                )}
              </div>
              <input
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                placeholder="ou coller une URL d'image"
                className="mt-2 w-full px-3 py-2 rounded-lg border border-border bg-card font-body text-sm"
              />
              <input
                value={coverAlt}
                onChange={(e) => setCoverAlt(e.target.value)}
                placeholder="Texte alternatif (accessibilité + SEO)"
                className="mt-2 w-full px-3 py-2 rounded-lg border border-border bg-card font-body text-sm"
              />
            </Field>

            <Field label={`Contenu (HTML) — ${readingMinutes} min de lecture`}>
              <div className="grid md:grid-cols-2 gap-3">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={20}
                  placeholder="<h2>Introduction</h2>\n<p>…</p>"
                  className="w-full px-4 py-3 rounded-lg border border-border bg-card font-mono text-xs leading-relaxed"
                />
                <div
                  className="prose prose-sm max-w-none rounded-lg border border-border bg-card p-4 overflow-auto max-h-[500px]"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                HTML autorisé (h2, h3, p, a, img, ul, ol, blockquote, strong, em…). Scripts et iframes bloqués automatiquement.
              </p>
            </Field>

            <Field label="Étiquettes">
              <div className="flex flex-wrap items-center gap-2">
                {tags.map((tid) => {
                  const t = allTags.find((x) => x.id === tid);
                  if (!t) return null;
                  return (
                    <span key={tid} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted text-xs">
                      {t.name}
                      <button onClick={() => setTags(tags.filter((x) => x !== tid))} className="text-muted-foreground hover:text-destructive">×</button>
                    </span>
                  );
                })}
                <input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  placeholder="Ajouter…"
                  className="px-3 py-1 rounded-full border border-border bg-card text-xs"
                />
              </div>
            </Field>
          </div>
        )}

        {tab === "seo" && (
          <div className="space-y-5">
            <Field label="Meta titre (Google)">
              <input
                value={metaTitle}
                onChange={(e) => setMetaTitle(e.target.value)}
                placeholder={title}
                className="w-full px-3 py-2 rounded-lg border border-border bg-card font-body text-sm"
              />
              <div className="text-xs text-muted-foreground mt-1">{(metaTitle || title).length}/60 caractères</div>
            </Field>
            <Field label="Meta description">
              <textarea
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                rows={2}
                placeholder={excerpt}
                className="w-full px-3 py-2 rounded-lg border border-border bg-card font-body text-sm"
              />
              <div className="text-xs text-muted-foreground mt-1">{(metaDescription || excerpt).length}/160 caractères</div>
            </Field>
            <Field label="Image Open Graph (partage social)">
              <input
                value={ogImage}
                onChange={(e) => setOgImage(e.target.value)}
                placeholder={coverUrl || "URL d'une image 1200×630"}
                className="w-full px-3 py-2 rounded-lg border border-border bg-card font-body text-sm"
              />
            </Field>
            <Field label="URL canonique (facultatif)">
              <input
                value={canonical}
                onChange={(e) => setCanonical(e.target.value)}
                placeholder={`${SITE_URL}/blog/${slug}`}
                className="w-full px-3 py-2 rounded-lg border border-border bg-card font-body text-sm"
              />
            </Field>
            <div className="rounded-2xl border border-border bg-muted/40 p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Aperçu Google</div>
              <div className="text-xs text-muted-foreground truncate">{SITE_URL}/blog/{slug}</div>
              <div className="text-blue-700 dark:text-blue-400 text-lg font-display truncate">{metaTitle || title || "Titre"}</div>
              <div className="text-sm text-muted-foreground line-clamp-2">{metaDescription || excerpt || "Description…"}</div>
            </div>
          </div>
        )}

        {tab === "related" && (
          <RelatedManager postId={postId} />
        )}

        {tab === "settings" && (
          <div className="space-y-5">
            <div className="grid md:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card cursor-pointer">
                <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
                <span className="text-sm font-body">Article vedette (accueil)</span>
              </label>
              <label className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card cursor-pointer">
                <input type="checkbox" checked={isPopular} onChange={(e) => setIsPopular(e.target.checked)} />
                <span className="text-sm font-body">Marqué comme populaire</span>
              </label>
              <label className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card cursor-pointer">
                <input type="checkbox" checked={noindex} onChange={(e) => setNoindex(e.target.checked)} />
                <span className="text-sm font-body">Bloquer l'indexation Google (noindex)</span>
              </label>
            </div>
            {status === "scheduled" && (
              <Field label="Date et heure de publication planifiée">
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-border bg-card font-body text-sm"
                />
              </Field>
            )}
            <div className="text-xs text-muted-foreground pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <CopyIcon className="w-3 h-3" />
                <span>ID: <code className="font-mono">{postId ?? "—"}</code></span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wider font-display font-bold text-muted-foreground mb-2">{label}</label>
      {children}
    </div>
  );
}

function RelatedManager({ postId }: { postId: string | null }) {
  const [selected, setSelected] = useState<{ id: string; title: string }[]>([]);
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    if (!postId) return;
    (async () => {
      const { data } = await supabase
        .from("blog_post_related")
        .select("related_post_id, sort_order, blog_posts!blog_post_related_related_post_id_fkey (id, title)")
        .eq("post_id", postId)
        .order("sort_order");
      const rows = (data ?? []).map((r: unknown) => {
        const rec = r as { blog_posts: { id: string; title: string } | null };
        return rec.blog_posts ? { id: rec.blog_posts.id, title: rec.blog_posts.title } : null;
      }).filter(Boolean) as { id: string; title: string }[];
      setSelected(rows);
    })();
  }, [postId]);

  useEffect(() => {
    const t = q.trim();
    if (!t) { setCandidates([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase.from("blog_posts").select("id, title").ilike("title", `%${t}%`).limit(10);
      setCandidates((data ?? []).filter((p) => p.id !== postId && !selected.some((s) => s.id === p.id)));
    }, 300);
    return () => clearTimeout(timer);
  }, [q, postId, selected]);

  const add = async (p: { id: string; title: string }) => {
    if (!postId) return;
    await supabase.from("blog_post_related").insert({ post_id: postId, related_post_id: p.id, sort_order: selected.length });
    setSelected([...selected, p]);
    setQ(""); setCandidates([]);
  };
  const remove = async (id: string) => {
    if (!postId) return;
    await supabase.from("blog_post_related").delete().eq("post_id", postId).eq("related_post_id", id);
    setSelected(selected.filter((s) => s.id !== id));
  };

  if (!postId) return <div className="text-sm text-muted-foreground">Enregistrez l'article d'abord.</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground font-body">
        Sélectionnez manuellement des articles reliés (sinon ils seront suggérés automatiquement selon la catégorie).
      </p>
      <div className="space-y-2">
        {selected.map((s) => (
          <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
            <span className="text-sm font-semibold">{s.title}</span>
            <button onClick={() => remove(s.id)} className="text-destructive text-sm">Retirer</button>
          </div>
        ))}
      </div>
      <div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un article à ajouter…"
          className="w-full px-3 py-2 rounded-lg border border-border bg-card font-body text-sm"
        />
        {candidates.length > 0 && (
          <div className="mt-2 rounded-lg border border-border divide-y divide-border bg-card">
            {candidates.map((c) => (
              <button key={c.id} onClick={() => add(c)} className="w-full text-left px-3 py-2 hover:bg-muted text-sm">
                {c.title}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
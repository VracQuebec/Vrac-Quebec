import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Play, Square, CheckCircle2, XCircle, Clock, ExternalLink, Rocket, ListChecks } from "lucide-react";
import type { BlogCategory } from "@/lib/blog/types";
import { slugify } from "@/lib/blog/utils";

// 100 sujets locaux priorisés — région de Québec (Ville de Québec, Lévis, Portneuf, Lotbinière, Côte-de-Beaupré, Jacques-Cartier, Île d'Orléans).
// Chaque ligne cible une requête locale distincte (topic × ville) pour éviter la cannibalisation SEO.
const TOP_100_KEYWORDS = `Terre de remplissage gratuite Ville de Québec
Remblai gratuit Lévis
Dépôt de terre Beauport
Dépôt de sable Charlesbourg
Dépôt de gravier Sainte-Foy
Transport en vrac L'Ancienne-Lorette
Excavation résidentielle Saint-Augustin-de-Desmaures
Calcul de tonnage remblai Wendake
Calcul de verges cubes Val-Bélair
Guide propriétaire remblai Lac-Beauport
Terre de remplissage gratuite Boischatel
Remblai gratuit L'Ange-Gardien
Dépôt de terre Château-Richer
Dépôt de sable Île d'Orléans
Dépôt de gravier Stoneham-et-Tewkesbury
Transport en vrac Shannon
Excavation Pont-Rouge
Calcul de tonnage remblai Donnacona
Calcul de verges cubes Portneuf
Guide propriétaire terrassement Saint-Apollinaire
Terre de remplissage gratuite Laurier-Station
Remblai gratuit Sainte-Croix
Dépôt de terre Lotbinière
Prix du remblai Ville de Québec
Livraison de remblai Lévis
Livraison de terre Beauport
Livraison de sable Charlesbourg
Livraison de gravier Sainte-Foy
Livraison de pierre concassée L'Ancienne-Lorette
Prix d'une verge cube de terre Lévis
Prix d'une tonne de gravier Beauport
Coût transport en vrac Charlesbourg
Devis transport en vrac Sainte-Foy
Camion 10 roues Ville de Québec
Camion 12 roues Lévis
Combien de tonnes dans un 10 roues à Québec
Combien de verges cubes dans un 12 roues à Lévis
Poids d'une verge cube de terre région de Québec
Poids d'une verge cube de sable Beauport
Poids d'une verge cube de gravier Charlesbourg
Poids d'une verge cube de pierre Sainte-Foy
Calculateur de tonnage remblai Ville de Québec
Calculateur de verges cubes Lévis
Calculateur de voyages de camion région de Québec
Comment calculer un remblai à Beauport
Comment remblayer un terrain à Charlesbourg
Comment remblayer une fondation à Sainte-Foy
Comment remblayer une piscine à L'Ancienne-Lorette
Comment combler un fossé à Saint-Augustin-de-Desmaures
Comment niveler un terrain à Wendake
Comment choisir son remblai à Val-Bélair
Terre noire Lac-Beauport
Terre végétale Boischatel
Terre à pelouse L'Ange-Gardien
Terre à jardin Château-Richer
Sable à compaction Île d'Orléans
Sable à béton Stoneham-et-Tewkesbury
Sable tamisé Shannon
Pierre 0-3/4 Pont-Rouge
Pierre nette 1/2 pouce Donnacona
Pierre concassée Portneuf
Gravier concassé 0-3/4 Saint-Apollinaire
Gravier MG-20 Laurier-Station
Béton recyclé Sainte-Croix
Asphalte recyclé Lotbinière
Remblai pour piscine hors terre Ville de Québec
Terre pour piscine creusée Lévis
Aménagement paysager Beauport
Paysagement Charlesbourg
Excavation pour fondation Sainte-Foy
Excavation pour piscine L'Ancienne-Lorette
Excavation pour drain français Saint-Augustin-de-Desmaures
Terrassement Wendake
Terre d'excavation Val-Bélair
Test de terre d'excavation Lac-Beauport
Terre contaminée que faire Ville de Québec
Transporteur en vrac Ville de Québec
Transporteur en vrac Lévis
Camionneur en vrac Beauport
Camionneur en vrac Charlesbourg
Choisir un transporteur en vrac région de Québec
Guide propriétaire — recevoir du remblai gratuit Ville de Québec
Guide propriétaire — déposer de la terre gratuitement Lévis
Guide propriétaire — calcul verges cubes région de Québec
Guide propriétaire — remblai piscine Beauport
Guide propriétaire — nivellement de terrain Charlesbourg
Guide entrepreneur — dépôt terre d'excavation Sainte-Foy
Guide entrepreneur — transport en vrac L'Ancienne-Lorette
Guide municipal — dépôt matériaux Saint-Augustin-de-Desmaures
Où déposer de la terre à Ville de Québec
Où déposer du sable à Lévis
Où déposer du gravier à Beauport
Où trouver du remblai à Charlesbourg
Où trouver de la terre gratuite à Sainte-Foy
Où trouver du sable de remplissage à Wendake
FAQ remblai Portneuf
FAQ excavation Île d'Orléans
Erreurs à éviter avec le remblai à Stoneham-et-Tewkesbury
Dépôt de sable Pont-Rouge
Dépôt de gravier Donnacona
Transport en vrac Saint-Apollinaire
Excavation Laurier-Station
Vrac Québec — transport en vrac région de Québec`;

// Ancien seed conservé pour rétro-compat (les 25 premiers)
const SEED_KEYWORDS = TOP_100_KEYWORDS.split("\n").slice(0, 25).join("\n");

type JobStatus = "pending" | "running" | "done" | "error" | "skipped";
type Job = {
  keyword: string;
  status: JobStatus;
  message?: string;
  postId?: string;
  slug?: string;
};

export default function AdminBlogBatch() {
  const { isReady, user } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, isReady);
  const navigate = useNavigate();

  const [raw, setRaw] = useState(SEED_KEYWORDS);
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [autoPublish, setAutoPublish] = useState(true);
  const [delayMs, setDelayMs] = useState(1500);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  useEffect(() => {
    if (isReady && !user) navigate("/login");
    if (isReady && user && !roleLoading && !isAdmin) navigate("/");
  }, [isReady, user, isAdmin, roleLoading, navigate]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("blog_categories").select("*").order("sort_order");
      setCategories(data ?? []);
    })();
  }, []);

  const keywords = useMemo(
    () => raw.split("\n").map((k) => k.trim()).filter(Boolean),
    [raw],
  );

  const progress = useMemo(() => {
    const done = jobs.filter((j) => j.status === "done").length;
    const err = jobs.filter((j) => j.status === "error").length;
    const skip = jobs.filter((j) => j.status === "skipped").length;
    return { done, err, skip, total: jobs.length };
  }, [jobs]);

  const start = async () => {
    if (!keywords.length) { toast.error("Aucun mot-clé"); return; }
    if (running) return;
    stopRef.current = false;
    setRunning(true);
    const initial: Job[] = keywords.map((k) => ({ keyword: k, status: "pending" }));
    setJobs(initial);

    // Preload existing posts once for internal linking
    const { data: existingPosts } = await supabase
      .from("blog_posts")
      .select("title, slug, blog_categories:category_id (name)")
      .limit(200);
    const linkCandidates = (existingPosts ?? []).map((p: { title: string; slug: string; blog_categories: { name: string } | null }) => ({
      title: p.title, slug: p.slug, category: p.blog_categories?.name,
    }));

    const cat = categories.find((c) => c.id === categoryId);

    for (let i = 0; i < initial.length; i++) {
      if (stopRef.current) break;
      const kw = initial[i].keyword;
      setJobs((prev) => prev.map((j, idx) => idx === i ? { ...j, status: "running" } : j));
      try {
        // Skip if slug already exists (dedupe)
        const guess = slugify(kw);
        const { data: dup } = await supabase.from("blog_posts").select("id, slug").eq("slug", guess).maybeSingle();
        if (dup) {
          setJobs((prev) => prev.map((j, idx) => idx === i ? { ...j, status: "skipped", message: "Slug déjà existant", postId: dup.id, slug: dup.slug } : j));
          await sleep(200);
          continue;
        }

        const { data, error } = await supabase.functions.invoke("blog-ai-generate", {
          body: { keyword: kw, category: cat?.name || "", existing_posts: linkCandidates },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        if (!data?.title || !data?.content_html) throw new Error("Réponse IA incomplète");

        // Unique slug
        let finalSlug = slugify(data.slug || data.title);
        const { data: exists } = await supabase.from("blog_posts").select("id").eq("slug", finalSlug).maybeSingle();
        if (exists) finalSlug = `${finalSlug}-${Math.random().toString(36).slice(2, 6)}`;

        const payload = {
          title: String(data.title),
          slug: finalSlug,
          excerpt: data.excerpt ?? null,
          content: String(data.content_html),
          meta_title: data.meta_title ?? null,
          meta_description: data.meta_description ?? null,
          category_id: categoryId || null,
          status: autoPublish ? "published" as const : "draft" as const,
          ...(autoPublish ? { published_at: new Date().toISOString() } : {}),
        };
        const { data: inserted, error: insErr } = await supabase.from("blog_posts").insert(payload).select("id, slug").single();
        if (insErr) throw insErr;

        // Attach suggested tags
        const suggested: string[] = Array.isArray(data.suggested_tags) ? data.suggested_tags : [];
        if (suggested.length && inserted) {
          for (const name of suggested) {
            const clean = String(name).trim();
            if (!clean) continue;
            const tagSlug = slugify(clean);
            const { data: existTag } = await supabase.from("blog_tags").select("id").eq("slug", tagSlug).maybeSingle();
            let tagId = existTag?.id;
            if (!tagId) {
              const { data: newTag } = await supabase.from("blog_tags").insert({ name: clean, slug: tagSlug }).select("id").single();
              tagId = newTag?.id;
            }
            if (tagId) await supabase.from("blog_post_tags").insert({ post_id: inserted.id, tag_id: tagId });
          }
        }

        // Feed back into link candidates for subsequent articles
        linkCandidates.push({ title: payload.title, slug: finalSlug, category: cat?.name });

        setJobs((prev) => prev.map((j, idx) => idx === i ? { ...j, status: "done", postId: inserted?.id, slug: inserted?.slug } : j));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setJobs((prev) => prev.map((j, idx) => idx === i ? { ...j, status: "error", message: msg } : j));
        // Back off harder on rate limit
        if (/429|rate|Trop de requ/i.test(msg)) await sleep(delayMs * 4);
      }
      await sleep(delayMs);
    }
    setRunning(false);
    toast.success("Traitement terminé");
  };

  const stop = () => { stopRef.current = true; toast.message("Arrêt demandé — l'article en cours se termine"); };

  if (!isReady || roleLoading) return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card sticky top-0 z-40">
        <div className="container mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/admin/blogue" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Blogue
            </Link>
            <h1 className="font-display font-extrabold text-lg text-foreground">Génération IA en masse</h1>
          </div>
          <div className="flex gap-2">
            {!running ? (
              <button
                onClick={start}
                disabled={!keywords.length}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm shadow hover:opacity-90 disabled:opacity-50"
              >
                <Play className="w-4 h-4" /> Lancer ({keywords.length})
              </button>
            ) : (
              <button onClick={stop} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground font-display font-bold text-sm shadow hover:opacity-90">
                <Square className="w-4 h-4" /> Arrêter
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 sm:px-6 py-6 max-w-5xl space-y-6">
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <ListChecks className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="flex-1 text-sm font-body text-foreground">
            <strong>Preset : 100 sujets prioritaires Vrac Québec</strong> — triés par intention SEO (commercial → informationnel → géographique), couvrant remblai, terre, sable, gravier, pierre, camions 10/12 roues, excavation, paysagement.
            <div className="text-xs text-muted-foreground mt-1">
              Durée estimée : 1 à 2 h. Publication auto activée. Laissez cet onglet ouvert pendant la génération — les articles sont publiés au fur et à mesure.
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setRaw(TOP_100_KEYWORDS); setAutoPublish(true); toast.success("100 sujets chargés"); }}
            disabled={running}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm shadow hover:opacity-90 disabled:opacity-50"
          >
            <ListChecks className="w-4 h-4" /> Charger les 100 sujets
          </button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider font-display font-bold text-muted-foreground mb-2">
              Mots-clés (un par ligne)
            </label>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={12}
              disabled={running}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background font-body text-sm"
            />
            <div className="text-xs text-muted-foreground mt-1">{keywords.length} article{keywords.length > 1 ? "s" : ""} à générer</div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wider font-display font-bold text-muted-foreground mb-2">Catégorie par défaut</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={running}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background font-body text-sm"
              >
                <option value="">— Auto —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider font-display font-bold text-muted-foreground mb-2">Délai entre appels (ms)</label>
              <input
                type="number"
                min={500}
                step={500}
                value={delayMs}
                onChange={(e) => setDelayMs(Number(e.target.value))}
                disabled={running}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background font-body text-sm"
              />
            </div>
            <label className="flex items-end gap-2 pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoPublish}
                onChange={(e) => setAutoPublish(e.target.checked)}
                disabled={running}
              />
              <span className="text-sm font-body">Publier automatiquement (sinon = brouillons)</span>
            </label>
          </div>
          <div className="text-xs text-muted-foreground">
            💡 Chaque article ≈ 30-60 s. Les liens internes s'enrichissent au fur et à mesure. Les slugs existants sont ignorés (pas de doublon).
          </div>
        </div>

        {jobs.length > 0 && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-4 h-4" /> {progress.done}</span>
              <span className="flex items-center gap-1 text-orange-600"><Clock className="w-4 h-4" /> {progress.skip}</span>
              <span className="flex items-center gap-1 text-destructive"><XCircle className="w-4 h-4" /> {progress.err}</span>
              <span className="text-muted-foreground ml-auto">{progress.done + progress.err + progress.skip} / {progress.total}</span>
            </div>
            <div className="max-h-[500px] overflow-auto divide-y divide-border">
              {jobs.map((j, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                  <StatusIcon status={j.status} />
                  <span className="flex-1 truncate font-body">{j.keyword}</span>
                  {j.slug && (
                    <Link to={`/admin/blogue/editer/${j.postId}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="w-3 h-3" /> Ouvrir
                    </Link>
                  )}
                  {j.message && <span className="text-xs text-muted-foreground truncate max-w-[280px]">{j.message}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {progress.done > 0 && !running && !autoPublish && (
          <BulkPublish jobIds={jobs.filter((j) => j.status === "done" && j.postId).map((j) => j.postId!)} />
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: JobStatus }) {
  if (status === "pending") return <Clock className="w-4 h-4 text-muted-foreground shrink-0" />;
  if (status === "running") return <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />;
  if (status === "done") return <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />;
  if (status === "skipped") return <Clock className="w-4 h-4 text-orange-600 shrink-0" />;
  return <XCircle className="w-4 h-4 text-destructive shrink-0" />;
}

function BulkPublish({ jobIds }: { jobIds: string[] }) {
  const [busy, setBusy] = useState(false);
  const publishAll = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("blog_posts")
      .update({ status: "published", published_at: new Date().toISOString() })
      .in("id", jobIds);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success(`${jobIds.length} articles publiés`);
  };
  return (
    <button
      onClick={publishAll}
      disabled={busy}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white font-display font-bold text-sm shadow hover:bg-green-700 disabled:opacity-50"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
      Publier les {jobIds.length} brouillons
    </button>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
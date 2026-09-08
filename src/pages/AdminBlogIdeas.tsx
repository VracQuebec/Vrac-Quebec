import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRole";
import { useAuthReady } from "@/hooks/useAuthReady";
import { toast } from "sonner";
import { ArrowLeft, Sparkles, Calendar as CalIcon, Loader2, Search as SearchIcon } from "lucide-react";

type Idea = {
  id: string;
  category: string;
  title: string;
  primary_keyword: string;
  secondary_keywords: string[];
  search_intent: string;
  seo_difficulty: string;
  priority: number;
  monthly_searches: number | null;
  description: string;
  status: string;
  planned_publish_date: string | null;
  created_post_id: string | null;
};

const DIFF_COLOR: Record<string, string> = {
  facile: "bg-green-100 text-green-800",
  moyen: "bg-yellow-100 text-yellow-800",
  difficile: "bg-red-100 text-red-800",
};
const STATUS_COLOR: Record<string, string> = {
  idea: "bg-gray-100 text-gray-700",
  planned: "bg-blue-100 text-blue-800",
  in_progress: "bg-purple-100 text-purple-800",
  published: "bg-green-100 text-green-800",
  archived: "bg-gray-100 text-gray-500",
};

export default function AdminBlogIdeas() {
  const { isReady: authReady, user } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, authReady);
  const navigate = useNavigate();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [view, setView] = useState<"list" | "calendar">("list");

  useEffect(() => {
    if (authReady && !user) navigate("/login");
    if (authReady && user && !roleLoading && !isAdmin) navigate("/");
  }, [authReady, user, isAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("blog_post_ideas" as any)
        .select("*")
        .order("priority", { ascending: false })
        .order("planned_publish_date", { ascending: true })
        .limit(500);
      if (error) toast.error(error.message);
      setIdeas((data as any) ?? []);
      setLoading(false);
    })();
  }, [isAdmin]);

  const categories = useMemo(() => Array.from(new Set(ideas.map((i) => i.category))).sort(), [ideas]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return ideas.filter((i) => {
      if (category !== "all" && i.category !== category) return false;
      if (status !== "all" && i.status !== status) return false;
      if (priority !== "all" && String(i.priority) !== priority) return false;
      if (ql && !`${i.title} ${i.primary_keyword} ${i.description}`.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [ideas, q, category, status, priority]);

  const byMonth = useMemo(() => {
    const m = new Map<string, Idea[]>();
    filtered.forEach((i) => {
      const k = i.planned_publish_date?.slice(0, 7) ?? "Sans date";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(i);
    });
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const stats = useMemo(() => {
    return {
      total: ideas.length,
      p5: ideas.filter((i) => i.priority === 5).length,
      published: ideas.filter((i) => i.status === "published").length,
      planned: ideas.filter((i) => i.status === "planned").length,
    };
  }, [ideas]);

  const createDraft = async (idea: Idea) => {
    const { data: cat } = await supabase
      .from("blog_categories")
      .select("id")
      .ilike("name", idea.category)
      .maybeSingle();
    const { data, error } = await supabase
      .from("blog_posts")
      .insert([{
        slug: (idea.primary_keyword || idea.title).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,80) + "-" + Math.random().toString(36).slice(2,7),
        title: idea.title,
        excerpt: idea.description,
        content: `<p>${idea.description}</p>`,
        status: "draft",
        category_id: cat?.id ?? null,
        meta_title: idea.title,
        meta_description: idea.description.slice(0, 155),
      }])
      .select("id")
      .single();
    if (error) return toast.error(error.message);
    await supabase
      .from("blog_post_ideas" as any)
      .update({ status: "in_progress", created_post_id: data!.id })
      .eq("id", idea.id);
    toast.success("Brouillon créé");
    navigate(`/admin/blogue/editer/${data!.id}`);
  };

  if (!authReady || roleLoading || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-card border-b sticky-below-nav z-20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link to="/admin/blogue" className="p-2 hover:bg-gray-100 rounded">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold">Plan éditorial SEO</h1>
              <p className="text-xs text-gray-500">{stats.total} idées · {stats.p5} priorité max · {stats.planned} planifiées · {stats.published} publiées</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setView("list")}
              className={`px-3 py-2 rounded text-sm ${view === "list" ? "bg-[#7ED321] text-black font-semibold" : "bg-gray-100"}`}
            >Liste</button>
            <button
              onClick={() => setView("calendar")}
              className={`px-3 py-2 rounded text-sm flex items-center gap-1 ${view === "calendar" ? "bg-[#7ED321] text-black font-semibold" : "bg-gray-100"}`}
            ><CalIcon className="w-4 h-4" /> Calendrier</button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pb-4 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher..." className="w-full pl-9 pr-3 py-2 border rounded text-sm" />
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="border rounded px-2 py-2 text-sm">
            <option value="all">Toutes catégories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className="border rounded px-2 py-2 text-sm">
            <option value="all">Toutes priorités</option>
            {[5, 4, 3, 2, 1].map((p) => <option key={p} value={p}>Priorité {p}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="border rounded px-2 py-2 text-sm">
            <option value="all">Tous statuts</option>
            <option value="idea">Idée</option>
            <option value="planned">Planifié</option>
            <option value="in_progress">En cours</option>
            <option value="published">Publié</option>
            <option value="archived">Archivé</option>
          </select>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>
        ) : view === "list" ? (
          <div className="grid gap-3">
            {filtered.map((i) => (
              <div key={i.id} className="bg-white border rounded-lg p-4 hover:shadow-md transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#111] text-[#7ED321]">{i.category}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${DIFF_COLOR[i.seo_difficulty] || ""}`}>{i.seo_difficulty}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[i.status] || ""}`}>{i.status}</span>
                      <span className="text-xs text-gray-500">{"⭐".repeat(i.priority)}</span>
                      {i.monthly_searches != null && <span className="text-xs text-gray-500">~{i.monthly_searches}/mois</span>}
                      <span className="text-xs text-gray-400">{i.search_intent}</span>
                    </div>
                    <h3 className="font-semibold text-gray-900 truncate">{i.title}</h3>
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{i.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      <span className="text-xs bg-[#7ED321]/20 text-gray-800 px-2 py-0.5 rounded font-medium">🎯 {i.primary_keyword}</span>
                      {i.secondary_keywords?.slice(0, 5).map((k, idx) => (
                        <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{k}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {i.planned_publish_date && (
                      <span className="text-xs text-gray-500 whitespace-nowrap">📅 {i.planned_publish_date}</span>
                    )}
                    {i.created_post_id ? (
                      <Link to={`/admin/blogue/editer/${i.created_post_id}`} className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-800">Ouvrir</Link>
                    ) : (
                      <button onClick={() => createDraft(i)} className="text-xs px-3 py-1.5 bg-[#7ED321] text-black font-semibold rounded hover:brightness-110 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Créer brouillon
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <p className="text-center text-gray-500 py-10">Aucune idée trouvée.</p>}
          </div>
        ) : (
          <div className="space-y-6">
            {byMonth.map(([month, items]) => (
              <div key={month} className="bg-white border rounded-lg p-4">
                <h3 className="font-bold text-lg mb-3">{month} <span className="text-sm font-normal text-gray-500">· {items.length} articles</span></h3>
                <div className="grid gap-2">
                  {items.sort((a, b) => (a.planned_publish_date || "").localeCompare(b.planned_publish_date || "")).map((i) => (
                    <div key={i.id} className="flex items-center gap-3 text-sm p-2 hover:bg-gray-50 rounded">
                      <span className="text-xs text-gray-500 w-24 shrink-0">{i.planned_publish_date}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-[#111] text-[#7ED321] shrink-0">{i.category}</span>
                      <span className="flex-1 truncate">{i.title}</span>
                      <span className="text-xs text-gray-400 shrink-0">{"⭐".repeat(i.priority)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithFreshSession } from "@/lib/auth/sessionToken";
import { toast } from "sonner";
import { Loader2, LinkIcon, Unlink, RefreshCw, Phone, Navigation, MousePointerClick, Eye, Search, Compass, Star, Image as ImageIcon, MessageSquare, Send, ExternalLink, Plus, AlertTriangle } from "lucide-react";

type Config = {
  id: string;
  google_email: string | null;
  account_display_name: string | null;
  location_display_name: string | null;
  location_address: string | null;
  location_name: string | null;
  account_name: string | null;
  refresh_token?: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
};
type Metric = { metric_date: string; metric_name: string; value: number };
type Question = { id: string; question_text: string; author_display_name: string | null; owner_answer: string | null; status: string; total_answer_count: number; upvote_count: number; created_at_google: string | null };
type Post = { id: string; summary: string; topic_type: string; status: string; error_message: string | null; google_search_url: string | null; created_at: string; published_at: string | null };
type Location = { display_name: string | null; website_uri: string | null; maps_uri: string | null; average_rating: number | null; total_reviews: number; total_photos: number };
type LocationChoice = { account: { name: string; accountName?: string }; locations: Array<{ name: string; title?: string; storefrontAddress?: { addressLines?: string[]; locality?: string } }> };

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : "Jamais";
}

function Kpi({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Phone }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-body"><Icon className="w-4 h-4" /> {label}</div>
      <div className="text-2xl font-display font-bold mt-1 text-foreground">{value.toLocaleString("fr-CA")}</div>
    </div>
  );
}

export default function GbpDashboard() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState<Location | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [picker, setPicker] = useState<LocationChoice[] | null>(null);
  const [answerFor, setAnswerFor] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [postForm, setPostForm] = useState({ summary: "", topicType: "STANDARD" as "STANDARD" | "EVENT" | "OFFER" | "ALERT", cta_type: "", cta_url: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const [c, l, m, q, p] = await Promise.all([
      supabase.from("gbp_config").select("*").maybeSingle(),
      supabase.from("gbp_location").select("*").maybeSingle(),
      supabase.from("gbp_daily_metrics").select("*").order("metric_date", { ascending: false }).limit(500),
      supabase.from("gbp_questions").select("*").order("fetched_at", { ascending: false }).limit(50),
      supabase.from("gbp_posts").select("*").order("created_at", { ascending: false }).limit(30),
    ]);
    setCfg(c.data as unknown as Config | null);
    setLocation(l.data as unknown as Location | null);
    setMetrics((m.data ?? []) as unknown as Metric[]);
    setQuestions((q.data ?? []) as unknown as Question[]);
    setPosts((p.data ?? []) as unknown as Post[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const kpis28 = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 28);
    const agg: Record<string, number> = {};
    for (const r of metrics) {
      if (new Date(r.metric_date) < cutoff) continue;
      agg[r.metric_name] = (agg[r.metric_name] ?? 0) + Number(r.value ?? 0);
    }
    const totalViews = ["BUSINESS_IMPRESSIONS_DESKTOP_MAPS","BUSINESS_IMPRESSIONS_DESKTOP_SEARCH","BUSINESS_IMPRESSIONS_MOBILE_MAPS","BUSINESS_IMPRESSIONS_MOBILE_SEARCH"].reduce((s, k) => s + (agg[k] ?? 0), 0);
    const mapsViews = (agg.BUSINESS_IMPRESSIONS_DESKTOP_MAPS ?? 0) + (agg.BUSINESS_IMPRESSIONS_MOBILE_MAPS ?? 0);
    const searchViews = (agg.BUSINESS_IMPRESSIONS_DESKTOP_SEARCH ?? 0) + (agg.BUSINESS_IMPRESSIONS_MOBILE_SEARCH ?? 0);
    return { agg, totalViews, mapsViews, searchViews };
  }, [metrics]);

  const connect = async () => {
    setBusy("connect");
    try {
      const res = await invokeWithFreshSession<Record<string, never>, { url: string }>("gbp-oauth-start", {});
      if (res.error || !res.data?.url) throw new Error(res.error?.message || "Impossible d'ouvrir Google");
      window.location.href = res.data.url;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); setBusy(null); }
  };

  const pickLocation = async () => {
    setBusy("list");
    try {
      const res = await invokeWithFreshSession<Record<string, never>, { accounts: LocationChoice[] }>("gbp-list-locations", {});
      if (res.error) throw new Error(res.error.message);
      setPicker(res.data?.accounts ?? []);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(null); }
  };

  const setLoc = async (account: LocationChoice["account"], loc: LocationChoice["locations"][number]) => {
    setBusy("set");
    try {
      const res = await invokeWithFreshSession<Record<string, unknown>, { ok: boolean }>("gbp-set-location", {
        account_name: account.name,
        account_display_name: account.accountName ?? null,
        location_name: loc.name,
        location_display_name: loc.title ?? null,
      });
      if (res.error) throw new Error(res.error.message);
      toast.success("Fiche sélectionnée. Lancement de la première synchronisation…");
      setPicker(null);
      await sync();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(null); }
  };

  const sync = async () => {
    setBusy("sync");
    try {
      const res = await invokeWithFreshSession<Record<string, never>, { ok: boolean; metrics: number; questions: number }>("gbp-sync-daily", {});
      if (res.error) throw new Error(res.error.message);
      toast.success(`Sync OK · ${res.data?.metrics ?? 0} points, ${res.data?.questions ?? 0} Q&R`);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(null); }
  };

  const disconnect = async () => {
    if (!confirm("Déconnecter Google Business ? Les données historiques restent en base.")) return;
    setBusy("disc");
    try {
      const res = await invokeWithFreshSession<Record<string, never>, { ok: boolean }>("gbp-disconnect", {});
      if (res.error) throw new Error(res.error.message);
      toast.success("Déconnecté.");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(null); }
  };

  const publishPost = async () => {
    if (postForm.summary.trim().length < 10) { toast.error("Contenu trop court (10 car. min)"); return; }
    setBusy("post");
    try {
      const res = await invokeWithFreshSession<typeof postForm, { ok: boolean; error?: string }>("gbp-post-create", postForm);
      if (res.error || !res.data?.ok) throw new Error(res.data?.error || res.error?.message || "Publication refusée");
      toast.success("Publication envoyée à Google Business");
      setPostForm({ summary: "", topicType: "STANDARD", cta_type: "", cta_url: "" });
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(null); }
  };

  const answerQuestion = async (id: string) => {
    if (answerText.trim().length < 5) { toast.error("Réponse trop courte"); return; }
    setBusy("ans");
    try {
      const res = await invokeWithFreshSession<{ question_id: string; answer_text: string }, { ok: boolean }>("gbp-qa-answer", { question_id: id, answer_text: answerText });
      if (res.error) throw new Error(res.error.message);
      toast.success("Réponse publiée");
      setAnswerFor(null); setAnswerText("");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setBusy(null); }
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const connected = !!cfg?.id;
  const hasLocation = !!cfg?.location_name;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-display font-bold text-foreground">Google Business Profile</h2>
          <p className="text-sm text-muted-foreground">Statistiques, publications et Q&R Google Business — Phase 1 (avis Google en Phase 2).</p>
        </div>
        <div className="flex gap-2">
          {connected && <button onClick={sync} disabled={busy !== null} className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm font-display font-semibold hover:bg-secondary disabled:opacity-50">
            {busy === "sync" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Synchroniser
          </button>}
          {!connected && <button onClick={connect} disabled={busy !== null} className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold hover:opacity-90 disabled:opacity-50">
            {busy === "connect" ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />} Connecter Google Business
          </button>}
          {connected && <button onClick={disconnect} disabled={busy !== null} className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-destructive/40 text-destructive text-sm font-display font-semibold hover:bg-destructive/10 disabled:opacity-50">
            <Unlink className="w-4 h-4" /> Déconnecter
          </button>}
        </div>
      </div>

      {!connected && (
        <div className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
          <p className="mb-2 font-display font-bold text-foreground">Aucun compte Google connecté.</p>
          <p>Cliquez sur <b>Connecter Google Business</b> pour autoriser l'accès à votre fiche. Vous serez redirigé vers Google puis vers cette page.</p>
          <p className="mt-2 text-xs">Prérequis Google Cloud Console : APIs My Business Business Information, Account Management, Business Profile Performance, Q&amp;A activées + Client OAuth Web avec redirect <code className="text-primary">/functions/v1/gbp-oauth-callback</code>.</p>
        </div>
      )}

      {connected && !hasLocation && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm">
              <div className="font-display font-bold text-foreground">Compte connecté{cfg?.google_email ? ` : ${cfg.google_email}` : ""}</div>
              <div className="text-muted-foreground">Sélectionnez maintenant l'établissement Vrac Québec à synchroniser.</div>
            </div>
            <button onClick={pickLocation} disabled={busy !== null} className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-display font-semibold disabled:opacity-50">
              {busy === "list" ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Choisir la fiche"}
            </button>
          </div>
        </div>
      )}

      {picker && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPicker(null)}>
          <div className="bg-card border border-border rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-bold text-lg mb-3">Sélectionner votre établissement</h3>
            {picker.length === 0 && <p className="text-sm text-muted-foreground">Aucun compte Google Business trouvé sur ce compte.</p>}
            {picker.map((entry) => (
              <div key={entry.account.name} className="mb-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-2">{entry.account.accountName ?? entry.account.name}</div>
                {entry.locations.length === 0 && <div className="text-xs text-muted-foreground italic">Aucune fiche.</div>}
                {entry.locations.map((loc) => (
                  <button key={loc.name} onClick={() => setLoc(entry.account, loc)} disabled={busy !== null}
                    className="w-full text-left p-3 rounded-md border border-border hover:border-primary hover:bg-primary/5 mb-2 disabled:opacity-50">
                    <div className="font-display font-bold text-foreground">{loc.title ?? loc.name}</div>
                    <div className="text-xs text-muted-foreground">{[...(loc.storefrontAddress?.addressLines ?? []), loc.storefrontAddress?.locality].filter(Boolean).join(", ")}</div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {hasLocation && (
        <>
          <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground uppercase">Fiche synchronisée</div>
              <div className="font-display font-bold text-foreground">{cfg?.location_display_name || location?.display_name}</div>
              <div className="text-xs text-muted-foreground">{cfg?.location_address}</div>
              <div className="text-xs text-muted-foreground mt-1">Dernière synchro : {fmtDate(cfg?.last_sync_at ?? null)} {cfg?.last_sync_status === "error" && <span className="text-destructive">(erreur : {cfg.last_sync_error})</span>}</div>
            </div>
            <div className="flex gap-4 text-center">
              {location?.average_rating != null && (
                <div><div className="text-xs text-muted-foreground">Note</div><div className="text-lg font-display font-bold flex items-center gap-1"><Star className="w-4 h-4 text-primary fill-primary" />{Number(location.average_rating).toFixed(1)}</div></div>
              )}
              <div><div className="text-xs text-muted-foreground">Avis</div><div className="text-lg font-display font-bold">{location?.total_reviews ?? 0}</div></div>
              <div><div className="text-xs text-muted-foreground">Photos</div><div className="text-lg font-display font-bold flex items-center gap-1"><ImageIcon className="w-4 h-4" />{location?.total_photos ?? 0}</div></div>
              {location?.maps_uri && <a href={location.maps_uri} target="_blank" rel="noreferrer" className="text-xs text-primary self-end flex items-center gap-1"><ExternalLink className="w-3 h-3" />Gérer sur Google</a>}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-display font-bold text-muted-foreground uppercase mb-2">Performance 28 jours</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <Kpi label="Vues totales" value={kpis28.totalViews} icon={Eye} />
              <Kpi label="Vues Search" value={kpis28.searchViews} icon={Search} />
              <Kpi label="Vues Maps" value={kpis28.mapsViews} icon={Compass} />
              <Kpi label="Appels" value={kpis28.agg.CALL_CLICKS ?? 0} icon={Phone} />
              <Kpi label="Itinéraires" value={kpis28.agg.BUSINESS_DIRECTION_REQUESTS ?? 0} icon={Navigation} />
              <Kpi label="Clics site" value={kpis28.agg.WEBSITE_CLICKS ?? 0} icon={MousePointerClick} />
            </div>
            {metrics.length === 0 && (
              <div className="mt-3 text-xs text-muted-foreground flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" /> Aucune donnée pour l'instant — la première synchro peut prendre quelques secondes.</div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Send className="w-4 h-4 text-primary" />
                <h3 className="font-display font-bold text-foreground">Nouvelle publication</h3>
              </div>
              <select value={postForm.topicType} onChange={(e) => setPostForm({ ...postForm, topicType: e.target.value as typeof postForm.topicType })}
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm mb-2">
                <option value="STANDARD">Publication standard</option>
                <option value="EVENT">Événement</option>
                <option value="OFFER">Offre</option>
                <option value="ALERT">Alerte COVID</option>
              </select>
              <textarea value={postForm.summary} onChange={(e) => setPostForm({ ...postForm, summary: e.target.value })}
                placeholder="Contenu de la publication (10 à 1500 caractères)"
                className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm min-h-[100px] mb-2" />
              <div className="grid grid-cols-2 gap-2 mb-2">
                <select value={postForm.cta_type} onChange={(e) => setPostForm({ ...postForm, cta_type: e.target.value })}
                  className="px-3 py-2 rounded-md border border-border bg-background text-xs">
                  <option value="">Aucun bouton</option>
                  <option value="LEARN_MORE">En savoir plus</option>
                  <option value="BOOK">Réserver</option>
                  <option value="ORDER">Commander</option>
                  <option value="CALL">Appeler</option>
                  <option value="SIGN_UP">S'inscrire</option>
                </select>
                <input value={postForm.cta_url} onChange={(e) => setPostForm({ ...postForm, cta_url: e.target.value })}
                  placeholder="URL du bouton (https://…)" className="px-3 py-2 rounded-md border border-border bg-background text-xs" />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">{postForm.summary.length} / 1500</span>
                <button onClick={publishPost} disabled={busy !== null || postForm.summary.length < 10}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-display font-semibold disabled:opacity-50">
                  {busy === "post" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Publier
                </button>
              </div>

              <div className="mt-4 space-y-2 max-h-[280px] overflow-y-auto">
                {posts.length === 0 && <p className="text-xs text-muted-foreground">Aucune publication.</p>}
                {posts.map((p) => (
                  <div key={p.id} className="text-xs border border-border rounded p-2">
                    <div className="flex justify-between gap-2">
                      <span className={`font-semibold ${p.status === "published" ? "text-primary" : p.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>{p.status.toUpperCase()}</span>
                      <span className="text-muted-foreground">{fmtDate(p.created_at)}</span>
                    </div>
                    <div className="text-foreground line-clamp-2 mt-1">{p.summary}</div>
                    {p.error_message && <div className="text-destructive text-[10px] mt-1">{p.error_message}</div>}
                    {p.google_search_url && <a href={p.google_search_url} target="_blank" rel="noreferrer" className="text-primary text-[10px] mt-1 inline-flex items-center gap-1"><ExternalLink className="w-2.5 h-2.5" />Voir sur Google</a>}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4 text-primary" />
                <h3 className="font-display font-bold text-foreground">Questions &amp; réponses</h3>
              </div>
              <div className="space-y-2 max-h-[440px] overflow-y-auto">
                {questions.length === 0 && <p className="text-xs text-muted-foreground">Aucune question publique pour l'instant.</p>}
                {questions.map((q) => (
                  <div key={q.id} className={`text-xs border rounded p-2 ${q.status === "answered" ? "border-border" : "border-primary/40 bg-primary/5"}`}>
                    <div className="flex justify-between gap-2 mb-1">
                      <span className="font-semibold text-foreground">{q.author_display_name ?? "Anonyme"}</span>
                      <span className="text-muted-foreground">{fmtDate(q.created_at_google)}</span>
                    </div>
                    <div className="text-foreground">{q.question_text}</div>
                    {q.owner_answer && <div className="mt-1 pl-2 border-l-2 border-primary text-muted-foreground italic">{q.owner_answer}</div>}
                    {q.status !== "answered" && (
                      answerFor === q.id ? (
                        <div className="mt-2">
                          <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)} placeholder="Votre réponse…" className="w-full px-2 py-1 rounded border border-border bg-background text-xs" />
                          <div className="flex gap-2 mt-1">
                            <button onClick={() => answerQuestion(q.id)} disabled={busy !== null} className="px-2 py-1 rounded bg-primary text-primary-foreground text-[10px] font-semibold disabled:opacity-50">Publier</button>
                            <button onClick={() => { setAnswerFor(null); setAnswerText(""); }} className="px-2 py-1 rounded border border-border text-[10px]">Annuler</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setAnswerFor(q.id); setAnswerText(""); }} className="mt-1 text-primary text-[10px] font-semibold flex items-center gap-1"><Plus className="w-2.5 h-2.5" />Répondre</button>
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-border bg-card p-3 text-xs text-muted-foreground flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-yellow-600" />
            <div>
              <b>Avis Google</b> : lecture/réponse aux avis + alertes nouveaux avis nécessitent l'API <code>mybusiness.v4</code> (approbation Google requise, délai 2-6 semaines). Livrés en Phase 2 dès approbation.
              <br /><b>Publications</b> : le endpoint <code>localPosts</code> (v4) requiert la même approbation — les publications peuvent échouer tant que l'accès n'est pas accordé.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
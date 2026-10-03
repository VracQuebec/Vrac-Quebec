import { useCallback, useEffect, useRef, useState } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

const db = supabase as any;
const MODE: Record<string, string> = { ia: "Assistant", humain: "En direct", ferme: "Terminée" };
const fmt = (s: string) => new Date(s).toLocaleString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function AdminConversations() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"actives" | "toutes">("actives");
  const box = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    let q = db.from("site_chat_sessions").select("id,audience,mode,agent_id,agent_name,wants_human,page,msg_count,created_at,last_at").order("last_at", { ascending: false }).limit(100);
    if (filter === "actives") q = q.neq("mode", "ferme");
    const { data } = await q; setSessions(data ?? []);
  }, [filter]);
  const loadMsgs = useCallback(async (id: string) => {
    const { data } = await db.from("site_chat_messages").select("*").eq("session_id", id).order("id").limit(500); setMsgs(data ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser(); setMe(u.user?.id ?? null);
      const { data } = await db.rpc("site_chat_can_agent"); setAllowed(!!data);
    })();
  }, []);
  useEffect(() => { if (allowed) loadSessions(); }, [allowed, loadSessions]);
  useEffect(() => { if (sel) loadMsgs(sel); }, [sel, loadMsgs]);
  useEffect(() => {
    if (!allowed) return;
    const ch = supabase.channel("site-chat-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "site_chat_sessions" }, () => loadSessions())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "site_chat_messages" }, (p: any) => { if (p.new.session_id === sel) setMsgs((m) => m.some((x) => x.id === p.new.id) ? m : [...m, p.new]); })
      .subscribe();
    const t = setInterval(() => { loadSessions(); if (sel) loadMsgs(sel); }, 10000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [allowed, sel, loadSessions, loadMsgs]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [msgs]);

  const act = async (action: string, t?: string) => {
    if (!sel || busy) return; setBusy(true);
    const { error } = await db.rpc("site_chat_agent_action", { _session: sel, _action: action, _text: t ?? null });
    setBusy(false);
    if (error) return toast({ title: "Refusé", description: error.message, variant: "destructive" });
    if (action === "message") setText("");
    loadMsgs(sel); loadSessions();
  };

  if (allowed === null) return <p className="p-8 text-muted-foreground">Chargement…</p>;
  if (!allowed) return <p className="p-8 text-muted-foreground">Accès réservé aux personnes autorisées par Vrac Québec.</p>;
  const s = sessions.find((x) => x.id === sel);
  const mine = s?.mode === "humain" && s?.agent_id === me;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Conversations du site" />
      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-6 md:grid-cols-[320px_1fr]">
        <section className={`space-y-2 ${sel ? "hidden md:block" : ""}`}>
          <div className="flex gap-2">
            {(["actives", "toutes"] as const).map((f) => <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>{f === "actives" ? "En cours" : "Toutes"}</Button>)}
          </div>
          {!sessions.length && <p className="text-sm text-muted-foreground">Aucune conversation.</p>}
          {sessions.map((x) => (
            <button key={x.id} onClick={() => setSel(x.id)} className={`w-full rounded-md border p-2 text-left text-sm ${sel === x.id ? "border-primary" : "border-border"}`}>
              <div className="flex items-center gap-2">
                <span className="font-medium">{x.audience === "entrepreneur" ? "Entrepreneur" : x.audience === "client" ? "Client" : "Visiteur"}</span>
                {x.wants_human && x.mode === "ia" && <span className="rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">Demande une personne</span>}
                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs">{MODE[x.mode]}</span>
              </div>
              <p className="text-xs text-muted-foreground">{fmt(x.last_at)} · {x.msg_count} messages · {x.page ?? "/"}{x.agent_name ? ` · ${x.agent_name}` : ""}</p>
            </button>
          ))}
        </section>

        <section className={`flex min-h-[70vh] flex-col rounded-lg border border-border ${sel ? "" : "hidden md:flex"}`}>
          {!s ? <p className="m-auto text-sm text-muted-foreground">Choisissez une conversation.</p> : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
                <Button size="sm" variant="ghost" className="md:hidden" onClick={() => setSel(null)}>← Liste</Button>
                <span className="text-sm font-medium">{MODE[s.mode]}{s.agent_name ? ` · ${s.agent_name}` : ""}</span>
                <div className="ml-auto flex flex-wrap gap-2">
                  {s.mode !== "ferme" && !mine && <Button size="sm" disabled={busy} onClick={() => act("prendre")}>Prendre le contrôle</Button>}
                  {s.mode === "humain" && <Button size="sm" variant="outline" disabled={busy} onClick={() => act("rendre")}>Rendre à l'assistant</Button>}
                  {s.mode !== "ferme" && <Button size="sm" variant="outline" disabled={busy} onClick={() => act("fermer")}>Terminer</Button>}
                </div>
              </div>
              <div ref={box} className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
                {msgs.map((m) => m.role === "systeme"
                  ? <p key={m.id} className="text-center text-xs text-muted-foreground">{m.content}</p>
                  : <div key={m.id} className={`max-w-[85%] whitespace-pre-wrap rounded-lg p-2 ${m.role === "visiteur" ? "bg-muted" : m.role === "agent" ? "ml-auto bg-primary text-primary-foreground" : "ml-auto border border-border"}`}>
                      <p className="mb-0.5 text-xs opacity-70">{m.role === "visiteur" ? "Visiteur" : m.role === "agent" ? "Équipe" : "Assistant IA"} · {fmt(m.created_at)}</p>{m.content}
                    </div>)}
              </div>
              {mine ? (
                <form className="flex gap-2 border-t border-border p-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) act("message", text); }}>
                  <textarea aria-label="Réponse" rows={2} value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} className="flex-1 resize-none rounded-md border border-border bg-background p-2 text-sm" placeholder="Répondre au visiteur…" />
                  <Button type="submit" disabled={busy || !text.trim()}>Envoyer</Button>
                </form>
              ) : s.mode !== "ferme" && <p className="border-t border-border p-2 text-xs text-muted-foreground">Prenez le contrôle pour répondre. L'assistant IA se tait dès que vous prenez le relais.</p>}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

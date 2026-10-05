import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MessageCircle, Send, UserRound, X } from "lucide-react";

const db = supabase as any;
const KEY = "vq.site-assistant.token";
type Msg = { id: number; role: "visiteur" | "ia" | "agent" | "systeme"; content: string };

const QUICK: { label: string; text: string; audience: "client" | "entrepreneur" }[] = [
  { label: "Acheter du gravier, sable ou terre", text: "Je veux acheter des matériaux en vrac livrés.", audience: "client" },
  { label: "Me débarrasser de remblai", text: "J'ai du remblai à me débarrasser, où le porter?", audience: "client" },
  { label: "Transport en vrac / pépine", text: "J'ai besoin d'un camion ou d'une pépine.", audience: "client" },
  { label: "Je suis entrepreneur", text: "Je suis entrepreneur, comment fonctionne Vrac Québec pour moi?", audience: "entrepreneur" },
];

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\(\/[^)\s]*\))/g);
  return <>{parts.map((p, i) => {
    const m = p.match(/^\[([^\]]+)\]\((\/[^)\s]*)\)$/);
    return m ? <Link key={i} to={m[2]} className="font-semibold text-primary underline underline-offset-2">{m[1]}</Link> : <span key={i}>{p.replace(/\*\*/g, "")}</span>;
  })}</>;
}

export default function SiteAssistant() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(KEY));
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [mode, setMode] = useState("ia");
  const [agent, setAgent] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const last = useRef(0);
  const lock = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  const poll = useCallback(async (t = token) => {
    if (!t) return;
    const { data } = await db.rpc("site_chat_poll", { _token: t, _after: last.current });
    if (!data) { localStorage.removeItem(KEY); setToken(null); return; }
    setMode(data.mode); setAgent(data.agent);
    if (data.messages?.length) { last.current = data.messages[data.messages.length - 1].id; setMsgs((m) => [...m, ...data.messages.filter((x: Msg) => !m.some((y) => y.id === x.id))]); }
  }, [token]);

  useEffect(() => { if (open && token && !last.current) poll(); }, [open, token, poll]);
  useEffect(() => {
    if (!open || !token) return;
    const t = setInterval(() => poll(), mode === "humain" ? 2500 : 6000);
    return () => clearInterval(t);
  }, [open, token, mode, poll]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [msgs, sending]);

  const send = async (t: string, extra: { audience?: string; wantHuman?: boolean } = {}) => {
    if (lock.current || (!t.trim() && !extra.wantHuman)) return;
    lock.current = true; setSending(true); setErr(null);
    if (t.trim()) setMsgs((m) => [...m, { id: -Date.now(), role: "visiteur", content: t.trim() }]);
    const { data, error } = await supabase.functions.invoke("site-assistant", { body: { token, text: t, page: window.location.pathname, ...extra } });
    setSending(false); lock.current = false;
    if (error || data?.error) { setErr(data?.error ?? "Erreur réseau. Votre message n'a pas été envoyé."); if (t.trim()) setText(t); setMsgs((m) => m.filter((x) => x.id > 0)); return; }
    setText("");
    if (data.token !== token) { localStorage.setItem(KEY, data.token); setToken(data.token); last.current = 0; setMsgs([]); }
    else setMsgs((m) => m.filter((x) => x.id > 0));
    await poll(data.token);
  };

  const restart = () => { localStorage.removeItem(KEY); setToken(null); setMsgs([]); last.current = 0; setMode("ia"); setAgent(null); };

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Ouvrir l'assistant Vrac Québec"
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-3 z-[60] flex h-11 w-11 items-center justify-center rounded-full bg-primary p-0 font-display text-sm font-semibold text-primary-foreground shadow-xl sm:w-auto sm:px-4 md:bottom-6 md:right-6">
          <MessageCircle className="h-5 w-5" /> <span className="hidden sm:inline">Besoin d'aide?</span>
        </button>
      )}
      {open && (
        <div role="dialog" aria-label="Assistant Vrac Québec" className="fixed inset-x-2 bottom-2 top-16 z-[70] flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl md:inset-x-auto md:bottom-6 md:right-6 md:top-auto md:h-[600px] md:w-[400px]">
          <header className="flex items-center gap-2 bg-foreground px-3 py-2 text-background">
            <MessageCircle className="h-5 w-5 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold">Assistant Vrac Québec</p>
              <p className="truncate text-xs opacity-80">{mode === "humain" ? `En direct avec ${agent ?? "l'équipe"}` : mode === "ferme" ? "Conversation terminée" : "Réponse instantanée · une personne peut prendre le relais"}</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Fermer l'assistant" className="rounded p-1 hover:bg-background/10"><X className="h-5 w-5" /></button>
          </header>
          <div ref={box} className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
            <div className="max-w-[85%] rounded-lg bg-muted p-2">Bonjour! Je peux vous guider pour acheter des matériaux, vous débarrasser de remblai, trouver un camion ou une pépine, ou utiliser l'espace entrepreneur. Que cherchez-vous?</div>
            {!msgs.length && (
              <div className="flex flex-wrap gap-1.5">
                {QUICK.map((q) => <button key={q.label} disabled={sending} onClick={() => send(q.text, { audience: q.audience })} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs hover:border-primary">{q.label}</button>)}
              </div>
            )}
            {msgs.map((m) => m.role === "systeme"
              ? <p key={m.id} className="text-center text-xs text-muted-foreground">{m.content}</p>
              : <div key={m.id} className={`max-w-[85%] whitespace-pre-wrap rounded-lg p-2 ${m.role === "visiteur" ? "ml-auto bg-primary text-primary-foreground" : m.role === "agent" ? "border border-primary bg-background" : "bg-muted"}`}>
                  {m.role === "agent" && <p className="mb-0.5 text-xs font-semibold text-primary">{agent ?? "Équipe Vrac Québec"}</p>}
                  <Rich text={m.content} />
                </div>)}
            {sending && mode !== "humain" && <p className="text-xs text-muted-foreground">L'assistant écrit…</p>}
          </div>
          {err && <p role="alert" className="border-t border-border bg-destructive/10 px-3 py-1.5 text-xs text-destructive">{err}</p>}
          {mode === "ferme" ? (
            <div className="border-t border-border p-2"><Button className="w-full" onClick={restart}>Nouvelle conversation</Button></div>
          ) : (
            <form className="space-y-1.5 border-t border-border p-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
              <div className="flex gap-1.5">
                <textarea aria-label="Votre message" rows={1} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
                  placeholder="Écrivez votre question…" className="min-h-[40px] flex-1 resize-none rounded-md border border-border bg-background px-2 py-2 text-sm" />
                <Button type="submit" size="icon" disabled={sending || !text.trim()} aria-label="Envoyer"><Send className="h-4 w-4" /></Button>
              </div>
              {mode === "ia" && (
                <button type="button" disabled={sending} onClick={() => send(text, { wantHuman: true })} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
                  <UserRound className="h-3.5 w-3.5" /> Parler à une personne
                </button>
              )}
            </form>
          )}
        </div>
      )}
    </>
  );
}

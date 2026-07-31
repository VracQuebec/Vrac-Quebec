// Copilote IA conversationnel branché sur les données réelles de la plateforme.
import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { invokeIntel } from "@/lib/jsc/intel";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Combien avons-nous vendu aujourd'hui ?",
  "Quel est notre meilleur fournisseur ?",
  "Quels clients n'ont pas commandé depuis 6 mois ?",
  "Quels transporteurs sont les plus rentables ?",
  "Pourquoi cette soumission est-elle plus chère ?",
];

export default function AiCopilot({ companyId }: { companyId: string | null }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await invokeIntel<{ reply: string }>("vqos-copilot", {
        messages: next, company_id: companyId,
      });
      setMessages([...next, { role: "assistant", content: res.reply }]);
    } catch (e) {
      toast.error((e as Error).message);
      setMessages(next);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <Card className="flex h-[70vh] flex-col">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <div className="space-y-3 py-6 text-center">
              <Bot className="mx-auto h-8 w-8 text-primary" />
              <p className="text-sm text-muted-foreground">
                Posez une question — le copilote lit directement les données de la plateforme.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} size="sm" variant="outline" onClick={() => void send(s)}>{s}</Button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}>
              {m.role === "assistant" && <Bot className="mt-1 h-4 w-4 shrink-0 text-primary" />}
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}>
                {m.role === "assistant"
                  ? <div className="prose prose-sm max-w-none dark:prose-invert"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                  : m.content}
              </div>
              {m.role === "user" && <User className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Analyse des données…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="flex items-end gap-2 border-t pt-3">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); }
            }}
            placeholder="Posez votre question…"
            className="min-h-[44px] resize-none"
            rows={1}
          />
          <Button onClick={() => void send(input)} disabled={loading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
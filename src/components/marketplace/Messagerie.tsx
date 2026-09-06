// ============================================================
// MESSAGERIE INTERNE — place de marché Vrac Québec
// Conversations rattachées à une demande, un lot ou une soumission.
// Les coordonnées directes restent masquées tant que la règle de
// confidentialité de la plateforme ne les autorise pas.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock, Mail, MapPin, Phone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  contactRuleLabel, fetchClientContact, fetchMessages, fetchPartnerContact,
  fetchThreads, fetchUnreadCounts, markThreadRead, sendMessage,
  type ContactReveal, type Message, type Thread,
} from "@/lib/marketplace/api";

type Party = "client" | "partenaire" | "vrac_quebec";

const dateTimeFr = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : "—";

const partyLabel: Record<string, string> = {
  client: "Client",
  partenaire: "Entreprise partenaire",
  vrac_quebec: "Vrac Québec",
};

export function ContactCard({
  requestId, companyId, party,
}: { requestId: string; companyId: string; party: Party }) {
  const [contact, setContact] = useState<ContactReveal | null>(null);

  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const c = party === "client"
          ? await fetchPartnerContact(requestId, companyId)
          : await fetchClientContact(requestId, companyId);
        if (!annule) setContact(c);
      } catch {
        if (!annule) setContact(null);
      }
    })();
    return () => { annule = true; };
  }, [requestId, companyId, party]);

  if (!contact) return null;

  return (
    <div className="rounded-lg border p-3 text-sm">
      <p className="font-medium">{contact.name ?? (party === "client" ? "Entreprise partenaire" : "Client")}</p>
      {contact.visible ? (
        <div className="mt-2 space-y-1 text-muted-foreground">
          {contact.phone && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" />{contact.phone}</p>}
          {contact.email && <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" />{contact.email}</p>}
          {contact.address && <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" />{contact.address}</p>}
          {contact.extra && <p className="text-xs">{contact.extra}</p>}
        </div>
      ) : (
        <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Coordonnées protégées — {contactRuleLabel(contact.rule).toLowerCase()}. Échangez par la messagerie
          Vrac Québec en attendant.
        </p>
      )}
    </div>
  );
}

export default function Messagerie({
  requestId, companyId, party, titre = "Messagerie",
}: { requestId?: string; companyId?: string; party: Party; titre?: string }) {
  const { toast } = useToast();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [actif, setActif] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [texte, setTexte] = useState("");
  const [loading, setLoading] = useState(true);
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchThreads({ requestId, companyId: party === "partenaire" ? companyId : undefined });
      setThreads(list);
      setUnread(await fetchUnreadCounts(list.map((t) => t.id)));
      setActif((prev) => prev ?? list[0]?.id ?? null);
    } catch (e) {
      toast({ title: "Messagerie indisponible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [requestId, companyId, party, toast]);

  useEffect(() => { void charger(); }, [charger]);

  useEffect(() => {
    if (!actif) { setMessages([]); return; }
    let annule = false;
    void (async () => {
      try {
        const list = await fetchMessages(actif);
        if (annule) return;
        setMessages(list);
        await markThreadRead(actif);
        setUnread((u) => ({ ...u, [actif]: 0 }));
      } catch { /* le fil peut être inaccessible */ }
    })();
    return () => { annule = true; };
  }, [actif]);

  const envoyer = async () => {
    if (!actif || !texte.trim()) return;
    setEnvoi(true);
    try {
      await sendMessage({ threadId: actif, body: texte.trim(), party, companyId: party === "partenaire" ? companyId : null });
      setTexte("");
      setMessages(await fetchMessages(actif));
    } catch (e) {
      toast({ title: "Envoi impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setEnvoi(false);
    }
  };

  const fil = threads.find((t) => t.id === actif) ?? null;

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">{titre}</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : threads.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucune conversation pour le moment.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            <div className="space-y-1 md:max-h-[420px] md:overflow-y-auto">
              {threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActif(t.id)}
                  className={`w-full rounded-md border p-2 text-left text-sm transition hover:border-primary ${
                    actif === t.id ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{t.subject || "Conversation"}</span>
                    {unread[t.id] > 0 && (
                      <span className="rounded-full bg-primary px-2 text-[11px] text-primary-foreground">{unread[t.id]}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{dateTimeFr(t.last_message_at)}</p>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {fil && fil.company_id && (
                <ContactCard requestId={fil.request_id} companyId={fil.company_id} party={party} />
              )}
              <div className="max-h-[300px] space-y-2 overflow-y-auto rounded-lg border p-3">
                {messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun message.</p>
                ) : messages.map((m) => (
                  <div key={m.id} className={`rounded-md p-2 text-sm ${m.party === party ? "bg-primary/10" : "bg-muted"}`}>
                    <p className="text-[11px] text-muted-foreground">
                      {partyLabel[m.party] ?? m.party} · {dateTimeFr(m.created_at)}
                    </p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-end gap-2">
                <Textarea
                  value={texte}
                  onChange={(e) => setTexte(e.target.value)}
                  placeholder="Écrire un message…"
                  className="min-h-[70px]"
                />
                <Button disabled={envoi || !texte.trim()} onClick={() => void envoyer()}>
                  {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// ESPACE CLIENT — mes demandes et comparaison des soumissions
// Le client suit ses demandes, compare les offres reçues sans se
// limiter au prix, pose une question, retient une soumission ou
// demande conseil à Vrac Québec.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, HelpCircle, Loader2, MessageSquare, ShieldCheck } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";
import NotificationsPanel from "@/components/marketplace/NotificationsPanel";
import FullPageState from "@/components/FullPageState";
import Messagerie from "@/components/marketplace/Messagerie";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  clientMessage, fetchClientAwards, fetchClientBids, fetchClientDocuments,
  fetchClientRequests, retainBid, type ClientBid,
} from "@/lib/marketplace/api";
import {
  BID_STATUSES, PRICE_TYPES, REQUEST_STATUSES, labelOf, type QuoteRequest,
} from "@/lib/marketplace/types";

type Row = Record<string, unknown>;

const money = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : `${Number(v).toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const dateFr = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" }) : "—";

const ONGLETS = [
  { value: "toutes", label: "Mes demandes" },
  { value: "attente", label: "En attente" },
  { value: "recues", label: "Soumissions reçues" },
  { value: "attribues", label: "Projets attribués" },
  { value: "termines", label: "Projets terminés" },
  { value: "documents", label: "Documents" },
  { value: "messages", label: "Messages" },
] as const;
type Onglet = (typeof ONGLETS)[number]["value"];

const EN_ATTENTE = ["brouillon", "nouvelle", "a_qualifier", "a_matcher", "distribuee", "sans_soumission"];
const ATTRIBUES = ["attribution_a_confirmer", "attribuee", "en_cours"];

export default function MesSoumissions() {
  const { user, isReady } = useAuthReady();
  const { toast } = useToast();

  const [onglet, setOnglet] = useState<Onglet>("toutes");
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [awards, setAwards] = useState<Row[]>([]);
  const [documents, setDocuments] = useState<Row[]>([]);
  const [bidsByRequest, setBidsByRequest] = useState<Record<string, ClientBid[]>>({});
  const [loading, setLoading] = useState(true);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClientBid | null>(null);
  const [question, setQuestion] = useState<{ requestId: string; bid: ClientBid | null; conseil: boolean } | null>(null);
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchClientRequests();
      setRequests(list);
      const ids = list.map((r) => r.id);
      const [aw, docs, bids] = await Promise.all([
        fetchClientAwards(ids),
        fetchClientDocuments(ids),
        Promise.all(ids.map(async (id) => [id, await fetchClientBids(id)] as const)),
      ]);
      setAwards(aw);
      setDocuments(docs);
      setBidsByRequest(Object.fromEntries(bids));
    } catch (e) {
      toast({ title: "Chargement impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isReady && user) void charger();
    else if (isReady) setLoading(false);
  }, [isReady, user, charger]);

  const visibles = useMemo(() => {
    if (onglet === "attente") return requests.filter((r) => EN_ATTENTE.includes(r.status));
    if (onglet === "recues") return requests.filter((r) => (bidsByRequest[r.id] ?? []).length > 0);
    if (onglet === "attribues") return requests.filter((r) => ATTRIBUES.includes(r.status));
    if (onglet === "termines") return requests.filter((r) => r.status === "terminee");
    return requests;
  }, [onglet, requests, bidsByRequest]);

  const retenir = async (bid: ClientBid) => {
    setEnvoi(true);
    try {
      await retainBid(bid.id);
      toast({
        title: "Soumission retenue",
        description: `Vrac Québec confirme l'attribution avec ${bid.partner_name}.`,
      });
      setDetail(null);
      await charger();
    } catch (e) {
      toast({ title: "Action impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setEnvoi(false);
    }
  };

  const envoyerMessage = async () => {
    if (!question || !texte.trim()) return;
    setEnvoi(true);
    try {
      await clientMessage({
        requestId: question.requestId,
        lotId: question.bid?.lot_id ?? null,
        companyId: question.conseil ? null : question.bid?.company_id ?? null,
        subject: question.conseil ? "Demande de conseil à Vrac Québec" : "Question sur une soumission",
        body: texte.trim(),
        kind: question.conseil ? "support" : "client_partenaire",
      });
      toast({
        title: question.conseil ? "Demande envoyée à Vrac Québec" : "Question envoyée",
        description: "Vous recevrez la réponse dans cet espace.",
      });
      setQuestion(null);
      setTexte("");
    } catch (e) {
      toast({ title: "Envoi impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setEnvoi(false);
    }
  };

  if (!isReady || loading) return <FullPageState title="Mes soumissions" message="Chargement de vos demandes…" showSpinner />;
  if (!user) {
    return (
      <FullPageState
        title="Connexion requise"
        message="Connectez-vous pour suivre vos demandes et comparer les soumissions reçues."
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mes soumissions</h1>
          <p className="text-sm text-muted-foreground">
            Suivez vos demandes, comparez les offres et retenez l'entreprise qui vous convient.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/"><ArrowLeft className="mr-2 h-4 w-4" />Accueil</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/obtenir-des-soumissions">Nouvelle demande</Link>
          </Button>
        </div>
      </div>

      <NotificationsPanel userId={user?.id} audience="client" />

      <Tabs value={onglet} onValueChange={(v) => setOnglet(v as Onglet)}>
        <TabsList className="flex w-full flex-wrap justify-start gap-1 h-auto">
          {ONGLETS.map((o) => (
            <TabsTrigger key={o.value} value={o.value} className="text-xs sm:text-sm">{o.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {onglet === "messages" ? (
        <Messagerie party="client" titre="Mes conversations" />
      ) : onglet === "documents" ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Documents de mes demandes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun document pour le moment.</p>
            ) : documents.map((d) => (
              <div key={d.id as string} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <span className="font-medium">{(d.name as string) || "Document"}</span>
                <span className="text-muted-foreground">
                  {requests.find((r) => r.id === d.request_id)?.request_number ?? "—"} · {dateFr(d.created_at as string)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : visibles.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Aucune demande dans cette section.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibles.map((r) => {
            const bids = bidsByRequest[r.id] ?? [];
            const award = awards.find((a) => a.request_id === r.id);
            const ouvert = ouverte === r.id;
            return (
              <Card key={r.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{r.title}</CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.request_number ?? "—"} · {r.city ?? "—"} · déposée le {dateFr(r.created_at)}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <span className="inline-block rounded-full bg-secondary px-3 py-1 font-medium">
                        {labelOf(REQUEST_STATUSES, r.status)}
                      </span>
                      <p className="mt-1 text-muted-foreground">
                        {bids.length === 0 ? "Aucune soumission reçue" : `${bids.length} soumission${bids.length > 1 ? "s" : ""}`}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {award && (
                    <div className="flex items-center gap-2 rounded-md bg-primary/10 p-3 text-sm">
                      <ShieldCheck className="h-4 w-4 shrink-0" />
                      Attribution en cours de confirmation par Vrac Québec — {money(award.amount as number)}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {bids.length > 0 && (
                      <Button size="sm" variant="outline" onClick={() => setOuverte(ouvert ? null : r.id)}>
                        {ouvert ? "Masquer la comparaison" : "Comparer les soumissions"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setQuestion({ requestId: r.id, bid: null, conseil: true }); setTexte(""); }}
                    >
                      <HelpCircle className="mr-2 h-4 w-4" />Demander conseil à Vrac Québec
                    </Button>
                  </div>

                  {ouvert && bids.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-sm">
                        <thead className="text-left text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="py-2 pr-3">Entreprise</th>
                            <th className="py-2 pr-3">Montant</th>
                            <th className="py-2 pr-3">Type de prix</th>
                            <th className="py-2 pr-3">Délai</th>
                            <th className="py-2 pr-3">Disponibilité</th>
                            <th className="py-2 pr-3">Portée</th>
                            <th className="py-2 pr-3">Note</th>
                            <th className="py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {bids.map((b) => (
                            <tr key={b.id} className="border-t align-top">
                              <td className="py-3 pr-3">
                                <div className="font-medium">{b.partner_name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {b.partner_city ?? "—"} · {labelOf(BID_STATUSES, b.status)}
                                </div>
                              </td>
                              <td className="py-3 pr-3 font-semibold">
                                {money(b.amount)}
                                <div className="text-xs font-normal text-muted-foreground">
                                  {b.taxes_included ? "taxes incluses" : "taxes en sus"}
                                </div>
                              </td>
                              <td className="py-3 pr-3">{labelOf(PRICE_TYPES, b.price_type)}</td>
                              <td className="py-3 pr-3">{b.lead_time || "—"}</td>
                              <td className="py-3 pr-3">{dateFr(b.available_from)}</td>
                              <td className="py-3 pr-3 max-w-[220px] whitespace-pre-wrap">{b.scope || "—"}</td>
                              <td className="py-3 pr-3">{b.partner_score != null ? `${Math.round(b.partner_score)} / 100` : "—"}</td>
                              <td className="py-3">
                                <div className="flex flex-col gap-1">
                                  <Button size="sm" variant="outline" onClick={() => setDetail(b)}>Voir la soumission</Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => { setQuestion({ requestId: r.id, bid: b, conseil: false }); setTexte(""); }}
                                  >
                                    <MessageSquare className="mr-2 h-4 w-4" />Poser une question
                                  </Button>
                                  {["envoyee", "vue", "preselectionnee"].includes(b.status) && (
                                    <Button size="sm" disabled={envoi} onClick={() => void retenir(b)}>
                                      Retenir cette soumission
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-3 text-xs text-muted-foreground">
                        Le prix le plus bas n'est pas toujours le meilleur choix : comparez la portée des travaux,
                        les conditions et la disponibilité avant de décider.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => setDetail(null)}>
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-background p-5 sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">{detail.partner_name}</h2>
            <p className="text-sm text-muted-foreground">
              {money(detail.amount)} · {labelOf(PRICE_TYPES, detail.price_type)} ·{" "}
              {detail.taxes_included ? "taxes incluses" : "taxes en sus"}
            </p>
            {detail.lines?.length > 0 && (
              <div className="mt-4 space-y-1 text-sm">
                <p className="font-medium">Détail des postes</p>
                {detail.lines.map((l, i) => (
                  <div key={i} className="flex justify-between border-b py-1">
                    <span>{l.label}</span><span>{money(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <dl className="mt-4 space-y-2 text-sm">
              <div><dt className="font-medium">Portée des travaux</dt><dd className="whitespace-pre-wrap text-muted-foreground">{detail.scope || "—"}</dd></div>
              <div><dt className="font-medium">Conditions</dt><dd className="whitespace-pre-wrap text-muted-foreground">{detail.conditions || "—"}</dd></div>
              <div><dt className="font-medium">Délai</dt><dd className="text-muted-foreground">{detail.lead_time || "—"}</dd></div>
              <div><dt className="font-medium">Disponible à partir du</dt><dd className="text-muted-foreground">{dateFr(detail.available_from)}</dd></div>
              <div><dt className="font-medium">Offre valide jusqu'au</dt><dd className="text-muted-foreground">{dateFr(detail.valid_until)}</dd></div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              {["envoyee", "vue", "preselectionnee"].includes(detail.status) && (
                <Button disabled={envoi} onClick={() => void retenir(detail)}>
                  {envoi && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Retenir cette soumission
                </Button>
              )}
              <Button variant="outline" onClick={() => setDetail(null)}>Fermer</Button>
            </div>
          </div>
        </div>
      )}

      {question && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={() => setQuestion(null)}>
          <div className="w-full max-w-lg rounded-t-xl bg-background p-5 sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">
              {question.conseil ? "Demander conseil à Vrac Québec" : `Question à ${question.bid?.partner_name}`}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {question.conseil
                ? "Notre équipe vous aide à comparer les offres reçues et à choisir."
                : "Votre message reste dans la plateforme; vos coordonnées ne sont pas transmises."}
            </p>
            <Textarea
              className="mt-3 min-h-[120px]"
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              placeholder="Votre message…"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setQuestion(null)}>Annuler</Button>
              <Button disabled={envoi || !texte.trim()} onClick={() => void envoyerMessage()}>
                {envoi && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Envoyer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

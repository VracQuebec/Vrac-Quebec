// ============================================================
// CENTRE DE SOUMISSIONS — compte entreprise partenaire
// Occasions reçues, analyse, dépôt de soumission (brouillon puis
// envoi horodaté), questions et suivi des résultats.
// L'isolation par entreprise est appliquée par la base (RLS).
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";
import NotificationsPanel from "@/components/marketplace/NotificationsPanel";
import { useUserRoles } from "@/hooks/useUserRole";
import { useFleetTenant } from "@/lib/fleet/tenant";
import { CompanySwitcher, SupportBanner } from "@/components/fleet/FleetTenantBar";
import FullPageState from "@/components/FullPageState";
import Messagerie, { ContactCard } from "@/components/marketplace/Messagerie";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  askQuestion, declineInvitation, fetchOpportunities, markInvitationAnswered,
  markInvitationViewed, saveBid, sendBid, type Opportunity,
} from "@/lib/marketplace/api";
import { BID_STATUSES, PRICE_TYPES, labelOf } from "@/lib/marketplace/types";

type Line = { label: string; amount: number; note?: string };
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const money = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${Number(v).toLocaleString("fr-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const dateFr = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" }) : "—";
const dateTimeFr = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("fr-CA", { dateStyle: "medium", timeStyle: "short" }) : "—";

const ONGLETS = [
  { value: "nouvelles", label: "Nouvelles occasions" },
  { value: "analyse", label: "À analyser" },
  { value: "envoyees", label: "Soumissions envoyées" },
  { value: "gagnees", label: "Gagnées" },
  { value: "non_retenues", label: "Non retenues" },
  { value: "expirees", label: "Expirées" },
  { value: "archivees", label: "Archivées" },
] as const;
type Onglet = (typeof ONGLETS)[number]["value"];

function bucketOf(o: Opportunity): Onglet {
  const inv = o.invitation.status;
  const bid = o.bid?.status;
  if (inv === "expiree" || bid === "expiree") return "expirees";
  if (bid === "retenue") return "gagnees";
  if (bid === "non_retenue") return "non_retenues";
  if (inv === "declinee" || bid === "retiree") return "archivees";
  if (bid && bid !== "brouillon") return "envoyees";
  if (bid === "brouillon" || inv === "vue" || inv === "interessee") return "analyse";
  return "nouvelles";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs font-body">
      {children}
    </span>
  );
}

export default function PartenaireSoumissions() {
  const { user, isReady, isAuthenticated } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, isReady);
  const tenant = useFleetTenant(isAdmin, isReady && !roleLoading && isAuthenticated);
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Opportunity[]>([]);
  const [onglet, setOnglet] = useState<Onglet>("nouvelles");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Formulaire de soumission
  const [priceType, setPriceType] = useState("forfait");
  const [amount, setAmount] = useState("");
  const [taxesIncluded, setTaxesIncluded] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [leadTime, setLeadTime] = useState("");
  const [availableFrom, setAvailableFrom] = useState("");
  const [scope, setScope] = useState("");
  const [conditions, setConditions] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [question, setQuestion] = useState("");
  const [declineReason, setDeclineReason] = useState("");

  const companyId = tenant.companyId;

  const charger = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      setItems(await fetchOpportunities(companyId));
    } catch (e) {
      toast({ title: "Chargement impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => { void charger(); }, [charger]);
  useEffect(() => { setSelectedId(null); }, [companyId, onglet]);

  const filtres = useMemo(() => {
    const map = new Map<Onglet, Opportunity[]>();
    ONGLETS.forEach((o) => map.set(o.value, []));
    items.forEach((o) => map.get(bucketOf(o))!.push(o));
    return map;
  }, [items]);

  const liste = filtres.get(onglet) ?? [];
  const selected = items.find((o) => o.invitation.id === selectedId) ?? null;

  const total = useMemo(
    () => (lines.length ? lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0) : Number(amount) || 0),
    [lines, amount],
  );

  const ouvrir = async (o: Opportunity) => {
    setSelectedId(o.invitation.id);
    setPriceType(o.bid?.price_type ?? "forfait");
    setAmount(o.bid?.amount != null ? String(o.bid.amount) : "");
    setTaxesIncluded(o.bid?.taxes_included ?? false);
    setLines((o.bid?.lines as Line[]) ?? []);
    setLeadTime(s(o.bid?.lead_time));
    setAvailableFrom(s(o.bid?.available_from));
    setScope(s(o.bid?.scope));
    setConditions(s(o.bid?.conditions));
    setValidUntil(s(o.bid?.valid_until));
    setQuestion("");
    setDeclineReason("");
    try {
      await markInvitationViewed(o.invitation);
      await charger();
    } catch { /* consultation non bloquante */ }
  };

  const payload = (o: Opportunity) => ({
    id: o.bid?.id,
    request_id: o.request.id,
    lot_id: o.invitation.lot_id ?? null,
    invitation_id: o.invitation.id,
    company_id: o.invitation.company_id ?? companyId!,
    price_type: priceType,
    amount: total || null,
    taxes_included: taxesIncluded,
    lines,
    lead_time: leadTime || null,
    available_from: availableFrom || null,
    scope: scope || null,
    conditions: conditions || null,
    valid_until: validUntil || null,
  });

  const enregistrer = async (envoyer: boolean) => {
    if (!selected) return;
    setSaving(true);
    try {
      const row = payload(selected);
      const saved = await saveBid({ ...row, status: selected.bid?.status ?? "brouillon" } as never);
      const bidId = saved?.id ?? selected.bid?.id;
      if (envoyer && bidId) {
        await sendBid(bidId);
        await markInvitationAnswered(selected.invitation.id);
      }
      toast({
        title: envoyer ? "Soumission envoyée" : "Brouillon enregistré",
        description: envoyer ? `Horodatée le ${dateTimeFr(new Date().toISOString())}.` : undefined,
      });
      await charger();
      if (envoyer) setSelectedId(null);
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const decliner = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await declineInvitation(selected.invitation.id, declineReason);
      toast({ title: "Occasion déclinée" });
      setSelectedId(null);
      await charger();
    } catch (e) {
      toast({ title: "Action impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const poserQuestion = async () => {
    if (!selected || !question.trim() || !companyId) return;
    setSaving(true);
    try {
      await askQuestion({
        requestId: selected.request.id,
        lotId: selected.invitation.lot_id ?? null,
        companyId,
        subject: `Question — ${selected.request.request_number ?? selected.request.title}`,
        body: question.trim(),
      });
      setQuestion("");
      toast({ title: "Question transmise", description: "Vrac Québec vous répondra dans le fil de la demande." });
    } catch (e) {
      toast({ title: "Envoi impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!isReady || roleLoading) return <FullPageState title="Chargement" message="Vérification de votre accès…" showSpinner />;
  if (!isAuthenticated) return <FullPageState title="Connexion requise" message="Connectez-vous pour accéder à vos soumissions." />;
  if (tenant.loading) return <FullPageState title="Chargement" message="Chargement de votre entreprise…" showSpinner />;
  if (!companyId) return <FullPageState title="Aucune entreprise" message="Votre compte n'est rattaché à aucune entreprise partenaire." />;

  return (
    <div className="min-h-screen bg-background">
      <SupportBanner tenant={tenant} />
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/place-de-marche" className="min-h-10 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Place de marché
            </Link>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold mt-1">Soumissions</h1>
            <p className="text-sm text-muted-foreground font-body">
              Les occasions transmises à votre entreprise et vos soumissions déposées.
            </p>
          </div>
          <CompanySwitcher tenant={tenant} />
        </div>

        <NotificationsPanel userId={user?.id} audience="partenaire" />

        <Tabs value={onglet} onValueChange={(v) => setOnglet(v as Onglet)}>
          <TabsList className="flex w-full flex-wrap h-auto justify-start gap-1">
            {ONGLETS.map((o) => (
              <TabsTrigger key={o.value} value={o.value} className="text-xs sm:text-sm">
                {o.label}
                <span className="ml-1.5 text-muted-foreground">{(filtres.get(o.value) ?? []).length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-16 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
          </div>
        ) : liste.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground font-body">
            Aucune occasion dans cette section pour le moment.
          </CardContent></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {liste.map((o) => (
              <Card key={o.invitation.id} className="cursor-pointer hover:border-primary transition-colors" onClick={() => void ouvrir(o)}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{o.lot ? `Lot ${o.lot.lot_number} — ${o.lot.title}` : o.request.title}</CardTitle>
                    <Badge>{o.request.request_number}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm font-body">
                  <div className="flex flex-wrap gap-1.5">
                    {o.request.city && <Badge>{o.request.city}</Badge>}
                    {o.invitation.distance_km != null && <Badge>{Math.round(Number(o.invitation.distance_km))} km</Badge>}
                    {o.request.client_type && <Badge>{o.request.client_type}</Badge>}
                    <Badge>{o.bid ? labelOf(BID_STATUSES, o.bid.status) : "À répondre"}</Badge>
                  </div>
                  <p className="text-muted-foreground line-clamp-2">{o.request.description || "Aucune description fournie."}</p>
                  <div className="text-xs text-muted-foreground">
                    Date souhaitée : {dateFr(o.request.desired_date)} · Limite : {dateFr(o.request.deadline_at)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {selected && (
          <Card className="border-primary/40">
            <CardHeader>
              <CardTitle className="text-lg">
                {selected.request.request_number} — {selected.lot ? `Lot ${selected.lot.lot_number} : ${selected.lot.title}` : selected.request.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-2 sm:grid-cols-2 text-sm font-body">
                <div><span className="text-muted-foreground">Ville : </span>{selected.request.city ?? "—"}</div>
                <div><span className="text-muted-foreground">Région : </span>{selected.request.region ?? "—"}</div>
                <div><span className="text-muted-foreground">Type de client : </span>{selected.request.client_type ?? "—"}</div>
                <div><span className="text-muted-foreground">Date souhaitée : </span>{dateFr(selected.request.desired_date)}</div>
                <div className="sm:col-span-2 whitespace-pre-wrap">{selected.request.description || "Aucune description fournie."}</div>
                {selected.lot?.description && <div className="sm:col-span-2 whitespace-pre-wrap">{selected.lot.description}</div>}
                <div className="sm:col-span-2">
                  <ContactCard requestId={selected.request.id} companyId={companyId} party="partenaire" />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-heading font-semibold">Votre soumission</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Type de prix">
                    <select value={priceType} onChange={(e) => setPriceType(e.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                      {PRICE_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Montant global">
                    <Input type="number" inputMode="decimal" value={lines.length ? String(total) : amount}
                      disabled={lines.length > 0} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
                  </Field>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch checked={taxesIncluded} onCheckedChange={setTaxesIncluded} id="taxes" />
                    <Label htmlFor="taxes" className="text-sm">Taxes incluses</Label>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Postes détaillés (facultatif)</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, { label: "", amount: 0 }])}>
                      <Plus className="h-4 w-4 mr-1" /> Ajouter un poste
                    </Button>
                  </div>
                  {lines.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <Input value={l.label} placeholder="Ex. : Excavation"
                        onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                      <Input type="number" inputMode="decimal" className="w-32" value={String(l.amount)}
                        onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} />
                      <Button type="button" variant="ghost" size="icon" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {lines.length > 0 && (
                    <div className="text-right font-heading font-semibold">Total : {money(total)}</div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Délai d'exécution"><Input value={leadTime} onChange={(e) => setLeadTime(e.target.value)} placeholder="Ex. : 2 semaines" /></Field>
                  <Field label="Disponible à partir du"><Input type="date" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} /></Field>
                  <Field label="Validité de l'offre"><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></Field>
                </div>
                <Field label="Portée des travaux"><Textarea rows={3} value={scope} onChange={(e) => setScope(e.target.value)} /></Field>
                <Field label="Conditions"><Textarea rows={3} value={conditions} onChange={(e) => setConditions(e.target.value)} /></Field>

                {selected.bid?.submitted_at && (
                  <p className="text-xs text-muted-foreground">Soumission envoyée le {dateTimeFr(selected.bid.submitted_at)}.</p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void enregistrer(false)} disabled={saving} variant="outline">Sauvegarder le brouillon</Button>
                  <Button onClick={() => void enregistrer(true)} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                    Envoyer la soumission
                  </Button>
                  <Button variant="ghost" onClick={() => setSelectedId(null)}>Fermer</Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 border-t border-border pt-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Poser une question à Vrac Québec</Label>
                  <Textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Votre question sur cette demande…" />
                  <Button variant="outline" size="sm" onClick={() => void poserQuestion()} disabled={saving || !question.trim()}>Envoyer la question</Button>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Décliner cette occasion</Label>
                  <Textarea rows={3} value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="Raison (facultatif)" />
                  <Button variant="outline" size="sm" onClick={() => void decliner()} disabled={saving}>Décliner</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {selected && (
          <div className="mt-6">
            <Messagerie
              requestId={selected.request.id}
              companyId={companyId}
              party="partenaire"
              titre="Messagerie Vrac Québec"
            />
          </div>
        )}
      </div>
    </div>
  );
}

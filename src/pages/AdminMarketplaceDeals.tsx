// ============================================================
// TRANSACTIONS MATÉRIAUX + TRANSPORT — administration.
// Trois volets : prix des matériaux offerts par les fournisseurs,
// tarifs de transport des transporteurs, et préparation d'une offre
// client (manuel, semi-automatique, ou automatique plus tard).
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useDraft } from "@/lib/drafts/useDraft";
import DraftStatusBar from "@/components/drafts/DraftStatusBar";
import { ArrowLeft, Calculator, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  DEAL_MODES, PRICE_UNITS, TRUCK_TYPES, computeDeal, deleteDeal, deleteSupplyPrice,
  deleteTransportRate, fetchAdminRequests, fetchDeals, fetchPartnerCompanies,
  fetchSupplyPrices, fetchTransportRates, saveDeal, saveSupplyPrice, saveTransportRate,
  suggestDeal,
} from "@/lib/marketplace/api";
import type { Deal, DealSuggestion, SupplyPrice, TransportRate } from "@/lib/marketplace/api";
import type { QuoteRequest } from "@/lib/marketplace/types";

const argent = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 2 });
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const num = (v: string) => (v.trim() === "" ? null : Number(v));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default function AdminMarketplaceDeals() {
  const { isReady, isAuthenticated } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles();
  const { toast } = useToast();

  // NAV-01B : onglet dans l'adresse (remplacement, sans entrée d'historique).
  const [params, setParams] = useSearchParams();
  const onglet = ((params.get("onglet") as "materiaux" | "transport" | "offres" | null) ?? "materiaux");
  const setOnglet = (k: "materiaux" | "transport" | "offres") => setParams((p) => { const n = new URLSearchParams(p); k === "materiaux" ? n.delete("onglet") : n.set("onglet", k); return n; }, { replace: true });
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [prices, setPrices] = useState<SupplyPrice[]>([]);
  const [rates, setRates] = useState<TransportRate[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [requests, setRequests] = useState<QuoteRequest[]>([]);

  const [prix, setPrix] = useState<Partial<SupplyPrice>>({ unit: "tonne", is_active: true, is_taxable: true });
  const [tarif, setTarif] = useState<Partial<TransportRate>>({ truck_type: "10_roues", price_model: "voyage", is_active: true });

  const [offre, setOffre] = useState<Partial<Deal>>({ mode: "manuel", unit: "tonne", margin_percent: 15 });
  const [suggestion, setSuggestion] = useState<DealSuggestion | null>(null);
  const [busy, setBusy] = useState(false);
  // NAV-01B : trois préparations distinctes (prix, tarif, offre) conservées; rien n'est enregistré sans le bouton explicite.
  const { user: me } = useAuthReady();
  const mk = <T,>(form: string, onglet: string, data: T, set: (v: T) => void, init: T, label: string) => ({
    id: me ? { module: "admin", form, owner: me.id, company: null, recordId: "nouveau" } : null,
    data, label: () => label, route: `/admin/marche/transactions${onglet === "materiaux" ? "" : `?onglet=${onglet}`}`,
    isEmpty: (d: T) => JSON.stringify(d) === JSON.stringify(init), onRestore: (d: T) => set(d),
  });
  const dPrix = useDraft(mk("marche-prix", "materiaux", prix, setPrix, { unit: "tonne", is_active: true, is_taxable: true }, "Place de marché — nouveau prix"));
  const dTarif = useDraft(mk("marche-tarif", "transport", tarif, setTarif, { truck_type: "10_roues", price_model: "voyage", is_active: true }, "Place de marché — nouveau tarif"));
  const dOffre = useDraft(mk("marche-offre", "offres", offre, setOffre, { mode: "manuel", unit: "tonne", margin_percent: 15 }, "Place de marché — offre en préparation"));
  const bar = (d: typeof dPrix, reset: () => void) => <DraftStatusBar status={d.status} savedAt={d.savedAt} restored={!!d.restoredMeta} onDiscard={() => { d.discard(); reset(); }} discardConfirm="Abandonner cette préparation ? Rien d'enregistré n'est modifié." sync={d.sync} synced={d.synced} conflict={d.conflict} onUseServer={d.useServerVersion} onKeepLocal={d.keepLocalVersion} onRestartAsNew={d.restartAsNew} restartError={d.restartError} onRetry={d.retrySave} />;

  const nomEntreprise = useCallback(
    (id: string | null | undefined) => companies.find((c) => c.id === id)?.name ?? "—",
    [companies],
  );

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const [c, p, r, d, q] = await Promise.all([
        fetchPartnerCompanies(), fetchSupplyPrices(), fetchTransportRates(), fetchDeals(), fetchAdminRequests(),
      ]);
      setCompanies(c); setPrices(p); setRates(r); setDeals(d); setRequests(q);
    } catch (e) {
      toast({ title: "Chargement impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { if (isAdmin) void charger(); }, [isAdmin, charger]);

  const calcul = useMemo(
    () => computeDeal({
      materialCost: Number(offre.material_cost ?? 0),
      transportCost: Number(offre.transport_cost ?? 0),
      marginPercent: Number(offre.margin_percent ?? 0),
    }),
    [offre.material_cost, offre.transport_cost, offre.margin_percent],
  );

  const enregistrerPrix = async () => {
    if (!prix.company_id || !prix.material_label) {
      toast({ title: "Fournisseur et matériau requis", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await saveSupplyPrice(prix as SupplyPrice);
      dPrix.finalize(); setPrix({ unit: "tonne", is_active: true, is_taxable: true });
      await charger();
      toast({ title: "Prix enregistré" });
    } catch (e) {
      toast({ title: "Enregistrement refusé", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const enregistrerTarif = async () => {
    if (!tarif.company_id) { toast({ title: "Transporteur requis", variant: "destructive" }); return; }
    setBusy(true);
    try {
      await saveTransportRate(tarif as TransportRate);
      dTarif.finalize(); setTarif({ truck_type: "10_roues", price_model: "voyage", is_active: true });
      await charger();
      toast({ title: "Tarif enregistré" });
    } catch (e) {
      toast({ title: "Enregistrement refusé", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const suggerer = async () => {
    if (!offre.request_id) { toast({ title: "Choisissez d'abord une demande", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const res = await suggestDeal(offre.request_id, offre.material_label ?? undefined, Number(offre.quantity ?? 0) || undefined, offre.unit ?? "tonne");
      setSuggestion(res);
      setOffre((o) => ({ ...o, material_label: o.material_label || res.material, quantity: o.quantity ?? res.quantity }));
    } catch (e) {
      toast({ title: "Suggestion impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const enregistrerOffre = async () => {
    setBusy(true);
    try {
      await saveDeal({
        ...offre,
        margin_amount: calcul.margeAmount, subtotal: calcul.subtotal,
        gst: calcul.gst, qst: calcul.qst, total: calcul.total,
        breakdown: { suggestion: suggestion ?? null },
      } as Deal);
      dOffre.finalize(); setOffre({ mode: "manuel", unit: "tonne", margin_percent: 15 });
      setSuggestion(null);
      await charger();
      toast({ title: "Offre enregistrée" });
    } catch (e) {
      toast({ title: "Enregistrement refusé", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  if (!isReady || roleLoading) return <FullPageState title="Chargement" message="Vérification de votre accès…" showSpinner />;
  if (!isAuthenticated) return <FullPageState title="Connexion requise" message="Connectez-vous pour accéder à cette section." />;
  if (!isAdmin) return <FullPageState title="Accès réservé" message="Cette section est réservée à l'administration de Vrac Québec." />;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/admin/marche/soumissions" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Gestion des soumissions
            </Link>
            <h1 className="text-2xl font-bold md:text-3xl">Matériaux et transport</h1>
            <p className="text-sm text-muted-foreground">
              Prix des fournisseurs, tarifs des transporteurs et préparation d'une offre au client.
            </p>
          </div>
          <Button variant="outline" onClick={() => void charger()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {([["materiaux", "Prix des matériaux"], ["transport", "Tarifs de transport"], ["offres", "Offres au client"]] as const).map(([k, l]) => (
            <Button key={k} size="sm" variant={onglet === k ? "default" : "outline"} onClick={() => setOnglet(k)}>{l}</Button>
          ))}
        </div>

        {onglet === "materiaux" && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader><CardTitle className="text-base">Nouveau prix</CardTitle>{bar(dPrix, () => setPrix({ unit: "tonne", is_active: true, is_taxable: true }))}</CardHeader>
              <CardContent className="space-y-3">
                <Field label="Fournisseur">
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={s(prix.company_id)} onChange={(e) => setPrix({ ...prix, company_id: e.target.value })}>
                    <option value="">Choisir…</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Matériau"><Input aria-label="Matériau du prix" value={s(prix.material_label)} onChange={(e) => setPrix({ ...prix, material_label: e.target.value })} placeholder="Ex. : MG-20" /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Unité">
                    <select className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={s(prix.unit)} onChange={(e) => setPrix({ ...prix, unit: e.target.value })}>
                      {PRICE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </Field>
                  <Field label="Prix ($)"><Input inputMode="decimal" value={s(prix.price)} onChange={(e) => setPrix({ ...prix, price: num(e.target.value) ?? 0 })} /></Field>
                  <Field label="Frais minimum ($)"><Input inputMode="decimal" value={s(prix.min_fee)} onChange={(e) => setPrix({ ...prix, min_fee: num(e.target.value) ?? 0 })} /></Field>
                  <Field label="Surcharge (%)"><Input inputMode="decimal" value={s(prix.surcharge_percent)} onChange={(e) => setPrix({ ...prix, surcharge_percent: num(e.target.value) ?? 0 })} /></Field>
                </div>
                <Field label="Ville de chargement"><Input value={s(prix.pickup_city)} onChange={(e) => setPrix({ ...prix, pickup_city: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Valide à partir du"><Input type="date" value={s(prix.valid_from)} onChange={(e) => setPrix({ ...prix, valid_from: e.target.value || null })} /></Field>
                  <Field label="Valide jusqu'au"><Input type="date" value={s(prix.valid_until)} onChange={(e) => setPrix({ ...prix, valid_until: e.target.value || null })} /></Field>
                </div>
                <Button className="w-full" onClick={() => void enregistrerPrix()} disabled={busy}>
                  <Plus className="mr-1 h-4 w-4" /> Ajouter
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Prix enregistrés ({prices.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {prices.length === 0 && <p className="text-sm text-muted-foreground">Aucun prix pour le moment.</p>}
                {prices.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                    <div>
                      <p className="font-medium">{p.material_label} — {argent(p.price)}/{p.unit}</p>
                      <p className="text-xs text-muted-foreground">
                        {nomEntreprise(p.company_id)}{p.pickup_city ? ` · ${p.pickup_city}` : ""}
                        {p.min_fee ? ` · minimum ${argent(p.min_fee)}` : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={async () => { await deleteSupplyPrice(p.id); void charger(); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {onglet === "transport" && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader><CardTitle className="text-base">Nouveau tarif</CardTitle>{bar(dTarif, () => setTarif({ truck_type: "10_roues", price_model: "voyage", is_active: true }))}</CardHeader>
              <CardContent className="space-y-3">
                <Field label="Transporteur">
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={s(tarif.company_id)} onChange={(e) => setTarif({ ...tarif, company_id: e.target.value })}>
                    <option value="">Choisir…</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Type de camion">
                    <select className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={s(tarif.truck_type)} onChange={(e) => setTarif({ ...tarif, truck_type: e.target.value })}>
                      {TRUCK_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                    </select>
                  </Field>
                  <Field label="Mode de prix">
                    <select className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={s(tarif.price_model)} onChange={(e) => setTarif({ ...tarif, price_model: e.target.value })}>
                      {["voyage", "tonne", "verge", "heure", "km"].map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </Field>
                  <Field label="Prix ($)"><Input inputMode="decimal" value={s(tarif.price)} onChange={(e) => setTarif({ ...tarif, price: num(e.target.value) ?? 0 })} /></Field>
                  <Field label="Prix au km ($)"><Input inputMode="decimal" value={s(tarif.price_per_km)} onChange={(e) => setTarif({ ...tarif, price_per_km: num(e.target.value) ?? 0 })} /></Field>
                  <Field label="Frais minimum ($)"><Input inputMode="decimal" value={s(tarif.min_fee)} onChange={(e) => setTarif({ ...tarif, min_fee: num(e.target.value) ?? 0 })} /></Field>
                  <Field label="Capacité (tonnes)"><Input inputMode="decimal" value={s(tarif.capacity_tonnes)} onChange={(e) => setTarif({ ...tarif, capacity_tonnes: num(e.target.value) })} /></Field>
                </div>
                <Field label="Ville de base"><Input value={s(tarif.base_city)} onChange={(e) => setTarif({ ...tarif, base_city: e.target.value })} /></Field>
                <Button className="w-full" onClick={() => void enregistrerTarif()} disabled={busy}>
                  <Plus className="mr-1 h-4 w-4" /> Ajouter
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Tarifs enregistrés ({rates.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {rates.length === 0 && <p className="text-sm text-muted-foreground">Aucun tarif pour le moment.</p>}
                {rates.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                    <div>
                      <p className="font-medium">{r.truck_type.replace(/_/g, " ")} — {argent(r.price)} / {r.price_model}</p>
                      <p className="text-xs text-muted-foreground">
                        {nomEntreprise(r.company_id)}{r.capacity_tonnes ? ` · ${r.capacity_tonnes} t` : ""}
                        {r.min_fee ? ` · minimum ${argent(r.min_fee)}` : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={async () => { await deleteTransportRate(r.id); void charger(); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {onglet === "offres" && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Préparer une offre</CardTitle>{bar(dOffre, () => setOffre({ mode: "manuel", unit: "tonne", margin_percent: 15 }))}</CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Demande">
                    <select className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={s(offre.request_id)} onChange={(e) => setOffre({ ...offre, request_id: e.target.value })}>
                      <option value="">Choisir…</option>
                      {requests.map((r) => <option key={r.id} value={r.id}>{r.request_number} — {r.title}</option>)}
                    </select>
                  </Field>
                  <Field label="Mode">
                    <select className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={s(offre.mode)} onChange={(e) => setOffre({ ...offre, mode: e.target.value })}>
                      {DEAL_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Matériau"><Input value={s(offre.material_label)} onChange={(e) => setOffre({ ...offre, material_label: e.target.value })} /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Quantité"><Input inputMode="decimal" value={s(offre.quantity)} onChange={(e) => setOffre({ ...offre, quantity: num(e.target.value) })} /></Field>
                    <Field label="Unité">
                      <select className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={s(offre.unit)} onChange={(e) => setOffre({ ...offre, unit: e.target.value })}>
                        {PRICE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </Field>
                  </div>
                </div>

                <Button variant="outline" onClick={() => void suggerer()} disabled={busy}>
                  <Calculator className="mr-1 h-4 w-4" /> Suggérer fournisseurs et transporteurs
                </Button>

                {suggestion && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Fournisseurs</p>
                      {suggestion.suppliers.length === 0 && <p className="text-xs text-muted-foreground">Aucun prix correspondant.</p>}
                      {suggestion.suppliers.map((sp, i) => (
                        <button key={i} type="button"
                          className="w-full rounded-md border p-2 text-left text-xs hover:bg-muted"
                          onClick={() => setOffre((o) => ({
                            ...o,
                            supplier_company_id: String(sp.company_id),
                            supply_price_id: String(sp.supply_price_id),
                            material_cost: Number(sp.material_cost ?? 0),
                          }))}>
                          <span className="font-medium">{String(sp.company_name)}</span> — {String(sp.material_label)} ·
                          {" "}{argent(Number(sp.unit_price))}/{String(sp.unit)} · total {argent(Number(sp.material_cost))}
                        </button>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Transporteurs</p>
                      {suggestion.carriers.length === 0 && <p className="text-xs text-muted-foreground">Aucun tarif correspondant.</p>}
                      {suggestion.carriers.map((c, i) => (
                        <button key={i} type="button"
                          className="w-full rounded-md border p-2 text-left text-xs hover:bg-muted"
                          onClick={() => setOffre((o) => ({
                            ...o,
                            carrier_company_id: String(c.company_id),
                            transport_rate_id: String(c.transport_rate_id),
                            truck_type: String(c.truck_type),
                            trips: c.trips ? Number(c.trips) : null,
                            distance_km: c.distance_km ? Number(c.distance_km) : null,
                            transport_cost: Number(c.transport_cost ?? 0),
                          }))}>
                          <span className="font-medium">{String(c.company_name)}</span> — {String(c.truck_type).replace(/_/g, " ")} ·
                          {" "}{c.trips ? `${String(c.trips)} voyage(s) · ` : ""}total {argent(Number(c.transport_cost))}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-4">
                  <Field label="Coût matériaux ($)"><Input inputMode="decimal" value={s(offre.material_cost)} onChange={(e) => setOffre({ ...offre, material_cost: num(e.target.value) ?? 0 })} /></Field>
                  <Field label="Coût transport ($)"><Input inputMode="decimal" value={s(offre.transport_cost)} onChange={(e) => setOffre({ ...offre, transport_cost: num(e.target.value) ?? 0 })} /></Field>
                  <Field label="Marge (%)"><Input inputMode="decimal" value={s(offre.margin_percent)} onChange={(e) => setOffre({ ...offre, margin_percent: num(e.target.value) ?? 0 })} /></Field>
                  <Field label="Nombre de voyages"><Input inputMode="numeric" value={s(offre.trips)} onChange={(e) => setOffre({ ...offre, trips: num(e.target.value) })} /></Field>
                </div>
                <Field label="Notes internes"><Textarea aria-label="Notes de l'offre" rows={2} value={s(offre.notes)} onChange={(e) => setOffre({ ...offre, notes: e.target.value })} /></Field>
                <Button onClick={() => void enregistrerOffre()} disabled={busy}>Enregistrer l'offre</Button>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Total calculé</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p className="flex justify-between"><span>Matériaux</span><span>{argent(Number(offre.material_cost ?? 0))}</span></p>
                  <p className="flex justify-between"><span>Transport</span><span>{argent(Number(offre.transport_cost ?? 0))}</span></p>
                  <p className="flex justify-between"><span>Marge</span><span>{argent(calcul.margeAmount)}</span></p>
                  <p className="flex justify-between border-t pt-1 font-medium"><span>Sous-total</span><span>{argent(calcul.subtotal)}</span></p>
                  <p className="flex justify-between text-muted-foreground"><span>TPS</span><span>{argent(calcul.gst)}</span></p>
                  <p className="flex justify-between text-muted-foreground"><span>TVQ</span><span>{argent(calcul.qst)}</span></p>
                  <p className="flex justify-between border-t pt-1 text-base font-bold"><span>Total</span><span>{argent(calcul.total)}</span></p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Offres enregistrées ({deals.length})</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {deals.length === 0 && <p className="text-sm text-muted-foreground">Aucune offre pour le moment.</p>}
                  {deals.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                      <div>
                        <p className="font-medium">{d.material_label ?? "Offre"} — {argent(d.total)}</p>
                        <p className="text-xs text-muted-foreground">
                          {DEAL_MODES.find((m) => m.value === d.mode)?.label.split(" —")[0]} · {d.quantity ?? "—"} {d.unit}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={async () => { await deleteDeal(d.id); void charger(); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

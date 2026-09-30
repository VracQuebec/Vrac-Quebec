// ============================================================
// LOTS ET PROJETS COMPLEXES — administration de la place de marché.
// Découper une demande en lots, suivre les soumissions reçues par lot
// et comparer les stratégies d'attribution (lot par lot, regroupements,
// projet complet).
// ============================================================
import { useScreenContext } from "@/lib/navigation/listContext";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Layers, Loader2, Plus, RefreshCw, Trash2, Wand2 } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useEditorDraft } from "@/lib/drafts/useEditorDraft";
import DraftStatusBar from "@/components/drafts/DraftStatusBar";
import {
  buildLotStrategies, deleteLot, fetchAdminRequests, fetchLots, fetchRequestBids, saveLot,
} from "@/lib/marketplace/api";
import type { LotBid, LotStrategy } from "@/lib/marketplace/api";
import { REQUEST_STATUSES } from "@/lib/marketplace/types";
import type { QuoteRequest, RequestLot } from "@/lib/marketplace/types";

const LOT_STATUSES = [
  { value: "a_distribuer", label: "À distribuer" },
  { value: "distribue", label: "Invitations envoyées" },
  { value: "soumissions_recues", label: "Soumissions reçues" },
  { value: "attribue", label: "Attribué" },
  { value: "termine", label: "Terminé" },
  { value: "annule", label: "Annulé" },
];

const MODELES: Record<string, string[]> = {
  "Réfection de stationnement": [
    "Excavation", "Transport des matériaux excavés", "Disposition", "Fourniture MG-56",
    "Transport MG-56", "Fourniture MG-20", "Pavage", "Paysagement",
  ],
  "Entrée résidentielle": ["Excavation", "Transport et disposition", "Fourniture MG-20", "Compaction", "Pavage"],
  "Infrastructure municipale": [
    "Préparation de chantier", "Excavation", "Aqueduc et égout", "Remblai granulaire",
    "Transport", "Pavage", "Signalisation",
  ],
};

const argent = (n: number) =>
  n.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const statutDemande = (v?: string | null) =>
  REQUEST_STATUSES.find((s) => s.value === v)?.label ?? v ?? "—";

type LotDraft = Partial<RequestLot> & { lot_number: string; title: string };

export default function AdminMarketplaceLots() {
  const { isReady, isAuthenticated } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles();
  const { toast } = useToast();

  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  // NAV-01B : contexte d'écran (compte + entreprise + écran), mécanisme commun, jamais dans l'adresse.
  const __lc = useScreenContext("marche-lots", { search: ("") });
  const search = __lc.v.search; const setSearch = __lc.field("search");
  const [selected, setSelected] = useState<QuoteRequest | null>(null);
  const [lots, setLots] = useState<RequestLot[]>([]);
  const [bids, setBids] = useState<LotBid[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<LotDraft | null>(null);
  // NAV-01B : demande ouverte dans l'adresse (?demande=id, identifiant seulement); préparation du lot par demande.
  const [params, setParams] = useSearchParams();
  const reqParam = params.get("demande");
  const ed = useEditorDraft<LotDraft>({ form: `marche-lot@${selected?.id ?? "-"}`, enabled: !!selected, value: draft, setValue: setDraft,
    label: (d) => `Lot ${d.lot_number} — ${d.title || "sans titre"} (${selected?.request_number ?? ""})`, route: `/admin/marche/lots?demande=${selected?.id ?? ""}` });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await fetchAdminRequests());
    } catch (e) {
      toast({ title: "Chargement impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isReady && isAuthenticated && isAdmin) void load();
  }, [isReady, isAuthenticated, isAdmin, load]);

  const openRequest = useCallback(async (request: QuoteRequest) => {
    setSelected(request);
    setDraft(null);
    setParams((p) => { const n = new URLSearchParams(p); if (n.get("demande") === request.id) return p; n.set("demande", request.id); return n; });
    setBusy(true);
    try {
      const [l, b] = await Promise.all([fetchLots(request.id), fetchRequestBids(request.id)]);
      setLots(l);
      setBids(b);
    } catch (e) {
      toast({ title: "Chargement impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!reqParam) { if (selected) { setSelected(null); setDraft(null); } return; }
    if (selected?.id === reqParam) return;
    const r = requests.find((x) => x.id === reqParam); if (r) void openRequest(r);
  }, [reqParam, requests]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshLots = useCallback(async () => {
    if (!selected) return;
    const [l, b] = await Promise.all([fetchLots(selected.id), fetchRequestBids(selected.id)]);
    setLots(l);
    setBids(b);
  }, [selected]);

  const nextNumber = useCallback((offset = 0) => {
    const max = lots.reduce((m, l) => Math.max(m, Number(l.lot_number) || 0), 0);
    return String(max + 1 + offset).padStart(2, "0");
  }, [lots]);

  const enregistrer = async (row: LotDraft) => {
    if (!selected) return;
    if (!row.title.trim()) {
      toast({ title: "Titre requis", description: "Donnez un titre au lot.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await saveLot({
        ...row,
        request_id: selected.id,
        sort_order: row.sort_order ?? (Number(row.lot_number) || lots.length + 1),
      });
      await refreshLots();
      ed.finalize(); setDraft(null);
      toast({ title: "Lot enregistré" });
    } catch (e) {
      toast({ title: "Enregistrement impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const supprimer = async (lot: RequestLot) => {
    if (!window.confirm(`Supprimer le lot ${lot.lot_number} — ${lot.title} ?`)) return;
    setBusy(true);
    try {
      await deleteLot(lot.id);
      await refreshLots();
      toast({ title: "Lot supprimé" });
    } catch (e) {
      toast({ title: "Suppression impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const appliquerModele = async (nom: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      const titres = MODELES[nom];
      for (let i = 0; i < titres.length; i += 1) {
        await saveLot({
          request_id: selected.id,
          lot_number: nextNumber(i),
          title: titres[i],
          sort_order: lots.length + i + 1,
          status: "a_distribuer",
        });
      }
      await refreshLots();
      toast({ title: "Lots créés", description: `${titres.length} lots ajoutés à partir du modèle « ${nom} ».` });
    } catch (e) {
      toast({ title: "Création impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const strategies: LotStrategy[] = useMemo(() => buildLotStrategies(lots, bids), [lots, bids]);

  const bidsParLot = useMemo(() => {
    const map = new Map<string, LotBid[]>();
    bids.forEach((b) => {
      const cle = b.lot_id ?? "__projet__";
      const list = map.get(cle) ?? [];
      list.push(b);
      map.set(cle, list);
    });
    return map;
  }, [bids]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) =>
      [r.request_number, r.title, r.city].some((v) => (v ?? "").toString().toLowerCase().includes(q)));
  }, [requests, search]);

  if (!isReady || roleLoading) return <FullPageState title="Chargement" message="Vérification de l'accès…" showSpinner />;
  if (!isAuthenticated) return <FullPageState title="Connexion requise" message="Connectez-vous pour accéder à cette page." />;
  if (!isAdmin) return <FullPageState title="Accès réservé" message="Cette section est réservée à l'administration de Vrac Québec." />;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto flex flex-wrap items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/marche/jumelage"><ArrowLeft className="mr-2 h-4 w-4" />Jumelage</Link>
          </Button>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Layers className="h-5 w-5" />Lots et projets complexes
          </h1>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => void load()}>
            <RefreshCw className="mr-2 h-4 w-4" />Actualiser
          </Button>
        </div>
      </div>

      <div className="container mx-auto grid gap-6 px-4 py-6 lg:grid-cols-[320px_1fr]">
        {/* Liste des demandes */}
        <div className="space-y-3">
          <Input placeholder="Rechercher une demande…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Chargement…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune demande.</p>
          ) : (
            <div className="max-h-[70vh] space-y-2 overflow-auto pr-1">
              {filtered.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => void openRequest(r)}
                  className={`w-full rounded-lg border p-3 text-left transition hover:bg-muted ${
                    selected?.id === r.id ? "border-primary bg-muted" : ""
                  }`}
                >
                  <div className="text-xs text-muted-foreground">{r.request_number}</div>
                  <div className="text-sm font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {(r.city ?? "—")} · {statutDemande(r.status)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Détail */}
        {!selected ? (
          <Card>
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Choisissez une demande pour la découper en lots.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-base">
                  {selected.request_number} — {selected.title}
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => ed.open({ lot_number: nextNumber(), title: "", status: "a_distribuer" })}
                  >
                    <Plus className="mr-2 h-4 w-4" />Ajouter un lot
                  </Button>
                  {lots.length === 0 && Object.keys(MODELES).map((nom) => (
                    <Button key={nom} size="sm" variant="outline" disabled={busy} onClick={() => void appliquerModele(nom)}>
                      <Wand2 className="mr-2 h-4 w-4" />{nom}
                    </Button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Traitement…</div>}

                {draft && <DraftStatusBar {...ed.barProps} onDiscard={ed.discard} discardConfirm="Abandonner cette préparation ? Les lots enregistrés ne changent pas." />}
                {draft && (
                  <div className="grid gap-3 rounded-lg border bg-muted/40 p-4 sm:grid-cols-2">
                    <div>
                      <Label>Numéro de lot</Label>
                      <Input value={draft.lot_number} onChange={(e) => setDraft({ ...draft, lot_number: e.target.value })} />
                    </div>
                    <div>
                      <Label>Titre</Label>
                      <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Description</Label>
                      <Textarea
                        rows={3}
                        value={draft.description ?? ""}
                        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Quantité</Label>
                      <Input
                        type="number"
                        value={draft.quantity ?? ""}
                        onChange={(e) => setDraft({ ...draft, quantity: e.target.value === "" ? null : Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>Unité</Label>
                      <Input
                        placeholder="tonnes, voyages, m²…"
                        value={draft.quantity_unit ?? ""}
                        onChange={(e) => setDraft({ ...draft, quantity_unit: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Montant estimé (facultatif)</Label>
                      <Input
                        type="number"
                        value={draft.estimated_amount ?? ""}
                        onChange={(e) => setDraft({ ...draft, estimated_amount: e.target.value === "" ? null : Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <Label>Statut</Label>
                      <select
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={draft.status ?? "a_distribuer"}
                        onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                      >
                        {LOT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2 sm:col-span-2">
                      <Button size="sm" disabled={busy} onClick={() => void enregistrer(draft)}>Enregistrer</Button>
                      <Button size="sm" variant="ghost" onClick={ed.close}>Fermer (préparation conservée)</Button>
                    </div>
                  </div>
                )}

                {lots.length === 0 && !draft ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun lot. Un projet sans lot reste soumissionnable dans son ensemble.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {lots.map((lot) => {
                      const offres = bidsParLot.get(lot.id) ?? [];
                      return (
                        <div key={lot.id} className="rounded-lg border p-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium">Lot {lot.lot_number} — {lot.title}</div>
                              <div className="text-xs text-muted-foreground">
                                {LOT_STATUSES.find((s) => s.value === lot.status)?.label ?? lot.status}
                                {lot.quantity != null && ` · ${lot.quantity} ${lot.quantity_unit ?? ""}`}
                                {lot.estimated_amount != null && ` · estimé ${argent(lot.estimated_amount)}`}
                                {` · ${offres.length} soumission${offres.length > 1 ? "s" : ""}`}
                              </div>
                              {lot.description && (
                                <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{lot.description}</p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => ed.open(lot)}>Modifier</Button>
                              <Button size="sm" variant="ghost" onClick={() => void supprimer(lot)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          {offres.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              {offres.map((o) => (
                                <span key={o.id} className="rounded-full border px-2 py-1">
                                  {o.partner_name} : {o.amount != null ? argent(o.amount) : "—"}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Comparaison des stratégies</CardTitle>
              </CardHeader>
              <CardContent>
                {strategies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucune soumission chiffrée pour l'instant. Les stratégies apparaîtront dès que des entreprises auront répondu.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                          <th className="py-2 pr-3">Stratégie</th>
                          <th className="py-2 pr-3">Détail</th>
                          <th className="py-2 pr-3">Lots couverts</th>
                          <th className="py-2 pr-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {strategies.map((s) => (
                          <tr key={s.key} className="border-b align-top">
                            <td className="py-2 pr-3 font-medium">{s.label}</td>
                            <td className="py-2 pr-3 text-xs text-muted-foreground">
                              {s.detail}
                              {s.missing.length > 0 && (
                                <div className="mt-1 text-amber-600">Manque : {s.missing.join(", ")}</div>
                              )}
                            </td>
                            <td className="py-2 pr-3">{s.covered} / {lots.length || 1}</td>
                            <td className="py-2 pr-3 text-right font-semibold">{argent(s.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Comparaison interne à Vrac Québec : elle n'est jamais visible du client ni des entreprises.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

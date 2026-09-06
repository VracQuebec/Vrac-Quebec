// ============================================================
// JUMELAGE — administration de la place de marché.
// Demandes reçues → entrepreneurs suggérés (score, distance, raisons)
// → invitations envoyées (mode AUTO ou MANUEL).
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, MapPin, RefreshCw, Send, Sparkles } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  fetchAdminRequests, fetchLots, fetchMarketplaceSettings, invitePartners,
  matchPartners, saveMarketplaceSettings,
} from "@/lib/marketplace/api";
import type { MarketplaceSettings, PartnerMatch } from "@/lib/marketplace/api";
import { REQUEST_STATUSES } from "@/lib/marketplace/types";
import type { QuoteRequest, RequestLot } from "@/lib/marketplace/types";

const RAISONS: Record<string, string> = {
  services: "Services",
  territoire: "Territoire",
  distance: "Distance",
  clientele: "Clientèle",
  taille: "Taille du projet",
  disponibilite: "Disponibilité",
  preferences: "Préférences",
  performance: "Performance",
};

const DISPO: Record<string, string> = {
  disponible: "Disponible",
  limitee: "Disponibilité limitée",
  complet: "Complet",
  urgences: "Urgences seulement",
  inactif: "Inactif temporairement",
  inconnu: "Disponibilité non indiquée",
};

function statutLabel(value: string | null | undefined) {
  return REQUEST_STATUSES.find((s) => s.value === value)?.label ?? value ?? "—";
}

export default function AdminMarketplaceMatching() {
  const { isReady, isAuthenticated } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles();
  const { toast } = useToast();

  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<QuoteRequest | null>(null);
  const [lots, setLots] = useState<RequestLot[]>([]);
  const [lotId, setLotId] = useState<string | null>(null);
  const [matches, setMatches] = useState<PartnerMatch[]>([]);
  const [matching, setMatching] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [settings, setSettings] = useState<MarketplaceSettings | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, cfg] = await Promise.all([fetchAdminRequests(), fetchMarketplaceSettings()]);
      setRequests(rows);
      setSettings(cfg);
    } catch (e) {
      toast({ title: "Chargement impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (isReady && isAuthenticated && isAdmin) void load();
  }, [isReady, isAuthenticated, isAdmin, load]);

  const runMatch = useCallback(async (request: QuoteRequest, lot: string | null) => {
    setMatching(true);
    setMatches([]);
    try {
      const rows = await matchPartners(request.id, lot);
      setMatches(rows);
      const auto: Record<string, boolean> = {};
      if (settings?.distribution_mode === "auto") {
        rows.filter((m) => Number(m.score) >= Number(settings.auto_min_score))
          .slice(0, settings.auto_top_n)
          .forEach((m) => { auto[m.company_id] = true; });
      }
      setPicked(auto);
      setExcluded({});
    } catch (e) {
      toast({ title: "Jumelage impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setMatching(false);
    }
  }, [settings, toast]);

  const openRequest = useCallback(async (request: QuoteRequest) => {
    setSelected(request);
    setLotId(null);
    try {
      setLots(await fetchLots(request.id));
    } catch { setLots([]); }
    void runMatch(request, null);
  }, [runMatch]);

  const visibles = useMemo(
    () => matches.filter((m) => !excluded[m.company_id]),
    [matches, excluded],
  );
  const nbChoisis = useMemo(
    () => visibles.filter((m) => picked[m.company_id]).length,
    [visibles, picked],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter((r) =>
      [r.request_number, r.title, r.city, r.contact_name].some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [requests, search]);

  const envoyer = useCallback(async () => {
    if (!selected) return;
    const ids = visibles.filter((m) => picked[m.company_id]).map((m) => m.company_id);
    if (!ids.length) {
      toast({ title: "Aucune entreprise sélectionnée" });
      return;
    }
    setSending(true);
    try {
      const n = await invitePartners(selected.id, ids, lotId, settings?.distribution_mode ?? "manuel");
      toast({ title: `${n} invitation(s) envoyée(s)` });
      await runMatch(selected, lotId);
      await load();
    } catch (e) {
      toast({ title: "Envoi impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  }, [selected, visibles, picked, lotId, settings, toast, runMatch, load]);

  const majReglage = useCallback(async (updates: Partial<MarketplaceSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...updates } : prev));
    try {
      await saveMarketplaceSettings(updates);
    } catch (e) {
      toast({ title: "Réglage non enregistré", description: (e as Error).message, variant: "destructive" });
    }
  }, [toast]);

  if (!isReady || roleLoading) return <FullPageState title="Chargement" showSpinner />;
  if (!isAuthenticated || !isAdmin) {
    return <FullPageState title="Accès réservé" message="Cette page est réservée aux administrateurs." />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        <div className="mb-4 -ml-2 flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin"><ArrowLeft className="mr-2 h-4 w-4" /> Administration</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/marche/lots">Lots et projets complexes</Link>
          </Button>
        </div>


        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Jumelage des demandes</h1>
            <p className="text-sm text-muted-foreground">
              Entrepreneurs suggérés pour chaque demande, avec pointage de compatibilité interne.
            </p>
          </div>
          {settings && (
            <Card className="flex flex-wrap items-center gap-4 p-3">
              <div className="flex items-center gap-2">
                <Switch
                  id="mode"
                  checked={settings.distribution_mode === "auto"}
                  onCheckedChange={(v) => majReglage({ distribution_mode: v ? "auto" : "manuel" })}
                />
                <Label htmlFor="mode" className="text-sm">
                  {settings.distribution_mode === "auto" ? "Distribution automatique" : "Validation manuelle"}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="topn" className="text-xs text-muted-foreground">Nombre d'invitations</Label>
                <Input
                  id="topn" type="number" min={1} className="h-8 w-20"
                  value={settings.auto_top_n}
                  onChange={(e) => majReglage({ auto_top_n: Number(e.target.value) || 1 })}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="minscore" className="text-xs text-muted-foreground">Score minimal</Label>
                <Input
                  id="minscore" type="number" min={0} max={100} className="h-8 w-20"
                  value={settings.auto_min_score}
                  onChange={(e) => majReglage({ auto_min_score: Number(e.target.value) || 0 })}
                />
              </div>
            </Card>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <div>
            <Input
              placeholder="Rechercher une demande…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-3"
            />
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
            ) : filtered.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Aucune demande pour le moment.
              </p>
            ) : (
              <div className="space-y-2">
                {filtered.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => void openRequest(r)}
                    className={`w-full rounded-lg border p-3 text-left transition hover:border-primary ${
                      selected?.id === r.id ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{r.request_number}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{statutLabel(r.status)}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{[r.city, r.region].filter(Boolean).join(", ") || "Lieu non précisé"}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            {!selected ? (
              <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                Choisissez une demande pour voir les entrepreneurs suggérés.
              </p>
            ) : (
              <div className="space-y-4">
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold">{selected.title}</h2>
                      <p className="text-sm text-muted-foreground">
                        {selected.request_number} · {[selected.city, selected.region].filter(Boolean).join(", ") || "Lieu non précisé"}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void runMatch(selected, lotId)} disabled={matching}>
                      <RefreshCw className={`mr-2 h-4 w-4 ${matching ? "animate-spin" : ""}`} /> Recalculer
                    </Button>
                  </div>
                  {selected.description && (
                    <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{selected.description}</p>
                  )}
                  {lots.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm" variant={lotId === null ? "default" : "outline"}
                        onClick={() => { setLotId(null); void runMatch(selected, null); }}
                      >
                        Projet complet
                      </Button>
                      {lots.map((l) => (
                        <Button
                          key={l.id} size="sm" variant={lotId === l.id ? "default" : "outline"}
                          onClick={() => { setLotId(l.id); void runMatch(selected, l.id); }}
                        >
                          Lot {l.lot_number} — {l.title}
                        </Button>
                      ))}
                    </div>
                  )}
                </Card>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Entrepreneurs suggérés {matches.length > 0 && <span className="text-muted-foreground">({visibles.length})</span>}
                  </h3>
                  <Button size="sm" onClick={() => void envoyer()} disabled={sending || nbChoisis === 0}>
                    {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Envoyer les invitations ({nbChoisis})
                  </Button>
                </div>

                {matching ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                ) : visibles.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    Aucune entreprise compatible pour l'instant. Ajustez les services des partenaires ou invitez une
                    entreprise manuellement.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {visibles.map((m) => (
                      <Card key={m.company_id} className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">{m.partner_name}</span>
                              {m.is_verified && (
                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">Vérifiée</span>
                              )}
                              {m.already_invited && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">Déjà invitée</span>
                              )}
                            </div>
                            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3" />
                              {[m.city, m.region].filter(Boolean).join(", ") || "Territoire non précisé"}
                              {m.distance_km != null && <span>· {m.distance_km} km</span>}
                              <span>· {DISPO[m.availability_status ?? "inconnu"] ?? m.availability_status}</span>
                            </p>
                            {m.matched_services?.length > 0 && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Services compatibles : {m.matched_services.slice(0, 6).join(", ")}
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap gap-1">
                              {Object.entries(m.reasons ?? {})
                                .filter(([, v]) => Number(v) > 0)
                                .map(([k, v]) => (
                                  <span key={k} className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                    {RAISONS[k] ?? k} +{v}
                                  </span>
                                ))}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                              {Math.round(Number(m.score))} % compatible
                            </span>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={!!picked[m.company_id]}
                                onCheckedChange={(v) => setPicked((p) => ({ ...p, [m.company_id]: v }))}
                              />
                              <span className="text-xs text-muted-foreground">Inviter</span>
                            </div>
                            <Button
                              variant="ghost" size="sm"
                              onClick={() => setExcluded((p) => ({ ...p, [m.company_id]: true }))}
                            >
                              Exclure
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

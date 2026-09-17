// ============================================================
// VUE TERRITOIRE — VRAC QUÉBEC (Phase 4)
// ------------------------------------------------------------
// Source de vérité territoriale du CRM : liste des territoires,
// filtres (ville, région, service, statut), matrice
// TERRITOIRE × SERVICE et fiche détaillée d'un territoire.
// Lecture seule : aucune demande, adresse ou page SEO n'est
// modifiée depuis cette page.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2, MapPin, Search } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  MATRIX_STATUS_LABELS, SERVICE_CATEGORY_LABELS, attachSubmission, createTerritory,
  fetchHistory, fetchMatrix, fetchPendingSubmissions, fetchQueue, fetchServices,
  fetchTerritories, fetchTerritoryDetail,
  type HistoryEntry, type PendingSubmission, type QueueItem, type ServiceDef, type Territory,
  type TerritoryDetail, type TerritoryService,
} from "@/lib/territories/api";

const STATUS_VARIANT: Record<string, string> = {
  ACTIVE: "bg-primary/15 text-primary",
  PARTIELLE: "bg-amber-500/15 text-amber-600",
  A_VALIDER: "bg-muted text-muted-foreground",
  NON_CONFIGUREE: "bg-muted text-muted-foreground",
};

export default function AdminTerritories() {
  const navigate = useNavigate();
  const { user, isReady } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, isReady);
  const allowed = isReady && !!user && isAdmin;

  const [territories, setTerritories] = useState<Territory[]>([]);
  const [services, setServices] = useState<ServiceDef[]>([]);
  const [matrix, setMatrix] = useState<TerritoryService[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");
  const [service, setService] = useState("all");
  const [status, setStatus] = useState("all");

  const [selected, setSelected] = useState<Territory | null>(null);
  const [detail, setDetail] = useState<TerritoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!isReady || roleLoading) return;
    if (!user || !isAdmin) navigate("/login", { replace: true });
  }, [isReady, roleLoading, user, isAdmin, navigate]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      try {
        const [t, s, m, q] = await Promise.all([
          fetchTerritories(), fetchServices(), fetchMatrix(), fetchQueue(),
        ]);
        if (cancelled) return;
        setTerritories(t); setServices(s); setMatrix(m); setQueue(q);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur de chargement");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [allowed]);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    fetchTerritoryDetail(selected.id)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch(() => { if (!cancelled) setDetail(null); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selected]);

  const serviceByTerritory = useMemo(() => {
    const map = new Map<string, TerritoryService[]>();
    for (const row of matrix) {
      const list = map.get(row.territory_id) ?? [];
      list.push(row);
      map.set(row.territory_id, list);
    }
    return map;
  }, [matrix]);

  const regions = useMemo(
    () => [...new Set(territories.map((t) => t.region).filter(Boolean) as string[])].sort(),
    [territories],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return territories.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q) && !t.normalized_name.includes(q)) return false;
      if (region !== "all" && t.region !== region) return false;
      if (status !== "all" && t.status !== status) return false;
      if (service !== "all") {
        const rows = serviceByTerritory.get(t.id) ?? [];
        if (!rows.some((r) => r.service_key === service && (r.status === "ACTIVE" || r.status === "PARTIELLE"))) {
          return false;
        }
      }
      return true;
    });
  }, [territories, search, region, status, service, serviceByTerritory]);

  const serviceLabel = (key: string) => services.find((s) => s.service_key === key)?.label ?? key;

  if (!allowed) return <FullPageState title="Accès réservé" message="Connexion administrateur requise." showSpinner={false} />;
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) return <FullPageState title="Erreur" message={error} showSpinner={false} />;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 space-y-6">
      <Helmet><title>Territoires — CRM Vrac Québec</title><meta name="robots" content="noindex" /></Helmet>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Territoires</h1>
        <p className="text-sm text-muted-foreground">
          {territories.length} territoires · {territories.filter((t) => t.request_count > 0).length} avec demandes ·
          {" "}{territories.filter((t) => t.seo_city_slug).length} avec page SEO
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-11 pl-9" placeholder="Rechercher une ville" value={search}
            onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Région" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les régions</SelectItem>
            {regions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={service} onValueChange={setService}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Service" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les services</SelectItem>
            {services.map((s) => <SelectItem key={s.service_key} value={s.service_key}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="active">Actif</SelectItem>
            <SelectItem value="a_valider">À valider</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {queue.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Nouveaux territoires à valider</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {queue.map((q) => (
              <Badge key={q.id} variant="outline">{q.raw_city} · {q.request_count}</Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">File de validation · {pending.length} demande(s)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Toutes les demandes sont rattachées à un territoire.
            </p>
          )}
          {pending.map((p) => (
            <div key={p.id} className="rounded-lg border p-3 space-y-2">
              <div className="text-sm font-medium break-words">{p.address ?? "Adresse non renseignée"}</div>
              <div className="text-xs text-muted-foreground">
                Ville saisie : {p.city?.trim() || "aucune"} · Raison : {p.territory_reason ?? "à déterminer"}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select
                  value={choice[p.id] ?? ""}
                  onValueChange={(v) => setChoice((c) => ({ ...c, [p.id]: v }))}
                >
                  <SelectTrigger className="h-11 sm:max-w-xs"><SelectValue placeholder="Choisir un territoire" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {territories.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  className="h-11"
                  disabled={!choice[p.id] || busy === p.id}
                  onClick={() => void handleAttach(p.id)}
                >
                  {busy === p.id ? "…" : "Rattacher"}
                </Button>
              </div>
            </div>
          ))}

          <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row">
            <Input
              className="h-11 sm:max-w-xs"
              placeholder="Créer un territoire (nom officiel)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              className="h-11 sm:max-w-xs"
              placeholder="Région administrative (optionnel)"
              value={newRegion}
              onChange={(e) => setNewRegion(e.target.value)}
            />
            <Button
              variant="outline"
              className="h-11"
              disabled={!newName.trim() || busy === "new"}
              onClick={() => void handleCreate()}
            >
              Créer le territoire
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Créer un territoire ici n'affecte jamais le site public : aucune page, URL ou métadonnée n'est générée.
          </p>
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Historique des corrections</CardTitle></CardHeader>
          <CardContent className="max-h-72 space-y-1 overflow-y-auto text-sm">
            {history.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-1 last:border-0">
                <span>{h.action.replace(/_/g, " ")}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(h.created_at).toLocaleString("fr-CA")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{filtered.length} territoire(s)</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[70vh] space-y-2 overflow-y-auto">
            {filtered.map((t) => {
              const rows = (serviceByTerritory.get(t.id) ?? []).filter(
                (r) => r.status === "ACTIVE" || r.status === "PARTIELLE",
              );
              return (
                <button
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors min-h-[44px] ${
                    selected?.id === t.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{t.name}</span>
                    <span className="text-sm text-muted-foreground">{t.request_count} demande(s)</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {t.status === "a_valider" && <Badge variant="outline">À valider</Badge>}
                    {t.seo_city_slug
                      ? <Badge variant="secondary">Page SEO</Badge>
                      : <Badge variant="outline">Sans page SEO</Badge>}
                    {rows.map((r) => (
                      <span key={r.service_key}
                        className={`rounded px-2 py-0.5 text-xs ${STATUS_VARIANT[r.status]}`}>
                        {serviceLabel(r.service_key)}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Aucun territoire ne correspond aux filtres.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" />
              {selected ? selected.name : "Sélectionner un territoire"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected && <p className="text-sm text-muted-foreground">Choisissez un territoire pour voir ses demandes, services et matériaux.</p>}
            {selected && detailLoading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
            {selected && detail && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Stat label="Demandes" value={String(detail.total)} />
                  <Stat label="Type" value={selected.type} />
                  <Stat label="Page SEO" value={selected.seo_city_slug ?? "Aucune"} />
                </div>

                <Section title="Services demandés">
                  {(serviceByTerritory.get(selected.id) ?? [])
                    .sort((a, b) => b.request_count - a.request_count)
                    .map((r) => (
                      <div key={r.service_key} className="flex items-center justify-between gap-2 py-1 text-sm">
                        <span>{serviceLabel(r.service_key)}</span>
                        <span className={`rounded px-2 py-0.5 text-xs ${STATUS_VARIANT[r.status]}`}>
                          {MATRIX_STATUS_LABELS[r.status]} · {r.request_count}
                        </span>
                      </div>
                    ))}
                </Section>

                <Section title="Matériaux demandés">
                  {detail.byMaterial.length === 0 && <p className="text-sm text-muted-foreground">Aucun matériau précisé.</p>}
                  <div className="flex flex-wrap gap-1">
                    {detail.byMaterial.map((m) => <Badge key={m.key} variant="outline">{m.key} · {m.n}</Badge>)}
                  </div>
                </Section>

                <Section title="Statuts des demandes">
                  <div className="flex flex-wrap gap-1">
                    {detail.byStatus.map((s) => <Badge key={s.key} variant="secondary">{s.key} · {s.n}</Badge>)}
                  </div>
                </Section>

                <Section title="Évolution dans le temps">
                  <div className="flex flex-wrap gap-1">
                    {detail.byMonth.map((m) => <Badge key={m.key} variant="outline">{m.key} · {m.n}</Badge>)}
                  </div>
                </Section>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Nature des services</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {services.map((s) => (
            <div key={s.service_key} className="rounded-lg border p-3">
              <div className="font-medium">{s.label}</div>
              <div className="text-xs text-muted-foreground">{SERVICE_CATEGORY_LABELS[s.category]}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold break-words">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}

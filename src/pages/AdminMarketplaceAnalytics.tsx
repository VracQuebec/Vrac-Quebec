// ============================================================
// ANALYTIQUE ET PERFORMANCE COMMERCIALE — place de marché.
// Volumes de demandes, conversion, résultats financiers,
// performance des partenaires et demandes non comblées.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  fetchAnalytics, fetchPartnerScores, recomputeScores, setPublicScoreVisibility,
} from "@/lib/marketplace/api";
import type { Analytics, PartnerScore } from "@/lib/marketplace/api";

const argent = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

const PERIODES = [
  { key: "jour", label: "Aujourd'hui", days: 1 },
  { key: "semaine", label: "Semaine", days: 7 },
  { key: "mois", label: "Mois", days: 30 },
  { key: "trimestre", label: "Trimestre", days: 90 },
  { key: "annee", label: "Année", days: 365 },
] as const;

type Liste = Array<{ label: string; n?: number; montant?: number; invitations?: number; soumissions?: number }>;

function Kpi({ titre, valeur }: { titre: string; valeur: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{titre}</p>
      <p className="text-xl font-bold">{valeur}</p>
    </div>
  );
}

function Bloc({ titre, rows, format = "n" }: { titre: string; rows: Liste; format?: "n" | "argent" }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{titre}</CardTitle></CardHeader>
      <CardContent className="space-y-1 text-sm">
        {rows.length === 0 && <p className="text-muted-foreground">Aucune donnée pour cette période.</p>}
        {rows.map((r, i) => (
          <p key={i} className="flex justify-between gap-3 border-b py-1 last:border-0">
            <span className="truncate">{r.label}</span>
            <span className="font-medium">
              {format === "argent" ? argent(r.montant ?? 0) : (r.n ?? r.invitations ?? 0)}
              {r.soumissions !== undefined ? ` / ${r.soumissions} soum.` : ""}
            </span>
          </p>
        ))}
      </CardContent>
    </Card>
  );
}

export default function AdminMarketplaceAnalytics() {
  const { isReady, isAuthenticated } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles();
  const { toast } = useToast();

  const [periode, setPeriode] = useState<string>("mois");
  const [du, setDu] = useState("");
  const [au, setAu] = useState("");
  const [data, setData] = useState<Analytics>({});
  const [scores, setScores] = useState<Array<PartnerScore & { partner_name?: string }>>([]);
  const [loading, setLoading] = useState(true);

  const bornes = useMemo(() => {
    if (periode === "perso" && du && au) return { from: new Date(du).toISOString(), to: new Date(au).toISOString() };
    const p = PERIODES.find((x) => x.key === periode) ?? PERIODES[2];
    return { from: new Date(Date.now() - p.days * 86400000).toISOString(), to: new Date().toISOString() };
  }, [periode, du, au]);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const [a, s] = await Promise.all([fetchAnalytics(bornes.from, bornes.to), fetchPartnerScores()]);
      setData(a); setScores(s);
    } catch (e) {
      toast({ title: "Chargement impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [bornes.from, bornes.to, toast]);

  useEffect(() => { if (isAdmin) void charger(); }, [isAdmin, charger]);

  const conv = (data.conversion ?? {}) as Record<string, number>;
  const fin = (data.financier ?? {}) as Record<string, unknown>;
  const nonComblees = (data.demandes_non_comblees ?? []) as Array<Record<string, string>>;

  if (!isReady || roleLoading) return <FullPageState title="Chargement" message="Vérification de votre accès…" showSpinner />;
  if (!isAuthenticated) return <FullPageState title="Connexion requise" message="Connectez-vous pour accéder à cette section." />;
  if (!isAdmin) return <FullPageState title="Accès réservé" message="Cette section est réservée à l'administration de Vrac Québec." />;

  const tauxReponse = conv.invitations ? Math.round((conv.reponses / conv.invitations) * 100) : 0;
  const tauxContrat = conv.soumissions ? Math.round((conv.contrats / conv.soumissions) * 100) : 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/admin/marche/soumissions" className="min-h-10 mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Gestion des soumissions
            </Link>
            <h1 className="text-2xl font-bold md:text-3xl">Analytique de la place de marché</h1>
            <p className="text-sm text-muted-foreground">Volumes, conversion, revenus et performance des partenaires.</p>
          </div>
          <Button variant="outline" onClick={() => void charger()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {PERIODES.map((p) => (
            <Button key={p.key} size="sm" variant={periode === p.key ? "default" : "outline"} onClick={() => setPeriode(p.key)}>{p.label}</Button>
          ))}
          <Button size="sm" variant={periode === "perso" ? "default" : "outline"} onClick={() => setPeriode("perso")}>Personnalisé</Button>
          {periode === "perso" && (
            <div className="flex flex-wrap items-end gap-2">
              <div><Label className="text-xs text-muted-foreground">Du</Label><Input type="date" value={du} onChange={(e) => setDu(e.target.value)} /></div>
              <div><Label className="text-xs text-muted-foreground">Au</Label><Input type="date" value={au} onChange={(e) => setAu(e.target.value)} /></div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <Kpi titre="Demandes" valeur={String(data.demandes ?? 0)} />
          <Kpi titre="Demandes distribuées" valeur={String(conv.distribuees ?? 0)} />
          <Kpi titre="Invitations" valeur={String(conv.invitations ?? 0)} />
          <Kpi titre="Soumissions" valeur={String(conv.soumissions ?? 0)} />
          <Kpi titre="Contrats" valeur={String(conv.contrats ?? 0)} />
          <Kpi titre="Taux de réponse" valeur={`${tauxReponse} %`} />
          <Kpi titre="Taux de contrat" valeur={`${tauxContrat} %`} />
          <Kpi titre="Valeur des soumissions" valeur={argent(Number(fin.valeur_soumissions ?? 0))} />
          <Kpi titre="Valeur des contrats" valeur={argent(Number(fin.valeur_contrats ?? 0))} />
          <Kpi titre="Commissions" valeur={argent(Number(fin.commissions ?? 0))} />
          <Kpi titre="Revenu moyen / demande"
            valeur={argent(data.demandes ? Number(fin.commissions ?? 0) / Number(data.demandes) : 0)} />
          <Kpi titre="Demandes non comblées" valeur={String(nonComblees.length)} />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Bloc titre="Par catégorie" rows={(data.par_categorie ?? []) as Liste} />
          <Bloc titre="Par région" rows={(data.par_region ?? []) as Liste} />
          <Bloc titre="Par ville" rows={(data.par_ville ?? []) as Liste} />
          <Bloc titre="Par type de client" rows={(data.par_type_client ?? []) as Liste} />
          <Bloc titre="Revenu par catégorie" rows={(fin.revenu_par_categorie ?? []) as Liste} format="argent" />
          <Bloc titre="Revenu par partenaire" rows={(fin.revenu_par_partenaire ?? []) as Liste} format="argent" />
          <Bloc titre="Partenaires les plus actifs" rows={(data.partenaires_actifs ?? []) as Liste} />
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Demandes sans aucune soumission ({nonComblees.length})</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {nonComblees.length === 0 && <p className="text-muted-foreground">Toutes les demandes ont reçu au moins une soumission.</p>}
            {nonComblees.map((r, i) => (
              <p key={i} className="flex flex-wrap justify-between gap-2 border-b py-1 last:border-0">
                <span>{r.numero} — {r.titre}</span>
                <span className="text-muted-foreground">{r.ville ?? "—"} · {r.categorie ?? "Non classé"}</span>
              </p>
            ))}
            <p className="pt-2 text-xs text-muted-foreground">
              Ces catégories et ces villes indiquent où recruter de nouvelles entreprises partenaires.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Score et performance des partenaires</CardTitle>
            <Button size="sm" variant="outline" onClick={async () => {
              try {
                const n = await recomputeScores();
                await charger();
                toast({ title: `Scores recalculés (${n} entreprises)` });
              } catch (e) {
                toast({ title: "Recalcul impossible", description: (e as Error).message, variant: "destructive" });
              }
            }}>Recalculer</Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {scores.length === 0 && <p className="text-sm text-muted-foreground">Aucun score calculé pour le moment.</p>}
            {scores.length > 0 && (
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2">Entreprise</th><th>Score interne</th><th>Profil</th><th>Taux de réponse</th>
                    <th>Délai moyen</th><th>Invitations</th><th>Soumissions</th><th>Contrats</th><th>Score public</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="py-2 font-medium">{s.partner_name}</td>
                      <td>{s.internal_score ?? "—"}</td>
                      <td>{s.profile_completion ?? 0} %</td>
                      <td>{s.response_rate === null ? "—" : `${s.response_rate} %`}</td>
                      <td>{s.avg_response_hours ? `${s.avg_response_hours} h` : "—"}</td>
                      <td>{s.invitations_count}</td>
                      <td>{s.bids_count}</td>
                      <td>{s.awards_count}</td>
                      <td>
                        <Button size="sm" variant={s.show_public_score ? "default" : "outline"}
                          onClick={async () => {
                            await setPublicScoreVisibility(s.company_id, !s.show_public_score);
                            void charger();
                          }}>
                          {s.show_public_score ? "Affiché" : "Masqué"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

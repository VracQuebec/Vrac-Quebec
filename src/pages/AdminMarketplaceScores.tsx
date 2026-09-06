// ============================================================
// SCORE ET PERFORMANCE DES ENTREPRISES PARTENAIRES.
// Score interne (Vrac Québec seulement) et score public
// optionnel, activable entreprise par entreprise.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Gauge, Loader2, RefreshCw } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import FullPageState from "@/components/FullPageState";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  fetchPartnerScores, recomputeScores, setPublicScoreVisibility,
  type PartnerScore,
} from "@/lib/marketplace/api";

type Ligne = PartnerScore & { partner_name?: string };

const pct = (v: number | null) => (v === null || v === undefined ? "—" : `${Math.round(v)} %`);
const nb = (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(v));
const dt = (v: string | null) => (v ? new Date(v).toLocaleDateString("fr-CA") : "—");

export default function AdminMarketplaceScores() {
  const { user, isReady, isAuthenticated } = useAuthReady();
  const { isAdmin, loading: roleLoading } = useUserRoles(user, isReady);
  const { toast } = useToast();
  const [rows, setRows] = useState<Ligne[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchPartnerScores());
    } catch (e) {
      toast({ title: "Chargement impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { if (isAdmin) void charger(); }, [isAdmin, charger]);

  const recalculer = async () => {
    setBusy(true);
    try {
      const n = await recomputeScores();
      toast({ title: "Scores recalculés", description: `${n} entreprise(s) mise(s) à jour.` });
      await charger();
    } catch (e) {
      toast({ title: "Recalcul impossible", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const basculerPublic = async (r: Ligne, v: boolean) => {
    try {
      await setPublicScoreVisibility(r.company_id, v);
      setRows((old) => old.map((x) => (x.company_id === r.company_id ? { ...x, show_public_score: v } : x)));
    } catch (e) {
      toast({ title: "Modification impossible", description: (e as Error).message, variant: "destructive" });
    }
  };

  if (!isReady || roleLoading) return <FullPageState title="Chargement…" />;
  if (!isAuthenticated || !isAdmin) {
    return <FullPageState title="Accès réservé" message="Cette page est réservée à l'administration de Vrac Québec." showSpinner={false} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/marche/soumissions"><ArrowLeft className="mr-2 h-4 w-4" /> Gestion des soumissions</Link>
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Gauge className="h-6 w-6" /> Score et performance des partenaires
          </h1>
          <Button size="sm" onClick={recalculer} disabled={busy} className="ml-auto">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Recalculer
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Le score interne combine la complétude du profil, la conformité des documents, le taux et le délai
          de réponse, les contrats obtenus et terminés, les annulations, les litiges et l'activité récente.
          Une nouvelle entreprise sans historique n'est pas pénalisée. Le score public reste facultatif.
        </p>

        {loading ? (
          <FullPageState title="Chargement des scores…" />
        ) : rows.length === 0 ? (
          <Card><CardContent className="p-6 text-sm text-muted-foreground">
            Aucun score calculé pour le moment. Utilisez « Recalculer » une fois des entreprises inscrites.
          </CardContent></Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((r) => (
              <Card key={r.company_id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>{r.partner_name}</span>
                    <span className="rounded-md bg-primary/10 px-2 py-1 text-sm font-semibold text-primary">
                      Interne {pct(r.internal_score)}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                    <span>Profil complété : {pct(r.profile_completion)}</span>
                    <span>Taux de réponse : {pct(r.response_rate)}</span>
                    <span>Délai moyen : {r.avg_response_hours === null ? "—" : `${Math.round(r.avg_response_hours)} h`}</span>
                    <span>Satisfaction : {r.satisfaction === null ? "—" : `${r.satisfaction} / 5`}</span>
                    <span>Invitations : {nb(r.invitations_count)}</span>
                    <span>Soumissions : {nb(r.bids_count)}</span>
                    <span>Contrats obtenus : {nb(r.awards_count)}</span>
                    <span>Contrats terminés : {nb(r.completed_count)}</span>
                    <span>Annulations : {nb(r.cancelled_count)}</span>
                    <span>Litiges : {nb(r.disputes_count)}</span>
                    <span>Dernière activité : {dt(r.last_activity_at)}</span>
                    <span>Calculé le : {dt(r.computed_at)}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                    <span>Score public : <strong>{pct(r.public_score)}</strong></span>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      Afficher publiquement
                      <Switch checked={!!r.show_public_score} onCheckedChange={(v) => basculerPublic(r, v)} />
                    </label>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Copy, ExternalLink, Loader2, UserPlus, UserMinus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  claimGroup,
  fetchAssignments,
  fetchCampaignGroups,
  fetchCampaigns,
  fetchGroupsPage,
  fetchPublications,
  releaseGroup,
} from "@/lib/facebook-groups/api";
import { computeQueue, cycleStats } from "@/lib/facebook-groups/rotation";
import type { FbCampaign, FbGroup } from "@/lib/facebook-groups/types";
import { supabase } from "@/integrations/supabase/client";

export default function NextGroupsTab(props: { actor: string; onOpenGroup: (g: FbGroup) => void }) {
  const [campaigns, setCampaigns] = useState<FbCampaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof loadAll>> | null>(null);

  const campaign = campaigns.find((c) => c.id === campaignId) ?? null;

  async function loadAll(camp: FbCampaign) {
    const [groupsRes, cgs, pubs, assigns] = await Promise.all([
      fetchGroupsPage({ page: 0, includeArchived: true }),
      fetchCampaignGroups(camp.id),
      fetchPublications({ campaignId: camp.id }),
      fetchAssignments(camp.id, camp.cycle),
    ]);
    // La file a besoin de tous les groupes, pas seulement de la première page.
    let allGroups = groupsRes.rows;
    for (let p = 1; p * 100 < groupsRes.count; p++) {
      const more = await fetchGroupsPage({ page: p, includeArchived: true });
      allGroups = allGroups.concat(more.rows);
    }
    // Doublons toutes campagnes : charger aussi les publications des autres campagnes.
    const { data: allPubs } = await supabase.from("fb_publications").select("*");
    return { groups: allGroups, cgs, pubs: (allPubs ?? []) as typeof pubs, assigns };
  }

  const load = useCallback(async () => {
    if (!campaign) return;
    setLoading(true);
    try {
      setData(await loadAll(campaign));
    } catch (e) {
      toast({ title: "Lecture impossible", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id, campaign?.cycle]);

  useEffect(() => {
    fetchCampaigns()
      .then((cs) => {
        setCampaigns(cs);
        if (cs.length > 0) setCampaignId(cs[0].id);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const queue = useMemo(() => {
    if (!data || !campaign) return [];
    return computeQueue({
      groups: data.groups,
      campaignGroups: data.cgs,
      publications: data.pubs,
      assignments: data.assigns,
      campaign,
    });
  }, [data, campaign]);

  const stats = useMemo(() => {
    if (!data || !campaign) return null;
    return cycleStats({ campaignGroups: data.cgs, publications: data.pubs, campaign });
  }, [data, campaign]);

  const doClaim = async (groupId: string) => {
    if (!campaign || assigning) return;
    setAssigning(true);
    try {
    const res = await claimGroup(groupId, campaign.id, campaign.cycle, props.actor);
    if (!res.ok) {
      toast({
        title: "Conflit d'attribution",
        description: "Un autre administrateur tient déjà cette fiche pour ce cycle.",
        variant: "destructive",
      });
    } else {
      toast({ title: "Fiche attribuée" });
    }
    await load();
    } catch { toast({ title: "Attribution impossible", description: "Actualisez la file et réessayez.", variant: "destructive" }); }
    finally { setAssigning(false); }
  };

  const doRelease = async (groupId: string) => {
    if (!campaign) return;
    try { await releaseGroup(groupId, campaign.id, campaign.cycle, props.actor); await load(); }
    catch { toast({ title: "Libération impossible", variant: "destructive" }); }
  };

  const newCycle = async () => {
    if (!campaign) return;
    const { error } = await supabase
      .from("fb_campaigns")
      .update({ cycle: campaign.cycle + 1, updated_at: new Date().toISOString() })
      .eq("id", campaign.id);
    if (error) {
      toast({ title: "Impossible", description: String(error), variant: "destructive" });
      return;
    }
    toast({
      title: `Cycle ${campaign.cycle + 1} commencé`,
      description: "Les cycles précédents et leur historique sont conservés.",
    });
    setCampaigns((cs) => cs.map((c) => (c.id === campaign.id ? { ...c, cycle: c.cycle + 1 } : c)));
  };

  if (campaigns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune campagne. Créez-en une dans l'onglet « Campagnes » pour obtenir la file des prochains groupes.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={campaignId} onValueChange={setCampaignId}>
          <SelectTrigger className="w-[260px]"><SelectValue placeholder="Campagne" /></SelectTrigger>
          <SelectContent>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} — cycle {c.cycle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        {stats && stats.remaining === 0 && stats.selected > 0 && (
          <Button size="sm" onClick={newCycle}>
            Tour terminé — commencer le cycle {(campaign?.cycle ?? 1) + 1}
          </Button>
        )}
      </div>

      {stats && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">Sélectionnés : {stats.selected}</Badge>
          <Badge variant="secondary">Tentés : {stats.attempted}</Badge>
          <Badge variant="secondary">En attente : {stats.pending}</Badge>
          <Badge variant="secondary">Publiés : {stats.published}</Badge>
          <Badge variant="secondary">Refusés/retirés : {stats.refused}</Badge>
          <Badge variant="secondary">Restants : {stats.remaining}</Badge>
          <Badge>Groupes couverts (distincts) : {stats.coveredGroups}</Badge>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {queue.map((item) => (
            <div key={item.group.id} className="rounded-md border p-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="font-medium text-left hover:underline"
                  onClick={() => props.onOpenGroup(item.group)}
                >
                  {item.group.source_id} — {item.group.name}
                </button>
                {item.neverAttempted && <Badge>Jamais tenté</Badge>}
                {item.rulesUnknown && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Règles inconnues
                  </Badge>
                )}
                {item.blockedByDate && (
                  <Badge variant="outline">Prochaine date autorisée : {item.nextAllowedDate}</Badge>
                )}
                {item.duplicateWarning && (
                  <Badge variant="destructive">{item.duplicateWarning}</Badge>
                )}
                {item.assignedTo && (
                  <Badge variant={item.assignedTo === props.actor ? "default" : "secondary"}>
                    {item.assignedTo === props.actor ? "Attribué à vous" : "Attribué à un autre admin"}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Dernière tentative : {item.lastAttemptAt ? item.lastAttemptAt.slice(0, 10) : "jamais"}
                {" — "}Dernière publication : {item.lastPublishedAt ? item.lastPublishedAt.slice(0, 10) : "jamais"}
              </p>
              <div className="flex flex-wrap gap-1">
                {item.group.fb_url && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { if (item.group.fb_url) window.open(item.group.fb_url, "_blank", "noopener"); }}
                  >
                    <ExternalLink className="h-4 w-4 mr-1" /> Ouvrir le groupe
                  </Button>
                )}
                {campaign?.content_text && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      if (!campaign.content_text) return;
                      await navigator.clipboard.writeText(campaign.content_text);
                      toast({ title: "Texte copié", description: "Aucune publication n'a été marquée." });
                    }}
                  >
                    <Copy className="h-4 w-4 mr-1" /> Copier le texte
                  </Button>
                )}
                {!item.assignedTo && (
                  <Button size="sm" variant="secondary" disabled={assigning} onClick={() => doClaim(item.group.id)}>
                    <UserPlus className="h-4 w-4 mr-1" /> Prendre en charge
                  </Button>
                )}
                {item.assignedTo === props.actor && (
                  <Button size="sm" variant="ghost" onClick={() => doRelease(item.group.id)}>
                    <UserMinus className="h-4 w-4 mr-1" /> Libérer
                  </Button>
                )}
              </div>
            </div>
          ))}
          {queue.length === 0 && (
            <p className="text-sm text-muted-foreground">
              File vide : tous les groupes sélectionnés ont été tentés ou sont en attente. Consultez le bilan
              ci-dessus; un nouveau cycle peut être commencé sans effacer les précédents.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { fetchAllGroups, fetchCampaignGroups, fetchCampaigns } from "@/lib/facebook-groups/api";
import type { FbCampaign, FbCampaignGroup, FbGroup } from "@/lib/facebook-groups/types";
import { supabase } from "@/integrations/supabase/client";

export default function CampaignsTab(props: { actor: string }) {
  const [campaigns, setCampaigns] = useState<FbCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [contentText, setContentText] = useState("");
  const [interval, setIntervalDays] = useState("14");
  const [selecting, setSelecting] = useState<FbCampaign | null>(null);
  const [groups, setGroups] = useState<FbGroup[]>([]);
  const [members, setMembers] = useState<FbCampaignGroup[]>([]);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCampaigns(await fetchCampaigns());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    const days = Number(interval);
    if (!Number.isFinite(days) || days < 0) {
      toast({ title: "Intervalle invalide", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("fb_campaigns").insert({
      name: name.trim(),
      description: description || null,
      content_text: contentText || null,
      min_interval_days: days,
      created_by: props.actor,
    });
    if (error) {
      toast({ title: "Création impossible", description: String(error), variant: "destructive" });
      return;
    }
    toast({ title: "Campagne créée" });
    setCreating(false);
    setName("");
    setDescription("");
    setContentText("");
    load();
  };

  const openSelection = async (c: FbCampaign) => {
    setSelecting(c);
    const [gs, ms] = await Promise.all([fetchAllGroups(), fetchCampaignGroups(c.id)]);
    setGroups(gs.filter((g) => !g.archived_at && !g.merged_into));
    setMembers(ms);
  };

  const toggle = async (g: FbGroup, checked: boolean) => {
    if (!selecting) return;
    if (checked) {
      const { error } = await supabase
        .from("fb_campaign_groups")
        .upsert({ campaign_id: selecting.id, group_id: g.id, added_by: props.actor });
      if (!error) setMembers((ms) => [...ms.filter((m) => m.group_id !== g.id), { campaign_id: selecting.id, group_id: g.id, excluded: false, exclusion_reason: null, added_by: props.actor, created_at: "" }]);
    } else {
      await supabase.from("fb_campaign_groups").delete().eq("campaign_id", selecting.id).eq("group_id", g.id);
      setMembers((ms) => ms.filter((m) => m.group_id !== g.id));
    }
  };

  const exclude = async (g: FbGroup) => {
    if (!selecting) return;
    const reason = window.prompt("Motif d'exclusion de cette campagne :");
    if (reason === null) return;
    await supabase
      .from("fb_campaign_groups")
      .upsert({ campaign_id: selecting.id, group_id: g.id, excluded: true, exclusion_reason: reason, added_by: props.actor });
    setMembers((ms) => [
      ...ms.filter((m) => m.group_id !== g.id),
      { campaign_id: selecting.id, group_id: g.id, excluded: true, exclusion_reason: reason, added_by: props.actor, created_at: "" },
    ]);
  };

  const memberOf = (gid: string) => members.find((m) => m.group_id === gid);
  const filtered = groups.filter((g) =>
    !filter || g.name.toLowerCase().includes(filter.toLowerCase()) || (g.source_id ?? "").toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nouvelle campagne
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {campaigns.map((c) => (
            <div key={c.id} className="rounded-md border p-3 flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[200px]">
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  Cycle {c.cycle} — intervalle minimal {c.min_interval_days} j (la règle d'un groupe prévaut)
                  {c.description ? ` — ${c.description}` : ""}
                </p>
              </div>
              <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
              <Button size="sm" variant="outline" onClick={() => openSelection(c)}>
                Groupes de la campagne
              </Button>
            </div>
          ))}
          {campaigns.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucune campagne pour le moment.</p>
          )}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouvelle campagne</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nom</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Texte du contenu à publier</Label>
              <Textarea value={contentText} onChange={(e) => setContentText(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Délai minimal entre deux publications dans un même groupe (jours)</Label>
              <Input type="number" min={0} value={interval} onChange={(e) => setIntervalDays(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Ce délai est votre choix de configuration, pas une règle de Facebook. La règle renseignée
                sur la fiche d'un groupe prévaut.
              </p>
            </div>
            <Button onClick={create} disabled={!name.trim()}>Créer</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selecting} onOpenChange={(o) => !o && setSelecting(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Groupes — {selecting?.name}</DialogTitle></DialogHeader>
          <Input placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="space-y-1">
            {filtered.slice(0, 300).map((g) => {
              const m = memberOf(g.id);
              return (
                <div key={g.id} className="flex items-center gap-2 text-sm py-1 border-b last:border-0">
                  <Checkbox
                    checked={!!m && !m.excluded}
                    onCheckedChange={(v) => toggle(g, v === true)}
                  />
                  <span className="flex-1">
                    <span className="font-mono text-xs">{g.source_id ?? ""}</span> {g.name}
                    {m?.excluded && (
                      <Badge variant="destructive" className="ml-2">Exclu : {m.exclusion_reason}</Badge>
                    )}
                  </span>
                  {m && !m.excluded && (
                    <Button size="sm" variant="ghost" onClick={() => exclude(g)}>Exclure…</Button>
                  )}
                </div>
              );
            })}
            {filtered.length > 300 && (
              <p className="text-xs text-muted-foreground">300 premiers résultats affichés — utilisez le filtre.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

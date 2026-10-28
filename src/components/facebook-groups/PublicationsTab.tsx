import { useCallback, useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { exportCsv, fetchCampaigns, fetchPublications } from "@/lib/facebook-groups/api";
import { PUBLICATION_STATUS_LABEL, type FbCampaign, type FbPublication, type FbPublicationStatus } from "@/lib/facebook-groups/types";
import { supabase } from "@/integrations/supabase/client";
import PublicationFiles from "./PublicationFiles";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function PublicationsTab() {
  const [pubs, setPubs] = useState<FbPublication[]>([]);
  const [campaigns, setCampaigns] = useState<FbCampaign[]>([]);
  const [groupNames, setGroupNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"all" | FbPublicationStatus>("all");
  const [campaignId, setCampaignId] = useState("all");
  const [selected, setSelected] = useState<FbPublication | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchPublications({
        status: status === "all" ? undefined : status,
        campaignId: campaignId === "all" ? undefined : campaignId,
      });
      setPubs(rows);
      const ids = [...new Set(rows.map((r) => r.group_id))];
      if (ids.length > 0) {
        const { data } = await supabase.from("fb_groups").select("id, name, source_id").in("id", ids);
        const map: Record<string, string> = {};
        (data ?? []).forEach((g) => {
          map[g.id] = `${g.source_id ?? ""} ${g.name}`.trim();
        });
        setGroupNames(map);
      }
    } catch (e) {
      toast({ title: "Lecture impossible", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [status, campaignId]);

  useEffect(() => {
    fetchCampaigns().then(setCampaigns).catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const followUp = pubs.filter((p) => p.status === "refuse" || p.status === "retire");

  const doExport = () => {
    exportCsv(
      "groupes-facebook-journal.csv",
      pubs.map((p) => ({
        groupe: groupNames[p.group_id] ?? p.group_id,
        campagne: campaigns.find((c) => c.id === p.campaign_id)?.name ?? "",
        cycle: p.cycle,
        statut: PUBLICATION_STATUS_LABEL[p.status],
        date_action: (p.submitted_at ?? p.published_at ?? p.created_at).slice(0, 10),
        date_reelle_post: p.published_real_date ?? p.submitted_real_date ?? "",
        lien_post: p.post_url ?? "",
        compte_utilise: p.account_used ?? "",
        notes: p.notes ?? "",
      })),
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            {Object.entries(PUBLICATION_STATUS_LABEL).map(([k, l]) => (
              <SelectItem key={k} value={k}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={campaignId} onValueChange={setCampaignId}>
          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Campagne" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes campagnes</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={doExport} disabled={pubs.length === 0}>
          <Download className="h-4 w-4 mr-1" /> Exporter le journal
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Groupe</TableHead>
                  <TableHead>Campagne</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date de l'action</TableHead>
                  <TableHead>Date réelle du post</TableHead>
                  <TableHead>Lien</TableHead>
                  <TableHead>Pièces</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pubs.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{groupNames[p.group_id] ?? "…"}</TableCell>
                    <TableCell>
                      {campaigns.find((c) => c.id === p.campaign_id)?.name ?? "—"} (cycle {p.cycle})
                    </TableCell>
                    <TableCell><Badge>{PUBLICATION_STATUS_LABEL[p.status]}</Badge></TableCell>
                    <TableCell>{(p.submitted_at ?? p.published_at ?? p.created_at).slice(0, 10)}</TableCell>
                    <TableCell>{p.published_real_date ?? p.submitted_real_date ?? "—"}</TableCell>
                    <TableCell>
                      {p.post_url ? (
                        <a className="underline text-xs" href={p.post_url} target="_blank" rel="noreferrer">post</a>
                      ) : "—"}
                    </TableCell>
                    <TableCell><Button size="sm" variant="outline" onClick={() => setSelected(p)}>Photos et documents</Button></TableCell>
                  </TableRow>
                ))}
                {pubs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Aucune publication enregistrée pour ces filtres.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {followUp.length > 0 && (
            <div className="rounded-md border p-3 space-y-1">
              <h3 className="font-medium text-sm">Suivi des refus et retraits (tentatives, jamais des réussites)</h3>
              {followUp.map((p) => (
                <p key={p.id} className="text-xs text-muted-foreground">
                  {groupNames[p.group_id] ?? p.group_id} — {PUBLICATION_STATUS_LABEL[p.status]} le{" "}
                  {(p.submitted_at ?? p.updated_at).slice(0, 10)} — replanifiable depuis la fiche du groupe.
                </p>
              ))}
            </div>
          )}
        </>
      )}
      {selected && <Dialog open onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Photos et documents</DialogTitle></DialogHeader><PublicationFiles publicationId={selected.id} /></DialogContent></Dialog>}
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Search, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { addGroup, exportCsv, fetchGroupsPage } from "@/lib/facebook-groups/api";
import { GROUP_STATUS_LABEL, type FbGroup } from "@/lib/facebook-groups/types";

const PAGE_SIZE = 100;

export default function DirectoryTab(props: {
  actor: string;
  onOpenGroup: (g: FbGroup) => void;
  reloadKey: number;
}) {
  const [rows, setRows] = useState<FbGroup[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchGroupsPage({
        page,
        search: search || undefined,
        status,
        region: region || undefined,
        category: category || undefined,
      });
      setRows(res.rows);
      setCount(res.count);
    } catch (e) {
      toast({ title: "Lecture impossible", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, search, status, region, category]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load, props.reloadKey]);

  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const doExport = async () => {
    // Export complet du répertoire (toutes pages).
    const all: FbGroup[] = [];
    for (let p = 0; ; p++) {
      const res = await fetchGroupsPage({ page: p, includeArchived: true });
      all.push(...res.rows);
      if (res.rows.length < PAGE_SIZE) break;
    }
    exportCsv(
      "groupes-facebook-repertoire.csv",
      all.map((g) => ({
        source_id: g.source_id,
        nom: g.name,
        note_transcription: g.transcription_note,
        captures: g.captures.join(" "),
        lien_facebook: g.fb_url,
        region: g.region,
        villes: g.cities,
        categorie: g.category,
        langue: g.language,
        regles_publicite: g.ad_rules,
        statut: g.status,
        nom_a_completer: g.name_incomplete ? "oui" : "",
        archive: g.archived_at ? "oui" : "",
      })),
    );
  };

  const doAdd = async () => {
    if (!newName.trim()) return;
    try {
      await addGroup(newName.trim(), props.actor);
      toast({ title: "Groupe ajouté" });
      setNewName("");
      setAdding(false);
      load();
    } catch (e) {
      toast({ title: "Ajout impossible", description: String(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Rechercher un nom ou un code GF…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            {Object.entries(GROUP_STATUS_LABEL).map(([k, l]) => (
              <SelectItem key={k} value={k}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="w-[150px]"
          placeholder="Région"
          value={region}
          onChange={(e) => { setRegion(e.target.value); setPage(0); }}
        />
        <Input
          className="w-[150px]"
          placeholder="Catégorie"
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(0); }}
        />
        <Button variant="outline" size="sm" onClick={doExport}>
          <Download className="h-4 w-4 mr-1" /> Exporter
        </Button>
        <Button size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-4 w-4 mr-1" /> Ajouter
        </Button>
      </div>

      {adding && (
        <div className="flex gap-2 items-center rounded-md border p-3">
          <Input
            placeholder="Nom affiché du groupe (tel que lu, sans le corriger)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button onClick={doAdd} disabled={!newName.trim()}>Enregistrer</Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[90px]">Code</TableHead>
                  <TableHead>Nom affiché</TableHead>
                  <TableHead>Région</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Lien</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((g) => (
                  <TableRow
                    key={g.id}
                    className="cursor-pointer"
                    onClick={() => props.onOpenGroup(g)}
                  >
                    <TableCell className="font-mono text-xs">{g.source_id ?? "—"}</TableCell>
                    <TableCell>
                      <span className="font-medium">{g.name}</span>
                      {g.name_incomplete && (
                        <Badge variant="destructive" className="ml-2">Nom à compléter</Badge>
                      )}
                      {g.transcription_note && (
                        <span className="block text-xs text-muted-foreground">
                          Note : {g.transcription_note}
                        </span>
                      )}
                      {g.merged_into && <Badge variant="secondary" className="ml-2">Fusionné</Badge>}
                    </TableCell>
                    <TableCell>{g.region ?? "—"}</TableCell>
                    <TableCell>{g.category ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={g.status === "actif" ? "default" : "secondary"}>
                        {GROUP_STATUS_LABEL[g.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{g.fb_url ? "Vérifié" : "À fournir"}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Aucun groupe ne correspond aux filtres.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{count} fiches — page {page + 1} / {pages}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages - 1}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

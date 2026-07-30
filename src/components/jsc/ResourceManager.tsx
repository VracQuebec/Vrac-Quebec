// Gestionnaire CRUD générique piloté par la configuration (src/lib/jsc/config.ts).
// Ajouter / modifier / activer / désactiver / supprimer, pour n'importe quelle
// table jsc_*. Un seul composant = comportement identique partout.
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, Plus, Pencil, Archive, ArchiveRestore, Search, Lock, History, Download, Upload, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { FieldDef, ResourceDef } from "@/lib/jsc/config";
import AuditTrail from "@/components/jsc/AuditTrail";

type Row = Record<string, unknown>;
type RefMap = Record<string, { id: string; label: string }[]>;

const NONE = "__none__";

function emptyDraft(resource: ResourceDef): Row {
  const draft: Row = {};
  for (const f of resource.fields) {
    draft[f.key] = f.defaultValue ?? (f.type === "boolean" ? false : "");
  }
  return draft;
}

// --- CSV (compatible Excel) -------------------------------------------------
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  const sep = text.split("\n")[0].includes(";") ? ";" : ",";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export default function ResourceManager({
  resource,
  companyId,
}: {
  resource: ResourceDef;
  companyId?: string | null;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [refs, setRefs] = useState<RefMap>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Row>(() => emptyDraft(resource));
  const [toArchive, setToArchive] = useState<Row | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [historyRow, setHistoryRow] = useState<Row | null>(null);
  const [importing, setImporting] = useState(false);

  const listFields = useMemo(
    () => resource.fields.filter((f) => f.inList && f.key !== "is_active"),
    [resource],
  );
  const hasActive = useMemo(
    () => resource.fields.some((f) => f.key === "is_active"),
    [resource],
  );
  const scopeId = resource.companyScoped ? companyId ?? null : null;

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from(resource.table as never).select("*");
    q = showArchived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
    if (resource.companyScoped && companyId) q = q.eq("company_id", companyId);
    for (const o of resource.orderBy) q = q.order(o.column, { ascending: o.ascending });
    const { data, error } = await q.limit(1000);
    if (error) toast.error(error.message);
    setRows((data as unknown as Row[]) ?? []);
    setLoading(false);
  }, [resource, showArchived, companyId]);

  const loadRefs = useCallback(async () => {
    const refFields = resource.fields.filter((f) => f.type === "reference" && f.refTable);
    if (refFields.length === 0) return;
    const next: RefMap = {};
    await Promise.all(
      refFields.map(async (f) => {
        const { data } = await supabase
          .from(f.refTable as never)
          .select(`id, ${f.refLabel ?? "name"}`)
          .limit(1000);
        next[f.key] = ((data as unknown as Row[]) ?? []).map((r) => ({
          id: String(r.id),
          label: String(r[f.refLabel ?? "name"] ?? "—"),
        }));
      }),
    );
    setRefs((prev) => ({ ...prev, ...next }));
  }, [resource]);

  useEffect(() => {
    setQuery("");
    void load();
    void loadRefs();
  }, [load, loadRefs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      listFields.some((f) => String(r[f.key] ?? "").toLowerCase().includes(q)),
    );
  }, [rows, query, listFields]);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft(resource));
    setOpen(true);
  };

  const toDraftValue = (f: FieldDef, v: unknown) => {
    if (f.type === "list") return Array.isArray(v) ? (v as string[]).join("\n") : (v ?? "");
    return v ?? (f.type === "boolean" ? false : "");
  };

  const openEdit = (row: Row) => {
    setEditing(row);
    const d: Row = {};
    for (const f of resource.fields) d[f.key] = toDraftValue(f, row[f.key]);
    setDraft(d);
    setOpen(true);
  };

  // Duplication : reprend toutes les valeurs sauf l'identifiant et le numéro.
  const openDuplicate = (row: Row) => {
    setEditing(null);
    const d: Row = {};
    for (const f of resource.fields) d[f.key] = toDraftValue(f, row[f.key]);
    if (typeof d.name === "string") d.name = `${d.name} (copie)`;
    if (typeof d.code === "string" && d.code) d.code = `${d.code}-COPIE`;
    if ("slug" in d) d.slug = "";
    setDraft(d);
    setOpen(true);
  };

  const serialize = (): Row | null => {
    const payload: Row = {};
    for (const f of resource.fields) {
      const raw = draft[f.key];
      if (f.required && (raw === "" || raw === null || raw === undefined)) {
        toast.error(`Le champ « ${f.label} » est obligatoire.`);
        return null;
      }
      if (f.type === "boolean") payload[f.key] = Boolean(raw);
      else if (f.type === "number") payload[f.key] = raw === "" || raw === null ? null : Number(raw);
      else if (f.type === "list") {
        payload[f.key] = String(raw ?? "")
          .split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
      }
      else payload[f.key] = raw === "" ? null : raw;
    }
    return payload;
  };

  const save = async () => {
    const payload = serialize();
    if (!payload) return;
    if (scopeId && !editing) payload.company_id = scopeId;
    setSaving(true);
    const res = editing
      ? await supabase.from(resource.table as never).update(payload as never).eq("id", String(editing.id))
      : await supabase.from(resource.table as never).insert(payload as never);
    setSaving(false);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(editing ? `${resource.singular} modifié.` : `${resource.singular} ajouté.`);
    setOpen(false);
    void load();
    void loadRefs();
  };

  const toggleActive = async (row: Row) => {
    const next = !row.is_active;
    const { error } = await supabase
      .from(resource.table as never)
      .update({ is_active: next } as never)
      .eq("id", String(row.id));
    if (error) { toast.error(error.message); return; }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: next } : r)));
    toast.success(next ? "Activé." : "Désactivé.");
  };

  // Archivage / restauration : opération transactionnelle côté base de données.
  const setArchived = async (row: Row, restore: boolean) => {
    const { error } = await supabase.rpc("jsc_archive_record", {
      _table: resource.table,
      _id: String(row.id),
      _restore: restore,
    });
    setToArchive(null);
    if (error) { toast.error(error.message); return; }
    toast.success(restore ? `${resource.singular} restauré.` : `${resource.singular} archivé.`);
    void load();
    void loadRefs();
  };

  const renderCell = (row: Row, f: FieldDef) => {
    const v = row[f.key];
    if (f.type === "boolean") return v ? "Oui" : "Non";
    if (f.type === "list") {
      const arr = Array.isArray(v) ? (v as string[]) : [];
      return arr.length ? arr.join(", ") : <span className="text-muted-foreground">—</span>;
    }
    if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
    if (f.type === "reference") {
      const found = refs[f.key]?.find((o) => o.id === String(v));
      return found?.label ?? <span className="text-muted-foreground">—</span>;
    }
    if (f.type === "select") {
      return f.options?.find((o) => o.value === String(v))?.label ?? String(v);
    }
    return `${v}${f.suffix ? ` ${f.suffix}` : ""}`;
  };

  // --- Import / export CSV (ouvrable dans Excel) ----------------------------
  const exportCsv = () => {
    const keys = resource.fields.map((f) => f.key);
    const lines = [
      keys.join(";"),
      ...filtered.map((r) => keys.map((k) => csvCell(r[k])).join(";")),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${resource.id}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = async (file: File) => {
    setImporting(true);
    try {
      const rowsCsv = parseCsv(await file.text());
      if (rowsCsv.length < 2) { toast.error("Fichier vide ou sans données."); return; }
      const header = rowsCsv[0].map((h) => h.replace(/^\uFEFF/, "").trim());
      const known = new Map(resource.fields.map((f) => [f.key, f]));
      const payloads = rowsCsv.slice(1).map((line) => {
        const p: Row = {};
        header.forEach((h, i) => {
          const f = known.get(h);
          if (!f) return;
          const raw = (line[i] ?? "").trim();
          if (f.type === "boolean") p[f.key] = ["1", "true", "oui", "vrai", "yes"].includes(raw.toLowerCase());
          else if (f.type === "number") p[f.key] = raw === "" ? null : Number(raw.replace(",", "."));
          else if (f.type === "list") p[f.key] = raw ? raw.split(/[|,;]+/).map((s) => s.trim()).filter(Boolean) : [];
          else p[f.key] = raw === "" ? null : raw;
        });
        if (scopeId) p.company_id = scopeId;
        return p;
      }).filter((p) => Object.keys(p).length > 0);

      if (payloads.length === 0) {
        toast.error("Aucune colonne reconnue. Exportez d'abord un modèle CSV.");
        return;
      }
      const { error } = await supabase.from(resource.table as never).insert(payloads as never);
      if (error) { toast.error(error.message); return; }
      toast.success(`${payloads.length} ligne(s) importée(s).`);
      void load();
      void loadRefs();
    } finally {
      setImporting(false);
    }
  };

  const renderInput = (f: FieldDef) => {
    const v = draft[f.key];
    if (f.type === "boolean") {
      return (
        <div className="flex h-10 items-center">
          <Switch
            checked={Boolean(v)}
            onCheckedChange={(c) => setDraft((d) => ({ ...d, [f.key]: c }))}
          />
        </div>
      );
    }
    if (f.type === "textarea") {
      return (
        <Textarea
          rows={3}
          value={String(v ?? "")}
          placeholder={f.placeholder}
          onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
        />
      );
    }
    if (f.type === "select") {
      return (
        <Select
          value={String(v ?? "")}
          onValueChange={(val) => setDraft((d) => ({ ...d, [f.key]: val }))}
        >
          <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
          <SelectContent>
            {f.options?.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    if (f.type === "reference") {
      const options = refs[f.key] ?? [];
      return (
        <Select
          value={v ? String(v) : NONE}
          onValueChange={(val) => setDraft((d) => ({ ...d, [f.key]: val === NONE ? "" : val }))}
        >
          <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Aucun</SelectItem>
            {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    return (
      <Input
        type={f.type === "number" ? "number" : "text"}
        step="any"
        value={v === null || v === undefined ? "" : String(v)}
        placeholder={f.placeholder}
        onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
      />
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{resource.title}</h2>
          <p className="text-sm text-muted-foreground">{resource.description}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={showArchived ? "default" : "outline"}
            onClick={() => setShowArchived((v) => !v)}
          >
            <Archive className="mr-2 h-4 w-4" />
            {showArchived ? "Actifs" : "Archives"}
          </Button>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="w-full pl-9 sm:w-56"
              placeholder="Rechercher…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={exportCsv} title="Exporter en CSV / Excel">
            <Download className="mr-2 h-4 w-4" /> Exporter
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void importCsv(f);
              }}
            />
            <span
              className="inline-flex h-10 cursor-pointer items-center rounded-md border border-input px-4 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
              title="Importer un fichier CSV"
            >
              {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Importer
            </span>
          </label>
          <Button onClick={openCreate} disabled={showArchived}>
            <Plus className="mr-2 h-4 w-4" /> Ajouter
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">
            {showArchived
              ? "Aucun élément archivé."
              : `Aucun élément. Cliquez sur « Ajouter » pour créer le premier ${resource.singular.toLowerCase()}.`}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {listFields.map((f) => <TableHead key={f.key}>{f.label}</TableHead>)}
                  {hasActive && <TableHead>Statut</TableHead>}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={String(row.id)} className={hasActive && !row.is_active ? "opacity-60" : ""}>
                    {listFields.map((f) => (
                      <TableCell key={f.key} className="whitespace-nowrap text-sm">
                        {renderCell(row, f)}
                      </TableCell>
                    ))}
                    {hasActive && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {!showArchived && (
                          <Switch checked={Boolean(row.is_active)} onCheckedChange={() => toggleActive(row)} />
                        )}
                        <Badge variant={showArchived ? "outline" : row.is_active ? "default" : "secondary"}>
                          {showArchived ? "Archivé" : row.is_active ? "Actif" : "Inactif"}
                        </Badge>
                      </div>
                    </TableCell>
                    )}
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setHistoryRow(row)} aria-label="Historique">
                        <History className="h-4 w-4" />
                      </Button>
                      {showArchived ? (
                        <Button variant="ghost" size="icon" onClick={() => setArchived(row, true)} aria-label="Restaurer">
                          <ArchiveRestore className="h-4 w-4 text-primary" />
                        </Button>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(row)} aria-label="Modifier">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setToArchive(row)} aria-label="Archiver">
                            <Archive className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? `Modifier — ${resource.singular}` : `Nouveau ${resource.singular.toLowerCase()}`}
            </DialogTitle>
            <DialogDescription>{resource.description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {resource.fields.map((f) => (
              <div
                key={f.key}
                className={f.type === "textarea" ? "sm:col-span-2 space-y-1.5" : "space-y-1.5"}
              >
                <Label className="flex items-center gap-1.5">
                  {f.label}
                  {f.required && <span className="text-destructive">*</span>}
                  {f.suffix && <span className="text-xs text-muted-foreground">({f.suffix})</span>}
                  {f.confidential && <Lock className="h-3 w-3 text-muted-foreground" />}
                </Label>
                {renderInput(f)}
                {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyRow} onOpenChange={(o) => !o && setHistoryRow(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Historique — {resource.singular}</DialogTitle>
            <DialogDescription>
              Identifiant unique : <code className="text-xs">{String(historyRow?.id ?? "")}</code>
            </DialogDescription>
          </DialogHeader>
          {historyRow && <AuditTrail recordId={String(historyRow.id)} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toArchive} onOpenChange={(o) => !o && setToArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver cet élément ?</AlertDialogTitle>
            <AlertDialogDescription>
              Rien n'est supprimé : l'élément est archivé, retiré des listes actives et
              reste consultable et restaurable à tout moment dans l'onglet « Archives ».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => toArchive && setArchived(toArchive, false)}>
              Archiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
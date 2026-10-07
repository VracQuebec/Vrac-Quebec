// Photos et notes d'une unité — regroupe tout ce qui est rattaché au véhicule
// et à ses entretiens, réparations, inspections et dépenses (crm_documents).
// Dossiers multiples via crm_documents.folders (une photo peut être dans plusieurs).
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Images, StickyNote, Loader2, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { documentLink, type FleetDocument } from "@/lib/fleet/api";

export const PHOTO_FOLDERS = [
  { key: "camion", label: "Photos du camion" },
  { key: "inspection", label: "Inspection" },
  { key: "inspection_mecanique", label: "Inspection mécanique" },
  { key: "entretien", label: "Entretien" },
  { key: "reparation", label: "Réparation" },
  { key: "depense", label: "Dépense" },
  { key: "facture", label: "Facture (comptabilité)" },
  { key: "documents", label: "Documents" },
] as const;

const SOURCE_FOLDER: Record<string, string> = {
  fleet_vehicle: "camion", fleet_maintenance: "entretien", fleet_repair: "reparation",
  fleet_inspection: "inspection", fleet_expense: "depense",
};
const SOURCE_LABEL: Record<string, string> = {
  fleet_vehicle: "Véhicule", fleet_maintenance: "Entretien", fleet_repair: "Réparation",
  fleet_inspection: "Inspection", fleet_expense: "Dépense",
};

type Doc = FleetDocument & { folders: string[] | null };
const isImage = (d: Doc) => (d.mime_type ?? "").startsWith("image/") || /\.(jpe?g|png|webp|gif|heic)$/i.test(d.url);
const effFolders = (d: Doc) => (d.folders && d.folders.length ? d.folders : [SOURCE_FOLDER[d.owner_type] ?? "documents"]);
const fmt = (s: string) => new Date(s).toLocaleString("fr-CA", { timeZone: "America/Toronto", dateStyle: "medium", timeStyle: "short" });

async function childIds(vehicleId: string) {
  const q = (t: "fleet_maintenance" | "fleet_repairs" | "fleet_inspections" | "fleet_expenses") =>
    supabase.from(t).select("id").eq("vehicle_id", vehicleId);
  const [m, r, i, e] = await Promise.all([q("fleet_maintenance"), q("fleet_repairs"), q("fleet_inspections"), q("fleet_expenses")]);
  return [vehicleId, ...[m, r, i, e].flatMap((x) => (x.data ?? []).map((y: { id: string }) => y.id))];
}

export function VehiclePhotosButton({ vehicleId }: { vehicleId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>("tous");
  const [edit, setEdit] = useState<Doc | null>(null);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setDocs(null);
      const ids = await childIds(vehicleId);
      const { data, error } = await supabase.from("crm_documents")
        .select("id, owner_type, owner_id, kind, title, url, mime_type, size_bytes, created_at, folders")
        .in("owner_id", ids).like("owner_type", "fleet_%").order("created_at", { ascending: false });
      if (error) { toast({ title: "Chargement impossible", description: error.message, variant: "destructive" }); setDocs([]); return; }
      const list = (data ?? []) as Doc[];
      setDocs(list);
      const entries = await Promise.all(list.filter(isImage).map(async (d) => [d.id, await documentLink(d).catch(() => "")] as const));
      setUrls(Object.fromEntries(entries));
    })();
  }, [open, vehicleId, toast]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    (docs ?? []).forEach((d) => effFolders(d).forEach((f) => { c[f] = (c[f] ?? 0) + 1; }));
    return c;
  }, [docs]);
  const shown = (docs ?? []).filter((d) => filter === "tous" || effFolders(d).includes(filter));

  const saveFolders = async (d: Doc, folders: string[]) => {
    const { error } = await supabase.from("crm_documents").update({ folders }).eq("id", d.id);
    if (error) return toast({ title: "Classement impossible", description: error.message, variant: "destructive" });
    setDocs((cur) => (cur ?? []).map((x) => (x.id === d.id ? { ...x, folders } : x)));
    setEdit((e) => (e && e.id === d.id ? { ...e, folders } : e));
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Images className="w-4 h-4 mr-1" /> Photos
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Toutes les photos et documents</DialogTitle></DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant={filter === "tous" ? "default" : "outline"} onClick={() => setFilter("tous")}>Tous ({docs?.length ?? 0})</Button>
            {PHOTO_FOLDERS.map((f) => (
              <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>
                {f.label} ({counts[f.key] ?? 0})
              </Button>
            ))}
          </div>
          {docs === null ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
            : shown.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Aucune photo dans ce dossier.</p>
            : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {shown.map((d) => (
                  <button key={d.id} type="button" onClick={() => setEdit(d)}
                    className="text-left rounded-lg border border-border overflow-hidden bg-card hover:border-primary/50">
                    {isImage(d) && urls[d.id]
                      ? <img src={urls[d.id]} alt={d.title ?? "Photo"} loading="lazy" className="w-full h-28 object-cover" />
                      : <div className="w-full h-28 flex items-center justify-center"><FileText className="w-6 h-6 text-muted-foreground" /></div>}
                    <div className="p-1.5 text-[11px] text-muted-foreground">
                      <div>{SOURCE_LABEL[d.owner_type] ?? "—"} • {fmt(d.created_at)}</div>
                      <div className="truncate">{effFolders(d).map((k) => PHOTO_FOLDERS.find((f) => f.key === k)?.label ?? k).join(", ")}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Classer dans un ou plusieurs dossiers</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              {isImage(edit) && urls[edit.id] && <img src={urls[edit.id]} alt="" className="w-full max-h-72 object-contain rounded-md bg-muted" />}
              <Button size="sm" variant="ghost" onClick={async () => window.open(await documentLink(edit), "_blank")}>Ouvrir en grand</Button>
              <div className="flex flex-wrap gap-1.5">
                {PHOTO_FOLDERS.map((f) => {
                  const cur = effFolders(edit);
                  const on = cur.includes(f.key);
                  return (
                    <Button key={f.key} size="sm" variant={on ? "default" : "outline"} aria-pressed={on}
                      onClick={() => {
                        const next = on ? cur.filter((k) => k !== f.key) : [...cur, f.key];
                        if (next.length === 0) return toast({ title: "Gardez au moins un dossier" });
                        saveFolders(edit, next);
                      }}>{f.label}</Button>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

type Note = { id: string; source: string; text: string; at: string; by: string | null };

export function VehicleNotesButton({ vehicleId, vehicleNotes }: { vehicleId: string; vehicleNotes?: string | null }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    (async () => {
      setNotes(null);
      const [m, r, e, w, mr] = await Promise.all([
        supabase.from("fleet_maintenance").select("id, notes, created_at, created_by").eq("vehicle_id", vehicleId),
        supabase.from("fleet_repairs").select("id, description, notes, created_at, created_by").eq("vehicle_id", vehicleId),
        supabase.from("fleet_expenses").select("id, description, notes, created_at, created_by").eq("vehicle_id", vehicleId),
        supabase.from("fleet_work_items").select("id, description, created_at, created_by").eq("vehicle_id", vehicleId),
        supabase.from("fleet_meter_readings").select("id, notes, created_at, created_by").eq("vehicle_id", vehicleId),
      ]);
      const out: Note[] = [];
      const push = (src: string, rows: Record<string, unknown>[] | null, fields: string[]) =>
        (rows ?? []).forEach((x) => {
          const t = fields.map((f) => x[f]).filter((v) => typeof v === "string" && v.trim()).join(" — ");
          if (t) out.push({ id: `${src}-${x.id}`, source: src, text: t, at: String(x.created_at), by: (x.created_by as string) ?? null });
        });
      push("Entretien", m.data, ["notes"]);
      push("Réparation", r.data, ["description", "notes"]);
      push("Dépense", e.data, ["description", "notes"]);
      push("Travail à faire", w.data, ["description"]);
      push("Relevé", mr.data, ["notes"]);
      out.sort((a, b) => b.at.localeCompare(a.at));
      setNotes(out);
      const ids = [...new Set(out.map((n) => n.by).filter(Boolean))] as string[];
      if (ids.length) {
        const { data } = await (supabase.from("jsc_company_members") as any).select("user_id, full_name, email").in("user_id", ids);
        setNames(Object.fromEntries(((data ?? []) as { user_id: string; full_name: string | null; email: string | null }[]).map((p) => [p.user_id, p.full_name || p.email || ""])));
      }
    })();
  }, [open, vehicleId]);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <StickyNote className="w-4 h-4 mr-1" /> Notes
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Toutes les notes</DialogTitle></DialogHeader>
          {vehicleNotes?.trim() && (
            <div className="rounded-lg border border-border p-3 text-sm">
              <div className="text-[11px] text-muted-foreground mb-1">Note du véhicule</div>
              <p className="whitespace-pre-wrap">{vehicleNotes}</p>
            </div>
          )}
          {notes === null ? <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
            : notes.length === 0 && !vehicleNotes?.trim() ? <p className="py-6 text-center text-sm text-muted-foreground">Aucune note pour ce véhicule.</p>
            : (
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="text-[11px] text-muted-foreground mb-1">
                      {n.source} • {fmt(n.at)}{n.by && names[n.by] ? ` • ${names[n.by]}` : ""}
                    </div>
                    <p className="whitespace-pre-wrap">{n.text}</p>
                  </li>
                ))}
              </ul>
            )}
        </DialogContent>
      </Dialog>
    </>
  );
}

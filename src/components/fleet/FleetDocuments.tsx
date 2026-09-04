// Documents de flotte — réutilise le système de fichiers existant
// (`crm_documents` + espace de stockage privé `crm-docs`). Aucun doublon.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Trash2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  deleteDocument, documentLink, fetchDocuments, uploadDocument,
  type FleetDocument, type FleetOwnerType,
} from "@/lib/fleet/api";

export default function FleetDocuments({ ownerType, ownerId, label = "Documents" }: {
  ownerType: FleetOwnerType; ownerId: string; label?: string;
}) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<FleetDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setDocs(await fetchDocuments(ownerType, ownerId)); } catch { /* silencieux */ }
  }, [ownerType, ownerId]);

  useEffect(() => { if (ownerId) load(); }, [ownerId, load]);

  const upload = async (file?: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      await uploadDocument(ownerType, ownerId, file);
      toast({ title: "Document ajouté" });
      await load();
    } catch (e) {
      toast({ title: "Ajout impossible", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const open = async (doc: FleetDocument) => {
    try { window.open(await documentLink(doc), "_blank", "noopener"); }
    catch (e) { toast({ title: "Ouverture impossible", description: (e as Error).message, variant: "destructive" }); }
  };

  const remove = async (doc: FleetDocument) => {
    if (!window.confirm(`Supprimer « ${doc.title ?? "ce document"} » ?`)) return;
    try { await deleteDocument(doc); await load(); toast({ title: "Document supprimé" }); }
    catch (e) { toast({ title: "Suppression impossible", description: (e as Error).message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-body text-muted-foreground">{label}</span>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Paperclip className="w-4 h-4 mr-1" /> Joindre
        </Button>
        <input ref={fileRef} type="file" className="hidden"
          accept="image/*,application/pdf"
          onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      {docs.map((d) => (
        <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
          <button type="button" onClick={() => open(d)} className="flex items-center gap-2 min-w-0 text-sm font-body hover:underline">
            <ExternalLink className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{d.title ?? "Document"}</span>
          </button>
          <button type="button" onClick={() => remove(d)} aria-label="Supprimer le document"
            className="p-1 rounded hover:bg-secondary text-muted-foreground">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      {!docs.length && <p className="text-xs text-muted-foreground font-body">Aucun document.</p>}
    </div>
  );
}

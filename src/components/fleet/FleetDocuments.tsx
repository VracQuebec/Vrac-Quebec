// Photos et documents de flotte — réutilise le système de fichiers existant
// (`crm_documents` + espace de stockage privé `crm-docs`). Aucun doublon.
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Paperclip, Trash2, FileText, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteDocument, documentLink, fetchDocuments, uploadDocument,
  type FleetDocument, type FleetOwnerType,
} from "@/lib/fleet/api";

const isImage = (d: FleetDocument) =>
  (d.mime_type ?? "").startsWith("image/") || /\.(jpe?g|png|webp|gif|heic)$/i.test(d.url);

/**
 * Photos/documents choisis AVANT l'enregistrement : ils sont mis en attente
 * dans le formulaire, puis envoyés en une seule étape avec l'enregistrement.
 */
export function PendingPhotos({ files, onChange, label = "Photos et documents" }: {
  files: File[]; onChange: (files: File[]) => void; label?: string;
}) {
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = (list?: FileList | null) => {
    if (!list?.length) return;
    onChange([...files, ...Array.from(list)]);
    if (camRef.current) camRef.current.value = "";
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-body text-muted-foreground">{label}</span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => camRef.current?.click()}>
            <Camera className="w-4 h-4 mr-1" /> Prendre une photo
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Paperclip className="w-4 h-4 mr-1" /> Joindre
          </Button>
        </div>
        <input ref={camRef} type="file" className="hidden" accept="image/*" capture="environment"
          onChange={(e) => add(e.target.files)} />
        <input ref={fileRef} type="file" className="hidden" multiple accept="image/*,application/pdf"
          onChange={(e) => add(e.target.files)} />
      </div>
      {files.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {files.map((f, i) => (
            <div key={`${f.name}-${i}`} className="relative rounded-lg border border-border overflow-hidden bg-card">
              {f.type.startsWith("image/") ? (
                <img src={URL.createObjectURL(f)} alt={f.name} className="w-full h-20 object-cover" />
              ) : (
                <div className="w-full h-20 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <button type="button" aria-label="Retirer ce fichier"
                onClick={() => onChange(files.filter((_, j) => j !== i))}
                className="absolute top-1 right-1 p-1 rounded-full bg-background/80 text-muted-foreground">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <p className="text-xs text-muted-foreground font-body">
          {files.length} fichier(s) seront joints à l'enregistrement.
        </p>
      )}
    </div>
  );
}

/** Envoie les fichiers mis en attente une fois l'enregistrement créé. */
export async function uploadPendingDocuments(
  ownerType: FleetOwnerType, ownerId: string, files: File[],
) {
  let ok = 0;
  const errors: string[] = [];
  for (const file of files) {
    try {
      await uploadDocument(ownerType, ownerId, file, file.type.startsWith("image/") ? "photo" : "document");
      ok++;
    } catch (e) {
      errors.push(`${file.name} : ${(e as Error).message}`);
    }
  }
  return { ok, errors };
}

export default function FleetDocuments({ ownerType, ownerId, label = "Photos et documents" }: {
  ownerType: FleetOwnerType; ownerId: string; label?: string;
}) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<FleetDocument[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const list = await fetchDocuments(ownerType, ownerId);
      setDocs(list);
      const imgs = list.filter((d) => isImage(d) && !/^https?:\/\//.test(d.url));
      if (imgs.length) {
        const { data } = await supabase.storage.from("crm-docs").createSignedUrls(imgs.map((d) => d.url), 3600);
        const map: Record<string, string> = {};
        imgs.forEach((d, i) => { const u = data?.[i]?.signedUrl; if (u) map[d.id] = u; });
        list.filter((d) => isImage(d) && /^https?:\/\//.test(d.url)).forEach((d) => { map[d.id] = d.url; });
        setThumbs(map);
      } else setThumbs({});
    } catch { /* silencieux */ }
  }, [ownerType, ownerId]);

  useEffect(() => { if (ownerId) load(); }, [ownerId, load]);

  const upload = async (files?: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      try {
        await uploadDocument(ownerType, ownerId, file, file.type.startsWith("image/") ? "photo" : "document");
        ok++;
      } catch (e) {
        toast({ title: `Ajout impossible : ${file.name}`, description: (e as Error).message, variant: "destructive" });
      }
    }
    if (ok) toast({ title: ok > 1 ? `${ok} fichiers ajoutés` : "Fichier ajouté" });
    await load();
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (camRef.current) camRef.current.value = "";
  };

  const open = async (doc: FleetDocument) => {
    try { window.open(thumbs[doc.id] ?? await documentLink(doc), "_blank", "noopener"); }
    catch (e) { toast({ title: "Ouverture impossible", description: (e as Error).message, variant: "destructive" }); }
  };

  const rename = async (doc: FleetDocument) => {
    const title = window.prompt("Description (ex. : pneu avant gauche usé)", doc.title ?? "");
    if (title === null) return;
    const { error } = await supabase.from("crm_documents").update({ title: title.trim() || null }).eq("id", doc.id);
    if (error) toast({ title: "Modification impossible", description: error.message, variant: "destructive" });
    else await load();
  };

  const remove = async (doc: FleetDocument) => {
    if (!window.confirm(`Supprimer « ${doc.title ?? "ce fichier"} » ?`)) return;
    try { await deleteDocument(doc); await load(); toast({ title: "Fichier supprimé" }); }
    catch (e) { toast({ title: "Suppression impossible", description: (e as Error).message, variant: "destructive" }); }
  };

  const photos = docs.filter((d) => thumbs[d.id]);
  const others = docs.filter((d) => !thumbs[d.id]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-body text-muted-foreground">{label}</span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => camRef.current?.click()}>
            <Camera className="w-4 h-4 mr-1" /> Prendre une photo
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Paperclip className="w-4 h-4 mr-1" /> Joindre
          </Button>
        </div>
        <input ref={camRef} type="file" className="hidden" accept="image/*" capture="environment"
          onChange={(e) => upload(e.target.files)} />
        <input ref={fileRef} type="file" className="hidden" multiple accept="image/*,application/pdf"
          onChange={(e) => upload(e.target.files)} />
      </div>
      {busy && <p className="text-xs text-muted-foreground font-body">Envoi en cours…</p>}

      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {photos.map((d) => (
            <figure key={d.id} className="rounded-lg border border-border overflow-hidden bg-card">
              <button type="button" onClick={() => open(d)} className="block w-full">
                <img src={thumbs[d.id]} alt={d.title ?? "Photo"} loading="lazy" className="w-full h-28 object-cover" />
              </button>
              <figcaption className="flex items-center gap-1 px-2 py-1">
                <span className="flex-1 truncate text-xs font-body">{d.title ?? "Photo"}</span>
                <button type="button" onClick={() => rename(d)} aria-label="Modifier la description"
                  className="p-1 rounded hover:bg-secondary text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => remove(d)} aria-label="Supprimer la photo"
                  className="p-1 rounded hover:bg-secondary text-muted-foreground"><Trash2 className="w-3.5 h-3.5" /></button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {others.map((d) => (
        <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
          <button type="button" onClick={() => open(d)} className="flex items-center gap-2 min-w-0 text-sm font-body hover:underline">
            <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{d.title ?? "Document"}</span>
          </button>
          <div className="flex">
            <button type="button" onClick={() => rename(d)} aria-label="Modifier la description"
              className="p-1 rounded hover:bg-secondary text-muted-foreground"><Pencil className="w-4 h-4" /></button>
            <button type="button" onClick={() => remove(d)} aria-label="Supprimer le document"
              className="p-1 rounded hover:bg-secondary text-muted-foreground"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
      ))}
      {!docs.length && !busy && <p className="text-xs text-muted-foreground font-body">Aucune photo ni document.</p>}
    </div>
  );
}

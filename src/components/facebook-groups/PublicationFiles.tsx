import { useEffect, useRef, useState } from "react";
import { Download, Eye, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { attachPublicationFile, listPublicationFiles, readPublicationFile, type FileJob, type PublicationFile } from "@/lib/facebook-groups/files";
import { fileProgressLabel } from "@/lib/uploads/readProgress";

const canPreview = (mime: string) => ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"].includes(mime);

export default function PublicationFiles({ publicationId }: { publicationId: string }) {
  const [files, setFiles] = useState<PublicationFile[]>([]);
  const [pending, setPending] = useState<File[]>([]);
  const jobs = useRef(new Map<File, FileJob>());
  const input = useRef<HTMLInputElement>(null);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ url: string; file: PublicationFile } | null>(null);

  useEffect(() => {
    let active = true;
    listPublicationFiles(publicationId).then((rows) => { if (active) setFiles(rows); }).catch(() => { if (active) setError("Lecture des pièces impossible. Réessayez."); });
    return () => { active = false; };
  }, [publicationId]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const upload = async (selected: File[]) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    const failed: File[] = [];
    try {
      for (let i = 0; i < selected.length; i++) {
        const file = selected[i];
        setStatus(`Ajout ${i + 1} / ${selected.length} — ${file.name}`);
        let job = jobs.current.get(file);
        if (!job) { job = { id: crypto.randomUUID(), uploaded: false }; jobs.current.set(file, job); }
        try { await attachPublicationFile(publicationId, file, job); } catch { failed.push(file); }
      }
      setPending(failed);
      setFiles(await listPublicationFiles(publicationId));
      setStatus(`${selected.length - failed.length} / ${selected.length} pièces ajoutées`);
      if (failed.length) setError(`${failed.length} fichier(s) non rattaché(s). Réessayez sans ajouter de nouveau les fichiers.`);
    } catch { setError("Actualisation impossible. Les ajouts confirmés sont conservés."); }
    finally { locked.current = false; setBusy(false); }
  };

  const open = async (file: PublicationFile, download: boolean) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(""); setStatus("Ouverture…");
    try {
      const blob = await readPublicationFile(file, (p) => setStatus(fileProgressLabel(p)));
      const url = URL.createObjectURL(blob);
      if (download || !canPreview(file.mime)) {
        const a = document.createElement("a"); a.href = url; a.download = file.name; a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else setPreview({ url, file });
      setStatus("");
    } catch (e) { setError(e instanceof Error ? e.message : "Ouverture impossible. Réessayez."); }
    finally { locked.current = false; setBusy(false); }
  };

  return <section className="w-full min-w-0 space-y-2 border-t pt-2" aria-label="Pièces jointes de la publication">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">Photos et documents</span>
      <Input ref={input} type="file" multiple className="hidden" aria-label="Ajouter des pièces à la publication" onChange={(e) => { const selected = Array.from(e.target.files ?? []); e.target.value = ""; if (selected.length) void upload(selected); }} />
      <Button size="sm" variant="outline" disabled={busy || pending.length > 0} onClick={() => input.current?.click()}><Paperclip className="mr-1 h-4 w-4" />Ajouter des pièces</Button>
      {pending.length > 0 && <Button size="sm" variant="secondary" disabled={busy} onClick={() => upload(pending)}>Réessayer ({pending.length})</Button>}
    </div>
    {status && <p className="text-xs text-muted-foreground break-all" role="status">{status}</p>}
    {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    {files.map((file) => <div key={file.id} className="flex min-w-0 items-center gap-2 text-sm">
      <span className="min-w-0 flex-1 break-all">{file.name} <span className="text-xs text-muted-foreground">({(file.size / 1048576).toFixed(2)} Mo)</span></span>
      {canPreview(file.mime) && <Button size="icon" variant="ghost" title={`Aperçu de ${file.name}`} aria-label={`Aperçu de ${file.name}`} disabled={busy} onClick={() => open(file, false)}><Eye className="h-4 w-4" /></Button>}
      <Button size="icon" variant="ghost" title={`Télécharger ${file.name}`} aria-label={`Télécharger ${file.name}`} disabled={busy} onClick={() => open(file, true)}><Download className="h-4 w-4" /></Button>
    </div>)}
    {preview && <div className="space-y-2">
      <Button size="sm" variant="outline" onClick={() => setPreview(null)}><X className="h-4 w-4 mr-1" />Fermer l’aperçu</Button>
      {preview.file.mime === "application/pdf" ? <iframe title={preview.file.name} src={preview.url} className="w-full h-[50vh] border rounded" /> : <img src={preview.url} alt={preview.file.name} className="max-h-[50vh] max-w-full object-contain" />}
    </div>}
  </section>;
}
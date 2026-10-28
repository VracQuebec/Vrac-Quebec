import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Render only the requested page, locally, from already authorized original bytes. */
export default function PrivatePdfPreview({ blob, name }: { blob: Blob; name: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const document = useRef<import("pdfjs-dist").PDFDocumentProxy | null>(null);
  const [ready, setReady] = useState(0);
  useEffect(() => {
    let active = true;
    let task: import("pdfjs-dist").PDFDocumentLoadingTask | undefined;
    setLoading(true); setError(""); setPage(1);
    (async () => {
      const pdf = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdf.GlobalWorkerOptions.workerSrc = worker.default;
      if (!active) return;
      task = pdf.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false });
      const doc = await task.promise;
      if (!active) { await doc.destroy(); return; }
      document.current = doc; setPages(doc.numPages); setReady((value) => value + 1);
    })().catch(() => { if (active) { setError("Aperçu PDF indisponible. Le téléchargement reste possible."); setLoading(false); } });
    return () => { active = false; document.current = null; void task?.destroy(); };
  }, [blob]);
  useEffect(() => {
    let active = true;
    let render: import("pdfjs-dist").RenderTask | undefined;
    (async () => {
      const doc = document.current;
      const element = canvas.current;
      if (!doc || !element) return;
      setLoading(true);
      const pdfPage = await doc.getPage(page);
      if (!active) return;
      const view = pdfPage.getViewport({ scale: 1.5 });
      element.width = view.width; element.height = view.height;
      render = pdfPage.render({ canvas: element, viewport: view });
      await render.promise;
      if (active) setLoading(false);
    })().catch(() => { if (active) { setError("Aperçu PDF indisponible. Téléchargez le document."); setLoading(false); } });
    return () => { active = false; render?.cancel(); };
  }, [page, ready]);
  return <div className="space-y-2">
    <div className="flex items-center justify-center gap-2">
      <Button size="icon" variant="outline" aria-label="Page PDF précédente" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
      <span className="text-xs">{page} / {pages}</span>
      <Button size="icon" variant="outline" aria-label="Page PDF suivante" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
    </div>
    {loading && <p role="status" className="text-xs text-muted-foreground">Chargement du PDF…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <canvas ref={canvas} role="img" aria-label={`Aperçu PDF ${name}`} className="w-full h-auto border rounded" />
  </div>;
}
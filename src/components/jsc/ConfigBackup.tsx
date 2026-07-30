// Export / import complet de la configuration (sauvegarde et restauration).
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Download, Upload, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ConfigBackup({ onImported }: { onImported?: () => void }) {
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportConfig = async () => {
    setBusy("export");
    const { data, error } = await supabase.rpc("jsc_export_config", { _company_id: undefined });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transport-jsc-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Sauvegarde téléchargée.");
  };

  const importConfig = async (file: File) => {
    setBusy("import");
    try {
      const payload = JSON.parse(await file.text());
      const { data, error } = await supabase.rpc("jsc_import_config", {
        _payload: payload,
        _company_id: undefined,
      });
      if (error) throw new Error(error.message);
      toast.success("Configuration importée.", {
        description: JSON.stringify((data as { imported?: unknown })?.imported ?? {}),
      });
      onImported?.();
    } catch (e) {
      toast.error("Import impossible", { description: (e as Error).message });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-semibold">Sauvegarde de la configuration</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Exportez l'ensemble des paramètres (matériaux, prix, fournisseurs, camions, tarifs, taxes,
        zones et réglages) dans un fichier unique, ou réimportez une sauvegarde. L'import est
        transactionnel : en cas d'erreur, aucune donnée n'est modifiée.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={exportConfig} disabled={busy !== null}>
          {busy === "export" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Exporter
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
          {busy === "import" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          Importer
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void importConfig(f); }}
        />
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Le fichier contient des données stratégiques (coûts, marges, notes internes) — à conserver
        en lieu sûr.
      </p>
    </div>
  );
}
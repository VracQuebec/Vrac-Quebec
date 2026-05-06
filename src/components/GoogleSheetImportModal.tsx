import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Download, X, CheckCircle2 } from "lucide-react";

interface Result {
  clients: number;
  entrepreneurs: number;
  payments: number;
  expenses: number;
  skipped: number;
  errors: string[];
}

export default function GoogleSheetImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("import-google-sheet", { body: {} });
      if (error) throw error;
      setResult(data as Result);
      onImported();
      toast({ title: "Import terminé", description: `Clients: ${data.clients} • Entrepreneurs: ${data.entrepreneurs} • Paiements: ${data.payments} • Factures: ${data.expenses}` });
    } catch (e: any) {
      toast({ title: "Erreur d'import", description: e.message || "Échec", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-xl max-w-lg w-full p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-display font-bold">Importer depuis Google Sheet</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-muted-foreground font-body mb-4">
          Lit les 4 onglets du Google Sheet officiel (<strong>Clients</strong>, <strong>Entrepreneurs</strong>, <strong>Paiements</strong>, <strong>Factures 2025</strong>) et insère les données dans le CRM. Les doublons (même courriel/téléphone ou même numéro de facture) sont ignorés automatiquement.
        </p>

        {!result && (
          <button onClick={run} disabled={running}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-600 text-white font-display font-bold hover:opacity-90 disabled:opacity-50">
            {running ? <><Loader2 className="w-5 h-5 animate-spin" /> Import en cours…</> : <><Download className="w-5 h-5" /> Lancer l'import</>}
          </button>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-600 font-display font-bold">
              <CheckCircle2 className="w-5 h-5" /> Import terminé
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm font-body">
              <div className="bg-secondary p-3 rounded"><div className="text-muted-foreground text-xs">Clients (leads)</div><div className="text-2xl font-display font-bold">{result.clients}</div></div>
              <div className="bg-secondary p-3 rounded"><div className="text-muted-foreground text-xs">Entrepreneurs</div><div className="text-2xl font-display font-bold">{result.entrepreneurs}</div></div>
              <div className="bg-secondary p-3 rounded"><div className="text-muted-foreground text-xs">Paiements</div><div className="text-2xl font-display font-bold">{result.payments}</div></div>
              <div className="bg-secondary p-3 rounded"><div className="text-muted-foreground text-xs">Factures</div><div className="text-2xl font-display font-bold">{result.expenses}</div></div>
            </div>
            <div className="text-xs text-muted-foreground font-body">Doublons ignorés : {result.skipped}</div>
            {result.errors.length > 0 && (
              <div className="bg-rose-50 border border-rose-200 p-3 rounded text-xs text-rose-700 font-body">
                <div className="font-bold mb-1">Erreurs :</div>
                <ul className="list-disc pl-4 space-y-1">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </div>
            )}
            <button onClick={onClose} className="w-full px-4 py-2 rounded-lg bg-foreground text-background font-display font-semibold">Fermer</button>
          </div>
        )}
      </div>
    </div>
  );
}
// Historique administrateur des changements de visibilité réseau (lecture seule).
import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, History, Loader2, RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  loadVisibilityAudit,
  visibilityLabel,
  formatAuditDate,
  type VisibilityAuditEntry,
} from "@/lib/parcours/visibilite-audit";

type State =
  | { k: "loading" }
  | { k: "ok"; entries: VisibilityAuditEntry[] }
  | { k: "unauthorized" }
  | { k: "error"; message: string };

const Pill = ({ value }: { value: boolean | null }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
      value === true
        ? "bg-primary/10 text-primary"
        : value === false
          ? "bg-muted text-muted-foreground"
          : "bg-muted text-muted-foreground"
    }`}
  >
    {value === true ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
    {visibilityLabel(value)}
  </span>
);

export default function VisibilityAuditList() {
  const [state, setState] = useState<State>({ k: "loading" });
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setState({ k: "loading" });
    const res = await loadVisibilityAudit();
    if (res.state === "ok") setState({ k: "ok", entries: res.entries });
    else if (res.state === "unauthorized") setState({ k: "unauthorized" });
    else setState({ k: "error", message: res.message });
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
    <section className="mb-6 rounded-lg border border-border bg-card">
      <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${open ? "border-b border-border" : ""}`}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="ghost" className="h-auto justify-start px-0 font-display font-bold">
          <History className="h-4 w-4" /> Historique de visibilité réseau
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        {open && <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
        >
          <RefreshCw className={`h-3 w-3 ${state.k === "loading" ? "animate-spin" : ""}`} /> Actualiser
        </Button>}
      </div>

      <CollapsibleContent className="p-4">
        {state.k === "loading" && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement de l'historique…
          </div>
        )}

        {state.k === "unauthorized" && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Historique réservé aux administrateurs.
          </p>
        )}

        {state.k === "error" && (
          <div className="py-6 text-center text-sm">
            <p className="text-destructive">{state.message}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 rounded-lg border border-input px-3 py-1 text-xs hover:bg-muted"
            >
              Réessayer
            </button>
          </div>
        )}

        {state.k === "ok" && state.entries.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucun changement de visibilité enregistré.
          </p>
        )}

        {state.k === "ok" && state.entries.length > 0 && (
          <ul className="space-y-2">
            {state.entries.map((e) => (
              <li key={e.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-body text-sm font-semibold">
                    {e.company || "Profil sans nom"}
                  </span>
                  <Pill value={e.from} />
                  <span className="text-xs text-muted-foreground">→</span>
                  <Pill value={e.to} />
                </div>
                <p className="mt-1 font-body text-xs text-muted-foreground">
                  {formatAuditDate(e.at)} · {e.actor || "acteur inconnu"}
                </p>
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Détails techniques</summary>
                  <p className="mt-1 break-all">Événement : {e.id}<br />Entrepreneur : {e.entrepreneurId}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleContent>
    </section>
    </Collapsible>
  );
}

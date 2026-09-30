// NAV-01 — Indicateur discret de l'état du brouillon (libellés affichés seulement si la condition est établie).
import { Button } from "@/components/ui/button";
import type { DraftStatus } from "@/lib/drafts/useDraft";

const time = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" }) : "";

export default function DraftStatusBar({ status, savedAt, restored, onDiscard, scope = "cet appareil" }: {
  status: DraftStatus; savedAt: string | null; restored: boolean; onDiscard?: () => void; scope?: string;
}) {
  if (status === "idle" || status === "finalized") return null;
  const text =
    status === "dirty" ? "Modifications en cours…" :
    status === "error" ? "Échec de l'enregistrement sur cet appareil — gardez cette page ouverte" :
    status === "restored" ? `Brouillon repris (enregistré sur ${scope} à ${time(savedAt)})` :
    `Enregistré sur ${scope} à ${time(savedAt)}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary px-3 py-1.5 text-xs" data-testid="draft-status">
      <span role="status" aria-live="polite" className={status === "error" ? "text-destructive" : "text-muted-foreground"}>
        {text}{status !== "error" ? " · brouillon, pas encore envoyé" : ""}
      </span>
      {(restored || status === "saved_local") && onDiscard && (
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { if (window.confirm("Abandonner ce brouillon ? Les informations saisies seront effacées de ce navigateur. Aucune demande déjà envoyée n'est annulée.")) onDiscard(); }}>Abandonner le brouillon</Button>
      )}
    </div>
  );
}

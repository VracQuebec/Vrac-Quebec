// NAV-01 — Indicateur discret de l'état du brouillon (libellés affichés seulement si la condition est établie).
import { Button } from "@/components/ui/button";
import type { DraftStatus, SyncStatus } from "@/lib/drafts/useDraft";

const time = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" }) : "";

export default function DraftStatusBar({ status, savedAt, restored, onDiscard, scope = "cet appareil", sync, synced, conflict, onUseServer, onKeepLocal, onRestartAsNew, restartError, onRetry, discardLabel, discardConfirm }: {
  discardLabel?: string; discardConfirm?: string;
  status: DraftStatus; savedAt: string | null; restored: boolean; onDiscard?: () => void; scope?: string;
  sync?: SyncStatus; synced?: boolean; conflict?: unknown; onUseServer?: () => void; onKeepLocal?: () => void; onRestartAsNew?: () => void; restartError?: string | null; onRetry?: () => void;
}) {
  if (sync === "denied") return <p role="status" className="rounded-md bg-secondary px-3 py-1.5 text-xs text-muted-foreground" data-testid="draft-status">Brouillon non repris : l'accès à cette entreprise n'est plus autorisé pour ce compte.</p>;
  if (sync === "closed") return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary px-3 py-1.5 text-xs text-muted-foreground" data-testid="draft-status" data-sync="closed">
      <span className={status === "error" ? "text-destructive" : undefined}>
        {status === "error"
          ? "Échec de l'enregistrement sur cet appareil : cessez la saisie et reprenez-la dans un nouveau brouillon."
          : `Ce brouillon a été terminé ou abandonné depuis un autre onglet ou appareil. Copie de récupération conservée sur cet appareil seulement (non synchronisée)${savedAt ? ` · ${time(savedAt)}` : ""}.`}
      </span>
      {status === "error" && onRetry && <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onRetry}>Réessayer l'enregistrement</Button>}
      {onRestartAsNew && <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onRestartAsNew}>Reprendre dans un nouveau brouillon</Button>}
      {restartError && <span role="alert" className="w-full text-destructive">{restartError}</span>}
    </div>
  );
  if (status === "idle" || status === "finalized") return null;
  const where = !synced ? `sur ${scope}`
    : sync === "synced" ? "au compte (synchronisé)"
    : sync === "conflict" ? "sur cet appareil — une autre version existe au compte"
    : "sur cet appareil — synchronisation en attente";
  const text =
    status === "dirty" ? "Modifications en cours…" :
    status === "error" ? "Échec de l'enregistrement sur cet appareil : la saisie est bloquée pour ne rien perdre. Votre texte reste affiché — réessayez, ou copiez-le avant de quitter." :
    status === "restored" ? `Brouillon repris (enregistré ${where}${savedAt ? ` · ${time(savedAt)}` : ""})` :
    `Enregistré ${where} à ${time(savedAt)}`;
  return (
    <div className="space-y-1 rounded-md bg-secondary px-3 py-1.5 text-xs" data-testid="draft-status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span role="status" aria-live="polite" className={status === "error" ? "text-destructive" : "text-muted-foreground"} data-sync={sync ?? "local"}>
          {text}{status !== "error" ? " · brouillon, pas encore envoyé" : ""}
        </span>
        {status === "error" && onRetry && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onRetry}>Réessayer l'enregistrement</Button>}
        {(restored || status === "saved_local") && onDiscard && (
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { if (window.confirm(discardConfirm ?? "Abandonner ce brouillon ? Les informations saisies seront effacées. Aucune demande ni opération déjà envoyée n'est annulée.")) onDiscard(); }}>{discardLabel ?? "Abandonner le brouillon"}</Button>
        )}
      </div>
      {!!conflict && sync === "conflict" && (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <span>Deux versions : celle de cet appareil (affichée) et une plus récente au compte. Les deux sont gardées.</span>
          {onUseServer && <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onUseServer}>Prendre la version du compte</Button>}
          {onKeepLocal && <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onKeepLocal}>Garder celle-ci</Button>}
        </div>
      )}
    </div>
  );
}

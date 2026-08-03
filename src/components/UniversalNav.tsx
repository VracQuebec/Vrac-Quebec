import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Home, LayoutDashboard, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { hasUnsavedChanges, subscribeUnsavedChanges } from "@/lib/navigation/unsavedChanges";

const HIDDEN_PATHS = ["/"];

/** Processus (assistants, formulaires) : on propose « Quitter ». */
const PROCESS_PATHS = [
  "/demande-transport",
  "/soumission",
  "/entrepreneur/inscription",
  "/admin/blogue/editer",
];

function parentPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return "/" + parts.slice(0, -1).join("/");
}

export default function UniversalNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const dirty = useSyncExternalStore(subscribeUnsavedChanges, hasUnsavedChanges, () => false);

  const path = location.pathname;
  const isEntrepreneur = path.startsWith("/entrepreneur");
  const isAdmin = path.startsWith("/admin");
  const isProcess = PROCESS_PATHS.some((p) => path.startsWith(p));

  const exitTarget = useMemo(() => {
    if (isAdmin) return "/admin";
    if (isEntrepreneur || path.startsWith("/demande-transport")) return "/entrepreneur";
    return "/";
  }, [isAdmin, isEntrepreneur, path]);

  const goBack = useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate(parentPath(path));
  }, [navigate, path]);

  const doExit = useCallback(() => {
    setConfirmOpen(false);
    navigate(exitTarget);
  }, [navigate, exitTarget]);

  const onExitClick = useCallback(() => {
    if (dirty) setConfirmOpen(true);
    else doExit();
  }, [dirty, doExit]);

  if (HIDDEN_PATHS.includes(path)) return null;

  return (
    <>
      <nav
        aria-label="Navigation universelle"
        className="w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      >
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
          <Button variant="ghost" size="sm" onClick={goBack} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>

          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5">
            <Home className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Accueil</span>
          </Button>

          {(isEntrepreneur || path.startsWith("/demande-transport")) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/entrepreneur")}
              className="gap-1.5"
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Tableau de bord</span>
              <span className="sm:hidden">Tableau</span>
            </Button>
          )}

          {isProcess && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExitClick}
              className="ml-auto gap-1.5"
            >
              <X className="h-4 w-4" />
              Quitter
            </Button>
          )}
        </div>
      </nav>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitter sans enregistrer&nbsp;?</AlertDialogTitle>
            <AlertDialogDescription>
              Des informations saisies ne sont pas encore envoyées. Si vous quittez maintenant,
              elles pourraient être perdues.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuer ma saisie</AlertDialogCancel>
            <AlertDialogAction onClick={doExit}>Quitter quand même</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

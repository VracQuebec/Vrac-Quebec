import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCcw, Truck } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

const RELOAD_KEY = "__chunk_reload_attempted__";

function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const msg = (error as Error)?.message ?? String(error);
  const name = (error as Error)?.name ?? "";
  return (
    name === "ChunkLoadError" ||
    /Importing a module script failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erreur d’affichage interceptée", error, info);
    if (isChunkLoadError(error)) {
      try {
        const already = sessionStorage.getItem(RELOAD_KEY);
        if (!already) {
          sessionStorage.setItem(RELOAD_KEY, "1");
          window.location.reload();
          return;
        }
      } catch {
        window.location.reload();
      }
    } else {
      try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* noop */ }
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <div className="flex items-center justify-center gap-2 mb-5">
            <Truck className="w-7 h-7 text-primary" />
            <span className="font-display font-bold text-xl text-foreground">
              Vrac<span className="text-primary">Québec</span>
            </span>
          </div>
          <h1 className="font-display font-bold text-xl text-foreground">La page se recharge</h1>
          <p className="mt-2 text-sm text-muted-foreground font-body">
            Une erreur temporaire a été détectée. Rechargez la page pour reprendre votre session.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-display font-bold text-primary-foreground"
          >
            <RefreshCcw className="w-4 h-4" />
            Recharger
          </button>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
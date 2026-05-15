import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCcw, Truck } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erreur d’affichage interceptée", error, info);
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
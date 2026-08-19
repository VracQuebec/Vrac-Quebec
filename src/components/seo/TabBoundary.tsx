import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Loader2, RefreshCcw } from "lucide-react";

function TabLoading() {
  return (
    <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Chargement du module…
    </div>
  );
}

type Props = { children: ReactNode; label: string; onRetry: () => void };
type State = { error: Error | null };

class TabErrorCatcher extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[SEO CRM] Échec du module « ${this.props.label} »`, error, info);
  }

  componentDidUpdate(prev: Props) {
    if (prev.label !== this.props.label && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <h2 className="font-display font-bold text-foreground">
              Le module « {this.props.label} » n'a pas pu s'afficher
            </h2>
            <p className="mt-1 text-sm text-muted-foreground font-body">
              Les autres onglets restent utilisables. Détail technique&nbsp;:
            </p>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background/70 p-2 text-xs font-mono text-muted-foreground">
              {error.message || String(error)}
            </pre>
            <button
              onClick={() => { this.setState({ error: null }); this.props.onRetry(); }}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-display font-semibold text-primary-foreground"
            >
              <RefreshCcw className="h-4 w-4" /> Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default function TabBoundary({ children, label, onRetry }: Props) {
  return (
    <TabErrorCatcher label={label} onRetry={onRetry}>
      <Suspense fallback={<TabLoading />}>{children}</Suspense>
    </TabErrorCatcher>
  );
}

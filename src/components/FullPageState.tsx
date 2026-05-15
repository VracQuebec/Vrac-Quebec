import { Loader2, Truck } from "lucide-react";

interface FullPageStateProps {
  title?: string;
  message?: string;
  showSpinner?: boolean;
}

const FullPageState = ({
  title = "Chargement en cours",
  message = "Merci de patienter quelques secondes.",
  showSpinner = true,
}: FullPageStateProps) => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 text-center">
      <div className="max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-5">
          <Truck className="w-7 h-7 text-primary" />
          <span className="font-display font-bold text-xl text-foreground">
            Vrac<span className="text-primary">Québec</span>
          </span>
        </div>
        {showSpinner && <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />}
        <h1 className="font-display font-bold text-xl text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground font-body">{message}</p>
      </div>
    </div>
  );
};

export default FullPageState;
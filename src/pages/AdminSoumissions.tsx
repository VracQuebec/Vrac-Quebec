// ============================================================
// Soumissions — vue dédiée, alimentée par le composant unique
// QuotesBoard (même source de vérité que le panneau d'administration).
// ============================================================
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { useUserRoles } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import QuotesBoard from "@/components/jsc/QuotesBoard";

export default function AdminSoumissions() {
  const { user, isReady, isAuthenticated } = useAuthReady();
  const { isAdmin, loading: rolesLoading } = useUserRoles(user, isReady);

  if (!isReady || rolesLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!isAuthenticated || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">
        Accès réservé aux administrateurs.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-8">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link to="/admin"><ArrowLeft className="mr-2 h-4 w-4" /> Administration</Link>
        </Button>
        <QuotesBoard />
      </div>
    </div>
  );
}

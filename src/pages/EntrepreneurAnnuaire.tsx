// Réseau professionnel — réservé aux administrateurs.
// Confidentialité : un entrepreneur ne doit pas pouvoir découvrir les autres
// entreprises inscrites. La route reste en place pour les administrateurs ;
// tout autre compte reçoit un refus et aucune donnée n'est chargée.
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import AnnuaireList from "@/components/entrepreneur/AnnuaireList";
import { Link } from "react-router-dom";
import { ChevronRight, Lock, Users } from "lucide-react";
import { useUserRoles } from "@/hooks/useUserRole";

const EntrepreneurAnnuaire = () => {
  const { isAdmin, loading } = useUserRoles();

  return (
    <EntrepreneurAppShell
      title="Réseau professionnel"
      subtitle={isAdmin ? "Entreprises du réseau Vrac Québec" : "Section réservée"}
      backTo="/entrepreneur"
    >
      <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-5 sm:px-6 space-y-5">
        {loading ? (
          <p className="font-body text-sm text-muted-foreground">Chargement…</p>
        ) : !isAdmin ? (
          <section className="flex items-start gap-3 rounded-3xl border border-border/70 bg-card p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
              <Lock className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-extrabold leading-tight">
                Section non disponible
              </h2>
              <p className="mt-1 font-body text-sm text-muted-foreground">
                L'annuaire des entreprises n'est pas accessible depuis votre espace. Vos propres
                informations restent disponibles dans « Mon entreprise ».
              </p>
              <Link
                to="/entrepreneur/compte"
                className="mt-1 inline-flex min-h-[44px] items-center gap-1 py-2 font-display text-sm font-bold text-primary"
              >
                Aller à Mon entreprise <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        ) : (
          <>
            <section className="flex items-start gap-3 rounded-3xl border border-border/70 bg-gradient-to-br from-primary/10 via-card to-card p-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-lg font-extrabold leading-tight">
                  Annuaire interne (administration)
                </h2>
                <p className="mt-1 font-body text-sm text-muted-foreground">
                  Identité professionnelle publique uniquement. Aucune coordonnée privée n'est
                  partagée.
                </p>
              </div>
            </section>
            <AnnuaireList />
          </>
        )}
      </div>
    </EntrepreneurAppShell>
  );
};

export default EntrepreneurAnnuaire;

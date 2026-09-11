// Réseau professionnel — annuaire public des entreprises du réseau.
import EntrepreneurAppShell from "@/components/entrepreneur-app/EntrepreneurAppShell";
import AnnuaireList from "@/components/entrepreneur/AnnuaireList";
import { Users } from "lucide-react";

const EntrepreneurAnnuaire = () => (
  <EntrepreneurAppShell
    title="Réseau professionnel"
    subtitle="Entreprises du réseau Vrac Québec"
    backTo="/entrepreneur"
  >
    <div className="mx-auto w-full min-w-0 max-w-3xl px-4 py-5 sm:px-6 space-y-5">
      <section className="flex items-start gap-3 rounded-3xl border border-border/70 bg-gradient-to-br from-primary/10 via-card to-card p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Users className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-extrabold leading-tight">
            Qui travaille près de vous
          </h2>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            Identité professionnelle publique uniquement. Aucune coordonnée privée n'est partagée.
          </p>
        </div>
      </section>
      <AnnuaireList />
    </div>
  </EntrepreneurAppShell>
);

export default EntrepreneurAnnuaire;

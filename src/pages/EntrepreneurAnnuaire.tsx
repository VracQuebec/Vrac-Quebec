import EntrepreneurShell from "@/components/EntrepreneurShell";
import AnnuaireList from "@/components/entrepreneur/AnnuaireList";

const EntrepreneurAnnuaire = () => (
  <EntrepreneurShell
    title="Réseau des entrepreneurs"
    description="Découvrez les entreprises du réseau : identité professionnelle publique uniquement."
  >
    <AnnuaireList />
  </EntrepreneurShell>
);

export default EntrepreneurAnnuaire;

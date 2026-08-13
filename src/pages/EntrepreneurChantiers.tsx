import EntrepreneurShell from "@/components/EntrepreneurShell";
import MesChantiersList from "@/components/entrepreneur/MesChantiersList";

const EntrepreneurChantiers = () => (
  <EntrepreneurShell
    title="Mes chantiers"
    description="Vos chantiers regroupent vos demandes existantes par lieu de travail."
  >
    <MesChantiersList />
  </EntrepreneurShell>
);

export default EntrepreneurChantiers;
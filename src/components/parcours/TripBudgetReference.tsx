/**
 * Encadré explicatif affiché sur la page de confirmation, juste avant la question
 * du montant. Ces montants viennent des références fournies par l'équipe Vrac Québec :
 * ils servent uniquement de point de comparaison et ne changent aucun calcul,
 * aucun tarif, aucun statut ni aucune priorité.
 */

const REFERENCE_TRUCK = "camion 12 roues";

const EXAMPLES: { material: string; amount: string }[] = [
  { material: "Terre noire tamisée", amount: "458,25 $" },
  { material: "Sable", amount: "518,75 $" },
  { material: "Gravier 0–¾", amount: "498,50 $" },
  { material: "Pierre ¾ net", amount: "678,75 $" },
];

export default function TripBudgetReference() {
  return (
    <section
      aria-labelledby="vq-ref-title"
      className="mt-5 rounded-xl border border-border bg-muted/40 p-4 text-left sm:p-5"
    >
      <h3 id="vq-ref-title" className="font-display text-lg font-bold text-foreground">
        Un voyage livré, ça représente quelle valeur?
      </h3>

      <p className="mt-2 font-body text-sm leading-relaxed text-muted-foreground">
        Pour vous donner un point de comparaison, voici des exemples de prix pour un chargement
        livré en {REFERENCE_TRUCK}, selon les références fournies par l’équipe Vrac Québec :
      </p>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {EXAMPLES.map((example) => (
          <li key={example.material} className="rounded-lg border border-border bg-background px-3 py-2.5">
            <span className="block font-body text-sm text-muted-foreground">{example.material}</span>
            <span className="mt-0.5 block font-display text-base font-bold text-foreground">
              {example.amount}{" "}
              <span className="font-body text-xs font-normal text-muted-foreground">/ voyage livré</span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 font-body text-xs leading-relaxed text-muted-foreground">
        Ces montants comprennent la livraison dans les conditions de référence de l’équipe. Ils
        sont indicatifs : le prix applicable à votre adresse dépend notamment de la distance, de la
        quantité et des conditions d’accès. Ils ne constituent pas une soumission.
      </p>

      <p className="mt-3 rounded-lg border border-border bg-background px-3 py-2.5 font-body text-xs leading-relaxed text-foreground">
        <span className="font-display font-bold">Repère pour le transport :</span> à partir de
        150 $/heure. La durée facturable dépend du trajet et des opérations nécessaires. Ce tarif
        ne s’ajoute pas une deuxième fois aux exemples ci-dessus, qui sont déjà livrés.
      </p>

      <p className="mt-3 font-body text-sm leading-relaxed text-muted-foreground">
        Le remblai provenant d’un chantier peut être disponible sans frais pour le matériau, mais
        son transport représente tout de même un coût. Une contribution par voyage peut aider à
        couvrir une partie de ce transport et rendre votre demande plus intéressante pour les
        entrepreneurs.
      </p>

      <p className="mt-3 border-t border-border pt-3 font-body text-xs leading-relaxed text-muted-foreground">
        Le remblai d’excavation peut différer des matériaux achetés présentés ici. Il ne s’agit pas
        d’une promesse de recevoir de la terre noire tamisée, du sable ou de la pierre de qualité
        commerciale. Les matériaux doivent convenir à votre projet.
      </p>
    </section>
  );
}

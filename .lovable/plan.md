# Fournisseurs et catégories : privés d'abord, partagés après accord du Super Admin

## Ce qui existe déjà
- Un entrepreneur peut déjà créer ses propres fournisseurs et ses catégories de dépenses dans Finances. Ils restent dans son entreprise seulement. Rien ne change ici.
- Exception à corriger : les noms d'équipement ajoutés dans « Ma flotte » (« Autre équipement ») sont visibles tout de suite par tout le monde. Avec la nouvelle règle, ils resteront privés jusqu'à l'accord du Super Admin.

## Ce qui sera ajouté
1. **Proposer au catalogue commun** : un bouton sur la fiche d'un fournisseur, d'une catégorie de dépense ou d'un équipement personnalisé. L'élément reste utilisable tout de suite dans sa propre entreprise.
2. **Validation Super Admin** : une page « Catalogue commun — propositions » permet d'approuver, de corriger le nom puis d'approuver, ou de refuser avec un motif. Une notification admin arrive à chaque nouvelle proposition.
3. **Utilisation par les autres entrepreneurs** : les éléments approuvés apparaissent comme suggestions (« Catalogue commun »). Le choix d'un fournisseur commun crée une copie dans l'entreprise qui le choisit, en passant par la création de fournisseur actuelle. Chaque entreprise garde ses propres fiches, comptes et soldes.
4. **Ce qui n'est jamais partagé** : le numéro de compte client chez le fournisseur, les notes, les factures, les soldes et les contacts privés. Seuls le nom, la catégorie et les coordonnées publiques (site web, téléphone général, ville) sont partagés.

## Détails techniques
- Nouvelle table `shared_catalog_items` (kind : supplier | expense_category | unit_category; name, payload jsonb limité aux champs publics, source_company_id, source_id, status : proposed | approved | rejected, decided_by/at, reason). Elle est écrite seulement par les fonctions `catalog_propose` (membre de l'entreprise source, proposition unique par élément et nom normalisé), `catalog_decide` (has_role admin) et `catalog_adopt` (copie via `fin_supplier_save` ou dans les catégories de l'entreprise, protection contre les doublons). Lecture : éléments approuvés pour les utilisateurs connectés, tout pour l'admin, ses propres propositions pour l'entreprise source.
- `fleet_unit_categories_custom` : ajout de `company_id` et `status` (« approved » par défaut pour les lignes existantes, « private » pour les nouvelles). Lecture limitée à « approved » + sa propre entreprise. Approbation via le même catalogue. Aucune donnée existante supprimée.
- Notification : insertion dans `crm_notifications` (source unique existante).
- Aucun changement aux règles Finances existantes (FIN-12A : le fournisseur reste une fiche par entreprise). La règle est ajoutée au fichier des règles Finances.
- Tests : proposition, refus, approbation, adoption sans doublon, isolation entre entreprises, aucun champ privé partagé. TEST seulement, aucune publication.

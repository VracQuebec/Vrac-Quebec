# Ronde de sécurité (Gestion de flotte, espace entrepreneur)

Basé sur le référentiel fourni (recherche du 2 octobre 2026). TEST seulement, rien de publié, aucun envoi réel.

## Livré en 3 lots

**Lot 1 — Référentiel et profil du véhicule**
- Les 3 listes officielles chargées telles quelles (Liste 1 : 85 codes, Liste 2 : 92, Liste 3 : 68), dans leur ordre prescrit, consultables en tout temps (« Liste officielle »), avec la version et la date de consolidation.
- Profil du véhicule complété : type, PNBV, liste applicable (proposée, jamais imposée), freins (pneumatiques / hydrauliques / électriques), attelage, essieux, équipements exigés (trousse, extincteur), équipements vrac (benne, hayon, toile, levage, prise de force) et déneigement.
- Ensemble du jour : tracteur + remorque(s); toutes les unités d'un ensemble assujetti sont à inspecter.

**Lot 2 — Faire la ronde sur téléphone**
- Seuls les systèmes applicables au véhicule s'affichent; chaque point : Conforme / Défectuosité / Sans objet (justification), rien de précoché.
- Choix du code guidé par les précisions nécessaires (côté conducteur/passager, simple/jumelé, essieu directeur, accouplé ou non, pourcentage de fixations, nombre de feux, dernière unité).
- Rapport avec tous les renseignements obligatoires (plaque/unité, exploitant, date/heure, lieu, odomètre, défauts ou « aucune défectuosité », nom lisible, déclaration signée), photo facultative.
- Signature liée à la personne, à son rôle et à la version du rapport; rapport figé après signature, correction = nouvelle version tracée. Contresignature d'un autre conducteur sans prolonger les 24 h.
- Défaut constaté en cours de route.
- Brouillon conservé si le réseau coupe; heure réelle de la ronde conservée.

**Lot 3 — Suivi, réparations, tableau de bord**
- Classement (mineur/majeur) séparé du statut de circulation : majeure = départ interdit immédiatement + alerte; mineure = échéance de 48 h depuis le premier constat (jamais remise à zéro), échue = interdiction de circuler, sans devenir une majeure.
- Ronde valide 24 h; véhicule sans ronde valide signalé.
- Chaque défaut crée une intervention dans l'entretien déjà en place; blocage levé seulement après réparation validée (auteur, date, preuve).
- Signature de l'exploitant sur les rapports avec défauts, horodatages distincts (constat, transmission, accusé, réparation, validation).
- Tableau de bord : rondes valides, à renouveler, mineures ouvertes et échéances, véhicules interdits de départ, réparations à faire. Historique par véhicule, date, conducteur, code, état. Rapport imprimable / PDF.
- Conservation : rondes 6 mois minimum, réparations 12 mois minimum — jamais de suppression.
- Accès selon le poste, cloisonnés par entreprise; aussi visible dans le super admin.

## Hors périmètre de ces lots
- Application hors connexion complète (un brouillon local est fait; une vraie application installable plus tard).
- Listes 2 et 3 : consultables, mais le parcours guidé vise d'abord les camions (Liste 1).
- Vérification mécanique périodique et vérification des autocars aux 30 jours.
- Le blocage est informatique, pas une immobilisation physique; la version réglementaire doit être revérifiée avant la mise en ligne.

## Détails techniques
- Réutiliser fleet_inspections / fleet_inspection_templates / fleet_repairs / fleet_maintenance et src/lib/fleet/api.ts; nouvelles tables de référentiel (codes, catégories, conditions) en lecture seule, chargées par migration.
- Écritures par fonctions serveur seulement (signature, version, statut de circulation, échéance 48 h calculée côté serveur, fuseau America/Toronto affiché, UTC stocké).
- Essais : 1280 et 390 px, double clic, lecture seule, autre entreprise TEST.

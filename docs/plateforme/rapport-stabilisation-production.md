# Rapport de stabilisation — Vrac Québec (production)

Date : 2026-08-05
Portée : correctifs techniques et d'architecture uniquement.
**Aucune règle d'affaires modifiée** (carrières assignées, cycle de voyages,
temps minimum facturable, tarifs, matériaux, arrondis).

## 1. Pipeline SEO
- Cause du plantage : `sb.rpc(...).catch()` — le constructeur PostgREST n'expose
  pas `.catch`. Remplacé par `.then(onSuccès, onÉchec)`.
- Tâches planifiées en double supprimées (2 tâches redondantes exécutées chaque minute).
- Fonctions redéployées : la version en ligne correspond au code source.
- Vérification : plus aucune erreur dans les journaux depuis le redéploiement.

## 2. Endpoints publics sécurisés
Nouveau module partagé `public-guard.ts`, branché sur `quote-submit` :
- champ piège anti-robot (invisible dans le formulaire) ;
- contrôle du délai humain (envoi instantané refusé) ;
- filtre anti-pourriel (liens multiples, HTML injecté, mots-clés) ;
- limiteur de requêtes : 5 demandes / heure par courriel et par adresse IP ;
- déduplication : une demande identique dans les 30 minutes renvoie la
  soumission existante, sans nouveau calcul, sans doublon CRM, sans nouveau courriel ;
- journal `public_request_guard` (consultable par les administrateurs).

Tests réels : robot bloqué (`bot_detected`), soumission valide acceptée,
renvoi identique reconnu comme doublon.

## 3. Moteur de calcul unique
- Un seul moteur : `runCarrierQuote` (Transport JSC, `jsc-1.3.0`).
- Supprimés : anciens moteurs « décision » et « calcul », modules routing et
  financier, ainsi que les fonctions `quote-trips`, `quote-financial`, `quote-prepare`.
- `quote-engine`, `quote-assistant` et `quote-submit` passent tous par le même moteur.
- Point d'entrée unique : `_shared/vqos/index.ts`.

## 4. Prix : une seule source de vérité
- La grille de prix (`jsc_material_prices`) est désormais la seule source lue
  par le moteur ; les montants existants ont été repris à l'identique.
- Synchronisation automatique depuis la fiche matériau pour l'administration.
- Erreur explicite si un matériau n'a pas de prix dans la grille.

## 5. Gestion des erreurs
- Un échec d'envoi de courriel retourne une vraie erreur (502) : plus jamais
  de `ok:true` masquant un échec.
- Journalisation détaillée et préfixée de chaque étape et de chaque échec.
- Clés d'idempotence conservées pour empêcher tout envoi multiple.

## 6. Nettoyage
- Code mort supprimé (moteurs, fonctions, documentation obsolète).
- Fonctions internes de la base : accès public révoqué (265 → avertissements
  résiduels uniquement sur les fonctions volontairement publiques :
  catalogue, blogue, dompes publiques, contrôles de droits).

## 7. Validation finale
- Tests automatisés : **21 / 21 réussis** (moteur unique, arrondis, taxes,
  minimum facturable, source des prix, protections publiques).
- Vérification des types : aucune erreur.
- Google Maps : soumission réelle calculée (27,12 km, 2 voyages, 12 roues,
  total 919,75 $) — géocodage et itinéraires opérationnels.
- Soumission complète testée de bout en bout : CRM, numérotation, courriels,
  notifications. Données de test archivées.

**Conclusion : la plateforme est stable et prête pour la production.**

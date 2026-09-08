# Feuille de route — Vrac Québec

## En cours
- [ ] Optimisation responsive complète (site public, CRM, administration)
  - [x] Audit automatisé des débordements horizontaux (site public : aucun débordement global)
  - [x] En-tête central responsive (Retour / Accueil / titre) + safe areas
  - [x] Onglets, tableaux, cartes, modales, boutons : règles centrales
  - [x] Tests multi-largeurs 375 → 1440 px (pages publiques)
  - [ ] Validation visuelle des pages administration (nécessite une session admin autorisée)

## Fait
- [x] Moteur d'optimisation SEO en lot
  - [x] File d'attente persistée (en attente / en cours / optimisée / ignorée / erreur)
  - [x] « Optimiser la sélection » et « Optimiser en lot » en un seul clic
  - [x] Retry automatique borné, concurrence contrôlée, anti-doublons
  - [x] Reprise après interruption par le surveillant automatique (chaque minute)
  - [x] Une page en erreur ne bloque plus la file; le traitement se clôt tout seul
  - [x] Compteurs recalculés depuis l'état réel des pages
  - [x] Point d'entrée unique (l'ancien traitement séquentiel a été retiré)

## Contrôle qualité final (responsive + moteur SEO)
- [x] CRM : en-tête, onglets défilants, barre de filtres et bouton « Nouveau » adaptés au mobile
- [x] Centre d'optimisation SEO : barre d'outils et boutons « Optimiser » utilisables sur téléphone
- [x] Moteur SEO en lot vérifié (toutes les fonctions de file, contrôle, reprise et historique présentes)
- [x] Tests : 414 tests passés, compilation sans erreur, aucune barre de défilement horizontale à 375/430/768/1024/1440
- [ ] Validation visuelle des pages d'administration connectées (nécessite une connexion de votre part)

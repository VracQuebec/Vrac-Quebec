# Débloquer toutes les municipalités dans le générateur SEO

## Objectif
Faire du registre territorial CRM la source de vérité de bout en bout : les 162 municipalités actives doivent être visibles, évaluables et sélectionnables dans le générateur, sans privilégier les 56 villes historiques et sans génération automatique.

## Mise en œuvre
1. **Corriger l’éligibilité côté base**
   - Remplacer les filtres historiques `active AND served` dans la matrice, le centre de pilotage et le démarrage du pipeline par une sélection des municipalités actives réellement liées au registre territorial.
   - Conserver les 26 anciennes entrées hors registre et leurs 1 568 pages, mais les exclure des nouvelles générations automatiques sauf sélection explicite autorisée.
   - Valider côté serveur qu’une ville demandée appartient bien à une municipalité CRM active avant toute nouvelle création.

2. **Ajouter l’évaluation d’opportunité**
   - Calculer une opportunité par ville à partir des demandes réellement rattachées : volume de demandes, types de services et matériaux observés.
   - Retourner les services, matériaux et usages pertinents avec une raison vérifiable; afficher « Aucune opportunité SEO identifiée » lorsqu’aucun signal n’existe.
   - Détecter les pages existantes par leurs dimensions réelles (ville/service/matériau/usage), sans dépendre seulement du slug.

3. **Refondre le générateur contrôlé**
   - Charger toutes les municipalités actives via la source CRM synchronisée, y compris celles sans page.
   - Permettre la sélection Ville + Service + Matériau + Usage.
   - Afficher les états : page existante, page à créer, brouillon, à réviser, aucune opportunité.
   - Ajouter un aperçu de lot indiquant villes, combinaisons pertinentes, pages existantes, nouvelles propositions et rejets avec leurs raisons.
   - Exiger une action explicite pour créer; aucune génération globale ou publication automatique.

4. **Sécuriser la création**
   - Faire créer toute nouvelle page en brouillon/non indexable, jamais publiée automatiquement.
   - Ne jamais écraser une page existante sans confirmation explicite.
   - Préserver les URLs, contenus et historiques existants; empêcher les doublons.

5. **Propager la nouvelle source**
   - Corriger les suggestions, matrices, statistiques, filtres et pipelines qui dépendent encore de `served`, d’une limite ou de villes ayant déjà des pages.
   - Garder les pages publiques et le sitemap fondés uniquement sur les pages réellement publiées, sans élargissement artificiel.

## Validation
- Comparer les comptes CRM, SEO Manager, villes générables, historiques/nouvelles, pages et doublons.
- Tester dans l’interface au moins trois nouvelles municipalités avec demandes réelles : sélection, services, matériaux, opportunité et statut.
- Créer exactement trois brouillons de test pertinents, puis vérifier title, H1, meta, canonical, contenu, statut brouillon et non-indexation; aucune publication.
- Vérifier qu’une ville historique fonctionne encore, que ses pages restent inchangées et qu’aucune ville CRM active n’est bloquée.
- Exécuter les tests ciblés, le contrôle TypeScript et un parcours navigateur complet, puis consigner les chiffres exacts dans le rapport final.

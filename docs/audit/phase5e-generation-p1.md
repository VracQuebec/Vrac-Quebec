# Phase 5E — Génération SEO des 10 pages P1 (brouillons, non publiés)

> Seules les 10 pages P1 du rapport 5D (section 10) ont été créées. Aucune P2, aucune page « À valider », aucune nouvelle combinaison. Publication : NON.

## Méthode

- Structure existante réutilisée : table des pages locales du SEO Manager, même format d'URL `/remblai-<ville>`, famille `remblai`, mêmes champs (title, meta, H1, intro, contenu, FAQ, liens internes, mots-clés, og).
- Statut : **brouillon** (`draft`), le statut de travail déjà utilisé par le SEO Manager. `published_at` vide. Les brouillons ne sont pas affichés sur le site public (la page publique ne lit que les pages publiées) et ne sont pas dans le sitemap.
- Repère : `wave = phase5e-p1` pour retrouver ces 10 pages.
- Contenu rédigé à partir des seules données réelles : types de projets inscrits dans chaque ville (remplissage, rehaussement, trou à remplir, fondation légère, nivellement, entrée, terre tamisée) et matériaux mentionnés dans ces demandes. Aucun client, adresse, nombre de demandes, prix, délai, distance, fournisseur ou transporteur n'est affiché.
- Région/MRC absentes des données pour ces villes : non mentionnées plutôt qu'inventées.
- Formulation de recherche uniquement (« Vrac Québec peut vous aider à rechercher une solution de remblai ou un site qui accepte votre matériau »); disponibilité, transport et prix explicitement non garantis d'avance.
- Distinction avec la page dompe existante de chaque ville : section « Remblai ou dompe : quelle page consulter? » et lien vers la page dompe.

## Pages créées

| # | Ville | Classe 5D | Type | URL | Statut | Title (meta) | H1 | Mots | FAQ | Liens internes | Liens cassés | CTA | Promesse non vérifiée |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | beaumont | B | remblai (matériau) | `/remblai-beaumont` | brouillon | Remblai à Beaumont | Vrac Québec | Remblai à Beaumont : trouver une solution pour votre projet | 652 | 4 | 11 | 0 | oui | aucune |
| 2 | saint-antoine-de-tilly | B | remblai (matériau) | `/remblai-saint-antoine-de-tilly` | brouillon | Remblai à Saint-Antoine-de-Tilly | Vrac Québec | Remblai à Saint-Antoine-de-Tilly : trouver une solution pour votre projet | 589 | 4 | 10 | 0 | oui | aucune |
| 3 | saint-georges | B | remblai (matériau) | `/remblai-saint-georges` | brouillon | Remblai à Saint-Georges | Vrac Québec | Remblai à Saint-Georges : trouver une solution pour votre projet | 580 | 5 | 6 | 0 | oui | aucune |
| 4 | saint-henri | B | remblai (matériau) | `/remblai-saint-henri` | brouillon | Remblai à Saint-Henri | Vrac Québec | Remblai à Saint-Henri : trouver une solution pour votre projet | 728 | 4 | 10 | 0 | oui | aucune |
| 5 | saint-isidore | A | remblai (matériau) | `/remblai-saint-isidore` | brouillon | Remblai à Saint-Isidore | Vrac Québec | Remblai à Saint-Isidore : trouver une solution pour votre projet | 724 | 5 | 9 | 0 | oui | aucune |
| 6 | saint-tite-des-caps | B | remblai (matériau) | `/remblai-saint-tite-des-caps` | brouillon | Remblai à Saint-Tite-des-Caps | Vrac Québec | Remblai à Saint-Tite-des-Caps : trouver une solution pour votre projet | 696 | 5 | 10 | 0 | oui | aucune |
| 7 | sainte-henedine | B | remblai (matériau) | `/remblai-sainte-henedine` | brouillon | Remblai à Sainte-Hénédine | Vrac Québec | Remblai à Sainte-Hénédine : trouver une solution pour votre projet | 692 | 4 | 11 | 0 | oui | aucune |
| 8 | sainte-marie | B | remblai (matériau) | `/remblai-sainte-marie` | brouillon | Remblai à Sainte-Marie | Vrac Québec | Remblai à Sainte-Marie : trouver une solution pour votre projet | 748 | 5 | 10 | 0 | oui | aucune |
| 9 | scott | B | remblai (matériau) | `/remblai-scott` | brouillon | Remblai à Scott | Vrac Québec | Remblai à Scott : trouver une solution pour votre projet | 591 | 4 | 9 | 0 | oui | aucune |
| 10 | trois-rivieres | B | remblai (matériau) | `/remblai-trois-rivieres` | brouillon | Remblai à Trois-Rivières | Vrac Québec | Remblai à Trois-Rivières : trouver une solution pour votre projet | 659 | 5 | 9 | 0 | oui | aucune |

## Validation page par page

- **URL** : 10/10 au format existant, aucune n'existait avant création (vérifié contre les 2 084 pages), aucune URL existante modifiée.
- **Title / meta description / H1** : 10 titres et 10 descriptions uniques; descriptions de 148 à 160 caractères; H1 = ville correcte.
- **Ville et intention** : ville correcte dans chaque page; intention = remblai. Les seules autres villes nommées sont la ville voisine visée par un lien « Remblai à … » vers une page publiée, et le nom de marque « Vrac Québec ».
- **CTA** : lien vers `/soumission` dans chaque page.
- **Liens internes** : 6 à 11 par page, **0 lien cassé** (page dompe, page ville, pages matériaux publiées de la même ville, remblai d'une ville voisine publiée, `/remblai`, `/calculateur`, `/soumission`). Saint-Georges n'a pas de lien vers une ville voisine : aucune ville desservie à proximité raisonnable.
- **Canonical** : générée automatiquement par la page publique à partir de l'URL de la page (aucune canonical manuelle) → `https://vracquebec.ca/remblai-<ville>` lors d'une future publication.
- **Données structurées** : celles du gabarit existant uniquement; aucune ajoutée.
- **Promesses** : recherche automatique des expressions « transport disponible », « livraison disponible », « nous livrons », « dompe(s) disponible(s) », « nous desservons », « garanti » : **0 occurrence**.
- **Doublons** : aucun; une seule page par URL.
- **Contenu générique** : paragraphes composés selon les projets et matériaux réels de chaque ville, avec variantes de formulation. Ressemblance mesurée entre deux pages : moyenne 0.46, maximum 0.65 (les pages partagent volontairement la FAQ de base et la mise en garde sur la propreté du remblai).
- **Rendu** : HTML de chaque page analysé sans erreur. Les brouillons ne s'affichent pas sur le site public par conception; le rendu final à l'écran sera visible à la publication.

## Problèmes éventuels

1. **Longueur** : 580 à 748 mots, sous le seuil « indexable ≥ 800 mots » du tableau de couverture. Allonger exigerait d'inventer des faits locaux; à compléter seulement avec de vraies informations (ex. contraintes municipales confirmées).
2. **Ressemblance** : maximum 0,65 entre deux pages de villes aux projets proches (Saint-Tite-des-Caps / Scott / Saint-Antoine-de-Tilly). Acceptable pour des brouillons, à relire avant publication.
3. **Cannibalisation remblai vs dompe** : non listée parmi les 5 paires de la Phase 5A, mais chaque ville a déjà une page dompe; intentions séparées et lien croisé ajouté sur la nouvelle page seulement (page dompe non modifiée).
4. Pour enregistrer le texte final, l'outil s'est connecté avec le compte administrateur transportjsc@hotmail.com; seules ces 10 pages brouillons ont été touchées.

## Pages non créées et pourquoi

- Les 35 P2 : hors périmètre de cette phase.
- Les 16 pages « À valider » (dont 4 P1 : transport en vrac et point de dépôt, ou villes C) : service transport non configuré / intention à valider.
- Aucune P1 bloquée par une URL existante.

---
Demandes, transports, voyages, dompes, flotte, CRM, comptes : NON modifiés · RLS / permissions / authentification : NON · Nouvelle table : NON · Pages existantes modifiées : NON · URLs modifiées : NON · Pages créées : 10 brouillons · Publication : NON

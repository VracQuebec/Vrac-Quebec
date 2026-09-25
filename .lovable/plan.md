# CATALOGUE-03 — Raccordements, estimation client, preuve complète

Suite directe de CATALOGUE-02B (82 matériaux, 91 variantes, 109 synonymes, 6 variantes tarifées historiques). Aucune publication, aucun prix inventé, aucun courriel réel.

## Lot A — Raccorder les modules restants au référentiel central
- Offres de matériaux, fiches fournisseurs/entrepreneurs, filtres de carte, matching et interpréteur lisent `material_catalog` + `material_variants` (via le catalogue public ou une lecture admin) au lieu des listes figées.
- Table de correspondance explicite pour les variantes commerciales historiques (`jsc_materials` → variante centrale), tarifs conservés.
- Expression ambiguë : proposition « à vérifier », jamais une variante confirmée.
- Test : sauvegarde → rechargement de l’identifiant (pas seulement du nom).

## Lot B — Remblai et matching
- Le sélecteur central devient la saisie principale ; les 13 anciens choix deviennent des raccourcis qui cochent des matériaux du même sélecteur.
- Couche de correspondance anciennes données → référentiel, dans le moteur actuel (aucun moteur parallèle, aucun drapeau désactivé activé).
- Ancienne sélection générale ≠ acceptation des nouveaux sous-types ; refus explicites conservés ; matériau inconnu → état « incertain » avec motif.
- Vérifié : formulaire → sauvegarde → fiche CRM → matching → carte, avec un matériau hors des 13 choix.

## Lot C — Estimation client alignée sur le serveur
- Retrait de la conversion voyages → tonnes par camion de référence dans l’achat Vrac.
- L’écran utilise uniquement le calcul serveur (mêmes règles d’unités) ; « Livraison à confirmer » quand le transport n’est pas calculable.
- Annulation des réponses périmées (jeton de requête) et effacement du prix à tout changement de matériau, variante, quantité, unité ou adresse.
- Détail : quantité/unité, prix unitaire, matériau, transport, frais, taxes, total ; distinction prix de vente / coût + marge.

## Lot D — Démonstration sans courriel réel
- Séparer la « remise » de la soumission (changement de statut + document figé) de l’envoi externe ; mode capture pour destinataires de test (journal au lieu d’envoi).
- Scénario réel en base : matériau + variante de test créés par l’admin → présents dans les modules → tarif fictif de test → demande → soumission → CRM → remise capturée → changement de tarif → soumission rouverte identique → nouvelle soumission au nouveau tarif ; plus : matériau sans prix vers CRM, renommage/désactivation. Nettoyage ensuite.

## Lot E — Cas de catalogue bloqués
- Sources ajoutées : Sel Warwick (silice en vrac), Bauval (vrac, enrobés), A.L.O Pomerleau (enrochement/pierre de quai — usage « protection de berges » rattaché, pas de doublon), Savaria (substrats, conditionnement).
- Distinctions : pierre abrasive vrac ≠ produit en sac ; drainage ≠ média filtrant piscine ; tourbe ≠ gazon en rouleaux ; termes locaux conservés « à qualifier ».
- Recherche Lanaudière, Mauricie, Îles-de-la-Madeleine ; lacunes signalées.

## Lot F — Réconciliation et export prix
- Explication 45 → 82 (37 vs 29) ligne par ligne ; liste des 6 non sélectionnables avec motif, distincte des 13 lignes à qualifier.
- « Définir le prix » ouvre la bonne variante.
- Export prêt à remplir (identifiants stables, variantes, unités, prix vides), tarifs réels préservés.

## Lot G — Livrables
- Matrice des modules (route, source, écriture, vérification) en XLSX/CSV.
- Preuves des 6 parcours demandés, rapport séparé : développé / vérifié en isolé / publié / blocages.

## Détails techniques
- Migrations additives uniquement (table de correspondance legacy, colonnes nullables, journal de messagerie capturée).
- Edge functions `quote-submit`/`quote-engine` redéployées ; front non publié.
- Tests Vitest ciblés par lot + Playwright pour les parcours visibles.

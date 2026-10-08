# Phase 5D — Validation du territoire réel avant génération SEO (audit lecture seule)

> Aucune page créée ou modifiée; aucune URL, aucun SEO, aucune donnée, migration, RLS ou permission modifiés; rien publié. Aucune génération.

## Sources et règles

- Villes : celles des 61 pages CRÉER de la Phase 5C.
- Demandes réelles (`submissions` rattachées par le système territorial), leurs statuts; demandes de transport (`transport_requests`); voyages opérationnels (`trips` : 0 ligne au total); dompes publiques géolocalisées (`dumps`, rayon 10 km); territoire reconnu (`geo_territories`) et matrice de desserte existante (`geo_territory_services`).
- Rappel métier : une dompe = une demande de remblai. Une demande « en attente de livraison » est donc un site réel qui attend du remblai.
- **Constat majeur** : dans la matrice de desserte, le service **transport** est « non configuré » pour **tous** les territoires (166/166), et la livraison n'est active que dans 1 territoire. Seule la **recherche de dompe** est réellement configurée (active ou partielle). Aucune promesse « transport disponible », « livraison disponible » ou « nous desservons toute la ville » n'est donc établie pour ces villes.
- Aucune de ces villes n'est marquée « desservie » au registre SEO; aucune n'a de voyage opérationnel; aucune n'a de dompe publique à moins de 10 km.

**Classes** : A = recherche de dompe active + ≥ 5 sites en attente + au moins une soumission envoyée/acceptée ou un paiement · B = recherche de dompe active ou partielle + ≥ 2 sites en attente · C = ≥ 2 demandes sans ces preuves actives · D = le reste. A signifie « desserte validée pour la recherche de dompe/remblai », jamais pour le transport ou la livraison.

## 1–5. Bilan

1. Villes examinées : **55**
2. A — Desservie / validée : **2**
3. B — Desserte probable : **45**
4. C — À valider manuellement : **8**
5. D — Ne pas développer : **0**

Pages : **45 peuvent passer à la génération**, 16 à valider, 0 à retirer (sur 61).

## 6. Tableau complet des villes

| Ville | Classe | Demandes | Services observés | Matériaux observés (acceptés par les sites) | Transport observé | Dompes / sites pertinents | Autres preuves | Confiance | Justification |
|---|---|---|---|---|---|---|---|---|---|
| Saint-Agapit | A | 13 (remblai 11, vrac 2) | materiaux_vrac partielle, recherche_dompe active | sable, gravier, pierre, poussiere-de-pierre, beton, gravier-0-3-4 | aucun (0 demande de transport, 0 voyage) | 10 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 10, archivé 2, soumission envoyée 1; territoire active | Élevée (dompe seulement) | sites réels actifs et au moins une étape commerciale réelle |
| Saint-Isidore | A | 8 (remblai 7, vrac 1) | materiaux_vrac partielle, recherche_dompe active | sable, asphalte, gravier, gravier-0-3-4, pierre, pierre-concassee | aucun (0 demande de transport, 0 voyage) | 5 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : paiement effectué 1, archivé 1, en attente de livraison 5, perdu 1; territoire active | Élevée (dompe seulement) | sites réels actifs et au moins une étape commerciale réelle |
| Saint-Damien | B | 17 (remblai 15, transport 1, demande JSC 1) | recherche_dompe active | sable, pierre, gravier-0-3-4, pierre-concassee, gravier, poussiere-de-pierre | aucun (0 demande de transport, 0 voyage) | 15 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 15; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Henri | B | 10 (remblai 10) | recherche_dompe active | sable, pierre-concassee, roche, remblai, gravier, gravier-0-3-4 | aucun (0 demande de transport, 0 voyage) | 7 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 7, archivé 2, perdu 1; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Beaumont | B | 8 (remblai 8) | recherche_dompe active | pierre-concassee, sable, roche, gravier, gravier-0-3-4, pierre | aucun (0 demande de transport, 0 voyage) | 5 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 5, perdu 2, archivé 1; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Sainte-Marie | B | 6 (remblai 6) | recherche_dompe active | sable, gravier, gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre | aucun (0 demande de transport, 0 voyage) | 6 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 6; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Tite-des-Caps | B | 5 (remblai 5) | recherche_dompe active | sable, gravier, pierre-concassee, roche, gravier-0-3-4, pierre | aucun (0 demande de transport, 0 voyage) | 5 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 5; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Scott | B | 5 (remblai 5) | recherche_dompe active | sable, roche, beton, pierre-concassee | aucun (0 demande de transport, 0 voyage) | 5 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 5; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Cap-Saint-Ignace | B | 4 (remblai 4) | recherche_dompe active | sable, gravier, gravier-0-3-4, pierre, pierre-concassee, roche | aucun (0 demande de transport, 0 voyage) | 4 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 4; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| La Durantaye | B | 4 (remblai 4) | recherche_dompe active | pierre-concassee, sable, gravier, gravier-0-3-4, pierre, poussiere-de-pierre | aucun (0 demande de transport, 0 voyage) | 3 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 3, soumission envoyée 1; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Notre-Dame-du-Sacré-Coeur-d'Issoudun | B | 4 (remblai 4) | recherche_dompe active | sable, pierre-concassee, asphalte, gravier, gravier-0-3-4, pierre | aucun (0 demande de transport, 0 voyage) | 4 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 4; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Colomban | B | 4 (remblai 4) | recherche_dompe active | sable | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2, archivé 1, soumission envoyée 1; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Georges | B | 4 (remblai 2, vrac 1, demande JSC 1) | materiaux_vrac partielle, recherche_dompe partielle | gravier-0-3-4, pierre, pierre-concassee | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : perdu 1, en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Janvier-de-Joly | B | 4 (remblai 4) | recherche_dompe active | sable, pierre-concassee, gravier, gravier-0-3-4, pierre, roche | aucun (0 demande de transport, 0 voyage) | 3 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : perdu 1, en attente de livraison 3; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Sainte-Hénédine | B | 4 (remblai 3, vrac 1) | materiaux_vrac partielle, recherche_dompe active | sable, gravier, gravier-0-3-4, pierre, pierre-concassee, remblai | aucun (0 demande de transport, 0 voyage) | 3 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 3, soumission envoyée 1; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Trois-Rivières | B | 4 (remblai 3, demande JSC 1) | materiaux_vrac partielle, recherche_dompe partielle | terre-tamisee, gravier, gravier-0-3-4, pierre, pierre-concassee | aucun (0 demande de transport, 0 voyage) | 3 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 3; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Adstock | B | 3 (remblai 3) | recherche_dompe active | gravier-0-3-4, pierre, pierre-concassee, sable, gravier, poussiere-de-pierre | aucun (0 demande de transport, 0 voyage) | 3 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 3; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Antoine-de-Tilly | B | 3 (remblai 2, vrac 1) | materiaux_vrac partielle, recherche_dompe partielle | sable, gravier, gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2, perdu 1; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Benoît-Labre | B | 3 (remblai 3) | recherche_dompe active | asphalte, gravier-0-3-4, pierre, pierre-concassee | aucun (0 demande de transport, 0 voyage) | 3 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 3; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Elzéar | B | 3 (remblai 3) | recherche_dompe active | gravier, sable, gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre | aucun (0 demande de transport, 0 voyage) | 3 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 3; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Félix-de-Valois | B | 3 (remblai 3) | recherche_dompe active | sable, pierre-concassee, roche | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2, perdu 1; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Gervais | B | 3 (remblai 3) | recherche_dompe active | sable, pierre-concassee, roche | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2, perdu 1; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Simon-les-Mines | B | 3 (remblai 3) | recherche_dompe active | gravier, gravier-0-3-4, pierre, pierre-concassee, sable, poussiere-de-pierre | aucun (0 demande de transport, 0 voyage) | 3 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 3; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Théophile | B | 3 (remblai 3) | recherche_dompe active | pierre-concassee, roche, sable, gravier, gravier-0-3-4, pierre | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : perdu 1, en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Sainte-Julienne | B | 3 (remblai 3) | recherche_dompe active | sable | aucun (0 demande de transport, 0 voyage) | 3 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 3; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Sainte-Marguerite | B | 3 (remblai 3) | recherche_dompe active | sable, gravier, gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2, perdu 1; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Sainte-Émélie-de-l'Énergie | B | 3 (remblai 3) | recherche_dompe active | sable, gravier, gravier-0-3-4, pierre, pierre-concassee, roche | aucun (0 demande de transport, 0 voyage) | 3 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 3; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Shawinigan | B | 3 (remblai 3) | recherche_dompe active | gravier-0-3-4, pierre, pierre-concassee, sable | aucun (0 demande de transport, 0 voyage) | 3 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 3; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Villeroy | B | 3 (remblai 3) | recherche_dompe active | pierre-concassee, gravier-0-3-4, pierre, sable, roche | aucun (0 demande de transport, 0 voyage) | 3 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 3; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Disraeli | B | 2 (remblai 2) | recherche_dompe partielle | sable, pierre-concassee, roche | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| East Broughton | B | 2 (remblai 2) | recherche_dompe partielle | sable, gravier, gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Lac-Etchemin | B | 2 (remblai 2) | recherche_dompe partielle | pierre, poussiere-de-pierre | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Anselme | B | 2 (remblai 2) | recherche_dompe partielle | non disponible | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Basile | B | 2 (remblai 2) | recherche_dompe partielle | sable, pierre-concassee, roche, gravier, gravier-0-3-4, pierre | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Calixte-de-Kilkenny | B | 2 (remblai 2) | recherche_dompe partielle | sable, gravier, gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Flavien | B | 2 (remblai 2) | recherche_dompe partielle | sable, gravier, gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Jérôme | B | 2 (remblai 2) | recherche_dompe partielle | sable | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Lazare-de-Bellechasse | B | 2 (remblai 2) | recherche_dompe partielle | non disponible | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Maurice | B | 2 (remblai 2) | recherche_dompe partielle | gravier-0-3-4, pierre, pierre-concassee | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-Michel-de-Bellechasse | B | 2 (remblai 2) | recherche_dompe partielle | sable, roche | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saint-René | B | 2 (remblai 2) | recherche_dompe partielle | gravier-0-3-4, pierre, pierre-concassee, sable | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Sainte-Christine-d'Auvergne | B | 2 (remblai 2) | recherche_dompe partielle | sable, pierre-concassee, roche | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Sainte-Sophie-de-Lévrard | B | 2 (remblai 2) | recherche_dompe partielle | sable, gravier, pierre | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Saints-Anges | B | 2 (remblai 2) | recherche_dompe partielle | sable, gravier, gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Val-Alain | B | 2 (remblai 2) | recherche_dompe partielle | gravier-0-3-4, pierre, pierre-concassee | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Val-David | B | 2 (remblai 2) | recherche_dompe partielle | non disponible | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Wentworth-Nord | B | 2 (remblai 2) | recherche_dompe partielle | non disponible | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Moyenne | sites réels en attente, recherche de dompe configurée; aucune étape commerciale confirmée |
| Bécancour | C | 3 (remblai 3) | disposition_remblai active | non disponible | aucun (0 demande de transport, 0 voyage) | 0 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : archivé 3; territoire active | Faible | demandes historiques sans site actif ni service configuré |
| Beauceville | C | 2 (remblai 2) | recherche_dompe partielle | sable | aucun (0 demande de transport, 0 voyage) | 1 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 1, perdu 1; territoire active | Faible | demandes historiques sans site actif ni service configuré |
| Frampton | C | 2 (remblai 2) | recherche_dompe partielle | sable, gravier, gravier-0-3-4, pierre, pierre-concassee, poussiere-de-pierre | aucun (0 demande de transport, 0 voyage) | 1 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 1, archivé 1; territoire active | Faible | demandes historiques sans site actif ni service configuré |
| Laval | C | 2 (remblai 2) | disposition_remblai partielle, recherche_dompe partielle | non disponible | aucun (0 demande de transport, 0 voyage) | 1 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 1, message texte envoyé 1; territoire active | Faible | demandes historiques sans site actif ni service configuré |
| Montmagny | C | 2 (remblai 2) | recherche_dompe partielle | non disponible | aucun (0 demande de transport, 0 voyage) | 1 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 1, perdu 1; territoire active | Faible | demandes historiques sans site actif ni service configuré |
| Saint-Philémon | C | 2 (remblai 2) | recherche_dompe partielle | pierre-concassee, sable, roche, gravier, gravier-0-3-4, pierre | aucun (0 demande de transport, 0 voyage) | 1 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 1, soumission envoyée 1; territoire active | Faible | demandes historiques sans site actif ni service configuré |
| Saint-Prosper-de-Champlain | C | 2 (remblai 2) | aucun service configuré | gravier-0-3-4, pierre, pierre-concassee, sable, gravier, poussiere-de-pierre | aucun (0 demande de transport, 0 voyage) | 2 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : en attente de livraison 2; territoire active | Faible | demandes historiques sans site actif ni service configuré |
| Sainte-Croix | C | 2 (vrac 2) | materiaux_vrac partielle | non disponible | aucun (0 demande de transport, 0 voyage) | 0 site(s) en attente; dompes publiques ≤ 10 km : 0 | statuts : perdu 2; territoire active | Faible | demandes historiques sans site actif ni service configuré |

## 7. Les 14 P1 et leur validation

| Ville | Classe ville | Famille | URL | Desservie ? | Service pertinent ? | Preuve | Page concurrente | Risque de promesse non vérifiée | Décision |
|---|---|---|---|---|---|---|---|---|---|
| Beaumont | B | remblai | `/remblai-beaumont` | probable | oui | 5 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Agapit | A | transport-vrac | `/transport-vrac-saint-agapit` | oui (dompe/remblai) | non établi | service transport « non configuré » pour ce territoire : promesse de transport non établie | aucune | élevé | **À VALIDER** |
| Saint-Antoine-de-Tilly | B | remblai | `/remblai-saint-antoine-de-tilly` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Damien | B | transport-vrac | `/transport-vrac-saint-damien` | probable | non établi | service transport « non configuré » pour ce territoire : promesse de transport non établie | aucune | élevé | **À VALIDER** |
| Saint-Georges | B | remblai | `/remblai-saint-georges` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Georges | B | transport-vrac | `/transport-vrac-saint-georges` | probable | non établi | service transport « non configuré » pour ce territoire : promesse de transport non établie | aucune | élevé | **À VALIDER** |
| Saint-Henri | B | remblai | `/remblai-saint-henri` | probable | oui | 7 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Isidore | A | remblai | `/remblai-saint-isidore` | oui (dompe/remblai) | oui | 5 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Tite-des-Caps | B | remblai | `/remblai-saint-tite-des-caps` | probable | oui | 5 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Sainte-Hénédine | B | remblai | `/remblai-sainte-henedine` | probable | oui | 3 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Sainte-Marie | B | remblai | `/remblai-sainte-marie` | probable | oui | 6 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Scott | B | remblai | `/remblai-scott` | probable | oui | 5 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Trois-Rivières | B | remblai | `/remblai-trois-rivieres` | probable | oui | 3 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Trois-Rivières | B | transport-vrac | `/transport-vrac-trois-rivieres` | probable | non établi | service transport « non configuré » pour ce territoire : promesse de transport non établie | aucune | élevé | **À VALIDER** |

## 8. Les 47 P2 et leur validation

| Ville | Classe ville | Famille | URL | Desservie ? | Service pertinent ? | Preuve | Page concurrente | Risque de promesse non vérifiée | Décision |
|---|---|---|---|---|---|---|---|---|---|
| Adstock | B | remblai | `/remblai-adstock` | probable | oui | 3 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Beauceville | C | remblai | `/remblai-beauceville` | non démontré | non établi | aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire | aucune | élevé | **À VALIDER** |
| Bécancour | C | dompe | `/dompe-becancour` | non démontré | non établi | aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire | /recherche-point-de-depot-becancour | élevé | **À VALIDER** |
| Bécancour | C | remblai | `/remblai-becancour` | non démontré | non établi | aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire | aucune | élevé | **À VALIDER** |
| Bécancour | C | transport-vrac | `/transport-vrac-becancour` | non démontré | non établi | aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire | aucune | élevé | **À VALIDER** |
| Cap-Saint-Ignace | B | remblai | `/remblai-cap-saint-ignace` | probable | oui | 4 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Disraeli | B | remblai | `/remblai-disraeli` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| East Broughton | B | remblai | `/remblai-east-broughton` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Frampton | C | remblai | `/remblai-frampton` | non démontré | non établi | aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire | aucune | élevé | **À VALIDER** |
| La Durantaye | B | remblai | `/remblai-la-durantaye` | probable | oui | 3 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Lac-Etchemin | B | remblai | `/remblai-lac-etchemin` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Laval | C | remblai | `/remblai-laval` | non démontré | non établi | aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire | aucune | élevé | **À VALIDER** |
| Montmagny | C | remblai | `/remblai-montmagny` | non démontré | non établi | aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire | aucune | élevé | **À VALIDER** |
| Notre-Dame-du-Sacré-Coeur-d'Issoudun | B | remblai | `/remblai-notre-dame-du-sacre-coeur-d-issoudun` | probable | oui | 4 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Anselme | B | remblai | `/remblai-saint-anselme` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Basile | B | remblai | `/remblai-saint-basile` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Benoît-Labre | B | remblai | `/remblai-saint-benoit-labre` | probable | oui | 3 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Calixte-de-Kilkenny | B | remblai | `/remblai-saint-calixte-de-kilkenny` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Colomban | B | remblai | `/remblai-saint-colomban` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Elzéar | B | remblai | `/remblai-saint-elzear` | probable | oui | 3 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Flavien | B | remblai | `/remblai-saint-flavien` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Félix-de-Valois | B | remblai | `/remblai-saint-felix-de-valois` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Gervais | B | remblai | `/remblai-saint-gervais` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Janvier-de-Joly | B | remblai | `/remblai-saint-janvier-de-joly` | probable | oui | 3 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Jérôme | B | remblai | `/remblai-saint-jerome` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Lazare-de-Bellechasse | B | remblai | `/remblai-saint-lazare-de-bellechasse` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Maurice | B | remblai | `/remblai-saint-maurice` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Michel-de-Bellechasse | B | remblai | `/remblai-saint-michel-de-bellechasse` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Philémon | C | remblai | `/remblai-saint-philemon` | non démontré | non établi | aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire | aucune | élevé | **À VALIDER** |
| Saint-Prosper-de-Champlain | C | dompe | `/dompe-saint-prosper-de-champlain` | non démontré | non établi | aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire | /recherche-point-de-depot-saint-prosper-de-champlain | élevé | **À VALIDER** |
| Saint-Prosper-de-Champlain | C | recherche-point-de-depot | `/recherche-point-de-depot-saint-prosper-de-champlain` | non démontré | non établi | aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire | /dompe-saint-prosper-de-champlain | élevé | **À VALIDER** |
| Saint-Prosper-de-Champlain | C | remblai | `/remblai-saint-prosper-de-champlain` | non démontré | non établi | aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire | aucune | élevé | **À VALIDER** |
| Saint-René | B | remblai | `/remblai-saint-rene` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Simon-les-Mines | B | remblai | `/remblai-saint-simon-les-mines` | probable | oui | 3 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saint-Théophile | B | remblai | `/remblai-saint-theophile` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Sainte-Christine-d'Auvergne | B | remblai | `/remblai-sainte-christine-d-auvergne` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Sainte-Croix | C | transport-vrac | `/transport-vrac-sainte-croix` | non démontré | non établi | aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire | aucune | élevé | **À VALIDER** |
| Sainte-Julienne | B | remblai | `/remblai-sainte-julienne` | probable | oui | 3 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Sainte-Marguerite | B | remblai | `/remblai-sainte-marguerite` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Sainte-Sophie-de-Lévrard | B | remblai | `/remblai-sainte-sophie-de-levrard` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Sainte-Émélie-de-l'Énergie | B | remblai | `/remblai-sainte-emelie-de-l-energie` | probable | oui | 3 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Saints-Anges | B | remblai | `/remblai-saints-anges` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Shawinigan | B | remblai | `/remblai-shawinigan` | probable | oui | 3 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Val-Alain | B | remblai | `/remblai-val-alain` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Val-David | B | remblai | `/remblai-val-david` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Villeroy | B | remblai | `/remblai-villeroy` | probable | oui | 3 site(s) réel(s) en attente de remblai; recherche de dompe active | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |
| Wentworth-Nord | B | remblai | `/remblai-wentworth-nord` | probable | oui | 2 site(s) réel(s) en attente de remblai; recherche de dompe partielle | aucune | faible si le texte parle de recherche de sites, sans promettre de livraison | **GÉNÉRABLE** |

## 9. Pages à retirer de la génération (pour l'instant)

- `/remblai-beauceville` — À VALIDER : aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire
- `/remblai-becancour` — À VALIDER : aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire
- `/dompe-becancour` — À VALIDER : aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire
- `/transport-vrac-becancour` — À VALIDER : aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire
- `/remblai-frampton` — À VALIDER : aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire
- `/remblai-laval` — À VALIDER : aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire
- `/remblai-montmagny` — À VALIDER : aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire
- `/transport-vrac-saint-agapit` — À VALIDER : service transport « non configuré » pour ce territoire : promesse de transport non établie
- `/transport-vrac-saint-damien` — À VALIDER : service transport « non configuré » pour ce territoire : promesse de transport non établie
- `/transport-vrac-saint-georges` — À VALIDER : service transport « non configuré » pour ce territoire : promesse de transport non établie
- `/remblai-saint-philemon` — À VALIDER : aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire
- `/remblai-saint-prosper-de-champlain` — À VALIDER : aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire
- `/dompe-saint-prosper-de-champlain` — À VALIDER : aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire
- `/recherche-point-de-depot-saint-prosper-de-champlain` — À VALIDER : aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire
- `/transport-vrac-sainte-croix` — À VALIDER : aucun site actif en attente ni recherche de dompe active ou partielle dans ce territoire
- `/transport-vrac-trois-rivieres` — À VALIDER : service transport « non configuré » pour ce territoire : promesse de transport non établie

## 10. Pages qui peuvent passer à la génération

**P1 (10)**
- `/remblai-saint-henri` — Saint-Henri (classe B), remblai
- `/remblai-sainte-marie` — Sainte-Marie (classe B), remblai
- `/remblai-beaumont` — Beaumont (classe B), remblai
- `/remblai-saint-isidore` — Saint-Isidore (classe A), remblai
- `/remblai-saint-tite-des-caps` — Saint-Tite-des-Caps (classe B), remblai
- `/remblai-scott` — Scott (classe B), remblai
- `/remblai-sainte-henedine` — Sainte-Hénédine (classe B), remblai
- `/remblai-trois-rivieres` — Trois-Rivières (classe B), remblai
- `/remblai-saint-antoine-de-tilly` — Saint-Antoine-de-Tilly (classe B), remblai
- `/remblai-saint-georges` — Saint-Georges (classe B), remblai

**P2 (35)**
- `/remblai-cap-saint-ignace` — Cap-Saint-Ignace (classe B), remblai
- `/remblai-notre-dame-du-sacre-coeur-d-issoudun` — Notre-Dame-du-Sacré-Coeur-d'Issoudun (classe B), remblai
- `/remblai-adstock` — Adstock (classe B), remblai
- `/remblai-la-durantaye` — La Durantaye (classe B), remblai
- `/remblai-saint-benoit-labre` — Saint-Benoît-Labre (classe B), remblai
- `/remblai-saint-elzear` — Saint-Elzéar (classe B), remblai
- `/remblai-saint-janvier-de-joly` — Saint-Janvier-de-Joly (classe B), remblai
- `/remblai-saint-simon-les-mines` — Saint-Simon-les-Mines (classe B), remblai
- `/remblai-sainte-julienne` — Sainte-Julienne (classe B), remblai
- `/remblai-sainte-emelie-de-l-energie` — Sainte-Émélie-de-l'Énergie (classe B), remblai
- `/remblai-shawinigan` — Shawinigan (classe B), remblai
- `/remblai-villeroy` — Villeroy (classe B), remblai
- `/remblai-disraeli` — Disraeli (classe B), remblai
- `/remblai-east-broughton` — East Broughton (classe B), remblai
- `/remblai-lac-etchemin` — Lac-Etchemin (classe B), remblai
- `/remblai-saint-anselme` — Saint-Anselme (classe B), remblai
- `/remblai-saint-basile` — Saint-Basile (classe B), remblai
- `/remblai-saint-calixte-de-kilkenny` — Saint-Calixte-de-Kilkenny (classe B), remblai
- `/remblai-saint-colomban` — Saint-Colomban (classe B), remblai
- `/remblai-saint-flavien` — Saint-Flavien (classe B), remblai
- `/remblai-saint-felix-de-valois` — Saint-Félix-de-Valois (classe B), remblai
- `/remblai-saint-gervais` — Saint-Gervais (classe B), remblai
- `/remblai-saint-jerome` — Saint-Jérôme (classe B), remblai
- `/remblai-saint-lazare-de-bellechasse` — Saint-Lazare-de-Bellechasse (classe B), remblai
- `/remblai-saint-maurice` — Saint-Maurice (classe B), remblai
- `/remblai-saint-michel-de-bellechasse` — Saint-Michel-de-Bellechasse (classe B), remblai
- `/remblai-saint-rene` — Saint-René (classe B), remblai
- `/remblai-saint-theophile` — Saint-Théophile (classe B), remblai
- `/remblai-sainte-christine-d-auvergne` — Sainte-Christine-d'Auvergne (classe B), remblai
- `/remblai-sainte-marguerite` — Sainte-Marguerite (classe B), remblai
- `/remblai-sainte-sophie-de-levrard` — Sainte-Sophie-de-Lévrard (classe B), remblai
- `/remblai-saints-anges` — Saints-Anges (classe B), remblai
- `/remblai-val-alain` — Val-Alain (classe B), remblai
- `/remblai-val-david` — Val-David (classe B), remblai
- `/remblai-wentworth-nord` — Wentworth-Nord (classe B), remblai

Contrainte de rédaction pour ces pages : parler de recherche de dompes / sites qui reçoivent du remblai dans le secteur, sans écrire « transport disponible », « livraison disponible », « dompes disponibles » garanties ni « nous desservons toute la ville ».

## 11. Points nécessitant une validation humaine

1. Confirmer que Vrac Québec / Transport JSC peut réellement intervenir dans les villes A et B (aucun voyage opérationnel n'existe pour les prouver).
2. Configurer, ou confirmer qu'il ne faut pas configurer, le service transport dans la matrice de desserte : tant qu'il reste « non configuré », aucune page transport en vrac n'est générée.
3. Les demandes « en attente de livraison » sont-elles encore actives ? Plusieurs peuvent être anciennes; la date n'a pas été utilisée comme critère.
4. Valider une intention distincte avant toute page point de dépôt à côté d'une page dompe.
5. Villes C : décider au cas par cas (demandes archivées ou perdues seulement).

---
Données modifiées : NON · Pages créées : NON · Pages supprimées : NON · URLs modifiées : NON · SEO modifié : NON · Publication : NON · Migration : NON · RLS : NON · Permissions : NON

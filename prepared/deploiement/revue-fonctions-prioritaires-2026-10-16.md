# Revue des 3 fonctions prioritaires (lecture seule, 16 oct. 2026)

Proposition SQL : `proposition-restriction-fonctions-anon-NON-APPLIQUEE.sql` (non appliquée).
Constat commun : propriétaire `postgres`, SECURITY DEFINER, `search_path = public`.

## seo_sync_cities_from_territories()
- Effet : UPDATE geo_territories.seo_city_slug, INSERT seo_cities (actives, non desservies), UPDATE coordonnées/MRC de seo_cities. Aucun paramètre, aucun contrôle d'identité.
- Droits observés : `postgres, anon, authenticated, service_role`.
- Appelant légitime unique : `src/pages/AdminSeoManager.tsx:351` (administrateur connecté). Aucun appel par une autre fonction SQL. Tâches planifiées : NON VÉRIFIÉ (schéma cron illisible avec le rôle de lecture).
- Conséquence d'un appel anonyme : villes SEO ajoutées et territoires reliés sans validation. Idempotent (ON CONFLICT DO NOTHING) : pas de suppression ni d'écrasement des noms.
- Contrôle minimal : retirer anon/PUBLIC + garde `has_role(auth.uid(),'admin')` dans le corps.
- Non-régression : bouton de synchronisation dans l'admin SEO (admin) → résultat chiffré ; même appel en non-admin → « Accès refusé » ; appel anonyme → refus de permission.

## mkt_compute_commission(_award_id uuid)
- Effet : lit mkt_awards / mkt_pricing_rules, INSERT ou UPDATE mkt_commissions (statut « a_confirmer » seulement ; commissions facturées/payées intouchées).
- Droits observés : `PUBLIC (=X), postgres, service_role` → exécutable par anon et authenticated via PUBLIC.
- Appelant légitime : déclencheur `mkt_award_commission_trg` (SECURITY DEFINER, propriétaire postgres → droits de postgres). Aucun appel dans le code.
- Conséquence : identifiant d'attribution requis (UUID, non devinable) ; recalcul d'une commission « à confirmer » avec la règle en vigueur. Risque faible mais sans justification.
- Contrôle minimal : réserver à service_role (le déclencheur continue de fonctionner).
- Non-régression (staging) : créer une attribution fictive → commission « a_confirmer » créée ; appel anonyme/connecté → refus.

## blog_increment_view(_post_id uuid)
- Effet : `UPDATE blog_posts SET view_count = view_count + 1`.
- Droits observés : `postgres, anon, authenticated, service_role`.
- Appelants : aucun dans `src/` ni `supabase/functions/` (hors types générés). Compteur probablement alimenté autrement ou plus utilisé : NON VÉRIFIÉ côté statistiques.
- Conséquence : gonflage illimité des vues d'un article (données de statistiques faussées).
- Contrôle minimal : réserver à service_role.
- Non-régression : ouvrir un article publié → page affichée sans erreur console ; tableau de bord blogue inchangé.

## Ne pas modifier
`has_role`, `mkt_partner_is_public` et toute fonction marquée `utilisee_par_politique_RLS = oui`.

## 125 « à restreindre » et 28 « à examiner »
Classement conservé tel quel dans l'inventaire. **Aucune révocation n'est recommandée** pour l'instant : le classement repose sur un script (absence d'appel public trouvé, contrôle `auth.uid()` détecté), pas sur une relecture ligne par ligne. Chaque révocation exigera : lecture du code, liste des appelants, vérification des politiques et un test en staging.

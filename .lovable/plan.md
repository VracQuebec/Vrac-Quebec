
# Création manuelle de Leads — Plan d'implémentation

## Objectif
Permettre aux admins de créer un lead à la main (appels, Messenger, SMS, références) qui se comporte **exactement** comme un lead provenant du formulaire public, sans aucune régression sur le CRM existant.

## Approche générale
Réutiliser à 100 % la table `submissions` existante. Pas de nouvelle table, pas de nouveau pipeline, pas de nouvelle logique de statut. Un lead manuel = un `INSERT` dans `submissions` fait par un admin authentifié (le trigger `enforce_submission_insert_defaults` laisse déjà passer les admins, donc tous les champs internes peuvent être renseignés).

## 1. Base de données (migration)

Ajouter sur `submissions` les colonnes nécessaires pour tracer l'origine manuelle, sans casser les leads existants :

- `lead_source text` (nullable) — ex: `marketplace`, `messenger`, `phone`, `sms`, `reference`, `email`, `website`, `quebecvrac`, `vracquebec`, `transportjsc`, `other`. Les leads issus du formulaire public restent à `NULL` (= site web par défaut côté affichage).
- `lead_category text` (nullable) — ex: `terre`, `remblai`, `sable`, `gravier`, `pierre`, `excavation`, `terrassement`, `transport`, `pneus`, `mecanique`, `immobilier`, `autre`. Sert de catégorie libre pour les leads hors-formulaire (qui n'utilisent pas forcément `materials[]`).
- `company text` (nullable) — nom de l'entreprise du client.
- `city text` (nullable)
- `province text` (nullable, défaut `'QC'`)
- `desired_date date` (nullable) — date souhaitée par le client.
- `created_by uuid` (nullable) — `auth.uid()` du créateur admin. NULL pour les leads publics.
- `creation_origin text` (default `'public_form'`) — `'public_form'` ou `'manual_admin'`.

Mettre à jour le trigger `enforce_submission_insert_defaults` pour réinitialiser aussi ces nouveaux champs côté public (forcer `creation_origin='public_form'`, `created_by=NULL`, `lead_source=NULL`).

Aucune RLS ne change : admins font déjà tout via `has_role(..., 'admin')`.

## 2. Détection de doublons

Avant l'insertion, le formulaire interroge `submissions` par téléphone normalisé OU email exact (les deux côté client, RLS admin autorise). Si match → modal :

> "Un lead similaire existe déjà. Ouvrir la fiche existante ou créer quand même ?"

Deux actions : **Ouvrir la fiche** (scroll vers le lead dans la liste admin) ou **Créer quand même** (force `INSERT`).

## 3. UI — Composant `NewLeadModal`

Nouveau fichier `src/components/NewLeadModal.tsx`, basé sur `Dialog` shadcn, optimisé mobile (champs empilés, gros boutons tactiles, < 30 s à remplir).

Sections :
1. **Client** — Nom, Entreprise, Téléphone, Courriel, Adresse (avec `GooglePlaceAutocomplete` → remplit address/city/province/postal_code/lat/lng/formatted_address/place_id), Ville, Province, CP.
2. **Source & Catégorie** — deux `Select` (sources + catégories listées ci-dessus).
3. **Projet** — Description, Quantité, Type de matériel (texte libre + tag dans `materials[]`), Date souhaitée (datepicker), Budget (optionnel), Notes internes.

À la soumission :
- Géocodage Google si pas déjà fait par autocomplete (réutilise l'edge function `google-geocode`).
- `INSERT` dans `submissions` avec `status='nouveau'`, `creation_origin='manual_admin'`, `created_by=auth.uid()`, `geocoding_status` selon résultat.
- Toast succès + refresh liste admin.

## 4. Bouton "➕ Ajouter un Lead"

Visible et identique sur :
- **Dashboard Admin** (`src/pages/Admin.tsx`) — header, à côté des autres CTA admin.
- **Vue Kanban / Liste leads** — même header.
- **Mobile** — bouton flottant (FAB) en bas à droite sur viewport < md.

Un seul composant `<NewLeadButton />` qui ouvre `NewLeadModal`.

## 5. Affichage de la source dans la liste admin

Dans la fiche/ligne admin, ajouter un petit badge "Source : Messenger" (ou autre) quand `lead_source` est renseigné. Si `creation_origin='manual_admin'`, afficher aussi "Créé manuellement par {email}".

## 6. Filtres

Ajouter dans les filtres admin existants :
- Filtre **Source** (multi-select des sources).
- Filtre **Catégorie** (multi-select).
- Les filtres existants (statut, date, ville, responsable) couvrent déjà le reste — étendre la recherche ville si nécessaire.

## 7. Statistiques

Les vues stats existantes lisent déjà `submissions` sans filtre d'origine → les leads manuels sont **automatiquement** inclus dans : taux de conversion, revenus, rapports mensuels/annuels, total leads, valeur des opportunités. Vérification visuelle uniquement, pas de code à changer.

## 8. Pipeline & automations

Le lead manuel hérite du même `status` initial (`nouveau`) et passe par les mêmes statuts existants (Nouveau → Contacté → ... → Payé → Relance). Aucun fork de logique.

### Relance auto 24 h
Hors scope minimal : la table `submissions` a déjà `created_at` + `status`. Une vue/requête côté admin liste les leads `status='nouveau' AND created_at < now() - 24h` et affiche un badge "À relancer" + un compteur dans le dashboard. Pas de tâche cron pour ce premier jet (peut être ajouté ensuite via `pg_cron` si désiré).

## 9. QA avant livraison

- [ ] Soumission publique fonctionne toujours (trigger respecte les défauts sécurisés).
- [ ] Admin peut créer un lead manuel avec tous les champs.
- [ ] Détection doublon par téléphone/email fonctionne.
- [ ] Géocodage Google s'applique au lead manuel (badge précision visible).
- [ ] Lead manuel apparaît sur la map admin avec coords exactes, sur la map entrepreneur avec offset 1 km.
- [ ] Filtres Source + Catégorie fonctionnent.
- [ ] Statistiques incluent le lead manuel.
- [ ] FAB mobile s'affiche et formulaire utilisable en < 30 s.

---

## Détails techniques (pour info)

**Fichiers créés**
- `src/components/NewLeadModal.tsx`
- `src/components/NewLeadButton.tsx`
- Migration Supabase ajoutant 7 colonnes à `submissions` + mise à jour trigger.

**Fichiers modifiés**
- `src/pages/Admin.tsx` — intégration bouton header + FAB mobile + colonnes filtres.
- `src/components/AdminMap.tsx` — aucune modif (déjà piloté par submissions).
- Composants liste/kanban — affichage badges source/origine.

**Sécurité**
- Le trigger `enforce_submission_insert_defaults` reste la garantie que les non-admins ne peuvent jamais setter `creation_origin='manual_admin'`, `created_by`, `lead_source`, etc.
- RLS UPDATE/INSERT admin déjà en place.

**Sans régression**
- Aucune colonne existante modifiée. Aucune RLS modifiée. Aucun statut renommé. Aucun champ requis ajouté côté formulaire public.

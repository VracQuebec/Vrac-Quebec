# FIN-01 — Socle Finances et calendrier des obligations

## Objectif
Une section Finances utilisable en aperçu : choisir l'entreprise, créer une obligation ponctuelle ou mensuelle, la retrouver dans le calendrier, filtrer une période, obtenir des totaux exacts, modifier les échéances futures sans doublon. Aucune donnée réelle touchée, rien publié.

## Ce qui est réutilisé (pas de doublon)
- Entreprises existantes (jsc_companies) et membres (jsc_company_members) avec le sélecteur d'entreprise du CRM.
- Rôles CRM existants : lecture finances = propriétaire, gestionnaire, comptabilité, lecture, support ; écriture = propriétaire, gestionnaire, comptabilité, support. « Lecture » ne modifie rien ; chauffeur, mécanicien et opérateur n'ont aucun accès.
- Fournisseurs/contacts du CRM, camions de la flotte, chantiers et documents privés CRM : liens optionnels, vérifiés dans la même entreprise.
- Journal confidentiel du CRM pour les modifications faites par le super admin.
- Aucun contact avec les abonnements, paiements de plateforme, factures JSC ou dépenses existantes.

## Écrans
Espace entrepreneur — nouvelle entrée **Finances** (/entrepreneur/finances) :
- **Vue d'ensemble** : dû aujourd'hui, échéances passées (libellées « règlement non suivi dans ce module »), 7 et 30 prochains jours, montants estimés et à compléter, prochaines échéances, bouton « Ajouter une obligation ».
- **Calendrier** : agenda chronologique (défaut sur téléphone) et vue mois ; clic sur un jour pour le détail.
- **À payer** : tableau paginé côté serveur, filtres, tri.
- **Paramètres** : devise CAD, fuseau America/Toronto, catégories personnalisées (créer, renommer, archiver).

Super admin — entrée **Finances** : choix explicite de l'entreprise (nom affiché avant toute saisie), mêmes écrans en mode assistance.

Aucun onglet Factures, Banque ou Comptabilité affiché.

## Formulaire d'obligation
- Rapide : libellé, bénéficiaire (fiche CRM ou texte libre), catégorie, montant total, qualité (confirmé / estimé / à compléter), date d'échéance, fréquence (ponctuelle / mensuelle).
- Avancé (replié) : date de paiement planifiée, fin de série ou nombre d'occurrences, référence de contrat, notes privées, dates de service/renouvellement/préavis, responsable, moyen envisagé, « prélèvement déjà organisé », liens camion/chantier/document, nature (charge, dette, taxe, actif, dépôt, transfert).
- Montant vide ≠ zéro ; montants négatifs refusés ; contrôle serveur.
- Mention visible : « Ventilation TPS/TVQ non effectuée dans ce module ».
- Modifier, dupliquer en brouillon (nouvelle date demandée), archiver ; alerte de doublon évident sans blocage.

## Récurrence
- Ponctuelle et mensuelle seulement (autres fréquences : FIN-02).
- Mensuelle : jour d'ancrage conservé ; mois trop court = dernier jour disponible (31 janv. → 28 févr. → 31 mars), aperçu des prochaines dates.
- Occurrences générées à la demande pour la période consultée, identité stable, unicité garantie en base (aucun doublon même en double appel).
- Modifier « cette occurrence seulement » ou « celle-ci et les suivantes », avec aperçu de l'impact ; les anciennes versions et occurrences passées sont conservées.
- Annuler une occurrence exige un motif, reste dans l'historique, exclue des totaux. Archiver une série arrête les générations futures à la date choisie.
- Dates métier en date locale, aucun décalage à la veille.

## Totaux
Deux bases au choix : date d'échéance ou date planifiée. Pour la période et les filtres : total confirmé, total estimé, total connu, nombre à compléter, nombre d'occurrences. Calculés sur toute la sélection par un seul service serveur, partagé par la vue d'ensemble, l'agenda, le calendrier et le tableau. Périodes : jour, semaine, mois, trimestre, 6 mois, année, dates personnalisées, avec bornes et fuseau affichés.

## Démonstration (fictive, conservée pour la revue)
- « TEST — Entreprise A » : assurance 1 200 $/mois oct. 2026 → sept. 2027 ; logiciel 85 $/mois 15 oct. → 15 déc. 2026 ; immatriculation 2 400 $ le 20 oct. ; réparation estimée 600 $ le 25 oct. ; téléphone à compléter le 28 oct.
- Attendu : octobre 3 685 $ confirmé, 600 $ estimé, 4 285 $ connu, 1 à compléter, 5 occurrences ; novembre 1 285 $, 2 ; oct.–déc. 6 855 $, 1 à compléter, 9.
- Puis : immatriculation replanifiée au 2 nov. (planifié : 1 885 $ oct., 3 685 $ nov.) ; nouvelle génération sans doublon ; annulation de la réparation (3 685 $) ; série au 31 janv. 2027 ; hausse d'un montant futur avec versions conservées.
- Entreprise B fictive (à créer, marquée TEST) : lectures et modifications des données de A refusées, y compris totaux et recherches. Vérifier aussi lecture seule, membre de A et B, super admin, retrait de droit.
- Aucun compte réel modifié ; comptes fictifs @test.invalid seulement.

## Vérifications
- Tests automatisés : génération mensuelle et fin de mois, absence de doublon, totaux et exclusion des annulations, dates distinctes, droits entre entreprises et lecture seule.
- Navigateur : création, édition, calendrier/agenda/tableau, filtres, rechargement, changement d'entreprise, téléphone 390 px et ordinateur.
- Rapport : testé automatiquement / testé à l'écran / inspecté seulement / non vérifié ; limites (aucun suivi des règlements, taxes non ventilées, fréquences restantes) ; état des taxes, documents, rappels et paiements existants ; suite recommandée FIN-02.

## Détails techniques
- Nouvelles tables (préfixe fin_, company_id sur chacune, GRANT + RLS) : fin_settings, fin_categories (suggestions créées par une action explicite, idempotente), fin_obligations, fin_obligation_versions (règle et montant par date d'effet), fin_occurrences (unique company_id + obligation_id + clé logique « AAAA-MM » ou « once »), fin_occurrence_events (historique figé par trigger). Colonnes réservées : source_document_id (future facture fournisseur remplaçant une estimation), business_event_id (futur grand livre) ; règlements FIN-03 reliés à fin_occurrences.id.
- Droits : fonctions fin_can_read / fin_can_write basées sur entcrm_role ; triggers vérifiant que camion, chantier, contact et document appartiennent à la même entreprise.
- RPC SECURITY DEFINER : fin_ensure_occurrences(company, from, to) avec ON CONFLICT DO NOTHING ; fin_period_totals(company, from, to, base, filtres) ; fin_list_occurrences paginé ; fin_edit_series(scope), fin_cancel_occurrence(motif), fin_reschedule_occurrence. Lecture sans écriture de journal ; écritures du super admin tracées avec l'acteur réel.
- Caches client indexés par entreprise ; changement d'entreprise vide l'état.
- Migration unique additive ; aucune table existante modifiée.

# EXEC-01C — configuration et raccordements, activation interdite dans ce lot

## Sources réellement inspectées (19 octobre 2026, lecture seule)
Métadonnées Cloud : colonnes, défauts, contraintes et clés étrangères de `submissions`,
`submission_fill_profile`, `submission_material_conditions`, `submission_accepted_materials`,
`trips`, `cpn_trips`, `transport_requests`, `submission_site_decisions`, `jsc_requests`,
`jsc_quotes`, `jsc_orders`, `jsc_deliveries`; politiques du dossier et des photos,
définitions `has_role`, `set_dompe_availability`, `submissions_touch_availability`,
`log_submission_availability`, `enqueue_email`, déclencheurs de `submissions`.
Types générés consultés, jamais régénérés. Aucune ligne de contact consultée.

Constats déterminants :
- `has_role` exige le rôle admin **approuvé**, avec `app_role`, pas une chaîne de rôle locale.
- `submissions.status` vaut `nouveau`; `request_type` vaut `livraison` par défaut.
  Le hook ne s'applique qu'à `remblai` + direction explicite `reception` sans contradiction.
  Ancien dossier au sens inconnu : refus, pas interprétation automatique.
- Le déclencheur existant date aussi les pauses : cette date n'est pas une confirmation.
  `exec01_owner_confirmed_at` distingue désormais la confirmation explicite du propriétaire.
- `submission_material_conditions` porte des exigences documentaires; le propriétaire
  ne les écrase jamais. Ses préférences restent dans le profil de réception existant.
- `lead-photos` est **privé en Cloud**, contrairement à son ancienne migration initiale.
  Limite 10 Mo, JPEG/PNG/WebP/HEIC/HEIF. Le nouveau parcours n'accepte que JPEG/PNG/WebP,
  4 Mo, signature MIME contrôlée; aucune nouvelle création de bucket requise.
- `trips.submission_id` et `cpn_trips.submission_id` sont des liens effectifs.
  `jsc_deliveries` n'a pas de lien direct au dossier : aucune association par adresse/client.

## Intégration sans activation
- `src/lib/remblai/activation.ts` : false. Aucun paramètre URL ou variable d'environnement
  n'autorise Cloud. Client chargé dynamiquement seulement après ce contrôle.
- `CrmReceptionPanel` monté dans la fiche `/admin?lead=<id>` existante, invisible tant
  que désactivé; lit le même RPC, jamais un second dossier. Le portail existant sélectionne
  l'adaptateur local/Cloud; accès réel désactivé.
- `schema.sql` et `quota.sql` restent **préparés** : aucune migration publique appliquée.
  Le local applique ces mêmes fichiers byte pour byte, avec fixture structurelle vide.
- Empaquetage répétable : `bun prepared/exec01b/package.ts`; sorties `/tmp/exec01c-package`.
  Contrôle des types : `deno check --config /tmp/exec01c-package/deno.json /tmp/exec01c-package/prepared/exec01b/edge-entry.ts`.
  Ce contrôle prépare les sources; il n'exécute pas l'entrée ni n'appelle Cloud.
- `photos.ts` + adaptateur `lead-photos` : chemin par dossier, empreinte du contenu,
  pas de nom privé dans le chemin, référence privée stockée, URL de lecture 120 secondes.
  Autorisation et code récent avant upload; propriétaire d'un autre dossier refusé.
- `mail-dispatch-hook.ts` : seam du `client-confirmation` existant; conserve
  `client-confirm-<id>`, destinataire serveur, contenu sans traceur, aucun second envoi.

## Activation minimale ultérieure et limites à ne pas masquer
1. **Cloud/PostgREST/JWT non exécutés.** Cause : le projet accessible est le serveur
   public partagé, les essais écrits y sont interdits. Autoriser un environnement Cloud
   isolé, appliquer schema.sql, quota.sql, coordination.sql puis lifecycle.sql préparés et y vérifier JWT réel, rôle approuvé, RLS,
   appels PostgREST et tous les déclencheurs. Aucun nouveau service payant créé ici.
   La fixture copie les colonnes nécessaires et le déclencheur de disponibilité,
   pas les notifications, le SEO, l'audit entreprise ni le schéma complet.
2. **Serveur préparé non déployé.** Cause : toute écriture sous `supabase/functions`
   déclenche potentiellement un déploiement automatique. Après autorisation, empaqueter
   les imports (`src` n'est pas envoyé avec une fonction) et installer l'entrée sous
   `submission-owner-portal/index.ts`; remplacer explicitement les deux verrous false
   seulement après les essais isolés. URL d'origine complète, CORS exact, aucune télémétrie
   sur les routes personnelles. Configuration `EXEC01_PORTAL_ORIGIN`, capture locale
   `EXEC01_MAIL_MODE=capture` et `EXEC01_CAPTURE_URL` tant que l'envoi n'est pas autorisé.
3. **Courriel normal non activé, atomicité lien/file vérifiée localement par EXEC-02.** Cause : les fonctions
   actives restent intactes. Insérer le hook dans `send-transactional-email` après lecture
   du dossier et contrôles d'envoi; remplacer le rendu de `client-confirmation`, conserver
   la file `transactional_emails`. Ne pas insérer le hook dans les données anonymes du
   modèle : elles sont remplacées côté serveur. Avant activation, réserver l'idempotence
   de confirmation et garantir reprise du même lien/message à l'échec d'enqueue.
   Utiliser désormais `enqueueExistingClientConfirmation` et `exec02_dispatch`, pas l'ancien
   hook de préparation séparée : rollback lien/file/opération et reprise sans doublon vérifiés
   sur PostgreSQL local. Le branchement au rendu géré, suppression et désabonnement est écrit par EXEC-02B
   dans les copies préparées du sender/worker; installer et tester ces copies en isolé,
   puis retirer leurs verrous uniquement après autorisation. `prepareMail` absent reste bloquant.
   Codes/renouvellement : adaptateur capture seulement, aucun prestataire réel branché.
4. **Storage API réelle non exécutée.** Cause : aucun fichier test autorisé en Cloud.
   Tester upload/signature/expiry sur le bucket privé de l'environnement isolé. Le test
   actuel applique la vraie politique de chemins/MIME et sert les octets en HTTP local,
   mais n'est pas un test de Storage Cloud. Fichiers historiques non conformes au chemin
   dossier : pas de signature ni migration automatique; rapprochement explicite à préparer.
   Un échec SQL après upload peut laisser un objet privé orphelin : prévoir collecte avant activation.
5. **Quota en bordure.** SQL concurrent testé (30/minute, empreinte uniquement) dans
   `public_request_guard`. L'entrée préparée exige `cf-connecting-ip` provenant d'un
   proxy de confiance; vérifier présence et nettoyage de ce champ côté hébergement,
   sinon accès refusé. Ne pas utiliser une adresse IP fournie par le visiteur.
6. **EXEC-02 développé et validé localement, non activé.** Lecture des voyages explicitement liés seulement; `planifie` n'est pas
   « livraison confirmée ». `cpn_trips` reçu = preuve séparée, jamais ajouté au livré ni
   utilisé pour convertir le restant. Compatibilité, proposition acceptée par propriétaire,
   réservation et autorisation de réception sont préparées dans `coordination.sql`. Aucun lien nouveau vers
   `jsc_deliveries`, aucune identité d'entrepreneur/transporteur exposée.

La configuration des fournisseurs d'authentification et la livraison réelle des messages
ne sont pas établies par `project_info` : elles restent non vérifiées.
## EXEC-02B — mise à jour commune (19 octobre 2026)
- **Terminé dans les sources, non déployé** : payload/render React Email existant, idempotence stable, contact revérifié transactionnellement; copie sender + copie worker avec gardes/suppression et report de rappel hors horaires. Historique événement/lien/enqueue atomique. Mesures trips et corrections au delta dans le panneau CRM déjà monté. Aucun second CRM ni expéditeur.
- **Validé isolément** : SQL/HTTP persistants (35 tests ciblés), capture du vrai rendu React Email, billet partiel 12 → correction 10 → CRM/portail restant 90 et réservé 20; trois largeurs. Types des trois entrées Deno et compilation aperçu. Les fonctions actives restent inchangées.
- **À installer seulement dans un Cloud isolé autorisé** : ordre schema → quota → coordination → lifecycle; fixture locale ne remplace pas tous les triggers. Vérifier JWT/PostgREST/RLS/roles/visibilité/photos. Copies préparées à intégrer au sender/worker existants après empaquetage; conserver leurs constantes scaffoldées et enregistrer le modèle dans le registre existant.
- **Queue API non exécutée localement** : `exec02_defer_message` utilise pgmq.set_vt de l’infrastructure existante; vérifier signature/permissions, reprises, suppression, désabonnement, TTL d’un rappel jusqu’à l’expiration et capture prestataire autorisée. Ne pas recréer l’infrastructure email. Ne pas annoncer une capture comme un envoi.
- **Planificateur écrit, non installé** : `lifecycle-schedule.sql`, repli horaire authentifié avec le credential Vault de la file existante; 24 checks/jour, <=60 min de retard pour journal/courriel, risque de coût récurrent. La capacité est exclue à l’échéance lors de la lecture. Valider d’abord environnement/extensions/acteur système; aucun cron public dans ce lot. Harnais local minute seulement.
- **Proxy** : header fiable absent = refus; nettoyage hébergé non validé. **Codes/renouvellements** : capture locale uniquement, envoi réel séparément autorisé. **Storage** : signatures/upload/collecte d’orphelins à vérifier isolément, aucun objet réel utilisé.
- Aucune dépendance d’activation ne remplace du code courrier/rappels/mesures à écrire; toutes les dépendances restantes exigent autorisation ou validation sur un service hébergé réellement isolé.

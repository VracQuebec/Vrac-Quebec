# EXEC-03 — recherche dans les écrans existants

Sources actives de présentation : `/entrepreneur/carte` et `/entrepreneur/comparateur`.
Local seulement : mêmes chemins avec `?exec03=local`, session HttpOnly du harnais,
PostgreSQL isolé 55439, HTTP loopback 55440. Ce paramètre ne remplace pas l’isolation :
une session serveur est obligatoire et la base est créée vide avec un nom aléatoire.

## Reproduction sans Cloud ni fournisseur externe
1. Utiliser le PostgreSQL local déjà installé et démarré sur 55439; libérer 55440 si le harnais EXEC-02 l’occupe.
2. `bun prepared/exec03/harness.ts` : nouvelle base fictive; aucun compte/chantier réel.
3. `python3 prepared/exec03/check_search.py` : connexion TEST, villes multiples, mémorisation,
   déconnexion/reconnexion, rayon, changement de chantier, résultats sans routage,
   calcul 600 $, capture mobile/ordinateur et téléchargement PDF.
4. `EXEC01B_LOCAL_TEST=1 bunx vitest run src/test/entrepreneur-exec03.test.ts`.
5. `bun prepared/exec03/package.ts` puis `deno check /tmp/exec03-package/prepared/exec03/edge-entry.ts`.

`preferences.sql` est exécuté identiquement dans le harnais et les tests. Les RPC de
membership et de validation géométrique ne permettent ni lecture d’une autre entreprise,
ni préférence malformée. `search-sites.sql` étend seulement les résultats déjà autorisés
par `get_entrepreneur_leads`, avec la ville déclarée : aucune adresse privée ni coordonnée
exacte. Le local fournit des résultats fictifs : il ne valide pas la visibilité Cloud.

`edge-entry.ts`, `maps-provider.ts`, `search-endpoint.ts` : même handler préparé pour
Cloud/local, verrou false sans variable d’activation. Google Routes automobile,
Places (New) serveur uniquement. En local, ces fournisseurs restent indisponibles,
pas simulés. Cache 15 min / indisponibilité 30 s, déduplication en cours, maximum
25 destinations proches par recherche; autres routes restent inconnues.

## Activation distincte, interdite dans ce lot
Voir `prepared/exec01b/activation-checklist.md`. Autoriser Cloud isolé puis appliquer
preferences.sql et search-sites.sql, installer l’entrée empaquetée entrepreneur-search,
vérifier JWT/RLS/membership, Google sur origine autorisée, et retirer les verrous après
validation. L’activation des appels Google exige une revue de coût : usage facturé,
session obligatoire, appels bornés; aucun appel Google dans ces essais.

Limites : dessin et rendu Google non testables en sandbox; vérifier sur un domaine
autorisé, sans appeler « camion lourd validé » un trajet DRIVE. Région issue du
référentiel existant, volontairement incomplet; ville inconnue reste inconnue.
Quantités/documents/compositions/horaire ne deviennent jamais une autorisation :
la proposition EXEC-02 assure leur validation. Aucune facture/punch/paiement modifiés.
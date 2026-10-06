# Direction mobile finale — Vrac Québec

## Audit de la version TEST
- **Accueil** : la phrase « Voici ce qui se passe aujourd’hui » et les longues consignes d’action ralentissent la lecture. Les adresses complètes, la ville répétée et les métadonnées empilent trop de lignes.
- **Chantiers** : listes déjà ouvertes à conserver; ajouter des repères par icône et condenser la hiérarchie sans retirer les informations consultables.
- **Dompes** : le titre « Trouver une dompe » répète « Dompes à proximité ». Les filtres soulignés ressemblent à des onglets web; recherche et bouton filtre restent trop encadrés.
- **À préserver** : carte actuelle, marqueurs individuels, interactions, recherche, filtres, fiches, navigation à cinq entrées, groupes du menu Plus, protection Dynamic Island et zones sécuritaires.

## Harmonisation du vert
Une seule définition officielle : **#7DD520**.

| Valeur trouvée | Usage | Traitement |
|---|---|---|
| `#7ED321` | Ancienne signature, couleur d’installation, certains composants publics et partagés | Remplacer les usages de marque autorisés |
| `hsl(89 74% 48%)` ≈ `#7DD520`, mais pas strictement identique | Couleurs principales, accents, focus et halo du thème clair | Référencer le token exact |
| `hsl(89 74% 50%)` ≈ `#82DE21` | Variante du thème sombre | Référencer le même token exact |
| HSL précis équivalent à `#7DD520` | Espace Entrepreneur et feuilles mobiles | Supprimer la duplication, référencer le token unique |
| `#548E15` | Ancienne surcharge mentionnée dans l’historique; absente des fichiers actifs inspectés | Ne pas réintroduire |

Les verts de disponibilité, de succès, de matériaux et de partenaires, dont WhatsApp, restent fonctionnels et distincts. Les couleurs enregistrées par les entreprises ne sont pas réécrites.

**Limite de périmètre :** les valeurs présentes dans le Super Admin, Ma flotte et les documents métier personnalisables ne seront pas remplacées arbitrairement. Leurs fichiers et leurs couleurs fonctionnelles restent inchangés. Les icônes d’installation et logos bitmap seront vérifiés séparément; aucune photographie ne sera recolorée.

## Ajustements visuels
Conserver « Liste compacte », les polices actuelles et le vert confirmé; ne pas relancer une refonte générale.

### Accueil
- Bonjour et entreprise, puis une seule indication compacte issue des données réelles.
- Actions réellement requises sous forme de lignes courtes avec icône : intitulé principal, localisation secondaire, label « Besoin à préciser »; consigne complète accessible dans le dossier et aux lecteurs d’écran.
- Mes chantiers : repère chantier discret, adresse prioritaire, matériau/quantité puis statut et référence/date secondaires. Les détails complets restent dans le dossier.
- Quatre raccourcis iconiques compacts : Demande, Dompes, Transport, Matériaux; conserver les destinations existantes.

### Dompes — entourage uniquement
- Un titre « Dompes » avec icône et nombre réel de résultats.
- Chips horizontaux pour les matériaux déjà disponibles, vert exact pour la sélection.
- Recherche légère avec icône et bouton filtre carré tactile.
- Réduire les espaces et textes répétés avant la carte.
- **Aucune modification de la carte** : conserver les 469 marqueurs individuels actuellement présents, leurs coordonnées, leur décalage visuel existant, leur sélection, leur zoom et leurs fiches; aucun clustering.

### Chantiers et navigation
- Même présentation iconique compacte sur la liste des chantiers.
- Navigation et menu Plus conservés, sans retirer de fonction ni toucher à Ma flotte.
- Cibles tactiles d’au moins 44 px; raccourcis de 64 px maximum; pas de grosses cartes, nouvelles statistiques ou effets décoratifs.

## Vérification et livraison
- Contrôles navigateur sur petits et grands téléphones, tablette et ordinateur.
- Zones iPhone simulées : header, contenu, navigation, scroll et fenêtres sans chevauchement.
- Recherche, chips, filtres, menu Plus, fiche dompe et accès aux dossiers.
- Vérifier le nombre réel de marqueurs individuels et l’absence de clustering, sans écriture métier.
- Vérifier les couleurs calculées et les tests existants.
- Donner le bilan des anciennes couleurs, des écrans ajustés et des contrôles effectués.
- **TEST uniquement, aucune publication, aucune donnée ni logique métier modifiée.**
- Le test sur **iPhone physique** devra être effectué par vous : cet appareil n’est pas accessible depuis les outils de contrôle.

## Détails techniques
- Token HSL unique dans le thème global, équivalent exact de `#7DD520`; `primary`, `accent` et `ring` le référencent.
- Préserver explicitement l’apparence du Super Admin et de Ma flotte lors du remplacement des valeurs globales.
- Réutiliser la coquille, les composants et les sources de données existants; modifications de présentation seulement.
- Ne pas éditer le chargement Google Maps, la création des marqueurs, les règles de filtrage, les coordonnées, l’authentification ou les permissions.
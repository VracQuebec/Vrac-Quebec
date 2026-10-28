# Lenteur photos/documents — 28 octobre 2026 (aperçu seulement)

## Mesuré (Chromium sans affichage, bac à sable, photo synthétique 4032×3024)
- Avant : 10,54 Mo envoyés tels quels, un fichier après l'autre.
- Après : 2,35 Mo (−78 %), compression en 276 ms, 3 envois en parallèle, 3 essais automatiques.
- Estimation réseau à 5 Mb/s montants (4G moyenne, non mesurée) : 6 photos ≈ 101 s → ≈ 23 s.

## Causes vues dans le code
- Aucune compression nulle part; photos de téléphone envoyées en taille originale.
- Envois en série (`for … await`) dans RemblaiForm, StepDetails, ParcoursForm.
- Échec réseau = photo perdue sans message ni nouvel essai.
- CrmFiles : la liste affiche les photos originales signées en 64 px (pas de miniature).
- Vérification des droits (`secure-file`) : un aller-retour par ouverture; non mesuré avec vraie session.
- Disque à 43 % : aucun lien établi avec la lenteur.

## Non mesuré
PDF et gros documents réels, réseau réel, durée serveur des droits, appareil physique.

## Non fait
Miniatures serveur (CrmFiles, documents), compression pour CRM/flotte/finances, transfert direct, cookies/mesure.

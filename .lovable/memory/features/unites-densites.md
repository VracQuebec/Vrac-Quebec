---
name: Unités de commande et densités
description: Conversion tonnes/m³/verges³ dans le moteur de soumission, densités et unités permises administrables par matériau.
type: feature
---
- Le formulaire d'achat de vrac accepte trois unités : tonnes, m³, verges³. Le moteur convertit tout en tonnes avant calcul.
- Conversion : verge³ × 0,764554857984 = m³ ; m³ × densité/1000 = tonnes.
- Chaque matériau possède `density_kg_per_m3` et `allowed_units` dans `jsc_materials` (administrables, jamais codés en dur).
- Densités configurées : terre tamisée 1300, sable 1600, sable à compaction 1650, pierre 0-3/4 1700, pierre 3/4 net 1500, poussière de pierre 1600.
- Sans densité, l'unité de volume n'est pas offerte au client et le moteur renvoie un message clair (jamais de plantage).
- RPC publique `jsc_public_material_units` : expose slug, unités permises et présence de densité, sans donnée de prix.

# Maquettes — gestion des accès clients

⚠️ **PROPOSITIONS, PAS ENCORE VALIDÉES PAR DAVID.**

Statut différent de `maquettes/*.html` à la racine, qui sont des **références validées**
et font loi. Celles-ci sont une proposition du Pilote, à analyser et à discuter.
Rien ici n'est une exigence tant que David ne l'a pas dit.

Largeur de référence : **1040 px**. Tokens de couleur repris de `css/base.css`
(l'interface équipe), pas de `client.html`.

## Les cinq écrans

| Fichier | Ce qu'il montre | Lot |
|---|---|---|
| `01-ensemble.html` | La carte d'ensemble : ce qui se décide au niveau marque, ce qui se décide au niveau mission, et ce qui existe déjà | — |
| `02-liste-marques.html` | La liste des 63 marques : espace ouvert ou fermé, nombre d'interlocuteurs, retours accordés | 3 |
| `03-fiche-marque.html` | La fiche d'une marque : la porte de l'espace, les retours accordés au contrat, les interlocuteurs et leurs actions | 3 et 4 |
| `04-carte-mission.html` | Le bloc client sur la fiche sujet : quels interlocuteurs suivent CETTE mission, et le nombre de retours qui ne vaut que pour elle | 2 et 5 |
| `05-emprunt-lecture-seule.html` | Le parcours « voir comme le client » depuis un commentaire, et le bandeau de consultation | 1 |

## Ce que les maquettes tranchent

1. **La cascade est visible, jamais implicite.** Sur la carte, le nombre hérité
   s'affiche en gris avec sa provenance (« hérité de Refashion ») ; il faut cocher une
   case pour le remplacer. Cascade complète : carte, sinon marque, sinon 5.
2. **Les interlocuteurs d'une mission sont une SÉLECTION**, jamais une saisie : on coche
   parmi ceux de la marque. Un contact ne peut pas naître depuis une carte.
3. **Le code d'accès client n'est affiché nulle part** — ni à la création, ni dans la
   liste, ni sur la fiche. Tiré au hasard, envoyé à l'interlocuteur. « Nouveau code »
   en tire un autre et invalide l'ancien.
4. **Un espace ouvert sans interlocuteur actif est signalé en ambre** dans la liste :
   c'est une porte ouverte sans personne derrière, ça doit sauter aux yeux.
5. **Le bandeau « lecture seule » de l'emprunt est un confort, pas la garantie.** Le
   refus d'écriture vit sur le serveur. La maquette le dit explicitement à l'écran.

## Données illustratives

Les marques sont réelles (Refashion, Fondation de France, AXA, Engie, Trade Republic,
et le total de 63). Les tokens de couleur et le libellé « tour 2 sur 5 » sont réels.

**En revanche sont INVENTÉS, pour que l'écran se lise :** les codes marque affichés, les
noms et mails des interlocuteurs, et tous les compteurs (8 ouverts / 55 fermés /
3 sans interlocuteur / 14 missions). Ne pas les prendre pour des mesures.

## État réel des bases, vérifié

- `🏷️ Clients Brand` existe, avec un champ `Espace client activé` décrit comme
  « Porte de l'espace client : décoché = personne de cette marque ne peut se connecter ».
  **Il n'a PAS de champ de retours accordés** — c'est le niveau manquant de la cascade.
- `Séries accordées` existe sur la carte (DB_PROD), **vide sur les 581 cartes**. Le 5
  vient du code (`espace-client.js:59`), pas d'une valeur saisie.
- `👤 Contacts Client` rattache un contact à sa marque par un **texte** (`Code Brand`),
  pas par un lien. Il n'y a donc pas d'association réelle marque ↔ interlocuteurs.
- Aucun écran d'administration client n'existe dans le dépôt : aucune fonction d'admin.

# Maquette — la coque d'app de l'espace client

`espace-client-app.html` — **contenu fictif, NON VALIDÉE. Ne jamais déployer ce fichier.**

Maquette de référence des **quatre destinations** de l'espace client, dans une coque
d'application : rail à gauche sur bureau, barre d'onglets en bas sur téléphone.

| vue | id | état côté production |
|---|---|---|
| Mes films | `s-proj` | existe (`vue-accueil`), à faire évoluer |
| Mes demandes | `s-dem` | **n'existe pas** — serveur prêt, écran absent |
| Proposer un film | `s-mis` | **n'existe pas** — serveur prêt, écran absent |
| Qui a accès | `s-eq` | **n'existe pas** — rien, ni écran ni écriture |

Distincte de `../maquette-B-16x9.html` et consorts, qui fixent la vue **montage**.
Celle-ci fixe la **navigation** et les trois écrans qui l'entourent.

## Ce n'est pas du code de production

C'est une **référence du résultat**, jamais une source à copier. La page est autonome :
son CSS, sa coque à quatre vues, ses noms de classes. `client.html` fait 1751 lignes,
n'a que quatre vues (`vue-chargement`, `vue-login`, `vue-accueil`, `vue-montage`) et
construit tout par concaténation de chaînes en JS. La transplanter = le réécrire.

**L'autorité reste `client.html` et les contrats serveur existants.**

L'en-tête du fichier HTML (45 lignes de commentaire, tout en haut) porte le détail :
ce qui est déjà construit côté serveur, ce qui manque, les déviations assumées par
rapport au code actuel, et les décisions encore ouvertes. **À lire avant de coder.**

## Ce qui est déjà construit côté serveur

- `demande-client.js` — actions `creer` et `mes`. En-tête : « Lot A — circuit COURT ».
- `mission-client.js` — actions `creer` et `mes`. En-tête : « Étage 2a ».
- `client.html:542-543` déclare déjà les constantes `DEMANDE` et `MISSION`.

La plomberie des deux portes client existe. Il manque l'écran.

## Contraintes vérifiées que la maquette respecte

- `demande-client.js:17` — `TYPES = ['Décaler un tournage', 'Autre']`, select **fermé**.
- `demande-client.js:18` — `MAX_TEXTE = 2000`.
- `demande-client.js:97` — `codeCarte` facultatif, mais borné au périmètre de la marque.
- `demandes-admin.js:13` — `STATUTS = ['Nouvelle','En cours','Traitée','Refusée']`.
- `_slack.js:3` — Slack ne porte que nom de marque + libellé + lien.
- `_authclient.js:236` et `:260` — un `Code acces` n'est jamais lu, jamais renvoyé.
- Base `📨 Demandes client`, sur `Code carte` : « Rattachement par code, **JAMAIS de relation** ».

## Piège à ne pas tomber dedans

Le sélecteur « Type de film » ne propose que 7 des 9 valeurs de `Sous-format` :
Classic, Standard et Desk en ont été retirés **sur demande**. Mais **50 fiches
existantes les portent** (24 / 20 / 6). On retire un **choix à la création**, pas une
valeur de l'**affichage**. « Mes films » doit continuer à les afficher.

## Décisions tranchées — état au 15/11/2026

| sujet | décision |
|---|---|
| modèle du fil | **option B** : base `💬 Messages`, 1 ligne = 1 message, rattachée **par code** |
| référence de ticket | `DEM-207` / `MIS-14` — propriété `Réf` de type `auto_increment_id` |
| 5ᵉ statut | **`Clôturée`**, posée par le client, transition bornée serveur |
| modifier son dernier message | **on garde** — borné au dernier message, de soi, sans réponse en dessous, hors demande clôturée. **La règle doit être rejouée SERVEUR**, le navigateur n'en est pas l'autorité |
| cibles tactiles | **44 px partout**, comme `client.html` (`.bouton` `:313`, `.lnk` `:349`). Appliqué |
| contraste `--txt3` | à corriger vers `#84849C`, dans un **PR dédié** |
| « Pour combien » | c'est un **vrai format éditorial**. Option créée |
| « YouTube » dans les deux listes | **on garde les deux** : un Mag 9:16 part souvent en YouTube Short. Plateforme ≠ format |
| contact référent | **pas de référent pour l'instant** — tout contact d'une marque peut en ajouter un autre. Décision provisoire et assumée |

## Notion : déjà fait, et testé en écriture réelle

Une ligne a été créée dans chaque base, relue, puis supprimée.

| base | créé | vérifié |
|---|---|---|
| Production | option `Pour combien` sur `Sous-format` | les 9 autres intactes |
| 📨 Demandes | statut `Clôturée` · propriété `Réf` (préfixe `DEM`) | numéro attribué : 1 |
| 🎬 Missions | propriété `Sous-format` (10 valeurs) · `Réf` (préfixe `MIS`) | numéro attribué : 1 |
| 💬 Messages | base créée : `Message` · `Réf demande` · `Sens` · `Auteur` · `Code Brand` · `Modifié le` | 2 messages du même fil acceptés, les deux sens |

**Trois pièges mesurés, à ne pas redécouvrir :**

1. L'API **sait** créer une propriété `auto_increment_id`. Mais le préfixe doit faire
   **2 à 10 caractères** : `D` seul est refusé, d'où `DEM` et `MIS`.
2. L'API renvoie le numéro **nu** (`"1"`), pas `"DEM-1"`. Le préfixe vit dans le schéma :
   **le serveur doit le composer**.
3. Modifier un select **supprime toute option non listée**. Il faut rejouer les options
   existantes avec leurs couleurs, sinon les 586 fiches perdent leur sous-format.

## Ce qui reste ouvert

- **La fabrication du code d'accès d'un collègue.** L'app n'envoie aucun mail et ne le
  peut pas à court terme (ni fournisseur, ni domaine expéditeur vérifié). Le chantier
  « mail réel » est mis de côté : il dépend d'une décision d'équipe chez Réel Média.
  L'état « En attente d'accès » de la maquette reste donc la seule option honnête.
- **Un bug dans `mission-client.js:126`** : `props['Plateforme'] = { select: ... }` alors
  que `Plateforme` est un **multi-select**. Et `body.plateforme` n'accepte qu'une valeur.
  Testé : la base accepte bien `["Instagram","TikTok"]`.
- **`Format image` existe déjà** sur 🎬 Missions, en multi-select `9:16` / `16:9`.
  Rien à créer, seulement à brancher — `mission-client.js` ne l'accepte pas encore.
- Pagination au-delà de 50 demandes, et aucun champ de recherche dans la liste.

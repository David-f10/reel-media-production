# Maquette — la coque d'app de l'espace client

`espace-client-app.html` — **contenu fictif, NON VALIDÉE. Ne jamais déployer ce fichier.**

Maquette de référence des **quatre destinations** de l'espace client, dans une coque
d'application : rail à gauche sur bureau, barre d'onglets en bas sur téléphone.

| vue | id | état côté production |
|---|---|---|
| Mes films | `s-proj` | existe (`vue-accueil`), à faire évoluer. ⚠ **ne peut pas être monté avant la coque** — voir plus bas |
| Mes demandes | `s-dem` | **existe en version réduite** — bloc « 📨 Une demande rapide » dans l'accueil (`renderDemandes()` `client.html:700`, appelé `:843`) : formulaire + liste `#mes-demandes`. La maquette en fait une **destination** avec fil, statuts et suivi |
| Proposer un film | `s-mis` | **existe en version réduite** — bloc « 🎬 Proposer un nouveau film » (`renderMissions()` `client.html:725`, appelé `:844`). La maquette en fait une **destination** |
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

## Décidé le 15/11 au soir — ce qui a changé dans ce fichier

| sujet | décision |
|---|---|
| **« À valider » et « À relire »** | **supprimées en tant que sections.** Ce sont des **états** dans « En cours » : un seul endroit où le client regarde ses films |
| les quatre états | `Séquencier à valider` **rouge, cliquable** · `V4 · à relire` **ambre, cliquable** · `Montage en cours` gris, inerte · `Validé par vous` **bleu**, inerte |
| la pastille **est** l'action | pour un état qui demande quelque chose, c'est elle le point d'entrée |
| `tour 3 sur 5` et `déposée le` | passent **sous la pastille** (`.p-sub`). Ne pas supprimer : c'est ce qui évite au client de demander une série de corrections de trop |
| **les deux boutons de validation** | ⚠ ils n'existent qu'à `client.html:872-873`, dans la section supprimée. **Proposition retenue : ils descendent dans l'overlay du séquencier** (`:1673-1686`), qui n'a qu'un « ✕ Fermer » aujourd'hui. Mieux qu'aujourd'hui, où un client peut valider **sans avoir ouvert le document**. C'est du travail NEUF |
| actions de rangée | **emplacements fixes**, un par type : ▶ puis 📄 (En cours), ▶ ⬇ 📄 (Livrés). Slot vide = place tenue. Vérifié au pixel sur toutes les rangées |
| `--txt3` | passé à `#84849C` ici aussi (PR #244). L'ancien `#5A5A70` échouait AA |

### ⚠ La grille suppose la coque — mesuré, pas supposé

684 px de colonnes fixes (84+120+180+150+150), Film en `1fr`.

| | contenu | colonne Film |
|---|---|---|
| `.vue` de la maquette, 1140 px | 1084 px | **400 px** |
| accueil actuel, `.wrap` 760 px (`client.html:41`) | 728 px | **44 px** |

**Conséquence : « Mes films » ne peut pas être monté avant la coque.** Code l'a
mesuré et s'est arrêté avant d'écrire une ligne — il avait raison. Les options
« élargir seulement les deux sections » et « réduire les largeurs » sont écartées :
la première viole la règle de ce fichier (« une seule largeur par vue — jamais deux
blocs de largeurs différentes l'un sous l'autre », ligne 129), la seconde le verrou
des colonnes. Reste : **faire la coque d'abord**.

## Décisions tranchées — état au 15/11/2026

| sujet | décision |
|---|---|
| modèle du fil | **option B** : base `💬 Messages`, 1 ligne = 1 message, rattachée **par code** |
| référence de ticket | ⛔ **NON TRANCHÉE — ne pas partir sur `auto_increment_id`**, voir « Pièges » plus bas. Piste : dériver **6** caractères de l'id de page Notion, que l'app a déjà (`demandes-admin.js:85` renvoie `id`). Question à poser à Code |
| 5ᵉ statut | **`Clôturée`**, posée par le client, transition bornée serveur |
| modifier son dernier message | **on garde** — borné au dernier message, de soi, sans réponse en dessous, hors demande clôturée. **La règle doit être rejouée SERVEUR**, le navigateur n'en est pas l'autorité |
| cibles tactiles | **44 px partout**, comme `client.html` (`.bouton` `:313`, `.lnk` `:349`). Appliqué |
| contraste `--txt3` | ✅ **fait** — `#5A5A70` → `#84849C`, PR #244 mergée le 15/11. ⚠ ne corrige QUE `client.html` : `review.html:14` et `css/base.css:4` (`--text3:#555`, **248 usages**) restent en échec AA |
| « Pour combien » | c'est un **vrai format éditorial**. Option créée |
| « YouTube » dans les deux listes | **on garde les deux** : un Mag 9:16 part souvent en YouTube Short. Plateforme ≠ format |
| contact référent | **pas de référent pour l'instant** — tout contact d'une marque peut en ajouter un autre. Décision provisoire et assumée |

## Notion : déjà fait, et testé en écriture réelle

Une ligne a été créée dans chaque base, relue, puis supprimée.

| base | créé | vérifié |
|---|---|---|
| Production | option `Pour combien` sur `Sous-format` | les 9 autres intactes |
| 📨 Demandes | statut `Clôturée` | les 4 autres intactes. ⚠ `demandes-admin.js:13` ne la connaît pas : personne ne peut la poser aujourd'hui |
| 🎬 Missions | propriété `Sous-format` (10 valeurs) | `Format image` et `Plateforme` intactes |
| 💬 Messages | base créée : `Message` · `Réf demande` · `Sens` · `Auteur` · `Code Brand` · `Modifié le` | 2 messages du même fil acceptés, les deux sens |

**Trois pièges mesurés, à ne pas redécouvrir :**

1. ⛔ **Une propriété `auto_increment_id` CASSE L'APP.** L'API sait la créer — mais
   `_notionio.js:45` lit Notion en `2022-06-28`, version **antérieure** à ce type.
   Créée le 15/11 sur 📨 Demandes et 🎬 Missions, elle a mis le panneau « Demandes &
   missions » en **503** ; retirée le soir même. Ne pas y revenir sans monter l'app en
   version d'API — ce qui touche **toutes** les fonctions.
2. ⛔ **Une base neuve n'hérite d'aucun accès.** Les bases 📨 Demandes et 🎬 Missions
   ont été créées sans être connectées à l'intégration HAVANA. Résultat : 404 Notion →
   503 côté équipe **et** côté client, pendant des semaines, **en silence** — la
   pastille avale les échecs (`index.html:5748`, `catch(e){}`). Toute base neuve doit
   être connectée à la main, dans Notion : `•••` → Connexions. Aucune API ne le fait.
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
- ✅ **Pagination de `'mes'` : faite**, PR #245 mergée le 15/11 (curseur, `page_size` 100,
  bornée à 20 pages). Il reste à ajouter un champ de recherche dans la liste.
- **`sousFormat` sur les films EN COURS : le serveur l'envoie** depuis PR #245
  (`espace-client.js:211`), **mais rien ne l'affiche** — `client.html:914` ne rend que
  `code` et `realisePar`. L'affichage viendra avec le PR « Mes films », où le type est
  une **colonne** de la grille (`--kt:120px`), pas un bout de texte en plus.

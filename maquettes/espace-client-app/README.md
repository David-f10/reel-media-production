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

## Décisions encore ouvertes

Elles sont listées dans l'en-tête du fichier HTML. En résumé : le modèle de stockage
du fil de discussion, la référence de ticket (`D-207` / `M-14`), un cinquième statut
« Clôturée », deux propriétés Notion à créer, la fabrication du code d'accès d'un
collègue ajouté par un client, le droit d'ajouter un contact, la taille des cibles
tactiles, et le contraste du jeton `--txt3`.

**Rien de tout cela n'est tranché. Ne pas coder en supposant une réponse.**

# Lot G tranche 2 — spécification

Tout ce qui a été décidé le 26 octobre 2026 sur l'espace client, destiné à Claude Code.
À lire avec `VISION_ESPACE_CLIENT.html`, qui montre les écrans (bouton **Notes** en haut
pour les annotations).

**Rien dans ce document ne concerne la PR 3**, qui est l'habillage de la tranche 1 et se
termine avec `MAQUETTE_ESPACE_CLIENT.html`.

---

## 1. Où on en est

| | état |
|---|---|
| PR 1 — observabilité, CORS resserré, throttle persistant | mergée |
| PR 2 — jeton de session, code plus stocké côté navigateur | mergée |
| PR 3 — habillage visuel | poussée, en attente d'une correction visuelle |
| Tranche 2 | spécifiée ici, pas commencée |

Acquis de la tranche 1, qui ne doivent pas être défaits :

- jeton de session signé HMAC, charge utile `{id, exp}`, TTL 14 jours, `CLIENT_SIGN_SECRET`
- le code d'accès ne transite qu'au login et n'est stocké nulle part côté client
- `contactActif(id)` relit la base Contacts à chaque appel, cache 60 s → révocation ~60 s
- cloisonnement par préfixe de code Brand, vérifié en production : un client ne voit que sa marque
- réserve 2 : un échec rend 401 ou 503, **jamais** une liste vide

---

## 2. La décision fondatrice

**`review.html` n'est plus la destination du client. La validation se fait dans l'espace.**

Décision de David, 26 octobre. Ce qu'elle implique :

- **plus aucun lien porteur n'est envoyé à un client.** L'accès passe par sa session.
- **plus de ré-identification.** Il est déjà authentifié ; lui redemander prénom et
  entreprise est une couture visible.
- **les notifications par mail pointent vers l'espace client**, jamais vers une review.
  Sans ça, le bloc « À relire » n'est jamais vu et la page ne sert à rien.
  *(Décision d'ops à confirmer par David avant de commencer.)*
- **`review.html` ne disparaît pas** : il reste l'outil de l'équipe.

---

## 3. La numérotation des versions — la règle la plus facile à rater

En interne, les montages Brand s'appellent V1, V2, V3, V4… Quand la V4 est validée en
interne et envoyée au client, elle devient **sa Version 1**. S'il demande des corrections,
la V5 interne devient **sa Version 2**.

**Aucun numéro interne ne doit jamais sortir dans l'espace client.** Sinon il lit
« Version 4 » puis « Version 7 », il compte, et il demande ce qu'il y avait entre les deux.

**Comment le numéro client se calcule.** C'est le rang de la version parmi celles envoyées
au client, classées par **date d'envoi**. On ne stocke pas un numéro client à la main : il
dériverait au premier oubli. On stocke la date d'envoi, qui ne bouge plus une fois posée —
donc le rang ne bouge plus non plus.

**Le piège.** Si une version est montrée puis remplacée derrière, les numéros ne doivent
pas glisser. La règle qui tient : **une version montrée garde son numéro pour toujours.**
On ne « dé-montre » pas. La suivante prend le numéro suivant, parce que c'est ce que le
client a vécu, et c'est son vécu qui fait foi dans son espace.

**Ce qu'il faut côté Notion :** un champ **date d'envoi au client** sur `DB_VERSIONS`.
C'est lui, et lui seul, qui porte toute la numérotation client. *(Travail pour Master.)*

**La réciproque, côté équipe :** HAVANA doit afficher la correspondance. Quand un client
écrit « j'ai un souci sur la V2 », le monteur doit lire « sa V2 = notre V7 ». Ça n'a rien à
faire dans l'espace client, mais il faut que ce soit quelque part.

---

## 4. Les trois états d'une version client

Dits **du point de vue du client**, jamais du vôtre.

| état | sens |
|---|---|
| **à relire** | envoyée, il n'a encore rien fait |
| **retours envoyés** | il a demandé des corrections, ce tour est clos |
| **validée** | terminal, le film part en diffusion |

**Invariant à tenir dans les données : une version validée est toujours la dernière.**
S'il existe une version après une version validée, c'est une incohérence, pas un cas
métier. C'est vérifiable automatiquement.

**Pas de quatrième état « validée avec remarques ».** Un client qui écrit « ok mais corrige
la faute » demande une correction, pas une validation. Lui laisser cocher « validé » tout en
demandant un changement, c'est facturer une diffusion sur un film qu'il croit encore
modifiable — un litige en préparation.

---

## 5. Les deux actions terminales — un trou du circuit actuel

Aujourd'hui `review.html` n'a qu'un bouton : « Valider cette version ». **Un client qui
laisse trois retours et ferme son navigateur ne signale jamais qu'il a fini.** L'équipe ne
sait pas si d'autres retours arrivent : elle attend, ou elle lance la correction et un
quatrième retour tombe le lendemain.

La vue montage de l'espace a donc **deux** actions terminales :

- **Valider cette version** (vert) → le film part en diffusion tel quel
- **Envoyer mes retours** (neutre) → ce tour de relecture est clos, une nouvelle version se lance

Les deux préviennent l'équipe immédiatement. Jamais une seule action terminale.

---

## 6. Les écrans

### 6.1 Mon espace

Ordre des blocs, qui répond à *pourquoi un client ouvre cette page* :

1. **À relire** — le seul bloc qui demande une action, donc le premier. Source :
   `DB_VERSIONS`, versions envoyées sans retour ni validation du contact. Le bouton
   « Voir le montage → » **bascule sur la vue montage dans l'espace**, il ne quitte pas le site.
2. **Votre collaboration** — trois faits : films livrés, en cours, depuis *(mois année)*.
   Calculés côté serveur sur le préfixe de code de la marque, jamais dans le navigateur.
   Les chiffres de plaquette — « N mois de collaboration », « N journalistes mobilisés » —
   ont été coupés : le second peut même se lire à l'envers.
3. **En cours** — `DB_PROD`, projets non diffusés, avec une barre de progression à quatre
   étapes : Tournage · Montage · Validation · Diffusion. **La barre se déduit du statut de
   production, mais le client n'a pas à voir vos états internes** : il faut une traduction
   côté serveur. La pastille à droite ne répète pas l'étape, elle porte **une date**. Sans
   date fiable, pas de pastille — mieux vaut rien qu'une promesse molle.
4. **Livrés** — tableau code / film / réalisé par / diffusion / actions. Les dix plus
   anciens sont repliés derrière « Tout afficher » : l'archive ne doit pas pousser la page
   à quatre écrans.
5. **Votre interlocutrice** — la référente seule, sans compteur de films.
   *Décision d'entreprise prise par David : on ne liste plus toute l'équipe avec son nombre
   de films, ça dit à un client qui travaille pour lui et les rend démarchables.*

L'en-tête porte « à jour il y a N min » : un client qui revient se demande toujours s'il
regarde une page fraîche.

### 6.2 Vue montage

C'est `review.html` rapatrié dans l'espace, servi par la **session** du client.

- lien « ← Mes projets » pour revenir
- titre du film, pastille de code, « Version N · déposée le … » — **numéro client**
- sélecteur de version en pastilles, avec l'état de chacune
- lecteur de la vidéo, servi depuis Drive **sous contrôle de périmètre**
- panneau de droite : les retours de la version affichée, le formulaire
  (timecode, catégorie, texte), puis les deux actions terminales
- sur une version close, **le formulaire disparaît** et laisse un bandeau qui dit ce que le
  client a fait. Pas un formulaire grisé : un champ désactivé invite à cliquer dessus pour
  comprendre pourquoi.

**À construire :** lecture de la vidéo depuis Drive sous périmètre, écriture dans
`DB_RETOURS` rattachée au contact authentifié, validation de version, et la bascule de
version.

### 6.3 Premier accès

Un client qu'on vient de brancher ne doit pas voir cinq sections vides — c'est le moment
précis où il se fait son opinion. Un écran d'accueil remplace le vide tant qu'il n'y a ni
film livré, ni film en cours, ni version à relire : trois phrases qui disent ce qui va se
passer, et le nom de l'interlocutrice.

**Il ne doit jamais s'afficher à la place d'une panne.** Un échec de calcul reste un
« service temporairement indisponible », jamais un « premier accès ». C'est la réserve 2
appliquée à l'état vide.

---

## 7. Le vocabulaire

Le mot de la maison est **retour**, jamais **avis**. `review.html` dit déjà « Mes retours »,
« Laisser un retour », « Ajouter à mes retours ». Un bouton « Donner mon avis » se comprend
comme « noter la collaboration » — testé, confirmé.

Le bouton d'entrée dit donc **« Voir le montage → »** : il emmène regarder le film, et ce
que le client fait ensuite reste son choix. Un bouton ne promet pas une action que
l'utilisateur n'a pas encore décidé de faire.

---

## 8. Sécurité — ce qui se transpose

- **Périmètre côté serveur, toujours.** Le client n'envoie jamais un code marque ni un
  identifiant de projet. Tout se dérive du contact authentifié.
- **Réserve 2 sur chaque nouvel appel.** Un échec rend 401 ou 503, jamais une liste vide
  ni un « premier accès ».
- **Aucun numéro interne, aucun statut interne, aucun nom de champ Notion** dans une
  réponse servie au client.
- **Le téléchargement est le seul morceau qui touche à la sécurité.** `drive-download`
  existe pour l'équipe ; il faut une variante client avec le même contrôle de périmètre que
  `projets-client`, plus le quota du lot C. **Le quota s'affiche au-dessus du tableau**,
  pas en erreur au quatrième clic : le design porte la contrainte.
- **`esc()` n'échappe pas les guillemets.** Toute valeur serveur placée dans un attribut
  HTML exige d'étendre `esc()` aux guillemets simples et doubles, dans la même PR, et de le
  signaler. Par défaut : position de texte uniquement.
- **`.hidden` doit garder son `!important`** si un sélecteur d'identifiant pose un
  `display` sur une vue. Sinon la bascule entre vues cesse de fonctionner en silence.

---

## 9. Hors périmètre, explicitement

- pas de menu latéral : l'espace n'a qu'une destination, un menu à un élément est de la
  décoration. À rouvrir seulement si un contact couvre plusieurs marques, ou si des
  factures ou un écran de compte apparaissent.
- pas de vue par statut ni de filtre sur les projets en cours : avec trois à cinq films,
  grouper produit des groupes d'un élément. La barre de progression répond à la vraie
  question.
- pas d'écran de changement de code côté client : la régénération se fait depuis
  l'administration (tranche 3), un bouton au lieu d'un chantier.
- pas de note de collaboration : une note qu'on peut laisser à tout moment ne se remplit
  jamais. Ça se demande par mail, une fois, à la fin d'une série.

---

## 10. Décisions qui attendent David avant de commencer

1. **Les notifications par mail pointent-elles vers l'espace client ?** Sans ça, la tranche
   2 est invisible.
2. **La vidéo des versions passées est-elle regardable ?** Les laisser ouvertes invite au
   « en fait je préférais la fin de la V1 » et rouvre des décisions closes. *Recommandation :
   fermer — les retours restent accessibles, la vidéo non.*

---

## 11. Ordre de travail proposé

1. **Dette équipe d'abord** — throttle sur `login.js`, puis reset des sept codes, puis le
   log manquant dans `_auth.js` qui avale les 401 Notion en silence. C'est le vrai trou
   aujourd'hui, et il est connu depuis le 24.
2. **Le champ date d'envoi client** sur `DB_VERSIONS` *(Master)*, sans lequel rien de la
   tranche 2 ne peut être numéroté correctement.
3. **La vue montage** — le chantier principal.
4. **Les blocs de l'espace** — à relire, collaboration, en cours, livrés, interlocutrice.
5. **Le premier accès.**
6. **Le téléchargement et son quota** *(tranche 4, lot C)*.

---

## Contraintes permanentes

⛔ Claude Code ne merge jamais. Il ouvre la branche et la PR, David merge.
⛔ Aucune valeur de code d'accès, de jeton ou de secret, nulle part.
⛔ Ne pas toucher `index.html`, `login.js`, `_auth.js`, `notion.js`, `_perimetre.js` :
   la porte de l'équipe se traite dans sa propre PR.
⛔ Code propose, David tranche, Code code ensuite.

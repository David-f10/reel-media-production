# PASSATION — Réel Média Production (contexte pilote)

> Dernière mise à jour : 2026-07-23 (chantiers 6→13 · chantiers 10 et 11 VALIDÉS EN RÉEL · chantier 13 vérifié, à tester sur preview)

═══════════════════════════════════════════════════════════════
## 🚨 À LIRE EN PREMIER — REPRISE DANS UN NOUVEAU CHAT
═══════════════════════════════════════════════════════════════

**Ce fichier est la mémoire du projet.** Le chat précédent a atteint sa limite. Voici où en est exactement le travail.

### ✅ CE QUI EST EN PRODUCTION (mergé, testé)
Chantiers 1 à 11. Le dernier merge en date est le **chantier 11** (`index.html`, 6343 lignes) : correction des notifications en double (touche Entrée) + arrivée sur Production au login.

### 🟢 CHANTIER 12 — VÉRIFIÉ, EN COURS DE MERGE
`index.html` 6380 lignes, `prochainNumeroBrand` = 3, `node --check` OK. Branche `code-client-reel`, à merger via PR après test sur la Deploy Preview (le formulaire Brand doit proposer **B56**).

⚠️ **Angle mort connu, non couvert :** B56 « Saumon Écosse » existe dans le **Google Sheet** de David mais PAS dans Notion. Le chantier 12 aligne l'app sur **Notion**, pas sur le Sheet.

### 🟢 CHANTIER 13 — VÉRIFIÉ PAR LE PILOTE, À TESTER SUR LA PREVIEW
`index.html` **6439 lignes**, `node --check` OK. Branche `client-brand-tri`. Nom du client Brand visible (cartes + liste + recherche) et tri « Modif » sur la vue Liste.

**⚠️ Ordre de merge — les deux branches touchent `index.html`.** `client-brand-tri` est construite SUR le chantier 12 : elle contient donc les deux chantiers (`prochainNumeroBrand` = 3 vérifié dans le fichier 6439 lignes). **Merger `code-client-reel` D'ABORD, puis `client-brand-tri`** — ou merger directement `client-brand-tri` qui porte les deux. Ne JAMAIS merger le 12 après le 13 : il écraserait le 13.

**À tester sur la preview :** ① un sujet Brand affiche le nom du client (cartes ET liste), un non-Brand n'affiche rien de plus ; ② taper « Danone » dans la recherche remonte ses sujets ; ③ colonne « Modif » : cliquer trie du plus récent au plus ancien ; ④ laisser la liste ouverte >60 s pendant qu'un collègue modifie un sujet → **aucune ligne ne doit sauter en tête**, le sujet modifié doit seulement flasher sur place.

### ✅ TESTS FERMÉS (validés en réel le 23/07)
- **Chantier 10** — Benjamin confirme : une seule notification de complétion, plus une par retour.
- **Chantier 11** — Éloise confirme : dépôt de séquencier validé par Entrée → une seule notification.
Plus rien en attente de vérification sur les chantiers mergés.

### 🔧 ACTION MASTER FAITE LE 23/07
Compteur Brand corrigé **53 → 55** (B54 Danone Gallia et B55 Energizer existaient déjà, créés hors app sans incrémenter le compteur — 3ᵉ occurrence du problème). Le prochain client prendra B56. ⚠️ **B56 « Saumon Écosse » existe dans le Google Sheet de David mais PAS dans Notion** — angle mort que le chantier 12 ne couvre pas (voir la limite documentée).



═══════════════════════════════════════════════════════════════
## 📝 CHANTIER 13 (à intégrer dans l'historique complet plus bas)
═══════════════════════════════════════════════════════════════
### 2026-07-23 — CHANTIER 13 : nom du client Brand visible + tri « dernière modification » (`index.html`)
`index.html` 6380 → **6439 lignes** (+59). `node --check` OK. Branche `client-brand-tri`, **construite sur le chantier 12** (contient donc les deux). `review.html` / `notify.js` / CSS **intouchés** — styles **inline** par choix explicite, pour rester sur un seul fichier et éviter un second push.

**PARTIE A — LE NOM DU CLIENT BRAND.**
*Besoin :* sur un sujet Brand on voyait le code (`B54A`) mais pas le client (Danone Gallia). Il fallait le chercher de tête ou ouvrir la fiche.

*Mécanisme :* le nom ne vit pas sur le sujet mais dans 🏷️ Clients Brand, lié par le code (`B54A` → client `B54`). Deux pièces :
- **`mapClientsParCode`** (Map `code → nom`) reconstruite par **`rebuildMapClients()`** après **chacun** des 3 points de chargement de `clients` (l.646 `loadSujets`, l.819 `openNouveau`, l.6161 `appLoadData`). **Jamais un `clients.find()` par carte** — à 200 sujets × re-render, la différence compte. ⚠️ **C'est le compteur de vérification critique : `rebuildMapClients` = 4** (déf + 3 appels). S'il en manquait un, on aurait des noms périmés après création d'un client — bug silencieux typique.
- **`nomClientDeCode(code, format)`** : `^B\d+` → `B54A`/`B54B`/`B54AA` donnent tous `B54`. Retourne `''` si non-Brand, code absent, code irrégulier ou **client orphelin**. Jamais d'`undefined`, jamais d'exception.

*Affichage :* chip muté **sur la ligne existante du code** dans les deux gabarits de carte (`cardHTML` l.733, `cardHTMLHighlight` l.6383) — **pas de ligne supplémentaire**, le compactage du 16/07 est préservé ; ellipsis à 96 px + `title` complet. En vue Liste, chip dans la **cellule Titre** (l.6017) et **non dans la cellule Code** : celle-ci fait 80 px et tronquerait « Danone Gallia » à l'excès. **Aucune colonne ajoutée pour le nom.** Sujet non-Brand → le ternaire ne rend rien : pas d'espace, pas de séparateur orphelin.

*Recherche :* une ligne dans `applySearch` (l.4008), via la Map (O(1), pas de lookup par frappe). **Insensible à la casse, sensible aux accents** — identique aux 12 autres champs, comportement global inchangé. « Danone » passe, « Crème » exigera l'accent ; changer ça serait un chantier sur toute la recherche.

*Soin non demandé, à noter :* les attributs `title` échappent les guillemets (`.replace(/"/g,'&quot;')`) — un nom de client contenant un guillemet ne casse pas le HTML.

**PARTIE B — TRI « MODIF » SUR LA VUE LISTE.**

*La question bloquante, tranchée par audit du code (pas par supposition) :* `last_edited_time` est-il pollué par les mécanismes automatiques ? **Non.** `autoRefreshTick` (l.3133, 60 s) est un `POST /query` en lecture pure ; `fichePollTick` (18 s) et `relireSujet` sont des `GET` purs ; ouvrir une fiche n'écrit rien ; `champToujoursACa` n'utilise jamais `last_edited_time`. Les deux écritures « automatiques » suspectes (`Lu` et `Complétion notifiée`) portent sur **d'autres bases** (DB_NOTIFS, DB_VERSIONS) et suivent une vraie action utilisateur. **Aucun mécanisme automatique ne touche `last_edited_time` d'un sujet de DB_PROD → le tri est du signal, pas du bruit.** Bonus : `parsePage` exposait **déjà** `lastEdited`, rien à ajouter côté parsing.

*Livré :* colonne **« Modif »** (90 px) dans le patron de tri existant (`cols`/`listSort`/en-têtes cliquables), avec date **relative** via `fmtModif` (à l'instant / il y a X min / il y a X h / hier / date courte — `fmtDate` seul n'aurait pas reflété l'ordre intra-journée). Défaut : **plus récent d'abord**. **Pas de persistance** (session seulement, retombe sur `created` au rechargement), cohérent avec l'existant et avec l'arrivée sur Production au login.

***LE POINT DUR — L'ORDRE EST FIGÉ PENDANT LA LECTURE.*** Sans garde, le scénario était : un collègue modifie un sujet → au tick suivant (60 s), ce sujet **remonte en tête** et toutes les lignes glissent. Aggravant : `renderVueAvecScroll` conserve le scroll **en pixels, pas la ligne** → après réordonnancement on regarde une AUTRE ligne. Et `editionEnCours()` ne protège pas : **lire n'est pas éditer**. C'est exactement la désorientation déjà documentée.
*Solution :* instantané **`_ordreListeFige`** (Map `id → rang`) calculé sur **action utilisateur** (clic en-tête, filtre, recherche) et **réutilisé** par l'auto-refresh via le drapeau **`_autoRenderEnCours`**, posé et relâché de façon synchrone dans `renderVueAvecScroll` (l.3027/3030). Résultat : les données se mettent à jour et les sujets modifiés **flashent en place** (`flasherMaj`), mais **rien ne saute**. Pour réordonner, l'utilisateur **re-clique « Modif »**.
**Exception assumée et commentée :** un sujet **nouveau** (absent de l'instantané, rang −1) se place **en tête** — une création mérite d'être vue. C'est un choix, pas un effet de bord.
*Sûreté vérifiée :* l'instantané est construit (l.5954) **avant** toute lecture (l.5963) → aucun `null`-deref possible.

**Compteurs vérifiés par le Pilote :** `wc -l` = **6439** · `rebuildMapClients` = **4** · `nomClientDeCode` = 5 · `mapClientsParCode` = 5 · `fmtModif` = 2 · `_ordreListeFige` = 6 · `_autoRenderEnCours` = 4 · `lastEdited` = 11 · `CHEF_PAR_DEFAUT` = 5 · `EQUIPE_FALLBACK` = 2 (bien `= []`) · `prochainNumeroBrand` = 3 (chantier 12 préservé) · `createNotif` = 27 · chantier 11 intact (`save();this.blur()` = 0, `data-saved` = 3, `navTo('dashboard')` = 1, `navTo('production')` = 10) · chantier 10 intact (5/3/2) · balises `<script>` 4/4.

**LIMITE CONNUE :** si deux clients partagent le même code (donnée incohérente d'avant le chantier 12), la Map garde le **dernier** — un `console.warn` le signale au lieu de l'enterrer silencieusement.

**LEÇON MÉTHODE :** le Pilote avait suggéré la cellule **Code** pour la vue Liste, par intuition et sans avoir lu le rendu. Claude Code a lu, mesuré (80 px) et proposé la cellule **Titre** avec l'argument. Le Pilote a suivi. **Une préférence non vérifiée ne pèse rien face à une lecture du code réel** — même règle que pour les diagnostics.



═══════════════════════════════════════════════════════════════
## 📝 CHANTIER 12 (à intégrer dans l'historique complet plus bas)
═══════════════════════════════════════════════════════════════
### 2026-07-23 — CHANTIER 12 : code client Brand calculé depuis les clients RÉELS + formulaire clarifié (`index.html`)
`index.html` 6343 → **6380 lignes** (+37). `node --check` OK (2 blocs de script inline). `review.html` / `notify.js` / CSS **intouchés**.

**POURQUOI — incident du 23/07, 3ᵉ occurrence du même problème.** Le compteur Brand était à **53** alors que **B54 (Danone Gallia)** et **B55 (Energizer)** existaient déjà dans 🏷️ Clients Brand, créés en direct dans Notion sans incrémenter le compteur. Le prochain client créé via l'app aurait reçu **B54 — un code déjà pris**. La cause racine : le code proposé venait du champ `Dernier numéro` de la base **Compteurs**, incrémenté **uniquement** lors d'une création via l'app, sans aucune vérification contre les codes réels. Toute création hors app garantissait la dérive.

**PARTIE 1 — LE CODE VIENT DÉSORMAIS DU RÉEL.**
Nouveau helper `prochainNumeroBrand(listeClients)` (l.4207) : max des codes clients réels, **planchonné par le compteur**, +1. Parsing robuste (`match(/\d+/)`, tout code sans chiffre écarté via `isNaN`). Le compteur n'est plus la source de vérité — il devient un **plancher de secours** (liste vide ou requête en échec) et **se répare tout seul**, puisqu'on y réécrit désormais le vrai max.

Deux garde-fous au moment du submit (l.4326-4334), au-delà de la proposition initiale :
- **Relecture autoritaire** de `DB_CLIENTS_BRAND` juste avant la création — la liste en mémoire peut avoir plusieurs minutes. En cas d'échec réseau, `console.warn` et repli silencieux sur la liste en mémoire (jamais de blocage de la création).
- **Bump anti-collision** : `Set` des codes existants, `while` qui incrémente tant que le code est pris. Tracé en `console.log`, **sans toast** — l'utilisateur n'a pas à connaître la mécanique.

**PÉRIMÈTRE STRICT — BRAND SEUL.** Vérifié : les 6 usages restants de `c.dernierNumero+1` sont tous **hors** de la branche Brand-nouveau (l.4389/4402 = autres formats · l.1871/1891 = duplication de sujet · l.5378/5394 = création depuis une idée). La question « faut-il appliquer la même logique à tous les formats ? » reste **ouverte** — voir les chantiers non prioritaires.

**PARTIE 2 — LE FORMULAIRE DIT CE QU'IL FAIT (affichage seul, aucune logique changée).**
Le formulaire s'appelle « Nouveau sujet » mais crée **deux objets** en mode Nouveau client : un **client** dans Clients Brand (`B56`) **ET** un **sujet** dans Suivi Production (`B56A`). Les deux champs de nom (« Nom du nouveau client » vs « Titre ») prêtaient à confusion. Livré :
- Libellé « **Nom du client (ex : Nike)** » (l.272)
- Phrase « Le titre saisi en haut deviendra le premier sujet de ce client. » (l.274)
- Preview « ✚ **Création de 2 éléments** : le client **B56** + son 1er sujet **B56A** » (l.275)
- Preview déclinaison « ✚ **Création d'1 sujet** : **B54B**, rattaché à **Nike**. *(Aucun nouveau client.)* » (l.280)

**LIMITE ASSUMÉE — le Google Sheet reste divergent.** L'app s'aligne sur **Notion**, qui devient la source de vérité pour les codes Brand. **B56 « Saumon Écosse » existe dans le Sheet de David mais pas dans Notion** : l'app proposera B56 malgré tout. Aucun correctif code ne peut couvrir une 3ᵉ source hors système — seule la discipline de saisie le peut.

**FRAGILITÉ NON TRAITÉE (déjà notée) :** les créations (sujet → incrément compteur → client) s'enchaînent **sans transaction**. Si la création du client échoue après celle du sujet, on obtient un **sujet orphelin** + un compteur avancé. Le chantier 12 réduit l'impact (le prochain calcul repart du réel) mais ne supprime pas le cas.

**Compteurs vérifiés par le Pilote :** `wc -l` = **6380** · `prochainNumeroBrand` = **3** (déf. l.4207 + `updateBrandCode` l.4218 + submit l.4331) · `brand-code-sujet` = 2 · `brand-decli-client` = 2 · `updateBrandCode` = 3 · `CHEF_PAR_DEFAUT` = 5 · `EQUIPE_FALLBACK` = 2 (et bien `= []` l.2809) · `createNotif` = 27 · chantier 11 intact (`save();this.blur()` = **0**, `data-saved` = 3, `navTo('dashboard')` = 1, `navTo('production')` = 10) · chantier 10 intact (`verifierCompletionVersion` 5, `effacerMarqueurCompletion` 3, `retours_traites` 2) · balises `<script>` équilibrées 4/4.

**NOTE FORMAT :** le code est produit avec `padStart(2,'0')`. Au-delà de B99, on obtiendra B100 (3 chiffres) — cohérent avec le parsing `/\d+/`, aucun blocage, mais à savoir.

**LEÇON MÉTHODE — LE PIÈGE DE L'UPLOAD.** Le chantier 12 avait été produit puis **perdu** : lors du premier upload, c'est l'ancien fichier (6343 lignes, chantier 11) qui est remonté. Le Pilote l'a détecté par `grep -c prochainNumeroBrand` = 0. **Règle : deux critères bloquants (nombre de lignes ET présence d'un marqueur propre au chantier) vérifiés AVANT toute analyse de contenu.** Un fichier re-livré n'est jamais présumé être le bon.



═══════════════════════════════════════════════════════════════
## 📝 CHANTIER 11 (à intégrer dans l'historique complet plus bas)
═══════════════════════════════════════════════════════════════
### 2026-07-23 — CHANTIER 11 : notifications en double corrigées + login sur Production (`index.html`)
`index.html` **6343 lignes**. `node --check` OK. `review.html`/`notify.js`/CSS intouchés.

**PARTIE 1 — NOTIFICATIONS EN DOUBLE (bug remonté par Benjamin via Éloise)**

**Symptôme :** quand Éloise déposait un séquencier, Benjamin recevait **DEUX** notifications.

**Fausses pistes écartées :** ① pas un doublon dans la base Équipe (vérifié par Master : une seule fiche « Éloise », code elo26) ; ② pas un destinataire ciblé deux fois (le code ne notifie que `s.chef`, une fois) ; ③ pas une conséquence du chantier 10 (vérifié, le bug préexistait).

**VRAIE CAUSE — double déclenchement par la touche Entrée.** Les inputs de lien avaient à la fois `onblur="save()"` ET `onkeydown="if(Enter){save(); this.blur()}"`. Appuyer sur Entrée déclenchait donc **deux** sauvegardes : l'appel direct, puis `this.blur()` qui rappelait `onblur`. Et la garde anti-changement **ne protégeait pas** : `s.lienSeq` n'est mis à jour qu'**après** le `await` de `upd`, donc le 2ᵉ appel lisait l'ancienne valeur et passait. **Ce n'était donc pas « spécifique à Éloise »** — c'est spécifique à ceux qui valident par Entrée.

**PAS ISOLÉ AU SÉQUENCIER :** le **lien de version** (`updateVersionUrl`) avait le même défaut, **en pire** (aucune garde de changement du tout). Le **livrable** a le même câblage mais est épargné (garde synchrone + pas de notif).

**CORRECTION — au niveau du DÉCLENCHEUR (approche proposée par Claude Code, meilleure que celle du Pilote).** Le Pilote proposait le modèle `saveLivrable` (poser l'état local AVANT le `await`). Claude Code l'a **refusé à juste titre** : si l'écriture Notion échoue, l'app croirait que c'est enregistré → **mensonge d'affichage**. *(Note : `saveLivrable` porte ce défaut latent, invisible car il ne notifie pas.)* Solution retenue : **`onkeydown` Entrée ne fait plus QUE `this.blur()`**, et `onblur` reste le seul chemin de sauvegarde. Entrée valide toujours, cliquer ailleurs valide toujours — **UX identique** — mais la sauvegarde ne part qu'une fois. **Rien n'est écrit en avance → rien à annuler → aucun mensonge possible, par construction.**

De plus, `updateVersionUrl` reçoit la garde qui lui manquait : attribut `data-saved` semé au rendu, mis à jour **APRÈS le PATCH réussi** (dans le `try`) → si Notion échoue, la valeur n'est pas mémorisée et le prochain blur réessaie.

**PARTIE 2 — LOGIN SUR PRODUCTION**
Après connexion, on arrivait sur le Dashboard. Décision de David : arriver sur **Production**, pour **tous** — évite un clic à chaque connexion. Changé au point d'entrée (l.3215) **et** au fallback « sujet introuvable » (l.3210). Le **bouton latéral Dashboard reste intact** (l.137) — le Dashboard reste accessible, on change juste le point d'entrée. Vérifié : aucune dépendance (les données se chargent indépendamment de la page affichée).

**Compteurs :** `onkeydown` avec `save+blur` = **0** (les 2 corrigés) · `data-saved` = 1 · `el.dataset.saved = url` = 1 · `navTo('dashboard')` = **1** (le bouton latéral seulement — ne pas lire ce reste comme un oubli) · `navTo('production')` = 10 · `createNotif` = 27 (**inchangé — mêmes notifs, seule la fréquence est corrigée**) · chantier 10 intact (`verifierCompletionVersion` 5, `effacerMarqueurCompletion` 3, `retours_traites` 2) · `CHEF_PAR_DEFAUT`=5 · `EQUIPE_FALLBACK`=2.

**LEÇON MÉTHODE :** le Pilote a proposé une solution qui aurait introduit un défaut (mensonge d'affichage). Claude Code l'a refusée en expliquant pourquoi, et a proposé mieux. **C'est exactement pourquoi on demande une PROPOSITION avant de coder.**



═══════════════════════════════════════════════════════════════
## 📝 CHANTIER 10 (à intégrer dans l'historique complet plus bas)
═══════════════════════════════════════════════════════════════
### 2026-07-22 — CHANTIER 10 : une seule notification de complétion au lieu d'une par retour (`index.html`)
`index.html` **6341 lignes**. `node --check` OK. `review.html`/`notify.js` intouchés.

**BESOIN (remonté par Benjamin) :** il recevait **une notification par retour traité** (5 retours = 5 notifs). Ce qui l'intéresse, c'est de savoir quand il peut **aller vérifier** — donc quand TOUT est traité.

**DÉCISIONS DE DAVID :**
- Supprimer les notifs individuelles, les remplacer par **une seule notif de complétion**
- « Traité » = **Corrigé OU ⛔ Impossible**, peu importe l'ordre
- **Destinataires : auteur(s) des retours + le chef**, dédupliqués (si l'auteur EST le chef → une seule notif)
- **Brouillons exclus** du comptage (un brouillon n'a jamais été transmis)
- **Retours clients** : comptés comme les autres, **aucune règle spéciale**. Contexte métier : dans le flux de David, une version a soit des retours internes, soit des retours clients, **jamais les deux** (la V2 porte les retours de Benjamin, on corrige, la V3 part au client). Le cas de coexistence ne se présente pas.

**BUG CORRIGÉ AU PASSAGE :** `toggleRetourPlayer` (marquer corrigé depuis le player) était **totalement silencieux** — cocher tous les retours depuis le player ne prévenait personne. Les **3 chemins** convergent désormais vers la même vérification.

**Livré :**
- helper `verifierCompletionVersion(sujetId, retourId, statutApplique)` appelé par les 3 chemins (`toggleRetour` Corrigé, `toggleRetourPlayer` Corrigé, `confirmerImpossible`)
- `effacerMarqueurCompletion` sur la réouverture (réarme un futur cycle)
- 2 `createNotif` de traitement **supprimés** (`retour_corrige` l.2132, `retour` impossible l.3818)
- type **`retours_traites`** + icône 🎉 dans `NOTIF_ICONS`. **Cloche uniquement** — `LABELS`/`TYPES_IMPORTANTS` non touchés (fil d'activité inchangé)
- message : `✅ Tous les retours de la V2 de B54D ont été traités (3 corrigés · 2 impossibles)`

**LES 4 PARADES (toutes vérifiées dans le fichier) :**
1. **Read-after-write** — le retour qu'on vient de traiter est **exclu du comptage** (`r.id!==retourId`). Sans ça, Notion pouvant encore le montrer « Ouvert », **la notif ne partirait JAMAIS**.
2. **Comptage autoritaire** — relecture de `DB_RETOURS` contre Notion, jamais la mémoire locale.
3. **Brouillons exclus** — `Source==='Équipe' && Brouillon===true` ne bloque pas la complétion.
4. **Statut vide = Ouvert** — `(Statut||'Ouvert')==='Ouvert'`, pour ne pas rater un retour au statut vide.

**MARQUEUR ANTI-DOUBLON, EN BEST-EFFORT :** propriété **`Complétion notifiée`** (case à cocher) sur **DB_VERSIONS**. Posée AVANT l'envoi (rétrécit la course), effacée à la réouverture. **Toutes les lectures/écritures du marqueur sont en `try/catch`** : si la propriété manque ou si Notion échoue, on loggue et **la notif part quand même**. Seule la protection anti-double-envoi est dégradée, jamais la notif.

**⚠️ PRÉREQUIS NOTION AVANT MERGE :** ajouter la propriété **case à cocher `Complétion notifiée`** sur la base 📹 Versions. Sans elle, la notif fonctionne mais peut se répéter (si réouverture puis re-correction).

**Limite assumée :** Notion n'a ni transaction ni verrou → si deux personnes traitent les deux derniers retours à la même milliseconde, une double notif reste possible. Événement rare, accepté.

**Compteurs :** `createNotif` call sites **26 → 25** (net −1 : **2 retirés, 1 ajouté** — c'est le remplacement voulu, PAS une régression) · `verifierCompletionVersion` = 5 (déf + 3 appels + 1) · `effacerMarqueurCompletion` = 3 · `retours_traites` = 2 · `Complétion notifiée` = 4 · **notifs de CRÉATION de retour (l.1613/1651 → journaliste) INTACTES** · `CHEF_PAR_DEFAUT`=5 · `EQUIPE_FALLBACK`=2.

**Note :** l'entrée d'icône `retour_corrige` est **conservée** dans `NOTIF_ICONS` (bien que le call site soit à 0) pour que les anciennes notifs de ce type gardent leur ✅ dans l'historique de la cloche. Volontaire.



═══════════════════════════════════════════════════════════════
## 📝 CHANTIER 9 (à intégrer dans l'historique complet plus bas)
═══════════════════════════════════════════════════════════════
### 2026-07-22 — CHANTIER 9 : barre du bas mobile réduite aux 4 pages (`css/layout.css`)
**Les CSS sont des fichiers SÉPARÉS dans /css, pas dans index.html.** Ce chantier ne touche que `css/layout.css`.

**Constat David (mobile) :** la barre du bas (= la `.sidebar` qui bascule en barre horizontale sous `@media max-width:700px`) contenait les 4 pages MAIS AUSSI les filtres de format (MAG/Brand/Face Cam/YouTube/Desk), qui débordaient (YouTube hors barre).

**Fausse piste corrigée (2 tours de diagnostic) :** un 1er fix ciblait `.sb-item` avec de mauvais id. En réalité : les 4 pages sont des `.sb-item` (#nav-dashboard/#nav-production/#nav-idees/#nav-taches) ; **les formats sont des `.sb-cat` dans le conteneur `#sb-cats`** (générés par `renderSidebarCats`), une AUTRE famille. Le PR #55 a bien masqué les `.sb-item` en trop (Archives, Export) mais **PAS `#sb-cats`** → les formats survivaient entre Production et Idées. Leçon : ne jamais affirmer une cause sans que Claude Code ait lu le code réel — le Pilote a supposé « faux id » et « jamais mergé », les deux étaient faux.

**Fix réel (chantier 9b) :** une seule ligne ajoutée dans le `@media(max-width:700px)` de `css/layout.css` → `#sb-cats{display:none!important}`. Vérifié par le Pilote sur le fichier : ligne 200, à l'intérieur du média (ouvre l.174, ferme l.230) ; le `#sb-cats` desktop (l.254, hors média, `display:flex`) intact ; accolades 115/115.

**Résultat :** barre du bas mobile = 4 pages (Dashboard, Production, Idées, Tâches). Desktop inchangé (sidebar + sous-filtres de format sous Production). **Décision David : pas besoin de filtrer par format sur mobile** — les formats restent dans la sidebar desktop, et le filtrage mobile se fait par statut (bandeau du haut). Branche `sbcats-mobile-hide`.

**⚠️ À VÉRIFIER APRÈS MERGE :** confirmer sur mobile réel que la barre n'a QUE 4 items. Le fix précédent était passé inaperçu (ni mergé correctement, ni testé) — cette fois, tester en prod.



═══════════════════════════════════════════════════════════════
## 📝 CHANTIER 8 (à intégrer dans l'historique complet plus bas)
═══════════════════════════════════════════════════════════════
### 2026-07-22 — CHANTIER 8 : « Sans musique » réversible depuis l'app (`index.html`)
`index.html` **6256 lignes** (inchangé, +1/−1). Branche `musique-reversible`, base `main` cb0510f. `node --check` OK.
**Besoin :** le bandeau « 🔇 Aucune musique » n'était pas cliquable → décochage impossible sans passer par Notion. **Option A validée par David : décochage depuis l'app, retour à l'écran de choix.**
**Livré :** le bandeau reçoit un lien « Modifier » qui fait l'inverse exact du bouton « Sans musique » : `sx.sansMusique=false` + `upd('Sans musique','cb',false)` + `refreshUI`. Une seule écriture Notion. Comme `releveMusique` reste false, le rendu du ternaire retombe sur l'écran de choix « 🎵 Avec musique / 🔇 Sans musique ».
**Périmètre strict :** SEUL le décochage. Le 2ᵉ verrou (formulaire masqué en PAD) n'est PAS traité — David le contourne en baissant le statut, c'est voulu.
**Compteurs :** CHEF_PAR_DEFAUT=5, EQUIPE_FALLBACK=2, createNotif=27, relireSujet=5, fichePollTick=3 — tous intacts. review.html/notify.js intouchés.
**Note méthode :** Claude Code a livré directement au lieu de proposer d'abord (le prompt demandait une proposition sur index.html). Toléré ici car diff d'une ligne, entièrement vérifiable, logique bien expliquée en amont. La règle proposition-d'abord sur index.html reste valable pour tout changement plus large.



═══════════════════════════════════════════════════════════════
## 📝 CHANTIER 7 (à intégrer dans l'historique complet plus bas)
═══════════════════════════════════════════════════════════════
### 2026-07-22 — CHANTIER 7 : avertir (sans bloquer) à la validation si des retours sont ouverts (`review.html`)
`review.html` 902 → **914 lignes** (+12, insertions pures). Branche `avertir-validation`, base `main` cb0510f (chantier 6/6b mergé PR #52). `node --check` OK.
**Besoin :** un client pouvait valider une version sur laquelle il avait laissé des retours — contradictoire. **Décision David : AVERTIR, pas bloquer.**
**Livré :** ① élément `#popup-valider-warn` (ambre, `display:none` par défaut) inséré dans le popup de validation ; ② `ouvrirValidation` compte les retours ouverts (`Statut !== 'Corrigé'`, **même critère que `confirmerEnvoi`**) → si > 0, affiche « ⚠️ Vous avez N retour(s) en cours. Valider quand même ? » ; sinon masque. **Le bouton Confirmer reste TOUJOURS actif** — avertissement visuel, pas garde. `confirmerValidation` inchangé.
**Compteurs :** `popup-valider-warn` = 2 · `!== 'Corrigé'` = 2 (confirmerEnvoi + ouvrirValidation) · confirmerValidation/ouvrirValidation/confirmerEnvoi/marquerFini/soumettre inchangés · `__chef__` = 0.



═══════════════════════════════════════════════════════════════
## 🔴 ÉTAT EN COURS — À TRAITER EN PRIORITÉ AU PROCHAIN CHAT
═══════════════════════════════════════════════════════════════

**CINQ CHANTIERS LIVRÉS LE 21/07** (tous vérifiés par le Pilote)
1. ✅ **Chef par défaut** — mergé (PR #48), testé.
2. ✅ **Notifs retours clients `__chef__`** — mergé (PR #49), testé en réel (Julie/Danone).
3. ✅ **Double-clic versions + type `v1_deposee`** — fusionné dans le fichier du chantier 4.
4. ✅ **Chacun valide ses retours** — mergé (fichier fusionné 3+4).
5. ✅ **Trois boutons client** (fin de passe) — branche `client-fin-retours`, mergé.
6. ✅ **Reconception UX zone client** — chantier 6, branche `chantier6-ux` (empilée sur 5). Vérifié, **en attente de merge et de test**.

**✅ FAIT (chantier 8, 22/07) — « Sans musique » réversible depuis l'app.** Le bandeau « Aucune musique » a un lien « Modifier » qui décoche et ramène à l'écran de choix (option A). Le 2ᵉ verrou (formulaire masqué en PAD) reste non traité — contournement manuel voulu.

**DÉCISION PRODUIT TRANCHÉE — « Valider avec des retours » : AVERTIR.** ✅ FAIT (chantier 7, 22/07). Le popup de validation affiche un avertissement ambre si des retours sont ouverts, sans bloquer.

**PROCHAIN GROS MORCEAU — ANALYSE MULTI-UTILISATEUR (planifiée pour le 1er août, au renouvellement du budget)**
David veut comprendre comment améliorer la plateforme pour l'usage multi-user (~10 personnes simultanées, cœur du produit). Objectifs : carte d'architecture + fragilités restantes + priorisation. **La vraie question à trancher** : continuer à colmater les défauts multi-user un par un, OU introduire une **couche de coordination serveur** ? Presque tous les défauts multi-user ont la même racine — *le client calcule et écrit directement dans Notion sans arbitre* (codes, versions, dernier-qui-écrit-gagne). Un arbitre serveur (généralisation d'`alloc-code`) réglerait toute la famille d'un coup. **Décision structurante → à faire avec budget confortable, pas en fin de session.** S'appuiera sur les audits déjà faits (multi-utilisateur + notifications) pour limiter le coût.

**FAUSSES PISTES ÉLIMINÉES LE 21/07 (ne pas rouvrir) :**
- **Codes en double** : jamais eu de vrai cas de concurrence. L'unique incident (D1212) venait d'une **double création manuelle par Master**, pas d'une course. Reste théorique — tout en bas de la pile.
- **Notifier au passage PAD manuel** : NON, c'est **voulu**. Le PAD est une décision humaine qui suit l'upload des photos + validation musique. Pas un événement à notifier automatiquement. Comportement actuel correct.
- **Contact Brand souvent vide** : **normal**, l'équipe Brand n'est pas encore onboardée sur l'app. Se réglera tout seul. Pas un chantier.

**CHANTIERS PRODUIT IDENTIFIÉS, NON PRIORITAIRES**
- **`confirmerValidation` sans garde anti-régression** (review.html) : peut faire reculer un statut (PAD → Validation chef). Signalé au chantier 5, à harmoniser un jour avec la garde de `confirmerEnvoi`.
- **Signal « fini » persistant côté équipe** : aujourd'hui en sessionStorage (par navigateur). Si besoin d'un affichage durable « qui a fini », il faudra un champ Notion.

**IDÉES UX / FONCTIONNALITÉS EN ATTENTE (notées le 22/07, non lancées)**

**✅ CHANTIER 12 — CODE CLIENT DEPUIS LES CLIENTS RÉELS + CLARIFIER LE FORMULAIRE** — **LIVRÉ ET VÉRIFIÉ le 23/07** (voir l'entrée d'historique en haut du fichier). Le contexte d'analyse ci-dessous est conservé pour mémoire.)

*Contexte — INCIDENT DU 23/07 (3ᵉ occurrence du même problème) :* le compteur Brand était à **53** alors que **B54 (Danone Gallia) et B55 (Energizer)** existaient déjà dans 🏷️ Clients Brand. Master les avait créés en direct dans Notion **sans incrémenter le compteur**. Le prochain client créé via l'app aurait reçu **B54 — un code déjà pris**, et le décalage se serait perpétué (compteur à 54 → proposerait B55, encore pris). **Corrigé par Master : compteur Brand → 55.** *(À noter : B56 « Saumon Écosse » existe dans le Google Sheet de David mais PAS dans Notion — 3ᵉ source de vérité qui diverge.)*

*Analyse Claude Code — le mécanisme :* le code proposé vient du champ `Dernier numéro` de la base **Compteurs** (`updateBrandCode` l.4189), incrémenté **UNIQUEMENT** lors d'une création via l'app (l.4307). Aucune vérification contre les codes réels des clients. Les créations hors app ne l'incrémentent jamais → dérive garantie.

*Décision de David :* **l'app doit calculer le prochain code depuis les CLIENTS RÉELS** (base Clients Brand, déjà chargée et contenant tous les codes) au lieu du compteur séparé. S'auto-corrige sans intervention humaine. ⚠️ **Limite honnête : ça ne règle PAS l'écart avec le Google Sheet** (une source hors Notion restera toujours divergente).

*À grouper dans le même chantier :* **clarifier le formulaire**. Analyse Claude Code : en mode « Nouveau client », le formulaire crée **DEUX objets** — un **client** dans Clients Brand (code `B54`) **ET** un **sujet** dans Suivi Production (code `B54A`) ; le « Format de livraison » alimente le `Sous-format` du **sujet**. En mode « Déclinaison », **un seul sujet** (B54B…) rattaché au client existant, pas de nouveau client. **Le piège :** le formulaire s'appelle « Nouveau sujet » mais crée aussi un client, et les deux champs de nom (« Nom du nouveau client » vs « Titre ») prêtent à confusion. → afficher explicitement « vous allez créer un client ET son premier sujet ».

*Question ouverte à traiter dans le chantier :* les autres formats (MAG, Desk, Face Cam, YouTube, Interne) utilisent le même mécanisme de compteur — ont-ils le même risque de dérive ? Faut-il appliquer la même logique à tous ?

*Fragilité annexe notée (non traitée) :* les 3 créations (sujet → incrément compteur → client) s'enchaînent **sans transaction**. Si la création du client échoue après celle du sujet, on obtient un **sujet orphelin** + un compteur avancé.

- ✅ **FAIT (chantier 13)** — ~~Tri « dernière modification » sur la vue Liste~~ : David veut pouvoir trier pour que les cartes récemment modifiées remontent en haut. ⚠️ **À VÉRIFIER AVANT DE CODER** : est-ce que `last_edited_time` (Notion) est mis à jour par les vraies actions utilisateur SEULEMENT, ou aussi par le polling/refresh automatique (`relireSujet`) ? Si le refresh touche `last_edited_time`, le tri deviendrait du bruit. Question à poser à Claude Code avant tout chantier.
- **Alignement « Copier le lien » / croix de fermeture** dans la fiche détail mobile : les deux boutons ne sont pas à la même hauteur. Petit ajustement CSS (fichiers `css/`, pas `index.html`).
- **Effet boutons flottants iOS** (style photothèque) : David aime, mais « si c'est compliqué, plus tard ». Confort, pas prioritaire.
- **Déclinaison → format MAG** : une déclinaison peut aussi créer un format MAG (pas seulement hériter du format parent). À creuser plus tard.

**🚫 TIMECODE AUTOMATIQUE (style Frame.io) — SUJET CLASSÉ le 22/07, ne pas rouvrir sans nouvel élément**
David voulait capturer le timecode automatiquement quand un client laisse un retour. **Exploré à fond, testé en réel, conclusion : impossible tant que les vidéos sont sur Drive en HD.** Le détail, pour ne pas refaire le chemin :
- L'app affiche la vidéo via un **iframe Google Drive `/preview`** → boîte noire cross-origin, **aucun accès à `currentTime`**, et **aucune API postMessage** (vérifié par recherche : Drive n'est pas un SDK de lecteur).
- **`<video>` natif sur l'URL `drive.usercontent/download` : TESTÉ EN RÉEL, ÉCHOUE.** Page de test `test-video-natif.html` sur sujet B18G → `SRC_NOT_SUPPORTED (erreur 4)` + seek bloqué (> 6 s). Cause : pour les fichiers **> 100 Mo** (les reviews font 200-500 Mo), Google renvoie une **page HTML d'avertissement** au lieu du flux ; le `confirm=t` statique ne suffit plus (token dynamique lié à un cookie). Mur **délibéré** de Google (anti-hotlinking).
- **Drive n'offre PAS de « signed URL »** façon S3 (vérifié) — aucune URL courte hotlinkable par un `<video>`.
- **Proxy serveur Netlify** : ferait transiter 200-500 Mo **par visionnage** → coût/limites serverless inacceptables, contraire à la légèreté de l'app.
- **Proxy léger 480p : REJETÉ PAR DAVID** — un client valide un montage, il ne peut pas juger sur du 480p. **La pleine qualité HD est une contrainte métier absolue.**
- **Chronomètre / audio parallèle / vidéo invisible comme horloge** : tous morts pour la **même raison** — l'iframe Drive n'émet aucun signal, donc **rien à synchroniser**. La dérive est maximale au moment précis du commentaire (le client met en pause pour écrire).
- **Seule voie restante** : un **jumeau de streaming HD** auto-généré au dépôt via un transcodage **à l'usage** (Mux/Coconut ~0,015 $/min, **sans abonnement**, ~0,05-0,10 $ par review), hébergé sur le CDN du service (le flux ne passe PAS par Netlify), avec player exposant `getCurrentTime`/`setCurrentTime`. Le **master reste sur Drive** — c'est une copie dérivée, pas une migration. **Décision non prise.**
- **Verdict honnête** : les 4 contraintes (HD + timecode exact + rien hors Drive + rien de lourd par Netlify) sont **sur-contraintes**. Quelque chose doit céder, et la plus souple est « aucune copie hors Drive ». **Si David refuse la copie dérivée → le timecode manuel est définitif.**

**BANDEAU « NOUVELLE VERSION » (checkAppVersion / version-banner)** — NE PAS désactiver. C'est une sécurité multi-user : prévient les utilisateurs sur une version en cache de recharger. L'agacement actuel vient de la phase de dev intense (déploiements fréquents) — se calmera naturellement. Si besoin un jour, le rendre plus discret plutôt que le supprimer.

**AUTRES POINTS OUVERTS**
- **Test visionnage étape 3** toujours non fait : vidéo review ouverte > 15 min → la permission doit rester dans Drive.
- **Tests du chantier 3** (double-clic versions) : David a fait confiance, pas encore testé en réel.
- **PWA fermée = pas de push** : connu, non traité. Se corrigera dans `notify.js`.
- **`Code suggéré` vide dans la vue Notion** : formule non calculée ou mauvais champ affiché (`Code` = vraie propriété). Non urgent.
- **Chef par défaut évolutif** : Benjamin → **Chloé dans ~3 mois** → Arnaud ponctuel. Changement = 1 ligne (constante). Alternative : case à cocher dans la base Équipe. Non prioritaire.
- **Budget Claude Code** : 251/250 € au 21/07, renouvellement 1er août. Le Pilote fait tout hors-code ; Claude Code lit/écrit le code ; sessions courtes ; lectures ciblées.

**CHANTIER SUSPENDU — présence sur une fiche**
Proposition de diff vérifiée le 21/07. **Archivée, pas rejetée.** À reprendre APRÈS l'analyse multi-user (qui pourrait en changer l'approche).
⚠️ **À revalider avant reprise** : si un chantier a modifié `relireSujet`/`fichePollTick`/le contrat du merge, revérifier les 8 ancres et les compteurs.
⚠️ **DÉPENDANCE TTL ↔ cadence** : TTL présence 45 s = 2,5 × cadence `fichePollTick` (18 s). Si la cadence change, le TTL doit suivre.

**RÈGLES APPRISES LE 21/07 (à respecter)**
- **Créations hors app (Master, saisie directe Notion)** : mettre le compteur de codes à jour ET renseigner le chef, dans le même geste. Le fallback code ne protège que les créations via l'app.
- **Merge sur monolithe** : `index.html` poussé en fichier entier → deux branches parallèles ne sont JAMAIS disjointes, la 2ᵉ écrase la 1ʳᵉ. Enchaîner depuis un `main` à jour, ou faire fusionner par le Pilote avant push.
- **Tâches en lot** : annoncer le plan ; en cas d'interruption, état des lieux ; avant de reprendre, vérifier l'existant (ne jamais recommencer de zéro).

═══════════════════════════════════════════════════════════════
## ⚠️ RÈGLES DE PROCÉDURE — CRÉATIONS HORS APP (ajouté le 21/07)
═══════════════════════════════════════════════════════════════

**Incident du 21/07 — deux sujets D1212, et onze doublons.** Master a créé onze sujets Desk (D1212-D1222) **directement dans Notion**, puis s'est interrompue (crédits épuisés) **avant de mettre à jour le compteur**. Le compteur Desk est resté à 1211 → l'app a ré-attribué D1212 à un nouveau sujet créé via l'app. Puis, avec des crédits, Master a **refait le lot entier** sans vérifier l'existant → onze doublons de titres. David a dû : passer le compteur à 1222, corriger « Coupe du monde 2026 » de D1212 en D1223 (son vrai code source), remettre le compteur à 1223, et supprimer le jeu de doublons le plus récent (celui d'hier portait le travail de Benjamin : statuts avancés, journalistes assignés).

**Ce n'était donc PAS le bug de concurrence de l'audit.** Le bug de concurrence reste réel mais **toujours jamais matérialisé**.

**RÈGLES QUI EN DÉCOULENT :**
1. **Toute création de sujets directement dans Notion doit mettre à jour `Dernier numéro` dans 🔢 Compteurs de codes DANS LE MÊME GESTE.** L'app lit ce compteur pour attribuer les codes ; un sujet créé hors compteur = une collision programmée.
2. **Toute création directe dans Notion doit renseigner `Chef responsable`** (à défaut : Benjamin). Le fallback du chantier 1 protège les créations **via l'app** uniquement — une écriture directe en base court-circuite toute la logique applicative, et aucun correctif code ne pourra jamais rattraper ça.
3. **Tâches en lot** : annoncer le plan et le nombre d'étapes avant de commencer ; en cas d'interruption, terminer par un état des lieux (fait / pas fait / reste à faire) ; **avant de reprendre, vérifier ce qui existe déjà — ne jamais recommencer de zéro**. Le point 3 est le vrai filet : quand les crédits tombent, la session s'arrête net et l'état des lieux ne peut pas être écrit.
4. **Réutilisation d'un numéro après suppression** : supprimer un sujet ne décrémente **pas** le compteur (trou dans la séquence). Réutilisation possible **manuellement**, et **uniquement** si c'est bien le dernier créé du format et qu'aucun autre n'a été créé entre-temps. **Ne pas automatiser** : une décrémentation auto rouvrirait la porte aux doublons en cas concurrent.
- Décisions produit David : affichage **dans la fiche ouverte uniquement** (pas sur les cartes) · **tous** ceux qui ont la fiche ouverte, même en lecture · **pastilles avec initiales** (style .av existant), prénom au survol, soi-même exclu.
- Architecture retenue : nouvelle fonction `fiche-sync.js` qui fait TROIS choses en UNE invocation (lit la page Notion + upsert présence Blobs + renvoie {page, presence}). `fichePollTick` bascule dessus au lieu du proxy → **±0 invocation Netlify supplémentaire** (le meilleur profil sur le point de tension du projet). Store Blobs `fiche-presence`, clé = sujetId, valeur = {userId: {nom, lastSeen}}. TTL 45 s (2,5× la cadence), purge à l'écriture + filtrage à la lecture + arrêt du poll déjà en place → pas de sweep nécessaire. `sendBeacon` de départ optionnel (recommandé, 3 lignes).
- Point de chirurgie : extraire `integrerPageSujet(page)` de `relireSujet` pour que `fichePollTick` l'alimente depuis fiche-sync sans dupliquer la logique. **Fail-open** : si fiche-sync échoue, repli sur le proxy actuel.
- Points à trancher : ① beacon de départ (reco : oui) ② TTL 45 s ③ **communication à l'équipe** : c'est un changement SOCIAL (chacun verra qui consulte quoi) — à annoncer explicitement.

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

**⚠️ CORRECTIF 6b (même session) — bouton Télécharger clippé.** Effet de bord de la refonte : la zone d'actions passée en vertical (titre + 3 boutons empilés + marges) a fait déborder la `.form-section` du conteneur `.retours-side`, qui était en `overflow: hidden` → le dernier élément (« ⬇ Télécharger ») était repoussé hors zone visible et **non cliquable**. Le bouton n'était pas cassé (logique intacte), juste **hors champ**. Corrigé en 2 lignes CSS : `.retours-side { overflow: hidden → overflow-y: auto }` (la colonne défile au lieu de couper) + `.retours-list { min-height: 0 }` (corrige le piège flexbox `min-height:auto` qui empêchait la liste de se compresser). Vérifié desktop + mobile (`50vh`), 0 comme 20 retours. Leçon : agrandir une zone dans un conteneur à hauteur fixe + `overflow:hidden` clippe silencieusement le contenu du bas — toujours vérifier le débordement vertical après une restructuration verticale.

---

### 2026-07-22 — CHANTIER 6 : reconception UX de la zone d'actions client (`review.html`) — HABILLAGE PUR

`review.html` 899 → **902 lignes** (+3, diff +13/−10). Branche `chantier6-ux` **empilée sur `client-fin-retours`** (le fichier contient donc chantiers 5 ET 6 ; à l'upload il remplace le `review.html` de `client-fin-retours`). `node --check` OK. `index.html`/`notify.js` intouchés.

**POURQUOI.** Le chantier 5 avait livré trois boutons client fonctionnels, mais l'UX était cassée : `.btn-actions { display: flex }` tassait 4 boutons sur une ligne dans un panneau étroit → libellés coupés, « Envoyer les retours » illisible, bouton de confirmation du popup réduit à une icône sans texte. Et collision entre « Envoyer → » (un retour) et « Envoyer les retours » (clôture).

**AUCUNE LOGIQUE MODIFIÉE — habillage pur.** Les 6 fonctions (`marquerFini`, `ouvrirEnvoi`, `confirmerEnvoi`, `ouvrirValidation`, `confirmerValidation`, `soumettre`) inchangées, `__chef__` = 0, garde anti-régression et compteur des retours ouverts préservés. Seuls changent : disposition, couleurs, 3 libellés.

**Livré :**
- **`.btn-actions` en `flex-direction: column`** + `border-top` séparant deux zones. Nouvelles classes `.btn-cloture` (largeur 100 %, `white-space:normal`, `box-sizing:border-box` → libellés jamais coupés) et `.cloture-titre`.
- **Zone 1 « Laisser un retour »** : bouton renommé « Envoyer → » → **« Envoyer ce retour → »** (reste rouge). Lève la collision.
- **Zone 2 « Quand vous avez terminé »** : titre de section + 3 boutons empilés pleine largeur — « ✔ J'ai fini mes retours » (neutre, bascule Reprendre) · « 📨 Envoyer les retours à l'équipe » (**neutre marqué #2A2A3A, plus d'ambre**) · « ✅ Valider cette version » (**vert via `.btn-valider`**). Télécharger → lien discret.
- **Popup `popup-envoyer`** : bouton « **Confirmer l'envoi** » en toutes lettres, neutre marqué, `flex:1` (égalité avec Annuler).

**DÉCISION COULEUR (validée par David sur maquette) — LE VERT = APPROUVER, UNIQUEMENT.** « Valider cette version » est la seule action verte. « Envoyer les retours » est en neutre marqué : le client ne doit jamais croire qu'il approuve alors qu'il demande des corrections. C'est le cœur de la correction — l'ambre du chantier 5 créait une 3ᵉ couleur sans signification claire.

**Compteurs :** `Envoyer →` (ancien) = 0 · `Envoyer ce retour →` = 1 · `btn-cloture` = 4 · `cloture-titre` = 2 · `Confirmer l'envoi` = 1 · `background:var(--amber)` sur boutons = 0 · 6 fonctions logiques inchangées · `__chef__` = 0.

---

### 2026-07-22 — ANALYSE (lecture seule) : comment saisir un relevé musical — DEUX VERROUS

Question d'usage de David (pas un bug). Il n'arrivait pas à saisir un relevé musical sur un sujet. Diagnostic Claude Code :

**Le bloc musique a 3 états exclusifs**, gouvernés par deux cases Notion (`Sans musique`, `Relevé musique`) : ① état initial → deux boutons « 🎵 Avec musique » / « 🔇 Sans musique » ; ② « Sans musique » cochée → `<div>` vert figé « Aucune musique », **SANS onclick, non cliquable** ; ③ « Avec relevé » → formulaire (Titre/Artiste/Durée + « + Ajouter »).

**VERROU 1 :** une fois « Sans musique » cochée, **l'app n'offre AUCUN moyen de la décocher** → il faut le faire **dans Notion** (base 🎬 Suivi de Production, décocher la propriété `Sans musique`), recharger, puis cliquer « 🎵 Avec musique ».
**VERROU 2 :** le formulaire de saisie est **masqué si statut === 'PAD'** (et la case « Cap déposée » est disabled en PAD). Il faut **sortir du PAD** (repasser à Validation chef/Montage), saisir, puis éventuellement remettre en PAD.

Cumul fréquent : un sujet livré est souvent **en PAD ET en « Sans musique »** → traiter les deux avant de pouvoir saisir.

**→ PETIT CHANTIER IDENTIFIÉ (prochain, sur `index.html`) :** rendre le décochage de « Sans musique » possible **depuis l'app**. Décision de David : annuler « Sans musique » doit **ramener à l'écran de choix « Avec / Sans musique »** (pas directement au formulaire). À cadrer : faut-il aussi gérer le second verrou (PAD masque le formulaire), ou seulement le décochage ?

**Note produit connexe (déjà notée) :** le recul manuel de statut via la barre du haut (`updStatut`) est **volontaire et fréquent** chez David (ex. sortir un sujet du PAD pour saisir un relevé). Ce n'est donc pas un défaut à corriger — mais ça relance la question : y a-t-il des reculs de statut NON voulus (ex. un client qui ferait reculer un PAD depuis review.html) à distinguer des reculs volontaires depuis l'app ?

---

### 2026-07-21 — CHANTIER 5 : trois boutons client dans `review.html` (fin de passe individuelle + collective)

`review.html` 840 → **899 lignes** (+59). Branche `client-fin-retours`. `node --check` OK. `index.html` et `notify.js` **intouchés**.

**LE PROBLÈME.** Un client n'avait que « Envoyer » (un retour) et « Valider cette version ». Pour signaler « j'ai fini ma passe », il n'avait que le bouton de validation — donc il **validait un montage qu'il critiquait**. La base contenait alors une version validée avec des retours ouverts : donnée fausse, le chef pouvait lancer la suite alors que le client attendait des corrections.

**DÉCOUVERTE DE L'ANALYSE (chantier 5, lecture seule) :** l'identification client à l'ouverture **existait déjà** (écran prénom/entreprise + `sessionStorage('review-nom')`). Ce que David croyait coûteux était fait. Chaque personne qui ouvre le lien sur son appareil entre son nom → identités distinctes. Le « même nom observé » venait d'ouvertures sur le même appareil, pas d'un défaut. **Le vrai point dur** était ailleurs : la notion de « référent client » n'existe **nulle part** dans les données (`Contact Brand` = membres de l'agence, pas clients). **Décision de David : un seul lien, pas de référent désigné** — n'importe quelle personne identifiée peut clôturer, la confirmation explicite est la seule barrière.

**TROIS ACTIONS DISTINCTES, livrées :**
- **A — « J'ai fini mes retours »** (`marquerFini`) : signal **individuel**, informatif, **réversible** (bascule « ✔ J'ai fini » / « ↩ Reprendre »). État en `sessionStorage['review-fini-<sujetId>']` (par personne + par sujet). Premier clic → notif équipe « … a terminé ses retours ». « Reprendre » → efface l'état local, **ne renotifie pas**. **Ne touche pas au statut de la carte.**
- **B — identification durcie** : prénom **ET** entreprise désormais obligatoires non vides (avant : prénom seul).
- **C — « Envoyer les retours »** (`ouvrirEnvoi`/`confirmerEnvoi`) : signal **collectif**, popup de confirmation (« Vous allez clôturer les retours pour toute votre équipe »). Au clic confirmé → statut `Retours` **avec garde anti-régression** + notif équipe « … a clôturé les retours — N retours à traiter ».

**GARDE ANTI-RÉGRESSION (le point que le Pilote surveillait) :** liste `['Retours','Validation chef','PAD']` — le statut n'est écrit `'Retours'` **que si** le statut courant n'y est pas déjà. Carte en PAD + clic Envoyer → statut **reste PAD**, mais la notif part quand même. **Jamais de recul.** Choix de la liste plutôt qu'une copie de `STATUT_ORDER` : robuste au changement d'ordre. *Note : `confirmerValidation` existant régresse potentiellement le statut sans garde (PAD → Validation chef) — signalé, hors périmètre, à harmoniser un jour.*

**COMPTEUR N = retours OUVERTS uniquement** (`Statut !== 'Corrigé'`) : « N retours à traiter » reflète ce que le monteur a réellement à faire.

**« Envoyer » ne verrouille rien** : le client peut continuer à laisser des retours après (ils notifient normalement). Décision de David : un retour tardif ne doit pas être bloqué.

**Trois boutons distingués visuellement** : neutre (J'ai fini) · ambre (Envoyer) · vert (Valider cette version). Le vert = j'approuve, l'ambre = je clôture pour corrections, le neutre = ma passe perso est finie. C'est ce qui casse la confusion d'origine.

**Réutilisation :** `notifierEquipe`/`destinatairesRetour` du chantier 2 réutilisés tels quels (chef + journaliste + monteur de la version + contact Brand, dédupliqués). Type de notif = `'retour'` faute de type dédié (un type « clôturé » toucherait `index.html`, hors périmètre).

**Compteurs :** `__chef__` = 0 (acquis chantier 2 préservé) · `notifierEquipe` = 5 · `marquerFini`/`ouvrirEnvoi`/`confirmerEnvoi` = 2 chacun · `majBoutonFini` = 4 · `popup-envoyer` = 4 · `statut: pr.Statut` ajouté à `sujetData` · `confirmerValidation`/`ouvrirValidation`/`soumettre`/`chargerTousRetours` intacts.

**Limite assumée :** l'état « fini » est en `sessionStorage` → par navigateur, perdu au changement d'appareil. Confort visuel, acceptable. Si un jour l'équipe doit voir durablement « qui a fini », il faudra un champ Notion.

---

### 2026-07-21 — CHANTIER 4 : chacun valide ses propres retours (+ FUSION avec le chantier 3)

`index.html` **6256 lignes**. Branche `valider-mes-retours`. `node --check` OK. **Ce fichier contient les chantiers 3 ET 4 fusionnés par le Pilote** (voir note logistique en fin d'entrée).

**LE CAS RÉEL.** Julien (non-chef) a filmé un sujet Brand. Il avait donc l'information pour laisser des retours au monteur Thierry. Il a créé **7 retours** depuis l'app — tous passés en **BROUILLON**, sans aucun moyen de les transmettre : le bouton « Valider tous les retours » n'apparaissait que si `currentUser.role === 'Chef'`. Le chef du sujet est Benjamin, absent du tournage. Et rien n'a averti Julien : le toast disait simplement « Retour ajouté ».

**Le défaut de conception :** le mécanisme supposait que l'**autorité** (le chef) et la **connaissance** (qui a vu le tournage) vont ensemble. Chez Réel Média, ce n'est pas toujours vrai.

**Vérification faite avant le chantier : le brouillon n'a JAMAIS été limité aux Brand.** `submitRetour` et `submitPlayerRetour` posent tous deux `Brouillon: true` **systématiquement**, sans aucun test sur le format ; l'affichage et `validerTousRetours` filtrent sur `Source === 'Équipe'` et `Brouillon`, jamais sur le format. L'aide intégrée le confirme : c'est une règle liée à la **source** (interne vs client) et au **rôle**, pas au format. (`loadVersions` calcule bien un `isBrand` ailleurs — le code sait distinguer par format quand c'est voulu.)

**DÉCISION DE DAVID : chacun valide ses propres retours.** Un chef conserve la capacité de valider tous les retours du sujet.

**Livré — 6 éditions :**
- **Condition d'affichage** dans `loadRetours` **ET** `loadPlayerRetours` (blocs textuellement identiques → ancres distinguées par le **style du `<div>`**) : ajout de `hasMesBrouillons` (brouillon Équipe + `Auteur === myName`, avec garde `!!myName`) ; affichage si `(chef && hasBrouillonEquipe) || (!chef && hasMesBrouillons)`.
- **UN bouton à libellé adaptatif**, pas deux : « **Valider tous les retours** » (chef) / « **Valider mes retours** » (auteur non-chef). Deux boutons n'auraient coexisté utilement que pour un chef ayant aussi ses propres brouillons — cas rare, et « tous » couvre déjà « les miens ». Le texte dit exactement ce qui va partir.
- **`validerTousRetours` : le filtre DEVIENT la garde.** La garde binaire `if(role !== 'Chef') return` est remplacée par un **périmètre** : chef → tous les brouillons Équipe ; non-chef → uniquement `Auteur === currentUser.nom`. Plus robuste qu'un refus en début de fonction : même un appel direct ne peut pas toucher les retours d'autrui. Périmètre vide → toast « Aucun retour à valider » + `return` (pas de boucle vide silencieuse).
- **Toasts de création explicites** sur les **deux** chemins : « Retour ajouté en brouillon — valide-le pour le transmettre ». C'est le correctif du piège de Julien.
- **`Source === 'Équipe'` conservé partout** : les retours **Client** ne sont jamais touchés, jamais validables ici, jamais dans un périmètre.

**LIMITE ASSUMÉE — identification de l'auteur par NOM.** Le champ `Auteur` est un `rich_text` contenant `currentUser.nom`, pas un id. Trois risques : ① **homonymie** — deux membres au même nom d'affichage pourraient valider les retours l'un de l'autre (⚠️ **non théorique : il y a deux Juliette dans l'équipe, Cohen et Prunier** — à vérifier dans la base Équipe qu'elles sont distinguées) ; ② **renommage** dans la base Équipe → les anciens brouillons deviennent orphelins, seul un chef peut les débloquer ; ③ comparaison `===` sensible à la casse et aux espaces. Impossible de mieux faire sans migration (les retours existants ne stockent aucun id d'auteur). Accepté en l'état.

**Compteurs :** `'Réservé aux chefs'` **1 → 0** · `hasMesBrouillons` = 4 (2 déclarations + 2 usages) · `hasBrouillonEquipe` = 4 · `validerTousRetours` = 3 (inchangé) · « Valider mes retours » = 2 · `'Aucun retour à valider'` = 1 · anciens toasts = 0, nouveau toast = 2 · `isChefUser` = 6.

**⚠️ NOTE LOGISTIQUE — FUSION MANUELLE DES CHANTIERS 3 ET 4.** Claude Code a produit le chantier 4 depuis un `main` **sans** le chantier 3, en indiquant « zones disjointes, merge dans l'ordre que tu veux ». C'est vrai au niveau des **fonctions**, mais **faux au niveau du fichier** : `index.html` est un monolithe et David pousse des fichiers entiers via GitHub.com (Claude Code ne peut pas push). Pousser le chantier 4 après le chantier 3 aurait donc **écrasé** les corrections versions. **Le Pilote a réappliqué le chantier 3 sur le fichier du chantier 4** et vérifié la présence des deux jeux de modifications. **Leçon à retenir : sur un monolithe poussé manuellement, deux branches parallèles ne sont jamais "disjointes" — toujours enchaîner les chantiers depuis un `main` à jour, ou fusionner avant de pousser.**

**Dette réglée au passage :** le `const el = document.getElementById('versions-list-'+sujetId)` devenu orphelin dans `ajouterVersion` (chantier 3) a été **supprimé** lors de la fusion. D'où 6256 lignes et non 6258.

---

### 2026-07-21 — CHANTIER 3 : fin du double-clic sur les versions + type de notif corrigé

`index.html` **6250 lignes** (inchangé, +10/−10). Branche `fix-versions`. `node --check` OK. Base `main` = 974573c.

**CORRECTION A — la double création de versions (l'incident Mickaël).** Mécanisme reconstitué par l'audit : le verrou `_creerVersionEnCours` **existait** mais `loadVersions` était appelé **sans `await`** ; le `finally` libérait le verrou immédiatement, et pendant les 0,5-2 s de re-render un second clic relisait un **DOM périmé** → `maxNum = 0` → deuxième V1. Aggravant : le numéro était calculé **depuis le DOM**, via un sélecteur de style `[style*="font-weight:600"]`, jamais contre Notion.

Livré : ① calcul DOM **retiré** (ancre de 4 lignes — la 1ʳᵉ seule n'était pas unique, `font-weight:600` sert aussi l. 1572, hors périmètre) ; ② numéro calculé **contre Notion** dans le `try`, avant le POST — query `DB_VERSIONS` filtre `Sujet ID`, `max(numéros)+1` ; ③ `await loadVersions(sujetId)` → le `finally` ne libère le verrou qu'**après** le re-render.

**Coût et UX assumés :** +1 requête Notion par création (marginal — une création en coûtait déjà 2-3). Le bouton reste « Création… » **0,5-2 s de plus** au lieu de se réactiver aussitôt : c'est précisément ce délai tenu qui ferme la fenêtre du double-clic. Bénéfice secondaire : un bouton visiblement occupé n'invite plus au reclic.

**Risque résiduel documenté :** le verrou reste **par-navigateur**. Deux personnes créant *vraiment* simultanément peuvent encore produire deux V(n+1) — le calcul contre Notion corrige « mon DOM est périmé », pas la concurrence réelle. Seul un mécanisme serveur (type `alloc-code`) l'éliminerait. Hors périmètre, jamais matérialisé à ce jour.

**PÉRIMÈTRE MINIMAL TENU** : `ajouterVersion` seul. Le pattern `loadVersions` sans `await` ailleurs (**8 autres occurrences** — updateVersionUrl, gardes de fraîcheur, toggles de validation, annulation) est **observé, pas traité** — décision « livrer petit, vivre une semaine ». *Note de comptage : la proposition annonçait « 6 → 5 » ; le réel était 9 avant chantier, 8 après. Claude Code a rectifié son propre chiffre au lieu de laisser le Pilote vérifier un « 5 » qui n'a jamais existé. Périmètre strictement respecté.*

**CORRECTION B — le type `v1_deposee` codé en dur.** Le dépôt de lien depuis la **fiche** émettait toujours `'v1_deposee'`, même pour une V2 ou V3 (seule la vue tableau construisait correctement `` `v${v}_deposee` ``). Une V3 déposée depuis la fiche notifiait donc le chef d'une **V1**, avec la mauvaise icône.

**Découverte importante à l'inspection : `data-vnum` est MORT.** Le code lisait `dataset?.vnum` mais **aucun élément ne porte cet attribut** → `vNum` valait toujours `''`. Le littéral `'v1_deposee'` n'était pas une négligence : c'était un **repli sur une variable qui n'a jamais fonctionné**. Se contenter de remplacer le littéral par `vNum` aurait émis `v_deposee` — type inexistant, icône par défaut, notification cassée. La parade retenue : **propager le vrai numéro depuis le rendu** (`version` est déjà en main dans la boucle de `loadVersions`), signature `updateVersionUrl(versionId, sujetId, url, versionNum)`, 2 call sites mis à jour, ligne `vNum` morte supprimée. Repli `(versionNum||'V1')` : **jamais de type vide**, toujours un type valide de `NOTIF_ICONS`.

**Décision produit confirmée par David :** une **version annulée garde son numéro** (V2 annulée → la prochaine est V3, jamais une seconde V2). Réutiliser un numéro annulé créerait deux « V2 » distinctes dans l'historique — or les liens review, les notifications et les retours clients référencent ces numéros.

**Compteurs après livraison :** `createNotif('v1_deposee'` **1 → 0** · template `` `_deposee` `` = **2** (fiche + vue tableau) · `querySelectorAll('[style*="font-weight:600"]')` **2 → 1** (l. 1572 conservée) · `dataset?.vnum` **1 → 0** · `loadVersions(sujetId)` = 10 dont **1 en `await`** · `_creerVersionEnCours` 4 · `CHEF_PAR_DEFAUT` 5 · `EQUIPE_FALLBACK` 2 (déclaration + usage, liste toujours vide) · tous les acquis habituels intacts.

**Dette mineure assumée :** `const el = document.getElementById('versions-list-'+sujetId)` et son commentaire deviennent **orphelins** dans `ajouterVersion` (le calcul DOM qui les consommait a été retiré). Inoffensif. Laissé en place — à nettoyer au prochain chantier touchant cette fonction.

---

### 2026-07-21 — AUDIT DES NOTIFICATIONS INTERNES (lecture seule, aucun code)

**26 sites d'appel de `createNotif`**, pas 27 — le CONTEXT était désynchronisé, corrigé ici. Signature : `createNotif(type, sujetId, code, titre, destinataire, auteur, message)`. `createNotif` route vers `notify.js` → page Notion **+** push VAPID. Garde-fou : `if(!destinataire || destinataire === auteur) return` — **skip silencieux** (simple `console.log`).

**Carte des destinataires par famille d'événement :** retours équipe → `sujet.journaliste` · retour corrigé → `s.chef` · dépôt de lien → `s.chef` · validation d'une version → `s.journaliste` · version annulée → `s.journaliste` · validation séquencier → `s.journaliste` **et** `s.contactBrand` (double émission) · commentaire → `s.chef` **et** `s.journaliste` (avec anti-doublon `journaliste ≠ chef`) · transitions de statut auto → `s.journaliste` · créations de sujet → le journaliste assigné · idées (validée / déclinée / convertie) → `i.proposePar`.

**DÉFAUTS RELEVÉS :**
- 🔴 **`v1_deposee` codé en dur** au site du dépôt depuis la fiche → **corrigé par le chantier 3**.
- 🟠 **Changement de statut manuel (`updStatut`) ne notifie personne**, y compris le passage en **PAD** par bouton. Le « c'est PAD » n'existe que dans les transitions automatiques. **Décision produit en attente.**
- 🟠 **`s.contactBrand` très souvent vide** (sites validation séquencier Brand) → skip quasi systématique. Même motif que le chef vide. **Décision produit en attente.**
- 🟠 **Sites `s.chef` sans garde `≠ auteur`** : si le chef est lui-même l'auteur, skip. Trois sites concernés.
- 🟡 **`deleteSujet` et `ajouterVersion` n'émettent aucune notification** (la notif de dépôt dépend du collage du lien : si le lien n'est jamais collé, silence total).
- 🟡 **Aucune garde anti-double-clic sur les émissions** : recliquer une validation ou un dépôt ré-émet la notification. Même famille de défaut que l'incident Mickaël.

Aucun type de `NOTIF_ICONS` n'est strictement orphelin.

---



`review.html` 821 → **840 lignes** (+19). Branche `notif-retour-client`. Diff +41/−22, un seul fichier. `node --check` OK. `index.html` et `notify.js` **intouchés**.

**Le bug : `__chef__` n'était pas un lecteur manquant, c'était un placeholder jamais résolu.** Les deux émissions de `review.html` (retour client, validation client) écrivaient **en direct** dans `DB_NOTIFS` avec `Destinataire: '__chef__'`. Or `loadNotifs` filtre sur `Destinataire = currentUser.nom` — et personne ne s'appelle `__chef__`. L'intention « le chef » n'a jamais été convertie en nom réel côté émission. Conséquence double : **aucune cloche** (destinataire fantôme) **et aucun push** (écriture directe, `notify.js` jamais appelé). Depuis toujours. Les retours et validations **clients** ne notifiaient donc personne.

**Décision produit David — ciblage précis :** destinataires = **chef + journaliste + monteur de LA version concernée uniquement + contact Brand**. Si le client commente la V3, le monteur de la V1 n'est **pas** notifié : un retour porte sur une version précise, et le bruit tue les notifications. Destinataire manquant → simplement ignoré, sans trace (décision assumée, la trace en logs a été proposée et refusée).

**L'information était disponible gratuitement.** `init()` chargeait déjà la page sujet dans `pr` mais n'en extrayait que le titre. Or `Chef responsable`, `Journaliste`, `Contact Brand` et `Monteur V1/V2/V3` sont tous des propriétés directes de cette même page. **Zéro requête réseau ajoutée.**

**Livré :**
- `sujetData` enrichi à l'init : `chef`, `journaliste`, `contactBrand`, `monteurs {V1,V2,V3}`.
- `destinatairesRetour()` : `Set` de noms non vides, extraction défensive `/^V(\d+)$/` (version exotique → monteur absent, sans erreur), **dédup obligatoire** (Mickaël journaliste ET monteur → **une seule** notif).
- `notifierEquipe(type, message)` : boucle, **un POST `/.netlify/functions/notify` par destinataire**, best-effort (`.catch`), `auteur = clientNom`.
- Les deux émissions `__chef__` remplacées (`type:'retour'` et `type:'version_validee'`), messages conservés à l'identique.

**DÉCISION D'ARCHITECTURE — routage via `notify.js`, pas écriture directe.** Claude Code recommandait l'écriture directe (cloche seule, plus fidèle à l'existant). Le Pilote a recommandé l'inverse et David a tranché pour `notify.js` : ① un retour client doit être traité comme un dépôt de version, pas moins bien ; ② le jour où le problème « PWA fermée = pas de push » sera corrigé dans `notify.js`, les retours clients en bénéficieront **automatiquement** — l'écriture directe aurait laissé ce chemin sur le bord de la route ; ③ « fidèle à l'existant » signifiait ici fidèle à un mécanisme qui ne notifiait personne. Coût mesuré avant validation : `notify.js` prend **un destinataire par appel** → **1 à 4 invocations par retour** (typiquement 2-3 après dédup). Trivial sur un événement rare — le point de tension Netlify vient du polling continu, pas des événements ponctuels.

**Compteurs :** `__chef__` **2 → 0**. `notifierEquipe` = 3 (déf. + 2 émissions), `destinatairesRetour` = 2. *Écart signalé par Claude Code et validé par le Pilote* : la proposition annonçait `destinatairesRetour` = 3, mais il a mieux factorisé (les deux blocs appellent `notifierEquipe`, qui appelle `destinatairesRetour` une seule fois). Le « 3 » a changé de symbole ; comportement identique, code plus DRY.

**Dette mineure assumée :** `DB_NOTIFS` est désormais **déclarée mais inutilisée** dans `review.html` (les écritures directes ont disparu). Laissée en place : la retirer coûterait un tour de Claude Code pour une ligne morte inoffensive. À nettoyer au prochain chantier touchant ce fichier.

---

### 2026-07-21 — CHANTIER 2 : les retours clients notifient enfin l'équipe (`review.html`)

`review.html` 821 → **840 lignes** (+19). Branche `notif-retour-client`, **mergée** (PR #49). Diff +41/−22. `node --check` OK. `index.html` et `notify.js` **intouchés**.

**Le bug : `__chef__` n'était pas un lecteur manquant, c'était un placeholder jamais résolu.** Les deux émissions de `review.html` (retour client, validation client) écrivaient **en direct** dans `DB_NOTIFS` avec `Destinataire: '__chef__'`. Or `loadNotifs` filtre sur `Destinataire = currentUser.nom` — et personne ne s'appelle `__chef__`. Conséquence double : **aucune cloche** (destinataire fantôme) **et aucun push** (`notify.js` jamais appelé). Depuis toujours. Les retours et validations **clients** ne notifiaient donc personne.

**Décision produit David — ciblage précis :** **chef + journaliste + monteur de LA version concernée uniquement + contact Brand**. Si le client commente la V3, le monteur de la V1 n'est **pas** notifié. Destinataire manquant → ignoré sans trace (trace en logs proposée et refusée).

**L'information était disponible gratuitement** : `init()` chargeait déjà la page sujet dans `pr` mais n'en extrayait que le titre. **Zéro requête réseau ajoutée.**

**Livré :** `sujetData` enrichi (`chef`, `journaliste`, `contactBrand`, `monteurs {V1,V2,V3}`) · `destinatairesRetour()` avec `Set` de noms non vides, extraction défensive `/^V(\d+)$/`, **dédup obligatoire** (une personne cumulant deux rôles → **une seule** notif) · `notifierEquipe(type, message)` : un POST `notify` par destinataire, best-effort.

**DÉCISION D'ARCHITECTURE — routage via `notify.js`, pas écriture directe.** Claude Code recommandait l'écriture directe (cloche seule). Le Pilote a recommandé l'inverse, David a tranché : ① un retour client doit être traité comme un dépôt de version ; ② le jour où « PWA fermée = pas de push » sera corrigé dans `notify.js`, les retours clients en bénéficieront **automatiquement** ; ③ « fidèle à l'existant » signifiait ici fidèle à un mécanisme qui ne notifiait personne. Coût mesuré avant validation : **1 à 4 invocations par retour** (typiquement 2-3 après dédup) — trivial sur un événement rare.

**TESTÉ EN CONDITIONS RÉELLES** : retour de Julie (Danone) sur la V1 de B54D → reçu en push par le monteur. Validation d'Arnaud → reçue également. Ciblage et déduplication confirmés.

**Compteurs :** `__chef__` **2 → 0** · `notifierEquipe` 3 · `destinatairesRetour` 2. *Écart signalé et validé* : la proposition annonçait `destinatairesRetour` = 3, mais la factorisation via `notifierEquipe` a déplacé le « 3 » sur cet autre symbole.

**Dette mineure assumée :** `DB_NOTIFS` désormais déclarée mais inutilisée dans `review.html`. Laissée en place.

---

### 2026-07-21 — CHANTIER 1 : `CHEF_PAR_DEFAUT` devient un vrai fallback à l'écriture (+ audit multi-utilisateur)

`index.html` 6249 → **6250 lignes**. Branche `chef-fallback`. Diff +4/−3, un seul fichier. `node --check` OK, tous les compteurs de préservation vérifiés par le Pilote.

**Le bug des dates du 20/07 est CLOS — ce n'était PAS un bug de code.** Diagnostic Claude Code confirmé par le Pilote : les cinq sujets affichant « jeudi 28 mai 2026 à 11:11 » ont un `created_time` identique **à la seconde près** (09:11:01 UTC = 11:11 Paris) → signature d'un **import en masse** lors de la migration. Preuve décisive : les sujets créés **après** la migration affichent des dates justes et distinctes (F651 le 10 juin, sujets du jour corrects). Un bug de rendu ne serait pas sélectif par date de création. `relireSujet` est **innocenté** : un `GET /pages/<id>` renvoie `created_time`/`last_edited_time` au même niveau qu'un résultat de query, et `empreinteSujet` inclut `lastEdited` **volontairement** (c'est le signal de détection de modification). **Décision : ne rien faire** sur les dates d'import. Ne pas réinvestiguer.

**Cause du chantier 1 — pourquoi Benjamin n'a pas été notifié.** David a constaté dans Notion des sujets avec `Chef responsable` **vide**, dont un créé **la veille**. Diagnostic : `CHEF_PAR_DEFAUT` n'était qu'une **valeur d'UI pré-remplie** dans `openNouveau` (l. 775), **jamais un fallback à l'écriture**. Si `n-chef` est vide au submit (pré-remplissage non joué, ou champ reset), un `select.name` vide part vers Notion, qui **l'avale silencieusement**. Et la notification de dépôt de version skippe en silence quand `s.chef` est vide → Benjamin n'a rien reçu, ni push, ni notif interne, ni indice visuel. Piste casse/accent **écartée** : `'Benjamin'` correspond exactement à l'option.

**Les trois modifications livrées :**
- **l. 4183-4184** — point de passage commun : les **3 handlers de création** (Brand nouveau client, Brand projet existant, sujet standard) lisent le chef sur une seule ligne. `const chef=` → `let chef=` + `if(!chef || !chef.trim()) chef=CHEF_PAR_DEFAUT;`. **Vide ET blanc** couverts (une valeur d'espaces passerait un simple `!chef`). Les 3 `props` consomment la variable sans changement — **aucun handler réécrit**.
- **l. 1882** — déclinaison : `parent.chef` → `parent.chef||CHEF_PAR_DEFAUT` (le défaut se propageait : un sujet sans chef engendrait des déclinaisons sans chef).
- **l. 1865** — déclinaison sœur : littéral `'Benjamin'` → `CHEF_PAR_DEFAUT`. **Décision David** : plus aucun littéral en dur, car le chef par défaut **changera** (Chloé dans ~3 mois).

**Décision produit : un sujet doit TOUJOURS avoir un chef.** Aucun cas où le champ peut rester volontairement vide. Le pré-remplissage UI reste en place — ceinture (fallback écriture) **et** bretelles (pré-remplissage), l'UI ayant prouvé qu'elle ne suffisait pas.

**Compteurs après livraison :** `CHEF_PAR_DEFAUT` = **5** (l. 499 déf. + 775 UI + 1865 + 1882 + 4184). Le Pilote attendait 6 — **son attente était fausse** (base surestimée d'une unité : la base réelle était 2, pas 3). Claude Code a **signalé l'écart au lieu de forcer le chiffre** ; comportement correct, un compteur trafiqué ne vérifie plus rien. `'Chef responsable':{select:{name:chef}}` = 3 (intacts). `EQUIPE_FALLBACK=[]` = 1. Aucun `'Benjamin'` en dur restant comme valeur par défaut (les 2 occurrences restantes sont des **listes d'options** de select, l. 773 et 878 — légitimes).

**Signalé, NON corrigé (chantier séparé si besoin) :** le select « Chef responsable » de la fiche détail (l. 877) est le seul chemin théorique de re-vidage, via un `upd(..., 'sel', '')` **programmatique**. Non atteignable par l'UI (le select n'a pas d'option vide). Risque théorique.

**À faire par David (manuel, hors code) :** rattraper dans Notion les sujets déjà créés sans chef — filtrer sur `Chef responsable` vide, assigner. Le correctif ne répare que le futur.

---

### 2026-07-21 — AUDIT MULTI-UTILISATEUR DES ÉCRITURES NOTION (lecture seule, aucun code)

Déclenché par deux jours d'usage réel à ~10 personnes, qui ont révélé plus d'incohérences que le développement par chantiers isolés ne pouvait en voir.

**L'incident déclencheur.** Mickaël dépose un lien de version, clique deux fois → **deux entrées V1**, aucune alerte. David corrige à la main **dans Notion** (renomme l'une en V2) → l'app suit. Benjamin, censé être notifié, **ne reçoit rien**. Le lien déposé était par ailleurs un lien de **dossier** et non de vidéo (problème d'usage, pas de bug — question produit notée : faut-il signaler un lien qui n'est visiblement pas une vidéo ?).

**Mécanisme de la double création (reconstitué).** Un verrou **existe** (`_creerVersionEnCours` + bouton désactivé) mais il a un **trou temporel** : `loadVersions` est appelé **sans `await`**, le `finally` libère le verrou immédiatement, et pendant les 0,5-2 s de re-render un second clic relit un **DOM périmé** → `maxNum = 0` → deuxième V1. Aggravant : le numéro de version est calculé **depuis le DOM** (via un sélecteur de style `[style*="font-weight:600"]`), jamais contre Notion. Et le verrou est une **variable de navigateur** → structurellement inopérant entre deux utilisateurs.

**Trois défauts confirmés** : ① garde anti-double-soumission trouée et par-navigateur · ② aucune contrainte d'unicité (deux V1 acceptées en silence) · ③ aucune contrainte de séquence (une V2 peut exister sans V1). Racine commune avec les codes : **le client calcule un identifiant séquentiel depuis un état local possiblement périmé**.

**La notification manquante est un défaut INDÉPENDANT**, pas une conséquence de la double création (elle vit dans `updateVersionUrl`, pas dans la création). Cause réelle établie ensuite : `Chef responsable` vide → voir chantier 1.

**Classement par gravité réelle (10 utilisateurs simultanés) :**
- 🔴 **Codes de sujets** : `dernierNumero+1` calculé côté client, 4 sites de création. Le code est une **clé fonctionnelle** — les liens review résolvent par `Code` en prenant le **premier résultat** → un doublon peut servir **le mauvais sujet à un client externe**. Faiblesse d'**architecture**, pas corrigeable par rustine. Bloquant n°1 de l'audit initial, **jamais corrigé**.
- 🔴 **Création de versions** : doublons silencieux, numérotation DOM, verrou troué. **Cerné et corrigeable seul.**
- 🟠 **Notifications qui meurent en silence** : ① destinataire vide → skip **invisible** ② échec `notify.js` → console uniquement ③ **les notifs `__chef__` de review.html sont des lettres mortes** (2 émissions, 0 lecteur) → les retours et validations **clients** ne notifient personne. Bloquant n°2 de l'audit initial, **jamais corrigé**.
- 🟠 **Fire-and-forget généralisé** : `loadVersions` sans `await` à 6 endroits (+ `loadNotifs`, `renderCards`) → l'écran ment pendant une fenêtre, terreau du double-clic.
- 🟠 **Écritures concurrentes même-champ** : dernier écrit gagne. Le lot 2 protège désormais statuts et validations ; le reste (titres, notes, dates, monteur) non gardé — gravité contenue.
- 🟡 Garde métier lisant le **texte** du DOM (`countEl.textContent.includes('ouvert')`) · transitions de statut auto non gardées · `deleteSujet` ouvert à tous · doubles PATCH idempotents.

**Note sur les compteurs de codes** : supprimer un sujet ne décrémente **pas** `dernierNumero` — le numéro est perdu (trou dans la séquence). Réutilisation possible **manuellement** en décrémentant dans la base « Compteurs de codes », **uniquement** si c'est bien le dernier créé du format et qu'aucun autre n'a été créé entre-temps. **Ne pas automatiser** : une décrémentation auto rouvrirait la porte aux doublons en cas concurrent.

---

### 2026-07-20 — MULTI-UTILISATEURS : rafraîchissement v2 + lot 1 (fraîcheur fiche) + lot 2 (garde à l'action)
Trois livraisons successives sur `index.html` (6022 → 6105 → 6181 → **6249 lignes**), chacune vérifiée et testée avant la suivante. Déclenchées par deux retours d'usage réel opposés.

**A. RAFRAÎCHISSEMENT v2 — le bandeau devenu intelligent (index.html 6105)**
*Irritant David* : le bandeau « Actualiser » se déclenchait dès qu'un champ changeait **n'importe où** (empreinte GLOBALE) → bruit permanent qu'on ignore. Et après clic, perte des repères (re-render complet) — au point d'avoir refait des modifs par confusion (aucune donnée perdue).
*Règle produit validée* : changement sur un sujet non regardé → **silence** · fiche ouverte en **LECTURE seule** → silence aussi (« regarder ≠ modifier », précision David) · bandeau **uniquement** si on touche la fiche que quelqu'un modifie.
- `empreinteSujet(s)` (JSON sans retoursOuverts) + `diffSujets` → modifies/ajoutes/supprimes. L'empreinte globale disparaît.
- `ficheEnEdition(id)` : #ov-detail ouvert + `_detailSujetId === id` + (focus dans la fiche OU `_detailLastInteraction` < 30 s). **L'hystérésis 30 s comble les micro-trous entre deux champs** (sans elle, un tick tombant entre deux clics reconstruirait la fiche sous les doigts).
- `idsVisibles()` calculé **AVANT ET APRÈS** le remplacement (un sujet qui SORT du filtre doit disparaître). Re-render **seulement si la vue visible est concernée** → zéro repaint dans le cas majoritaire.
- `editionEnCours()` reste la garde absolue → si vrai, `_renderDiffere = true`, rattrapé au tick suivant.
- `.maj-flash` : halo ambre 1,5 s sur les cartes fraîchement modifiées (via le sélecteur `onclick` existant → **zéro modification des gabarits**). Transforme la surprise en information.
- **SUPPRIMÉS** : #refresh-banner, `_freshEnAttente`, `showRefreshBanner`, `hideRefreshBanner`, `empreinte` (globale), `appliquerFresh`. ⚠️ Piège évité à la vérif : ne PAS toucher `#version-banner` (bandeau ROUGE de nouvelle version, autre chantier) — noms similaires.

**B. LOT 1 — FRAÎCHEUR DE LA FICHE (index.html 6181, branche `fiche-fraicheur`)**
*Incident réel* : David passe un sujet en PAD ; son voisin a LA MÊME FICHE OUVERTE et travaille dedans → il ne voit rien, il aurait pu refaire le PAD. Diagnostic : en prod, `editionEnCours` considérait toute `.overlay.open` comme une édition → **délai de propagation INFINI** tant que la fiche restait ouverte. En v2, chaque clic réarmait l'hystérésis → fiche gelée en continu, et la fine barre #d-conflit passait inaperçue. (Le « ça s'est rafraîchi après avoir scrollé » s'explique : le scroll ne déclenche aucun événement d'interaction.)
- `relireSujet(id)` : GET /pages/<id> unitaire (~300 ms), parsePage, comparaison empreinteSujet, **badge retoursOuverts préservé**, merge dans le cache. Ne re-rend JAMAIS la grille (calme v2 conservé).
- **(b) Relecture à l'ouverture** de fiche + au retour d'onglet → on n'ouvre plus jamais sur du périmé. ⚠️ **Anti-boucle `_derniereRelecture`** (skip si même id relu < 5 s) : indispensable car `refreshDetail` repasse par `openDetail` → sans ce garde, boucle infinie.
- **(g) Polling ciblé** : `setInterval(fichePollTick, 18000)` tant qu'une fiche est ouverte. Lecture seule → `refreshDetail` (convergence ≤ 20 s). En édition → **la fiche et la saisie restent INTACTES**, on alimente l'alerte. Triple ceinture anti-fuite : stop dans `closeOv`, dans `doLogout`, + auto-stop si la fiche n'est plus ouverte ; `demarrerPollingFiche` fait un stop avant de démarrer (jamais de cumul). Pause si onglet caché.
- **(e) Conflit immanquable** : #d-conflit devient un **vrai bloc ambre** (padding 12/16, 13px, gras) avec texte contextualisé « ⚠️ Ce sujet vient de passer en "PAD" par quelqu'un d'autre — cliquer pour recharger la fiche » + **toast UNE FOIS par épisode** (`_conflitSignale`, reset à `rechargerFiche` et `stopPollingFiche` — sinon alerte toutes les 18 s).
- Coût : ~3,3 req/min par fiche ouverte, onglet visible seulement. Pire cas 10 users ≈ 1,2 req/s vs limite ~3.
- **Testé en réel** : séquencier propagé ~10-20 s, lien vidéo ~5 s, PAD vu quasi instantanément, alerte déclenchée. ✅

**C. LOT 2 — GARDE À L'ACTION (index.html 6249, branche `garde-action`)**
*Pourquoi* : le lot 1 réduit la fenêtre à ~18 s mais ne la supprime pas. David : **un double PAD a de vraies conséquences métier** → il faut la garantie.
- `champToujoursACa(lireFrais, valeurLocale, timeout 2500)` : `Promise.race` → **FAIL-OPEN** sur timeout ET sur erreur (laisse écrire). Justification : bloquer sur échec rendrait l'app inutilisable en connexion instable ; dans le pire cas on retombe exactement sur le comportement d'avant, jamais en dessous.
- **Comparaison du CHAMP VISÉ uniquement**, jamais `last_edited_time` → **zéro faux positif** (quelqu'un corrige un titre → le changement de statut passe quand même, et le titre frais est récupéré gratuitement au passage).
- **4 handlers protégés** : `updStatut` (via relireSujet) + Validée + Validation Brand + annulerVersion (via `lireChampVersion(versionId, prop)`). **EXCLUS** : créations de pages (une page neuve ne peut pas être en conflit), statut retour 'Corrigé', `autoStatut`, et **toutes les écritures mono-champ au fil de l'eau** (pas de requête par frappe).
- Au blocage : bouton restauré → toast avec la **vraie valeur serveur** → `refreshUI` sur l'état frais. **Refus d'UNE tentative, jamais de verrou** : re-cliquer fonctionne normalement.
- UX : bouton '…' + `pointerEvents:none` pendant garde+écriture, restauré dans un **`finally` qui couvre les 3 cas** (succès, refus, échec d'écriture) → aucun bouton coincé. Sert aussi d'anti-double-clic. `upd()` **inchangé** (la garde est AVANT, on ne réécrit pas l'écriture).
- **Testé en réel par David + son voisin** : « je n'ai pas pu PADiser un dossier qui venait d'être PADisé » → **le double PAD est devenu impossible.** ✅

**DÉCISION SUR LA CADENCE** : rester à **18 s** (polling fiche) et **60 s** (tick global). Descendre à 10 s doublerait les invocations Netlify (point de tension) pour un gain de **confort** seulement — le risque, lui, est déjà éliminé par le lot 2. À réévaluer après une semaine d'usage réel.

**TENSION ARBITRÉE (à garder en tête)** : le matin « ça bouge trop, je perds mes repères » → v2 conservatrice. L'après-midi « mon voisin voit du périmé, il peut agir faux » → lots 1 et 2. Ce sont des exigences **opposées** ; l'arbitrage retenu : la **fraîcheur ciblée** (fiche) + la **protection à l'écriture**, sans revenir au bruit sur la grille.


### 2026-07-20 — VISIONNAGE + TÉLÉCHARGEMENT CLIENT EXTERNE (gros chantier, 4 livraisons)
Le client externe qui reçoit un lien review peut désormais **VOIR** et **TÉLÉCHARGER** la vidéo sans compte Google et sans partage d'email. `index.html` JAMAIS touché.

**LE PROBLÈME**
Vidéos Drive en "Restreint" → un client sans accès tombait sur l'écran de connexion Google. Ni visionnage ni téléchargement possibles. (Le téléchargement semblait marcher : en réalité les testeurs avaient leurs propres droits Drive, la permission éphémère était décorative pour eux — bug masqué depuis le premier jour.)

**CE QUI A ÉTÉ ÉCARTÉ (tests réels, pas des suppositions)**
- **SPIKE `<video>` HTML5** sur URL usercontent (branche jetable, PR fermée sans merge) → **403 : Google refuse de streamer**, même avec permission "anyone" fraîchement ouverte, même sur Chrome. Voie morte. Le spike a économisé tout le chantier bâti dessus.
- **Vimeo** (~15€/mois, zéro code car l'app lit déjà les liens Vimeo) → écarté par David au profit du 0€.
- **Partage manuel des emails clients** → refusé (manuel + trou Safari).
- **Version A manuelle** (rendre la vidéo publique à la main) → impossible : le balayeur la referme en 10 min.

**CE QUI MARCHE (validé par test manuel)** : l'iframe **`/preview`** (lecteur natif Google) LIT une vidéo passée en "anyone with link" chez un visiteur non connecté → **OK Chrome desktop** (lecture + seek). **Safari/iOS = écran de connexion** (ITP cookies tiers, NON corrigeable). David assume ce trou : **ses clients sont sur ordinateur**.

**ARCHITECTURE — SESSION DE VISIONNAGE (3 étapes, balayeur en dernier)**
Principe : le Service Account (contributeur) ouvre la permission "anyone" **au clic du client**, l'iframe /preview affiche, révocation par session + heartbeat + TTL + sweep. **Confirmé en prod sur une vidéo dont David n'est PAS propriétaire** (D1206) → le SA ouvre bien la permission sur toutes les vidéos du dossier.

- **Étape 1 (PR #41)** — `drive-view-session.js` (nouveau, 122 l.) + `_drive.js` (217 l.) + `drive-download-review.js` (148 l., +1 ligne export `fileIdsDuSujet`).
  POST {action:'open'|'heartbeat'|'close', sujetCode, fileId}. Portier A∪B réutilisé. open → réutilise si session vivante (`reused:true`), sinon crée permission + entrée registre. heartbeat → `lastSeen=now`, refuse au-delà du cap. close → **antidate `lastSeen`, ne révoque JAMAIS** (multi-spectateurs). **FAIL-CLOSED** : throw AVANT toute création si Blobs KO.
  **SOURCE UNIQUE** : `isViewAlive` + `VIEW_IDLE_TTL_MS` (3 min) + `VIEW_MAX_SESSION_MS` (3h) définis et **exportés** depuis `_drive.js` → l'étape 3 importe les mêmes (divergence impossible).
  **COHABITATION** : `openEphemeralDownload` réutilise la permission si session vivante (`revoked:false`, ni création ni révocation) ; sinon cycle 0,3s **strictement inchangé**. Vit dans `_drive.js` → `drive-download.js` et `index.html` intouchés.
- **Étape 2 (PR #42)** — `review.html` (707 → 808 l.).
  **PROTECTION SCANNERS** : vignette "▶ Lancer la vidéo" — la permission ne s'ouvre **QU'AU CLIC**. Un scanner Gmail/Outlook qui pré-charge la page n'ouvre rien. `lancerVisionnage` → open → `injecterIframe` (/preview) → heartbeat 60s (pause si onglet caché, ré-open si `alive:false`) → close par `sendBeacon` sur pagehide. `visibilitychange` → heartbeat immédiat au retour d'onglet.
  **AUTO-LANCEMENT** au changement de version après le premier ▶ (drapeau `_viewSession.userStarted`, remis à false au pagehide) — décision David : une fois prouvé humain, pas de second clic.
  **MESSAGE SAFARI/iOS** (`isSafariOuIOS()` : iOS + Safari desktop + piège iPadOS via `maxTouchPoints`) → "ouvrez avec Chrome sur ordinateur, ou téléchargez". **REPLI** : si open échoue → iframe injectée quand même (jamais pire qu'avant).
- **Étape 3 (branche `view-session-etape3`)** — `drive-permsweep.js` SEUL (133 → 168 l.). LE FICHIER LE PLUS SENSIBLE.
  Couche 1 **type-aware** : entrée `view` → épargner si `isViewAlive` (+ ajout à l'ensemble `vivantes`), sinon révoquer + purger. Entrée **sans type = download → règle 5 min STRICTEMENT inchangée**. Couche 2 : `files.list visibility='anyoneWithLink'` → épargner `vivantes`, révoquer le reste (**catch-all orphelines préservé**). **CEINTURE ANTI-COURSE** : relecture fraîche du registre avant chaque révocation (une session ouverte pendant le passage n'est pas coupée). **FAIL-CLOSED** : registre KO → `vivantes` vide → tout révoqué. Constantes IMPORTÉES de `_drive.js` (0 redéfinition). Rollback = revert d'un fichier.
- **Complément (branche `dl-session`)** — `review.html` (808 → 821 l.).
  Le bouton **⬇ ouvre AUSSI une session** avant de télécharger → le téléchargement marche même **sans avoir cliqué ▶**. `window.open('', 'rm-download')` reste **AVANT tout await** (anti-popup). Utilise `viewSessionPost` + `demarrerHeartbeat` **directement, pas `lancerVisionnage`** → `userStarted` non posé par un simple téléchargement (la vignette ▶ reste cohérente). Repli si open échoue. **Bonus : le téléchargement Safari/iOS (leur repli) fonctionne désormais aussi.**

**TRIPLE GARDE-FOU (100% serveur, indépendant du client)**
① silence de heartbeat > 3 min → révocation ≤13 min · ② cap dur 3h appliqué même si les heartbeats continuent (`isViewAlive` intègre `expiresAt`) · ③ couche 2 catch-all ≤10 min. Pire cas absolu borné à ~3h10.

**MULTI-CLIENTS** : N clients sur la même vidéo = **UNE permission partagée** (réutilisation), refermée quand le **DERNIER** spectateur est parti. Fermer un onglet ne coupe pas les autres.

**COMPROMIS SÉCURITÉ ASSUMÉ (David)** : la vidéo est exposée "anyone with link" pendant le visionnage (minutes) au lieu de 0,3s. Argument validé : **la page review donne DÉJÀ accès au contenu complet** (bouton Télécharger légitime) → pas de risque nouveau. Ne concerne QUE les fichiers vidéo Drive pendant un visionnage — ni l'app interne, ni les données Notion.

**VÉRIFS PILOTE (toutes OK)** : node --check sur tous les fichiers. Constantes importées (0 redéfinition). Fail-closed avant toute création. Cohabitation download (cycle 0,3s intact hors session). Anti-popup (`window.open` avant tout await). `userStarted` non posé par le téléchargement. Couche 2 catch-all + ceinture anti-course. Aucune URL loggée. `index.html` et `drive-download.js` JAMAIS touchés.

**TESTS RÉELS VALIDÉS EN PROD (navigation privée = client externe)** : ▶ → vidéo lit + seek ✅ · vidéo dont David n'est PAS propriétaire ✅ · ▶ puis ⬇ → téléchargement ✅ · ⬇ SANS ▶ → téléchargement ✅.

**RESTE À VÉRIFIER** : session > 15 min sans coupure (validation étape 3 — si des coupures persistent, le sweep n'épargne pas correctement). Fermeture brutale → révocation ≤13 min. Orpheline → ≤10 min.

**⚠️ RÈGLE** : `drive-permsweep.js` = sécurité de TOUS les fichiers Drive. Toute modif future → chantier isolé, seul dans sa PR, plan de test dédié.


### 2026-07-17 — Contrôle de version + bandeau « Recharger » (branche `version-banner`)
1 fichier : `index.html` (5994 → **6022 lignes**, +28). **sw.js NON touché** (le mécanisme le contourne par construction). Précédé d'un AUDIT du cache PWA (voir "Cache PWA" en bas).

**POURQUOI**
Audit cache PWA : le piège "PWA figée" N'EXISTE PAS (index.html servi network-first + JS inline → un merge est reçu au prochain lancement, sans rien faire). MAIS un vrai cas restait : quelqu'un qui laisse la PWA ouverte en permanence des jours sans la relancer tourne sur du CODE périmé (avec des données fraîches via le tick — 2 mondes distincts). C'est le comportement attendu des 10 journalistes. Ce chantier couvre ce cas SANS toucher sw.js.

**LA SOLUTION (ETag, zéro maintenance — décision David)**
- `checkAppVersion()` : `fetch('/index.html', {method:'HEAD', cache:'no-store'})`, lit l'en-tête `etag`. 1er passage = baseline (`_appEtag`) ; ETag différent ensuite → une nouvelle version est en prod. Throttle interne : au plus 1 contrôle / 5 min (`_lastVerCheck`). Silencieux si pas d'ETag ou erreur réseau.
- **Pourquoi ETag et pas version.json/constante** : la discipline "incrémenter à chaque déploiement" a DÉJÀ échoué (SW_VERSION figé depuis juin malgré ~10 déploiements). L'ETag Netlify change AUTOMATIQUEMENT à chaque déploiement modifiant index.html → RIEN à faire au déploiement, jamais d'oubli possible. Bonus : le HEAD contourne sw.js par construction (le SW n'intercepte que les GET), et un version.json serait figé par le SW (route .json = cache-first) → piège évité.
- Greffé sur `autoRefreshTick` (1 ligne, fire-and-forget, non attendu → ne ralentit pas le refresh des données). PAS de nouveau timer → hérite pause onglet-caché + nettoyage logout. Baseline amorcée dans showApp() au démarrage.
- `#version-banner` (masqué par défaut) : DISTINCT du `#refresh-banner` (données). Rouge (`var(--red)`, texte blanc), "🚀 Nouvelle version de l'app disponible — Recharger", onclick `location.reload()`. Placé juste sous #refresh-banner. Les 2 bandeaux coexistent.
- **DÉCISION David : bandeau, PAS de rechargement auto** (contrôle total à l'utilisateur, jamais forcé, aucun risque de perte de saisie). Le bandeau s'affiche même pendant une saisie (totalement passif : rien sans clic volontaire), pas de logique de masquage (plus simple = plus robuste), reste jusqu'au reload.

**VÉRIF PILOTE (OK)**
node --check. sw.js non touché (absent du diff). checkAppVersion = HEAD /index.html + etag + throttle 5 min. Greffé sur le tick (aucun nouveau setInterval : seuls les 2 existants notifs+autoRefresh). Baseline dans showApp. 2 bandeaux distincts (couleur/texte/action séparés). Rafraîchissement auto données intact (autoRefreshTick 3, empreinte 2, editionEnCours 2, appliquerFresh 3). Compteurs préservés : createNotif=27, journMonteursNoms=4, refreshJournMonteursSelects=7, annulerVersion=2, validationBrand=16, DB_CLIENTS_BRAND=6, apiQueryAll=11, telechargerVersion=2, resolveDriveFolder=3, isPWAStandalone=3, renderSidebarCats=5, copierLienFiche=2, CHEF_PAR_DEFAUT='Benjamin', EQUIPE_FALLBACK=[]. Nouveaux : checkAppVersion=3, _appEtag=3, version-banner=2.

**À FAIRE DAVID** : branche `version-banner` (index.html) → PR → preview. TEST : se connecter, laisser tourner ≥1 tick ; pousser un changement d'index.html sur la même branche (redéploiement) → dans ~5-6 min le bandeau rouge apparaît sans rien interrompre ; clic "Recharger" → nouvelle version, bandeau disparu. Vérifier : onglet caché → aucun HEAD dans Network ; ETag présent sur /index.html (HEAD 200 avec en-tête etag). Merge.

**⚠️ RÈGLE D'OR (toujours valable)** : toute future modification de sw.js = bump de SW_VERSION obligatoire dans le même commit. sw.js est le fichier le plus risqué (mal fait = app cassée hors-ligne / 10 users bloqués) → chantier isolé, testé Safari+Chrome. Chantier reporté : passer les CSS en network-first dans sw.js (évite le décalage d'1 session sur les CSS après déploiement) — seul dans sa PR, avec bump SW_VERSION.


### 2026-07-17 — Favicon review + deep link vers une fiche (branche `deeplink-favicon`)
2 fichiers : `review.html` (705 → **707 lignes**, +2), `index.html` (5961 → **5994 lignes**, +33). Aucune fonction serveur. sw.js/cache PWA NON touché (chantier séparé).

**A. FAVICON review.html**
La page review client affichait le globe générique dans l'onglet (pas le logo Réel Média). Ajout des 2 balises favicon de index.html dans le <head> de review.html (après <title>) : `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` + `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">`. Fichiers existants à la racine, chemins absolus valides depuis review.html.

**B. DEEP LINK VERS UNE FICHE (usage ÉQUIPE, index.html seul)**
Depuis une fiche sujet ouverte, un bouton copie un lien partageable (Slack/WhatsApp) à un membre de l'équipe ; au clic, après login, la fiche s'ouvre directement.
- DÉCOUVERTE : le routage `?sujet=` existait DÉJÀ dans showApp (hérité du clic sur notif push, dans le .then() de appLoadData → timing login déjà bon : après login ET données chargées). Chantier = durcir l'existant + ajouter le bouton, pas créer.
- Format d'URL : `/?sujet=<id Notion>` — id UNIQUEMENT (décision David ①). PAS de tolérance au code : l'unicité du code B09Y n'est pas garantie (bug audit n°1), un lien par code pourrait ouvrir le mauvais sujet. openDetail travaille déjà par id.
- Résolution : `sujets.find(x => x.id === sujetParam)`. Trouvé → navTo('production') + openDetail. Introuvable (supprimé/archivé/faute) → `toast('Sujet introuvable ou archivé','err')` + navTo('dashboard'). JAMAIS de blocage (tout dans le .then du chargement réussi ; sans param, chemin strictement inchangé = else navTo dashboard).
- `history.replaceState` après consommation du ?sujet= (décision David ②) → F5 ne rouvre plus la fiche.
- Bouton "🔗 Copier le lien" (#d-copylink) dans le HEADER du modal #ov-detail uniquement (groupé à droite, à gauche de la croix) → jamais sur les cartes. copierLienFiche(this) : lien = origin+pathname+'?sujet='+_detailSujetId → clipboard + toast "Lien de la fiche copié 🔗" + libellé "Copié ✓" 1,5s, repli toast(lien) si presse-papier refusé. Globale `_detailSujetId` posée en tête d'openDetail.

**VÉRIF PILOTE (OK)**
node --check les 2 pages. Favicon = 2 balises vers fichiers existants (identiques index.html). Deep link : id-only confirmé, erreur→toast+dashboard, replaceState après ouverture, démarrage sans param strictement inchangé (else navTo dashboard intact), bouton dans le header modal seulement. sw.js et rafraîchissement auto INTOUCHÉS (autoRefreshTick=3, editionEnCours=2, empreinte=2, appliquerFresh=3 — le modal ouvert reste couvert par la garde .overlay.open). Compteurs préservés : createNotif=27, journMonteursNoms=4, refreshJournMonteursSelects=7, annulerVersion=2, validationBrand=16, DB_CLIENTS_BRAND=6, apiQueryAll=11, telechargerVersion=2, resolveDriveFolder=3, isPWAStandalone=3, renderSidebarCats=5, CHEF_PAR_DEFAUT='Benjamin', EQUIPE_FALLBACK=[]. Nouveaux : copierLienFiche=2, _detailSujetId=4, d-copylink=1.

**À FAIRE DAVID** : branche `deeplink-favicon` (review.html + index.html) → PR → preview. TESTS : onglet review → logo Réel Média (vider cache si besoin) ; fiche ouverte → bouton 🔗 → "Copié ✓" + toast → coller le lien dans un autre navigateur → login → la fiche s'ouvre seule + URL propre ; F5 → dashboard normal ; id bidon → toast "Sujet introuvable" + dashboard ; sans param → comme avant ; clic notif push → fiche comme avant. Merge.


### 2026-07-17 — Rafraîchissement automatique multi-utilisateur (avant partage aux ~10 journalistes)
1 fichier : `index.html` (5881 → **5961 lignes**, +80). Aucune fonction serveur. Précédé d'un AUDIT multi-utilisateur complet (voir plus bas).

**POURQUOI**
L'app va passer à ~10 personnes simultanées. Audit Claude Code : le risque d'ÉCRASEMENT de données est quasi nul (chaque action PATCH un champ ISOLÉ, pas la page entière → 2 personnes sur la même carte mais champs différents = pas de conflit). MAIS point bloquant : quand Benjamin a une vue/carte ouverte et qu'un journaliste modifie la même donnée, Benjamin ne voit RIEN tant qu'il ne recharge pas (aucun refresh auto). Ce chantier corrige ça.

**LA SOLUTION (stratégie validée)**
- Timer unique `_autoRefreshTimer` créé dans showApp() (clearInterval défensif avant → pas de cumul), intervalle **60s** (choisi vs 45s pour ménager le quota Netlify d'invocations de fonctions). Listener visibilitychange → tick immédiat throttlé (1/15s). Nettoyé dans doLogout().
- `autoRefreshTick` : garde (document.hidden || busy || !currentUser) → **pause quand l'onglet est caché**. apiQueryAll DB_PROD (Archivé=false), parsePage. Puis diff via `empreinte()`.
- **PIÈGE ÉVITÉ (badges 🔔)** : `empreinte(list)` = JSON.stringify en EXCLUANT retoursOuverts (car parsePage l'initialise à 0 et les badges le remplissent APRÈS côté client via loadRetoursBadges ; sans exclusion, le diff serait TOUJOURS "changé" et le refresh EFFACERAIT les badges). `appliquerFresh` recopie les retoursOuverts actuels par id dans les données fraîches avant de remplacer `sujets`.
- Diff égal → return, zéro re-render, zéro scroll touché (cas majoritaire). Diff différent + `editionEnCours()` → bandeau, zéro re-render. Sinon → appliquerFresh (mise à jour douce).
- `editionEnCours()` = activeElement INPUT/TEXTAREA/SELECT, OU `.overlay.open` présent (fiche détail ov-detail, création ov-new, retour, confirmation, équipe…), OU #video-player-modal présent. La saisie est SACRÉE : tant qu'un seul est vrai → mode bandeau, aucun re-render.
- `appliquerFresh` : préserve scrollTop de #main-content + scrollLeft du kanban, re-render via le chemin EXISTANT (appSetVue/appRenderDashboard), met à jour cnt-all + renderSidebarCats.
- Bandeau #refresh-banner (masqué par défaut) : n'apparaît QUE si (changement détecté ET édition en cours). "Des modifications ont été faites par l'équipe — Actualiser". Clic → appliquerFresh(_freshEnAttente). **PAS d'auto-application au blur** (décision David : bandeau au clic, prévisible, rien ne bouge sans action). Le tick suivant ré-applique tout seul dès que l'édition est finie (45-60s de latence max).
- BONUS embarqués : pause onglet-caché AUSSI sur le polling notifs existant (loadNotifs ne tourne plus si onglet masqué) ; timer notifs préexistant désormais nettoyé au logout (petit bug corrigé).

**VÉRIF PILOTE (OK)**
node --check. empreinte exclut bien retoursOuverts + recopie des badges dans appliquerFresh (badges préservés). editionEnCours exhaustive. Timer unique créé showApp + clearInterval défensif + nettoyé logout (les 2 timers). Pause onglet-caché sur autoRefreshTick ET loadNotifs. Intervalle 60000 (0 occurrence 45000). Scroll préservé (scrollTop main-content + scrollLeft kanban). Compteurs : hausses attendues apiQueryAll 10→11 (appel du tick l.2787) et renderSidebarCats 4→5 (appel appliquerFresh l.2806) — vérifiées, pas des régressions. Acquis intacts : createNotif=27, journMonteursNoms=4, refreshJournMonteursSelects=7, annulerVersion=2, validationBrand=16, DB_CLIENTS_BRAND=6, telechargerVersion=2, resolveDriveFolder=3, isPWAStandalone=3, CHEF_PAR_DEFAUT='Benjamin', EQUIPE_FALLBACK=[].

**CHARGE / QUOTA (point d'attention)**
Rate-limit Notion : large marge (~0,85 req/s à 10 users vs limite ~3). MAIS quota Netlify (invocations de fonctions, 125k/mois en Free) : ~3 invocations/tick chiffre vite à 10 users. Mitigations déjà embarquées : 60s + pause onglet-caché sur les 2 pollings. Optimisation en réserve si le quota se tend : "delta last_edited_time" (1 requête/tick au lieu de 3).

**À FAIRE DAVID** : brancher (index.html) → PR → preview. TESTS : ouvrir 2 sessions (2 comptes/navigateurs), modifier une carte dans l'une → l'autre doit refléter le changement sous ~60s SANS recharger ; pendant une saisie (retour, édition champ, fiche ouverte) dans l'une, modif dans l'autre → bandeau "Actualiser" apparaît, rien ne bouge tant qu'on n'a pas cliqué ; badges 🔔 ne clignotent/disparaissent PAS ; scroll ne saute pas ; onglet en arrière-plan → pas de requêtes (vérifier Network). Merge.

**AUDIT MULTI-UTILISATEUR — RESTE À FAIRE (après ce chantier)**

**⚠️ RETOUR D'USAGE RÉEL (20/07) — 2 CHANTIERS DÉCIDÉS, NON ENCORE LANCÉS**
1. **BANDEAU DE RAFRAÎCHISSEMENT TROP BAVARD** (irritant quotidien de David). Le bandeau "Actualiser" se déclenche dès qu'un champ change **n'importe où** dans la base (empreinte GLOBALE) → bruit permanent qu'on finit par ignorer. Et après avoir cliqué "Actualiser", David **perd ses repères** (re-render complet) — au point d'avoir refait des modifs par confusion (aucune donnée perdue, vérifié).
   **DÉCISION PRODUIT VALIDÉE** : passer d'une empreinte globale à un **diff PAR SUJET**.
   • Changement sur un sujet que je ne regarde pas → **application SILENCIEUSE** (cas majoritaire, aucun bandeau).
   • Fiche ouverte en **LECTURE seule** + modifiée → **silence aussi** (regarder ≠ modifier — précision David).
   • Bandeau UNIQUEMENT si je suis **en train de toucher** la fiche que quelqu'un modifie (vrai risque de conflit).
   • `editionEnCours` reste la garde absolue (ne jamais interrompre une saisie).
   À creuser aussi : pourquoi la désorientation malgré `scrollTop` restauré (cartes qui changent de place au tri ? survol/focus perdus ?) → piste : ne re-rendre que les cartes réellement modifiées. index.html seul.
2. **PRÉSENCE — "qui regarde la même fiche"** (idée David, intéressée). Afficher "Benjamin regarde aussi cette fiche" façon Google Docs. Chantier à part entière (mécanisme de présence + quota Netlify). **Synergie** : réutiliserait le même patron que le heartbeat du visionnage — à cadrer APRÈS, avec l'expérience acquise.

**AUTRES SUJETS EN ATTENTE**
- Notifs : 2 angles morts. (1) PWA fermée = pas de push (les notifs ne partent que si l'app est ouverte quelque part). (2) cas de perte/duplication selon synchro. À robustifier plus tard.
- Cache PWA / service worker (point 8, à auditer séparément) : quand une nouvelle version est mergée, les 10 users voient-ils la MAJ ou restent bloqués sur une version en cache ? Risque de 10 personnes sur des versions différentes. À vérifier AVANT/juste après le partage.
- Rate-limit / quota Netlify : surveiller à l'usage réel.


### 2026-07-16 — UX vue Cartes compactes + catégories sidebar (branche `ux-cartes-sidebar`)
3 fichiers : `index.html` (5849 → **5881 lignes**, +32), `css/components.css` (+24), `css/layout.css` (+8). Aucune fonction serveur, aucune autre vue touchée. (S7+S8 + 2 ajustements colonnes/badge intégrés dans la même branche.)

**S7 — CARTES COMPACTES (vue Cartes)**
Les cartes de la vue Cartes étaient trop grandes (~140px, ~5 par écran). Rendues compactes (~78px, ~10-12 par écran) en gardant TOUTES les infos (code, format, corbeille, titre, journaliste, statut, dates, barre progression, badge retours). Réorganisation : journaliste + statut sur une seule ligne (statut prioritaire, nom tronqué en ellipsis si besoin).
- Scoping SÛR : modificateur `card--c` appliqué UNIQUEMENT aux 2 gabarits de la vue Cartes (cardHTML + cardHTMLHighlight). La classe `.card` standard N'EST PAS modifiée → vue Idées (qui utilise .card seul) intacte.
- Corbeille : `@media (hover:hover) and (pointer:fine)` → discrète au survol sur desktop, TOUJOURS visible en tactile.

**S8 — CATÉGORIES DANS LA SIDEBAR**
Ajout sous "Production" de sous-entrées cliquables (#sb-cats) : MAG, Brand, Face Cam, Desk, YouTube (formats réellement présents), avec pastille couleur (FMT_COLORS) + compteur. renderSidebarCats calcule les compteurs côté client depuis `sujets` (zéro appel réseau). sbCatClick → appFilter('f', fmt, pill) via data-fmt sur les pilules → MÊME chemin qu'un clic pilule (cohérence pilules↔sidebar dans les 2 sens : renderSidebarCats rappelé dans appFilter + appLoadData + appRender). Desktop-only (sidebar masquée en mobile ; les pilules restent le chemin mobile). Vérifié : ces catégories n'existaient PAS dans la sidebar avant (ce qui ressemblait à ça = les pilules de filtre).

**AJUSTEMENTS (même branche, empilés sur S7+S8)**
- Colonnes vue Cartes adaptatives : `.cards--c` = repeat(auto-fill, minmax(300px,1fr)) scopé à la vue Cartes (les 3 conteneurs cardHTML/cardHTMLHighlight) → ~5 colonnes grand écran, 4 laptop, 1 mobile (override `@media max-width:700px`). `.cards` historique (minmax 270px) intacte → Idées non affectées.
- Badge notif déplacé : avant sur une ligne EN BAS (rallongeait la carte → toute la rangée de la grille prenait cette hauteur). Maintenant CHIFFRE SEUL (`🔔 N`) à côté du code EN HAUT, dans les 2 gabarits à l'identique, ancien bloc bas supprimé → toutes les cartes même hauteur avec/sans notif. Badge visible aussi en recherche active.

**ABANDONNÉ (décision David)** : S3 sections repliables par statut dans la vue Cartes → redondant avec les filtres/pilules existants et la vue Par statut. Testé en maquette, écarté.
**REPORTÉ** : S1 (masquer PAD par défaut), S2 (colonnes Kanban plafonnées pour le déséquilibre de la vue Par statut), S6 (archivage assisté des PAD de +30j — touche aux DONNÉES Notion → chantier séparé prudent, confirmation + lots séquentiels). Cause racine du volume : les sujets livrés (PAD) ne sortent jamais des vues tant que "Archivé" n'est pas coché à la main.

**VÉRIF PILOTE (OK)** : node --check. card--c=2 (les 2 gabarits), .card standard intacte (Idées OK), corbeille @media hover, S8 branché sur appFilter + compteurs depuis sujets + synchro 2 sens, data-fmt=8. Compteurs préservés : createNotif=27, journMonteursNoms=4, refreshJournMonteursSelects=7, annulerVersion=2, validationBrand=16, DB_CLIENTS_BRAND=6, apiQueryAll=10, telechargerVersion=2, resolveDriveFolder=3, isPWAStandalone=3, openDriveFolderSync=5, CHEF_PAR_DEFAUT='Benjamin', EQUIPE_FALLBACK=[]. Autres vues (kanban, dashboard, liste, calendrier, Idées, Archives) non touchées.

**À FAIRE DAVID** : branche `ux-cartes-sidebar` (index.html + css/components.css + css/layout.css) → PR → preview : vue Cartes compacte (10-12 cartes visibles, corbeille au survol desktop + visible tactile, toutes infos présentes) ; sidebar avec catégories + compteurs, clic = filtre (synchro avec les pilules) ; VÉRIFIER VUE IDÉES NON CASSÉE (seul risque : partage classe .card) ; autres vues inchangées. Merge.


### 2026-07-16 — Téléchargement en nouvel onglet réutilisé (branche `dl-nouvel-onglet`)
2 fichiers : `index.html` (5838 → **5849 lignes**, +11), `review.html` (694 → **705 lignes**, +11). Fonctions serveur, notion.js, bouton Dossier INTOUCHÉS.

**PROBLÈME**
Au clic sur Télécharger (les DEUX pages : lecteur interne + review client), le lien se déclenchait dans la MÊME fenêtre. Sur les gros fichiers (>100 Mo, toujours le cas ici : vidéos 100-500 Mo), Google impose son écran interstitiel « Télécharger quand même » (drive.usercontent.google.com) qui REMPLAÇAIT la page → au retour, la carte + la vidéo étaient perdues, l'app devait se recharger entièrement.

**PISTES EXPLORÉES (panorama Claude Code) — pourquoi le nouvel onglet**
Impossible de supprimer l'interstitiel Google de façon fiable/sûre : l'afficher dans une iframe de l'app = bloqué (CSP frame-ancestors Google) ; `<a download>` cross-origin = ignoré ; fetch+blob sur usercontent = bloqué CORS ; params confirm/uuid = fragile non documenté. La SEULE porte « zéro interstitiel » = API Drive alt=media via jeton SA (fetch→blob), mais : blob 500 Mo risqué sur mobile + le jeton SA donne accès en lecture à TOUT ce que voit le SA → INUTILISABLE côté client externe (un client lirait les vidéos des autres). Réservé à l'app interne, en réserve pour plus tard si l'interstitiel agace vraiment. Proxy streaming Netlify = exclu (500 Mo × équipe = dépassement bande passante + coût). Donc PISTE 1 retenue = nouvel onglet.

**LA CORRECTION**
Patron anti-popup (même que le bouton Dossier) sur telechargerVersion (index.html) ET telechargerReview (review.html) : `const win = window.open('', 'rm-download')` ouvert AU CLIC (avant le fetch → pas bloqué par l'anti-popup), rempli après le POST (`win.location = downloadUrl`). L'onglet NOMMÉ 'rm-download' est RÉUTILISÉ pour les téléchargements successifs (pas d'empilement). Secours `<a target="_blank">` si l'utilisateur a fermé l'onglet pendant « Préparation… ». Repli erreur : réutilise l'onglet (`win.location = viewUrl`). La page courante (carte + vidéo / vidéo + retours) reste intacte ; l'interstitiel Google vit dans l'onglet séparé.

**VÉRIF PILOTE (OK)**
node --check les 2 pages. Patron rm-download au clic confirmé sur les 2 fonctions (rm-download=2 par fichier). Cas PWA intact (garde isPWAStandalone AVANT l'ouverture de l'onglet → aucun onglet fantôme). Repli /view réutilise l'onglet. Compteurs TOUS préservés : telechargerVersion=2, isPWAStandalone=3, openPlayerInBrowser=2, resolveDriveFolder=3, openDriveFolderSync=5, drivefolderPending=5, prefetchDriveFolder=4, createNotif=27, journMonteursNoms=4, refreshJournMonteursSelects=7, annulerVersion=2, validationBrand=16, DB_CLIENTS_BRAND=6, apiQueryAll=10, CHEF_PAR_DEFAUT='Benjamin', EQUIPE_FALLBACK=[]. Seuls index.html + review.html modifiés.

**EN RÉSERVE (décision plus tard)** : piste 3-API (fetch alt=media via jeton SA éphémère, barre de progression, garde-fou taille/mobile) pour « zéro interstitiel » CÔTÉ APP INTERNE UNIQUEMENT (jamais côté client externe pour raison de sécurité). À décider sur retour d'usage réel.

### 2026-07-16 — ✅ VALIDÉ EN PROD : téléchargement app + bouton Dossier (partage Arnaud fait)
Aucune modif de code — note de validation. Arnaud a partagé les dossiers de prod avec le Service Account `reelmedia-drive@reelmedia-prod.iam.gserviceaccount.com` en **CONTRIBUTEUR** (Drive partagé) — ce niveau SUFFIT (pas besoin de Gestionnaire de contenu).
- TÉLÉCHARGEMENT (piste B) testé OK sur B09Y_PLEINE_MER (490 Mo) : lien `drive.usercontent.google.com/download?...&confirm=t`, plus de blocage authuser= (le fichier est rendu public le temps du DL). L'écran Google « impossible de lancer l'analyse antivirus (fichier trop volumineux) → Télécharger quand même » est NORMAL pour tout fichier >100 Mo (signe de succès, pas une erreur).
- BOUTON DOSSIER testé OK : ouvre bien le dossier parent (drive/folders/...), plus le fichier.
- Les erreurs console « Framing/CSP frame-ancestors » et 429 sont du bruit Google (multi-compte/rate-limit), pas des bugs de l'app.

### 2026-07-16 — Chantier 1 : téléchargement client sur review.html (branche `chantier1-review`, mergé PR #34)
> NOTE : le portier a d'abord renvoyé 403 en test (il ne vérifiait l'appartenance du fileId que dans Lien V1/V2/V3 du sujet = système A, alors que les vidéos vivent dans la base 📹 Versions = système B). CORRIGÉ avant merge : drive-download-review.js vérifie désormais l'UNION des 2 sources (Lien V1/V2/V3 du sujet ∪ Titre des pages 📹 Versions dont Sujet ID = id du sujet, versions Annulées incluses). DB_VERSIONS='3793eebb-2aeb-4d49-84ae-06d79cfb2704'. Testé OK sur B09Y. 2 requêtes Notion par téléchargement.

4 fichiers : `netlify/functions/_drive.js` (NOUVEAU), `netlify/functions/drive-download-review.js` (NOUVEAU), `netlify/functions/drive-download.js` (REFACTORÉ, contrat inchangé), `review.html` (662 → **694 lignes**, +32). index.html et notion.js INTOUCHÉS.

**PROBLÈME**
Le bouton Télécharger de review.html (page client externe) utilisait encore l'ancien toDlUrl mort → URL authuser= → 403 multi-compte. La piste B n'y avait jamais été portée. Le lecteur interne (index.html/telechargerVersion) marchait déjà.

**LA CORRECTION (chantier 1 d'un plan de 3 ; chantiers 2 et 3 REPORTÉS)**
- `_drive.js` (helper non exposé) : extrait la mécanique commune piste B (jeton SA, appels Drive, préflight canShare, permission anyone, registre drive-open-perms en write-ahead, lien confirm=t, révocation immédiate). Fonction `openEphemeralDownload(fileId)` utilisée par les 2 portiers. IMMEDIATE_REVOKE vit ici désormais.
- `drive-download.js` : REFACTORÉ pour déléguer à _drive.js. Contrat + comportement STRICTEMENT identiques (POST, {id,code,fileId}, verifyUser→401, mêmes statuts/réponses). L'app ne voit aucune différence.
- `drive-download-review.js` (NOUVEAU portier client) : POST {sujetCode, fileId}, PAS de verifyUser (client externe sans compte). Sécurité = cohérence Notion : interroge DB_PROD (Code=sujetCode) en direct via NOTION_TOKEN, re-dérive les fileId depuis Lien V1/V2/V3, refuse (403) tout fileId hors sujet, 404 si sujet introuvable. Ne fait jamais confiance au ?url= client. Réutilise registre + révocation + sweep via le helper. downloadUrl jamais loggé.
- `review.html` : toDlUrl supprimé, fonction telechargerReview (POST drive-download-review → <a> programmatique → toast), repli page Drive /view en cas d'erreur, feedback bouton « Préparation… ». Parcours client inchangé : 1 clic.

**VÉRIF PILOTE (OK)**
node --check sur les 3 fonctions + JS inline review.html. drive-download.js : contrat identique confirmé (aucune régression app). _drive.js : write-ahead OK (registre écrit AVANT révocation → sweep rattrape si crash), downloadUrl jamais loggé (1 seul console.warn, sans URL). Portier review : contrôle Notion présent (403 hors sujet, 404 sujet introuvable), bon ID DB_PROD 01a8dc7d..., Notion en direct (pas via proxy), pas de verifyUser (normal). review.html : 0 toDlUrl, bouton câblé sur telechargerReview, repli /view. index.html + notion.js absents du diff.

**À FAIRE PAR DAVID**
Monter branche `chantier1-review` (4 fichiers, noms à tirets pour les 2 fonctions + _drive.js dans netlify/functions/) + ce CONTEXT → PR → preview. TEST NON-RÉGRESSION PRIORITAIRE : le bouton Télécharger du LECTEUR INTERNE doit marcher exactement comme avant (c'est le refactor drive-download à surveiller). Puis : téléchargement depuis un lien review client (sans 403), même en navigation privée / mauvais compte Google. Puis sécurité portier : fileId d'un autre sujet → 403 ; code bidon → 404. Puis merge.

**REPORTÉ (décision David) — chantiers 2 et 3 de la sécurisation review, à décider plus tard**
- Chantier 2 : token de review (dégradation douce, anciens liens préservés, TTL ~90j, store Blobs review-tokens) + traçabilité validation (préfixe token dans la notif). Protégerait mieux la page SANS changer le parcours client.
- Chantier 3 : durcissement fin de notion.js (liste blanche : query/create sur les 13 bases connues, GET/PATCH pages, reste → 403). Le proxy est actuellement OUVERT à tous. LE plus risqué (tuyau central de TOUTE l'app) → déploiement en 2 temps (observation qui logge ce qui serait bloqué → enforcement après logs propres).
- ⚠️ IMPORTANT : le chantier 1 est NEUTRE côté sécurité — la page review reste non protégée (n'importe qui avec le lien peut lire le sujet, écrire des retours, VALIDER une version, créer des notifs __chef__ ; proxy notion.js ouvert). La vraie protection = chantiers 2+3.

**IDÉE À CREUSER (pas commencée) — séquenciers collaboratifs**
David envisage un « Google Docs / Notion » dans l'app pour que les journalistes écrivent les séquenciers et Benjamin corrige (avec trace des corrections). Reco Pilote : NE PAS recoder un éditeur collaboratif temps réel (trop lourd, fragile, contre la priorité stabilité) → brancher sur Notion qui fait tout ça nativement (écriture riche, commentaires, historique, multi-utilisateur). Option pressentie : bouton « Ouvrir le séquencier » depuis la carte du sujet → page Notion liée. À cadrer avec Master (produit + Notion). Sujet mis en pause à la demande de David, à reprendre.


### 2026-07-15 — Fix pagination Notion : helper apiQueryAll (branche `fix-pagination`, par-dessus Dossier)
1 seul fichier : `index.html` (5812 → **5838 lignes**, +26). `notion.js` INTOUCHÉ (reste proxy passif). Empilé sur main après merge PR #32 (Dossier).

**BUG (diagnostic Master + Pilote + Claude Code)**
David ne voyait qu'~5 cartes MAG sur 21 (M649-M669). Cause : l'API Notion renvoie max 100 résultats par query. La base a dépassé 100 cartes (68 Desk D1144-D1211 ajoutées le 15/07). Le front ne paginait JAMAIS (0 occurrence has_more/next_cursor/start_cursor dans index.html) : appLoadData faisait 1 seul query page_size:100, tri created_time DESC → les 68 Desk récentes remplissaient les 100 premiers résultats et éjectaient les MAG de mai hors de la fenêtre (jamais chargées, invisibles dans toutes les vues). notion.js relaie bien has_more/next_cursor mais le front les ignorait. Cartes présentes dans Notion, juste non rapatriées.

**LA CORRECTION (index.html uniquement)**
- Helper `apiQueryAll(endpoint, body)` : enchaîne les pages via start_cursor jusqu'à has_more=false, concatène, renvoie `{results:[...tous]}` (même forme de lecture qu'un query simple → call sites inchangés dans leur lecture .results). Passe par api() donc hérite du retry 429/503 + bandeau Phase A. Garde-fou 50 pages (5000 items) avec console.warn. Chaque page = 1 invocation Netlify distincte → PAS d'enjeu timeout 10s (raison du choix front vs serveur).
- 8 call sites basculés sur apiQueryAll (page_size retiré du body, filtres/tris inchangés) : appLoadData (DB_PROD actives — le bug), vue Archives (DB_PROD archivées), loadIdees (DB_IDEES), loadTachesPerso + loadTachesBadgeSilent + loadTachesSujet (DB_TACHES), loadRetoursBadges + markAllRead (DB_NOTIFS).
- markAllRead : écritures par lots SÉQUENTIELS de 3 PATCH (fini le Promise.all illimité, respecte rate-limit Notion ~3 req/s) + feedback bouton "Tout marquer lu" (id mark-all-btn : désactivé + "…" pendant l'op, rétabli en finally).
- NON touché : filtres notifs inchangés (PAS de Lu=false ajouté — décision David : fix pagination pur, filtrage des lues reste côté JS). Sites hors périmètre gardés en page_size:100/50/20 : loadNotifs (20), queries par sujet (déclinaisons, versions+retours), activité dashboard (50), DB_COMP/DB_CLIENTS_BRAND/DB_EQUIPE (cardinalité < 100).

**VÉRIF PILOTE (OK)**
node --check + JS inline valide. index.html 5838 lignes. apiQueryAll=10 (déf + console.warn + 8 call sites, tous vérifiés sur les bonnes DB). Aucun Lu=false (les 2 'Lu' sont des écritures PATCH checkbox:true, pas des filtres). markAllRead : lots de 3 confirmés, feedback bouton OK (mark-all-btn=2). 5 page_size restants = helper + 4 sites hors périmètre voulus. Acquis TOUS intacts : createNotif=27, journMonteursNoms=4, refreshJournMonteursSelects=7, annulerVersion=2, validationBrand=16, DB_CLIENTS_BRAND=6, CHEF_PAR_DEFAUT='Benjamin', EQUIPE_FALLBACK=[], + fixes précédents non affectés (telechargerVersion=2, resolveDriveFolder=3, drivefolderPending=5, openDriveFolderSync=5, prefetchDriveFolder=4, isPWAStandalone=3, openPlayerInBrowser=2). cnt-all se corrige seul (lit sujets.length).

**À FAIRE PAR DAVID**
Monter la branche `fix-pagination` (1 fichier index.html) + ce CONTEXT → PR → tester en preview : les 21 MAG visibles + cnt-all ≥ 168 ; vue Archives complète ; Idées/Tâches inchangées à l'œil ; "Tout marquer lu" avec plusieurs non-lues → bouton "…" quelques secondes puis tout passe lu ; onglet Network : 2 appels DB_PROD au chargement au lieu d'1 (~400ms de plus, masqué par le spinner).

**EN SUSPENS — chantier UX vue Cartes/Liste (PAS ENCORE FAIT)** : avec >150 cartes, la vue devient chargée. David gêné par 3 choses : cartes terminées/PAD qui s'accumulent, trop de cartes actives simultanées, difficulté à retrouver une carte précise. Approche pressentie (à faire en PROPOSITION après ce fix) : masquer les terminées par défaut (bouton "afficher terminées" comme sur les tâches) + s'appuyer sur filtres/regroupements existants (vue Par statut, Par journaliste) + barre de recherche (code/titre). PAS de pagination à pages (mal adaptée à l'usage). À traiter comme un chantier UX distinct.


### 2026-07-15 — Fix bouton « Dossier » : cache 3 états + 3 boutons cohérents (branche `fix-dossier`, par-dessus le merge téléchargement)
1 seul fichier : `index.html` (5785 → **5812 lignes**, +27). `drive.js` INTOUCHÉ (reste readonly). Empilé sur main après merge PR #31 (téléchargement).

**DIAGNOSTIC (tests à l'appui, 2 lectures indépendantes)**
Le bouton « Dossier » d'une version ouvrait le FICHIER au lieu du DOSSIER PARENT. Tests sur la fonction serveur `drive?fileId=…` : une vidéo vue du SA renvoie bien `{folderUrl:…}` (serveur OK), une vidéo NON partagée avec le SA renvoie `{error:"File not found"}`. Donc `drive.js` n'est PAS en cause. Deux vrais bugs identifiés côté FRONT dans le cache : (1) RACE — le fallback fichier était écrit dans le cache AVANT l'appel serveur, un clic pendant l'appel ouvrait le fichier ; (2) ÉCHEC VERROUILLÉ — un seul raté (réseau, 500, folderUrl null) laissait le fallback en cache et le garde `if(cache) return` bloquait tout retry de la session. Cause dominante des symptômes = partage Drive incomplet (même racine que le 403 téléchargement) ; le fix front règle le comportement, pas l'accès.

**LA CORRECTION (index.html uniquement, 5 points)**
- `getDriveFileId` reconnaît aussi le format `open?id=XXX` (avant : seulement `/file/d/ID` ; les autres URL rendaient le bouton muet).
- Cache 3 états : `drivefolderCache` (vraies folderUrl UNIQUEMENT) + `drivefolderPending` (Promises en cours, anti-doublon) + fonction centrale `resolveDriveFolder(fileId)`. Succès → mis en cache ; échec → RIEN mémorisé (catch→null, finally supprime le pending) → retry possible. Plus jamais de fallback stocké en cache.
- `openDriveFolderSync` : si résolu → ouvre le dossier directement ; sinon → onglet ouvert sur le geste utilisateur (anti-popup) puis redirigé vers le dossier, ou vers le fichier `/view` en DERNIER RECOURS au clic (jamais en cache).
- `openPlayer` déclenche `prefetchDriveFolder(url)` à l'ouverture (type drive), placé APRÈS la déviation PWA (celle-ci reste prioritaire et intacte → lecture PWA non affectée).
- Bouton « 📁 Dossier » du header lecteur (~ligne 3235) rebranché sur `openDriveFolderSync` (avant : lien statique en dur vers le fichier, n'avait JAMAIS ouvert le dossier). Les 3 boutons Dossier (fiche détail, liste versions, header lecteur) se comportent désormais pareil. Note : changement de comportement assumé pour le bouton lecteur (décision produit de David).

**VÉRIF PILOTE (OK)**
node --check + JS inline valide. index.html 5812 lignes (5785 +27). Acquis intacts : createNotif=27, journMonteursNoms=4, refreshJournMonteursSelects=7, annulerVersion=2, validationBrand=16, DB_CLIENTS_BRAND=6, CHEF_PAR_DEFAUT='Benjamin', EQUIPE_FALLBACK=[]. Téléchargement NON touché : telechargerVersion=2, openPlayerInBrowser=2, isPWAStandalone=3. Nouveaux : resolveDriveFolder=3, drivefolderPending=5, drivefolderCache=4. 2 écarts de compteurs signalés par Claude Code élucidés et bénins (openDriveFolderSync=5 dont 1 commentaire ligne 1186 ; prefetchDriveFolder=4 = 3→4 correct). Déviation PWA vérifiée AVANT le prefetch. drive.js non modifié (appel GET readonly inchangé).

**À FAIRE PAR DAVID**
Monter la branche `fix-dossier` (1 fichier : index.html) + ce CONTEXT → PR → tester en preview : les 3 boutons 📁 ouvrent le dossier parent (sur une vidéo VUE du SA) ; clic très rapide après ouverture d'une fiche → onglet bref puis dossier (course corrigée) ; couper le réseau, cliquer (fichier en dernier recours), rétablir, re-cliquer → dossier revient (verrou levé). RAPPEL : sur une vidéo non partagée avec le SA, le bouton retombe légitimement sur le fichier — c'est un souci de PARTAGE, pas de code (réglé par le partage Drive au SA, cf. entrée téléchargement / geste d'Arnaud).


### 2026-07-15 — Téléchargement direct des vidéos Drive via permission éphémère (piste B)
5 fichiers : `netlify/functions/drive-download.js` (NOUVEAU), `netlify/functions/drive-permsweep.js` (NOUVEAU, Scheduled), `netlify/functions/_blobs.js` (ÉTENDU), `index.html` (5755 → **5785 lignes**, +30), `netlify.toml` (ajout schedule). Aucune modif CSS, Notion, login.js. `drive.js` inchangé (reste readonly).

**PROBLÈME**
Le bouton « Télécharger » d'une version renvoyait un 403 Google. Cause : vidéos Drive « Restreint » + utilisateurs multi-comptes Google → Google épingle le mauvais compte (authuser). Durcissement côté Google, code `toDlUrl` inchangé depuis le 3 juin. La lecture (réglée par PR #30) fonctionnait ; seul le téléchargement restait cassé. Toutes les pistes de lien direct sans proxy sont mortes en multi-compte (403), rendre public en permanent = REFUSÉ (confidentialité clients), Solution A (files.download via SA) = INTERNAL 500 systématique côté Google.

**LA SOLUTION (piste B, validée par spike sur RM_GALLIA_HAPS_SAFETY 140 Mo)**
Au clic, le serveur (Service Account, scope drive complet) rend le fichier temporairement public, génère un lien de téléchargement public (`drive.usercontent.google.com/download?id=...&export=download&confirm=t`), puis re-privatise immédiatement. Fenêtre publique ≈ quelques centaines de ms (le lien reste valide quelques minutes après révocation, le temps de télécharger). Message antivirus Google sur fichiers >100 Mo = NORMAL (pas une erreur).
- `drive-download.js` (NOUVEAU) : POST {id, code, fileId} → verifyUser (401 si invalide, JAMAIS ouvert à tous) → pré-contrôle canShare (403 explicite si SA ne peut pas partager) → permissions.create(anyone, reader) → **écriture registre Blobs AVANT toute suite** → downloadUrl → révocation immédiate + sortie du registre. Constante IMMEDIATE_REVOKE=true (repli false si preview montre que le lien ne survit pas à la révocation → c'est alors le sweep qui referme). downloadUrl jamais loggé.
- `drive-permsweep.js` (NOUVEAU, Scheduled `*/10 * * * *`) : filet de sécurité. Couche 1 = révoque les entrées du registre « drive-open-perms » plus vieilles que TTL 5 min (n'existent que si drive-download a planté avant sa révocation). Couche 2 = rattrapage best-effort via files.list `visibility='anyoneWithLink'`, bornée à 100, ne fait jamais échouer la couche 1. Logs = compteurs uniquement, jamais d'URL ni de nom de fichier.
- `_blobs.js` (ÉTENDU) : ajout de `getDriveOpenPermsStore()` (store « drive-open-perms »). getPushStore + getAuthTokenStore inchangés.
- `index.html` : fonction `telechargerVersion(fileId, btnEl)`. PWA standalone → navigateur externe (session isolée, cohérent avec la lecture). Session sans code/user → repli page Drive /view. Sinon → POST drive-download avec {id, code (rm-code), fileId} → déclenche le téléchargement via `<a download>` + toast ; repli /view en cas d'erreur. fileId via getDriveFileId existant.
- `netlify.toml` : `[functions."drive-permsweep"] schedule = "*/10 * * * *"`.

**VÉRIF PILOTE (OK)**
node --check sur les 3 fonctions + JS inline index.html (270k chars) valide. index.html 5785 lignes (5755 +30, cohérent). Compteurs préservés : CHEF_PAR_DEFAUT='Benjamin'=1, EQUIPE_FALLBACK=[]=1 (avec garde), createNotif=27, journMonteursNoms=4, refreshJournMonteursSelects=7, annulerVersion=2, showHelpModal=2, showConfirmModal=2, validationBrand=16, DB_CLIENTS_BRAND=6. Sécurité serveur : verifyUser obligatoire AVANT toute action Drive (401 sinon) ; registre écrit AVANT révocation (rattrapage sweep si crash) ; scope `auth/drive` limité aux 2 nouvelles fonctions ; câblage front↔back cohérent (mêmes params id/code/fileId).

**À FAIRE PAR DAVID / OPS**
- Déployer les 2 fonctions sous leurs noms AVEC TIRETS : `netlify/functions/drive-download.js` et `netlify/functions/drive-permsweep.js` (les uploads sans tiret ne sont qu'une contrainte d'upload ; sinon le front appelle une fonction inexistante et le schedule ne matche rien).
- MÉNAGE URGENT : supprimer du repo `drivedownloadtest.js` et `drivepermtest.js` (fonctions de test sans sécurité, encore en prod sur main — drivepermtest peut rendre des fichiers publics).
- Faire partager par **Arnaud** (proprio) le dossier racine de prod Drive avec `reelmedia-drive@reelmedia-prod.iam.gserviceaccount.com` en **ÉDITEUR**. Dernière pièce : sans ça, ne marche que sur les fichiers déjà partagés avec le SA. David n'a pas les droits sur ce dossier.
- Déployer sur une branche, tester en preview avant merge. Puis nettoyer.

**POINTS D'ATTENTION**
- Concurrence : 2 téléchargements simultanés du même fichier → la révocation de l'un pourrait couper l'autre (rare). À surveiller à l'usage.
- Scope drive complet donne au SA le droit de modifier les partages (nécessaire pour piste B) — assumé.

**RESTE EN SUSPENS (autres sujets)** : bouton « Dossier » d'une version ouvre le FICHIER au lieu du DOSSIER PARENT (régression Drive, à reprendre) · écrans noirs de lecture ponctuels selon le compte Google actif (multi-compte, non prioritaire) · Phase B sécurité (expiration session) · Phase C (CORS/rate-limiting) · backup nightly Notion→JSON · rename « Montage V1→Montage ».


### 2026-06-05 — Lecture vidéo Drive en PWA via auto-login par jeton éphémère (branche `journ-monteurs-dynamiques`, empilé sur le fix journalistes)
index.html 5637 → **5755 lignes**. 4 fichiers : index.html (modifié), netlify/functions/_blobs.js (étendu), auth-token-create.js + auth-token-consume.js (nouveaux). Aucune modif CSS, Notion, ni login.js.

⚠️ NOTE WORKFLOW : la branche `journ-monteurs-dynamiques` n'avait jamais été commitée (le fix journalistes était livré mais pas commité). Claude Code a donc REFAIT le fix journalistes (Phase 1) PUIS empilé la vidéo PWA (Phase 2) sur la même branche. Les DEUX travaux sont sur cette branche, non commités, en attente de validation.

**PROBLÈME**
Les versions vidéo sont des fichiers Google Drive en partage "Restreint". L'iframe Drive `/preview` a besoin de la session Google de l'utilisateur (cookies). En PWA installée (Safari standalone surtout), les cookies sont isolés → erreur Google 400, la vidéo ne s'affiche pas. En navigateur classique, ça marche (la session Google passe). Confirmé par David : fichier B19E V2 = "Restreint". Toute l'équipe a accès au Drive avec son propre compte Google.

**PISTES ÉCARTÉES (analyses Claude Code + recherches pilote)**
- Rendre les vidéos publiques : REFUSÉ par David (confidentialité montages clients).
- `<video>` HTML5 direct sur URL Drive : même problème de cookies + blocage gros fichiers (>100 Mo). Enterré.
- Se connecter une fois à Google dans la PWA : IMPASSE. Le partitionnement des cookies tiers (Safari ITP) empêche l'iframe Drive de voir la session top-level. Storage Access API non exploitable (c'est à Google de l'appeler, pas nous). Confirmé par 2 sources + Claude Code.
- Proxy serveur (streamer le binaire via Netlify + Service Account) : faisable mais ~19€/mois (dépassement bande passante), discipline ops (partage SA), risque de saccades. Mis de côté.
- OAuth utilisateur + blob : pas de streaming (téléchargement complet avant lecture), RAM élevée. Écarté.

**DÉCISION DE DAVID** : le streaming fluide prime sur "rester dans l'app". Il accepte que la vue s'ouvre dans le navigateur. Il veut que ce soit transparent (pas de reconnexion). Comme la session app (rm-user en localStorage) est ISOLÉE entre PWA et navigateur Safari, ouvrir la vue dans le navigateur reposait le problème de connexion à l'app → résolu par auto-login via jeton éphémère.

**SOLUTION RETENUE (vue complète vidéo + retours dans le navigateur, auto-login sûr)**
- En PWA standalone, à l'ouverture d'une version Drive (`type==='drive' && isPWAStandalone()`), on ouvre toute la vue lecteur dans le navigateur externe.
- Auto-login SÛR : la PWA demande un jeton éphémère à `auth-token-create` (envoi {id, code} en POST, jamais dans l'URL), met le jeton dans l'URL `/?t=...&action=player&v=...&l=...&s=...&ver=...`, ouvre le navigateur dessus. Le navigateur consomme le jeton via `auth-token-consume` (usage unique, suppression atomique), pose `rm-user` (PAS `rm-code`), nettoie l'URL, et route vers openPlayer.
- Jeton = aléatoire 256 bits (crypto.randomBytes), TTL **120s**, stocké dans Netlify Blobs (store "auth-tokens", réutilise les variables NETLIFY_SITE_ID + NETLIFY_BLOBS_TOKEN existantes). Usage unique strict.
- Hors PWA (navigateur classique) : comportement INCHANGÉ (iframe interne).
- Vimeo/YouTube/Frame.io NON affectés (déviation uniquement pour Drive).

**DÉCISIONS VALIDÉES** : TTL 120s · jamais le code dans l'URL · session Safari sans rm-code (donc sans push côté Safari = accepté, Safari = "second écran") · hook Sentry beforeSend pour masquer `t`.

**LIMITES ASSUMÉES (dites à David, acceptées)**
- Basculement PWA→navigateur VISIBLE (on ne peut pas l'ouvrir invisiblement dans la PWA).
- Retour dans la PWA MANUEL (clic icône) — impossible à automatiser. Mais comme la vue complète (vidéo + retours) est dans le navigateur, l'utilisateur n'a pas besoin de revenir tout de suite.
- Latence 3-7s (clic → vidéo lisible) dont cold start Netlify 0,8-2s.
- Fenêtre de quelques secondes où le jeton est dans l'URL/logs avant consommation → acceptable car usage unique + TTL court.

**VÉRIF PILOTE (OK)** : node --check sur les 4 fichiers OK · condition déviation = `if(type === 'drive' && isPWAStandalone())` (exclusive) · 0 occurrence du code dans les params URL · rm-code jamais posé côté Safari (commentaire explicite) · Phase 1 préservée (journMonteursNoms=4, refreshJournMonteursSelects=7) · createNotif=27 · EQUIPE_FALLBACK=[]=1 · CHEF_PAR_DEFAUT présent.

**À FAIRE PAR DAVID** : feu vert Claude Code pour commiter (Phase 1 + Phase 2 ensemble) sur `journ-monteurs-dynamiques` → push les 4 fichiers → PR → tester en preview : (1) journalistes+monteurs dans les 3 menus + sync ajout/suppression ; (2) en PWA, clic ▶ sur version Drive → ouvre Safari, auto-login, vue lecteur ; URL sans `?t=` après chargement ; (3) hors PWA → iframe interne inchangée ; (4) jeton expiré (attendre >2 min) → écran login + toast. Variables Netlify Blobs déjà en place (rien à créer).

**RESTE EN SUSPENS (non tranché)** : choix approche A vs B pour le comportement exact (ici on a fait : déviation directe en PWA, pas de bouble iframe+bouton). Si jamais l'auto-login pose souci à l'usage, fallback = bouton "ouvrir navigateur" simple.


### 2026-06-05 — Listes Journaliste/Monteur dynamiques depuis Notion (branche `journ-monteurs-dynamiques`)
index.html 5622 → **5637 lignes** (+15). Aucune modif CSS, Notion ni serveur. Fix 100 % code front.

**PROBLÈME**
Au moment de choisir un journaliste sur les cartes (formulaire "Nouveau sujet", fiche détail d'un sujet, sélecteur "Responsable" d'une version de montage), tous les membres de l'équipe n'apparaissaient pas. Le login affichait pourtant bien tout le monde. Cause : ces 3 sélecteurs étaient remplis par des **listes de prénoms écrites EN DUR** dans le code (8 à 13 noms figés), jamais reliées à la variable `equipe` (chargée depuis Notion au démarrage). Conséquence : les nouveaux membres (Alice Guionnet, Romain Canault, Camille, Hervé Grandchamp, Anne Burlot, etc.) n'étaient pas proposés, et il fallait modifier le code à chaque ajout/suppression.

**BESOIN PRINCIPAL EXPRIMÉ PAR DAVID**
"Dès que j'ajoute ou supprime un journaliste (via la modale Gérer l'équipe), il doit se retrouver / disparaître PARTOUT, automatiquement, sans toucher au code."

**LE FIX**
- Nouveau helper `journMonteursNoms()` : retourne `equipe.filter(role==='Journaliste'||role==='Monteur')`, noms triés alpha (localeCompare 'fr'). `equipe` devient la **source unique de vérité**.
- Nouveau `refreshJournMonteursSelects(currentNom)` : reconstruit le `<select #n-journ>` depuis `equipe`, préserve la valeur courante (l'ajoute si absente pour ne jamais perdre une assignation).
- Les 3 sélecteurs lisent désormais `journMonteursNoms()` au moment de leur affichage :
  - `#n-journ` (formulaire Nouveau sujet) : reconstruit dans `openNouveau` (HTML statique vidé, ligne 286).
  - "Journaliste" fiche détail (ex-`tousNoms`, ligne ~789) : IIFE depuis `journMonteursNoms()` + garde-fou sur `s.journaliste`.
  - "Responsable" version (ex-`tousLesNoms`, ligne ~2121) : `journMonteursNoms()` + garde-fou sur le `monteur` courant par version.
- Sync immédiate : `equippeAjouter` et `equipeSupprimerJournaliste` appellent maintenant `refreshJournMonteursSelects()` (en plus du `equipe.push`/`filter` déjà présent). Ajout/suppression via "Gérer l'équipe" → reflété tout de suite dans les menus.
- Garde-fou anti-perte de données : si une carte a un journaliste assigné qui n'est plus dans la liste filtrée, la valeur reste affichée et sélectionnée (jamais écrasée).
- Ancien système neutralisé : tableau `journalistes` (11 noms en dur) → `let journalistes = []` (conservé vide, défensif). Les 3 anciennes fonctions (`addJournalisteToSelects`/`removeJournaliste`/`refreshJournalistesSelects`) deviennent des alias inertes qui délèguent au nouveau système.

**VÉRIF PILOTE (OK)** : node --check OK ; CHEF_PAR_DEFAUT='Benjamin'=1 ; EQUIPE_FALLBACK=[]=1 ; createNotif=27 (identique main) ; 0 occurrence des anciennes listes en dur (`let journalistes=['Julien'…]`, `tousLesNoms=['Julien'…]`, `tousNoms=['Benjamin'…]`, HTML statique `<option>Julien…`) ; acquis préservés (annulerVersion=2, showHelpModal=2, showConfirmModal=2, validationBrand=16, DB_CLIENTS_BRAND=6, refreshUI=1, location.reload=0).

**LIMITE CONNUE (signalée, non bloquante)** : si on ouvre "Nouveau sujet" AVANT la fin du chargement de `equipe` (connexion ultra-lente), le menu est momentanément vide (Choisir… + Nouvelle personne). Pas de fallback offline pour cette liste (cohérent avec le main historique). Se règle en rouvrant le formulaire.

**À FAIRE PAR DAVID** : feu vert à Claude Code pour commiter sur `journ-monteurs-dynamiques` → push → PR → tester en preview (vérifier que tous les journalistes+monteurs apparaissent dans les 3 menus, et qu'un ajout/suppression via "Gérer l'équipe" se reflète tout de suite) → merger si OK.


### 2026-06-05 — Correctif push : configuration explicite de Netlify Blobs (branche `pwa-push`)
4 fichiers : `_blobs.js` (nouveau helper) + `notify.js`, `push-subscribe.js`, `push-unsubscribe.js` (modifiés).

**PROBLÈME DÉTECTÉ AU TEST**
La notif Notion se créait bien (cloche OK) mais le push n'arrivait jamais sur l'iPhone. Logs de `notify` : "Push skipped: The environment has not been configured to use Netlify Blobs. To use it manually, supply the following properties when creating a store: siteID, token". Les clés VAPID fonctionnaient (push-config renvoyait bien la clé publique). Seul l'accès Netlify Blobs était cassé : `getStore('push-subs')` n'arrivait pas à s'auto-configurer dans le contexte de déploiement.

**LE FIX**
- Nouveau helper `netlify/functions/_blobs.js` : `getPushStore()` qui fait `getStore({ name: 'push-subs', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN })`. Lève une erreur claire si une variable manque.
- Les 3 fonctions (notify, push-subscribe, push-unsubscribe) importent `getPushStore` depuis `./_blobs` au lieu de `getStore` direct. Comportement inchangé (dédup endpoint, nettoyage 410/404).
- siteID et token jamais en dur, uniquement process.env.

**NOUVELLES VARIABLES NETLIFY CRÉÉES PAR DAVID** (en plus des 3 VAPID) :
- `NETLIFY_SITE_ID` (All scopes, Same value) = Site ID trouvé dans Site configuration → Project details.
- `NETLIFY_BLOBS_TOKEN` (All scopes, Same value) = Personal Access Token Netlify (avatar → User settings → Applications → Personal access tokens → New access token, No expiration), commence par nfp_.

**VÉRIF PILOTE (OK)** : node --check sur les 4 fichiers, aucun hardcode, les 3 fonctions utilisent getPushStore(), plus aucun getStore direct.

**À FAIRE PAR DAVID** : pousser les 4 fichiers sur pwa-push (netlify/functions/). Re-tester : déclencher une notif (autre user → retour sur ta carte), app fermée → le push doit arriver en 2-3s. Vérifier logs notify : plus de "Push skipped", et "pushed:1". Si OK → merger pwa-push dans main (FIN de la PR2 PWA).


### 2026-06-04 — PWA PR 2 « pwa-push » : cache de la coquille + push instantané « app fermée » (branche `pwa-push`)
index.html 5528 → **5622 lignes** (+94). sw.js 20 → **149 lignes**. package.json +2 deps. 5 fonctions Netlify créées + offline.html. 9 fichiers au total.

**CONTEXTE / BESOIN**
Cœur du projet : l'équipe bosse sur ordi mais rate les notifs → le téléphone doit FORCER la notif, même app complètement fermée, en quelques secondes. Push Web gratuit (0€), déclenché au moment de l'écriture serveur (pas de surveillance Notion). Rattachement device→personne par IDENTITÉ DE CONNEXION (currentUser), pas mail ni tel. Chacun a sa propre identité sur ordi ET tel. TOUS les types de notif déclenchent un push.

**PRÉ-REQUIS FAITS PAR DAVID (avant cette PR)**
- Node.js v24.16.0 installé (installeur .pkg nodejs.org).
- Clés VAPID générées via `npx web-push generate-vapid-keys`.
- 3 variables Netlify créées (Site config → Environment variables, toutes "All scopes · Same value", NON cochées secret car cocher secret force le mode scopes/contextes spécifiques compliqué) : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT = mailto:david@rushup.io. Variables existantes préservées (NOTION_TOKEN, GOOGLE_SERVICE_ACCOUNT).
- Branche pwa-push créée depuis main (PR1 pwa-install déjà mergée).

**ARCHITECTURE LIVRÉE (9 fichiers)**
- `package.json` : + web-push ^3.6.7 + @netlify/blobs ^8.1.0 (googleapis préservé).
- `netlify/functions/_auth.js` : module partagé verifyUser(id,code) via base Équipe, cache 60s (préfixe _ = non exposé comme function).
- `netlify/functions/push-config.js` : renvoie VAPID_PUBLIC_KEY au client.
- `netlify/functions/push-subscribe.js` : POST {id,code,subscription}, SÉCURISÉ via verifyUser (401 si invalide), stocke dans Netlify Blobs store "push-subs" clé=nom, multi-device dédupliqué par endpoint.
- `netlify/functions/push-unsubscribe.js` : POST {nom,endpoint}, retire le device (pas d'auth code, nettoyage volontaire).
- `netlify/functions/notify.js` : POST {type,sujetId,sujetCode,sujetTitre,destinataire,auteur,message} → (1) crée la page Notion base Notifications 4398775b (champs vérifiés par le Master : Message title, Type select, Destinataire/Auteur/Sujet ID/Sujet code/Sujet titre en text=rich_text, Lu checkbox — casse "Sujet code"/"Sujet titre" en minuscule confirmée), (2) garde-fou destinataire===auteur skip, (3) push VAPID à chaque device, retire subs 410/404. Push best-effort (notif Notion créée même si push échoue).
- `sw.js` étendu : SW_VERSION 2026-06-04-2. Cache : functions=network-only (fraîcheur Notion critique), HTML=network-first+fallback offline.html, CSS=stale-while-revalidate, icons/manifest=cache-first, CDN=cache-first opaque. Handlers push + notificationclick (ouvre /?sujet=X ou postMessage open-sujet).
- `offline.html` (racine) : page hors-ligne fond #001349.
- `index.html` : createNotif migrée vers /.netlify/functions/notify (1 seul endroit, 27 call sites). Helpers subscribePush/unsubscribePush/urlBase64ToUint8Array. showApp demande permission+subscribe. doLogin stocke rm-code. doLogout unsubscribe. Gestion ?sujet=X au démarrage + listener serviceWorker open-sujet.

**VÉRIF PILOTE (OK)** : clé privée jamais en dur (process.env uniquement). node --check OK sur les 6 JS. 5622 lignes, createNotif 27 call sites intacts. Acquis préservés (setFiltersVisible=5, getBoundingClientRect=0, has-filters=0, clearDate=4, validationBrand=16, DB_CLIENTS_BRAND=6, refreshUI=1, annulerVersion=2, showHelpModal=2, EQUIPE_FALLBACK=[], CHEF_PAR_DEFAUT='Benjamin'). Schéma base Notifications confirmé compatible par le Master.

**⚠️ NOMMAGE FICHIERS FONCTIONS** : sur GitHub, créer avec le tiret — `push-config.js`, `push-subscribe.js`, `push-unsubscribe.js` (Claude Code les livre parfois sans tiret). index.html les appelle avec tiret.

**À FAIRE PAR DAVID APRÈS PUSH**
1. Vérifier build Netlify : logs "added 2 packages" (web-push + @netlify/blobs).
2. IMPORTANT : tous les users doivent se DÉCONNECTER puis RECONNECTER une fois après déploiement (rm-code n'existait pas avant → sans lui subscribePush retourne false silencieusement).
3. Désinstaller/réinstaller PWA depuis Safari, login, accepter permission notifs, vérifier logs push-subscribe {ok:true}, tester push app fermée (cible 2-3s).
4. SW_VERSION à incrémenter manuellement à chaque futur déploiement.

**QUESTIONS OUVERTES (faible risque)** : rm-code en localStorage (durcissable via token court) ; push-unsubscribe sans auth (endpoint déjà secret).


### 2026-06-04 — Correctif PWA : safe-area sur la modale lecteur/retours (branche `pwa-install`)
css/views.css 156 → **160 lignes** (+4). Aucun autre fichier touché.

**CONTEXTE**
Après test de la PWA installée sur iPhone 14 (iOS 26.5) : tout fonctionne en plein écran (icône bleu marine, splash, .topnav décalée correctement). MAIS sur la vue retours/lecteur (overlay `#video-player-modal` ouvert par `openPlayer`), le header du haut (code carte + label version + bouton Dossier + ×) était masqué par la barre de statut iPhone (heure, réseau, batterie). Cette vue est en position:fixed;inset:0 et n'a pas de .topnav, donc la règle safe-area de la PR1 ne la couvrait pas.

**LE FIX**
- Ajout en fin de css/views.css (hors @media) : `#video-player-modal{padding-top:env(safe-area-inset-top)}`.
- `#video-player-modal` = ID unique créé/supprimé dynamiquement par `openPlayer` (index.html ~2958). Décale tout le contenu de la modale (header + body) d'un seul bloc sous la barre de statut.
- Pas de double décalage (header et player-modal-body n'ont pas de safe-area propre). En navigateur classique, env(safe-area-inset-top)=0 → rendu inchangé.

**VÉRIF PILOTE (OK)** : 160 lignes, règle unique (pas de doublon), acquis views.css préservés (player-modal-*, cal-nav, flex-wrap:nowrap, next-shoot-item, activite-item). Aucune autre vue affectée.

**À POUSSER (David)** : css/views.css sur la branche `pwa-install`. Re-tester la vue retours/lecteur sur iPhone (désinstaller+réinstaller la PWA pour vider le cache) → le header ne doit plus être masqué par l'heure/batterie. Puis merger `pwa-install` dans `main`.


### 2026-06-04 — PWA PR 1 « pwa-install » : app installable + plein écran (branche `pwa-install` depuis `main`)
index.html 5528 → **5546 lignes** (+18). layout.css : +1 règle (safe-area). 2 fichiers créés : `manifest.json`, `sw.js`. 5 icônes ajoutées à la racine.

**CONTEXTE**
Démarrage de la transformation en PWA complète. Objectif final (validé) : notifications push instantanées « app fermée », gratuites (0€), délai 2-3s. Découpé en 2 PR :
- PR 1 (celle-ci) : rendre l'app installable sur l'écran d'accueil iPhone/Android, plein écran, + service worker minimal (prérequis du push).
- PR 2 (à venir) : cache de la coquille + offline + push Web (VAPID, Netlify Blobs, fonction notify.js).

**CE QUI A ÉTÉ FAIT (PR 1)**
- `manifest.json` créé à la racine : name « Réel Média Production », short_name « Réel Média », start_url `/?source=pwa`, scope `/`, display standalone, orientation portrait, lang fr, theme_color + background_color `#001349` (bleu marine officiel du logo), 3 icônes (192 any, 512 any, maskable 512).
- `<head>` index.html : viewport enrichi de `viewport-fit=cover` (pas de doublon) + 7 balises PWA (manifest, theme-color, apple-mobile-web-app-capable/status-bar-style black-translucent/title, apple-touch-icon, favicon-32).
- `sw.js` créé à la racine : version minimale, `SW_VERSION='2026-06-04-1'`, install→skipWaiting, activate→clients.claim, fetch en passthrough (NE CACHE RIEN — le cache vient en PR 2). Présent pour rendre l'app installable et pour recevoir le push en PR 2.
- Script inline avant `</body>` : enregistrement défensif du SW (if 'serviceWorker' in navigator).
- `css/layout.css` : règle finale `.topnav{padding-top:env(safe-area-inset-top);height:calc(52px + env(safe-area-inset-top))}`. En navigateur classique safe-area=0 → rendu inchangé. Effet uniquement en PWA installée iOS (barre sous la Dynamic Island).

**ICÔNES (à la racine du repo)** : `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180×180), `icon-maskable-512.png`, `favicon-32.png`. Générées depuis le logo officiel SVG « RM Avatar » (fond bleu marine #001349, texte blanc, accent rouge #ff451a).

**VÉRIFICATIONS PILOTE (toutes OK)**
- 5546 lignes (= 5528 +18). head valide (1 head, 1 viewport, 1 body). node --check OK (sw.js + scripts inline).
- Préservation acquis : setFiltersVisible=5, getBoundingClientRect=0, has-filters=0, clearDate=4, toDlUrl=2, player-modal-body=1, validationBrand=16, DB_CLIENTS_BRAND=6, refreshUI=1, createNotif=27. EQUIPE_FALLBACK=[] et CHEF_PAR_DEFAUT='Benjamin' intacts.
- manifest.json JSON valide. layout.css : safe-area sans impact desktop.

**À POUSSER (David)** : 5 icônes (racine) + manifest.json + sw.js + index.html + css/layout.css, sur branche `pwa-install` depuis `main`.
**TEST iPhone (14, iOS 26.5)** : Safari → Partager → Sur l'écran d'accueil → lancer depuis l'icône → plein écran + splash bleu marine. Vérifier topnav non mangée par la Dynamic Island. Web Inspector : SW en état « activated », pas d'erreur « SW register failed ».

**PLAN PWA VALIDÉ (architecture push, pour PR 2)**
- Déclencheur : `createNotif` (centralisée, 27 call sites) cessera d'appeler le proxy générique et appellera une nouvelle fonction `notify.js` qui (1) crée la page Notion comme aujourd'hui puis (2) envoie le push Web VAPID aux subscriptions du destinataire.
- Stockage subscriptions : Netlify Blobs (gratuit, ~50ms), 1 entrée par utilisateur = liste de devices.
- Clés VAPID : à générer 1 fois (`npx web-push generate-vapid-keys`), à mettre en variables d'env Netlify (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT).
- Sécurité subscribe : exiger le code d'accès (re-vérif comme login.js) pour éviter qu'on s'enregistre sous le nom d'un autre.
- Fallback : iOS < 16.4 ou permission refusée → polling existant 60s. (Note : iPhone de test = 14 / iOS 26.5, push pleinement supporté.)
- Web Push complet = 0€ (free tier Netlify, Notion sans webhook nécessaire). Délai médian 2-3s.


### 2026-06-03 — Refonte FIX C bandeau filtres + Fix Calendrier mobile (toujours sur branche `mobile-polish-v3`)
index.html 5549 → **5528 lignes** (-21, simplification massive de setFiltersVisible). 
2 CSS modifiés : layout.css 250 → 244 (-6), views.css 152 → 156 (+4).

**CONTEXTE**
Suite à 2 hotfixes ratés (getBoundingClientRect dynamique) qui faisaient 
apparaître le bandeau filtres par intermittence. Décision pilote prise 
en 3ème tour : passer à l'option A propre qu'on avait initialement 
écartée par prudence.

**FIX 1 — Refonte du bandeau filtres (option A propre)**
Approche : déplacer le DOM `#sb-filters` HORS de la sidebar pour le 
placer dans `.main-area`, JUSTE après `</view-tabs>`.

Concrètement :
- Le bloc `<div id="sb-filters">` (avec ses 16 boutons .sb-filter) 
  + le `<div class="sb-sep">` qui le précédait ont été déplacés de 
  la sidebar vers .main-area, juste après les view-tabs.
- Les 2 `<div class="sb-section-label">` ("Statut", "Format") du 
  bandeau ont été supprimés (alourdissaient les pills horizontales).
- `setFiltersVisible` simplifiée à 1 ligne : 
  `document.getElementById('sb-filters')?.classList.toggle('is-visible', visible)`
- Supprimés du code : getBoundingClientRect, style.display force, 
  style.top dynamique, .has-filters sur main-area.
- CSS refondu : `#sb-filters{display:none}` par défaut. Avec 
  `.is-visible`, devient un bandeau flex en pills horizontales 
  scrollables. Padding/gap adaptés pour mobile vs desktop.
- Plus de `position:fixed`. Le bandeau est dans le flux DOM naturel 
  entre les view-tabs et le main-content.

**Avantages de la solution**
- Robuste : pas de mesure dynamique fragile
- Cohérent : même layout desktop ET mobile
- Simple : 1 ligne de JS
- Bandeau apparaît/disparaît proprement avec la classe .is-visible
- Plus de chevauchement avec les view-tabs (puisque dans le flux)

**FIX 2 — Calendrier mobile**
Avec le retrait du position:fixed du bandeau filtres, le titre du mois 
et les flèches navigation étaient déjà censés réapparaître. En bonus, 
3 règles CSS de garantie dans views.css mobile :
- `.cal-nav{flex-wrap:nowrap}` → pas de wrapping
- `.cal-nav .nav-btn{flex-shrink:0}` → flèches jamais compressées
- `.cal-title{flex:1; text-align:center; text-overflow:ellipsis}` → 
  titre centré, ellipsis si trop long

**Vérifs pilote OK**
- 5528 lignes index.html, node --check OK
- setFiltersVisible=5 (def + 4 appels) ✓
- getBoundingClientRect=0 (supprimé) ✓
- has-filters=0 (supprimé) ✓
- position:fixed sur #sb-filters=0 ✓
- #sb-filters à ligne 195 dans .main-area, plus dans .sidebar ✓
- Tous les acquis PR v3 intacts (clearDate=4, toDlUrl=2, 
  player-modal-body=1, player-modal-panel=1, Télécharger=2, 
  nav-taches=1 in layout.css)
- Tous les acquis pre-v3 intacts (Brouillon=11, validationBrand=16, 
  setLieuTour=3, calStudioOnly=5, etc.)
- Tous les 7 compteurs préservation intacts

**INCIDENT MAIN STALE 2ème édition** : David a relancé Claude Code 
sans avoir mergé la PR mobile-polish-v3 (déjà arrivé une fois sur v2). 
Vérification : le main GitHub contient déjà les acquis v3 (clearDate=4, 
toDlUrl=2 testés via curl raw GitHub). Donc Claude Code a bien 
travaillé sur la bonne version (5549 lignes hotfix + refonte = 5528).
**Confirmation de la règle d'or** : avant chaque PR, vérifier que la 
précédente est mergée. Mais quand le main contient déjà v3, c'est 
qu'il a été mergé entre-temps.

**À tester en preview iPhone (Cmd+Shift+R)**
1. Production → bandeau filtres visible JUSTE sous les view-tabs 
   (sans chevauchement)
2. Cliquer Idées → bandeau DISPARAÎT
3. Cliquer Tâches → bandeau toujours caché
4. Cliquer Dashboard → bandeau toujours caché
5. Revenir Production → bandeau réapparaît (CHAQUE FOIS, plus 
   d'intermittence)
6. Toutes vues Production (Cartes, Statut, Journaliste, Liste, 
   Calendrier) → bandeau visible et au même endroit
7. Vue Calendrier mobile → titre du mois ET flèches ← → visibles, 
   cliquables
8. Scroller dans Production → comportement naturel

**À tester en preview desktop**
9. Bandeau filtres en bandeau horizontal sous les view-tabs (au lieu 
   de la sidebar gauche)
10. Sidebar plus courte (sans les filtres)
11. Tous les onglets vue Production fonctionnent (Cartes, Statut, 
    Journaliste, Liste, Calendrier)

---

### 2026-06-03 — Hotfix bandeau filtres mobile (sur la branche `mobile-polish-v3`)
RATÉ : getBoundingClientRect dynamique parfois 0 au render → bandeau 
intermittent. Solution remplacée par la refonte option A (cf. entrée 
suivante plus haut).

---

### 2026-06-03 — Mobile polish v3 : 5 fix UX iPhone + retours équipe mobile + bouton Télécharger (branche `mobile-polish-v3`)
index.html 5515 → 5535 lignes (+20). 3 CSS modifiés. Diff total ~88 lignes.
PR cumule 7 fix dont 5 retours iPhone, 1 fix vue retours équipe, 1 feature 
bouton Télécharger.

**Décisions produit prises (5 questions tranchées)**
- Q1 (clearDate confirm) : PAS de confirm
- Q2 (clearDate scope) : UNIVERSEL desktop + mobile
- Q3 (toggle filtres FIX C) : refactor via classList.toggle('is-visible')
  → REMPLACÉ par option A (déplacement DOM), cf. refonte
- Q4 (ordre bottom-nav) : ordre HTML conservé (Dashboard / Production / 
  Idées / Tâches)
- Q5 (clickNotif) : version défensive

**Les 7 fix livrés**
FIX A — Bouton × pour vider les dates (J1 / J2 / Diffusion)
FIX B — Bouton × visible scroll fiche détail mobile
FIX C — Bandeau filtres (REFONTE après hotfix raté, cf. entrée 
        précédente)
FIX D — Bottom-nav 4 items (ajout Tâches)
FIX E — clickNotif défensive
FIX F — Layout retours équipe mobile (lecteur en haut, retours en bas)
FIX G — Bouton Télécharger dans openPlayer

---

### 2026-06-03 — Mobile polish v2 + Feature Lieu tournage MERGÉ
+16 lignes. 5 corrections UX mobile + Feature Lieu tournage (Select 
Notion 2 options).

---

### 2026-06-01 — Mobile responsive MERGÉ
8 améliorations mobile. Premier succès workflow PROPOSITION-CODE.

---

### 2026-06-01 — Vue Calendrier enrichie MERGÉ
+94 lignes. 6 enrichissements + J2.

---

### 2026-06-01 — Centre d'aide intégré MERGÉ
+118 lignes. Modale plein écran avec accordéon natif.

---

### 2026-06-01 — Feature "Annuler cette version" MERGÉ
+54 lignes. Statut Select Active/Annulée + showConfirmModal réutilisable.

---

### 2026-06-01 — Features Brand v2 + UX MERGÉ
+49 lignes.

---

### 2026-05-29 — 3 bugs UX + Brouillons retours + Triple validation Brand MERGÉ
### 2026-05-28 — Login optgroup + Renommage Montage + Réactivité MERGÉ

═══════════════════════════════════════════════════════════════
## RÔLES (workflow à 3 chats)
═══════════════════════════════════════════════════════════════
- **CHAT PILOTE** : prépare prompts (en INTENTIONS, pas en code), 
  vérifie livrables, livre fichiers + CONTEXT à jour.
- **CHAT MASTER** : opérations Notion via MCP + 2e avis produit.
- **CLAUDE CODE** : exécute le code.
- **DAVID** : non-codeur. Colle prompts, upload GitHub, teste preview, 
  merge, clique "Synchroniser maintenant". Langue : français.

## WORKFLOWS

### Standard
1. Pilote prépare prompt précis en INTENTIONS (pas en code)
2. Claude Code : curl raw GitHub main → analyse → code
3. Claude Code livre fichier(s)
4. David envoie au pilote → vérif (wc -l, grep, node --check, code)
5. Pilote livre fichiers + CONTEXT à jour
6. David push GitHub, ouvre PR, teste preview Netlify, merge si OK
7. David clique "Synchroniser maintenant" sur project knowledge

### Spécial — workflow PROPOSITION-CODE ⭐
Demander à Claude Code une PROPOSITION (mode lecture/analyse uniquement, 
PAS de code) AVANT de coder. **4 succès en 4 essais.** À reproduire 
systématiquement pour les sujets techniques.

### Spécial — vérification Notion ⭐
Si une décision pilote sur type de champ Notion est contredite par 
Claude Code, demander vérification au Master via Notion MCP avant 
de coder.

## RÈGLES D'OR (mises à jour 03/06)
- index.html dans project knowledge = SOURCE OFFICIELLE
- EQUIPE_FALLBACK = [] ; CHEF_PAR_DEFAUT = 'Benjamin'
- **PILOTE NE CODE PAS** : prompts en intentions, pas en code 
  (sinon biais Claude Code + risque bug + code parfois non copiable 
  si mal formaté dans markdown imbriqué) — règle confirmée 2 fois
- À CHAQUE modif code, livrer AUSSI CONTEXT_REEL_MEDIA.md à jour
- Sur fichiers sensibles, JAMAIS merger sans (a) vérif pilote, 
  (b) test preview, (c) console JS propre
- ⚠️ node --check ne voit pas les fonctions non définies
- ⚠️ TOUJOURS demander le fichier à Claude Code après une modif
- TOUJOURS curl raw GitHub
- Ne JAMAIS pointer Claude Code vers une branche non encore poussée
- ⚠️ AVANT chaque PR : vérifier que la PR précédente est MERGÉE sur 
  main (sinon Claude Code lira un état "stale")
- **Sur un sticky/fixed qui peut se comporter mal** : préférer 
  déplacer le DOM dans le flux normal plutôt que d'essayer de 
  positionner en JS dynamique avec getBoundingClientRect (fragile)
- **Préférer l'option PROPRE dès le départ** : si une option (a) plus 
  invasive est plus simple à long terme qu'une option (b) "sécurité" 
  qui crée de la dette, choisir (a) — leçon apprise après 2 hotfixes 
  ratés sur le bandeau filtres
- Visualiser AVANT de décider quand option visuelle (utiliser 
  visualize:show_widget) — leçon apprise sur option a vs b

═══════════════════════════════════════════════════════════════
## PROJET
═══════════════════════════════════════════════════════════════
- App : Réel Média Production (suivi prod TV/vidéo)
- Architecture : index.html + 4 CSS séparés
- Repo : David-f10/reel-media-production
- Prod : reel-media-production.netlify.app
- Backend : netlify/functions/notion.js + netlify/functions/login.js
- Monitoring : Sentry (org rushup, EU)
- État du main après merge mobile-polish-v3 : 5535 lignes
- EN ATTENTE DE MERGE : refonte FIX C + Fix Calendrier (5528 lignes 
  + 2 CSS modifiés). Pousser sur la même branche mobile-polish-v3.

## BASES NOTION (IDs)
| Base | ID |
|------|-----|
| 🎬 Suivi de Production | 01a8dc7d-1cc2-4209-9afe-a3bd90a87e20 |
| 🔢 Compteurs de codes | f9b8d090-6c9e-4513-a67c-db2d82941a29 |
| 🏷️ Clients Brand (NOUVELLE) | 67abbb5f-f6a6-4937-89e3-6c852c515a8e |
| 🏢 Clients Brand (ANCIENNE) | 228c6efb-eb59-42ef-8926-7ce34816cb96 |
| 👥 Équipe | df0e44e1-7c9c-4427-a9c2-af7b6da78fcb |
| 📋 Tâches | 0241d8dc-00a1-461c-9efa-00eb7e5fac70 |
| 🔔 Notifications | 4398775b-c11f-4d73-99c4-9fc31c33ce8b |
| 💡 Idées | b164bf282a4e4ac78a15d5e894019daa |
| 📎 Références | 4ae84e174ee9473888eaa15112fcc6ee |
| 📹 Versions | 3793eebb-2aeb-4d49-84ae-06d79cfb2704 |
| 🎵 Musiques | d9d3579257bc49059e6cd683a8b02fef |
| 💬 Commentaires | 45fda8a6-dfbc-42c1-a26f-de09c289037b |
| 📋 Retours | 02880609-ee82-4acc-b239-d8aac9cae439 |

## CHAMPS NOTION (à jour, confirmés par Master)
- 📋 Retours : "Source" (Équipe/Client) + "Brouillon" (checkbox)
- 🎬 Suivi de Production :
  - "Validation Brand" (Checkbox)
  - "Contact Brand" (Select : Arnaud C / Guillaume / Louise / Victor)
  - "Lieu tournage" (Select : "Studio" / "Extérieur")
  - "Date tournage J1" / "J2" / "Date de diffusion" (date) — vidables 
    depuis mobile-polish-v3
  - "Statut" contient "Montage" (pas "Montage V1")
- 📹 Versions : "Validation Brand" (Checkbox) + "Statut" (Select 
  Active/Annulée)

═══════════════════════════════════════════════════════════════
## CE QUI EST EN PROD
═══════════════════════════════════════════════════════════════
- ✅ Toutes les amélios depuis 28 mai 2026 (cf. historique)
- ✅ Mobile polish v3 + hotfix bandeau intermittent (mergé)

**EN ATTENTE DE MERGE** : refonte FIX C + Fix Calendrier sur la 
branche `mobile-polish-v3` (5528 lignes index.html + 2 CSS modifiés)

═══════════════════════════════════════════════════════════════
## NOTES TECHNIQUES UTILES
═══════════════════════════════════════════════════════════════
- ⚠️ Borne mobile : `@media(max-width:700px)`
- ⚠️ `grep -c` retourne code 1 si compte=0
- ⚠️ Inputs avec font-size < 16px déclenchent zoom auto iOS
- Vue active = appSetVue(currentVue), rendu LOCAL depuis `sujets`
- refreshUI(id) = appSetVue(currentVue) + refreshDetail(id) débouncé
- openDetail(id) lourde (~7 appels API)
- Verrous création : `_creerDecliEnCours` + `_creerVersionEnCours`
- Login : <select> natif #login-nom avec <optgroup>
- Rôles canoniques : ['Chef', 'Journaliste', 'Monteur', 'Brand']
- Statuts : Brief / Idée, Séquencier en cours, Séquencier validé, 
  En tournage, Post-prod, Montage, Retours, Validation chef, PAD
- Couleurs format : MAG bleu, Brand ambre, Face Cam rouge, Desk gris, 
  YouTube vert
- ⚠️ ÉQUIPE = source unique de vérité Notion (base 👥 Équipe). Depuis 
  le 2026-06-05, les 3 menus de choix du journaliste (Nouveau sujet, 
  fiche détail, Responsable version) sont construits dynamiquement via 
  `journMonteursNoms()` = `equipe.filter(role Journaliste|Monteur)`. 
  NE PLUS jamais coder de liste de prénoms en dur : tout ajout/suppression 
  se fait dans Notion (ou via la modale "Gérer l'équipe") et se propage 
  automatiquement partout.
- Membres connus (indicatif, la vérité reste Notion) :
  - Chefs : Benjamin (défaut), Arnaud, Chloé
  - Monteurs : Thierry, David
  - Journalistes : Julien, Augustin, Nico, Mickael, Juliette, Mathilde, 
    Léa, Éloise, Alice Guionnet, Romain Canault, Camille, 
    Hervé Grandchamp, Anne Burlot
  - Brand (Contact Brand) : Arnaud C, Guillaume, Louise, Victor

- **Mobile (≤700px)** : bottom-nav 4 items (Dashboard/Production/
  Idées/Tâches) avec pastilles, panneau notif full-width, modale 
  détail padding réduit, bouton × tap-target 44px avec fond léger, 
  inputs font-size:16px, **bandeau filtres statuts directement dans 
  le flux .main-area sous les view-tabs (PLUS dans la sidebar)** — 
  toggle 1 ligne via .is-visible, vue retours équipe en colonne 
  (lecteur 45vh haut, panneau 55vh bas)
- **Vider une date** : bouton × dans .date-wrap. Fonction 
  clearDate(id, field, btnEl).
- **Bouton Dossier** (depuis 2026-07-15) : 3 boutons (fiche détail,
  liste versions, header lecteur) tous branchés sur openDriveFolderSync.
  Cache 3 états : drivefolderCache (vraies folderUrl only) +
  drivefolderPending (Promises) + resolveDriveFolder centralisée. Échec
  jamais mémorisé (retry possible). Clic : dossier si résolu, sinon onglet
  sûr redirigé, fichier /view en dernier recours. openPlayer prefetch à
  l'ouverture (après déviation PWA). Une vidéo non vue du SA → retombe sur
  le fichier (souci de partage, pas de code). drive.js inchangé (readonly,
  résout le parent via files.get fields=parents).
- **Bouton Télécharger** : fonction `telechargerVersion(fileId, btnEl)`
  (depuis 2026-07-15, remplace l'ancien toDlUrl direct devenu 403 en
  multi-compte). PWA standalone → navigateur externe (/view). Session
  sans code/user → repli /view. Sinon → POST /.netlify/functions/
  drive-download {id, code, fileId} qui ouvre une permission anyone
  éphémère côté SA, renvoie downloadUrl public, referme aussitôt ;
  déclenchement via <a download>, repli /view si erreur. Filet :
  drive-permsweep (Scheduled 10 min) referme toute permission restée
  ouverte. Prérequis ops : dossier prod partagé au SA en Éditeur.
  (Ancien toDlUrl toujours présent mais plus utilisé pour ce bouton.)
- **clickNotif** : pas de re-navTo si déjà sur prod (50ms vs 350ms).
- **#sb-filters** : déplacé hors sidebar, dans .main-area juste après 
  view-tabs. Toggle 1 ligne : `classList.toggle('is-visible', visible)`.
  Plus de position:fixed, plus de getBoundingClientRect, plus de hack.
  Bandeau dans le flux DOM naturel = robuste.
- **Calendrier mobile** : .cal-nav avec flex-wrap:nowrap, flèches 
  flex-shrink:0, titre flex:1 + ellipsis pour rester compact.

═══════════════════════════════════════════════════════════════
## LISTE NOIRE (pour les prochaines PR)
═══════════════════════════════════════════════════════════════
**Suite mobile**
- PWA basique (manifest.json + service worker + icône installable)
- Push notifications natives (FCM)

**Autres**
- Enrichissement Centre d'aide (FAQ "Comment faire pour...")
- Amélioration UX de la cloche (friction n°1 selon Master)
- Backup automatique (GitHub Actions, export Notion nightly)
- Intégration GitHub↔Sentry
- Protéger branche main (require PR + no force push)
- 3 cartes Brand sans Sous-format : B09W, B19E, B09U
- (Optionnel) Bouton "Réactiver cette version" sur versions annulées
- (Optionnel) Tour onboarding interactif au premier login

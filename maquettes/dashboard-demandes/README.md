# Maquette — « Demandes & missions » en page entière du dashboard

`dashboard-demandes.html` — **contenu fictif, NON VALIDÉE. Ne jamais déployer ce fichier.**

Maquette de référence de la **sixième page** du dashboard HAVANA. Elle remplace la
modale `ov-demandes` (`index.html:500`, 680 px, deux onglets maison) par une page
du menu, bâtie sur le motif que l'app emploie déjà cinq fois.

Distincte de `../espace-client-app/`, qui fixe les quatre écrans **du client**.
Celle-ci fixe l'écran **de l'équipe**. Les deux se parlent : même référence de
ticket, mêmes statuts, mêmes couleurs.

## Ce n'est pas du code de production

C'est une **référence du résultat**, jamais une source à copier. L'autorité reste
`index.html`, `css/*.css` et les contrats serveur. L'en-tête du fichier HTML
(≈150 lignes de commentaire, tout en haut) porte le détail : ce qui est déjà
construit, les contraintes serveur respectées, les bugs trouvés, les déviations
assumées, les décisions ouvertes. **À lire avant de coder.**

## L'architecture existe déjà — rien n'est inventé

| élément | où | rôle |
|---|---|---|
| entrée de menu | `index.html:144-165`, `.sb-item` + `id="nav-<page>"` | `css/layout.css:9-11` |
| bascule | `navTo(page)` → `appRender()` | dispatch sur `currentPage` |
| fil d'Ariane | `#breadcrumb` | `.textContent = 'Idées'` |
| actions | `#main-actions` | bouton primaire + recherche |
| sous-onglets | `#view-tabs`, `.vtab` | « ⊞ Cartes / 📊 Par statut / ☰ Liste » |
| filtres | `#sb-filters` (`index.html:223`) | `.sb-filter` + `.sb-dot` + `.sb-badge` |

Cinq pages existent : `dashboard`, `production`, `idees`, `taches`, `archives`.
Ajouter `demandes` = une entrée `nav-demandes`, un bloc dans `appRender()`, un
`loadDemandes()`.

⚠ **`appRender`, le menu et la modale vivent tous dans `index.html`, fichier
interdit.** Ce PR demande une **autorisation explicite**.

## Ce que la page réutilise, verbatim, de `css/*.css`

`.sb-nav-item` · `.sb-nav-icon` · `.sb-nav-badge[.red]` · `.main-topbar` ·
`.main-breadcrumb` · `.main-content` · `.view-tabs` · `.vtab[.active]` ·
`.nav-btn[.primary]` · `.list-table` · `.pill` + les six `.p-*` ·
`.search-input-wrap` · `.search-input` · `.search-icon` · `.search-highlight` ·
`.empty` · `.sb-filters` · `.sb-filter[.active]` · `.sb-dot` · `.sb-badge`

Les classes neuves sont toutes préfixées `dm-`. Elles n'écrasent rien.

## Contraintes serveur vérifiées que la maquette respecte

| contrainte | preuve |
|---|---|
| l'équipe ne peut poser que 4 statuts | `demandes-admin.js:13` + `:54` rejette le reste en 400 |
| donc **« Clôturée » n'est pas dans le sélecteur** | affichée en pastille, jamais proposée |
| le client ne peut que créer et lire | `demande-client.js:55` — ni clore, ni répondre |
| **donc personne ne peut poser « Clôturée » aujourd'hui** | les deux portes restent à ouvrir, PR-5 |
| les missions n'ont pas de sélecteur de statut | `missions-admin.js` n'offre que `decision` → Accepter / Refuser |
| la Réponse est écrasée à chaque écriture | `demandes-admin.js:66` — le fil suppose `💬 Messages` (PR-5a) |
| rien n'est automatisé | seul `Traité par` est estampillé serveur (`demandes-admin.js:65`) |

## Deux bugs trouvés en lisant pour monter cette maquette

1. **`missions-admin.js` lit `_sel(p.properties,'Plateforme')`** alors que
   `Plateforme` est un **multi-select**. `_sel` renvoie `''` systématiquement :
   la plateforme est **vide pour toutes les missions, en silence**. C'est le
   jumeau en **lecture** du bug en **écriture** de `mission-client.js:126`.
   Les deux vont ensemble, PR-4.
2. **`index.html:5748`** — `rafraichirBadgeDemandes()` avale tous les échecs
   (`catch(e){}` et `(rd && rd.ok) ? … : 0`). **Une pastille à 0 est
   indistinguable d'une panne d'accès.** C'est exactement pourquoi le 503 du
   15/11 est resté invisible jusqu'au jour où on a cliqué.

## Décisions de design, et leur source

| décision | pourquoi |
|---|---|
| liste + panneau de détail à droite | « quick view sidebar : the most scalable option » (Pencil & Paper) ; le 1er volet d'Intercom est ici la sidebar, qui existe déjà |
| **statut changé EN LIGNE** dans la rangée | « inline editing allows for the least friction and maintains the most context » |
| **réponse écrite dans le PANNEAU** | « add friction on purpose for high-stakes data » — la Réponse est marquée côté Notion « VISIBLE PAR LE CLIENT » |
| colonne **« Attente »**, pas « Âge » | les files meurent au MILIEU : un audit cité par eesel trouve 90 tickets parqués sur 200, tous en attente d'un client. Calculée sur le **dernier message**, son **sens** décide de qui attend |
| **la demande sort de la liste** | la liste sert à trier, le panneau à lire. La demande est le 1er bloc du panneau, sous la bannière |
| seuil de retard **2 jours** | choix Réel Média, pas une norme. Une seule constante : `SEUIL_RETARD_J` |
| champ vide = **« — »** | convention déjà en place dans la liste (`.dm-rien`) |
| 8 colonnes, 6 panneau ouvert | sous la limite de 15 colonnes d'une vue d'agent Zendesk |
| cibles tactiles : **24 px plancher, 44 px partout où c'est gratuit** | le dashboard n'a AUCUNE convention (2 occurrences de 44 px dans tout le CSS). L'espace client, lui, est à 44 px partout |

## La référence du ticket — FORMAT NON TRANCHÉ

La maquette affiche `D-7F3A` / `M-2B91`. **Le format est une proposition.**

Ce qui est **établi, et payé cher** : une propriété Notion de type `unique_id`
**ne marche pas**. Créée le 15/11, retirée le soir même — l'app lit Notion en
`2022-06-28` (`_notionio.js:45`), version **antérieure** à ce type. Le panneau
est tombé en 503. Ne pas y revenir sans monter l'app en version d'API, ce qui
touche **toutes** les fonctions.

Piste la moins chère : **dériver la référence de l'id de page Notion**, que l'app
a déjà en main (`demandes-admin.js:85` renvoie `id`). **Six** caractères hexa, pas
quatre — à 200 demandes, 4 donnent ≈26 % de collision. Aucun champ Notion neuf,
aucune écriture, aucun compteur, et ça marche sur la version d'API actuelle.

⚠ **La référence doit être la MÊME des deux côtés.** Le jour où on tranche, ça
touche aussi `../espace-client-app/`.

## Déviation assumée, à trancher

`css/base.css:4` porte `--text2:#888` (4,60 ✓) et `--text3:#555` (**2,19 ✗ AA**,
sur **248 usages** dans `index.html`). Monter `--text3` seul à `#878787` le rend
identique à `--text2` : la hiérarchie à trois niveaux meurt. La maquette relève
donc **deux** jetons — `--text2:#B4B4B4` (7,86) et `--text3:#878787` (4,54),
écart 1,73, proche de l'écart actuel 2,10. Ratios calculés, pas estimés.
**Si David refuse, la page marche quand même : seuls les gris changent.**

## Vérifications passées

30 tests au clic réel dans un navigateur : onglets, ouverture, changement de
statut en ligne, envoi de réponse, refus sans motif bloqué, filtres, recherche +
surlignage, « Clôturée » sans sélecteur, fermeture, téléphone. Zéro erreur
console. Aucune cible sous 24 px. Aucun débordement horizontal. Aucune colonne
tronquée hors aperçu volontaire.

## Ce qui reste ouvert

- **L'assignation.** Aucun champ « Assigné à » n'existe. `Traité par` est posé
  automatiquement au premier changement de statut — on ne peut donc pas
  « prendre » une demande sans la faire changer d'état.
- **Les actions en masse.** Ni dans le serveur, ni dans la maquette.
- **La clôture automatique.** Deux demandes « Traitée » du jeu d'essai traînent
  avec la balle chez le client depuis 9 et 11 jours. C'est le phénomène des
  90 tickets parqués. À décider un jour, pas maintenant.

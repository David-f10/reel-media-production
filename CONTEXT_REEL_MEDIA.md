# PASSATION — Réel Média Production (contexte pilote)

> Ce fichier permet à un nouveau chat de reprendre le rôle de PILOTE sans perdre le contexte.
> Dernière mise à jour : 2026-05-29

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

### 2026-05-29 — Brouillons retours internes + Triple validation Brand (branche `brouillons-triple-validation`)
index.html 5106 → **5166 lignes** (+60). Grosse PR à 2 features, faite en **4 incréments
vérifiés** (environnement Claude Code instable). Chaque incrément validé par le pilote
avant le suivant.

**CHANGEMENT 1 — Brouillons sur retours internes (base 📋 Retours)**
- Nouveau champ Notion "Brouillon" (checkbox) sur 📋 Retours, créé par le Master.
- Concerne UNIQUEMENT les retours `Source="Équipe"`. Les retours `Source="Client"` gardent
  leur logique inchangée.
- Création d'un retour interne : `Brouillon=true` par défaut.
- Affichage : contenu grisé (opacity 0.55) + label "BROUILLON" rouge + title au survol.
  Boutons corrigé/impossible masqués tant qu'en brouillon.
- Bouton "Valider tous les retours" : visible uniquement pour role="Chef" ET s'il existe au
  moins un brouillon. PATCH Notion en bloc sur tous les retours Équipe de la carte.
- Défense en profondeur : restriction Chef vérifiée côté UI (caché) ET côté handler
  (`validerTousRetours` re-vérifie role).
- Une fois validé, le retour n'est plus en brouillon → boutons corrigé/impossible réapparaissent,
  monteur peut agir.

**CHANGEMENT 2 — Triple validation Brand (chaîne stricte)**
- Champs Notion ajoutés sur 🎬 Suivi de Production par le Master :
  - "Validation Brand" (checkbox) entre RM et Client
  - "Contact Brand" (select : Arnaud C / Guillaume / Louise / Victor)
- Workflow Brand UNIQUEMENT (format='Brand') :
  1. Validation Édito (=validationRM) — libre, décochable
  2. Validation Brand — disabled tant que RM=false, décochable. RESTRICTION role='Brand'
     côté handler (toast "Réservé aux contacts Brand" sinon). Toast si contactBrand vide.
  3. Validation Client — disabled tant que Brand=false. **DÉFINITIVE** (cliquet, toast
     "Validation Client définitive" si reclic).
- 3 boutons côte à côte dans la fiche détail Brand.
- Pastille séquencier : 4 états (En attente → Édito validé → Brand validé → Validé client).
- Nouveau select "Contact Brand" dans la fiche, visible UNIQUEMENT si format=Brand.
  Options dynamiques (equipe filtré sur role='Brand'), option "— Aucun —".
- 2 nouvelles notifs au Contact Brand (type 'validation' / ✅) :
  - Édito coché → "Édito validé sur [code], à toi de valider"
  - Client coché → "Le client a validé [code]"
  Gardes : newVal=true, format=Brand, contactBrand non vide, contactBrand≠auteur.
- Les notifs EXISTANTES au journaliste sont PRÉSERVÉES (on ajoute, on ne remplace pas).
- AUTRES FORMATS NON TOUCHÉS : MAG, Face Cam, Desk, YouTube, Interne, Prodige → workflow
  séquencier simple inchangé (le cas 'autre' du handler n'a pas bougé).

**WORKFLOW : PR FAITE EN 4 INCRÉMENTS VÉRIFIÉS**
- I1 (brouillons) : 5106 → 5132. Validé.
- I2 (plomberie Brand : lecture + map upd) : 5132 → 5134. Validé.
- I3 (UI triple validation) : 5134 → 5155. Validé.
- I4 (notifs Contact Brand) : 5155 → 5166. Validé.
Chaque incrément a passé : node --check OK, compteurs de préservation tous bons, périmètre
strict respecté, fichier vérifié par le pilote avant feu vert pour l'incrément suivant.

**Vérifs pilote OK** : Brouillon=8 ; "Valider tous les retours"=1 ; validerTousRetours=2 ;
validationBrand=11 ; contactBrand=8 ; "Réservé aux contacts Brand"=1 ; "Assignez d'abord
un contact Brand"=1 ; "Validation Client définitive"=1 ; `validation:` dans NOTIF_ICONS=1 ;
createNotif('validation'=2 ; createNotif('nouveau_sujet'=11 (notifs journaliste intactes) ;
node --check OK ; window.onerror=2 ; sentry-cdn=1 ; DB_CLIENTS_BRAND=6 ; Montage V1=0 ;
function refreshUI=1 ; location.reload=0 ; EQUIPE_FALLBACK=[]=1.

**À tester en preview** (incognito + Cmd+Shift+R) — checklist en 3 zones :

🧪 BROUILLONS
1. Journaliste écrit un retour interne sur une carte → "BROUILLON" rouge + grisé
2. Un autre membre voit le brouillon avec son label
3. Benjamin (chef) voit le bouton "Valider tous les retours"
4. Journaliste sur la même carte → bouton invisible
5. Benjamin clique → tous brouillons → validés, grisé/label disparaissent
6. Boutons corrigé/impossible inactifs tant qu'en brouillon, réapparaissent une fois validés
7. Retours Client jamais affectés par la pastille brouillon

🧪 TRIPLE VALIDATION BRAND
8. Carte Brand → 3 boutons (Édito/Brand/Client) côte à côte
9. Carte MAG/Face Cam/Desk/YouTube → 2 boutons d'avant (workflow inchangé)
10. Brand : sans Édito, boutons Brand et Client disabled (clic silencieux)
11. Coche Édito → Brand cliquable, Client toujours disabled
12. Connecté Benjamin (chef) → clic Brand → toast "Réservé aux contacts Brand"
13. Connecté Arnaud C (Brand), contactBrand vide → toast "Assignez d'abord un contact"
14. Assigne Arnaud C → reclick Brand → ✅ coché
15. Client devient cliquable → coche → c'est définitif (re-clic → toast "définitive")

🧪 NOTIFS
16. Vérifier que Arnaud C (Contact Brand) reçoit "Édito validé sur [code], à toi de valider"
17. Vérifier qu'il reçoit aussi "Le client a validé [code]"
18. Vérifier que le journaliste continue de recevoir SES notifs habituelles (rien retiré)

🧪 RÉGRESSION
19. Login marche encore (auth intacte)
20. Création / édition cartes des autres formats : workflow normal
21. Console JS propre (à part les 504/500 Notion ponctuels habituels)

> Note process : Claude Code n'a pas pu pusher (403 permissions sur sa session). Fichier
> récupéré manuellement et vérifié par le pilote. À pousser sur GitHub via interface web.
> Branche cible : `brouillons-triple-validation`.

---

### 📋 LISTE NOIRE — Bugs/améliorations pour la PROCHAINE PR
À traiter dans une PR séparée après merge de brouillons-triple-validation :
1. **Bug double V1** : Thierry (machine RAM saturée par After Effects) a réussi à créer 2 V1
   en double-cliquant sur "Ajouter une version". Le verrou `_creerDecliEnCours` existe pour
   les déclis (ligne ~1625) mais probablement pas pour les versions V1/V2/V3. À ajouter :
   verrou + disabled UI pendant la requête + idéalement check serveur "pas de V1 récente".
2. **Bug titre coupé dans la fiche détail** : la troncature 1-ligne s'applique aussi à la
   modale détail (vu sur F645). À désactiver : dans la modale, le titre doit passer à la
   ligne (white-space: normal sur le sélecteur de la fiche, pas sur les cartes).
3. **Décli YouTube : choix Desk OU Face Cam** : actuellement le bouton "+ Créer une
   déclinaison Desk" force Desk (l. 1056). Ajouter 2 boutons "+ Décli Desk" / "+ Décli
   Face Cam". `creerDeclinaison` (l. 1626) accepte un 2e paramètre format. Titre de
   section "📎 Déclinaisons" (sans "Desk").

---

### 2026-05-28 — Login : <select> natif groupé par rôle via <optgroup> (branche `login-optgroup`) MERGÉ
index.html 5091 → 5106. Modif chirurgicale dans peuplerSelect. Groupes Chefs/Journalistes/
Monteurs/Brand/Autres. Match exact m.role (identique à renderEquipeList). doLogin intact.
Tentatives antérieures abandonnées : login-grille (grille de boutons), login-dropdown (menu
custom buggé sur 2e sélection).

### 2026-05-28 — Renommage statut « Montage V1 » → « Montage » + PR Réactivité (branche `montage-reactivite`) MERGÉ
index.html 5085 → 5091. Renommage statut (11 occurrences) + Réactivité (location.reload
supprimé, map synchro upd() complétée, refreshUI = appSetVue + refreshDetail débouncé 300ms,
dashboard rafraîchi à la fermeture). Confirmé EN PROD par David : "c'est très rapide".

═══════════════════════════════════════════════════════════════
## RÔLES (workflow à 3 chats)
═══════════════════════════════════════════════════════════════
- **CHAT PILOTE** : prépare les prompts Claude Code, vérifie les livrables, livre les fichiers
  validés + le CONTEXT mis à jour. NE code PAS, NE push PAS.
- **CHAT MASTER** : opérations Notion via MCP. Un SEUL chat écrit dans Notion = le master.
- **CLAUDE CODE** : exécute le code à partir des prompts du pilote. Ne pousse pas (403 perms).
- **DAVID** : non-codeur. Colle les prompts, upload sur GitHub, teste preview, merge,
  clique "Synchroniser maintenant". Langue : français.

## WORKFLOW STANDARD
1. Pilote prépare un prompt précis (intention + emplacement, PAS de code prescriptif)
2. Claude Code : curl -sL https://raw.githubusercontent.com/David-f10/reel-media-production/main/index.html -o index.html
3. Claude Code livre le(s) fichier(s) (récupération manuelle car push bloqué)
4. David envoie au pilote → pilote vérifie (wc -l, grep, node --check, lecture du diff)
5. Pilote livre 2 fichiers : index.html + CONTEXT_REEL_MEDIA.md mis à jour
6. David crée une branche, upload, ouvre PR, teste preview Netlify (incognito + Cmd+Shift+R), merge si OK
7. David clique "Synchroniser maintenant" sur le project knowledge

## WORKFLOW SPÉCIAL : grosses PR / environnement Claude Code instable
Découper en INCRÉMENTS VÉRIFIÉS (3 à 5 selon la taille). Pour chaque incrément :
  a) périmètre strict défini en amont,
  b) Claude Code livre uniquement cet incrément,
  c) compteurs de préservation + node --check vérifiés par le pilote AVANT feu vert pour
     l'incrément suivant.
Bénéfice : si l'environnement plante, on n'a perdu qu'un incrément. Et le pilote peut
détecter un dérapage à temps.

## RÈGLES D'OR
- index.html dans le project knowledge = SOURCE OFFICIELLE ; toujours modifier l'existant
- EQUIPE_FALLBACK = [] ; CHEF_PAR_DEFAUT = 'Benjamin'
- Format prompts Claude Code : intention + emplacement, sans code JS/HTML prescriptif
- À CHAQUE modif de code, livrer AUSSI le CONTEXT_REEL_MEDIA.md mis à jour
- Sur fichiers sensibles (login.js, auth, validations), JAMAIS merger sans :
  (a) vérification du pilote ET (b) test en preview
- Quand on échoue sur un design, oser revenir au simple plutôt qu'empiler des fix
- Ne jamais coller en clair des codes d'accès / secrets dans les chats
- Si Claude Code dépasse 30 minutes sans livrer, vérifier son état avec un message STOP+statut
- `git checkout` dans Claude Code peut donner une vieille version (HEAD désynchronisé du
  raw GitHub). TOUJOURS partir d'un `curl` du raw GitHub main, jamais d'un git checkout.

═══════════════════════════════════════════════════════════════
## PROJET
═══════════════════════════════════════════════════════════════
- App : Réel Média Production (suivi prod TV/vidéo), fichier unique index.html + CSS séparés
- Repo GitHub : David-f10/reel-media-production
- Prod : reel-media-production.netlify.app
- Backend : netlify/functions/notion.js (proxy API Notion) + netlify/functions/login.js (auth)
- CSS : css/base.css, css/layout.css, css/components.css, css/views.css
  (⚠️ variables CSS dans css/base.css, pas dans index.html — vérifier via "var(--xxx)")
- Monitoring : Sentry (org rushup, projet reel-media-production, data EU) — EN PROD
- État du main : 5106 lignes (post login-optgroup). Branche EN ATTENTE DE MERGE :
  `brouillons-triple-validation` (5166 lignes).

## AUTHENTIFICATION (login)
- login.js lit la base 👥 Équipe, trouve la personne par UUID, compare "Code acces"
  (rich_text). Renvoie {ok, user:{id,nom,role}}.
- Front : initLogin() charge l'équipe depuis Notion → <select> natif avec <optgroup>
  par rôle. Comptes = fiches Notion avec "Code acces" rempli. PAS de liste de comptes dans
  login.js.
- Ajouter un utilisateur : le MASTER lui met "Code acces" + "Role" dans Équipe.

## NOTIFS — comment ça marche
- loadNotifs filtre les notifs où "Destinataire" === currentUser.nom.
- createNotif prend un nom de destinataire en paramètre. Pas de whitelist.
- Système universel. Types dans NOTIF_ICONS : nouveau_sujet, v1/v2/v3_deposee, retour,
  retour_corrige, commentaire, version_validee, validation (NOUVEAU ✅ 2026-05-29).
- Les "Brand" reçoivent des notifs depuis la PR brouillons-triple-validation (Édito coché
  + Client coché).

## BASES NOTION (IDs)
| Base | ID |
|------|-----|
| 🎬 Suivi de Production | 01a8dc7d-1cc2-4209-9afe-a3bd90a87e20 (data source: 88894794-bcfd-41a5-baf3-b061fb75a1a9) |
| 🔢 Compteurs de codes | f9b8d090-6c9e-4513-a67c-db2d82941a29 |
| 🏷️ Clients Brand (NOUVELLE, utilisée par l'app) | 67abbb5f-f6a6-4937-89e3-6c852c515a8e |
| 🏢 Clients Brand (ANCIENNE, NE PAS toucher) | 228c6efb-eb59-42ef-8926-7ce34816cb96 |
| 👥 Équipe | df0e44e1-7c9c-4427-a9c2-af7b6da78fcb |
| 📋 Tâches | 0241d8dc-00a1-461c-9efa-00eb7e5fac70 |
| 🔔 Notifications | 4398775b-c11f-4d73-99c4-9fc31c33ce8b |
| 💡 Idées | b164bf282a4e4ac78a15d5e894019daa |
| 📎 Références | 4ae84e174ee9473888eaa15112fcc6ee |
| 📹 Versions | 3793eebb-2aeb-4d49-84ae-06d79cfb2704 |
| 🎵 Musiques | d9d3579257bc49059e6cd683a8b02fef |
| 💬 Commentaires | 45fda8a6-dfbc-42c1-a26f-de09c289037b |
| 📋 Retours | 02880609-ee82-4acc-b239-d8aac9cae439 (data source: 7817050d-ad51-45a3-bea2-6e6f7e2e0238) |

## CHAMPS NOTION RÉCENTS (à connaître)
- 📋 Retours : "Source" (Équipe/Client) + "Brouillon" (checkbox) ← Brouillon = NOUVEAU 2026-05-29
- 🎬 Suivi de Production : "Validation Brand" (checkbox) + "Contact Brand" (select :
  Arnaud C / Guillaume / Louise / Victor) ← NOUVEAUX 2026-05-29

═══════════════════════════════════════════════════════════════
## CE QUI EST EN PROD
═══════════════════════════════════════════════════════════════
- ✅ Feature Brand (base clients 67abbb5f, format livraison dans Sous-format, fix B54A)
- ✅ Troncature titres 1 ligne + tooltips ; colonnes kanban 220px
- ✅ Refresh fiche détail (refreshDetail, débounce 300ms)
- ✅ Sentry ; Phase A (window.onerror + bandeau Notion)
- ✅ Renommage Montage + Réactivité (confirmé rapide par David)
- ✅ Login <select> groupé par rôle (optgroup)

**EN ATTENTE DE MERGE** : `brouillons-triple-validation` (brouillons + triple validation Brand
+ Contact Brand + notifs validation).

═══════════════════════════════════════════════════════════════
## EN ATTENTE / PLUS TARD
═══════════════════════════════════════════════════════════════
Voir "LISTE NOIRE" dans l'historique (bugs Thierry double-V1, titre coupé, décli YouTube).
Aussi :
- 3 cartes Brand sans Sous-format : B09W, B19E, B09U (côté master).
- Backup automatique (GitHub Actions, export Notion nightly).
- Intégration GitHub↔Sentry.
- (Optionnel) Régénérer les codes d'accès des 5 nouveaux + des 4 Brand (ont circulé en clair
  dans des chats Master). Pas critique mais hygiène.
- (Optionnel) Protéger la branche main (require PR + no force push).

═══════════════════════════════════════════════════════════════
## NOTES TECHNIQUES UTILES
═══════════════════════════════════════════════════════════════
- ⚠️ `grep -c` retourne code 1 quand compte = 0 → casse les `&&`. Utiliser `|| true`.
- ⚠️ Variables CSS dans css/base.css (pas index.html). Vérifier via "var(--xxx)".
- Vérif tooltips : grep -F 'title="${s.titre' (le $ casse grep normal).
- Vue active = appSetVue(currentVue), rendu LOCAL depuis `sujets`, zéro API.
- refreshUI(id, forcePadOpen) = appSetVue(currentVue) si production + refreshDetail(id) débouncé.
- openDetail(id) lourde (~7 appels API) ; refreshDetail la ré-ouvre débouncé 300ms.
- Login : <select> natif #login-nom avec <optgroup> par rôle. doLogin lit value du select.
- Rôles canoniques : ['Chef', 'Journaliste', 'Monteur', 'Brand']
- Statuts (STATUS_ORDER) : Brief / Idée, Séquencier en cours, Séquencier validé, En tournage,
  Post-prod, Montage (ex « Montage V1 »), Retours, Validation chef, PAD.
- Couleurs format : MAG bleu, Brand ambre, Face Cam rouge, Desk gris, YouTube vert.
- Journalistes : Julien, Augustin, Nico, Mickael, Juliette, Mathilde, Léa, Sophie L., Éloise,
  Juliette B, David, Enrique C, Benjamin, Alice Guionnet, Romain Canault, Camille,
  Hervé Grandchamp, Anne Burlot.
- Chefs : Benjamin (défaut), Arnaud, Chloé. Monteurs : Thierry, David.
- Brand (contacts client) : Arnaud C, Guillaume, Louise, Victor.
- Handler des validations : toggleValidationSeq(id, type) avec type∈{'RM','Brand','Client','autre'}.
  Type 'Brand' = NOUVEAU. Type 'Client' modifié pour Brand uniquement (prérequis +
  cliquet définitif). Type 'autre' = autres formats, inchangé.

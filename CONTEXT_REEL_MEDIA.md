# PASSATION — Réel Média Production (contexte pilote)

> Ce fichier permet à un nouveau chat de reprendre le rôle de PILOTE sans perdre le contexte.
> Dernière mise à jour : 2026-05-29

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

### 2026-05-29 — 3 bugs UX corrigés (branche `fix-bugs-ux`)
index.html 5172 → **5184 lignes** (+12). PR petite avec 3 fixes indépendants.

⚠️ **Incident technique signalé** : la première version de cette PR (fixes
codés mais non commités) a été perdue lors d'un curl pointant vers une URL
de branche inexistante côté GitHub. Les 3 fixes ont été refaits + le vrai
fix du titre (textarea au lieu d'input) ajouté. Tout vérifié et validé.
LEÇON : ne jamais pointer Claude Code vers une branche non encore poussée
sur GitHub. Toujours partir du main + redécrire ce qui doit être refait.

**BUG 1 — Double création de version (V1/V2/V3)**
- Symptôme : utilisateur sur machine lente (cas Thierry, RAM saturée After
  Effects) qui double-clique sur "+ Ajouter une version" → 2 versions
  créées dans Notion.
- Cause : ajouterVersion avait un verrou (`ajouterVersionEnCours`) mais SANS
  try/finally et SANS verrou UI (le bouton restait cliquable visuellement).
- Fix triple :
  - Variable renommée en `_creerVersionEnCours` pour cohérence avec
    `_creerDecliEnCours`.
  - try/catch/finally pour garantir la libération du verrou ET la
    restauration du bouton même en cas d'erreur API.
  - Verrou UI : id `btn-add-version-${sujetId}` posé sur le bouton,
    désactivé + texte "Création..." pendant la requête, restauré dans le
    finally (avec sauvegarde du label original).
- Toast "Création en cours..." (existait déjà via pattern decli/version/create).
- Aucun appel serveur supplémentaire.

**BUG 2 — Titre tronqué dans la fiche détail (vrai fix)**
- Symptôme : titre long dans la modale était coupé avec "..." (ex. B29H
  "Immersion dans le marais de Taligny, intégré au Patrimoine mondial...").
- Première tentative (fix CSS sur le div parent) : ÉCHEC. Cause : ligne 747
  dans openDetail, le titre était mis dans un `<input type="text">` qui par
  nature ne wrappe jamais — aucune règle CSS sur le parent ne peut faire
  wrapper un input.
- Solution validée (Option A — textarea auto-grow) :
  - Remplacé `<input type="text" id="d-titre-input">` par
    `<textarea id="d-titre-input" rows="1">`.
  - `oninput` calcule la hauteur via scrollHeight → auto-grow visuel.
  - `onkeydown` : Enter sans Shift → preventDefault + blur (sauvegarde sans
    saut de ligne). Shift+Enter laissé libre.
  - Style identique à l'ancien input (transparent, border-bottom, fonts).
  - Contenu inséré entre balises avec `escapeHtml(s.titre)` (au lieu du
    `value="${s.titre}"` non échappé d'avant — bonus sécurité XSS).
  - `onblur → upd(...,'Titre','titre',this.value.trim())` — le .trim()
    évite les espaces parasites.
- Les cartes en vue Liste/Cartes gardent leur troncature (voulue).

**BUG 3 — Validation Client sans restriction sur cartes Brand**
- Symptôme : n'importe qui (journaliste, monteur) pouvait cocher
  "Validation Client" sur une carte Brand. Risque : déclenchement faux
  de la notif "Le client a validé".
- Fix : ajout d'une garde dans toggleValidationSeq cas type==='Client',
  condition `s.format==='Brand' && role !== 'Brand' && role !== 'Chef'`
  → toast "Réservé aux contacts Brand ou aux chefs" et return.
- Garde placée entre la silencieuse `if(!s.validationBrand) return` et
  le check "définitive".
- Pour les autres formats, pas d'impact : le cas 'Client' n'est jamais
  appelé (eux passent par 'autre').

**Vérifs pilote OK** : _creerVersionEnCours=4 ; ajouterVersionEnCours=0 ;
btn-add-version=2 ; textarea id="d-titre-input"=1 ; input type=text
id="d-titre-input"=0 ; d-titre-input=2 ; "Réservé aux contacts Brand ou
aux chefs"=1 ; node --check OK. Compteurs PR précédente préservés
intégralement : Brouillon=8, validerTousRetours=2, validationBrand=11,
contactBrand=8, "Valider tous les retours"=1, "Assignez d'abord un contact
Brand"=1, "Validation Client définitive"=1, createNotif('validation'=2,
function escapeHtml=1. 7 compteurs préservation : window.onerror=2,
sentry-cdn=1, DB_CLIENTS_BRAND=6, Montage V1=0, function refreshUI=1,
location.reload=0, EQUIPE_FALLBACK=[]=1.

**À tester en preview** (incognito + Cmd+Shift+R) :
1. Carte avec titre long (B29H, F645) → titre s'affiche en ENTIER sur
   plusieurs lignes si besoin. Cartes en vue Liste/Cartes : toujours
   tronquées (voulu).
2. Clic dans le titre → toujours éditable. Modification → sauvegarde au
   blur. Enter → sauvegarde sans saut de ligne.
3. Sur une carte avec versions, double-clic rapide sur "+ Ajouter une
   version" → 1 seule créée, bouton passe en "Création..." pendant
   l'opération.
4. Carte Brand, validations RM+Brand cochées → connecté en journaliste,
   clic "Client" → toast "Réservé aux contacts Brand ou aux chefs".
5. Carte Brand, même config → connecté en chef ou Brand, clic "Client"
   → fonctionne normalement.
6. Carte non-Brand (MAG/Face Cam/Desk/YouTube) → workflow inchangé.

> Note process : Claude Code n'a pas pu pusher (403 perms). Fichier
> récupéré manuellement et vérifié par le pilote. À pousser sur GitHub
> via interface web, branche `fix-bugs-ux`. Aucun changement Notion.

---

### 📋 LISTE NOIRE — Pour la prochaine PR (PR 2 : features)
3 features Brand qui demandent un nouveau champ Notion (à demander au Master) :
1. **Validation Brand par version** (Piste 2 validée par David) — sur cartes
   Brand uniquement, remplacer le bouton unique "Version validée" par
   2 boutons en chaîne : `[Validation Brand]` → `[Version validée]`
   (disabled tant que Brand pas cochée).
   PRÉ-REQUIS MASTER : ajouter "Validation Brand" (checkbox) sur 📹 Versions
   (ID 3793eebb-2aeb-4d49-84ae-06d79cfb2704).
2. **"Valider tous les retours" aussi dans le lecteur** — ajouter le bouton
   dans `loadPlayerRetours` (panneau lecteur), pas seulement dans
   `loadRetours` (fiche détail). Pour que les chefs puissent valider sans
   revenir à la fiche.
3. **Décli YouTube : choix Desk OU Face Cam** — actuellement le bouton
   "+ Créer une déclinaison Desk" force Desk (l. 1056). Ajouter 2 boutons
   "+ Décli Desk" / "+ Décli Face Cam". Modifier `creerDeclinaison` pour
   accepter un 2e paramètre format. Titre de section "📎 Déclinaisons"
   (sans "Desk").

---

### 2026-05-29 — Brouillons retours internes + Triple validation Brand (branche `brouillons-triple-validation`) MERGÉ
index.html 5106 → 5172 (+66 dont +6 pour le helper escapeHtml).
Grosse PR à 2 features faite en 4 incréments vérifiés + 1 correctif (bug
escapeHtml détecté en preview, corrigé avant merge).

**CHANGEMENT 1 — Brouillons sur retours internes** : nouveau champ "Brouillon"
(checkbox) sur 📋 Retours, uniquement pour Source="Équipe". Création en
brouillon par défaut, label "BROUILLON" rouge + grisé. Bouton "Valider tous
les retours" pour les chefs (cache pour les autres). Une fois validé : retour
non modifiable, monteur peut agir.

**CHANGEMENT 2 — Triple validation Brand** : sur format=Brand uniquement,
chaîne stricte Édito (validationRM) → Brand (NOUVEAU validationBrand) →
Client (validationClient). Validation Brand restreinte au role='Brand'.
Validation Client DÉFINITIVE pour Brand. Select Contact Brand assignable
sur la fiche. 2 nouvelles notifs au Contact Brand (type 'validation' / ✅)
sur Édito et Client. Notifs journaliste existantes préservées. AUTRES
FORMATS NON TOUCHÉS.

**Helper escapeHtml** ajouté (l. 504) — défense XSS, indispensable au
select Contact Brand.

---

### 2026-05-28 — Login : <select> natif groupé par rôle via <optgroup> (branche `login-optgroup`) MERGÉ
index.html 5091 → 5106. Modif chirurgicale dans peuplerSelect.

### 2026-05-28 — Renommage statut « Montage V1 » → « Montage » + PR Réactivité (branche `montage-reactivite`) MERGÉ
index.html 5085 → 5091.

═══════════════════════════════════════════════════════════════
## RÔLES (workflow à 3 chats)
═══════════════════════════════════════════════════════════════
- **CHAT PILOTE** : prépare les prompts, vérifie les livrables, livre les
  fichiers validés + le CONTEXT mis à jour. NE code PAS, NE push PAS.
- **CHAT MASTER** : opérations Notion via MCP. Un SEUL chat écrit dans
  Notion = le master.
- **CLAUDE CODE** : exécute le code. Ne pousse pas (403 perms).
- **DAVID** : non-codeur. Colle les prompts, upload sur GitHub, teste
  preview, merge, clique "Synchroniser maintenant". Langue : français.

## WORKFLOW STANDARD
1. Pilote prépare un prompt précis (intention + emplacement)
2. Claude Code : curl -sL https://raw.githubusercontent.com/David-f10/reel-media-production/main/index.html -o index.html
3. Claude Code livre le(s) fichier(s) (récupération manuelle car push bloqué)
4. David envoie au pilote → pilote vérifie (wc -l, grep, node --check, fonctions appelées, lecture du diff)
5. Pilote livre 2 fichiers : index.html + CONTEXT_REEL_MEDIA.md mis à jour
6. David crée une branche, upload, ouvre PR, TESTE preview Netlify, merge si OK
7. David clique "Synchroniser maintenant" sur le project knowledge

## WORKFLOW SPÉCIAL : sujets ambigus / cas complexes
Mode PROPOSITION : prompt ouvert demandant à Claude Code d'analyser le code,
proposer 2-3 approches avec leurs trade-offs, AVANT de coder. Le pilote
valide une approche, puis Claude Code code. Bénéfice : Claude Code voit
le code en entier, peut détecter des subtilités, propose de meilleures
solutions. À utiliser pour : bugs aux causes pas claires, refactorings,
modifs structurelles, cas où plusieurs solutions techniques se valent.

## WORKFLOW SPÉCIAL : grosses PR / environnement instable
Découper en INCRÉMENTS VÉRIFIÉS (3 à 5). Chaque incrément : a) périmètre
strict, b) Claude Code livre, c) pilote vérifie compteurs + node --check +
fonctions appelées AVANT feu vert.

## RÈGLES D'OR
- index.html dans le project knowledge = SOURCE OFFICIELLE
- EQUIPE_FALLBACK = [] ; CHEF_PAR_DEFAUT = 'Benjamin'
- Format prompts Claude Code : intention + emplacement
- À CHAQUE modif de code, livrer AUSSI le CONTEXT_REEL_MEDIA.md mis à jour
- Sur fichiers sensibles, JAMAIS merger sans (a) vérification pilote,
  (b) test preview, (c) console JS propre
- ⚠️ node --check ne voit pas les fonctions non définies. Sur toute modif
  d'UI, vérifier que CHAQUE fonction appelée est définie quelque part.
- Quand on échoue sur un design, oser revenir au simple
- Ne jamais coller en clair des codes d'accès / secrets dans les chats
- Si Claude Code dépasse 30 min sans livrer, vérifier son état avec un
  message STOP+statut
- `git checkout` peut donner une vieille version dans Claude Code.
  TOUJOURS curl raw GitHub.
- ⚠️ NOUVEAU (leçon fix-bugs-ux) : ne jamais pointer Claude Code vers une
  branche non encore poussée sur GitHub (curl 404 → écrasement du fichier).
  Toujours partir du main + redécrire ce qui doit être refait.

═══════════════════════════════════════════════════════════════
## PROJET
═══════════════════════════════════════════════════════════════
- App : Réel Média Production (suivi prod TV/vidéo), index.html + CSS séparés
- Repo : David-f10/reel-media-production
- Prod : reel-media-production.netlify.app
- Backend : netlify/functions/notion.js + netlify/functions/login.js
- CSS : css/base.css, css/layout.css, css/components.css, css/views.css
- Monitoring : Sentry (org rushup, projet reel-media-production, data EU).
  Capture d'écran obligatoire pour partager (lien direct ne marche pas
  pour le pilote, car connexion privée).
- État du main après merge brouillons-triple-validation : 5172 lignes.
- EN ATTENTE DE MERGE : `fix-bugs-ux` (3 bugs UX, 5184 lignes).

## AUTHENTIFICATION (login)
- login.js lit la base 👥 Équipe, trouve la personne par UUID, compare
  "Code acces". Renvoie {ok, user:{id,nom,role}}.
- Front : initLogin() charge l'équipe depuis Notion → <select> natif avec
  <optgroup>.
- Ajouter un utilisateur : MASTER met "Code acces" + "Role" dans Équipe.

## NOTIFS — comment ça marche
- loadNotifs filtre les notifs où "Destinataire" === currentUser.nom.
- createNotif prend un nom de destinataire en paramètre. Pas de whitelist.
- Système universel. Types dans NOTIF_ICONS : nouveau_sujet, v1/v2/v3_deposee,
  retour, retour_corrige, commentaire, version_validee, **validation** (2026-05-29).

## BASES NOTION (IDs)
| Base | ID |
|------|-----|
| 🎬 Suivi de Production | 01a8dc7d-1cc2-4209-9afe-a3bd90a87e20 (data source: 88894794-bcfd-41a5-baf3-b061fb75a1a9) |
| 🔢 Compteurs de codes | f9b8d090-6c9e-4513-a67c-db2d82941a29 |
| 🏷️ Clients Brand (NOUVELLE) | 67abbb5f-f6a6-4937-89e3-6c852c515a8e |
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

## CHAMPS NOTION RÉCENTS
- 📋 Retours : "Source" (Équipe/Client) + "Brouillon" (checkbox)
- 🎬 Suivi de Production : "Validation Brand" (checkbox) + "Contact Brand"
  (select : Arnaud C / Guillaume / Louise / Victor)
- 📹 Versions : "Validation Brand" (checkbox) ← À CRÉER PAR LE MASTER pour
  la prochaine PR

═══════════════════════════════════════════════════════════════
## CE QUI EST EN PROD
═══════════════════════════════════════════════════════════════
- ✅ Feature Brand ; Troncature titres ; Kanban 220px
- ✅ Refresh fiche détail
- ✅ Sentry ; Phase A
- ✅ Renommage Montage + Réactivité
- ✅ Login optgroup
- ✅ Brouillons retours internes + Triple validation Brand + Contact Brand
  + notifs validation

**EN ATTENTE DE MERGE** : `fix-bugs-ux` (3 bugs : double V1, titre tronqué
via textarea, restriction Validation Client).

═══════════════════════════════════════════════════════════════
## NOTES TECHNIQUES UTILES
═══════════════════════════════════════════════════════════════
- ⚠️ `grep -c` retourne code 1 quand compte = 0 → casse les `&&`.
  Utiliser `|| true`.
- ⚠️ `grep -c "X"` compte les LIGNES contenant X (sous-chaîne).
- ⚠️ Variables CSS dans css/base.css (pas index.html).
- ⚠️ node --check ne voit pas les fonctions non définies.
- ⚠️ Ne pas pointer Claude Code vers branche non poussée sur GitHub.
- Vue active = appSetVue(currentVue), rendu LOCAL depuis `sujets`, zéro API.
- refreshUI(id, forcePadOpen) = appSetVue(currentVue) si production +
  refreshDetail(id) débouncé.
- openDetail(id) lourde (~7 appels API) ; refreshDetail la ré-ouvre débouncé 300ms.
- Helper escapeHtml(s) : défini ligne 504, défense XSS.
- Titre fiche détail (#d-titre-input) : <textarea> auto-grow avec
  oninput=scrollHeight, onblur=upd, Enter=preventDefault+blur,
  Shift+Enter=libre. Contenu via escapeHtml.
- Verrous création : `_creerDecliEnCours` (déclis) + `_creerVersionEnCours`
  (versions, avec try/catch/finally + verrou UI sur btn-add-version-${id}).
- Login : <select> natif #login-nom avec <optgroup>.
- Rôles canoniques : ['Chef', 'Journaliste', 'Monteur', 'Brand']
- Statuts : Brief / Idée, Séquencier en cours, Séquencier validé, En tournage,
  Post-prod, Montage, Retours, Validation chef, PAD.
- Couleurs format : MAG bleu, Brand ambre, Face Cam rouge, Desk gris, YouTube vert.
- Journalistes : Julien, Augustin, Nico, Mickael, Juliette, Mathilde, Léa,
  Sophie L., Éloise, Juliette B, David, Enrique C, Benjamin, Alice Guionnet,
  Romain Canault, Camille, Hervé Grandchamp, Anne Burlot.
- Chefs : Benjamin (défaut), Arnaud, Chloé. Monteurs : Thierry, David.
- Brand : Arnaud C, Guillaume, Louise, Victor.
- Handler validations : toggleValidationSeq(id, type) avec
  type∈{'RM','Brand','Client','autre'}. Type 'Brand' restreint role='Brand'.
  Type 'Client' (Brand uniquement) restreint role 'Brand' OU 'Chef',
  + cliquet définitif. Type 'autre' = autres formats, inchangé.

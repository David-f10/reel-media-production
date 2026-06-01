# PASSATION — Réel Média Production (contexte pilote)

> Ce fichier permet à un nouveau chat de reprendre le rôle de PILOTE sans perdre le contexte.
> Dernière mise à jour : 2026-06-01

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

### 2026-06-01 — Features Brand v2 + UX (branche `features-brand-v2`)
index.html 5184 → **5226 lignes** (+42). PR à 5 features livrée en
**5 incréments vérifiés**, méthode incrémentale éprouvée (toujours fiable
malgré l'environnement Claude Code instable de samedi).

**FEATURE 1 — Validation Brand par version (cartes Brand uniquement)**
- Champ Notion : "Validation Brand" (checkbox) ajouté sur 📹 Versions par
  le Master AVANT le code.
- Lecture du champ dans loadVersions (parsing inline, ligne ~2037),
  variable locale `validationBrand` (défaut false si absent).
- Sur cartes Brand : bouton unique "Valider cette version" remplacé par
  2 boutons en chaîne `[Validation Brand]` → `[Valider cette version]`.
- "Valider cette version" disabled tant que `validationBrand=false`.
- Nouveau handler `toggleVersionValidationBrand` : double garde
  (format='Brand' + role 'Brand' ou 'Chef'), PATCH direct, décochable,
  toast confirmation, refresh loadVersions.
- `toggleVersionValidee` étendue avec param optionnel `vValidationBrand=true`
  → compatibilité ascendante parfaite (non-Brand inchangé) + garde
  silencieuse sur Brand si validationBrand=false.
- Cartes non-Brand : workflow strictement inchangé (vérifié par diff).

**FEATURE 2 — "Valider tous les retours" dans le panneau lecteur**
- Bouton ajouté en tête de `loadPlayerRetours` (panneau lecteur vidéo).
- Visible UNIQUEMENT si role='Chef' ET au moins 1 retour Source='Équipe'
  avec Brouillon=true sur la carte courante.
- Au clic : appel à `validerTousRetours(sujetId)` (fonction existante,
  non modifiée — utilisée des 2 contextes).
- Style adapté au thème sombre du player (`#16161F`, `#1E1E2A`, plein
  largeur, font-size:11px).

**FEATURE 3 — Décli YouTube : choix Desk OU Face Cam**
- Bouton unique "+ Créer une déclinaison Desk" remplacé par 2 boutons
  côte à côte `[+ Décli Desk]  [+ Décli Face Cam]` (flexbox, gap:6px,
  flex:1 chacun).
- Section renommée : "📎 Déclinaisons" (sans "Desk").
- `creerDeclinaison(parentId, formatDecli='Desk')` :
  - Nouveau paramètre `formatDecli`, défaut 'Desk' pour compat ascendante
  - Récupération dynamique du compteur (filter Format=formatDecli)
  - Champ 'Format' de la nouvelle carte = formatDecli
  - Wording du toast/notif paramétré
- `loadDeclinaisons` : badge format coloré sur chaque déclinaison
  (utilise `FMT_COLORS` avec alpha hex pour le fond et la bordure).
- BUG LATENT CORRIGÉ AU PASSAGE : `_creerDecliEnCours` n'était pas
  libéré sur 2 `return` précoces (if(!parent), if(!c)) → si un de ces
  returns était emprunté, le verrou restait à true jusqu'au reload, et
  l'utilisateur ne pouvait plus jamais créer de décli. Correction
  défensive ajoutée (libération avant les 2 returns). Compteur passé
  de 5 à 6 occurrences pour cette raison.

**FEATURE 4 — Alignement restriction Validation Brand (séquencier)**
- AVANT : `toggleValidationSeq` cas Brand restreignait role='Brand' UNIQUEMENT
- MAINTENANT : role='Brand' OU role='Chef' (cohérent avec Validation Client)
- Toast unifié "Réservé aux contacts Brand ou aux chefs" sur les 3
  validations (compteur passe à 3 : version Brand + Client séquencier +
  Brand séquencier)
- Garde `contactBrand` vide maintenue (les chefs aussi doivent assigner
  un contact Brand avant de valider)
- Philosophie : pas de blocage si tous les Brand sont absents, le chef
  peut débloquer

**FEATURE 5 — Wording notifs Brand précisé**
- Notif #1 : "Édito validé sur ${s.code}, à toi de valider" →
  "Édito validé sur **le séquencier de** ${s.code}, à toi de valider"
- Notif #2 : "Le client a validé ${s.code}" →
  "Le client a validé **le séquencier de** ${s.code}"
- Pourquoi : maintenant qu'il y a aussi des validations par version,
  ces notifs précisent qu'elles concernent le séquencier (pas une version)
- Note : `grep -c "le séquencier de" = 5` (faux positif) car 3 occurrences
  préexistantes utilisent la même expression sur d'autres notifs
  (au journaliste pour séquencier validé/déposé). Les anciens wordings
  exacts sont bien à 0 (substitution complète).

**Vérifs pilote OK (PR globale)** :
- 5226 lignes, node --check OK, toutes les fonctions appelées définies
- I1 : validationBrand=12 (11 sujets + 1 versions)
- I2 : toggleVersionValidationBrand=2, validationBrand=18 (usages UI)
- I3 : "Valider tous les retours"=2, validerTousRetours=3, Brouillon=10
- I4 : Décli Desk=1, Décli Face Cam=1, Déclinaisons Desk=0, _creerDecliEnCours=6
- I5 : "Réservé aux contacts Brand ou aux chefs"=3, "le séquencier de"=5
       (2 nouvelles + 3 préexistantes), anciens wordings=0
- Tous acquis PR précédentes intacts (textarea, verrou version, escapeHtml,
  brouillons, contactBrand, etc.)
- 7 compteurs de préservation tous intacts

**À tester en preview** (incognito + Cmd+Shift+R) :

🧪 VALIDATION BRAND PAR VERSION (le gros morceau)
1. Carte Brand, section Montage → 2 boutons côte à côte sur chaque version :
   [☐ Validation Brand]  [☐ Valider cette version]
2. "Valider cette version" disabled tant que "Validation Brand" pas cochée
3. Cliquer "Validation Brand" en journaliste → toast "Réservé aux contacts
   Brand ou aux chefs"
4. Cliquer en Brand ou Chef → ça marche, refresh OK, décochable
5. Une fois Brand coché → "Valider cette version" cliquable
6. Carte non-Brand → 1 seul bouton "Valider cette version" comme avant

🧪 VALIDATION SÉQUENCIER BRAND (alignement)
7. Carte Brand, section Séquencier → connecté en Chef (Benjamin) →
   clic "Validation Brand" → marche (avant : toast d'erreur ; maintenant : OK)
8. Vérifier que la garde contactBrand vide marche toujours

🧪 "VALIDER TOUS LES RETOURS" DANS LE LECTEUR
9. Ouvrir le lecteur d'une carte avec des retours en brouillon
10. Connecté en Chef → bouton "Valider tous les retours" visible en tête
    du panneau lecteur
11. Cliquer → tous les brouillons validés, bouton disparaît
12. Connecté en non-Chef → bouton invisible

🧪 DÉCLI YOUTUBE
13. Ouvrir une carte YouTube → 2 boutons "+ Décli Desk" / "+ Décli Face Cam"
14. Créer une décli Desk → nouvelle carte avec Format=Desk, code DXXX
15. Créer une décli Face Cam → nouvelle carte avec Format=Face Cam, code FXXX
16. La liste des déclis affiche un badge format coloré pour chacune
17. Carte non-YouTube → pas de section déclinaisons (inchangé)

🧪 WORDING NOTIFS BRAND
18. Coche "Édito" sur une carte Brand → notif au Contact Brand
    "Édito validé sur le séquencier de XXX, à toi de valider"
19. Coche "Client" → notif "Le client a validé le séquencier de XXX"
20. Notifs au journaliste : intactes (existaient déjà, non touchées)

🧪 RÉGRESSION
21. Cartes MAG, Face Cam, Desk → workflow validation inchangé (séquencier
    simple, 1 ou 2 boutons, pas de bouton Brand)
22. Édition titre (textarea) marche toujours
23. Double-clic ajouter version → verrou marche toujours
24. Validation Client journaliste → toast "Réservé..." (PR précédente)
25. Console JS propre

> Note process : Claude Code n'a pas pu pusher (403 perms). Fichier
> récupéré manuellement et vérifié par le pilote à chaque incrément.
> À pousser sur GitHub via interface web, branche `features-brand-v2`.

---

### 📋 LISTE NOIRE — Pour les prochaines PR
Plus rien de critique en attente. Si besoin futur :
- Backup automatique (GitHub Actions, export Notion nightly)
- Intégration GitHub↔Sentry
- (Optionnel) Régénérer les codes d'accès des 5 nouveaux + des 4 Brand
- (Optionnel) Protéger la branche main (require PR + no force push)
- 3 cartes Brand sans Sous-format : B09W, B19E, B09U (côté master)

---

### 2026-05-29 — 3 bugs UX (branche `fix-bugs-ux`) MERGÉ
index.html 5172 → 5184 (+12).

**BUG 1 — Double création de version** : Thierry (machine RAM saturée
AfterEffects) double-cliquait → 2 V1 créées. Fix triple : variable renommée
`_creerVersionEnCours`, try/catch/finally, verrou UI sur `btn-add-version-${id}`
avec sauvegarde du label original.

**BUG 2 — Titre tronqué dans fiche détail** : titre long coupé avec "...".
Cause : `<input type="text">` ne wrappe jamais nativement. Fix Option A :
remplacement par `<textarea id="d-titre-input">` auto-grow (oninput =
scrollHeight, Enter sans Shift → preventDefault + blur, Shift+Enter libre).
Bonus sécurité XSS : contenu inséré entre balises avec escapeHtml.

**BUG 3 — Validation Client sans restriction** : journalistes pouvaient
cocher. Fix : garde role='Brand' OU 'Chef' sur cartes Brand uniquement,
toast "Réservé aux contacts Brand ou aux chefs".

---

### 2026-05-29 — Brouillons retours internes + Triple validation Brand (branche `brouillons-triple-validation`) MERGÉ
index.html 5106 → 5172 (+66). PR à 2 features faite en 4 incréments + 1
correctif (bug escapeHtml détecté en preview).

**Brouillons retours internes** : nouveau champ "Brouillon" (checkbox)
sur 📋 Retours, uniquement Source="Équipe". Création en brouillon par
défaut, label "BROUILLON" rouge + grisé. Bouton "Valider tous les retours"
pour chefs uniquement.

**Triple validation Brand** : sur format=Brand, chaîne stricte Édito →
Brand → Client. Brand restreint à role='Brand', Client définitive.
Contact Brand assignable. 2 notifs au Contact Brand sur Édito et Client.
Notifs journaliste préservées.

**Helper escapeHtml** ajouté (l. 504) — défense XSS.

---

### 2026-05-28 — Login optgroup + Renommage Montage + Réactivité MERGÉS
Voir historique antérieur.

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
4. David envoie au pilote → pilote vérifie (wc -l, grep, node --check,
   fonctions appelées, lecture du diff)
5. Pilote livre 2 fichiers : index.html + CONTEXT_REEL_MEDIA.md mis à jour
6. David crée une branche, upload, ouvre PR, TESTE preview Netlify, merge si OK
7. David clique "Synchroniser maintenant" sur le project knowledge

## WORKFLOW SPÉCIAL : grosses PR / environnement Claude Code instable
Découper en INCRÉMENTS VÉRIFIÉS (3 à 5). Chaque incrément : a) périmètre
strict, b) Claude Code livre, c) pilote vérifie compteurs + node --check +
fonctions appelées AVANT feu vert.

## WORKFLOW SPÉCIAL : sujets ambigus / cas complexes
Mode PROPOSITION : prompt ouvert demandant à Claude Code d'analyser le
code, proposer 2-3 approches avec leurs trade-offs, AVANT de coder.

## RÈGLES D'OR
- index.html dans le project knowledge = SOURCE OFFICIELLE
- EQUIPE_FALLBACK = [] ; CHEF_PAR_DEFAUT = 'Benjamin'
- Format prompts Claude Code : intention + emplacement
- À CHAQUE modif de code, livrer AUSSI le CONTEXT_REEL_MEDIA.md mis à jour
- Sur fichiers sensibles, JAMAIS merger sans (a) vérification pilote,
  (b) test preview, (c) console JS propre
- ⚠️ node --check ne voit pas les fonctions non définies. Sur toute modif
  d'UI, vérifier que CHAQUE fonction appelée est définie.
- Quand on échoue sur un design, oser revenir au simple
- Ne jamais coller en clair des codes d'accès / secrets dans les chats
- Si Claude Code dépasse 30 min sans livrer, vérifier avec un message STOP+statut
- `git checkout` peut donner une vieille version dans Claude Code.
  TOUJOURS curl raw GitHub.
- Ne JAMAIS pointer Claude Code vers une branche non encore poussée sur
  GitHub (curl 404 → écrasement du fichier).

═══════════════════════════════════════════════════════════════
## PROJET
═══════════════════════════════════════════════════════════════
- App : Réel Média Production (suivi prod TV/vidéo), index.html + CSS séparés
- Repo : David-f10/reel-media-production
- Prod : reel-media-production.netlify.app
- Backend : netlify/functions/notion.js + netlify/functions/login.js
- CSS : css/base.css, css/layout.css, css/components.css, css/views.css
- Monitoring : Sentry (org rushup, projet reel-media-production, data EU).
- État du main après merge fix-bugs-ux : 5184 lignes.
- EN ATTENTE DE MERGE : `features-brand-v2` (5226 lignes, 5 features).

## AUTHENTIFICATION (login)
- login.js lit la base 👥 Équipe, trouve la personne par UUID, compare
  "Code acces". Renvoie {ok, user:{id,nom,role}}.
- Front : initLogin() charge l'équipe depuis Notion → <select> natif avec
  <optgroup>.

## NOTIFS — comment ça marche
- loadNotifs filtre les notifs où "Destinataire" === currentUser.nom.
- createNotif prend un nom de destinataire en paramètre. Pas de whitelist.
- Types dans NOTIF_ICONS : nouveau_sujet, v1/v2/v3_deposee, retour,
  retour_corrige, commentaire, version_validee, validation (2026-05-29).

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

## CHAMPS NOTION (à jour)
- 📋 Retours : "Source" (Équipe/Client) + "Brouillon" (checkbox)
- 🎬 Suivi de Production : "Validation Brand" (checkbox) + "Contact Brand"
  (select : Arnaud C / Guillaume / Louise / Victor)
- 📹 Versions : "Validation Brand" (checkbox) — AJOUTÉ 2026-06-01 pour
  la PR features-brand-v2

═══════════════════════════════════════════════════════════════
## CE QUI EST EN PROD (après merge des PR mergées)
═══════════════════════════════════════════════════════════════
- ✅ Feature Brand ; Troncature titres ; Kanban 220px
- ✅ Refresh fiche détail (refreshDetail, débounce 300ms)
- ✅ Sentry ; Phase A
- ✅ Renommage Montage + Réactivité
- ✅ Login optgroup
- ✅ Brouillons retours internes + Triple validation Brand + Contact Brand
  + notifs validation
- ✅ Fix 3 bugs UX (double V1, titre textarea, restriction Client)

**EN ATTENTE DE MERGE** : `features-brand-v2` (5 features).

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
- openDetail(id) lourde (~7 appels API).
- Helper escapeHtml(s) : défini ligne 504, défense XSS.
- Titre fiche détail (#d-titre-input) : <textarea> auto-grow avec
  oninput=scrollHeight, onblur=upd, Enter=preventDefault+blur,
  Shift+Enter=libre. Contenu via escapeHtml.
- Verrous création : `_creerDecliEnCours` (déclis, avec libérations
  défensives sur returns précoces depuis features-brand-v2) +
  `_creerVersionEnCours` (versions, try/catch/finally + verrou UI sur
  btn-add-version-${id}).
- Login : <select> natif #login-nom avec <optgroup>.
- Rôles canoniques : ['Chef', 'Journaliste', 'Monteur', 'Brand']
- Statuts : Brief / Idée, Séquencier en cours, Séquencier validé,
  En tournage, Post-prod, Montage, Retours, Validation chef, PAD.
- Couleurs format : MAG bleu, Brand ambre, Face Cam rouge, Desk gris,
  YouTube vert.
- Journalistes : Julien, Augustin, Nico, Mickael, Juliette, Mathilde,
  Léa, Sophie L., Éloise, Juliette B, David, Enrique C, Benjamin,
  Alice Guionnet, Romain Canault, Camille, Hervé Grandchamp, Anne Burlot.
- Chefs : Benjamin (défaut), Arnaud, Chloé. Monteurs : Thierry, David.
- Brand : Arnaud C, Guillaume, Louise, Victor.
- Handler validations séquencier : toggleValidationSeq(id, type) avec
  type∈{'RM','Brand','Client','autre'}. Type 'Brand' restreint role
  'Brand' OU 'Chef'. Type 'Client' (Brand uniquement) restreint role
  'Brand' OU 'Chef', + cliquet définitif. Type 'autre' = autres formats.
- Handler validation par version : toggleVersionValidationBrand(versionId,
  sujetId, wasValide) — double garde format='Brand' + role 'Brand'/'Chef',
  PATCH direct, décochable.
- toggleVersionValidee signature : (versionId, sujetId, versionNum,
  wasValidee, url, vValidationBrand=true). Le 6e param sert à la garde
  silencieuse sur Brand. Default true = non-Brand inchangé.
- creerDeclinaison signature : (parentId, formatDecli='Desk').
  formatDecli ∈ {'Desk', 'Face Cam'}. Verrou avec libérations défensives
  sur les 2 returns précoces (corrigé features-brand-v2).

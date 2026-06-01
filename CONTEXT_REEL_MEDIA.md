# PASSATION — Réel Média Production (contexte pilote)

> Ce fichier permet à un nouveau chat de reprendre le rôle de PILOTE sans perdre le contexte.
> Dernière mise à jour : 2026-06-01

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

### 2026-06-01 — Features Brand v2 + UX + inversion ordre boutons (branche `features-brand-v2`)
index.html 5184 → **5233 lignes** (+49). PR à 5 features + 1 ajustement
ordre, livrée en **5 incréments vérifiés + 1 correctif final** (inversion
ordre des 2 boutons par version).

**FEATURE 1 — Validation Brand par version (cartes Brand uniquement)**
- Champ Notion : "Validation Brand" (checkbox) ajouté sur 📹 Versions par
  le Master AVANT le code.
- Lecture du champ dans loadVersions, variable locale `validationBrand`.
- Sur cartes Brand : 2 boutons côte à côte, dans CET ORDRE (corrigé après
  retour David sur le workflow réel) :
  `[☐ Valider cette version]` (gauche, 1er maillon, garantie ÉDITO) →
  `[☐ Validation Brand]` (droite, 2e maillon, garantie CONFORMITÉ CLIENT,
  disabled tant que Valider pas cochée)
- WORKFLOW MÉTIER RÉEL : journaliste upload V1/V2 → Benjamin (chef)
  regarde et valide la version (édito OK) → Louise (Brand) regarde et
  valide Brand (conforme brief) → V part au client.
- Restructuration loadVersions : branchement `if(isBrand)` placé AVANT
  le raccourci `if(validee) return ✅ Version validée`, pour que sur
  Brand, le bouton Validation Brand reste cliquable même après validation
  édito.
- Nouveau handler `toggleVersionValidationBrand(versionId, sujetId,
  wasValidee, wasValide)` : triple garde (format='Brand', wasValidee
  silencieuse, role 'Brand'/'Chef'), PATCH direct, décochable, toast
  confirmation.
- `toggleVersionValidee` : signature restaurée à l'original (versionId,
  sujetId, versionNum, wasValidee, url) — pas de paramètre Brand vu que
  c'est désormais le 1er maillon.
- Cartes non-Brand : workflow strictement inchangé (1 seul bouton).

**FEATURE 2 — "Valider tous les retours" dans le panneau lecteur**
- Bouton ajouté en tête de `loadPlayerRetours`.
- Visible UNIQUEMENT si role='Chef' ET au moins 1 retour Source='Équipe'
  avec Brouillon=true.
- Au clic : `validerTousRetours(sujetId)` (fonction existante, non modifiée).
- Style adapté au thème sombre du player (#16161F, #1E1E2A, plein largeur,
  font-size:11px).

**FEATURE 3 — Décli YouTube : choix Desk OU Face Cam**
- Bouton unique remplacé par 2 boutons côte à côte
  `[+ Décli Desk]  [+ Décli Face Cam]`.
- Section renommée "📎 Déclinaisons" (sans "Desk").
- `creerDeclinaison(parentId, formatDecli='Desk')` : 2e paramètre pour
  compteur dynamique, champ Format, wording.
- BONUS : libération défensive du verrou `_creerDecliEnCours` sur 2
  returns précoces (bug latent corrigé, compteur 5→6).
- `loadDeclinaisons` : badge format coloré sur chaque déclinaison
  (FMT_COLORS + alpha hex).

**FEATURE 4 — Alignement restriction Validation Brand séquencier**
- `toggleValidationSeq` cas type==='Brand' : restriction passe de
  role='Brand' UNIQUEMENT → role='Brand' OU role='Chef'.
- Toast unifié "Réservé aux contacts Brand ou aux chefs" sur les 3
  validations (compteur=3 : version Brand + Client séquencier + Brand
  séquencier).
- Garde `contactBrand` vide MAINTENUE.
- Philosophie : pas de blocage si tous les Brand sont absents, le chef
  peut débloquer.

**FEATURE 5 — Wording notifs Brand précisé**
- "Édito validé sur le séquencier de ${s.code}, à toi de valider"
- "Le client a validé le séquencier de ${s.code}"
- Pourquoi : distingue les notifs séquencier des futures notifs par
  version.

**INVERSION D'ORDRE BOUTONS (correctif final ajouté en preview)**
- Initialement codé : [Validation Brand] → [Valider cette version]
  (chaîne dans le mauvais sens)
- Après test David : workflow réel inverse (chef d'abord, brand après)
- Correctif : inversion HTML + inversion dépendance + restructuration
  pour que la branche isBrand soit traitée AVANT le raccourci validee.

**DÉCISION PRODUIT en suspens (notée pour PR future)**
- "Décocher Valider cette version" laisse "Validation Brand" cochée
  (option a — statu quo). David a confirmé : dans la vraie vie, on ne
  fait pas marche arrière sur une validation, on crée une nouvelle
  version (V3, V4...). Donc le cas "incohérent visuel" est exceptionnel
  et acceptable. Une vraie feature "Annuler cette version" sera codée
  séparément si besoin (cf. liste noire).

**Vérifs pilote OK (PR globale)**
- 5233 lignes, node --check OK, toutes fonctions appelées définies
- vValidationBrand=0 (paramètre retiré, signature toggleVersionValidee
  restaurée)
- toggleVersionValidationBrand=3 (def + 2 onclick conditionnels)
- "Réservé aux contacts Brand ou aux chefs"=3
- "le séquencier de"=5 (2 nouveaux + 3 préexistants)
- Décli Desk=1, Décli Face Cam=1, "Déclinaisons Desk"=0
- Brouillon=10, validerTousRetours=3, contactBrand=8
- _creerVersionEnCours=4, _creerDecliEnCours=6, textarea d-titre-input=1
- function escapeHtml=1, createNotif('validation')=2
- 7 compteurs préservation tous intacts.

**À tester en preview** (incognito + Cmd+Shift+R) :

🧪 VALIDATION BRAND PAR VERSION (ordre corrigé)
1. Carte Brand → section Montage → 2 boutons côte à côte par version :
   `[Valider cette version]` (gauche) → `[Validation Brand]` (droite)
2. Au départ : "Validation Brand" disabled (gris). "Valider cette version"
   cliquable normalement.
3. Coche "Valider cette version" en Chef (Benjamin) → bouton devient
   "✅ Version validée" vert, ET "Validation Brand" devient cliquable.
4. Coche "Validation Brand" en Brand (Louise) ou Chef → devient
   "✅ Validation Brand" bleu.
5. Coche en Journaliste (Augustin) → toast "Réservé aux contacts Brand
   ou aux chefs", bouton reste décoché.
6. Carte non-Brand → 1 seul bouton "Valider cette version" (inchangé).

🧪 VALIDATION SÉQUENCIER BRAND (Chef peut maintenant valider)
7. Carte Brand → Séquencier → connecté en Chef → clic "Brand" → marche
   maintenant (avant : toast d'erreur).

🧪 RETOURS DANS LECTEUR
8. Ouvrir le lecteur d'une carte avec brouillons → en Chef → bouton
   "Valider tous les retours" en tête du panneau lecteur.

🧪 DÉCLI YOUTUBE
9. Carte YouTube → 2 boutons "+ Décli Desk" / "+ Décli Face Cam".
10. Créer une décli Desk → carte Format=Desk, code DXXX.
11. Créer une décli Face Cam → carte Format=Face Cam, code FXXX.
12. Liste des déclis affiche un badge format coloré pour chacune.

🧪 NOTIFS BRAND
13. Coche "Édito" sur Brand → notif au Contact Brand "Édito validé sur
    le séquencier de XXX, à toi de valider".
14. Coche "Client" → notif "Le client a validé le séquencier de XXX".

🧪 RÉGRESSION
15. Cartes MAG/Face Cam/Desk → workflow inchangé.
16. Édition titre (textarea) marche.
17. Double-clic ajouter version → verrou marche.
18. Validation Client journaliste → toast "Réservé...".
19. Console JS propre.

> Note process : Claude Code n'a pas pu pusher (403 perms). Fichier
> récupéré manuellement, branche features-brand-v2 créée par David sur
> GitHub (PR #20), inversion d'ordre faite ensuite et fichier remplacé
> sur la branche. À tester en preview puis merger.

---

### 📋 LISTE NOIRE — Pour les prochaines PR

**NOUVEAU 2026-06-01 — Feature à concevoir : "Annuler cette version"**
Pour les cartes Brand uniquement, après les 2 validations (Valider + Brand)
faites. Permet au Chef ou au Brand de noter qu'une erreur a été détectée
et demander une nouvelle version. Décisions produit à trancher AVANT le
code :
1. Comportement Notion : nouveau champ "Annulée" (checkbox) sur 📹 Versions
   OU juste décocher les 2 validations ?
2. Affichage des versions annulées : badge "❌ Annulée" rouge ? Garder
   dans la liste pour historique ? Ou masquer ?
3. Notification : prévenir qui ? (journaliste pour refaire ? Tout le monde ?)
4. Workflow de re-validation : la version suivante refait le cycle complet.
5. Texte du bouton : "Annuler" / "Rejeter" / "Demander nouvelle version" ?
6. Confirmation au clic (pour éviter clic accidentel) ?
7. PRÉ-REQUIS MASTER éventuel selon décision 1 (créer champ Notion).

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
`_creerVersionEnCours`, try/catch/finally, verrou UI sur `btn-add-version-${id}`.

**BUG 2 — Titre tronqué dans fiche détail** : titre long coupé avec "...".
Cause : `<input type="text">` ne wrappe jamais nativement. Fix : remplacement
par `<textarea id="d-titre-input">` auto-grow (oninput=scrollHeight,
Enter sans Shift=preventDefault+blur, Shift+Enter libre). Bonus sécurité XSS.

**BUG 3 — Validation Client sans restriction** : journalistes pouvaient
cocher. Fix : garde role='Brand' OU 'Chef' sur Brand uniquement,
toast "Réservé aux contacts Brand ou aux chefs".

---

### 2026-05-29 — Brouillons retours internes + Triple validation Brand (branche `brouillons-triple-validation`) MERGÉ
index.html 5106 → 5172 (+66). PR à 2 features faite en 4 incréments + 1
correctif (bug escapeHtml détecté en preview).

**Brouillons retours internes** : nouveau champ "Brouillon" (checkbox)
sur 📋 Retours, uniquement Source="Équipe". Création en brouillon par
défaut, label "BROUILLON" rouge + grisé. Bouton "Valider tous les retours"
pour chefs uniquement.

**Triple validation Brand séquencier** : sur format=Brand, chaîne stricte
Édito → Brand → Client. Brand restreint à role='Brand', Client définitive.
Contact Brand assignable. 2 notifs au Contact Brand sur Édito et Client.

**Helper escapeHtml** ajouté (l. 504) — défense XSS.

---

### 2026-05-28 — Login optgroup + Renommage Montage + Réactivité MERGÉS

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

## WORKFLOW SPÉCIAL : grosses PR / environnement instable
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
- ⚠️ node --check ne voit pas les fonctions non définies. Vérifier
  manuellement les dépendances.
- Quand on échoue sur un design, oser revenir au simple
- Ne jamais coller en clair des codes d'accès / secrets dans les chats
- Si Claude Code dépasse 30 min sans livrer, message STOP+statut
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
- EN ATTENTE DE MERGE : `features-brand-v2` (5233 lignes, PR #20).

## AUTHENTIFICATION (login)
- login.js lit la base 👥 Équipe, trouve par UUID, compare "Code acces".
- Front : initLogin() → <select> natif avec <optgroup>.

## NOTIFS — comment ça marche
- loadNotifs filtre par "Destinataire" === currentUser.nom.
- createNotif prend un nom de destinataire en paramètre.
- Types : nouveau_sujet, v1/v2/v3_deposee, retour, retour_corrige,
  commentaire, version_validee, validation (2026-05-29).

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
- 📹 Versions : "Validation Brand" (checkbox)

═══════════════════════════════════════════════════════════════
## CE QUI EST EN PROD (après merge des PR mergées)
═══════════════════════════════════════════════════════════════
- ✅ Feature Brand ; Troncature titres ; Kanban 220px
- ✅ Refresh fiche détail
- ✅ Sentry ; Phase A
- ✅ Renommage Montage + Réactivité
- ✅ Login optgroup
- ✅ Brouillons retours internes + Triple validation Brand séquencier
  + Contact Brand + notifs validation
- ✅ Fix 3 bugs UX (double V1, titre textarea, restriction Client)

**EN ATTENTE DE MERGE** : `features-brand-v2` (5 features + inversion ordre).

═══════════════════════════════════════════════════════════════
## NOTES TECHNIQUES UTILES
═══════════════════════════════════════════════════════════════
- ⚠️ `grep -c` retourne code 1 si compte=0 → casse les `&&`. Utiliser `|| true`.
- ⚠️ `grep -c "X"` compte les LIGNES contenant X (sous-chaîne).
- ⚠️ Variables CSS dans css/base.css (pas index.html).
- ⚠️ node --check ne voit pas les fonctions non définies.
- ⚠️ Ne pas pointer Claude Code vers branche non poussée sur GitHub.
- Vue active = appSetVue(currentVue), rendu LOCAL depuis `sujets`, zéro API.
- refreshUI(id, forcePadOpen) = appSetVue(currentVue) si production +
  refreshDetail(id) débouncé.
- openDetail(id) lourde (~7 appels API).
- Helper escapeHtml(s) : défini ligne 504, défense XSS.
- Titre fiche détail (#d-titre-input) : <textarea> auto-grow.
- Verrous création : `_creerDecliEnCours` (déclis, avec libérations
  défensives sur returns précoces) + `_creerVersionEnCours` (versions,
  try/catch/finally + verrou UI).
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
  sujetId, wasValidee, wasValide) — triple garde format='Brand' +
  wasValidee + role 'Brand'/'Chef', PATCH direct, décochable.
- toggleVersionValidee signature originale : (versionId, sujetId,
  versionNum, wasValidee, url). C'est le 1er maillon de la chaîne Brand.
- creerDeclinaison signature : (parentId, formatDecli='Desk').
  formatDecli ∈ {'Desk', 'Face Cam'}. Verrou avec libérations défensives.
- ORDRE de la chaîne validation version (Brand) : Valider cette version
  (Chef/édito) → Validation Brand (Brand/conformité client). PAS l'inverse.

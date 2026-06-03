# PASSATION — Réel Média Production (contexte pilote)

> Ce fichier permet à un nouveau chat de reprendre le rôle de PILOTE sans perdre le contexte.
> Dernière mise à jour : 2026-06-03

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

### 2026-06-03 — Mobile polish v3 : 5 fix UX iPhone + retours équipe mobile + bouton Télécharger (branche `mobile-polish-v3`)
index.html 5515 → **5535 lignes** (+20). 3 CSS modifiés. Diff total ~88 lignes.
PR cumule 7 fix dont 5 retours iPhone, 1 fix vue retours équipe et 1 nouvelle 
feature bouton Télécharger.

**WORKFLOW PROPOSITION-puis-CODE utilisé pour la 3e fois.** Excellent résultat.
Claude Code a identifié des décisions techniques fines (factorisation via 
helper `setFiltersVisible` plutôt que duplication, ajout d'une classe 
`has-filters` sur `.main-area` pour gérer le padding du contenu derrière 
le bandeau fixé).

**INCIDENT MAIN STALE RÉSOLU AVANT CODE** : David avait initialement 
oublié de merger mobile-polish-v2 avant de lancer v3. Claude Code l'a 
détecté en faisant son `curl raw GitHub` (le code reçu était pré-v2). 
Solution propre : merger v2 d'abord, puis relancer v3 sur main à jour. 
Règle d'or ajoutée : "AVANT chaque PR, vérifier que la PR précédente 
est mergée sur main".

**Décisions produit prises (5 questions tranchées)**
- Q1 (clearDate confirm) : PAS de confirm
- Q2 (clearDate scope) : UNIVERSEL desktop + mobile (pas que mobile)
- Q3 (toggle filtres FIX C) : refactor via classList.toggle('is-visible') 
  sur tous les emplacements, plus de hack !important
- Q4 (ordre bottom-nav) : ordre HTML conservé (Dashboard / Production / 
  Idées / Tâches)
- Q5 (clickNotif) : version défensive (pas de re-navTo si déjà sur 
  prod, délai adaptatif 50ms ou 350ms)

**Les 7 fix livrés**

FIX A — Bouton × pour vider les dates (J1 / J2 / Diffusion)
- Fonction réutilisable `clearDate(id, field, btnEl)` : vide l'input, 
  masque le bouton, PATCH Notion null
- Wrapper `.date-wrap` avec `.date-clear` (bouton × discret)
- Visible UNIVERSEL (desktop + mobile)
- Bouton apparaît UNIQUEMENT si la date est définie (template 
  conditionnel sur la valeur)
- Pas de confirm

FIX B — Bouton × visible quand on scroll mobile
- `.modal-hdr` sur mobile : align-items:center (au lieu de flex-start), 
  z-index:5, padding-right:max(20px, env(safe-area-inset-right)) pour 
  respecter le notch iPhone en paysage
- `.modal-close` sur mobile : fond léger rgba(255,255,255,0.06), 
  border-radius:8px, color:var(--text), z-index:2 position:relative

FIX C — Bandeau filtres : restructure complète via classList
- Helper `setFiltersVisible(visible)` qui toggle `.is-visible` sur 
  #sb-filters ET `.has-filters` sur `.main-area`
- 4 emplacements JS modifiés (lignes 5318, 5348, 5358, 5367) qui 
  utilisent maintenant le helper au lieu de style.display
- CSS mobile : `#sb-filters{display:none}` par défaut, 
  `#sb-filters.is-visible{display:flex; position:fixed; ...}`
- CSS desktop : pareil mais `display:block`
- `.main-area.has-filters .main-content{padding-top:48px}` pour 
  décaler le contenu sous le bandeau fixe
- Plus de `!important` sur l'affichage : le JS contrôle propre via la 
  classe

FIX D — Bottom-nav 4 items (ajout Tâches)
- Whitelist CSS élargi : 
  `.sb-item#nav-dashboard,.sb-item#nav-production,.sb-item#nav-idees,
   .sb-item#nav-taches{display:flex!important;...}`
- Ordre HTML conservé : Dashboard / Production / Idées / Tâches
- Badge des Tâches s'affiche correctement

FIX E — clickNotif défensive
- Pas de re-navTo si on est déjà sur Production
- Délai 50ms si déjà sur prod, 350ms si change de page
- Robustification UX sans risque, code plus propre

FIX F — Layout retours équipe mobile
- 3 classes hook ajoutées dans openPlayer : .player-modal-body, 
  .player-modal-stage, .player-modal-panel
- CSS mobile dans views.css : flex-direction:column sur 
  .player-modal-body, lecteur 45vh en haut, panneau 55vh en bas
- Desktop INCHANGÉ (2 colonnes 340px panneau / flex:1 lecteur)
- Vue retours équipe sur mobile = même feeling que vue Review

FIX G — Bouton Télécharger dans openPlayer
- Nouvelle fonction `toDlUrl(url)` qui transforme un lien Drive 
  /view en /uc?export=download&id={ID}
- Bouton ⬇ Télécharger ajouté dans le formulaire openPlayer, sous 
  le bouton "Envoyer →"
- Visible UNIQUEMENT si l'URL contient 'drive.google.com' (garde)
- Style inline cohérent avec openPlayer (palette #2A2A3A/#9898B0)
- Hover effects en inline style (color/borderColor)
- Visible desktop ET mobile

**Architecture des changements**
- 3 nouvelles fonctions JS : `clearDate`, `setFiltersVisible`, `toDlUrl`
- 4 nouvelles classes CSS : `.date-wrap`, `.date-clear`, `.has-filters` 
  (sur main-area), `.is-visible` (sur #sb-filters)
- 3 classes hook dans openPlayer : `.player-modal-body`, 
  `.player-modal-stage`, `.player-modal-panel`
- Border mobile : 700px (cohérent avec l'existant)
- Toutes les classes mobile-polish v1 + v2 préservées

**Vérifs pilote OK**
- 5535 lignes index.html, node --check OK
- clearDate=4 (def + 3 inputs date) ✓
- setFiltersVisible=5 (def + 4 appels) ✓
- toDlUrl=2 ✓
- Télécharger=2 (bouton + commentaire JS existant) ✓
- player-modal-body=1, player-modal-panel=1 ✓
- has-filters=1, nav-taches=1 ✓
- date-wrap=4, date-clear=2 ✓
- Tous les acquis préservés (18 récents + 7 préservation)

**À tester en preview** (incognito + Cmd+Shift+R)

🧪 **TEST PRIORITAIRE iPhone**
1. Ouvrir une carte avec dates → cliquer × pour vider J2 → date effacée
2. Scroll dans une fiche détail longue → bouton × toujours visible
3. Naviguer Dashboard → bandeau filtres INVISIBLE (pas affiché)
4. Naviguer Production → bandeau filtres visible, scrollable, 
   ne cache pas les onglets vue
5. Naviguer Idées → bandeau filtres INVISIBLE
6. Bottom-nav : 4 items (Dashboard / Production / Idées / Tâches) avec 
   badges visibles
7. Cliquer notif dans la cloche → ouvre la carte concernée rapidement
8. Ouvrir une version vidéo (retours équipe) → mobile : lecteur en haut, 
   retours en bas (comme Review)
9. Vue retours équipe : bouton ⬇ Télécharger visible sous "Envoyer →" 
   pour les fichiers Drive
10. Cliquer Télécharger → ouvre le download direct Drive

🧪 **TEST DESKTOP**
11. Toutes les vues précédentes (Cartes, Statut, Journaliste, Liste, 
    Calendrier) inchangées
12. Vue retours équipe : 2 colonnes (lecteur + panneau retours) intactes
13. Bouton Télécharger visible aussi en desktop
14. Stepper : tous les statuts visibles
15. Console JS propre

> Note process : workflow PROPOSITION-CODE est maintenant LA méthode 
> standard pour les sujets techniques complexes. 3 succès consécutifs 
> (mobile-polish v1, v2, v3). À conserver.
>
> Nouvelle règle d'or ajoutée : AVANT chaque PR, vérifier que la PR 
> précédente est mergée sur main. Sinon Claude Code lira un état 
> "stale" et basera son analyse dessus.

---

### 📋 LISTE NOIRE — Pour les prochaines PR

**Suite mobile potentielle**
- PWA basique (manifest.json + service worker + icône installable) → 
  prochaine étape après ce merge
- Push notifications natives (Firebase Cloud Messaging + service worker 
  + netlify function)

**Autres**
- Enrichissement Centre d'aide : section "Comment faire pour..." (FAQ)
- Amélioration UX de la cloche (friction n°1 selon Master)
- Backup automatique (GitHub Actions, export Notion nightly)
- Intégration GitHub↔Sentry
- Protéger la branche main (require PR + no force push)
- 3 cartes Brand sans Sous-format : B09W, B19E, B09U (côté master)
- (Optionnel) Bouton "Réactiver cette version" sur versions annulées
- (Optionnel) Tour onboarding interactif au premier login

---

### 2026-06-03 — Mobile polish v2 + Feature Lieu tournage (branche `mobile-polish-v2`) MERGÉ
index.html 5499 → 5515 (+16). 3 CSS modifiés. PR cumule 5 corrections 
UX mobile (P1 filtres bandeau, P2 cards largeur, P3 modal-close, 
P4 stepper, P5 activité) + 1 feature Lieu tournage (2 boutons radio 
Studio/Extérieur dans fiche détail).

Incident Notion résolu : David disait "Checkbox", Master a confirmé 
en réalité Select 2 options ("Studio"/"Extérieur"). Décision finale : 
2 boutons radio .fmt-opt.

---

### 2026-06-01 — Mobile responsive (branche `mobile-polish`) MERGÉ
index.html 5499 lignes inchangé, 4 CSS modifiés. Diff ~75 lignes. 
WORKFLOW PROPOSITION-CODE utilisé pour la 1ère fois. 8 améliorations.

---

### 2026-06-01 — Vue Calendrier enrichie (branche `calendrier-v2`) MERGÉ
index.html 5405 → 5499 (+94). 6 enrichissements + J2.

---

### 2026-06-01 — Centre d'aide intégré (branche `page-aide`) MERGÉ
index.html 5287 → 5405 (+118). Modale plein écran avec accordéon.

---

### 2026-06-01 — Feature "Annuler cette version" (branche `annuler-version`) MERGÉ
index.html 5233 → 5287 (+54). Utilise Statut Select Active/Annulée. 
Modale showConfirmModal() réutilisable.

---

### 2026-06-01 — Features Brand v2 + UX (branche `features-brand-v2`) MERGÉ
index.html 5184 → 5233 (+49).

---

### 2026-05-29 — 3 bugs UX (branche `fix-bugs-ux`) MERGÉ
index.html 5172 → 5184 (+12).

---

### 2026-05-29 — Brouillons retours + Triple validation Brand MERGÉ
index.html 5106 → 5172 (+66).

---

### 2026-05-28 — Login optgroup + Renommage Montage + Réactivité MERGÉS

═══════════════════════════════════════════════════════════════
## RÔLES (workflow à 3 chats)
═══════════════════════════════════════════════════════════════
- **CHAT PILOTE** : prépare prompts, vérifie livrables, livre fichiers 
  validés + CONTEXT mis à jour. NE code PAS, NE push PAS.
- **CHAT MASTER** : opérations Notion via MCP + 2e avis produit.
- **CLAUDE CODE** : exécute le code. Ne pousse pas (403 perms). Peut 
  proposer en mode ANALYSE sans coder.
- **DAVID** : non-codeur. Colle prompts, upload GitHub, teste preview, 
  merge, clique "Synchroniser maintenant". Langue : français.

## WORKFLOWS

### Standard
1. Pilote prépare prompt précis (intention + emplacement, PAS DE CODE)
2. Claude Code : curl raw GitHub main → analyse → code
3. Claude Code livre fichier(s)
4. David envoie au pilote → vérif (wc -l, grep, node --check, 
   fonctions appelées, lecture diff)
5. Pilote livre fichiers + CONTEXT à jour
6. David push GitHub, ouvre PR, teste preview Netlify, merge si OK
7. David clique "Synchroniser maintenant" sur project knowledge

### Spécial — analyse de code complexe (workflow PROPOSITION-CODE) ⭐
Demander à Claude Code une PROPOSITION avant de coder :
- Diagnostic (points critiques dans le code)
- Priorisation (impact vs effort)
- Plan d'amélioration concret
- Risques/pièges
- Questions produit à trancher
Le Pilote intègre cette analyse à la sienne. **3 succès en 3 essais.**
À reproduire systématiquement pour les sujets techniques.

### Spécial — vérification donnée Notion ⭐
Si une décision pilote sur type de champ Notion est contredite par 
ce que voit Claude Code dans le code, NE PAS coder. Demander 
vérification au Master via Notion MCP.

## RÈGLES D'OR
- index.html dans project knowledge = SOURCE OFFICIELLE
- EQUIPE_FALLBACK = [] ; CHEF_PAR_DEFAUT = 'Benjamin'
- **PILOTE NE CODE PAS** : prompts en intentions, pas en code 
  (sinon biais Claude Code + risque de bug)
- À CHAQUE modif code, livrer AUSSI CONTEXT_REEL_MEDIA.md à jour
- Sur fichiers sensibles, JAMAIS merger sans (a) vérif pilote, 
  (b) test preview, (c) console JS propre
- ⚠️ node --check ne voit pas les fonctions non définies
- ⚠️ TOUJOURS demander le fichier à Claude Code après une modif
- Ne jamais coller en clair des codes d'accès / secrets
- TOUJOURS curl raw GitHub
- Ne JAMAIS pointer Claude Code vers une branche non encore poussée
- ⚠️ AVANT chaque PR : vérifier que la PR précédente est MERGÉE sur 
  main (sinon Claude Code lira un état "stale" et basera son analyse 
  dessus)

═══════════════════════════════════════════════════════════════
## PROJET
═══════════════════════════════════════════════════════════════
- App : Réel Média Production (suivi prod TV/vidéo)
- Architecture : index.html + 4 CSS séparés
- Repo : David-f10/reel-media-production
- Prod : reel-media-production.netlify.app
- Backend : netlify/functions/notion.js + netlify/functions/login.js
- Monitoring : Sentry (org rushup, EU)
- État du main après merge mobile-polish-v2 : 5515 lignes
- EN ATTENTE DE MERGE : `mobile-polish-v3` (5535 lignes + 3 CSS modifiés)

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
  - "Date tournage J1" (date) + "Date tournage J2" (date)
  - "Date de diffusion" (date) — peut être vidée depuis mobile-polish-v3
  - "Statut" contient "Montage" (pas "Montage V1")
- 📹 Versions : "Validation Brand" (Checkbox) + "Statut" (Select 
  Active/Annulée)

═══════════════════════════════════════════════════════════════
## CE QUI EST EN PROD
═══════════════════════════════════════════════════════════════
- ✅ Feature Brand ; Troncature titres ; Kanban 220px
- ✅ Refresh fiche détail ; Sentry ; Phase A
- ✅ Renommage Montage + Réactivité ; Login optgroup
- ✅ Brouillons retours internes + Triple validation Brand séquencier
- ✅ Fix 3 bugs UX (double V1, titre textarea, restriction Client)
- ✅ Features Brand v2 (5 features + inversion ordre boutons)
- ✅ Annuler cette version + modale custom réutilisable
- ✅ Centre d'aide intégré (showHelpModal)
- ✅ Vue Calendrier enrichie (studio, prochains tournages, filtres, J2)
- ✅ Mobile responsive (8 améliorations)
- ✅ Mobile polish v2 (5 corrections UX + Feature Lieu tournage)

**EN ATTENTE DE MERGE** : `mobile-polish-v3` (5 fix UX iPhone + 
retours équipe mobile + bouton Télécharger)

═══════════════════════════════════════════════════════════════
## NOTES TECHNIQUES UTILES
═══════════════════════════════════════════════════════════════
- ⚠️ Borne mobile : `@media(max-width:700px)`
- ⚠️ `grep -c` retourne code 1 si compte=0 → utiliser `|| true`
- ⚠️ node --check ne voit pas les fonctions non définies
- ⚠️ Inputs avec font-size < 16px déclenchent zoom auto iOS Safari → 
  base.css mobile force 16px
- ⚠️ Styles inline dans index.html → impossibles à override par CSS 
  @media. Externaliser en classe si besoin mobile.
- Vue active = appSetVue(currentVue), rendu LOCAL depuis `sujets`
- refreshUI(id) = appSetVue(currentVue) + refreshDetail(id) débouncé
- openDetail(id) lourde (~7 appels API)
- Helper escapeHtml(s) : défense XSS
- Verrous création : `_creerDecliEnCours` + `_creerVersionEnCours`
- Login : <select> natif #login-nom avec <optgroup>
- Rôles canoniques : ['Chef', 'Journaliste', 'Monteur', 'Brand']
- Statuts : Brief / Idée, Séquencier en cours, Séquencier validé, 
  En tournage, Post-prod, Montage, Retours, Validation chef, PAD
- Couleurs format : MAG bleu, Brand ambre, Face Cam rouge, Desk gris, 
  YouTube vert
- Journalistes : Julien, Augustin, Nico, Mickael, Juliette, Mathilde, 
  Léa, Sophie L., Éloise, Juliette B, David, Enrique C, Benjamin, 
  Alice Guionnet, Romain Canault, Camille, Hervé Grandchamp, Anne Burlot
- Chefs : Benjamin (défaut), Arnaud, Chloé. Monteurs : Thierry, David
- Brand : Arnaud C, Guillaume, Louise, Victor
- Modale custom : showConfirmModal({title, message, confirmText, 
  confirmStyle, onConfirm})
- Centre d'aide : showHelpModal() — accordéon natif <details>/<summary>
- Calendrier : variables d'état top (calMonth/Year/StudioOnly/FilterJournaliste). 
  Lit s.tourJ1 + s.tourJ2, s.lieuTour === 'Studio' (string strict)
- Lieu tournage : Select Notion 2 options "Studio"/"Extérieur". UI : 
  2 boutons .fmt-opt dans step Tournage, handler setLieuTour réutilise 
  upd() (toggle inclus)
- **Mobile (≤700px)** : bottom-nav 4 items (Dashboard/Production/
  Idées/Tâches) avec pastilles, panneau notif full-width, modale 
  détail padding réduit, bouton × tap-target 44px avec fond léger 
  (FIX B), inputs font-size:16px (anti zoom iOS), filtres statuts en 
  bandeau horizontal (position:fixed via .is-visible UNIQUEMENT sur 
  Production, helper setFiltersVisible), stepper masqué sauf .cur, 
  activité Dashboard compactée, kanban scroll-snap, versions en 
  colonne, vue retours équipe en colonne (lecteur en haut)
- **Vider une date** : bouton × dans .date-wrap (universel desktop + 
  mobile). Fonction clearDate(id, field, btnEl) vide l'input + PATCH 
  Notion null. Bouton visible uniquement si date définie.
- **Bouton Télécharger** : dans openPlayer (vue retours équipe), 
  visible si URL Drive. Fonction toDlUrl(url) transforme /view en 
  /uc?export=download&id={ID}. Style inline cohérent avec openPlayer.
- **clickNotif** : pas de re-navTo si déjà sur prod (50ms vs 350ms).
- **#sb-filters** : toggle propre via classList.toggle('is-visible'). 
  Sur mobile, position:fixed avec .has-filters sur .main-area pour 
  gérer le padding-top du contenu.

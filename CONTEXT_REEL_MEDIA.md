# PASSATION — Réel Média Production (contexte pilote)

> Dernière mise à jour : 2026-06-03

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

### 2026-06-03 — Hotfix bandeau filtres mobile (sur la branche `mobile-polish-v3`)
index.html 5535 → **5549 lignes** (+14). 1 CSS modifié (layout.css 250 lignes, +1 net).
Hotfix appliqué à la PR mobile-polish-v3 AVANT merge, suite à 2 bugs détectés en preview sur iPhone.

**BUG 1 — Bandeau filtres reste visible sur Idées/Tâches/Dashboard**
Reproduction : ouvrir Production (bandeau apparaît), cliquer Idées 
dans la bottom-nav → le bandeau reste visible alors qu'il devrait 
disparaître. Le toggle classList.toggle('is-visible') ne suffisait pas, 
probablement à cause d'un cache navigateur ou d'un sélecteur CSS résiduel.

**BUG 2 — Bandeau filtres chevauche les onglets vue sur Production**
Le top:calc(44px + 36px) = 80px était faux. Les vraies hauteurs mobile 
sont 44px (topbar) + ~33-34px (view-tabs). Le bandeau se positionnait 
par-dessus les onglets vue.

**Décision pilote (option B "sécurité")**
- Garder le DOM #sb-filters dans la sidebar (PAS de déplacement HTML)
- Garder position:fixed (le bandeau fait partie de la sidebar mobile 
  bottom-nav, fixed nécessaire pour le sortir du flux)
- Robustifier le toggle pour bug 1
- Positionner dynamiquement pour bug 2

**Le fix livré**

`setFiltersVisible(visible)` enrichie de 3 mécanismes redondants :
1. classList.toggle('is-visible', visible) — déjà en place
2. el.style.display = visible ? '' : 'none' — défense en profondeur 
   contre tout CSS résiduel
3. el.style.top = rect.bottom + 'px' — positionnement dynamique 
   basé sur getBoundingClientRect des view-tabs (mobile uniquement)

Reset el.style.top = '' quand non visible pour éviter style résiduel.

CSS layout.css : suppression de top:calc(44px + 36px) hardcodé du bloc 
#sb-filters.is-visible mobile, remplacé par commentaire indiquant que 
le top est calculé en JS.

**Avantages du positionnement dynamique**
Le top est mesuré au moment de l'affichage → robuste face aux 
variations de hauteur (zoom iOS, mode paysage, accessibility scaling). 
Le bandeau suit toujours la vraie position des view-tabs.

**Vérifs pilote OK**
- 5549 lignes index.html, node --check OK
- setFiltersVisible=5 (def + 4 appels) ✓
- getBoundingClientRect=1 (nouveau) ✓
- top:calc(44px=0 (hardcode retiré) ✓
- Tous les compteurs PR v3 intacts (clearDate=4, toDlUrl=2, 
  player-modal-body=1, player-modal-panel=1, has-filters=1, 
  Télécharger=2, nav-taches=1 in layout.css)
- Tous les acquis pre-v3 intacts (Brouillon=11, validationBrand=16, 
  setLieuTour=3, etc.)
- Tous les 7 compteurs préservation intacts

**À tester en preview** (Cmd+Shift+R ou onglet privé)
1. Ouvrir Production → bandeau visible JUSTE en-dessous des onglets vue 
   (sans chevauchement)
2. Cliquer Idées en bottom-nav → bandeau DISPARAÎT
3. Cliquer Tâches → bandeau toujours caché
4. Cliquer Dashboard → bandeau toujours caché
5. Revenir Production → bandeau réapparaît au bon endroit
6. Scroller dans Production → bandeau reste en haut (position:fixed)
7. Mode paysage → bandeau s'adapte (getBoundingClientRect re-mesure)

---

### 2026-06-03 — Mobile polish v3 : 5 fix UX iPhone + retours équipe mobile + bouton Télécharger (branche `mobile-polish-v3`)
index.html 5515 → 5535 lignes (+20). 3 CSS modifiés. Diff total ~88 lignes.
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
- Q2 (clearDate scope) : UNIVERSEL desktop + mobile
- Q3 (toggle filtres FIX C) : refactor via classList.toggle('is-visible')
- Q4 (ordre bottom-nav) : ordre HTML conservé (Dashboard / Production / 
  Idées / Tâches)
- Q5 (clickNotif) : version défensive

**Les 7 fix livrés**
FIX A — Bouton × pour vider les dates (J1 / J2 / Diffusion)
- Fonction réutilisable clearDate(id, field, btnEl)
- Wrapper .date-wrap avec .date-clear
- Visible UNIVERSEL (desktop + mobile)
- Bouton apparaît UNIQUEMENT si la date est définie
- Pas de confirm

FIX B — Bouton × visible quand on scroll mobile
- align-items:center, z-index:5, safe-area-inset-right (notch iPhone)
- Fond léger rgba(255,255,255,0.06) sur .modal-close

FIX C — Bandeau filtres : restructure complète via classList
- Helper setFiltersVisible(visible)
- 4 emplacements JS modifiés (utilisent helper au lieu de style.display)
- CSS mobile : display:none par défaut, display:flex avec .is-visible
- ⚠️ HOTFIX du même jour : robustification supplémentaire (cf. entrée 
  précédente "Hotfix bandeau filtres mobile")

FIX D — Bottom-nav 4 items (ajout Tâches)
- Whitelist CSS élargi
- Ordre HTML conservé : Dashboard / Production / Idées / Tâches

FIX E — clickNotif défensive
- Pas de re-navTo si déjà sur Production
- Délai 50ms vs 350ms selon contexte

FIX F — Layout retours équipe mobile
- 3 classes hook : .player-modal-body, .player-modal-stage, .player-modal-panel
- CSS mobile : flex-direction:column, lecteur 45vh en haut, panneau 55vh
- Desktop INCHANGÉ

FIX G — Bouton Télécharger dans openPlayer
- Fonction toDlUrl(url) — transformation /view en /uc?export=download
- Bouton ⬇ Télécharger sous "Envoyer →"
- Visible uniquement si URL Drive
- Visible desktop ET mobile

---

### 2026-06-03 — Mobile polish v2 + Feature Lieu tournage (branche `mobile-polish-v2`) MERGÉ
index.html 5499 → 5515 (+16). 3 CSS modifiés. PR cumule 5 corrections 
UX mobile + 1 feature Lieu tournage (2 boutons radio Studio/Extérieur).

Incident Notion résolu : David disait "Checkbox", Master a confirmé 
en réalité Select 2 options ("Studio"/"Extérieur").

---

### 2026-06-01 — Mobile responsive (branche `mobile-polish`) MERGÉ
4 CSS modifiés. Diff ~75 lignes. WORKFLOW PROPOSITION-CODE 1ère fois. 
8 améliorations.

---

### 2026-06-01 — Vue Calendrier enrichie (branche `calendrier-v2`) MERGÉ
+94 lignes. 6 enrichissements + J2.

---

### 2026-06-01 — Centre d'aide intégré (branche `page-aide`) MERGÉ
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

### Spécial — analyse de code complexe (workflow PROPOSITION-CODE) ⭐
Demander à Claude Code une PROPOSITION avant de coder. **4 succès 
en 4 essais.** À reproduire systématiquement pour les sujets techniques.

### Spécial — vérification donnée Notion ⭐
Si une décision pilote sur type de champ Notion est contredite par 
ce que voit Claude Code, demander vérification au Master via Notion MCP.

## RÈGLES D'OR (mises à jour 03/06)
- index.html dans project knowledge = SOURCE OFFICIELLE
- EQUIPE_FALLBACK = [] ; CHEF_PAR_DEFAUT = 'Benjamin'
- **PILOTE NE CODE PAS** : prompts en intentions, pas en code 
  (sinon biais Claude Code + risque de bug + code parfois non copiable 
  si mal formaté dans markdown imbriqué)
- À CHAQUE modif code, livrer AUSSI CONTEXT_REEL_MEDIA.md à jour
- Sur fichiers sensibles, JAMAIS merger sans (a) vérif pilote, 
  (b) test preview, (c) console JS propre
- ⚠️ node --check ne voit pas les fonctions non définies
- ⚠️ TOUJOURS demander le fichier à Claude Code après une modif
- TOUJOURS curl raw GitHub
- Ne JAMAIS pointer Claude Code vers une branche non encore poussée
- ⚠️ AVANT chaque PR : vérifier que la PR précédente est MERGÉE sur 
  main (sinon Claude Code lira un état "stale")
- Sur un sticky/fixed qui peut se comporter mal, **mesurer 
  dynamiquement** via getBoundingClientRect est souvent plus robuste 
  que hardcoder en CSS (cf. hotfix bandeau filtres)

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
- EN ATTENTE DE MERGE : `mobile-polish-v3` + hotfix (5549 lignes 
  + 3 CSS modifiés)

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
    + "Date de diffusion" (date) — vidable depuis mobile-polish-v3
  - "Statut" contient "Montage" (pas "Montage V1")
- 📹 Versions : "Validation Brand" (Checkbox) + "Statut" (Select 
  Active/Annulée)

═══════════════════════════════════════════════════════════════
## CE QUI EST EN PROD
═══════════════════════════════════════════════════════════════
- ✅ Feature Brand, Troncature, Kanban 220px
- ✅ Renommage Montage + Réactivité, Login optgroup
- ✅ Brouillons retours + Triple validation Brand
- ✅ 3 bugs UX, Features Brand v2 (5)
- ✅ Annuler version + showConfirmModal
- ✅ Centre d'aide intégré
- ✅ Vue Calendrier enrichie
- ✅ Mobile responsive (8 amélio)
- ✅ Mobile polish v2 (5 UX + Feature Lieu tournage)

**EN ATTENTE DE MERGE** : `mobile-polish-v3` + hotfix bandeau filtres 
(5549 lignes index.html + 3 CSS modifiés)

═══════════════════════════════════════════════════════════════
## NOTES TECHNIQUES UTILES
═══════════════════════════════════════════════════════════════
- ⚠️ Borne mobile : `@media(max-width:700px)`
- ⚠️ `grep -c` retourne code 1 si compte=0 → utiliser `|| true`
- ⚠️ node --check ne voit pas les fonctions non définies
- ⚠️ Inputs avec font-size < 16px déclenchent zoom auto iOS Safari → 
  base.css mobile force 16px
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
- Journalistes : Julien, Augustin, Nico, Mickael, Juliette, Mathilde, 
  Léa, Sophie L., Éloise, Juliette B, David, Enrique C, Benjamin, 
  Alice Guionnet, Romain Canault, Camille, Hervé Grandchamp, Anne Burlot
- Chefs : Benjamin (défaut), Arnaud, Chloé. Monteurs : Thierry, David
- Brand : Arnaud C, Guillaume, Louise, Victor
- Modale custom : showConfirmModal({title, message, confirmText, 
  confirmStyle, onConfirm})
- Centre d'aide : showHelpModal() — accordéon natif <details>/<summary>
- Calendrier : variables d'état top (calMonth/Year/StudioOnly/FilterJournaliste)
- Lieu tournage : Select Notion 2 options "Studio"/"Extérieur"
- **Mobile (≤700px)** : bottom-nav 4 items (Dashboard/Production/
  Idées/Tâches) avec pastilles, panneau notif full-width, modale 
  détail padding réduit, bouton × tap-target 44px avec fond léger, 
  inputs font-size:16px, **filtres statuts en bandeau horizontal 
  position:fixed avec top calculé en JS via getBoundingClientRect 
  (uniquement Production)**, stepper masqué sauf .cur, activité 
  Dashboard compactée, kanban scroll-snap, versions en colonne, 
  vue retours équipe en colonne (lecteur en haut)
- **Vider une date** : bouton × dans .date-wrap (universel desktop + 
  mobile). Fonction clearDate(id, field, btnEl).
- **Bouton Télécharger** : dans openPlayer (vue retours équipe), 
  visible si URL Drive. Fonction toDlUrl(url).
- **clickNotif** : pas de re-navTo si déjà sur prod (50ms vs 350ms).
- **#sb-filters mobile** : toggle propre via setFiltersVisible() avec 
  3 mécanismes redondants (classList + style.display + style.top 
  calculé en JS). Le top est mesuré dynamiquement via 
  getBoundingClientRect() pour éviter les calc CSS qui sont fragiles 
  face aux variations de hauteur (zoom, paysage, accessibility).

# PASSATION — Réel Média Production (contexte pilote)

> Dernière mise à jour : 2026-06-03

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

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
- Journalistes : Julien, Augustin, Nico, Mickael, Juliette, Mathilde, 
  Léa, Sophie L., Éloise, Juliette B, David, Enrique C, Benjamin, 
  Alice Guionnet, Romain Canault, Camille, Hervé Grandchamp, Anne Burlot
- Chefs : Benjamin (défaut), Arnaud, Chloé. Monteurs : Thierry, David
- Brand : Arnaud C, Guillaume, Louise, Victor

- **Mobile (≤700px)** : bottom-nav 4 items (Dashboard/Production/
  Idées/Tâches) avec pastilles, panneau notif full-width, modale 
  détail padding réduit, bouton × tap-target 44px avec fond léger, 
  inputs font-size:16px, **bandeau filtres statuts directement dans 
  le flux .main-area sous les view-tabs (PLUS dans la sidebar)** — 
  toggle 1 ligne via .is-visible, vue retours équipe en colonne 
  (lecteur 45vh haut, panneau 55vh bas)
- **Vider une date** : bouton × dans .date-wrap. Fonction 
  clearDate(id, field, btnEl).
- **Bouton Télécharger** : dans openPlayer si URL Drive. Fonction 
  toDlUrl(url) transforme /view en /uc?export=download.
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

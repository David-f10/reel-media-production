# PASSATION — Réel Média Production (contexte pilote)

> Ce fichier permet à un nouveau chat de reprendre le rôle de PILOTE sans perdre le contexte.
> Dernière mise à jour : 2026-06-03

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

### 2026-06-03 — Mobile polish v2 + Feature Lieu tournage (branche `mobile-polish-v2`)
index.html 5499 → **5515 lignes** (+16). 3 CSS modifiés (components, layout, 
views). Diff total ~71 lignes. PR cumule 5 corrections UX mobile + 1 feature
oubliée (Lieu tournage UI dans fiche détail).

**WORKFLOW PROPOSITION-puis-CODE utilisé pour la 2e fois.** Excellent résultat :
Claude Code a identifié des décisions techniques meilleures que celles du
Pilote (notamment garder le DOM #sb-filters en place et utiliser position:fixed
pour le détacher visuellement plutôt que de déplacer le DOM — zéro risque
desktop).

**INCIDENT NOTION RÉSOLU AVANT CODE** : David avait initialement répondu
"Checkbox" au type du champ "Lieu tournage". Claude Code a remarqué une
incohérence dans le code et demandé vérification. Master interrogé via
Notion MCP, a confirmé que c'est en fait un **SELECT à 2 options** :
"Studio" (purple) et "Extérieur" (avec accent, blue). Décision Pilote
finale : 2 boutons radio Studio/Extérieur (pattern .fmt-opt cohérent avec
le format MAG/Brand/Face Cam/etc.).

**Décisions produit prises (3 questions répondues par David)**
- Q1 (stepper masqué mobile) : option (a), accepter perte transition 
  manuelle (transitions auto suffisent)
- Q2 (filtres statuts mobile) : option (a), bandeau horizontal scrollable 
  sous les onglets vue
- Q3 (largeur cartes) : audit COMPLET, toutes les vues

**Les 6 améliorations livrées**

P1 — FILTRES STATUTS REPOSITIONNÉS (mobile)
- DOM #sb-filters INCHANGÉ (reste dans la sidebar)
- Sur mobile, position:fixed l'arrache visuellement et le place sous les 
  view-tabs (top:calc(44px + 36px))
- Pillules horizontales scrollables (border-radius:999px)
- Toggle JS modifié : .style.display='' au lieu de 'block' pour laisser 
  le CSS reprendre la main sur mobile
- main-content reçoit padding-top:12px et perd 40px pour laisser place 
  au bandeau

P2 — LARGEUR DES CARTES (toutes vues)
- .cards{width:100%}, .card{max-width:100%;min-width:0;overflow:hidden}
- .card>*{min-width:0;max-width:100%} : neutralise les enfants qui 
  forçaient une largeur intrinsèque

P3 — BOUTON × ESPACÉ DU BORD
- .modal-hdr{padding:14px 20px 14px 16px} sur mobile
- .modal-close{min-width:44px;min-height:44px;display:flex;align-items:center;
  justify-content:center} : tap-target Apple HIG conforme

P4 — STEPPER MASQUÉ SAUF .CUR (mobile)
- .stepper .st-btn:not(.cur){display:none}
- .stepper{padding:8px 16px;justify-content:flex-start}
- Seul le statut courant visible sur mobile
- Pas de modif JS, pur CSS

P5 — ACTIVITÉ RÉCENTE COMPACTÉE (mobile)
- .activite-item padding 8px/12px, align-items:flex-start
- .activite-icon réduit (font 14px, width 18px)
- .activite-msg font 11px, line-height 1.35
- Barre de progression masquée (.activite-msg>div:last-child{display:none})
- .activite-heure font 9px en haut

FEATURE LIEU TOURNAGE (sujet B)
- Champ Notion "Lieu tournage" est un SELECT 2 options : "Studio" / "Extérieur"
- UI : 2 boutons radio (.fmt-opt) dans le step Tournage de la fiche détail
- Handler `setLieuTour(sujetId, valeur)` : 7 lignes, réutilise upd() 
  existante (qui gère PATCH Notion + toast + maj locale s.lieuTour + 
  refreshUI). Pattern de toggle inclus (recliquer le bouton sélectionné 
  vide la valeur).
- Visible sur tous les écrans (desktop + mobile), pas de garde de rôle
- Modifiable à tout moment
- Durcissement Calendrier : 6 occurrences `s.lieuTour` truthy passent 
  en `=== 'Studio'` pour cohérence stricte avec Notion select

**Architecture des changements**
- 3 fichiers CSS modifiés : components.css (+8), layout.css (+17), 
  views.css (+6)
- Aucune nouvelle media query : extension des @media existantes
- Pas de modif fonction upd() (réutilisation)
- Pattern .fmt-opt réutilisé pour Studio/Extérieur (cohérent format)

**Vérifs pilote OK**
- 5515 lignes index.html, node --check OK
- setLieuTour=3 (def + 2 onclicks) ✓
- Lieu tournage=3 (lecture pr + map upd + bonus) ✓
- 6 occurrences calendrier durcies en `=== 'Studio'` ✓
- 7 compteurs préservation intacts
- Toutes classes mobile-polish (notif-panel, version-actions-row, etc.) 
  préservées
- 4 fichiers CSS (base inchangé, autres modifiés proprement)

**À tester en preview** (incognito + Cmd+Shift+R)

🧪 **TEST SUR VRAI MOBILE** (PRIORITAIRE)
1. **Filtres statuts** : visibles en bandeau scrollable sous les onglets 
   vue (Cartes/Statut/Journaliste/Liste/Calendrier). Pillules rondes 
   ambiantes/red-dim si actif.
2. **Cartes** : ne débordent plus, toutes vues OK (Production, Idées, 
   et leurs sous-vues)
3. **Bouton ×** : zone tactile généreuse, plus de risque clic accidentel
4. **Fiche détail** : un seul statut visible (le courant), reste masqué
5. **Activité Dashboard** : compacte, lisible

🧪 **NOUVELLE FEATURE LIEU TOURNAGE**
6. Ouvrir une carte → section Tournage → 2 boutons "🎬 Studio" et 
   "🌳 Extérieur" visibles
7. Cliquer Studio → bouton se met en .sel (rouge), valeur sauvée Notion
8. Cliquer Extérieur → bascule, Studio se désélectionne, Extérieur 
   se sélectionne
9. Recliquer le bouton actif → la valeur est vidée (toggle)
10. Vue Calendrier reflète immédiatement : badge 🎬 sur les jours studio, 
    fond ambre, fonctionne avec filtre "Studio seulement"
11. Tout fonctionne sur desktop ET mobile

🧪 **RÉGRESSION**
12. Stepper sur desktop : tous les statuts toujours visibles
13. Validations / Annulation version / Centre d'aide / Calendrier : intacts
14. Console JS propre

> Note process : workflow PROPOSITION-CODE confirmé excellent. À reproduire 
> systématiquement pour les sujets techniques où l'analyse du code existant 
> est cruciale.
> 
> Note de transparence : Claude Code a signalé que "Valider tous les retours" 
> = 3 occurrences au lieu de 2 dans le CONTEXT. C'est une erreur de comptage 
> dans le CONTEXT précédent (la fonction est définie 1× + invoquée 2× = 3 
> depuis PR features-brand-v2). Compteur corrigé ici.

---

### 📋 LISTE NOIRE — Pour les prochaines PR

**Suite mobile potentielle**
- PWA basique (manifest.json + service worker + icône installable) 
  → étape 2 du plan mobile
- Push notifications natives (Firebase Cloud Messaging + service worker 
  + netlify function) → étape 3 du plan mobile, jugée trop complexe pour 
  le bénéfice immédiat

**Autres**
- Enrichissement Centre d'aide : section "Comment faire pour..." (FAQ 
  d'actions concrètes : ajouter version, créer décli, valider, etc.)
- Amélioration UX de la cloche (la friction n°1 selon Master)
- Backup automatique (GitHub Actions, export Notion nightly)
- Intégration GitHub↔Sentry
- Protéger la branche main (require PR + no force push)
- 3 cartes Brand sans Sous-format : B09W, B19E, B09U (côté master)
- (Optionnel) Bouton "Réactiver cette version" sur versions annulées
- (Optionnel) Tour onboarding interactif au premier login

---

### 2026-06-01 — Mobile responsive (branche `mobile-polish`) MERGÉ
index.html 5499 lignes inchangé, 4 CSS modifiés. Diff ~75 lignes. 
**WORKFLOW PROPOSITION-puis-CODE utilisé pour la 1ère fois** : 
Claude Code a identifié bug iOS critique (zoom auto sur inputs <16px) 
que le Pilote avait raté.

8 améliorations livrées : H (zoom iOS), C (notif panel responsive), 
A (padding modale réduit), D (bottom-nav 3 items + badges réaffichés), 
E (version-actions-row colonne mobile), B (brand-seq-actions min-width:0), 
G (next-shoot-item grille 2 col), F (kanban scroll-snap-x mandatory).

4 nouvelles classes créées et utilisées : notif-panel, version-actions-row, 
next-shoot-item, brand-seq-actions.

---

### 2026-06-01 — Vue Calendrier enrichie (branche `calendrier-v2`) MERGÉ
index.html 5405 → 5499 (+94). 6 enrichissements + prise en compte du J2. 
Badge 🎬 Studio + fond ambre, toggle "Studio seulement", liste 
"Prochains tournages", compteur, filtre par journaliste dynamique.

---

### 2026-06-01 — Centre d'aide intégré (branche `page-aide`) MERGÉ
index.html 5287 → 5405 (+118). Modale plein écran via "?" dans le header. 
5 sections en accordéon natif. Fonction showHelpModal().

---

### 2026-06-01 — Feature "Annuler cette version" (branche `annuler-version`) MERGÉ
index.html 5233 → 5287 (+54). Bouton "❌ Annuler" sur cartes Brand. 
Utilise le champ Statut (Active/Annulée). Modale custom showConfirmModal() 
réutilisable.

---

### 2026-06-01 — Features Brand v2 + UX (branche `features-brand-v2`) MERGÉ
index.html 5184 → 5233 (+49). 5 features + inversion ordre boutons 
(Chef d'abord, Brand après).

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
- **CHAT MASTER** : opérations Notion via MCP + 2e avis produit. Un SEUL 
  chat écrit dans Notion = le master.
- **CLAUDE CODE** : exécute le code. Ne pousse pas (403 perms). Peut 
  proposer en mode ANALYSE sans coder.
- **DAVID** : non-codeur. Colle prompts, upload GitHub, teste preview, 
  merge, clique "Synchroniser maintenant". Langue : français.

**Note importante** : aucun chat ne peut parler à un autre. David est 
le pont.

## WORKFLOWS

### Standard
1. Pilote prépare prompt précis (intention + emplacement)
2. Claude Code : curl raw GitHub main → analyse → code
3. Claude Code livre fichier(s)
4. David envoie au pilote → vérif (wc -l, grep, node --check, fonctions 
   appelées, lecture diff)
5. Pilote livre fichiers + CONTEXT à jour
6. David push GitHub, ouvre PR, teste preview Netlify, merge si OK
7. David clique "Synchroniser maintenant" sur project knowledge

### Spécial — grosses PR / environnement instable
Découper en INCRÉMENTS VÉRIFIÉS (3 à 5).

### Spécial — décisions produit complexes
Consulter Master en parallèle pour un 2e avis produit.

### Spécial — analyse de code complexe (workflow PROPOSITION-CODE) ⭐
Demander à Claude Code une PROPOSITION avant de coder :
- Diagnostic (points critiques dans le code)
- Priorisation (impact vs effort)
- Plan d'amélioration concret
- Risques/pièges
- Questions produit à trancher
Le Pilote intègre cette analyse à la sienne. **2 succès en 2 utilisations**
(mobile-polish : bug iOS identifié ; mobile-polish-v2 : décisions techniques
supérieures, notamment garder DOM en place + position:fixed). À reproduire
systématiquement pour les sujets techniques.

### Spécial — vérification donnée Notion ⭐
Si une décision pilote sur type de champ Notion est CONTREDITE par ce
que voit Claude Code dans le code, NE PAS coder. Demander vérification
au Master via Notion MCP. Cas réel : "Lieu tournage" annoncé checkbox
par David, en fait Select à 2 options confirmé par Master.

## RÈGLES D'OR
- index.html dans project knowledge = SOURCE OFFICIELLE
- EQUIPE_FALLBACK = [] ; CHEF_PAR_DEFAUT = 'Benjamin'
- À CHAQUE modif code, livrer AUSSI CONTEXT_REEL_MEDIA.md à jour
- Sur fichiers sensibles, JAMAIS merger sans (a) vérif pilote, 
  (b) test preview, (c) console JS propre
- ⚠️ node --check ne voit pas les fonctions non définies
- ⚠️ TOUJOURS demander le fichier à Claude Code après une modif
- Ne jamais coller en clair des codes d'accès / secrets
- Si Claude Code dépasse 30 min sans livrer → message STOP+statut
- TOUJOURS curl raw GitHub
- Ne JAMAIS pointer Claude Code vers une branche non encore poussée 
  sur GitHub
- ⚠️ AVANT chaque PR : vérifier que la PR précédente est MERGÉE sur main 
  (sinon Claude Code lira un état "stale")

═══════════════════════════════════════════════════════════════
## PROJET
═══════════════════════════════════════════════════════════════
- App : Réel Média Production (suivi prod TV/vidéo)
- Architecture : index.html + 4 CSS séparés (base/layout/components/views)
- Repo : David-f10/reel-media-production
- Prod : reel-media-production.netlify.app
- Backend : netlify/functions/notion.js + netlify/functions/login.js
- Monitoring : Sentry (org rushup, EU)
- État du main après merge mobile-polish : 5499 lignes
- EN ATTENTE DE MERGE : `mobile-polish-v2` (5515 lignes + 3 CSS modifiés)

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
  - **"Lieu tournage" (Select : "Studio" / "Extérieur")** ⚠️ Pas un Checkbox !
  - "Date tournage J1" (date) + "Date tournage J2" (date)
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
- ✅ Features Brand v2 (5 features + inversion ordre boutons par version)
- ✅ Annuler cette version + modale custom réutilisable
- ✅ Centre d'aide intégré (showHelpModal)
- ✅ Vue Calendrier enrichie (studio, prochains tournages, filtres, J2)
- ✅ Mobile responsive (8 améliorations : zoom iOS, notif panel, bottom-nav 
  3 items + badges, etc.)

**EN ATTENTE DE MERGE** : `mobile-polish-v2` (5 corrections UX mobile + 
feature Lieu tournage UI dans fiche détail)

═══════════════════════════════════════════════════════════════
## NOTES TECHNIQUES UTILES
═══════════════════════════════════════════════════════════════
- ⚠️ Borne mobile : `@media(max-width:700px)` (cohérent dans tout le projet)
- ⚠️ `grep -c` retourne code 1 si compte=0 → utiliser `|| true`
- ⚠️ node --check ne voit pas les fonctions non définies
- ⚠️ Inputs avec font-size < 16px déclenchent zoom auto iOS Safari → 
  base.css mobile force 16px
- ⚠️ Styles inline dans index.html → impossibles à override par CSS @media. 
  Externaliser en classe si besoin mobile.
- Vue active = appSetVue(currentVue), rendu LOCAL depuis `sujets`, zéro API
- refreshUI(id, forcePadOpen) = appSetVue(currentVue) + refreshDetail(id) 
  débouncé
- openDetail(id) lourde (~7 appels API)
- Helper escapeHtml(s) : défense XSS
- Titre fiche détail (#d-titre-input) : <textarea> auto-grow
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
- Handler validations séquencier : toggleValidationSeq(id, type)
- Handler validation par version : toggleVersionValidationBrand(...)
- Handler annulation version : annulerVersion(versionId, sujetId, versionNum)
- toggleVersionValidee : (versionId, sujetId, versionNum, wasValidee, url)
- creerDeclinaison : (parentId, formatDecli='Desk')
- Modale custom : showConfirmModal({title, message, confirmText, 
  confirmStyle, onConfirm})
- Centre d'aide : showHelpModal() — accordéon natif <details>/<summary>
- Calendrier : variables d'état top (calMonth/Year/StudioOnly/FilterJournaliste). 
  Helpers calToggleStudio(), calSetJournaliste(). Lit s.tourJ1 + s.tourJ2, 
  s.lieuTour === 'Studio' (string strict après PR mobile-polish-v2)
- **Lieu tournage** : Select Notion 2 options "Studio"/"Extérieur" (pas 
  checkbox). UI : 2 boutons .fmt-opt dans step Tournage, handler 
  `setLieuTour(sujetId, valeur)` qui réutilise upd() existante (toggle 
  inclus, recliquer le bouton actif vide la valeur).
- **Mobile (≤700px)** : bottom-nav 3 items (Production/Idées/Dashboard) 
  avec pastilles, panneau notif full-width, modale détail padding réduit, 
  bouton × tap-target 44px, inputs font-size:16px (anti zoom iOS), 
  filtres statuts en bandeau horizontal scrollable (position:fixed), 
  stepper masqué sauf .cur, activité Dashboard compactée, kanban 
  scroll-snap, versions en colonne

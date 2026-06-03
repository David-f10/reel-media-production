# PASSATION — Réel Média Production (contexte pilote)

> Ce fichier permet à un nouveau chat de reprendre le rôle de PILOTE sans perdre le contexte.
> Dernière mise à jour : 2026-06-01

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

### 2026-06-01 — Mobile responsive complet (branche `mobile-polish`)
index.html 5499 lignes (inchangé en taille, seuls quelques styles inline 
externalisés en classes). 4 fichiers CSS modifiés. Diff total ~75 lignes 
réparties dans les CSS.

**WORKFLOW INNOVANT utilisé** : David a demandé à Claude Code de FAIRE 
SA PROPRE ANALYSE en mode PROPOSITION avant de coder. Son analyse était 
meilleure que celle du Pilote sur 3 points clés (bug iOS critique font-size 
< 16px, panneau notif fixe 340px qui cassait sur petits écrans, 174 onclick 
inline + 17 styles inline qui empêchent override CSS). Le Pilote a 
intégré son analyse et tranché les questions produit.

**Décisions produit prises (3 questions répondues par David)**
- Q1 (bottom-nav) : 3 items uniquement : Production / Idées / Dashboard
- Q2 (notif panel) : option (b) panneau ATTACHÉ en haut
- Q3 (scope) : PACK COMPLET = 8 améliorations (4 quick wins + 4 enrichissements)

**Les 8 améliorations livrées**

QUICK WINS (impact maximum)
- **H** — Zoom iOS prévenu : font-size:16px sur input/select/textarea/etc 
  uniquement sur mobile (≤700px). Le 12px desktop reste. Évite le bug 
  Apple où un input <16px déclenche le zoom auto au focus.
- **C** — Notif panel responsive : externalisation du style inline en 
  classe `.notif-panel` + media query mobile (top:52px, right:0, left:0, 
  width:auto, max-height:300px, border-radius:0).
- **A** — Padding modale détail réduit sur mobile : `.modal-hdr` 
  18×22→14×16, `.step-hdr` 14×22→12×16, `.step-body` 22→16.
- **D** — Bottom-nav réduite à 3 items (Production/Idées/Dashboard) + 
  badges réaffichés (position:absolute, pastille rouge avec fond 
  var(--red), font-size:8px, min-width:14px).

ENRICHISSEMENTS
- **E** — `.version-actions-row` : sur mobile, passe en flex-direction:column 
  pour que Responsable + boutons validation prennent toute la largeur.
- **B** — `.brand-seq-actions .nav-btn` : min-width:0;flex-basis:30% pour 
  que les 3 boutons validation Brand tiennent sur une ligne même à 320px.
- **G** — `.next-shoot-item` : layout grille 2 colonnes sur mobile pour 
  la liste "Prochains tournages" (date sur 1 ligne span 2, code+J1 + 
  titre en ligne 2, lieu + journaliste en ligne 3).
- **F** — Kanban scroll-snap-x mandatory + scroll-snap-align:start sur 
  les colonnes. Navigation horizontale du kanban fluide sur mobile.

**Architecture des changements**
- 4 nouvelles classes créées : `.notif-panel` (déjà existait, externalisée), 
  `.version-actions-row`, `.next-shoot-item`, `.brand-seq-actions`
- Toutes les classes ont leur définition CSS ET sont utilisées dans 
  index.html (pas de classe orpheline).
- Borne mobile : 700px (cohérent avec l'existant)
- Au-dessus de 700px : DESKTOP INTACT, zéro régression.
- 6 media queries au total dans les 4 CSS.

**Vérifs pilote OK**
- 5499 lignes index.html, node --check OK
- Toutes les nouvelles classes définies ET utilisées
- 7 compteurs préservation tous intacts
- 18 compteurs récents (acquis PR précédentes) tous intacts
- 4 fichiers CSS modifiés : base, components, layout, views
- Diff total ~75 lignes (en dessous des 80-120 attendus = bonus)

**À tester en preview** (incognito + Cmd+Shift+R)

🧪 **TEST SUR VRAI MOBILE** (PRIORITAIRE)
Ouvrir reel-media-production.netlify.app/preview sur ton iPhone/Android.

1. **Zoom iOS prévenu** : modifier un titre de carte → pas de zoom intempestif
2. **Bottom-nav 3 items** : Production / Idées / Dashboard visibles 
   avec icônes 20px et label en dessous
3. **Badges sur bottom-nav** : pastille rouge avec nombre visible en 
   haut à droite de l'icône Production
4. **Modale fiche détail** : padding réduit, plus d'espace pour le contenu
5. **Panneau notif** : full-width, attaché sous la nav (pas de scroll-x 
   du body)
6. **Versions** : Responsable + boutons en colonne sur mobile, boutons 
   prennent toute la largeur
7. **Validation Brand séquencier** : 3 boutons sur une ligne même à 320px
8. **Liste Prochains tournages** : 2 colonnes grille, lisible
9. **Kanban scroll-snap** : on s'arrête naturellement sur les colonnes

🧪 **TEST SUR DESKTOP**
1. Toutes les vues précédentes inchangées
2. Validations, retours, calendrier, centre d'aide intacts
3. Console JS propre

> Note process : workflow PROPOSITION-puis-CODE utilisé pour la première 
> fois. Très efficace. À reproduire pour les sujets complexes où l'analyse 
> du code existant est cruciale.

---

### 📋 LISTE NOIRE — Pour les prochaines PR

Plus rien de critique. Si besoin futur :

**Suite mobile (potentielle)**
- PWA basique (manifest.json + service worker + icône installable)
- Push notifications natives (nécessite Firebase Cloud Messaging + 
  netlify function + service worker avancé)

**Autres**
- Enrichissement Centre d'aide : section "Comment faire pour..." (FAQ 
  d'actions concrètes)
- Amélioration UX de la cloche (la friction n°1 selon Master)
- Backup automatique (GitHub Actions, export Notion nightly)
- Intégration GitHub↔Sentry
- Protéger la branche main (require PR + no force push)
- 3 cartes Brand sans Sous-format : B09W, B19E, B09U (côté master)
- (Optionnel) Bouton "Réactiver cette version" sur versions annulées
- (Optionnel) Tour onboarding interactif au premier login

---

### 2026-06-01 — Vue Calendrier enrichie (branche `calendrier-v2`) MERGÉ
index.html 5405 → 5499 (+94). 6 enrichissements + prise en compte du J2 
de tournage : badge 🎬 Studio + fond ambre, toggle "Studio seulement", 
liste "Prochains tournages" sous le calendrier, compteur en haut, 
filtre par journaliste dynamique.

---

### 2026-06-01 — Centre d'aide intégré (branche `page-aide`) MERGÉ
index.html 5287 → 5405 (+118). Modale plein écran accessible via "?" 
dans le header. 5 sections en accordéon natif `<details>`/`<summary>`. 
Fonction `showHelpModal()`. Contenu statique.

---

### 2026-06-01 — Feature "Annuler cette version" (branche `annuler-version`) MERGÉ
index.html 5233 → 5287 (+54). Bouton "❌ Annuler cette version" sur 
cartes Brand après les 2 validations. Champ "Statut" (Active/Annulée) 
existant utilisé. Modale custom réutilisable `showConfirmModal()`.

---

### 2026-06-01 — Features Brand v2 + UX (branche `features-brand-v2`) MERGÉ
index.html 5184 → 5233 (+49). 5 features + inversion ordre boutons par 
version (Chef d'abord, Brand après).

---

### 2026-05-29 — 3 bugs UX (branche `fix-bugs-ux`) MERGÉ
index.html 5172 → 5184 (+12).

---

### 2026-05-29 — Brouillons retours internes + Triple validation Brand MERGÉ
index.html 5106 → 5172 (+66).

---

### 2026-05-28 — Login optgroup + Renommage Montage + Réactivité MERGÉS

═══════════════════════════════════════════════════════════════
## RÔLES (workflow à 3 chats)
═══════════════════════════════════════════════════════════════
- **CHAT PILOTE** : prépare prompts, vérifie livrables, livre fichiers 
  validés + CONTEXT mis à jour. NE code PAS, NE push PAS.
- **CHAT MASTER** : opérations Notion via MCP + 2ème avis produit. Un 
  SEUL chat écrit dans Notion = le master.
- **CLAUDE CODE** : exécute le code. Ne pousse pas (403 perms). 
  Peut aussi proposer en mode ANALYSE sans coder.
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
Consulter Master en parallèle pour avoir un 2ème avis produit.

### Spécial — analyse de code complexe (NOUVEAU)
Demander à Claude Code une PROPOSITION avant de coder :
- Diagnostic (points critiques dans le code)
- Priorisation (impact vs effort)
- Plan d'amélioration concret
- Risques/pièges
- Questions produit à trancher
Le Pilote intègre cette analyse à la sienne. Très utile pour sujets 
techniques où le contexte code est crucial.

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

═══════════════════════════════════════════════════════════════
## PROJET
═══════════════════════════════════════════════════════════════
- App : Réel Média Production (suivi prod TV/vidéo)
- Architecture : index.html + 4 CSS séparés (base/layout/components/views)
- Repo : David-f10/reel-media-production
- Prod : reel-media-production.netlify.app
- Backend : netlify/functions/notion.js + netlify/functions/login.js
- Monitoring : Sentry (org rushup, EU)
- État du main après merge calendrier-v2 : 5499 lignes
- EN ATTENTE DE MERGE : `mobile-polish` (5499 lignes index + 4 CSS modifiés)

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
  (select) + "Lieu tournage" (checkbox) + "Date tournage J1" (date) + 
  "Date tournage J2" (date)
- 📹 Versions : "Validation Brand" (checkbox) + "Statut" (select 
  Active/Annulée)

═══════════════════════════════════════════════════════════════
## CE QUI EST EN PROD
═══════════════════════════════════════════════════════════════
- ✅ Feature Brand ; Troncature titres ; Kanban 220px
- ✅ Refresh fiche détail
- ✅ Sentry ; Phase A
- ✅ Renommage Montage + Réactivité
- ✅ Login optgroup
- ✅ Brouillons retours internes + Triple validation Brand séquencier
- ✅ Fix 3 bugs UX (double V1, titre textarea, restriction Client)
- ✅ Features Brand v2 (5 features + inversion ordre boutons par version)
- ✅ Annuler cette version + modale custom réutilisable
- ✅ Centre d'aide intégré (showHelpModal)
- ✅ Vue Calendrier enrichie (studio, prochains tournages, filtres, J2)

**EN ATTENTE DE MERGE** : `mobile-polish` (8 améliorations mobile, 4 CSS modifiés)

═══════════════════════════════════════════════════════════════
## NOTES TECHNIQUES UTILES
═══════════════════════════════════════════════════════════════
- ⚠️ Borne mobile : `@media(max-width:700px)` (cohérent dans tout le projet)
- ⚠️ `grep -c` retourne code 1 si compte=0 → utiliser `|| true`
- ⚠️ node --check ne voit pas les fonctions non définies
- ⚠️ Inputs avec font-size < 16px déclenchent zoom auto iOS Safari → 
  base.css mobile force 16px
- ⚠️ Beaucoup de styles inline dans index.html → impossibles à override 
  par CSS @media. Si une zone mobile pose problème, l'externaliser en 
  classe au passage.
- Vue active = appSetVue(currentVue), rendu LOCAL depuis `sujets`, zéro API
- refreshUI(id, forcePadOpen) = appSetVue(currentVue) + refreshDetail(id) 
  débouncé
- openDetail(id) lourde (~7 appels API)
- Helper escapeHtml(s) : défini ligne 504, défense XSS
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
  confirmStyle, onConfirm}) — confirmStyle:'danger' = rouge
- Centre d'aide : showHelpModal() — accordéon natif <details>/<summary>
- Calendrier : variables d'état top (calMonth/Year/StudioOnly/FilterJournaliste). 
  Helpers calToggleStudio(), calSetJournaliste(). Lit s.tourJ1 + s.tourJ2 
  (label J1/J2 si 2 définis), s.lieuTour (badge 🎬 + fond ambre + filtre)
- **Mobile (≤700px)** : bottom-nav 3 items (Production/Idées/Dashboard) 
  avec pastilles, panneau notif full-width, modale détail padding réduit, 
  inputs font-size:16px (anti zoom iOS), versions en colonne, kanban 
  scroll-snap

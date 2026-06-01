# PASSATION — Réel Média Production (contexte pilote)

> Ce fichier permet à un nouveau chat de reprendre le rôle de PILOTE sans perdre le contexte.
> Dernière mise à jour : 2026-06-01

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

### 2026-06-01 — Centre d'aide intégré (branche `page-aide`)
index.html 5287 → **5405 lignes** (+118). PR ciblée : 1 feature complète
livrée d'une traite. Espace d'aide accessible depuis l'app pour guider 
les utilisateurs (journalistes, chefs, brand, monteurs).

**Décisions produit** (validées avec Master en perspective produit) :
- Master conseillait initialement "ne rien coder, faire une vidéo Loom"
  car "personne ne lit les pages d'aide". David a tranché pour combiner
  les 2 : centre d'aide intégré + presse (annonce externe).
- Format : modale custom plein écran (max 800px × 85vh, scroll interne)
- Accès : bouton "?" dans le header, à gauche de la cloche, même style
- Structure : accordéon avec 5 sections (Master conseillait 4-5 ciblés,
  on a fait 5 couvrant tout le périmètre de la plateforme)
- Implémentation accordéon : `<details>`/`<summary>` natifs HTML 
  (accessibilité gratuite, pas de JS d'état nécessaire)

**Les 5 sections couvrent** :
1. 🚪 Premiers pas (login + vues + premier pas)
2. 🎬 Les cartes et leurs codes (M/B/F/D/Y, format codes)
3. 👥 Mon rôle (4 sous-sections : Journaliste/Chef/Brand/Monteur)
4. 💬 Retours vs Commentaires (avec astuce Brouillon pour chefs)
5. 🔔 La cloche : quand c'est mon tour (types de notifs)

**Ce qui a été implémenté**
- **Bouton "?"** dans header, style identique à la cloche, placé À GAUCHE
  de la cloche (ordre : [?] [🔔])
- **showHelpModal()** : nouvelle fonction qui construit et affiche la
  modale
- **Modale plein écran responsive** : overlay rgba(0,0,0,0.7), container
  max 800px × 85vh, fond var(--bg2), border var(--border2), rl
- **Accordéon natif** via `<details>`/`<summary>` : Section 1 ouverte
  par défaut (attribut `open`), autres repliées
- **Fermeture** : bouton ×, clic sur overlay externe, touche Échap
- **Contenu statique** : tous les textes en dur, pas besoin d'escapeHtml,
  pas d'injection possible

**Compteur Brouillon** est passé de 10 à 11 : le mot apparaît une fois
de plus dans le contenu de la section 4 du Centre d'aide ("un retour
Source='Équipe' peut être en mode 'Brouillon'"). C'est du contenu d'aide
légitime, aucun acquis fonctionnel n'a bougé.

**Vérifs pilote OK**
- 5405 lignes, node --check OK, toutes fonctions appelées définies
- showHelpModal=2 (def + onclick) ✓
- Centre d'aide=2 (title bouton + titre modale) ✓
- Titres des 5 sections : tous présents 1 fois chacun ✓
- Tous acquis features-brand-v2 + annuler-version + précédents intacts
- 7 compteurs de préservation tous intacts

**À tester en preview** (incognito + Cmd+Shift+R) :
1. Bouton "?" visible en haut à droite, à gauche de la cloche
2. Clic → modale s'ouvre, fond assombri
3. Section 1 "Premiers pas" déjà dépliée
4. Clic sur titre de section → déplie/replie son contenu
5. Bouton "×" → ferme la modale
6. Clic en dehors de la modale → ferme la modale
7. Touche Échap → ferme la modale
8. Contenu lisible et cohérent avec ton rôle
9. Console JS propre

**Pour la "presse" (annonce externe)**
Une fois la PR mergée, David peut envoyer un message à l'équipe
(Slack/mail) qui reprend le même contenu pour aligner tout le monde
sur le fonctionnement de la plateforme. Le contenu de la presse est
identique aux 5 sections du Centre d'aide (= une seule source de vérité).

Template suggéré (à ajuster par David) :
- Tour d'horizon de l'outil
- Explication des codes (M654, B41A, etc.)
- Workflow par rôle
- Différence Retours/Commentaires
- Explication de la cloche
- Mention du Centre d'aide pour référence permanente

---

### 📋 LISTE NOIRE — Pour les prochaines PR
Plus rien de critique en attente. Si besoin futur :
- Amélioration UX de la cloche (Master a identifié que c'était la
  friction n°1 : les gens ne comprennent pas quand c'est leur tour).
  Pistes : message plus explicite "À TOI de [valider/corriger]",
  badge plus visible sur cartes avec action attendue, filtre
  "Mes actions à faire" dans le kanban.
- Backup automatique (GitHub Actions, export Notion nightly)
- Intégration GitHub↔Sentry
- (Optionnel) Régénérer les codes d'accès des 5 nouveaux + des 4 Brand
- (Optionnel) Protéger la branche main (require PR + no force push)
- 3 cartes Brand sans Sous-format : B09W, B19E, B09U (côté master)
- (Optionnel) Bouton "Réactiver cette version" sur versions annulées
- (Optionnel) Tour onboarding interactif au premier login (en plus du
  centre d'aide)

---

### 2026-06-01 — Feature "Annuler cette version" (branche `annuler-version`) MERGÉ
index.html 5233 → 5287 (+54). PR ciblée : 1 feature complète livrée 
d'une traite (modale custom + bouton + handler + rendu badge), puis 
nettoyage d'une fonction orpheline.

Le champ "Statut" (Active/Annulée) existait déjà sur 📹 Versions (SELECT,
pas checkbox). On l'a utilisé plutôt que créer un nouveau champ.

Bonus durable : modale `showConfirmModal({title, message, confirmText, 
confirmStyle, onConfirm})` réutilisable pour toutes les futures 
confirmations.

---

### 2026-06-01 — Features Brand v2 + UX + inversion ordre boutons (branche `features-brand-v2`) MERGÉ
index.html 5184 → 5233 (+49). PR à 5 features + 1 ajustement ordre, 
livrée en 5 incréments vérifiés + 1 correctif final.

5 features : Validation Brand par version, "Valider tous les retours"
dans lecteur, Décli YouTube Desk/Face Cam, alignement restriction Brand
séquencier (Brand OU Chef), wording notifs précisé "séquencier de".

Inversion d'ordre boutons après retour David : workflow réel = Chef
valide d'abord (édito), Brand valide après (conformité). Ordre final
sur cartes Brand : [Valider cette version] (gauche) → [Validation Brand]
(droite, disabled tant que Valider pas cochée).

---

### 2026-05-29 — 3 bugs UX (branche `fix-bugs-ux`) MERGÉ
index.html 5172 → 5184 (+12). 3 bugs : double V1 Thierry (verrou 
triple), titre tronqué (textarea auto-grow), Validation Client sans 
restriction (garde Brand/Chef).

---

### 2026-05-29 — Brouillons retours internes + Triple validation Brand (branche `brouillons-triple-validation`) MERGÉ
index.html 5106 → 5172 (+66). Brouillons sur retours Source='Équipe',
triple validation Brand séquencier (Édito → Brand → Client), Contact 
Brand, notifs Brand, helper escapeHtml.

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
- **DAVID** : non-codeur. Colle prompts, upload GitHub, teste preview, 
  merge, clique "Synchroniser maintenant". Langue : français.

**Note importante** : aucun chat ne peut parler à un autre. David est
le pont. Pilote rédige les messages que David transmet au Master ou à
Claude Code, et ramène leurs réponses au Pilote.

## WORKFLOW STANDARD
1. Pilote prépare prompt précis (intention + emplacement)
2. Claude Code : curl -sL https://raw.githubusercontent.com/David-f10/reel-media-production/main/index.html -o index.html
3. Claude Code livre fichier(s) (récupération manuelle car push bloqué)
4. David envoie au pilote → vérif (wc -l, grep, node --check, fonctions 
   appelées, lecture diff)
5. Pilote livre 2 fichiers : index.html + CONTEXT_REEL_MEDIA.md à jour
6. David crée branche, upload, ouvre PR, TESTE preview Netlify, merge si OK
7. David clique "Synchroniser maintenant" sur project knowledge

## WORKFLOW SPÉCIAL : grosses PR / environnement instable
Découper en INCRÉMENTS VÉRIFIÉS (3 à 5). Chaque incrément : a) périmètre 
strict, b) Claude Code livre, c) pilote vérifie compteurs + node --check + 
fonctions appelées AVANT feu vert.

## WORKFLOW SPÉCIAL : décisions produit complexes
Consulter Master en parallèle pour avoir un 2ème avis produit. Pilote
rédige un message neutre listant les options et son avis, David le 
transmet, Master répond avec sa perspective. Pilote intègre.

## RÈGLES D'OR
- index.html dans project knowledge = SOURCE OFFICIELLE
- EQUIPE_FALLBACK = [] ; CHEF_PAR_DEFAUT = 'Benjamin'
- Prompts Claude Code : intention + emplacement
- À CHAQUE modif code, livrer AUSSI CONTEXT_REEL_MEDIA.md à jour
- Sur fichiers sensibles, JAMAIS merger sans (a) vérif pilote, 
  (b) test preview, (c) console JS propre
- ⚠️ node --check ne voit pas les fonctions non définies.
- ⚠️ TOUJOURS demander le fichier à Claude Code après une modif, 
  jamais valider sur rapport seul.
- Ne jamais coller en clair des codes d'accès / secrets dans les chats
- Si Claude Code dépasse 30 min sans livrer → message STOP+statut
- `git checkout` peut donner une vieille version. TOUJOURS curl raw GitHub.
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
- Monitoring : Sentry (org rushup, projet reel-media-production, data EU)
- État du main après merge annuler-version : 5287 lignes.
- EN ATTENTE DE MERGE : `page-aide` (5405 lignes).

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
- 📹 Versions : "Validation Brand" (checkbox) + "Statut" (select 
  Active/Annulée, EXISTAIT DÉJÀ, utilisé pour Annuler version)

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
- ✅ Features Brand v2 (5 features + inversion ordre boutons par version)
- ✅ Annuler cette version + modale custom réutilisable

**EN ATTENTE DE MERGE** : `page-aide` (Centre d'aide intégré).

═══════════════════════════════════════════════════════════════
## NOTES TECHNIQUES UTILES
═══════════════════════════════════════════════════════════════
- ⚠️ `grep -c` retourne code 1 si compte=0 → casse les `&&`. Utiliser `|| true`.
- ⚠️ `grep -c "X"` compte LIGNES contenant X (sous-chaîne).
- ⚠️ Variables CSS dans css/base.css (pas index.html).
- ⚠️ node --check ne voit pas les fonctions non définies.
- ⚠️ TOUJOURS demander le fichier à Claude Code, vérification visuelle.
- ⚠️ Ne pas pointer Claude Code vers branche non poussée sur GitHub.
- Vue active = appSetVue(currentVue), rendu LOCAL depuis `sujets`, zéro API.
- refreshUI(id, forcePadOpen) = appSetVue(currentVue) si production + 
  refreshDetail(id) débouncé.
- openDetail(id) lourde (~7 appels API).
- Helper escapeHtml(s) : défini ligne 504, défense XSS.
- Titre fiche détail (#d-titre-input) : <textarea> auto-grow.
- Verrous création : `_creerDecliEnCours` (déclis, libérations défensives) 
  + `_creerVersionEnCours` (versions).
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
  type∈{'RM','Brand','Client','autre'}.
- Handler validation par version : toggleVersionValidationBrand(versionId, 
  sujetId, wasValidee, wasValide).
- Handler annulation version : annulerVersion(versionId, sujetId, 
  versionNum).
- toggleVersionValidee signature originale : (versionId, sujetId, 
  versionNum, wasValidee, url).
- creerDeclinaison signature : (parentId, formatDecli='Desk').
- Modale custom réutilisable : showConfirmModal({title, message, 
  confirmText='Confirmer', confirmStyle='primary', onConfirm}).
- Centre d'aide : showHelpModal() — modale plein écran avec accordéon 
  natif `<details>`/`<summary>` HTML, contenu statique 5 sections.
- ORDRE chaîne validation version Brand : Valider cette version (Chef/édito) 
  → Validation Brand (Brand/conformité client) → optionnellement Annuler 
  cette version (Brand ou Chef).

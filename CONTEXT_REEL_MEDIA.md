# PASSATION — Réel Média Production (contexte pilote)

> Ce fichier permet à un nouveau chat de reprendre le rôle de PILOTE sans perdre le contexte.
> Dernière mise à jour : 2026-06-01

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

### 2026-06-01 — Feature "Annuler cette version" (branche `annuler-version`)
index.html 5233 → **5287 lignes** (+54). PR ciblée : 1 feature complète
livrée d'une traite (modale custom + bouton + handler + rendu badge),
puis nettoyage d'une fonction orpheline.

**Décisions produit prises avant le code** (les 7 du Master + 1 pivot
sur le champ Notion) :
1. **Comportement Notion** : utiliser le champ "Statut" existant sur
   📹 Versions (SELECT Active/Annulée) plutôt qu'un nouveau checkbox.
   Sémantiquement plus propre, pas besoin du Master pour créer le champ,
   pas d'état hybride.
2. **Affichage versions annulées** : visibles + badge rouge "❌ Annulée"
   + opacity 0.45 + filter grayscale(0.6) (atténuation douce, pas barré).
3. **Notification** : au journaliste (Responsable de la version) UNIQUEMENT,
   avec wording "❌ V2 annulée sur ${s.code}, une nouvelle version est
   attendue". Auto-notif évitée (si auteur === journaliste).
4. **Création nouvelle version** : manuelle classique via le bouton
   "+ Ajouter une version" existant.
5. **Texte du bouton** : "❌ Annuler cette version", rouge danger.
6. **Confirmation** : modale custom réutilisable
   `showConfirmModal({title, message, confirmText, confirmStyle, onConfirm})`.
7. **Restriction rôle** : Brand OU Chef. Toast "Réservé aux contacts
   Brand ou aux chefs" sinon.

**Ce qui a été implémenté**
- **Lecture Statut** dans loadVersions : `pr.Statut?.select?.name || ''`
  → `annulee = statut === 'Annulée'`. Versions sans Statut traitées
  comme actives par défaut.
- **Rendu annulée** : wrapper avec opacity 0.45 + grayscale 0.6, badge
  rouge "❌ Annulée" à côté du numéro de version. Le lien vidéo + 
  Responsable restent visibles pour le contexte historique.
- **IIFE versions** : si annulee → retourne '' (pas de boutons de validation,
  pas de bouton Annuler). La version est figée visuellement.
- **Bouton "❌ Annuler cette version"** : visible UNIQUEMENT si
  isBrand && !annulee && validee && validationBrand. Placé sur une 
  nouvelle ligne sous les 2 boutons de validation, plein-largeur, 
  rouge danger.
- **Modale `showConfirmModal`** : overlay assombri (rgba(0,0,0,0.6)),
  contenu sur fond var(--bg2) avec var(--border2) et var(--rl).
  - 5 paramètres : title, message, confirmText='Confirmer', 
    confirmStyle='primary', onConfirm
  - confirmStyle:'danger' applique le rouge sur le bouton
  - escapeHtml partout (XSS-safe)
  - white-space:pre-line sur le message pour préserver les \n (puces •)
  - Fermeture : clic overlay externe + bouton Annuler + après confirm
- **Handler `annulerVersion(versionId, sujetId, versionNum)`** :
  - Garde format : s?.format === 'Brand'
  - Garde rôle : Brand OU Chef sinon toast d'erreur
  - Modale custom avec message détaillé (effet de l'action)
  - onConfirm : PATCH Statut='Annulée' → createNotif('version_annulee')
    au journaliste (sauf auto-notif) → toast confirmation → loadVersions
- **NOTIF_ICONS** : ajout `version_annulee: '❌'`

**Vérifs pilote OK**
- 5287 lignes, node --check OK, toutes fonctions appelées définies
- annulerVersion=2 (def + onclick) ✓
- Annuler cette version=2 (titre modale + bouton) ✓
- version_annulee=2 (NOTIF_ICONS + createNotif) ✓
- showConfirmModal=2 (def + appel) ✓
- "Réservé aux contacts Brand ou aux chefs"=4 (3 anciens + nouveau handler) ✓
- toggleAnnuleeVersion=0 (fonction orpheline supprimée au nettoyage) ✓
- Tous les acquis features-brand-v2 + fix-bugs-ux + brouillons-triple-
  validation intacts
- 7 compteurs de préservation tous intacts

**Process notes**
- Petit pivot sur la décision 1 : initialement on prévoyait un nouveau
  checkbox "Annulée", mais le Master a clarifié que le champ "Statut"
  (Active/Annulée) existait déjà sous forme SELECT. On a basculé pour
  utiliser ce champ existant — plus propre métier + plus rapide.
- Claude Code a livré la feature d'une traite (pas d'incréments), justifié
  car 1 seule feature cohérente avec 6 sous-points reliés.
- Au passage il a écrit une fonction orpheline `toggleAnnuleeVersion`
  (jamais appelée), vestige d'une approche précédente. Détectée par
  pilote, retirée au nettoyage.

**À tester en preview** (incognito + Cmd+Shift+R) :

🧪 BOUTON ANNULER
1. Carte Brand → Montage → version où "Valider cette version" ET 
   "Validation Brand" sont déjà cochées → un 3e bouton "❌ Annuler 
   cette version" apparaît en rouge sur une nouvelle ligne.
2. Connecté en journaliste (Augustin) → clic sur "Annuler" → toast
   "Réservé aux contacts Brand ou aux chefs".
3. Connecté en Brand (Louise) ou Chef (Benjamin) → clic → modale 
   custom s'affiche avec titre "Annuler cette version ?", message 
   détaillé, 2 boutons "Annuler" (gris) et "Confirmer l'annulation" 
   (rouge).
4. Clic "Annuler" sur la modale → modale se ferme, rien ne se passe.
5. Clic en dehors de la modale → modale se ferme, rien ne se passe.
6. Clic "Confirmer l'annulation" → version passe en grisé (opacity 0.45)
   avec badge "❌ Annulée" à côté du numéro, les boutons disparaissent.
   Toast "Version annulée. Une notification a été envoyée au journaliste."

🧪 VISIBILITÉ DU BOUTON
7. Version Brand SANS "Valider cette version" cochée → bouton Annuler
   PAS visible.
8. Version Brand SANS "Validation Brand" cochée → bouton Annuler PAS
   visible.
9. Version Brand déjà annulée → bouton Annuler PAS visible (la version
   est figée).
10. Carte non-Brand → bouton Annuler PAS visible.

🧪 NOTIFICATION
11. Après annulation, le journaliste/monteur (Responsable) doit avoir
    une nouvelle notif "❌ V2 annulée sur ${s.code}, une nouvelle version
    est attendue".
12. Si le journaliste annule lui-même (cas où journaliste === chef),
    pas d'auto-notif.

🧪 CRÉATION NOUVELLE VERSION
13. Après annulation, le journaliste peut cliquer sur "+ Ajouter une 
    version" pour créer une V3 normalement. Le cycle complet recommence.

🧪 RÉGRESSION
14. Cartes MAG/Face Cam/Desk → workflow versions inchangé.
15. Toutes les autres validations (séquencier, Brand version, etc.) 
    inchangées.
16. Console JS propre.

> Note process : Claude Code n'a pas pu pusher (403 perms). Fichier 
> récupéré manuellement par David, à pousser sur GitHub via interface
> web, branche `annuler-version`.

---

### 📋 LISTE NOIRE — Pour les prochaines PR
Plus rien de critique en attente. Si besoin futur :
- Backup automatique (GitHub Actions, export Notion nightly)
- Intégration GitHub↔Sentry
- (Optionnel) Régénérer les codes d'accès des 5 nouveaux + des 4 Brand
- (Optionnel) Protéger la branche main (require PR + no force push)
- 3 cartes Brand sans Sous-format : B09W, B19E, B09U (côté master)
- (Optionnel futur) Bouton "Réactiver cette version" sur versions annulées
  si jamais besoin métier — la modale `showConfirmModal` est déjà 
  réutilisable.

---

### 2026-06-01 — Features Brand v2 + UX + inversion ordre boutons (branche `features-brand-v2`) MERGÉ
index.html 5184 → 5233 (+49). PR à 5 features + 1 ajustement ordre, 
livrée en 5 incréments vérifiés + 1 correctif final (inversion ordre 
des 2 boutons par version).

**Features livrées** :
1. **Validation Brand par version** sur cartes Brand : 2 boutons côte à
   côte `[Valider cette version]` (gauche, 1er, garantie ÉDITO Chef) → 
   `[Validation Brand]` (droite, 2e, garantie CONFORMITÉ CLIENT Brand,
   disabled tant que Valider pas cochée).
2. **"Valider tous les retours" dans le panneau lecteur** : bouton 
   ajouté en tête de loadPlayerRetours, conditions identiques à 
   loadRetours.
3. **Décli YouTube : Desk OU Face Cam** : 2 boutons côte à côte 
   "+ Décli Desk" / "+ Décli Face Cam", creerDeclinaison(parentId, 
   formatDecli='Desk'), badge format coloré dans loadDeclinaisons.
   BONUS : bug latent verrou _creerDecliEnCours libéré sur 2 returns 
   précoces.
4. **Alignement restriction Validation Brand séquencier** : 
   toggleValidationSeq cas Brand passe à role='Brand' OU 'Chef'.
5. **Wording notifs Brand précisé** : "Édito validé sur le séquencier 
   de X", "Le client a validé le séquencier de X".

**Inversion d'ordre boutons (correctif final)** : initialement codé 
Brand → Valider, corrigé après retour David sur workflow réel = Chef 
valide d'abord (édito), Brand valide après (conformité).

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
- **CHAT MASTER** : opérations Notion via MCP. Un SEUL chat écrit dans 
  Notion = le master.
- **CLAUDE CODE** : exécute le code. Ne pousse pas (403 perms).
- **DAVID** : non-codeur. Colle prompts, upload GitHub, teste preview, 
  merge, clique "Synchroniser maintenant". Langue : français.

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

## RÈGLES D'OR
- index.html dans project knowledge = SOURCE OFFICIELLE
- EQUIPE_FALLBACK = [] ; CHEF_PAR_DEFAUT = 'Benjamin'
- Prompts Claude Code : intention + emplacement
- À CHAQUE modif code, livrer AUSSI CONTEXT_REEL_MEDIA.md à jour
- Sur fichiers sensibles, JAMAIS merger sans (a) vérif pilote, 
  (b) test preview, (c) console JS propre
- ⚠️ node --check ne voit pas les fonctions non définies. Vérif manuelle 
  des dépendances.
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
- État du main après merge features-brand-v2 : 5233 lignes.
- EN ATTENTE DE MERGE : `annuler-version` (5287 lignes).

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

**EN ATTENTE DE MERGE** : `annuler-version` (feature Annuler cette 
version + modale custom réutilisable).

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
  type∈{'RM','Brand','Client','autre'}. Type 'Brand' restreint role 
  'Brand' OU 'Chef'. Type 'Client' (Brand uniquement) restreint role 
  'Brand' OU 'Chef', + cliquet définitif.
- Handler validation par version : toggleVersionValidationBrand(versionId, 
  sujetId, wasValidee, wasValide) — triple garde format='Brand' + 
  wasValidee + role 'Brand'/'Chef', PATCH direct, décochable.
- Handler annulation version : annulerVersion(versionId, sujetId, 
  versionNum) — gardes format='Brand' + role 'Brand'/'Chef', modale 
  custom de confirmation, PATCH Statut='Annulée', notif au journaliste.
- toggleVersionValidee signature originale : (versionId, sujetId, 
  versionNum, wasValidee, url). 1er maillon de la chaîne Brand.
- creerDeclinaison signature : (parentId, formatDecli='Desk'). 
  formatDecli ∈ {'Desk', 'Face Cam'}.
- Modale custom réutilisable : showConfirmModal({title, message, 
  confirmText='Confirmer', confirmStyle='primary', onConfirm}). 
  confirmStyle:'danger' applique le rouge. escapeHtml + white-space:pre-line.
- ORDRE chaîne validation version Brand : Valider cette version (Chef/édito) 
  → Validation Brand (Brand/conformité client) → optionnellement Annuler 
  cette version (Brand ou Chef).

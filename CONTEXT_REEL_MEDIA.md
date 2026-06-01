# PASSATION — Réel Média Production (contexte pilote)

> Ce fichier permet à un nouveau chat de reprendre le rôle de PILOTE sans perdre le contexte.
> Dernière mise à jour : 2026-06-01

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

### 2026-06-01 — Vue Calendrier enrichie (branche `calendrier-v2`)
index.html 5405 → **5499 lignes** (+94). PR ciblée : 6 enrichissements + 
prise en compte du J2 de tournage, livrée d'une traite.

**Décisions produit prises avant le code**
- Architecture A : enrichir la vue Calendrier existante (vs créer une 
  nouvelle vue dédiée). Garder une source de vérité unique.
- Priorité métier (David) :
  1. Studio réservé (éviter les conflits de réservation)
  2. Tournages à venir (vue rapide de la semaine)
  3. Charge globale (jours chargés vs vides)
  4. Par journaliste (qui tourne quand)
- Champ Notion "Lieu tournage" (Checkbox : true=Studio, false=Extérieur) 
  existait déjà → pas besoin du Master.
- Champ "Date tournage J2" existait aussi → ajouté au rendu calendrier.

**Ce qui a été implémenté**

1. **Prise en compte du J2** : un sujet apparaît sur tourJ1 ET sur 
   tourJ2 si tourJ2 existe. Label "J1"/"J2" affiché à côté du code 
   uniquement si les 2 jours sont définis (sinon pas de label superflu).

2. **Badge 🎬 STUDIO** : sur chaque événement où lieuTour=true, petit 
   badge ambre 9px à côté du code, avec tooltip natif "Studio".

3. **Fond ambre léger sur les jours studio** : 
   `background:rgba(245,158,11,0.06)` sur les `<div class="cal-day">` 
   ayant au moins 1 tournage studio. Le fond "today" reste prioritaire 
   visuellement.

4. **Toggle "Studio seulement"** : bouton à droite du compteur, change 
   visuel (☐→✅) et classe (primary) au clic. Variable d'état 
   `calStudioOnly`. Filtre les événements affichés ET le compteur.

5. **Liste "Prochains tournages"** sous le calendrier : 7 prochains 
   tournages chronologiquement, J1+J2 séparés si différents, format 
   date "Demain mardi 2 juin" ou "Mercredi 3 juin", indicateur 🎬 Studio 
   ou Extérieur, journaliste à la fin. Clic = openDetail. Cas vide 
   géré ("Aucun tournage programmé"). IGNORE les filtres locaux 
   (vue d'ensemble).

6. **Compteur en haut du mois** : "X tournages ce mois-ci, dont Y en 
   studio" (ou "Y tournages studio ce mois-ci" si filtre studio actif). 
   Gestion du pluriel.

7. **Filtre par journaliste** (dropdown) : généré dynamiquement depuis 
   les journalistes ayant au moins un tournage dans le mois affiché 
   (pas tous les journalistes existants). Tri locale-aware fr. Variable 
   d'état `calFilterJournaliste`.

**Architecture du code**
- Variables d'état au top du fichier (lignes 3648-3652) avec les autres 
  cal*.
- Fonction `matchFilters(ev)` centralisée pour appliquer les 2 filtres 
  (réutilisée pour compteur + rendu).
- Helpers `calToggleStudio()` et `calSetJournaliste(v)` minimalistes 
  (1 ligne chacune).
- `escapeHtml` partout sur les valeurs utilisateur (XSS-safe).
- `localeCompare` français pour le tri des journalistes.

**Vérifs pilote OK**
- 5499 lignes, node --check OK, toutes fonctions appelées définies
- calStudioOnly=5 ✓
- calFilterJournaliste=4 ✓
- Studio seulement=1 ✓
- Prochains tournages=1 ✓
- Tous les journalistes=1 ✓
- lieuTour=8 (anciens + 4 nouveaux usages) ✓
- tourJ2=9 (anciens + 4 nouveaux usages calendrier) ✓
- Tous acquis PR précédentes intacts (16 compteurs)
- 7 compteurs de préservation tous intacts

**À tester en preview** (incognito + Cmd+Shift+R) :

🧪 BADGES & FOND
1. Onglet Calendrier → événements ayant lieuTour=true affichent 🎬 
   à côté du code
2. Jours ayant au moins 1 tournage studio → fond ambre très léger
3. Jour "today" garde son fond prioritaire

🧪 FILTRES
4. Toggle "Studio seulement" → masque les non-studio, change ☐/✅, 
   compteur s'adapte
5. Filtre journaliste (dropdown) → ne montre que les tournages du 
   journaliste sélectionné
6. Changement de mois → filtres conservés
7. Liste "Tous les journalistes" générée dynamiquement (seulement ceux 
   ayant un tournage ce mois)

🧪 COMPTEUR
8. En haut : "X tournages ce mois-ci, dont Y en studio" sans filtre
9. Avec filtre studio actif : "Y tournages studio ce mois-ci"
10. Pluriel respecté (1 tournage vs 5 tournages)

🧪 PROCHAINS TOURNAGES
11. Sous le calendrier : liste des 7 prochains tournages (chronologique)
12. Si demain : "Demain mardi 2 juin"
13. Sinon : "Mercredi 3 juin"
14. Indicateur 🎬 Studio (ambre) ou Extérieur
15. Clic sur ligne → ouvre la fiche détail
16. Cas "aucun tournage programmé" géré

🧪 J2
17. Un sujet ayant tourJ1=2026-06-02 ET tourJ2=2026-06-03 apparaît bien 
    sur les 2 dates dans le calendrier
18. Sur les 2 dates, label "J1" ou "J2" à côté du code
19. Si seul tourJ1 défini : pas de label superflu (juste le code)
20. Dans Prochains tournages, J1 et J2 listés séparément

🧪 RÉGRESSION
21. Autres vues (Cartes, Statut, Journaliste, Liste, Dashboard) 
    fonctionnent normalement
22. Tous les workflows précédents (validations, retours, etc.) intacts
23. Console JS propre

> Note process : Claude Code n'a pas pu pusher (403 perms). Fichier 
> récupéré manuellement par David, à pousser sur GitHub via interface
> web, branche `calendrier-v2`.

---

### 📋 LISTE NOIRE — Pour les prochaines PR
Plus rien de critique en attente. Si besoin futur :
- Enrichissement Centre d'aide : section "Comment faire pour..." 
  (FAQ d'actions concrètes : ajouter une version, créer une décli, etc.)
- Amélioration UX de la cloche (Master a identifié friction n°1 : les 
  gens ne comprennent pas quand c'est leur tour). Pistes : message plus 
  explicite "À TOI de [valider/corriger]", filtre "Mes actions à faire" 
  dans le kanban.
- Backup automatique (GitHub Actions, export Notion nightly)
- Intégration GitHub↔Sentry
- (Optionnel) Régénérer les codes d'accès des 5 nouveaux + des 4 Brand
- (Optionnel) Protéger la branche main (require PR + no force push)
- 3 cartes Brand sans Sous-format : B09W, B19E, B09U (côté master)
- (Optionnel) Bouton "Réactiver cette version" sur versions annulées
- (Optionnel) Tour onboarding interactif au premier login

---

### 2026-06-01 — Centre d'aide intégré (branche `page-aide`) MERGÉ
index.html 5287 → 5405 (+118). Modale plein écran accessible via 
bouton "?" dans le header (à gauche de la cloche). 5 sections en 
accordéon natif `<details>`/`<summary>` : Premiers pas, Les cartes 
et leurs codes, Mon rôle (Journaliste/Chef/Brand/Monteur), Retours 
vs Commentaires, La cloche.

Fonction `showHelpModal()`. Contenu statique, escapeHtml partout par 
prudence. Bouton ×, clic overlay externe, touche Échap pour fermer.

---

### 2026-06-01 — Feature "Annuler cette version" (branche `annuler-version`) MERGÉ
index.html 5233 → 5287 (+54). Bouton "❌ Annuler cette version" sur 
cartes Brand après les 2 validations. Utilise le champ "Statut" 
(Active/Annulée) déjà existant sur 📹 Versions. Modale custom 
réutilisable `showConfirmModal()`. Notif au journaliste.

---

### 2026-06-01 — Features Brand v2 + UX + inversion ordre boutons (branche `features-brand-v2`) MERGÉ
index.html 5184 → 5233 (+49). 5 features + 1 ajustement ordre.

Validation Brand par version, "Valider tous les retours" dans lecteur, 
Décli YouTube Desk/Face Cam, alignement restriction Brand séquencier, 
wording notifs "séquencier de", inversion ordre boutons (Chef valide 
d'abord, Brand valide après).

---

### 2026-05-29 — 3 bugs UX (branche `fix-bugs-ux`) MERGÉ
index.html 5172 → 5184 (+12). Double V1 Thierry (verrou triple), 
titre tronqué (textarea auto-grow), Validation Client sans restriction.

---

### 2026-05-29 — Brouillons retours internes + Triple validation Brand (branche `brouillons-triple-validation`) MERGÉ
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
Découper en INCRÉMENTS VÉRIFIÉS (3 à 5).

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
- État du main après merge page-aide : 5405 lignes.
- EN ATTENTE DE MERGE : `calendrier-v2` (5499 lignes).

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
  (select) + "Lieu tournage" (checkbox : Studio oui/non) + "Date 
  tournage J1" (date) + "Date tournage J2" (date)
- 📹 Versions : "Validation Brand" (checkbox) + "Statut" (select 
  Active/Annulée, utilisé pour Annuler version)

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
- ✅ Centre d'aide intégré (showHelpModal, 5 sections accordéon)

**EN ATTENTE DE MERGE** : `calendrier-v2` (vue Calendrier enrichie 
studio/J2/filtres/prochains).

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
- Centre d'aide : showHelpModal() — modale plein écran accordéon 
  natif `<details>`/`<summary>`.
- Vue Calendrier : renderCalendrier() avec variables d'état au top 
  (calMonth, calYear, calStudioOnly, calFilterJournaliste). Helpers 
  calToggleStudio(), calSetJournaliste(v), calPrev(), calNext(). 
  Lit s.tourJ1 + s.tourJ2 (label J1/J2 si les 2 définis), s.lieuTour 
  (badge 🎬 + fond ambre + filtre studio), s.journaliste (filtre 
  dropdown généré dynamiquement). Liste "Prochains tournages" sous 
  le calendrier (7 max, IGNORE les filtres locaux pour vue d'ensemble).

# PASSATION — Réel Média Production (contexte pilote)

> Ce fichier permet à un nouveau chat de reprendre le rôle de PILOTE sans perdre le contexte.
> Dernière mise à jour : 2026-05-28

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

### 2026-05-28 — Renommage statut « Montage V1 » → « Montage » + PR Réactivité (branche `montage-reactivite`)
Deux chantiers livrés dans la même branche/PR. index.html passe de 5085 → **5091 lignes**.

**Étape A — Renommage statut (CODE + NOTION)**
- Côté Notion (fait par le Master) : l'option du select « Statut » de 🎬 Suivi de Production
  a été renommée EN PLACE de « Montage V1 » en « Montage » (même ID interne conservé) → toutes
  les cartes existantes ont été migrées automatiquement par Notion, pas de migration manuelle.
- Côté code : les 11 occurrences de la VALEUR `'Montage V1'` remplacées par `'Montage'`
  (filtre sidebar, STATUS_ORDER, STATUT_ORDER, stColor, map statut→clé, logique dépôt version,
  autoStatut, condition d'affichage). La clé interne `'montage'` (minuscule) est inchangée.
- POURQUOI : le « V1 » du statut était un faux ami — il prêtait à confusion avec le vrai
  système de versions (V1/V2/V3) de la section Montage. Le statut dit désormais juste « Montage ».
- ⚠️ Le système de versions (Lien V1/V2/V3, Monteur V1/V2/V3, « Version validée ») est resté
  INTACT — vérifié.

**Étape B — Réactivité (zéro rechargement perçu)**
- LOT 1 : `location.reload()` du select Format supprimé → 0 occurrence.
- LOT 2 : map de synchro locale d'`upd()` complétée (chef, journaliste, priorite, format,
  versionClean, validationRM, validationClient, capDeposee, releveMusique, sansMusique).
- LOT 3 : nouvelle fonction `refreshUI(id, forcePadOpen)` = `appSetVue(currentVue)` (rendu
  local, zéro API) si on est en production, puis `refreshDetail(id, forcePadOpen)` (conservée,
  débounce 300 ms). `upd()` et 9 handlers routés vers `refreshUI`.
- LOT 4 : dashboard rafraîchi UNIQUEMENT à la fermeture de la fiche (`closeOv`, si
  `currentPage==='dashboard'`).
- POURQUOI : éliminer le bug « priorité visible à la 2e action » et les rechargements de page,
  pour les tests journalistes.

**Vérifs pilote OK** : Montage V1=0 ; location.reload=0 ; function refreshUI=1 ;
function refreshDetail=1 ; appels refreshUI(id)=9 ; node --check OK ;
window.onerror=2 ; sentry-cdn=1 ; DB_CLIENTS_BRAND=6 ; versions intactes.

**À tester en preview** (incognito + Cmd+Shift+R), dans CHAQUE vue (Cartes, Par statut,
Par journaliste, Liste) : changer Priorité / Format / Chef / Journaliste / Statut →
affichage immédiat sans recharger ni changer de vue ; cocher Version clean ; revenir au
Dashboard après action → KPIs à jour ; ouvrir une carte ex-« Montage V1 » (ex. Y125) →
le stepper doit afficher « Montage ».

> Note process : Claude Code a fait une bévue en cours de route (un `git checkout` initial
> avait écrasé le fichier curl'd par une vieille version pré-Sentry/Brand). Détecté via les
> compteurs de préservation, refait proprement sur le vrai main. À surveiller à l'avenir :
> toujours vérifier window.onerror/sentry/DB_CLIENTS_BRAND sur les livrables.

---

═══════════════════════════════════════════════════════════════
## RÔLES (workflow à 3 chats)
═══════════════════════════════════════════════════════════════
- **CHAT PILOTE** : prépare les prompts pour Claude Code, vérifie les livrables
  (hash, grep, node --check, lecture du diff), livre les fichiers validés + le
  CONTEXT mis à jour. NE code PAS directement, NE push PAS.
- **CHAT MASTER** : opérations Notion via MCP (création/modif cartes, compteurs,
  journalistes, bases). Un SEUL chat écrit dans Notion à la fois = le master.
- **CLAUDE CODE** : exécute le code à partir des prompts du pilote.
- **DAVID (utilisateur)** : non-codeur. Fait le pont (colle les prompts dans Claude
  Code, upload sur GitHub, merge, clique "Synchroniser maintenant"). Langue : français.

## WORKFLOW STANDARD
1. Pilote prépare un prompt précis (intention + emplacement, PAS de code prescriptif)
2. Claude Code commence par : curl -sL https://raw.githubusercontent.com/David-f10/reel-media-production/main/index.html -o index.html
3. Claude Code livre le(s) fichier(s)
4. David envoie au pilote → pilote vérifie (wc -l, grep, node --check)
5. Pilote livre 2 fichiers : index.html + CONTEXT_REEL_MEDIA.md mis à jour
6. David crée une branche, upload, ouvre PR, teste preview Netlify (incognito + Cmd+Shift+R), merge si OK
7. David clique "Synchroniser maintenant" sur le project knowledge

## RÈGLES D'OR
- index.html dans le project knowledge = SOURCE OFFICIELLE ; toujours modifier l'existant, jamais recréer de zéro
- EQUIPE_FALLBACK = [] (ne jamais remettre de codes) ; CHEF_PAR_DEFAUT = 'Benjamin'
- Format prompts Claude Code : intention + emplacement, sans code JS/HTML prescriptif
- Privilégier .includes() plutôt qu'égalité stricte avec emojis
- À CHAQUE modif de code, livrer AUSSI le CONTEXT_REEL_MEDIA.md mis à jour
  (nouvelle entrée datée en haut de la section Historique des modifs)

═══════════════════════════════════════════════════════════════
## PROJET
═══════════════════════════════════════════════════════════════
- App : Réel Média Production (suivi prod TV/vidéo), fichier unique index.html + CSS séparés
- Repo GitHub : David-f10/reel-media-production
- Prod : reel-media-production.netlify.app
- Backend : netlify/functions/notion.js (proxy API Notion) + netlify/functions/login.js (auth)
- CSS extrait en 4 fichiers : css/base.css, css/layout.css, css/components.css, css/views.css
- Monitoring : Sentry (org rushup, projet reel-media-production, data EU) — EN PROD
- État du main : ~5085 lignes ; branche `montage-reactivite` à 5091 lignes (à merger)

## BASES NOTION (IDs)
| Base | ID |
|------|-----|
| 🎬 Suivi de Production | 01a8dc7d-1cc2-4209-9afe-a3bd90a87e20 (data source: 88894794-bcfd-41a5-baf3-b061fb75a1a9) |
| 🔢 Compteurs de codes | f9b8d090-6c9e-4513-a67c-db2d82941a29 |
| 🏷️ Clients Brand (NOUVELLE, utilisée par l'app) | 67abbb5f-f6a6-4937-89e3-6c852c515a8e |
| 🏢 Clients Brand (ANCIENNE, autres usages, NE PAS toucher) | 228c6efb-eb59-42ef-8926-7ce34816cb96 |
| 👥 Équipe | df0e44e1-7c9c-4427-a9c2-af7b6da78fcb |
| 📋 Tâches | 0241d8dc-00a1-461c-9efa-00eb7e5fac70 |
| 🔔 Notifications | 4398775b-c11f-4d73-99c4-9fc31c33ce8b |
| 💡 Idées | b164bf282a4e4ac78a15d5e894019daa |
| 📎 Références | 4ae84e174ee9473888eaa15112fcc6ee |
| 📹 Versions | 3793eebb-2aeb-4d49-84ae-06d79cfb2704 |
| 🎵 Musiques | d9d3579257bc49059e6cd683a8b02fef |
| 💬 Commentaires | 45fda8a6-dfbc-42c1-a26f-de09c289037b |
| 📋 Retours | 02880609-ee82-4acc-b239-d8aac9cae439 |

═══════════════════════════════════════════════════════════════
## CE QUI EST EN PROD
═══════════════════════════════════════════════════════════════
- ✅ Feature Brand (nouvelle base clients 67abbb5f, format livraison dans Sous-format, fix bug B54A)
- ✅ Troncature des titres sur 1 ligne (CSS) + tooltips au survol (title="")
- ✅ Largeur fixe des colonnes kanban (220px) — vue Par journaliste alignée
- ✅ Refresh fiche détail (helper refreshDetail, débouncé 300ms)
- ✅ Sentry (monitoring erreurs)
- ✅ Phase A (gestion erreurs globale window.onerror + bandeau Notion) — depuis le 22/05

**EN ATTENTE DE MERGE** : branche `montage-reactivite` (renommage Montage + réactivité Lots 1-4,
voir Historique des modifs ci-dessus).

Côté Notion (par le master) : 10 Face Cam (F641-650), 11 Desk (D1132-1142),
21 MAG (M649-669), 13 YouTube (Y124-136), 10 Brand récentes, 53 clients Brand,
5 nouveaux journalistes (Alice Guionnet, Romain Canault, Camille, Hervé Grandchamp,
Anne Burlot), compteurs à jour, notifications vidées, attributions journalistes auditées.
Option select « Statut » : « Montage V1 » renommé en « Montage » (2026-05-28).

═══════════════════════════════════════════════════════════════
## EN ATTENTE / PLUS TARD (non prioritaire)
═══════════════════════════════════════════════════════════════
- Grille de login (option C : boutons cliquables au lieu du select, pour réduire le scroll).
  Prompt déjà rédigé (PROMPT_LOGIN_GRILLE.txt). ⚠️ Ne PAS ajouter les 5 nouveaux
  journalistes au login tant que leurs comptes n'existent pas côté serveur (login.js).
- Créer les comptes serveur des 5 nouveaux journalistes (modif login.js) si on veut
  qu'ils puissent se connecter.
- 3 cartes Brand sans Sous-format à compléter : B09W, B19E, B09U (côté master).
- Première vraie création de carte Brand à surveiller (validé en visuel seulement, pas en écriture).
- Backup automatique (GitHub Actions, export Notion nightly).
- Intégration GitHub↔Sentry (liens code, suspect commits).

═══════════════════════════════════════════════════════════════
## NOTES TECHNIQUES UTILES
═══════════════════════════════════════════════════════════════
- Vérif tooltips avec grep : utiliser grep -F 'title="${s.titre' (le $ casse grep normal)
- ⚠️ `grep -c` retourne un code de sortie 1 quand le compte est 0 → casse les chaînes `&&`.
  Utiliser `grep -c ... || true` quand on enchaîne des vérifs.
- Vue active rendue par appSetVue(currentVue) — rendu LOCAL depuis le tableau `sujets`, zéro API
- refreshUI(id, forcePadOpen) = appSetVue(currentVue) si production + refreshDetail(id) débouncé
- openDetail(id) est lourde (~7 chargements API) ; refreshDetail la ré-ouvre en débouncé 300ms
- Statuts (STATUS_ORDER) : Brief / Idée, Séquencier en cours, Séquencier validé, En tournage,
  Post-prod, **Montage** (anciennement « Montage V1 »), Retours, Validation chef, PAD
- Couleurs format (FMT_COLORS) : MAG bleu, Brand ambre, Face Cam rouge, Desk gris, YouTube vert
- Journalistes select Notion : Julien, Augustin, Nico, Mickael, Juliette, Mathilde, Léa,
  Sophie L., Éloise, Juliette B, David, Enrique C, Benjamin, Alice Guionnet, Romain Canault,
  Camille, Hervé Grandchamp, Anne Burlot
- Chefs : Benjamin (défaut), Arnaud, Chloé

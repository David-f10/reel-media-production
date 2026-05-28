# PASSATION — Réel Média Production (contexte pilote)

> Ce fichier permet à un nouveau chat de reprendre le rôle de PILOTE sans perdre le contexte.
> Dernière mise à jour : 2026-05-28

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

### 2026-05-28 — Login en grille de boutons groupée par rôle (branche `login-grille`)
index.html passe de 5091 → **5129 lignes**.

**Ce qui change (écran de connexion uniquement)**
- Le menu déroulant `<select id="login-nom">` (+ ses 13 options en dur) est remplacé par une
  GRILLE DE BOUTONS `<div id="login-grille">`, un bouton par personne.
- Boutons GROUPÉS PAR RÔLE : sections Chefs → Journalistes → Monteurs → Autres. Tri
  alphabétique (localeCompare 'fr') dans chaque section. Patterns de rôle = regex souples
  (/chef/i, /journ/i, /mont/i) → tolérant aux variantes ; rôle inconnu/vide → "Autres".
- Clic sur un nom → surbrillance + le champ code (#login-code) apparaît en dessous
  (#login-code-wrap, masqué par défaut) + focus auto. Changer de personne vide le code.
- Entrée valide (doLogin), bouton "Accéder →" conservé.

**POURQUOI**
- Login mal organisé (rôles en vrac) et scroll trop long.
- "Il manquait des personnes" : le login était DÉJÀ dynamique (chargé depuis Notion DB_EQUIPE).
  La grille garde cette source → plus personne ne manque, futurs membres ajoutés par le Master
  apparaissent automatiquement.

**IMPORTANT — login.js NON modifié**
- Auth inchangée : login.js lit la base 👥 Équipe, compare "Code acces". PAS de comptes dans
  login.js : les comptes vivent dans Notion.
- Les 5 nouveaux (Alice Guionnet, Romain Canault, Camille, Hervé Grandchamp, Anne Burlot) ont
  déjà fiche + "Code acces" dans Notion (vérifié Master 2026-05-28) → ils se connectent.
- doLogin lit selectedLoginId (UUID Notion via data-id du bouton) au lieu du select. Payload
  INCHANGÉ : POST {id, code} vers /.netlify/functions/login.
- Aucun nom/ID/code en dur dans le HTML (tout vient de Notion). escapeHtml sur les noms.

**Vérifs pilote OK** : login-nom=0 ; payload {id,code} préservé ; EQUIPE_FALLBACK=[] ;
DB_EQUIPE inchangé ; variables CSS toutes dans css/base.css ; node --check OK ;
window.onerror=2 ; sentry-cdn=1 ; DB_CLIENTS_BRAND=6 ; acquis préservés (Montage V1=0,
refreshUI=1, location.reload=0).

**À tester en preview** (incognito + Cmd+Shift+R) :
- Se connecter avec un VRAI compte (le tien) → auth doit marcher (point sensible).
- Tester SUR MOBILE (journalistes au téléphone) → grille lisible/compacte.
- Vérifier qu'un des 5 nouveaux (ex. Alice Guionnet) apparaît dans sa section.
- Vérifier le groupement par rôle et qu'aucun nom ne manque.

> Note process : Claude Code a commité localement (770c46f) mais n'a PAS pu pusher (403
> permissions de sa session — pas un souci repo). Fichier récupéré et vérifié manuellement par
> le pilote. À pousser sur GitHub manuellement (upload web ou git push depuis poste autorisé).

---

### 2026-05-28 — Renommage statut « Montage V1 » → « Montage » + PR Réactivité (branche `montage-reactivite`)
index.html 5085 → 5091 lignes.

**Étape A — Renommage statut (CODE + NOTION)**
- Notion (Master) : option du select « Statut » renommée EN PLACE « Montage V1 » → « Montage »
  (même ID interne, cartes migrées auto).
- Code : 11 occurrences de la valeur 'Montage V1' → 'Montage' (filtre, STATUS_ORDER,
  STATUT_ORDER, stColor, map statut→clé, dépôt version, autoStatut, condition d'affichage).
  Clé interne 'montage' inchangée. Système de versions V1/V2/V3 INTACT.
- POURQUOI : le « V1 » du statut était un faux ami avec les vraies versions.

**Étape B — Réactivité (zéro rechargement perçu)**
- LOT 1 : location.reload() du select Format supprimé.
- LOT 2 : map de synchro locale d'upd() complétée (chef, journaliste, priorite, format,
  versionClean, validationRM, validationClient, capDeposee, releveMusique, sansMusique).
- LOT 3 : refreshUI(id, forcePadOpen) = appSetVue(currentVue) (local) si production +
  refreshDetail (conservée, débounce 300ms). upd() + 9 handlers routés vers refreshUI.
- LOT 4 : dashboard rafraîchi uniquement à la fermeture de la fiche (closeOv).
- Confirmé EN PROD par David : "c'est très rapide".

---

═══════════════════════════════════════════════════════════════
## RÔLES (workflow à 3 chats)
═══════════════════════════════════════════════════════════════
- **CHAT PILOTE** : prépare les prompts Claude Code, vérifie les livrables (grep, node --check,
  lecture du diff), livre les fichiers validés + le CONTEXT mis à jour. NE code PAS, NE push PAS.
- **CHAT MASTER** : opérations Notion via MCP. Un SEUL chat écrit dans Notion = le master.
- **CLAUDE CODE** : exécute le code à partir des prompts du pilote.
- **DAVID (utilisateur)** : non-codeur. Fait le pont (colle les prompts, upload GitHub, merge,
  clique "Synchroniser maintenant"). Langue : français.

## WORKFLOW STANDARD
1. Pilote prépare un prompt précis (intention + emplacement, PAS de code prescriptif)
2. Claude Code : curl -sL https://raw.githubusercontent.com/David-f10/reel-media-production/main/index.html -o index.html
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
- Sur fichiers sensibles (login.js, auth), JAMAIS merger sans que le pilote ait vu le fichier
- Ne jamais coller en clair des codes d'accès / secrets dans les chats

═══════════════════════════════════════════════════════════════
## PROJET
═══════════════════════════════════════════════════════════════
- App : Réel Média Production (suivi prod TV/vidéo), fichier unique index.html + CSS séparés
- Repo GitHub : David-f10/reel-media-production
- Prod : reel-media-production.netlify.app
- Backend : netlify/functions/notion.js (proxy API Notion) + netlify/functions/login.js (auth)
- CSS : css/base.css, css/layout.css, css/components.css, css/views.css
  (⚠️ les variables CSS --bg/--bg2/--bg3/--border/--border2/--red/--r/--rl/--font/--mono…
   sont dans css/base.css, PAS dans index.html — un grep "--var:" sur index.html renvoie 0)
- Monitoring : Sentry (org rushup, projet reel-media-production, data EU) — EN PROD
- État du main : à mettre à jour selon merges. Branches livrées : `montage-reactivite` (5091)
  puis `login-grille` (5129).

## AUTHENTIFICATION (login)
- login.js lit la base 👥 Équipe, trouve la personne par UUID, compare "Code acces" (rich_text).
  Renvoie {ok, user:{id,nom,role}}.
- Front (index.html) : initLogin() charge l'équipe depuis Notion → grille de boutons.
  Comptes = fiches Notion avec "Code acces" rempli. PAS de liste de comptes dans login.js.
- Ajouter un utilisateur : le MASTER lui met "Code acces" + "Role" dans Équipe. Rien à coder.

## BASES NOTION (IDs)
| Base | ID |
|------|-----|
| 🎬 Suivi de Production | 01a8dc7d-1cc2-4209-9afe-a3bd90a87e20 (data source: 88894794-bcfd-41a5-baf3-b061fb75a1a9) |
| 🔢 Compteurs de codes | f9b8d090-6c9e-4513-a67c-db2d82941a29 |
| 🏷️ Clients Brand (NOUVELLE, utilisée par l'app) | 67abbb5f-f6a6-4937-89e3-6c852c515a8e |
| 🏢 Clients Brand (ANCIENNE, NE PAS toucher) | 228c6efb-eb59-42ef-8926-7ce34816cb96 |
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
- ✅ Feature Brand (base clients 67abbb5f, format livraison dans Sous-format, fix B54A)
- ✅ Troncature titres 1 ligne + tooltips ; colonnes kanban 220px
- ✅ Refresh fiche détail (refreshDetail, débounce 300ms)
- ✅ Sentry ; Phase A (window.onerror + bandeau Notion)
- ✅ Renommage Montage + Réactivité — confirmé rapide par David (branche montage-reactivite,
  à confirmer si déjà mergé sur main)

**EN ATTENTE DE MERGE** : branche `login-grille` (login en grille groupée par rôle).

Côté Notion : journalistes, compteurs, clients Brand à jour. Les 5 nouveaux ont leur "Code
acces" rempli.

═══════════════════════════════════════════════════════════════
## EN ATTENTE / PLUS TARD (non prioritaire)
═══════════════════════════════════════════════════════════════
- 3 cartes Brand sans Sous-format : B09W, B19E, B09U (côté master).
- Première vraie création de carte Brand à surveiller.
- Backup automatique (GitHub Actions, export Notion nightly).
- Intégration GitHub↔Sentry.
- (Optionnel) Régénérer les codes d'accès des 5 nouveaux : ont circulé en clair dans un chat
  Master le 2026-05-28. Pas critique mais hygiène.
- (Optionnel) Protéger la branche main (require PR + no force push). "Dismiss" OK pour l'instant.

═══════════════════════════════════════════════════════════════
## NOTES TECHNIQUES UTILES
═══════════════════════════════════════════════════════════════
- ⚠️ `grep -c` retourne code 1 quand compte = 0 → casse les `&&`. Utiliser `|| true`.
- ⚠️ Variables CSS dans css/base.css (pas index.html). Vérifier via "var(--xxx)".
- Vérif tooltips : grep -F 'title="${s.titre' (le $ casse grep normal).
- Vue active = appSetVue(currentVue), rendu LOCAL depuis `sujets`, zéro API.
- refreshUI(id, forcePadOpen) = appSetVue(currentVue) si production + refreshDetail(id) débouncé.
- openDetail(id) lourde (~7 appels API) ; refreshDetail la ré-ouvre débouncé 300ms.
- Login : doLogin lit selectedLoginId (UUID via data-id) ; payload {id, code} ; peuplerSelect
  rend la grille (nom conservé pour ne pas toucher initLogin) ; LOGIN_GROUPES = patterns regex.
- Statuts (STATUS_ORDER) : Brief / Idée, Séquencier en cours, Séquencier validé, En tournage,
  Post-prod, Montage (ex « Montage V1 »), Retours, Validation chef, PAD.
- Couleurs format : MAG bleu, Brand ambre, Face Cam rouge, Desk gris, YouTube vert.
- Journalistes : Julien, Augustin, Nico, Mickael, Juliette, Mathilde, Léa, Sophie L., Éloise,
  Juliette B, David, Enrique C, Benjamin, Alice Guionnet, Romain Canault, Camille,
  Hervé Grandchamp, Anne Burlot.
- Chefs : Benjamin (défaut), Arnaud, Chloé. Monteurs : Thierry, David.

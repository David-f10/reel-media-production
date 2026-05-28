# PASSATION — Réel Média Production (contexte pilote)

> Ce fichier permet à un nouveau chat de reprendre le rôle de PILOTE sans perdre le contexte.
> Dernière mise à jour : 2026-05-28

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

### 2026-05-28 — Login : menu déroulant CUSTOM avec avatars colorés par rôle (branche `login-dropdown`)
index.html 5091 → **5177 lignes** (+86). Remplace la tentative `login-grille` (ABANDONNÉE car
rendu trop long/austère, jamais mergée — branche à supprimer).

**Ce qui change (écran de connexion uniquement)**
- Le menu déroulant natif `<select id="login-nom">` est remplacé par un composant custom :
  - une BARRE cliquable `#login-select-bar` (44px) affichant "Choisir..." au repos, puis
    l'avatar à initiales + le nom une fois une personne choisie. Écran compact, zéro scroll.
  - un PANNEAU `#login-panel` (role=listbox) en position absolue (overlay, max-height 260px,
    overflow interne) qui s'ouvre au clic, avec les personnes GROUPÉES PAR RÔLE.
  - le champ code `#login-code` dans `#login-code-wrap`, masqué tant qu'aucune personne choisie.
- Groupes : Chefs (var(--purple)) → Journalistes (var(--blue)) → Monteurs (var(--amber)) →
  Autres (rôle inconnu/vide). Détection souple regex (/chef/i, /journ/i, /mont/i). Tri
  alphabétique localeCompare('fr') intra-groupe.
- Avatars = initiales colorées par rôle. loginInitiales() gère le mono-mot (2 lettres).
- Comportements : clic barre ouvre/ferme ; clic personne → maj barre + ferme + affiche/active
  le code + focus ; clic extérieur ferme ; Échap ferme ; Entrée dans le code → doLogin.

**POURQUOI** : le login était mal organisé + scroll trop long. La grille de boutons (essai
précédent) étalait tout le monde → moche et toujours long. Le menu custom = compact au repos,
beau et identique sur tous les OS (contrairement au <select> natif), groupé par rôle.

**IMPORTANT — login.js NON modifié, auth intacte**
- doLogin lit selectedLoginId (UUID Notion via btn.dataset.id) au lieu du select. Payload
  INCHANGÉ : POST {id, code} vers /.netlify/functions/login.
- Source dynamique Notion conservée : initLogin charge l'équipe (DB_EQUIPE), peuplerSelect
  (même nom, réécrite) rend le menu custom. EQUIPE_FALLBACK=[]. escapeHtml sur les noms.
- Les 5 nouveaux (Alice Guionnet, Romain Canault, Camille, Hervé Grandchamp, Anne Burlot) ont
  leur "Code acces" dans Notion → se connectent et apparaissent dans Journalistes.

**Vérifs pilote OK** : login-nom=0 ; payload {id,code} préservé ; EQUIPE_FALLBACK=[] ;
DB_EQUIPE inchangé ; escapeHtml défini 1 seule fois ; variables CSS (--bg/--bg2/--bg3/--border2/
--text/--text3/--purple/--blue/--amber/--r/--font/--mono) toutes existantes, aucune inventée ;
node --check OK ; onerror=2 ; sentry-cdn=1 ; DB_CLIENTS_BRAND=6 ; acquis préservés (Montage V1=0,
refreshUI=1, location.reload=0). Le gros diff git (767/566) = fins de ligne, pas de modif cachée.

**À tester en preview** (incognito + Cmd+Shift+R) — LOGIN = point sensible :
- Se connecter avec un VRAI compte (le tien) → l'auth DOIT marcher.
- Tester SUR MOBILE (les journalistes se connectent au téléphone).
- Ouvrir le menu → vérifier les groupes (Chefs/Journalistes/Monteurs/Autres), avatars colorés.
- Choisir une personne → la barre se met à jour, le code apparaît, focus dessus.
- Clic dehors / Échap → le menu se ferme.

> Note process : Claude Code a commité (0c9c843) mais n'a PAS pu pusher (403 permissions session).
> Fichier récupéré et vérifié manuellement par le pilote. À pousser sur GitHub manuellement.
> Gens dans "Autres" (Arnaud C, Guillaume, Louise, Victor) = membres Notion sans rôle reconnu.
> Pour les ranger/exclure → le MASTER leur met un Role propre dans la base Équipe (hors code).

---

### 2026-05-28 — Login en grille de boutons (branche `login-grille`) — ABANDONNÉE
Tentative de grille de boutons groupée par rôle. Rendu jugé trop long et austère par David.
Jamais mergée. Branche à supprimer. Remplacée par `login-dropdown` (ci-dessus).

---

### 2026-05-28 — Renommage statut « Montage V1 » → « Montage » + PR Réactivité (branche `montage-reactivite`)
index.html 5085 → 5091 lignes.

**Étape A — Renommage statut (CODE + NOTION)**
- Notion (Master) : option du select « Statut » renommée EN PLACE « Montage V1 » → « Montage »
  (même ID interne, cartes migrées auto).
- Code : 11 occurrences de la valeur 'Montage V1' → 'Montage' (filtre, STATUS_ORDER,
  STATUT_ORDER, stColor, map statut→clé, dépôt version, autoStatut, condition d'affichage).
  Clé interne 'montage' inchangée. Système de versions V1/V2/V3 INTACT.

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
  ET sans test de connexion en preview
- Ne jamais coller en clair des codes d'accès / secrets dans les chats
- Claude Code ne peut PAS pusher (403 permissions) : récupérer le fichier manuellement, David
  pousse sur GitHub (upload web ou git push depuis poste autorisé)

═══════════════════════════════════════════════════════════════
## PROJET
═══════════════════════════════════════════════════════════════
- App : Réel Média Production (suivi prod TV/vidéo), fichier unique index.html + CSS séparés
- Repo GitHub : David-f10/reel-media-production
- Prod : reel-media-production.netlify.app
- Backend : netlify/functions/notion.js (proxy API Notion) + netlify/functions/login.js (auth)
- CSS : css/base.css, css/layout.css, css/components.css, css/views.css
  (⚠️ les variables CSS (--bg/--bg2/--bg3/--border/--border2/--red/--purple/--blue/--amber/
   --r/--rl/--font/--mono…) sont dans css/base.css, PAS dans index.html — un grep "--var:"
   sur index.html renvoie 0 ; vérifier via "var(--xxx)" à la place)
- Monitoring : Sentry (org rushup, projet reel-media-production, data EU) — EN PROD
- État du main : à mettre à jour selon merges. Branches livrées : `montage-reactivite` (5091),
  puis `login-dropdown` (5177). Branche `login-grille` à supprimer.

## AUTHENTIFICATION (login)
- login.js lit la base 👥 Équipe, trouve la personne par UUID, compare "Code acces" (rich_text).
  Renvoie {ok, user:{id,nom,role}}.
- Front : initLogin() charge l'équipe depuis Notion → menu déroulant custom (peuplerSelect).
  Comptes = fiches Notion avec "Code acces" rempli. PAS de liste de comptes dans login.js.
- Ajouter un utilisateur : le MASTER lui met "Code acces" + "Role" dans Équipe. Rien à coder.
- doLogin lit selectedLoginId (UUID via dataset.id) ; payload {id, code}.

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

**EN ATTENTE DE MERGE** : branche `login-dropdown` (menu custom avatars). Branche `login-grille`
à supprimer (abandonnée).

Côté Notion : journalistes, compteurs, clients Brand à jour. Les 5 nouveaux ont leur "Code
acces" rempli.

═══════════════════════════════════════════════════════════════
## EN ATTENTE / PLUS TARD (non prioritaire)
═══════════════════════════════════════════════════════════════
- Ranger ou exclure du login les membres sans rôle (Arnaud C, Guillaume, Louise, Victor) :
  le MASTER leur met un Role propre dans la base Équipe (hors code).
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
- Login : composant custom. doLogin lit selectedLoginId (UUID via dataset.id) ; payload
  {id, code} ; peuplerSelect (nom conservé pour ne pas toucher initLogin) rend le menu ;
  LOGIN_GROUPES = patterns regex + couleur par rôle ; loginInitiales gère le mono-mot.
- Statuts (STATUS_ORDER) : Brief / Idée, Séquencier en cours, Séquencier validé, En tournage,
  Post-prod, Montage (ex « Montage V1 »), Retours, Validation chef, PAD.
- Couleurs format : MAG bleu, Brand ambre, Face Cam rouge, Desk gris, YouTube vert.
- Journalistes : Julien, Augustin, Nico, Mickael, Juliette, Mathilde, Léa, Sophie L., Éloise,
  Juliette B, David, Enrique C, Benjamin, Alice Guionnet, Romain Canault, Camille,
  Hervé Grandchamp, Anne Burlot.
- Chefs : Benjamin (défaut), Arnaud, Chloé. Monteurs : Thierry, David.

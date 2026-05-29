# PASSATION — Réel Média Production (contexte pilote)

> Ce fichier permet à un nouveau chat de reprendre le rôle de PILOTE sans perdre le contexte.
> Dernière mise à jour : 2026-05-29

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

### 2026-05-29 — Login : <select> natif groupé par rôle via <optgroup> (branche `login-optgroup`)
index.html 5091 → **5106 lignes** (+15). Modif chirurgicale : UNE seule fonction réécrite.

**Ce qui change**
- Le <select id="login-nom"> natif d'origine est CONSERVÉ tel quel (HTML, comportement, look).
- Seule la fonction peuplerSelect(liste) a été réécrite pour regrouper les options en
  <optgroup> par rôle, dans l'ordre :
    1. Chefs (rôle = "Chef")
    2. Journalistes (rôle = "Journaliste")
    3. Monteurs (rôle = "Monteur")
    4. Brand (rôle = "Brand")
    5. Autres (tout autre rôle ou rôle vide — généré seulement s'il y a au moins un membre)
- Match EXACT sur m.role (identique à renderEquipeList de la page "👥 Gérer l'équipe").
  Groupe vide non généré. <option> portent value=UUID Notion (transmis tel quel à doLogin).
- Texte de chaque option : "Nom · Role" (conservé comme avant).

**POURQUOI**
- Le menu déroulant était mal organisé (rôles en vrac) et le scroll trop long quand on
  l'ouvrait. Les tentatives "modernes" précédentes (grille de boutons, menu custom avec
  avatars) n'ont pas convaincu visuellement et le menu custom buggait sur 2e sélection
  (Cannot set properties of null sur #login-bar-content après logout). On revient au plus
  simple, identique à la page Équipe.

**IMPORTANT — auth strictement intacte**
- login.js NON modifié. doLogin NON modifié (lit document.getElementById('login-nom').value,
  envoie {id, code} à /.netlify/functions/login).
- initLogin NON modifié (appelle peuplerSelect(equipe) avec la même signature).
- EQUIPE_FALLBACK reste = []. Source dynamique Notion (DB_EQUIPE) conservée.
- Aucun nouveau JS, aucun listener, aucun composant custom. Zéro charge supplémentaire.

**Vérifs pilote OK** : login-nom=3 (HTML + doLogin + peuplerSelect) ; optgroup=2 (générés) ;
EQUIPE_FALLBACK=[] ; DB_EQUIPE inchangé ; doLogin payload {id,code} préservé ; AUCUN résidu
des tentatives précédentes (login-bar-content/select-bar/panel/selectLoginPersonne/
loginInitiales/LOGIN_GROUPES/selectedLoginId tous à 0) ; node --check OK ; window.onerror=2 ;
sentry-cdn=1 ; DB_CLIENTS_BRAND=6 ; acquis préservés (Montage V1=0, refreshUI=1, location.reload=0).

**À tester en preview** (incognito + Cmd+Shift+R) :
- Se connecter avec un VRAI compte (le tien) → auth doit marcher.
- Ouvrir le menu → vérifier les groupes (Chefs / Journalistes / Monteurs / Brand) avec sous-
  titres natifs (apparence dépend de l'OS : Mac/Windows/iPhone).
- Se déconnecter, se reconnecter avec un autre compte → pas d'erreur console (le bug
  innerHTML du menu custom n'existe plus).
- Tester sur mobile.

> Note process : Claude Code a commité (fd8f13e) sur 'login-optgroup' mais n'a PAS pu pusher
> (403 permissions). Fichier récupéré et vérifié manuellement par le pilote. À pousser sur
> GitHub manuellement (upload web ou git push depuis poste autorisé).
>
> ⚠️ Branches à supprimer sur GitHub : `login-grille` et `login-dropdown` (toutes deux
> abandonnées, jamais mergées, plus utiles).

**Découverte de session : les "Brand"**
- Arnaud C, Guillaume, Louise, Victor sont des contacts CLIENT/AGENCE Brand (rôle Notion =
  "Brand"). Ils ont des fiches Équipe pour se connecter et consulter LEURS lives, mais ils
  NE REÇOIVENT PAS de notifs. Le système notifs (loadNotifs/createNotif) est universel
  côté code (filtre sur le nom du destinataire) — donc s'il fallait les notifier un jour,
  rien à coder, juste à les ajouter comme destinataires côté Notion.

---

### 2026-05-28 — Login : tentatives ABANDONNÉES
- **`login-grille`** : grille de boutons groupée par rôle. Trop long, austère. Jamais mergée.
- **`login-dropdown`** : menu custom avec avatars colorés. Charge plus de JS, et bug
  innerHTML on null à la 2e sélection (cycle de vie). Jamais mergée.
Les deux branches sont à supprimer de GitHub. Remplacées par `login-optgroup` (ci-dessus).

---

### 2026-05-28 — Renommage statut « Montage V1 » → « Montage » + PR Réactivité (branche `montage-reactivite`)
index.html 5085 → 5091 lignes.

**Étape A — Renommage statut (CODE + NOTION)**
- Notion (Master) : option du select « Statut » renommée EN PLACE « Montage V1 » → « Montage »
  (même ID interne, cartes migrées auto).
- Code : 11 occurrences de la valeur 'Montage V1' → 'Montage'. Clé interne 'montage' inchangée.
  Système de versions V1/V2/V3 INTACT.

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
- **CHAT PILOTE** : prépare les prompts Claude Code, vérifie les livrables, livre les fichiers
  validés + le CONTEXT mis à jour. NE code PAS, NE push PAS.
- **CHAT MASTER** : opérations Notion via MCP. Un SEUL chat écrit dans Notion = le master.
- **CLAUDE CODE** : exécute le code à partir des prompts du pilote. Ne pousse pas (403 perms).
- **DAVID** : non-codeur. Colle les prompts, upload sur GitHub, teste preview, merge, clique
  "Synchroniser maintenant". Langue : français.

## WORKFLOW STANDARD
1. Pilote prépare un prompt précis (intention + emplacement, PAS de code prescriptif)
2. Claude Code : curl -sL https://raw.githubusercontent.com/David-f10/reel-media-production/main/index.html -o index.html
3. Claude Code livre le(s) fichier(s) (récupération manuelle car push bloqué)
4. David envoie au pilote → pilote vérifie (wc -l, grep, node --check, lecture du diff)
5. Pilote livre 2 fichiers : index.html + CONTEXT_REEL_MEDIA.md mis à jour
6. David crée une branche, upload, ouvre PR, teste preview Netlify (incognito + Cmd+Shift+R), merge si OK
7. David clique "Synchroniser maintenant" sur le project knowledge

## RÈGLES D'OR
- index.html dans le project knowledge = SOURCE OFFICIELLE ; toujours modifier l'existant
- EQUIPE_FALLBACK = [] ; CHEF_PAR_DEFAUT = 'Benjamin'
- Format prompts Claude Code : intention + emplacement, sans code JS/HTML prescriptif
- À CHAQUE modif de code, livrer AUSSI le CONTEXT_REEL_MEDIA.md mis à jour
- Sur fichiers sensibles (login.js, auth), JAMAIS merger sans vérification du pilote ET test
  de connexion en preview
- Quand on échoue sur un design, oser revenir au simple plutôt qu'empiler des fix
- Ne jamais coller en clair des codes d'accès / secrets dans les chats

═══════════════════════════════════════════════════════════════
## PROJET
═══════════════════════════════════════════════════════════════
- App : Réel Média Production (suivi prod TV/vidéo), fichier unique index.html + CSS séparés
- Repo GitHub : David-f10/reel-media-production
- Prod : reel-media-production.netlify.app
- Backend : netlify/functions/notion.js (proxy API Notion) + netlify/functions/login.js (auth)
- CSS : css/base.css, css/layout.css, css/components.css, css/views.css
  (⚠️ variables CSS dans css/base.css, pas dans index.html — vérifier via "var(--xxx)")
- Monitoring : Sentry (org rushup, projet reel-media-production, data EU) — EN PROD
- État du main : à mettre à jour selon merges. Branches livrées EN ATTENTE DE MERGE :
  `montage-reactivite` (5091) puis `login-optgroup` (5106).
- À supprimer sur GitHub : `login-grille`, `login-dropdown` (abandonnées).

## AUTHENTIFICATION (login)
- login.js lit la base 👥 Équipe, trouve la personne par UUID, compare "Code acces" (rich_text).
  Renvoie {ok, user:{id,nom,role}}.
- Front : initLogin() charge l'équipe depuis Notion → peuplerSelect remplit le <select> natif
  avec <optgroup> par rôle. Comptes = fiches Notion avec "Code acces" rempli. PAS de liste
  de comptes en dur dans login.js.
- Ajouter un utilisateur : le MASTER lui met "Code acces" + "Role" dans Équipe. Rien à coder.

## NOTIFS — comment ça marche
- loadNotifs filtre les notifs où "Destinataire" (rich_text) === currentUser.nom.
- createNotif prend un nom de destinataire en paramètre. Pas de whitelist.
- Système universel : toute personne dans Équipe peut recevoir et voir ses notifs, à condition
  que son NOM soit STRICTEMENT IDENTIQUE entre la base Équipe et le champ "Destinataire"
  des notifs (attention aux espaces traînantes, variantes orthographiques).
- Les Brand n'utilisent pas les notifs (consultation seule).

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
- ✅ Feature Brand ; Troncature titres + tooltips ; Kanban 220px
- ✅ Refresh fiche détail (refreshDetail, débounce 300ms)
- ✅ Sentry ; Phase A (window.onerror + bandeau Notion)
- ✅ Renommage Montage + Réactivité — confirmé rapide par David (à confirmer si déjà mergé)

**EN ATTENTE DE MERGE** : `login-optgroup` (login <select> groupé par rôle).

═══════════════════════════════════════════════════════════════
## EN ATTENTE / PLUS TARD (non prioritaire)
═══════════════════════════════════════════════════════════════
- À la 1re connexion d'un Brand : vérifier qu'il voit bien SES lives (Master à vérifier
  côté Notion les associations "Client" sur les vidéos Brand).
- 3 cartes Brand sans Sous-format : B09W, B19E, B09U (côté master).
- Backup automatique (GitHub Actions, export Notion nightly).
- Intégration GitHub↔Sentry.
- (Optionnel) Régénérer les codes d'accès des 5 nouveaux : ont circulé en clair dans un chat
  Master le 2026-05-28. Pas critique mais hygiène.
- (Optionnel) Protéger la branche main (require PR + no force push).

═══════════════════════════════════════════════════════════════
## NOTES TECHNIQUES UTILES
═══════════════════════════════════════════════════════════════
- ⚠️ `grep -c` retourne code 1 quand compte = 0 → casse les `&&`. Utiliser `|| true`.
- ⚠️ Variables CSS dans css/base.css (pas index.html). Vérifier via "var(--xxx)".
- Vérif tooltips : grep -F 'title="${s.titre' (le $ casse grep normal).
- Vue active = appSetVue(currentVue), rendu LOCAL depuis `sujets`, zéro API.
- refreshUI(id, forcePadOpen) = appSetVue(currentVue) si production + refreshDetail(id) débouncé.
- openDetail(id) lourde (~7 appels API) ; refreshDetail la ré-ouvre débouncé 300ms.
- Login : <select> natif #login-nom avec <optgroup> par rôle. doLogin lit value du select.
  peuplerSelect(equipe) génère les groupes (match exact m.role === 'Chef'/etc.).
- Rôles canoniques (utilisés par renderEquipeList ET peuplerSelect) :
    ['Chef', 'Journaliste', 'Monteur', 'Brand']
- Statuts (STATUS_ORDER) : Brief / Idée, Séquencier en cours, Séquencier validé, En tournage,
  Post-prod, Montage (ex « Montage V1 »), Retours, Validation chef, PAD.
- Couleurs format : MAG bleu, Brand ambre, Face Cam rouge, Desk gris, YouTube vert.
- Journalistes : Julien, Augustin, Nico, Mickael, Juliette, Mathilde, Léa, Sophie L., Éloise,
  Juliette B, David, Enrique C, Benjamin, Alice Guionnet, Romain Canault, Camille,
  Hervé Grandchamp, Anne Burlot.
- Chefs : Benjamin (défaut), Arnaud, Chloé. Monteurs : Thierry, David.
- Brand (contacts client) : Arnaud C, Guillaume, Louise, Victor.

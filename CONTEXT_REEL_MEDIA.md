# PASSATION — Réel Média Production (contexte pilote)

> Dernière mise à jour : 2026-07-15

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

### 2026-07-15 — Téléchargement direct des vidéos Drive via permission éphémère (piste B)
5 fichiers : `netlify/functions/drive-download.js` (NOUVEAU), `netlify/functions/drive-permsweep.js` (NOUVEAU, Scheduled), `netlify/functions/_blobs.js` (ÉTENDU), `index.html` (5755 → **5785 lignes**, +30), `netlify.toml` (ajout schedule). Aucune modif CSS, Notion, login.js. `drive.js` inchangé (reste readonly).

**PROBLÈME**
Le bouton « Télécharger » d'une version renvoyait un 403 Google. Cause : vidéos Drive « Restreint » + utilisateurs multi-comptes Google → Google épingle le mauvais compte (authuser). Durcissement côté Google, code `toDlUrl` inchangé depuis le 3 juin. La lecture (réglée par PR #30) fonctionnait ; seul le téléchargement restait cassé. Toutes les pistes de lien direct sans proxy sont mortes en multi-compte (403), rendre public en permanent = REFUSÉ (confidentialité clients), Solution A (files.download via SA) = INTERNAL 500 systématique côté Google.

**LA SOLUTION (piste B, validée par spike sur RM_GALLIA_HAPS_SAFETY 140 Mo)**
Au clic, le serveur (Service Account, scope drive complet) rend le fichier temporairement public, génère un lien de téléchargement public (`drive.usercontent.google.com/download?id=...&export=download&confirm=t`), puis re-privatise immédiatement. Fenêtre publique ≈ quelques centaines de ms (le lien reste valide quelques minutes après révocation, le temps de télécharger). Message antivirus Google sur fichiers >100 Mo = NORMAL (pas une erreur).
- `drive-download.js` (NOUVEAU) : POST {id, code, fileId} → verifyUser (401 si invalide, JAMAIS ouvert à tous) → pré-contrôle canShare (403 explicite si SA ne peut pas partager) → permissions.create(anyone, reader) → **écriture registre Blobs AVANT toute suite** → downloadUrl → révocation immédiate + sortie du registre. Constante IMMEDIATE_REVOKE=true (repli false si preview montre que le lien ne survit pas à la révocation → c'est alors le sweep qui referme). downloadUrl jamais loggé.
- `drive-permsweep.js` (NOUVEAU, Scheduled `*/10 * * * *`) : filet de sécurité. Couche 1 = révoque les entrées du registre « drive-open-perms » plus vieilles que TTL 5 min (n'existent que si drive-download a planté avant sa révocation). Couche 2 = rattrapage best-effort via files.list `visibility='anyoneWithLink'`, bornée à 100, ne fait jamais échouer la couche 1. Logs = compteurs uniquement, jamais d'URL ni de nom de fichier.
- `_blobs.js` (ÉTENDU) : ajout de `getDriveOpenPermsStore()` (store « drive-open-perms »). getPushStore + getAuthTokenStore inchangés.
- `index.html` : fonction `telechargerVersion(fileId, btnEl)`. PWA standalone → navigateur externe (session isolée, cohérent avec la lecture). Session sans code/user → repli page Drive /view. Sinon → POST drive-download avec {id, code (rm-code), fileId} → déclenche le téléchargement via `<a download>` + toast ; repli /view en cas d'erreur. fileId via getDriveFileId existant.
- `netlify.toml` : `[functions."drive-permsweep"] schedule = "*/10 * * * *"`.

**VÉRIF PILOTE (OK)**
node --check sur les 3 fonctions + JS inline index.html (270k chars) valide. index.html 5785 lignes (5755 +30, cohérent). Compteurs préservés : CHEF_PAR_DEFAUT='Benjamin'=1, EQUIPE_FALLBACK=[]=1 (avec garde), createNotif=27, journMonteursNoms=4, refreshJournMonteursSelects=7, annulerVersion=2, showHelpModal=2, showConfirmModal=2, validationBrand=16, DB_CLIENTS_BRAND=6. Sécurité serveur : verifyUser obligatoire AVANT toute action Drive (401 sinon) ; registre écrit AVANT révocation (rattrapage sweep si crash) ; scope `auth/drive` limité aux 2 nouvelles fonctions ; câblage front↔back cohérent (mêmes params id/code/fileId).

**À FAIRE PAR DAVID / OPS**
- Déployer les 2 fonctions sous leurs noms AVEC TIRETS : `netlify/functions/drive-download.js` et `netlify/functions/drive-permsweep.js` (les uploads sans tiret ne sont qu'une contrainte d'upload ; sinon le front appelle une fonction inexistante et le schedule ne matche rien).
- MÉNAGE URGENT : supprimer du repo `drivedownloadtest.js` et `drivepermtest.js` (fonctions de test sans sécurité, encore en prod sur main — drivepermtest peut rendre des fichiers publics).
- Faire partager par **Arnaud** (proprio) le dossier racine de prod Drive avec `reelmedia-drive@reelmedia-prod.iam.gserviceaccount.com` en **ÉDITEUR**. Dernière pièce : sans ça, ne marche que sur les fichiers déjà partagés avec le SA. David n'a pas les droits sur ce dossier.
- Déployer sur une branche, tester en preview avant merge. Puis nettoyer.

**POINTS D'ATTENTION**
- Concurrence : 2 téléchargements simultanés du même fichier → la révocation de l'un pourrait couper l'autre (rare). À surveiller à l'usage.
- Scope drive complet donne au SA le droit de modifier les partages (nécessaire pour piste B) — assumé.

**RESTE EN SUSPENS (autres sujets)** : bouton « Dossier » d'une version ouvre le FICHIER au lieu du DOSSIER PARENT (régression Drive, à reprendre) · écrans noirs de lecture ponctuels selon le compte Google actif (multi-compte, non prioritaire) · Phase B sécurité (expiration session) · Phase C (CORS/rate-limiting) · backup nightly Notion→JSON · rename « Montage V1→Montage ».


### 2026-06-05 — Lecture vidéo Drive en PWA via auto-login par jeton éphémère (branche `journ-monteurs-dynamiques`, empilé sur le fix journalistes)
index.html 5637 → **5755 lignes**. 4 fichiers : index.html (modifié), netlify/functions/_blobs.js (étendu), auth-token-create.js + auth-token-consume.js (nouveaux). Aucune modif CSS, Notion, ni login.js.

⚠️ NOTE WORKFLOW : la branche `journ-monteurs-dynamiques` n'avait jamais été commitée (le fix journalistes était livré mais pas commité). Claude Code a donc REFAIT le fix journalistes (Phase 1) PUIS empilé la vidéo PWA (Phase 2) sur la même branche. Les DEUX travaux sont sur cette branche, non commités, en attente de validation.

**PROBLÈME**
Les versions vidéo sont des fichiers Google Drive en partage "Restreint". L'iframe Drive `/preview` a besoin de la session Google de l'utilisateur (cookies). En PWA installée (Safari standalone surtout), les cookies sont isolés → erreur Google 400, la vidéo ne s'affiche pas. En navigateur classique, ça marche (la session Google passe). Confirmé par David : fichier B19E V2 = "Restreint". Toute l'équipe a accès au Drive avec son propre compte Google.

**PISTES ÉCARTÉES (analyses Claude Code + recherches pilote)**
- Rendre les vidéos publiques : REFUSÉ par David (confidentialité montages clients).
- `<video>` HTML5 direct sur URL Drive : même problème de cookies + blocage gros fichiers (>100 Mo). Enterré.
- Se connecter une fois à Google dans la PWA : IMPASSE. Le partitionnement des cookies tiers (Safari ITP) empêche l'iframe Drive de voir la session top-level. Storage Access API non exploitable (c'est à Google de l'appeler, pas nous). Confirmé par 2 sources + Claude Code.
- Proxy serveur (streamer le binaire via Netlify + Service Account) : faisable mais ~19€/mois (dépassement bande passante), discipline ops (partage SA), risque de saccades. Mis de côté.
- OAuth utilisateur + blob : pas de streaming (téléchargement complet avant lecture), RAM élevée. Écarté.

**DÉCISION DE DAVID** : le streaming fluide prime sur "rester dans l'app". Il accepte que la vue s'ouvre dans le navigateur. Il veut que ce soit transparent (pas de reconnexion). Comme la session app (rm-user en localStorage) est ISOLÉE entre PWA et navigateur Safari, ouvrir la vue dans le navigateur reposait le problème de connexion à l'app → résolu par auto-login via jeton éphémère.

**SOLUTION RETENUE (vue complète vidéo + retours dans le navigateur, auto-login sûr)**
- En PWA standalone, à l'ouverture d'une version Drive (`type==='drive' && isPWAStandalone()`), on ouvre toute la vue lecteur dans le navigateur externe.
- Auto-login SÛR : la PWA demande un jeton éphémère à `auth-token-create` (envoi {id, code} en POST, jamais dans l'URL), met le jeton dans l'URL `/?t=...&action=player&v=...&l=...&s=...&ver=...`, ouvre le navigateur dessus. Le navigateur consomme le jeton via `auth-token-consume` (usage unique, suppression atomique), pose `rm-user` (PAS `rm-code`), nettoie l'URL, et route vers openPlayer.
- Jeton = aléatoire 256 bits (crypto.randomBytes), TTL **120s**, stocké dans Netlify Blobs (store "auth-tokens", réutilise les variables NETLIFY_SITE_ID + NETLIFY_BLOBS_TOKEN existantes). Usage unique strict.
- Hors PWA (navigateur classique) : comportement INCHANGÉ (iframe interne).
- Vimeo/YouTube/Frame.io NON affectés (déviation uniquement pour Drive).

**DÉCISIONS VALIDÉES** : TTL 120s · jamais le code dans l'URL · session Safari sans rm-code (donc sans push côté Safari = accepté, Safari = "second écran") · hook Sentry beforeSend pour masquer `t`.

**LIMITES ASSUMÉES (dites à David, acceptées)**
- Basculement PWA→navigateur VISIBLE (on ne peut pas l'ouvrir invisiblement dans la PWA).
- Retour dans la PWA MANUEL (clic icône) — impossible à automatiser. Mais comme la vue complète (vidéo + retours) est dans le navigateur, l'utilisateur n'a pas besoin de revenir tout de suite.
- Latence 3-7s (clic → vidéo lisible) dont cold start Netlify 0,8-2s.
- Fenêtre de quelques secondes où le jeton est dans l'URL/logs avant consommation → acceptable car usage unique + TTL court.

**VÉRIF PILOTE (OK)** : node --check sur les 4 fichiers OK · condition déviation = `if(type === 'drive' && isPWAStandalone())` (exclusive) · 0 occurrence du code dans les params URL · rm-code jamais posé côté Safari (commentaire explicite) · Phase 1 préservée (journMonteursNoms=4, refreshJournMonteursSelects=7) · createNotif=27 · EQUIPE_FALLBACK=[]=1 · CHEF_PAR_DEFAUT présent.

**À FAIRE PAR DAVID** : feu vert Claude Code pour commiter (Phase 1 + Phase 2 ensemble) sur `journ-monteurs-dynamiques` → push les 4 fichiers → PR → tester en preview : (1) journalistes+monteurs dans les 3 menus + sync ajout/suppression ; (2) en PWA, clic ▶ sur version Drive → ouvre Safari, auto-login, vue lecteur ; URL sans `?t=` après chargement ; (3) hors PWA → iframe interne inchangée ; (4) jeton expiré (attendre >2 min) → écran login + toast. Variables Netlify Blobs déjà en place (rien à créer).

**RESTE EN SUSPENS (non tranché)** : choix approche A vs B pour le comportement exact (ici on a fait : déviation directe en PWA, pas de bouble iframe+bouton). Si jamais l'auto-login pose souci à l'usage, fallback = bouton "ouvrir navigateur" simple.


### 2026-06-05 — Listes Journaliste/Monteur dynamiques depuis Notion (branche `journ-monteurs-dynamiques`)
index.html 5622 → **5637 lignes** (+15). Aucune modif CSS, Notion ni serveur. Fix 100 % code front.

**PROBLÈME**
Au moment de choisir un journaliste sur les cartes (formulaire "Nouveau sujet", fiche détail d'un sujet, sélecteur "Responsable" d'une version de montage), tous les membres de l'équipe n'apparaissaient pas. Le login affichait pourtant bien tout le monde. Cause : ces 3 sélecteurs étaient remplis par des **listes de prénoms écrites EN DUR** dans le code (8 à 13 noms figés), jamais reliées à la variable `equipe` (chargée depuis Notion au démarrage). Conséquence : les nouveaux membres (Alice Guionnet, Romain Canault, Camille, Hervé Grandchamp, Anne Burlot, etc.) n'étaient pas proposés, et il fallait modifier le code à chaque ajout/suppression.

**BESOIN PRINCIPAL EXPRIMÉ PAR DAVID**
"Dès que j'ajoute ou supprime un journaliste (via la modale Gérer l'équipe), il doit se retrouver / disparaître PARTOUT, automatiquement, sans toucher au code."

**LE FIX**
- Nouveau helper `journMonteursNoms()` : retourne `equipe.filter(role==='Journaliste'||role==='Monteur')`, noms triés alpha (localeCompare 'fr'). `equipe` devient la **source unique de vérité**.
- Nouveau `refreshJournMonteursSelects(currentNom)` : reconstruit le `<select #n-journ>` depuis `equipe`, préserve la valeur courante (l'ajoute si absente pour ne jamais perdre une assignation).
- Les 3 sélecteurs lisent désormais `journMonteursNoms()` au moment de leur affichage :
  - `#n-journ` (formulaire Nouveau sujet) : reconstruit dans `openNouveau` (HTML statique vidé, ligne 286).
  - "Journaliste" fiche détail (ex-`tousNoms`, ligne ~789) : IIFE depuis `journMonteursNoms()` + garde-fou sur `s.journaliste`.
  - "Responsable" version (ex-`tousLesNoms`, ligne ~2121) : `journMonteursNoms()` + garde-fou sur le `monteur` courant par version.
- Sync immédiate : `equippeAjouter` et `equipeSupprimerJournaliste` appellent maintenant `refreshJournMonteursSelects()` (en plus du `equipe.push`/`filter` déjà présent). Ajout/suppression via "Gérer l'équipe" → reflété tout de suite dans les menus.
- Garde-fou anti-perte de données : si une carte a un journaliste assigné qui n'est plus dans la liste filtrée, la valeur reste affichée et sélectionnée (jamais écrasée).
- Ancien système neutralisé : tableau `journalistes` (11 noms en dur) → `let journalistes = []` (conservé vide, défensif). Les 3 anciennes fonctions (`addJournalisteToSelects`/`removeJournaliste`/`refreshJournalistesSelects`) deviennent des alias inertes qui délèguent au nouveau système.

**VÉRIF PILOTE (OK)** : node --check OK ; CHEF_PAR_DEFAUT='Benjamin'=1 ; EQUIPE_FALLBACK=[]=1 ; createNotif=27 (identique main) ; 0 occurrence des anciennes listes en dur (`let journalistes=['Julien'…]`, `tousLesNoms=['Julien'…]`, `tousNoms=['Benjamin'…]`, HTML statique `<option>Julien…`) ; acquis préservés (annulerVersion=2, showHelpModal=2, showConfirmModal=2, validationBrand=16, DB_CLIENTS_BRAND=6, refreshUI=1, location.reload=0).

**LIMITE CONNUE (signalée, non bloquante)** : si on ouvre "Nouveau sujet" AVANT la fin du chargement de `equipe` (connexion ultra-lente), le menu est momentanément vide (Choisir… + Nouvelle personne). Pas de fallback offline pour cette liste (cohérent avec le main historique). Se règle en rouvrant le formulaire.

**À FAIRE PAR DAVID** : feu vert à Claude Code pour commiter sur `journ-monteurs-dynamiques` → push → PR → tester en preview (vérifier que tous les journalistes+monteurs apparaissent dans les 3 menus, et qu'un ajout/suppression via "Gérer l'équipe" se reflète tout de suite) → merger si OK.


### 2026-06-05 — Correctif push : configuration explicite de Netlify Blobs (branche `pwa-push`)
4 fichiers : `_blobs.js` (nouveau helper) + `notify.js`, `push-subscribe.js`, `push-unsubscribe.js` (modifiés).

**PROBLÈME DÉTECTÉ AU TEST**
La notif Notion se créait bien (cloche OK) mais le push n'arrivait jamais sur l'iPhone. Logs de `notify` : "Push skipped: The environment has not been configured to use Netlify Blobs. To use it manually, supply the following properties when creating a store: siteID, token". Les clés VAPID fonctionnaient (push-config renvoyait bien la clé publique). Seul l'accès Netlify Blobs était cassé : `getStore('push-subs')` n'arrivait pas à s'auto-configurer dans le contexte de déploiement.

**LE FIX**
- Nouveau helper `netlify/functions/_blobs.js` : `getPushStore()` qui fait `getStore({ name: 'push-subs', siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN })`. Lève une erreur claire si une variable manque.
- Les 3 fonctions (notify, push-subscribe, push-unsubscribe) importent `getPushStore` depuis `./_blobs` au lieu de `getStore` direct. Comportement inchangé (dédup endpoint, nettoyage 410/404).
- siteID et token jamais en dur, uniquement process.env.

**NOUVELLES VARIABLES NETLIFY CRÉÉES PAR DAVID** (en plus des 3 VAPID) :
- `NETLIFY_SITE_ID` (All scopes, Same value) = Site ID trouvé dans Site configuration → Project details.
- `NETLIFY_BLOBS_TOKEN` (All scopes, Same value) = Personal Access Token Netlify (avatar → User settings → Applications → Personal access tokens → New access token, No expiration), commence par nfp_.

**VÉRIF PILOTE (OK)** : node --check sur les 4 fichiers, aucun hardcode, les 3 fonctions utilisent getPushStore(), plus aucun getStore direct.

**À FAIRE PAR DAVID** : pousser les 4 fichiers sur pwa-push (netlify/functions/). Re-tester : déclencher une notif (autre user → retour sur ta carte), app fermée → le push doit arriver en 2-3s. Vérifier logs notify : plus de "Push skipped", et "pushed:1". Si OK → merger pwa-push dans main (FIN de la PR2 PWA).


### 2026-06-04 — PWA PR 2 « pwa-push » : cache de la coquille + push instantané « app fermée » (branche `pwa-push`)
index.html 5528 → **5622 lignes** (+94). sw.js 20 → **149 lignes**. package.json +2 deps. 5 fonctions Netlify créées + offline.html. 9 fichiers au total.

**CONTEXTE / BESOIN**
Cœur du projet : l'équipe bosse sur ordi mais rate les notifs → le téléphone doit FORCER la notif, même app complètement fermée, en quelques secondes. Push Web gratuit (0€), déclenché au moment de l'écriture serveur (pas de surveillance Notion). Rattachement device→personne par IDENTITÉ DE CONNEXION (currentUser), pas mail ni tel. Chacun a sa propre identité sur ordi ET tel. TOUS les types de notif déclenchent un push.

**PRÉ-REQUIS FAITS PAR DAVID (avant cette PR)**
- Node.js v24.16.0 installé (installeur .pkg nodejs.org).
- Clés VAPID générées via `npx web-push generate-vapid-keys`.
- 3 variables Netlify créées (Site config → Environment variables, toutes "All scopes · Same value", NON cochées secret car cocher secret force le mode scopes/contextes spécifiques compliqué) : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT = mailto:david@rushup.io. Variables existantes préservées (NOTION_TOKEN, GOOGLE_SERVICE_ACCOUNT).
- Branche pwa-push créée depuis main (PR1 pwa-install déjà mergée).

**ARCHITECTURE LIVRÉE (9 fichiers)**
- `package.json` : + web-push ^3.6.7 + @netlify/blobs ^8.1.0 (googleapis préservé).
- `netlify/functions/_auth.js` : module partagé verifyUser(id,code) via base Équipe, cache 60s (préfixe _ = non exposé comme function).
- `netlify/functions/push-config.js` : renvoie VAPID_PUBLIC_KEY au client.
- `netlify/functions/push-subscribe.js` : POST {id,code,subscription}, SÉCURISÉ via verifyUser (401 si invalide), stocke dans Netlify Blobs store "push-subs" clé=nom, multi-device dédupliqué par endpoint.
- `netlify/functions/push-unsubscribe.js` : POST {nom,endpoint}, retire le device (pas d'auth code, nettoyage volontaire).
- `netlify/functions/notify.js` : POST {type,sujetId,sujetCode,sujetTitre,destinataire,auteur,message} → (1) crée la page Notion base Notifications 4398775b (champs vérifiés par le Master : Message title, Type select, Destinataire/Auteur/Sujet ID/Sujet code/Sujet titre en text=rich_text, Lu checkbox — casse "Sujet code"/"Sujet titre" en minuscule confirmée), (2) garde-fou destinataire===auteur skip, (3) push VAPID à chaque device, retire subs 410/404. Push best-effort (notif Notion créée même si push échoue).
- `sw.js` étendu : SW_VERSION 2026-06-04-2. Cache : functions=network-only (fraîcheur Notion critique), HTML=network-first+fallback offline.html, CSS=stale-while-revalidate, icons/manifest=cache-first, CDN=cache-first opaque. Handlers push + notificationclick (ouvre /?sujet=X ou postMessage open-sujet).
- `offline.html` (racine) : page hors-ligne fond #001349.
- `index.html` : createNotif migrée vers /.netlify/functions/notify (1 seul endroit, 27 call sites). Helpers subscribePush/unsubscribePush/urlBase64ToUint8Array. showApp demande permission+subscribe. doLogin stocke rm-code. doLogout unsubscribe. Gestion ?sujet=X au démarrage + listener serviceWorker open-sujet.

**VÉRIF PILOTE (OK)** : clé privée jamais en dur (process.env uniquement). node --check OK sur les 6 JS. 5622 lignes, createNotif 27 call sites intacts. Acquis préservés (setFiltersVisible=5, getBoundingClientRect=0, has-filters=0, clearDate=4, validationBrand=16, DB_CLIENTS_BRAND=6, refreshUI=1, annulerVersion=2, showHelpModal=2, EQUIPE_FALLBACK=[], CHEF_PAR_DEFAUT='Benjamin'). Schéma base Notifications confirmé compatible par le Master.

**⚠️ NOMMAGE FICHIERS FONCTIONS** : sur GitHub, créer avec le tiret — `push-config.js`, `push-subscribe.js`, `push-unsubscribe.js` (Claude Code les livre parfois sans tiret). index.html les appelle avec tiret.

**À FAIRE PAR DAVID APRÈS PUSH**
1. Vérifier build Netlify : logs "added 2 packages" (web-push + @netlify/blobs).
2. IMPORTANT : tous les users doivent se DÉCONNECTER puis RECONNECTER une fois après déploiement (rm-code n'existait pas avant → sans lui subscribePush retourne false silencieusement).
3. Désinstaller/réinstaller PWA depuis Safari, login, accepter permission notifs, vérifier logs push-subscribe {ok:true}, tester push app fermée (cible 2-3s).
4. SW_VERSION à incrémenter manuellement à chaque futur déploiement.

**QUESTIONS OUVERTES (faible risque)** : rm-code en localStorage (durcissable via token court) ; push-unsubscribe sans auth (endpoint déjà secret).


### 2026-06-04 — Correctif PWA : safe-area sur la modale lecteur/retours (branche `pwa-install`)
css/views.css 156 → **160 lignes** (+4). Aucun autre fichier touché.

**CONTEXTE**
Après test de la PWA installée sur iPhone 14 (iOS 26.5) : tout fonctionne en plein écran (icône bleu marine, splash, .topnav décalée correctement). MAIS sur la vue retours/lecteur (overlay `#video-player-modal` ouvert par `openPlayer`), le header du haut (code carte + label version + bouton Dossier + ×) était masqué par la barre de statut iPhone (heure, réseau, batterie). Cette vue est en position:fixed;inset:0 et n'a pas de .topnav, donc la règle safe-area de la PR1 ne la couvrait pas.

**LE FIX**
- Ajout en fin de css/views.css (hors @media) : `#video-player-modal{padding-top:env(safe-area-inset-top)}`.
- `#video-player-modal` = ID unique créé/supprimé dynamiquement par `openPlayer` (index.html ~2958). Décale tout le contenu de la modale (header + body) d'un seul bloc sous la barre de statut.
- Pas de double décalage (header et player-modal-body n'ont pas de safe-area propre). En navigateur classique, env(safe-area-inset-top)=0 → rendu inchangé.

**VÉRIF PILOTE (OK)** : 160 lignes, règle unique (pas de doublon), acquis views.css préservés (player-modal-*, cal-nav, flex-wrap:nowrap, next-shoot-item, activite-item). Aucune autre vue affectée.

**À POUSSER (David)** : css/views.css sur la branche `pwa-install`. Re-tester la vue retours/lecteur sur iPhone (désinstaller+réinstaller la PWA pour vider le cache) → le header ne doit plus être masqué par l'heure/batterie. Puis merger `pwa-install` dans `main`.


### 2026-06-04 — PWA PR 1 « pwa-install » : app installable + plein écran (branche `pwa-install` depuis `main`)
index.html 5528 → **5546 lignes** (+18). layout.css : +1 règle (safe-area). 2 fichiers créés : `manifest.json`, `sw.js`. 5 icônes ajoutées à la racine.

**CONTEXTE**
Démarrage de la transformation en PWA complète. Objectif final (validé) : notifications push instantanées « app fermée », gratuites (0€), délai 2-3s. Découpé en 2 PR :
- PR 1 (celle-ci) : rendre l'app installable sur l'écran d'accueil iPhone/Android, plein écran, + service worker minimal (prérequis du push).
- PR 2 (à venir) : cache de la coquille + offline + push Web (VAPID, Netlify Blobs, fonction notify.js).

**CE QUI A ÉTÉ FAIT (PR 1)**
- `manifest.json` créé à la racine : name « Réel Média Production », short_name « Réel Média », start_url `/?source=pwa`, scope `/`, display standalone, orientation portrait, lang fr, theme_color + background_color `#001349` (bleu marine officiel du logo), 3 icônes (192 any, 512 any, maskable 512).
- `<head>` index.html : viewport enrichi de `viewport-fit=cover` (pas de doublon) + 7 balises PWA (manifest, theme-color, apple-mobile-web-app-capable/status-bar-style black-translucent/title, apple-touch-icon, favicon-32).
- `sw.js` créé à la racine : version minimale, `SW_VERSION='2026-06-04-1'`, install→skipWaiting, activate→clients.claim, fetch en passthrough (NE CACHE RIEN — le cache vient en PR 2). Présent pour rendre l'app installable et pour recevoir le push en PR 2.
- Script inline avant `</body>` : enregistrement défensif du SW (if 'serviceWorker' in navigator).
- `css/layout.css` : règle finale `.topnav{padding-top:env(safe-area-inset-top);height:calc(52px + env(safe-area-inset-top))}`. En navigateur classique safe-area=0 → rendu inchangé. Effet uniquement en PWA installée iOS (barre sous la Dynamic Island).

**ICÔNES (à la racine du repo)** : `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180×180), `icon-maskable-512.png`, `favicon-32.png`. Générées depuis le logo officiel SVG « RM Avatar » (fond bleu marine #001349, texte blanc, accent rouge #ff451a).

**VÉRIFICATIONS PILOTE (toutes OK)**
- 5546 lignes (= 5528 +18). head valide (1 head, 1 viewport, 1 body). node --check OK (sw.js + scripts inline).
- Préservation acquis : setFiltersVisible=5, getBoundingClientRect=0, has-filters=0, clearDate=4, toDlUrl=2, player-modal-body=1, validationBrand=16, DB_CLIENTS_BRAND=6, refreshUI=1, createNotif=27. EQUIPE_FALLBACK=[] et CHEF_PAR_DEFAUT='Benjamin' intacts.
- manifest.json JSON valide. layout.css : safe-area sans impact desktop.

**À POUSSER (David)** : 5 icônes (racine) + manifest.json + sw.js + index.html + css/layout.css, sur branche `pwa-install` depuis `main`.
**TEST iPhone (14, iOS 26.5)** : Safari → Partager → Sur l'écran d'accueil → lancer depuis l'icône → plein écran + splash bleu marine. Vérifier topnav non mangée par la Dynamic Island. Web Inspector : SW en état « activated », pas d'erreur « SW register failed ».

**PLAN PWA VALIDÉ (architecture push, pour PR 2)**
- Déclencheur : `createNotif` (centralisée, 27 call sites) cessera d'appeler le proxy générique et appellera une nouvelle fonction `notify.js` qui (1) crée la page Notion comme aujourd'hui puis (2) envoie le push Web VAPID aux subscriptions du destinataire.
- Stockage subscriptions : Netlify Blobs (gratuit, ~50ms), 1 entrée par utilisateur = liste de devices.
- Clés VAPID : à générer 1 fois (`npx web-push generate-vapid-keys`), à mettre en variables d'env Netlify (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT).
- Sécurité subscribe : exiger le code d'accès (re-vérif comme login.js) pour éviter qu'on s'enregistre sous le nom d'un autre.
- Fallback : iOS < 16.4 ou permission refusée → polling existant 60s. (Note : iPhone de test = 14 / iOS 26.5, push pleinement supporté.)
- Web Push complet = 0€ (free tier Netlify, Notion sans webhook nécessaire). Délai médian 2-3s.


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
- ⚠️ ÉQUIPE = source unique de vérité Notion (base 👥 Équipe). Depuis 
  le 2026-06-05, les 3 menus de choix du journaliste (Nouveau sujet, 
  fiche détail, Responsable version) sont construits dynamiquement via 
  `journMonteursNoms()` = `equipe.filter(role Journaliste|Monteur)`. 
  NE PLUS jamais coder de liste de prénoms en dur : tout ajout/suppression 
  se fait dans Notion (ou via la modale "Gérer l'équipe") et se propage 
  automatiquement partout.
- Membres connus (indicatif, la vérité reste Notion) :
  - Chefs : Benjamin (défaut), Arnaud, Chloé
  - Monteurs : Thierry, David
  - Journalistes : Julien, Augustin, Nico, Mickael, Juliette, Mathilde, 
    Léa, Éloise, Alice Guionnet, Romain Canault, Camille, 
    Hervé Grandchamp, Anne Burlot
  - Brand (Contact Brand) : Arnaud C, Guillaume, Louise, Victor

- **Mobile (≤700px)** : bottom-nav 4 items (Dashboard/Production/
  Idées/Tâches) avec pastilles, panneau notif full-width, modale 
  détail padding réduit, bouton × tap-target 44px avec fond léger, 
  inputs font-size:16px, **bandeau filtres statuts directement dans 
  le flux .main-area sous les view-tabs (PLUS dans la sidebar)** — 
  toggle 1 ligne via .is-visible, vue retours équipe en colonne 
  (lecteur 45vh haut, panneau 55vh bas)
- **Vider une date** : bouton × dans .date-wrap. Fonction 
  clearDate(id, field, btnEl).
- **Bouton Télécharger** : fonction `telechargerVersion(fileId, btnEl)`
  (depuis 2026-07-15, remplace l'ancien toDlUrl direct devenu 403 en
  multi-compte). PWA standalone → navigateur externe (/view). Session
  sans code/user → repli /view. Sinon → POST /.netlify/functions/
  drive-download {id, code, fileId} qui ouvre une permission anyone
  éphémère côté SA, renvoie downloadUrl public, referme aussitôt ;
  déclenchement via <a download>, repli /view si erreur. Filet :
  drive-permsweep (Scheduled 10 min) referme toute permission restée
  ouverte. Prérequis ops : dossier prod partagé au SA en Éditeur.
  (Ancien toDlUrl toujours présent mais plus utilisé pour ce bouton.)
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

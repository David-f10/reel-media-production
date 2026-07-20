# PASSATION — Réel Média Production (contexte pilote)

> Dernière mise à jour : 2026-07-20 (visionnage + téléchargement client externe)

═══════════════════════════════════════════════════════════════
## 📝 HISTORIQUE DES MODIFS (plus récent en haut)
═══════════════════════════════════════════════════════════════

### 2026-07-20 — VISIONNAGE + TÉLÉCHARGEMENT CLIENT EXTERNE (gros chantier, 4 livraisons)
Le client externe qui reçoit un lien review peut désormais **VOIR** et **TÉLÉCHARGER** la vidéo sans compte Google et sans partage d'email. `index.html` JAMAIS touché.

**LE PROBLÈME**
Vidéos Drive en "Restreint" → un client sans accès tombait sur l'écran de connexion Google. Ni visionnage ni téléchargement possibles. (Le téléchargement semblait marcher : en réalité les testeurs avaient leurs propres droits Drive, la permission éphémère était décorative pour eux — bug masqué depuis le premier jour.)

**CE QUI A ÉTÉ ÉCARTÉ (tests réels, pas des suppositions)**
- **SPIKE `<video>` HTML5** sur URL usercontent (branche jetable, PR fermée sans merge) → **403 : Google refuse de streamer**, même avec permission "anyone" fraîchement ouverte, même sur Chrome. Voie morte. Le spike a économisé tout le chantier bâti dessus.
- **Vimeo** (~15€/mois, zéro code car l'app lit déjà les liens Vimeo) → écarté par David au profit du 0€.
- **Partage manuel des emails clients** → refusé (manuel + trou Safari).
- **Version A manuelle** (rendre la vidéo publique à la main) → impossible : le balayeur la referme en 10 min.

**CE QUI MARCHE (validé par test manuel)** : l'iframe **`/preview`** (lecteur natif Google) LIT une vidéo passée en "anyone with link" chez un visiteur non connecté → **OK Chrome desktop** (lecture + seek). **Safari/iOS = écran de connexion** (ITP cookies tiers, NON corrigeable). David assume ce trou : **ses clients sont sur ordinateur**.

**ARCHITECTURE — SESSION DE VISIONNAGE (3 étapes, balayeur en dernier)**
Principe : le Service Account (contributeur) ouvre la permission "anyone" **au clic du client**, l'iframe /preview affiche, révocation par session + heartbeat + TTL + sweep. **Confirmé en prod sur une vidéo dont David n'est PAS propriétaire** (D1206) → le SA ouvre bien la permission sur toutes les vidéos du dossier.

- **Étape 1 (PR #41)** — `drive-view-session.js` (nouveau, 122 l.) + `_drive.js` (217 l.) + `drive-download-review.js` (148 l., +1 ligne export `fileIdsDuSujet`).
  POST {action:'open'|'heartbeat'|'close', sujetCode, fileId}. Portier A∪B réutilisé. open → réutilise si session vivante (`reused:true`), sinon crée permission + entrée registre. heartbeat → `lastSeen=now`, refuse au-delà du cap. close → **antidate `lastSeen`, ne révoque JAMAIS** (multi-spectateurs). **FAIL-CLOSED** : throw AVANT toute création si Blobs KO.
  **SOURCE UNIQUE** : `isViewAlive` + `VIEW_IDLE_TTL_MS` (3 min) + `VIEW_MAX_SESSION_MS` (3h) définis et **exportés** depuis `_drive.js` → l'étape 3 importe les mêmes (divergence impossible).
  **COHABITATION** : `openEphemeralDownload` réutilise la permission si session vivante (`revoked:false`, ni création ni révocation) ; sinon cycle 0,3s **strictement inchangé**. Vit dans `_drive.js` → `drive-download.js` et `index.html` intouchés.
- **Étape 2 (PR #42)** — `review.html` (707 → 808 l.).
  **PROTECTION SCANNERS** : vignette "▶ Lancer la vidéo" — la permission ne s'ouvre **QU'AU CLIC**. Un scanner Gmail/Outlook qui pré-charge la page n'ouvre rien. `lancerVisionnage` → open → `injecterIframe` (/preview) → heartbeat 60s (pause si onglet caché, ré-open si `alive:false`) → close par `sendBeacon` sur pagehide. `visibilitychange` → heartbeat immédiat au retour d'onglet.
  **AUTO-LANCEMENT** au changement de version après le premier ▶ (drapeau `_viewSession.userStarted`, remis à false au pagehide) — décision David : une fois prouvé humain, pas de second clic.
  **MESSAGE SAFARI/iOS** (`isSafariOuIOS()` : iOS + Safari desktop + piège iPadOS via `maxTouchPoints`) → "ouvrez avec Chrome sur ordinateur, ou téléchargez". **REPLI** : si open échoue → iframe injectée quand même (jamais pire qu'avant).
- **Étape 3 (branche `view-session-etape3`)** — `drive-permsweep.js` SEUL (133 → 168 l.). LE FICHIER LE PLUS SENSIBLE.
  Couche 1 **type-aware** : entrée `view` → épargner si `isViewAlive` (+ ajout à l'ensemble `vivantes`), sinon révoquer + purger. Entrée **sans type = download → règle 5 min STRICTEMENT inchangée**. Couche 2 : `files.list visibility='anyoneWithLink'` → épargner `vivantes`, révoquer le reste (**catch-all orphelines préservé**). **CEINTURE ANTI-COURSE** : relecture fraîche du registre avant chaque révocation (une session ouverte pendant le passage n'est pas coupée). **FAIL-CLOSED** : registre KO → `vivantes` vide → tout révoqué. Constantes IMPORTÉES de `_drive.js` (0 redéfinition). Rollback = revert d'un fichier.
- **Complément (branche `dl-session`)** — `review.html` (808 → 821 l.).
  Le bouton **⬇ ouvre AUSSI une session** avant de télécharger → le téléchargement marche même **sans avoir cliqué ▶**. `window.open('', 'rm-download')` reste **AVANT tout await** (anti-popup). Utilise `viewSessionPost` + `demarrerHeartbeat` **directement, pas `lancerVisionnage`** → `userStarted` non posé par un simple téléchargement (la vignette ▶ reste cohérente). Repli si open échoue. **Bonus : le téléchargement Safari/iOS (leur repli) fonctionne désormais aussi.**

**TRIPLE GARDE-FOU (100% serveur, indépendant du client)**
① silence de heartbeat > 3 min → révocation ≤13 min · ② cap dur 3h appliqué même si les heartbeats continuent (`isViewAlive` intègre `expiresAt`) · ③ couche 2 catch-all ≤10 min. Pire cas absolu borné à ~3h10.

**MULTI-CLIENTS** : N clients sur la même vidéo = **UNE permission partagée** (réutilisation), refermée quand le **DERNIER** spectateur est parti. Fermer un onglet ne coupe pas les autres.

**COMPROMIS SÉCURITÉ ASSUMÉ (David)** : la vidéo est exposée "anyone with link" pendant le visionnage (minutes) au lieu de 0,3s. Argument validé : **la page review donne DÉJÀ accès au contenu complet** (bouton Télécharger légitime) → pas de risque nouveau. Ne concerne QUE les fichiers vidéo Drive pendant un visionnage — ni l'app interne, ni les données Notion.

**VÉRIFS PILOTE (toutes OK)** : node --check sur tous les fichiers. Constantes importées (0 redéfinition). Fail-closed avant toute création. Cohabitation download (cycle 0,3s intact hors session). Anti-popup (`window.open` avant tout await). `userStarted` non posé par le téléchargement. Couche 2 catch-all + ceinture anti-course. Aucune URL loggée. `index.html` et `drive-download.js` JAMAIS touchés.

**TESTS RÉELS VALIDÉS EN PROD (navigation privée = client externe)** : ▶ → vidéo lit + seek ✅ · vidéo dont David n'est PAS propriétaire ✅ · ▶ puis ⬇ → téléchargement ✅ · ⬇ SANS ▶ → téléchargement ✅.

**RESTE À VÉRIFIER** : session > 15 min sans coupure (validation étape 3 — si des coupures persistent, le sweep n'épargne pas correctement). Fermeture brutale → révocation ≤13 min. Orpheline → ≤10 min.

**⚠️ RÈGLE** : `drive-permsweep.js` = sécurité de TOUS les fichiers Drive. Toute modif future → chantier isolé, seul dans sa PR, plan de test dédié.


### 2026-07-17 — Contrôle de version + bandeau « Recharger » (branche `version-banner`)
1 fichier : `index.html` (5994 → **6022 lignes**, +28). **sw.js NON touché** (le mécanisme le contourne par construction). Précédé d'un AUDIT du cache PWA (voir "Cache PWA" en bas).

**POURQUOI**
Audit cache PWA : le piège "PWA figée" N'EXISTE PAS (index.html servi network-first + JS inline → un merge est reçu au prochain lancement, sans rien faire). MAIS un vrai cas restait : quelqu'un qui laisse la PWA ouverte en permanence des jours sans la relancer tourne sur du CODE périmé (avec des données fraîches via le tick — 2 mondes distincts). C'est le comportement attendu des 10 journalistes. Ce chantier couvre ce cas SANS toucher sw.js.

**LA SOLUTION (ETag, zéro maintenance — décision David)**
- `checkAppVersion()` : `fetch('/index.html', {method:'HEAD', cache:'no-store'})`, lit l'en-tête `etag`. 1er passage = baseline (`_appEtag`) ; ETag différent ensuite → une nouvelle version est en prod. Throttle interne : au plus 1 contrôle / 5 min (`_lastVerCheck`). Silencieux si pas d'ETag ou erreur réseau.
- **Pourquoi ETag et pas version.json/constante** : la discipline "incrémenter à chaque déploiement" a DÉJÀ échoué (SW_VERSION figé depuis juin malgré ~10 déploiements). L'ETag Netlify change AUTOMATIQUEMENT à chaque déploiement modifiant index.html → RIEN à faire au déploiement, jamais d'oubli possible. Bonus : le HEAD contourne sw.js par construction (le SW n'intercepte que les GET), et un version.json serait figé par le SW (route .json = cache-first) → piège évité.
- Greffé sur `autoRefreshTick` (1 ligne, fire-and-forget, non attendu → ne ralentit pas le refresh des données). PAS de nouveau timer → hérite pause onglet-caché + nettoyage logout. Baseline amorcée dans showApp() au démarrage.
- `#version-banner` (masqué par défaut) : DISTINCT du `#refresh-banner` (données). Rouge (`var(--red)`, texte blanc), "🚀 Nouvelle version de l'app disponible — Recharger", onclick `location.reload()`. Placé juste sous #refresh-banner. Les 2 bandeaux coexistent.
- **DÉCISION David : bandeau, PAS de rechargement auto** (contrôle total à l'utilisateur, jamais forcé, aucun risque de perte de saisie). Le bandeau s'affiche même pendant une saisie (totalement passif : rien sans clic volontaire), pas de logique de masquage (plus simple = plus robuste), reste jusqu'au reload.

**VÉRIF PILOTE (OK)**
node --check. sw.js non touché (absent du diff). checkAppVersion = HEAD /index.html + etag + throttle 5 min. Greffé sur le tick (aucun nouveau setInterval : seuls les 2 existants notifs+autoRefresh). Baseline dans showApp. 2 bandeaux distincts (couleur/texte/action séparés). Rafraîchissement auto données intact (autoRefreshTick 3, empreinte 2, editionEnCours 2, appliquerFresh 3). Compteurs préservés : createNotif=27, journMonteursNoms=4, refreshJournMonteursSelects=7, annulerVersion=2, validationBrand=16, DB_CLIENTS_BRAND=6, apiQueryAll=11, telechargerVersion=2, resolveDriveFolder=3, isPWAStandalone=3, renderSidebarCats=5, copierLienFiche=2, CHEF_PAR_DEFAUT='Benjamin', EQUIPE_FALLBACK=[]. Nouveaux : checkAppVersion=3, _appEtag=3, version-banner=2.

**À FAIRE DAVID** : branche `version-banner` (index.html) → PR → preview. TEST : se connecter, laisser tourner ≥1 tick ; pousser un changement d'index.html sur la même branche (redéploiement) → dans ~5-6 min le bandeau rouge apparaît sans rien interrompre ; clic "Recharger" → nouvelle version, bandeau disparu. Vérifier : onglet caché → aucun HEAD dans Network ; ETag présent sur /index.html (HEAD 200 avec en-tête etag). Merge.

**⚠️ RÈGLE D'OR (toujours valable)** : toute future modification de sw.js = bump de SW_VERSION obligatoire dans le même commit. sw.js est le fichier le plus risqué (mal fait = app cassée hors-ligne / 10 users bloqués) → chantier isolé, testé Safari+Chrome. Chantier reporté : passer les CSS en network-first dans sw.js (évite le décalage d'1 session sur les CSS après déploiement) — seul dans sa PR, avec bump SW_VERSION.


### 2026-07-17 — Favicon review + deep link vers une fiche (branche `deeplink-favicon`)
2 fichiers : `review.html` (705 → **707 lignes**, +2), `index.html` (5961 → **5994 lignes**, +33). Aucune fonction serveur. sw.js/cache PWA NON touché (chantier séparé).

**A. FAVICON review.html**
La page review client affichait le globe générique dans l'onglet (pas le logo Réel Média). Ajout des 2 balises favicon de index.html dans le <head> de review.html (après <title>) : `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` + `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">`. Fichiers existants à la racine, chemins absolus valides depuis review.html.

**B. DEEP LINK VERS UNE FICHE (usage ÉQUIPE, index.html seul)**
Depuis une fiche sujet ouverte, un bouton copie un lien partageable (Slack/WhatsApp) à un membre de l'équipe ; au clic, après login, la fiche s'ouvre directement.
- DÉCOUVERTE : le routage `?sujet=` existait DÉJÀ dans showApp (hérité du clic sur notif push, dans le .then() de appLoadData → timing login déjà bon : après login ET données chargées). Chantier = durcir l'existant + ajouter le bouton, pas créer.
- Format d'URL : `/?sujet=<id Notion>` — id UNIQUEMENT (décision David ①). PAS de tolérance au code : l'unicité du code B09Y n'est pas garantie (bug audit n°1), un lien par code pourrait ouvrir le mauvais sujet. openDetail travaille déjà par id.
- Résolution : `sujets.find(x => x.id === sujetParam)`. Trouvé → navTo('production') + openDetail. Introuvable (supprimé/archivé/faute) → `toast('Sujet introuvable ou archivé','err')` + navTo('dashboard'). JAMAIS de blocage (tout dans le .then du chargement réussi ; sans param, chemin strictement inchangé = else navTo dashboard).
- `history.replaceState` après consommation du ?sujet= (décision David ②) → F5 ne rouvre plus la fiche.
- Bouton "🔗 Copier le lien" (#d-copylink) dans le HEADER du modal #ov-detail uniquement (groupé à droite, à gauche de la croix) → jamais sur les cartes. copierLienFiche(this) : lien = origin+pathname+'?sujet='+_detailSujetId → clipboard + toast "Lien de la fiche copié 🔗" + libellé "Copié ✓" 1,5s, repli toast(lien) si presse-papier refusé. Globale `_detailSujetId` posée en tête d'openDetail.

**VÉRIF PILOTE (OK)**
node --check les 2 pages. Favicon = 2 balises vers fichiers existants (identiques index.html). Deep link : id-only confirmé, erreur→toast+dashboard, replaceState après ouverture, démarrage sans param strictement inchangé (else navTo dashboard intact), bouton dans le header modal seulement. sw.js et rafraîchissement auto INTOUCHÉS (autoRefreshTick=3, editionEnCours=2, empreinte=2, appliquerFresh=3 — le modal ouvert reste couvert par la garde .overlay.open). Compteurs préservés : createNotif=27, journMonteursNoms=4, refreshJournMonteursSelects=7, annulerVersion=2, validationBrand=16, DB_CLIENTS_BRAND=6, apiQueryAll=11, telechargerVersion=2, resolveDriveFolder=3, isPWAStandalone=3, renderSidebarCats=5, CHEF_PAR_DEFAUT='Benjamin', EQUIPE_FALLBACK=[]. Nouveaux : copierLienFiche=2, _detailSujetId=4, d-copylink=1.

**À FAIRE DAVID** : branche `deeplink-favicon` (review.html + index.html) → PR → preview. TESTS : onglet review → logo Réel Média (vider cache si besoin) ; fiche ouverte → bouton 🔗 → "Copié ✓" + toast → coller le lien dans un autre navigateur → login → la fiche s'ouvre seule + URL propre ; F5 → dashboard normal ; id bidon → toast "Sujet introuvable" + dashboard ; sans param → comme avant ; clic notif push → fiche comme avant. Merge.


### 2026-07-17 — Rafraîchissement automatique multi-utilisateur (avant partage aux ~10 journalistes)
1 fichier : `index.html` (5881 → **5961 lignes**, +80). Aucune fonction serveur. Précédé d'un AUDIT multi-utilisateur complet (voir plus bas).

**POURQUOI**
L'app va passer à ~10 personnes simultanées. Audit Claude Code : le risque d'ÉCRASEMENT de données est quasi nul (chaque action PATCH un champ ISOLÉ, pas la page entière → 2 personnes sur la même carte mais champs différents = pas de conflit). MAIS point bloquant : quand Benjamin a une vue/carte ouverte et qu'un journaliste modifie la même donnée, Benjamin ne voit RIEN tant qu'il ne recharge pas (aucun refresh auto). Ce chantier corrige ça.

**LA SOLUTION (stratégie validée)**
- Timer unique `_autoRefreshTimer` créé dans showApp() (clearInterval défensif avant → pas de cumul), intervalle **60s** (choisi vs 45s pour ménager le quota Netlify d'invocations de fonctions). Listener visibilitychange → tick immédiat throttlé (1/15s). Nettoyé dans doLogout().
- `autoRefreshTick` : garde (document.hidden || busy || !currentUser) → **pause quand l'onglet est caché**. apiQueryAll DB_PROD (Archivé=false), parsePage. Puis diff via `empreinte()`.
- **PIÈGE ÉVITÉ (badges 🔔)** : `empreinte(list)` = JSON.stringify en EXCLUANT retoursOuverts (car parsePage l'initialise à 0 et les badges le remplissent APRÈS côté client via loadRetoursBadges ; sans exclusion, le diff serait TOUJOURS "changé" et le refresh EFFACERAIT les badges). `appliquerFresh` recopie les retoursOuverts actuels par id dans les données fraîches avant de remplacer `sujets`.
- Diff égal → return, zéro re-render, zéro scroll touché (cas majoritaire). Diff différent + `editionEnCours()` → bandeau, zéro re-render. Sinon → appliquerFresh (mise à jour douce).
- `editionEnCours()` = activeElement INPUT/TEXTAREA/SELECT, OU `.overlay.open` présent (fiche détail ov-detail, création ov-new, retour, confirmation, équipe…), OU #video-player-modal présent. La saisie est SACRÉE : tant qu'un seul est vrai → mode bandeau, aucun re-render.
- `appliquerFresh` : préserve scrollTop de #main-content + scrollLeft du kanban, re-render via le chemin EXISTANT (appSetVue/appRenderDashboard), met à jour cnt-all + renderSidebarCats.
- Bandeau #refresh-banner (masqué par défaut) : n'apparaît QUE si (changement détecté ET édition en cours). "Des modifications ont été faites par l'équipe — Actualiser". Clic → appliquerFresh(_freshEnAttente). **PAS d'auto-application au blur** (décision David : bandeau au clic, prévisible, rien ne bouge sans action). Le tick suivant ré-applique tout seul dès que l'édition est finie (45-60s de latence max).
- BONUS embarqués : pause onglet-caché AUSSI sur le polling notifs existant (loadNotifs ne tourne plus si onglet masqué) ; timer notifs préexistant désormais nettoyé au logout (petit bug corrigé).

**VÉRIF PILOTE (OK)**
node --check. empreinte exclut bien retoursOuverts + recopie des badges dans appliquerFresh (badges préservés). editionEnCours exhaustive. Timer unique créé showApp + clearInterval défensif + nettoyé logout (les 2 timers). Pause onglet-caché sur autoRefreshTick ET loadNotifs. Intervalle 60000 (0 occurrence 45000). Scroll préservé (scrollTop main-content + scrollLeft kanban). Compteurs : hausses attendues apiQueryAll 10→11 (appel du tick l.2787) et renderSidebarCats 4→5 (appel appliquerFresh l.2806) — vérifiées, pas des régressions. Acquis intacts : createNotif=27, journMonteursNoms=4, refreshJournMonteursSelects=7, annulerVersion=2, validationBrand=16, DB_CLIENTS_BRAND=6, telechargerVersion=2, resolveDriveFolder=3, isPWAStandalone=3, CHEF_PAR_DEFAUT='Benjamin', EQUIPE_FALLBACK=[].

**CHARGE / QUOTA (point d'attention)**
Rate-limit Notion : large marge (~0,85 req/s à 10 users vs limite ~3). MAIS quota Netlify (invocations de fonctions, 125k/mois en Free) : ~3 invocations/tick chiffre vite à 10 users. Mitigations déjà embarquées : 60s + pause onglet-caché sur les 2 pollings. Optimisation en réserve si le quota se tend : "delta last_edited_time" (1 requête/tick au lieu de 3).

**À FAIRE DAVID** : brancher (index.html) → PR → preview. TESTS : ouvrir 2 sessions (2 comptes/navigateurs), modifier une carte dans l'une → l'autre doit refléter le changement sous ~60s SANS recharger ; pendant une saisie (retour, édition champ, fiche ouverte) dans l'une, modif dans l'autre → bandeau "Actualiser" apparaît, rien ne bouge tant qu'on n'a pas cliqué ; badges 🔔 ne clignotent/disparaissent PAS ; scroll ne saute pas ; onglet en arrière-plan → pas de requêtes (vérifier Network). Merge.

**AUDIT MULTI-UTILISATEUR — RESTE À FAIRE (après ce chantier)**

**⚠️ RETOUR D'USAGE RÉEL (20/07) — 2 CHANTIERS DÉCIDÉS, NON ENCORE LANCÉS**
1. **BANDEAU DE RAFRAÎCHISSEMENT TROP BAVARD** (irritant quotidien de David). Le bandeau "Actualiser" se déclenche dès qu'un champ change **n'importe où** dans la base (empreinte GLOBALE) → bruit permanent qu'on finit par ignorer. Et après avoir cliqué "Actualiser", David **perd ses repères** (re-render complet) — au point d'avoir refait des modifs par confusion (aucune donnée perdue, vérifié).
   **DÉCISION PRODUIT VALIDÉE** : passer d'une empreinte globale à un **diff PAR SUJET**.
   • Changement sur un sujet que je ne regarde pas → **application SILENCIEUSE** (cas majoritaire, aucun bandeau).
   • Fiche ouverte en **LECTURE seule** + modifiée → **silence aussi** (regarder ≠ modifier — précision David).
   • Bandeau UNIQUEMENT si je suis **en train de toucher** la fiche que quelqu'un modifie (vrai risque de conflit).
   • `editionEnCours` reste la garde absolue (ne jamais interrompre une saisie).
   À creuser aussi : pourquoi la désorientation malgré `scrollTop` restauré (cartes qui changent de place au tri ? survol/focus perdus ?) → piste : ne re-rendre que les cartes réellement modifiées. index.html seul.
2. **PRÉSENCE — "qui regarde la même fiche"** (idée David, intéressée). Afficher "Benjamin regarde aussi cette fiche" façon Google Docs. Chantier à part entière (mécanisme de présence + quota Netlify). **Synergie** : réutiliserait le même patron que le heartbeat du visionnage — à cadrer APRÈS, avec l'expérience acquise.

**AUTRES SUJETS EN ATTENTE**
- Notifs : 2 angles morts. (1) PWA fermée = pas de push (les notifs ne partent que si l'app est ouverte quelque part). (2) cas de perte/duplication selon synchro. À robustifier plus tard.
- Cache PWA / service worker (point 8, à auditer séparément) : quand une nouvelle version est mergée, les 10 users voient-ils la MAJ ou restent bloqués sur une version en cache ? Risque de 10 personnes sur des versions différentes. À vérifier AVANT/juste après le partage.
- Rate-limit / quota Netlify : surveiller à l'usage réel.


### 2026-07-16 — UX vue Cartes compactes + catégories sidebar (branche `ux-cartes-sidebar`)
3 fichiers : `index.html` (5849 → **5881 lignes**, +32), `css/components.css` (+24), `css/layout.css` (+8). Aucune fonction serveur, aucune autre vue touchée. (S7+S8 + 2 ajustements colonnes/badge intégrés dans la même branche.)

**S7 — CARTES COMPACTES (vue Cartes)**
Les cartes de la vue Cartes étaient trop grandes (~140px, ~5 par écran). Rendues compactes (~78px, ~10-12 par écran) en gardant TOUTES les infos (code, format, corbeille, titre, journaliste, statut, dates, barre progression, badge retours). Réorganisation : journaliste + statut sur une seule ligne (statut prioritaire, nom tronqué en ellipsis si besoin).
- Scoping SÛR : modificateur `card--c` appliqué UNIQUEMENT aux 2 gabarits de la vue Cartes (cardHTML + cardHTMLHighlight). La classe `.card` standard N'EST PAS modifiée → vue Idées (qui utilise .card seul) intacte.
- Corbeille : `@media (hover:hover) and (pointer:fine)` → discrète au survol sur desktop, TOUJOURS visible en tactile.

**S8 — CATÉGORIES DANS LA SIDEBAR**
Ajout sous "Production" de sous-entrées cliquables (#sb-cats) : MAG, Brand, Face Cam, Desk, YouTube (formats réellement présents), avec pastille couleur (FMT_COLORS) + compteur. renderSidebarCats calcule les compteurs côté client depuis `sujets` (zéro appel réseau). sbCatClick → appFilter('f', fmt, pill) via data-fmt sur les pilules → MÊME chemin qu'un clic pilule (cohérence pilules↔sidebar dans les 2 sens : renderSidebarCats rappelé dans appFilter + appLoadData + appRender). Desktop-only (sidebar masquée en mobile ; les pilules restent le chemin mobile). Vérifié : ces catégories n'existaient PAS dans la sidebar avant (ce qui ressemblait à ça = les pilules de filtre).

**AJUSTEMENTS (même branche, empilés sur S7+S8)**
- Colonnes vue Cartes adaptatives : `.cards--c` = repeat(auto-fill, minmax(300px,1fr)) scopé à la vue Cartes (les 3 conteneurs cardHTML/cardHTMLHighlight) → ~5 colonnes grand écran, 4 laptop, 1 mobile (override `@media max-width:700px`). `.cards` historique (minmax 270px) intacte → Idées non affectées.
- Badge notif déplacé : avant sur une ligne EN BAS (rallongeait la carte → toute la rangée de la grille prenait cette hauteur). Maintenant CHIFFRE SEUL (`🔔 N`) à côté du code EN HAUT, dans les 2 gabarits à l'identique, ancien bloc bas supprimé → toutes les cartes même hauteur avec/sans notif. Badge visible aussi en recherche active.

**ABANDONNÉ (décision David)** : S3 sections repliables par statut dans la vue Cartes → redondant avec les filtres/pilules existants et la vue Par statut. Testé en maquette, écarté.
**REPORTÉ** : S1 (masquer PAD par défaut), S2 (colonnes Kanban plafonnées pour le déséquilibre de la vue Par statut), S6 (archivage assisté des PAD de +30j — touche aux DONNÉES Notion → chantier séparé prudent, confirmation + lots séquentiels). Cause racine du volume : les sujets livrés (PAD) ne sortent jamais des vues tant que "Archivé" n'est pas coché à la main.

**VÉRIF PILOTE (OK)** : node --check. card--c=2 (les 2 gabarits), .card standard intacte (Idées OK), corbeille @media hover, S8 branché sur appFilter + compteurs depuis sujets + synchro 2 sens, data-fmt=8. Compteurs préservés : createNotif=27, journMonteursNoms=4, refreshJournMonteursSelects=7, annulerVersion=2, validationBrand=16, DB_CLIENTS_BRAND=6, apiQueryAll=10, telechargerVersion=2, resolveDriveFolder=3, isPWAStandalone=3, openDriveFolderSync=5, CHEF_PAR_DEFAUT='Benjamin', EQUIPE_FALLBACK=[]. Autres vues (kanban, dashboard, liste, calendrier, Idées, Archives) non touchées.

**À FAIRE DAVID** : branche `ux-cartes-sidebar` (index.html + css/components.css + css/layout.css) → PR → preview : vue Cartes compacte (10-12 cartes visibles, corbeille au survol desktop + visible tactile, toutes infos présentes) ; sidebar avec catégories + compteurs, clic = filtre (synchro avec les pilules) ; VÉRIFIER VUE IDÉES NON CASSÉE (seul risque : partage classe .card) ; autres vues inchangées. Merge.


### 2026-07-16 — Téléchargement en nouvel onglet réutilisé (branche `dl-nouvel-onglet`)
2 fichiers : `index.html` (5838 → **5849 lignes**, +11), `review.html` (694 → **705 lignes**, +11). Fonctions serveur, notion.js, bouton Dossier INTOUCHÉS.

**PROBLÈME**
Au clic sur Télécharger (les DEUX pages : lecteur interne + review client), le lien se déclenchait dans la MÊME fenêtre. Sur les gros fichiers (>100 Mo, toujours le cas ici : vidéos 100-500 Mo), Google impose son écran interstitiel « Télécharger quand même » (drive.usercontent.google.com) qui REMPLAÇAIT la page → au retour, la carte + la vidéo étaient perdues, l'app devait se recharger entièrement.

**PISTES EXPLORÉES (panorama Claude Code) — pourquoi le nouvel onglet**
Impossible de supprimer l'interstitiel Google de façon fiable/sûre : l'afficher dans une iframe de l'app = bloqué (CSP frame-ancestors Google) ; `<a download>` cross-origin = ignoré ; fetch+blob sur usercontent = bloqué CORS ; params confirm/uuid = fragile non documenté. La SEULE porte « zéro interstitiel » = API Drive alt=media via jeton SA (fetch→blob), mais : blob 500 Mo risqué sur mobile + le jeton SA donne accès en lecture à TOUT ce que voit le SA → INUTILISABLE côté client externe (un client lirait les vidéos des autres). Réservé à l'app interne, en réserve pour plus tard si l'interstitiel agace vraiment. Proxy streaming Netlify = exclu (500 Mo × équipe = dépassement bande passante + coût). Donc PISTE 1 retenue = nouvel onglet.

**LA CORRECTION**
Patron anti-popup (même que le bouton Dossier) sur telechargerVersion (index.html) ET telechargerReview (review.html) : `const win = window.open('', 'rm-download')` ouvert AU CLIC (avant le fetch → pas bloqué par l'anti-popup), rempli après le POST (`win.location = downloadUrl`). L'onglet NOMMÉ 'rm-download' est RÉUTILISÉ pour les téléchargements successifs (pas d'empilement). Secours `<a target="_blank">` si l'utilisateur a fermé l'onglet pendant « Préparation… ». Repli erreur : réutilise l'onglet (`win.location = viewUrl`). La page courante (carte + vidéo / vidéo + retours) reste intacte ; l'interstitiel Google vit dans l'onglet séparé.

**VÉRIF PILOTE (OK)**
node --check les 2 pages. Patron rm-download au clic confirmé sur les 2 fonctions (rm-download=2 par fichier). Cas PWA intact (garde isPWAStandalone AVANT l'ouverture de l'onglet → aucun onglet fantôme). Repli /view réutilise l'onglet. Compteurs TOUS préservés : telechargerVersion=2, isPWAStandalone=3, openPlayerInBrowser=2, resolveDriveFolder=3, openDriveFolderSync=5, drivefolderPending=5, prefetchDriveFolder=4, createNotif=27, journMonteursNoms=4, refreshJournMonteursSelects=7, annulerVersion=2, validationBrand=16, DB_CLIENTS_BRAND=6, apiQueryAll=10, CHEF_PAR_DEFAUT='Benjamin', EQUIPE_FALLBACK=[]. Seuls index.html + review.html modifiés.

**EN RÉSERVE (décision plus tard)** : piste 3-API (fetch alt=media via jeton SA éphémère, barre de progression, garde-fou taille/mobile) pour « zéro interstitiel » CÔTÉ APP INTERNE UNIQUEMENT (jamais côté client externe pour raison de sécurité). À décider sur retour d'usage réel.

### 2026-07-16 — ✅ VALIDÉ EN PROD : téléchargement app + bouton Dossier (partage Arnaud fait)
Aucune modif de code — note de validation. Arnaud a partagé les dossiers de prod avec le Service Account `reelmedia-drive@reelmedia-prod.iam.gserviceaccount.com` en **CONTRIBUTEUR** (Drive partagé) — ce niveau SUFFIT (pas besoin de Gestionnaire de contenu).
- TÉLÉCHARGEMENT (piste B) testé OK sur B09Y_PLEINE_MER (490 Mo) : lien `drive.usercontent.google.com/download?...&confirm=t`, plus de blocage authuser= (le fichier est rendu public le temps du DL). L'écran Google « impossible de lancer l'analyse antivirus (fichier trop volumineux) → Télécharger quand même » est NORMAL pour tout fichier >100 Mo (signe de succès, pas une erreur).
- BOUTON DOSSIER testé OK : ouvre bien le dossier parent (drive/folders/...), plus le fichier.
- Les erreurs console « Framing/CSP frame-ancestors » et 429 sont du bruit Google (multi-compte/rate-limit), pas des bugs de l'app.

### 2026-07-16 — Chantier 1 : téléchargement client sur review.html (branche `chantier1-review`, mergé PR #34)
> NOTE : le portier a d'abord renvoyé 403 en test (il ne vérifiait l'appartenance du fileId que dans Lien V1/V2/V3 du sujet = système A, alors que les vidéos vivent dans la base 📹 Versions = système B). CORRIGÉ avant merge : drive-download-review.js vérifie désormais l'UNION des 2 sources (Lien V1/V2/V3 du sujet ∪ Titre des pages 📹 Versions dont Sujet ID = id du sujet, versions Annulées incluses). DB_VERSIONS='3793eebb-2aeb-4d49-84ae-06d79cfb2704'. Testé OK sur B09Y. 2 requêtes Notion par téléchargement.

4 fichiers : `netlify/functions/_drive.js` (NOUVEAU), `netlify/functions/drive-download-review.js` (NOUVEAU), `netlify/functions/drive-download.js` (REFACTORÉ, contrat inchangé), `review.html` (662 → **694 lignes**, +32). index.html et notion.js INTOUCHÉS.

**PROBLÈME**
Le bouton Télécharger de review.html (page client externe) utilisait encore l'ancien toDlUrl mort → URL authuser= → 403 multi-compte. La piste B n'y avait jamais été portée. Le lecteur interne (index.html/telechargerVersion) marchait déjà.

**LA CORRECTION (chantier 1 d'un plan de 3 ; chantiers 2 et 3 REPORTÉS)**
- `_drive.js` (helper non exposé) : extrait la mécanique commune piste B (jeton SA, appels Drive, préflight canShare, permission anyone, registre drive-open-perms en write-ahead, lien confirm=t, révocation immédiate). Fonction `openEphemeralDownload(fileId)` utilisée par les 2 portiers. IMMEDIATE_REVOKE vit ici désormais.
- `drive-download.js` : REFACTORÉ pour déléguer à _drive.js. Contrat + comportement STRICTEMENT identiques (POST, {id,code,fileId}, verifyUser→401, mêmes statuts/réponses). L'app ne voit aucune différence.
- `drive-download-review.js` (NOUVEAU portier client) : POST {sujetCode, fileId}, PAS de verifyUser (client externe sans compte). Sécurité = cohérence Notion : interroge DB_PROD (Code=sujetCode) en direct via NOTION_TOKEN, re-dérive les fileId depuis Lien V1/V2/V3, refuse (403) tout fileId hors sujet, 404 si sujet introuvable. Ne fait jamais confiance au ?url= client. Réutilise registre + révocation + sweep via le helper. downloadUrl jamais loggé.
- `review.html` : toDlUrl supprimé, fonction telechargerReview (POST drive-download-review → <a> programmatique → toast), repli page Drive /view en cas d'erreur, feedback bouton « Préparation… ». Parcours client inchangé : 1 clic.

**VÉRIF PILOTE (OK)**
node --check sur les 3 fonctions + JS inline review.html. drive-download.js : contrat identique confirmé (aucune régression app). _drive.js : write-ahead OK (registre écrit AVANT révocation → sweep rattrape si crash), downloadUrl jamais loggé (1 seul console.warn, sans URL). Portier review : contrôle Notion présent (403 hors sujet, 404 sujet introuvable), bon ID DB_PROD 01a8dc7d..., Notion en direct (pas via proxy), pas de verifyUser (normal). review.html : 0 toDlUrl, bouton câblé sur telechargerReview, repli /view. index.html + notion.js absents du diff.

**À FAIRE PAR DAVID**
Monter branche `chantier1-review` (4 fichiers, noms à tirets pour les 2 fonctions + _drive.js dans netlify/functions/) + ce CONTEXT → PR → preview. TEST NON-RÉGRESSION PRIORITAIRE : le bouton Télécharger du LECTEUR INTERNE doit marcher exactement comme avant (c'est le refactor drive-download à surveiller). Puis : téléchargement depuis un lien review client (sans 403), même en navigation privée / mauvais compte Google. Puis sécurité portier : fileId d'un autre sujet → 403 ; code bidon → 404. Puis merge.

**REPORTÉ (décision David) — chantiers 2 et 3 de la sécurisation review, à décider plus tard**
- Chantier 2 : token de review (dégradation douce, anciens liens préservés, TTL ~90j, store Blobs review-tokens) + traçabilité validation (préfixe token dans la notif). Protégerait mieux la page SANS changer le parcours client.
- Chantier 3 : durcissement fin de notion.js (liste blanche : query/create sur les 13 bases connues, GET/PATCH pages, reste → 403). Le proxy est actuellement OUVERT à tous. LE plus risqué (tuyau central de TOUTE l'app) → déploiement en 2 temps (observation qui logge ce qui serait bloqué → enforcement après logs propres).
- ⚠️ IMPORTANT : le chantier 1 est NEUTRE côté sécurité — la page review reste non protégée (n'importe qui avec le lien peut lire le sujet, écrire des retours, VALIDER une version, créer des notifs __chef__ ; proxy notion.js ouvert). La vraie protection = chantiers 2+3.

**IDÉE À CREUSER (pas commencée) — séquenciers collaboratifs**
David envisage un « Google Docs / Notion » dans l'app pour que les journalistes écrivent les séquenciers et Benjamin corrige (avec trace des corrections). Reco Pilote : NE PAS recoder un éditeur collaboratif temps réel (trop lourd, fragile, contre la priorité stabilité) → brancher sur Notion qui fait tout ça nativement (écriture riche, commentaires, historique, multi-utilisateur). Option pressentie : bouton « Ouvrir le séquencier » depuis la carte du sujet → page Notion liée. À cadrer avec Master (produit + Notion). Sujet mis en pause à la demande de David, à reprendre.


### 2026-07-15 — Fix pagination Notion : helper apiQueryAll (branche `fix-pagination`, par-dessus Dossier)
1 seul fichier : `index.html` (5812 → **5838 lignes**, +26). `notion.js` INTOUCHÉ (reste proxy passif). Empilé sur main après merge PR #32 (Dossier).

**BUG (diagnostic Master + Pilote + Claude Code)**
David ne voyait qu'~5 cartes MAG sur 21 (M649-M669). Cause : l'API Notion renvoie max 100 résultats par query. La base a dépassé 100 cartes (68 Desk D1144-D1211 ajoutées le 15/07). Le front ne paginait JAMAIS (0 occurrence has_more/next_cursor/start_cursor dans index.html) : appLoadData faisait 1 seul query page_size:100, tri created_time DESC → les 68 Desk récentes remplissaient les 100 premiers résultats et éjectaient les MAG de mai hors de la fenêtre (jamais chargées, invisibles dans toutes les vues). notion.js relaie bien has_more/next_cursor mais le front les ignorait. Cartes présentes dans Notion, juste non rapatriées.

**LA CORRECTION (index.html uniquement)**
- Helper `apiQueryAll(endpoint, body)` : enchaîne les pages via start_cursor jusqu'à has_more=false, concatène, renvoie `{results:[...tous]}` (même forme de lecture qu'un query simple → call sites inchangés dans leur lecture .results). Passe par api() donc hérite du retry 429/503 + bandeau Phase A. Garde-fou 50 pages (5000 items) avec console.warn. Chaque page = 1 invocation Netlify distincte → PAS d'enjeu timeout 10s (raison du choix front vs serveur).
- 8 call sites basculés sur apiQueryAll (page_size retiré du body, filtres/tris inchangés) : appLoadData (DB_PROD actives — le bug), vue Archives (DB_PROD archivées), loadIdees (DB_IDEES), loadTachesPerso + loadTachesBadgeSilent + loadTachesSujet (DB_TACHES), loadRetoursBadges + markAllRead (DB_NOTIFS).
- markAllRead : écritures par lots SÉQUENTIELS de 3 PATCH (fini le Promise.all illimité, respecte rate-limit Notion ~3 req/s) + feedback bouton "Tout marquer lu" (id mark-all-btn : désactivé + "…" pendant l'op, rétabli en finally).
- NON touché : filtres notifs inchangés (PAS de Lu=false ajouté — décision David : fix pagination pur, filtrage des lues reste côté JS). Sites hors périmètre gardés en page_size:100/50/20 : loadNotifs (20), queries par sujet (déclinaisons, versions+retours), activité dashboard (50), DB_COMP/DB_CLIENTS_BRAND/DB_EQUIPE (cardinalité < 100).

**VÉRIF PILOTE (OK)**
node --check + JS inline valide. index.html 5838 lignes. apiQueryAll=10 (déf + console.warn + 8 call sites, tous vérifiés sur les bonnes DB). Aucun Lu=false (les 2 'Lu' sont des écritures PATCH checkbox:true, pas des filtres). markAllRead : lots de 3 confirmés, feedback bouton OK (mark-all-btn=2). 5 page_size restants = helper + 4 sites hors périmètre voulus. Acquis TOUS intacts : createNotif=27, journMonteursNoms=4, refreshJournMonteursSelects=7, annulerVersion=2, validationBrand=16, DB_CLIENTS_BRAND=6, CHEF_PAR_DEFAUT='Benjamin', EQUIPE_FALLBACK=[], + fixes précédents non affectés (telechargerVersion=2, resolveDriveFolder=3, drivefolderPending=5, openDriveFolderSync=5, prefetchDriveFolder=4, isPWAStandalone=3, openPlayerInBrowser=2). cnt-all se corrige seul (lit sujets.length).

**À FAIRE PAR DAVID**
Monter la branche `fix-pagination` (1 fichier index.html) + ce CONTEXT → PR → tester en preview : les 21 MAG visibles + cnt-all ≥ 168 ; vue Archives complète ; Idées/Tâches inchangées à l'œil ; "Tout marquer lu" avec plusieurs non-lues → bouton "…" quelques secondes puis tout passe lu ; onglet Network : 2 appels DB_PROD au chargement au lieu d'1 (~400ms de plus, masqué par le spinner).

**EN SUSPENS — chantier UX vue Cartes/Liste (PAS ENCORE FAIT)** : avec >150 cartes, la vue devient chargée. David gêné par 3 choses : cartes terminées/PAD qui s'accumulent, trop de cartes actives simultanées, difficulté à retrouver une carte précise. Approche pressentie (à faire en PROPOSITION après ce fix) : masquer les terminées par défaut (bouton "afficher terminées" comme sur les tâches) + s'appuyer sur filtres/regroupements existants (vue Par statut, Par journaliste) + barre de recherche (code/titre). PAS de pagination à pages (mal adaptée à l'usage). À traiter comme un chantier UX distinct.


### 2026-07-15 — Fix bouton « Dossier » : cache 3 états + 3 boutons cohérents (branche `fix-dossier`, par-dessus le merge téléchargement)
1 seul fichier : `index.html` (5785 → **5812 lignes**, +27). `drive.js` INTOUCHÉ (reste readonly). Empilé sur main après merge PR #31 (téléchargement).

**DIAGNOSTIC (tests à l'appui, 2 lectures indépendantes)**
Le bouton « Dossier » d'une version ouvrait le FICHIER au lieu du DOSSIER PARENT. Tests sur la fonction serveur `drive?fileId=…` : une vidéo vue du SA renvoie bien `{folderUrl:…}` (serveur OK), une vidéo NON partagée avec le SA renvoie `{error:"File not found"}`. Donc `drive.js` n'est PAS en cause. Deux vrais bugs identifiés côté FRONT dans le cache : (1) RACE — le fallback fichier était écrit dans le cache AVANT l'appel serveur, un clic pendant l'appel ouvrait le fichier ; (2) ÉCHEC VERROUILLÉ — un seul raté (réseau, 500, folderUrl null) laissait le fallback en cache et le garde `if(cache) return` bloquait tout retry de la session. Cause dominante des symptômes = partage Drive incomplet (même racine que le 403 téléchargement) ; le fix front règle le comportement, pas l'accès.

**LA CORRECTION (index.html uniquement, 5 points)**
- `getDriveFileId` reconnaît aussi le format `open?id=XXX` (avant : seulement `/file/d/ID` ; les autres URL rendaient le bouton muet).
- Cache 3 états : `drivefolderCache` (vraies folderUrl UNIQUEMENT) + `drivefolderPending` (Promises en cours, anti-doublon) + fonction centrale `resolveDriveFolder(fileId)`. Succès → mis en cache ; échec → RIEN mémorisé (catch→null, finally supprime le pending) → retry possible. Plus jamais de fallback stocké en cache.
- `openDriveFolderSync` : si résolu → ouvre le dossier directement ; sinon → onglet ouvert sur le geste utilisateur (anti-popup) puis redirigé vers le dossier, ou vers le fichier `/view` en DERNIER RECOURS au clic (jamais en cache).
- `openPlayer` déclenche `prefetchDriveFolder(url)` à l'ouverture (type drive), placé APRÈS la déviation PWA (celle-ci reste prioritaire et intacte → lecture PWA non affectée).
- Bouton « 📁 Dossier » du header lecteur (~ligne 3235) rebranché sur `openDriveFolderSync` (avant : lien statique en dur vers le fichier, n'avait JAMAIS ouvert le dossier). Les 3 boutons Dossier (fiche détail, liste versions, header lecteur) se comportent désormais pareil. Note : changement de comportement assumé pour le bouton lecteur (décision produit de David).

**VÉRIF PILOTE (OK)**
node --check + JS inline valide. index.html 5812 lignes (5785 +27). Acquis intacts : createNotif=27, journMonteursNoms=4, refreshJournMonteursSelects=7, annulerVersion=2, validationBrand=16, DB_CLIENTS_BRAND=6, CHEF_PAR_DEFAUT='Benjamin', EQUIPE_FALLBACK=[]. Téléchargement NON touché : telechargerVersion=2, openPlayerInBrowser=2, isPWAStandalone=3. Nouveaux : resolveDriveFolder=3, drivefolderPending=5, drivefolderCache=4. 2 écarts de compteurs signalés par Claude Code élucidés et bénins (openDriveFolderSync=5 dont 1 commentaire ligne 1186 ; prefetchDriveFolder=4 = 3→4 correct). Déviation PWA vérifiée AVANT le prefetch. drive.js non modifié (appel GET readonly inchangé).

**À FAIRE PAR DAVID**
Monter la branche `fix-dossier` (1 fichier : index.html) + ce CONTEXT → PR → tester en preview : les 3 boutons 📁 ouvrent le dossier parent (sur une vidéo VUE du SA) ; clic très rapide après ouverture d'une fiche → onglet bref puis dossier (course corrigée) ; couper le réseau, cliquer (fichier en dernier recours), rétablir, re-cliquer → dossier revient (verrou levé). RAPPEL : sur une vidéo non partagée avec le SA, le bouton retombe légitimement sur le fichier — c'est un souci de PARTAGE, pas de code (réglé par le partage Drive au SA, cf. entrée téléchargement / geste d'Arnaud).


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
- **Bouton Dossier** (depuis 2026-07-15) : 3 boutons (fiche détail,
  liste versions, header lecteur) tous branchés sur openDriveFolderSync.
  Cache 3 états : drivefolderCache (vraies folderUrl only) +
  drivefolderPending (Promises) + resolveDriveFolder centralisée. Échec
  jamais mémorisé (retry possible). Clic : dossier si résolu, sinon onglet
  sûr redirigé, fichier /view en dernier recours. openPlayer prefetch à
  l'ouverture (après déviation PWA). Une vidéo non vue du SA → retombe sur
  le fichier (souci de partage, pas de code). drive.js inchangé (readonly,
  résout le parent via files.get fields=parents).
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

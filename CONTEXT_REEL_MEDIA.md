# Contexte projet — Réel Média Production App

## 📝 Historique des modifs

> Section maintenue automatiquement. Les modifs les plus récentes sont en haut.
> Format : ### YYYY-MM-DD — Titre court / Liste de points

### 2026-05-27 — Intégration Sentry (monitoring erreurs production)
- **Objectif** : capturer côté serveur Sentry les erreurs JS qui surviennent chez les utilisateurs en production. Phase A (window.onerror + bandeau notion-banner) reste actif pour l'UX user ; Sentry tourne en arrière-plan pour le monitoring développeur.
- **Type d'intégration** : Loader Script CDN (pas de npm). Le script `<script src="https://js-de.sentry-cdn.com/a555d2e77ba48da5ec408a38b6e95eec.min.js" crossorigin="anonymous"></script>` est inséré EN PREMIER dans le `<head>`, avant les CSS et autres scripts.
- **Produits activés** : Error Monitoring uniquement (pas de Session Replay, Tracing, Logs, ni Application Metrics).
- **Configuration runtime** (bloc `Sentry.onLoad()` au tout début du script JS) :
  - `environment` : détecté auto (`preview`/`development`/`production` selon hostname)
  - `release` : tagué dynamiquement `reel-media@YYYY-MM-DD`
  - `beforeSend` : filtre les erreurs déjà gérées par Phase A (NetworkError, Failed to fetch, Load failed, timeout, aborted) + faux positifs navigateur (ResizeObserver loop limit) + messages vides
- **Identification utilisateur** : `Sentry.setUser({id, username})` + `Sentry.setTag('role', ...)` à 3 endroits stratégiques :
  - Login depuis session restaurée (localStorage `rm-user`)
  - Login depuis form (succès auth Notion)
  - `Sentry.setUser(null)` au logout
- **Données envoyées** : id + prénom (currentUser.nom) + tag rôle. AUCUNE donnée sensible (pas d'email, pas de code, pas de contenu Notion).
- **Compte Sentry** : organisation `rushup` sur sentry.io, projet `reel-media-production`, data storage EU (RGPD-friendly), plan trial 14 jours puis Developer gratuit auto (5k erreurs/mois, suffisant).
- **Préservations** : Phase A 100% inchangée. Toutes les autres features intactes (Task Reminder, UX bordure, etc.).
- `index.html` : 5018 → 5049 lignes (+31).

### 2026-05-27 — Évolutions UX Tâches perso (stats, modification, toggle terminées)
- Stats pills en haut (4 compteurs : 🔴 En retard / 🟠 Aujourd'hui / 🔵 À venir / ✓ Terminées aujourd'hui)
- Modification d'une tâche : click sur titre → modale avec Titre + Date pré-remplis + bouton "Sauver"
- Toggle "Afficher terminées" à droite des stats (OFF par défaut)
- Nouvelles fonctions : `openModifierTache`, `sauverModifTache`, `toggleAfficherTerminees`
- Variables : `afficherTerminees`, `tacheEditId`
- Périmètre : Tâches PERSO uniquement

### 2026-05-27 — UX Pastille priorité : bordure droite colorée sur toutes les vues
- Remplacement de la pastille ronde par une bordure verticale droite 3px sur les cartes (Cartes, Par statut, Par journaliste)
- Nouvelle colonne "Prio" (50px) avec point coloré 8x8px dans la vue Liste
- Vue Calendrier non modifiée
- Détection via `.includes()` pour résister aux variations d'encodage emoji

### 2026-05-27 — Fix R2 : Pastille priorité (.includes au lieu de comparaison stricte)
- Cause : comparaison stricte par clé d'objet `{'🔴 Haute': ...}[s.priorite]` échouait à cause d'encodage
- Fix : `.includes()` pour matcher par contenu

### 2026-05-27 — Régression 2 + Task Reminder V2 (refonte 2 systèmes)
- **R2** : pastille couleur priorité sur cartes vue journaliste
- **Task Reminder V2 — 2 systèmes distincts** :
  - Système 1 — Tâches personnelles (sidebar privée), filtre Sujet lié vide
  - Système 2 — Tâches de sujet (fiche détail partagée)
  - Distinction : champ `Sujet lié` vide vs rempli
- Base Notion `📋 Tâches` (DB_TACHES = `0241d8dc-00a1-461c-9efa-00eb7e5fac70`)

### 2026-05-27 — Régression 1 : Liens multiples à la création d'une nouvelle idée
- Variable `ideeRefs` séparée de `modalRefs`
- Fonctions : `ajouterRefIdee()`, `refreshIdeeRefs()`

### 2026-05-27 — Phase B PR1 : Extraction CSS vers fichiers séparés
- `<style>` inline sorti vers 4 fichiers `/css/`
- Nouveau `netlify.toml` avec cache-control

### 2026-05-22 — Phase A : gestion d'erreur globale
- `window.onerror` + `window.onunhandledrejection` + bandeau `#notion-banner` avec bouton "Réessayer"

---

## Infos projet
- **URL** : reel-media-production.netlify.app
- **GitHub** : David-f10/reel-media-production
- **Fichier principal** : `index.html` (~5049 lignes)
- **CSS** : 4 fichiers dans `/css/`
- **Netlify Functions** : notion.js + login.js
- **Monitoring** : Sentry (rushup.sentry.io, projet reel-media-production)
- **Langue de travail** : français

## Bases Notion
| Base | ID |
|------|-----|
| 🎬 Suivi de Production | 01a8dc7d-1cc2-4209-9afe-a3bd90a87e20 |
| 🔢 Compteurs de codes | f9b8d090-6c9e-4513-a67c-db2d82941a29 |
| 🏢 Clients Brand | 228c6efb-eb59-42ef-8926-7ce34816cb96 |
| 👥 Équipe | df0e44e1-7c9c-4427-a9c2-af7b6da78fcb |
| 💬 Commentaires | 45fda8a6-dfbc-42c1-a26f-de09c289037b |
| 📋 Retours | 02880609-ee82-4acc-b239-d8aac9cae439 |
| 🔔 Notifications | 4398775b-c11f-4d73-99c4-9fc31c33ce8b |
| 💡 Idées | b164bf282a4e4ac78a15d5e894019daa |
| 📎 Références | 4ae84e174ee9473888eaa15112fcc6ee |
| 📹 Versions | 3793eebb-2aeb-4d49-84ae-06d79cfb2704 |
| 🎵 Musiques | d9d3579257bc49059e6cd683a8b02fef |
| 📋 Tâches | 0241d8dc-00a1-461c-9efa-00eb7e5fac70 |

## ⚠️ Règles d'or
- `index.html` du project knowledge = SOURCE OFFICIELLE
- Ne jamais repartir de zéro
- Livrer `index.html` + `CONTEXT_REEL_MEDIA.md` à chaque modif
- `EQUIPE_FALLBACK = []`
- `CHEF_PAR_DEFAUT = 'Benjamin'`
- Communication en français
- Claude Code part du main à jour via curl
- Format prompts Claude Code : intention + emplacement, pas de code prescriptif
- Privilégier `.includes()` plutôt qu'égalité stricte avec emojis

## 🏗️ Architecture — Phase B — EN PAUSE
- **PR1 ✅** : extraction CSS
- **R1 ✅** : liens multiples idée
- **R2 + Task Reminder V2 ✅**
- **Fix R2 .includes ✅**
- **UX Pastille bordure droite ✅**
- **Évolutions Tâches perso ✅**
- **Sentry ✅** : monitoring erreurs production
- **PR 2-6** : EN PAUSE jusqu'à utilisation réelle avec journalistes

## 🛡️ Robustesse / Monitoring (état complet)

### Phase A — UX user (côté navigateur)
- `window.onerror` + `window.onunhandledrejection` : capture erreurs JS
- Toast user-friendly
- Bandeau `#notion-banner` : apparaît dès le 1er échec API Notion, disparaît au prochain succès
- Bouton "Réessayer" rejoue `_lastFailedCall`
- Fonction `api()` enveloppée par `_apiOriginal`

### Sentry — Monitoring dev (côté serveur Sentry)
- Loader Script CDN auto-init, hash projet `a555d2e77ba48da5ec408a38b6e95eec`
- Identification user (id + prénom + tag rôle) au login + session restaurée
- Cleanup au logout
- `beforeSend` filtre les erreurs réseau déjà gérées par Phase A (évite doublon Sentry)
- Environnements distincts : preview / development / production
- Release tagué par date pour grouper les erreurs

### Robustesse API
- Retry API 429/503 (3 tentatives, backoff exponentiel)
- Guards anti-doubles soumissions (`_createEnCours`, `_creerDecliEnCours`)
- Filtre `Archivé=false` + `page_size:100`
- Archives chargées à la demande

## État du code

### 🔐 Sécurité / Authentification
- `doLogin()` async via `/.netlify/functions/login`
- `EQUIPE_FALLBACK = []`, session via localStorage `rm-user`
- Modal "Changer mon code"

### 👥 Équipe
- Brand : Victor (vic26), Louise (lou26), Arnaud C (arc26)
- `renderEquipeList()` groupé par rôle

### 🎵 Musiques / PAD
- Boutons 🎵/🔇 dans le step PAD
- `padPret = capDeposee && (sansMusique || releveMusique)`

### 🚦 Priorité (UX finalisée)
- Indicateur visuel = bordure droite 3px sur cartes + colonne "Prio" dans Liste
- Détection `.includes()` (résiste aux variations d'encodage emoji)

### 🔔 Notifications
- `updStatut` : PAD→journaliste, Retours→journaliste, MontageV1→chef
- `toggleRetour` : notif chef quand retour corrigé

### ✏️ Pré-remplissage
- `CHEF_PAR_DEFAUT = 'Benjamin'`

### ✅ Task Reminder (2 systèmes)
- Système 1 — Tâches personnelles (sidebar `📋 Tâches`) : privées, badge rouge, stats pills, toggle terminées, modification au click
- Système 2 — Tâches de sujet (fiche détail) : partagées, créateur=assigné par défaut
- Distinction Notion : champ `Sujet lié`

### 🪟 UX divers
- Modal "Nouvelle idée" : système de liens multiples (R1)
- `ideeRefs` séparée de `modalRefs`
- Bordure droite priorité (cohérence toutes vues)

## 🔧 Ce qui reste à faire
1. **Tests journalistes en live** : étape suivante ! Observer leurs usages réels
2. **Backup automatique** (en pause — à réactiver pour les tests journalistes)
3. **Migration bases Notion** vers workspace Réel Média (attendre Arnaud)
4. **Compteur Notion** : bug du formulaire `prop("Dernier numéro") + 1`
5. **Notifications pour tâches de sujet** (à évaluer à l'usage)
6. **Phase B PR2-6** (refonte modulaire ES6) — en pause longue durée

## 🧪 Sentry — Comment tester après le merge
1. Sur la prod (`reel-media-production.netlify.app`), login
2. Ouvrir DevTools (Cmd+Option+I) → Console
3. Taper : `throw new Error('Test Sentry depuis prod')`
4. Aller sur `rushup.sentry.io` → Issues
5. L'erreur doit apparaître dans la minute avec :
   - Username (le journaliste loggé)
   - Tag `role: ...`
   - Environment `production`
   - Release `reel-media@2026-05-27`

## 📋 Workflow de modification
1. David décrit la modif
2. Claude lit `index.html` du project knowledge
3. Claude rédige le prompt Claude Code (intention + emplacement)
4. Claude Code part du main à jour via curl
5. Claude vérifie programmatiquement
6. Claude livre 2 fichiers : `index.html` + `CONTEXT_REEL_MEDIA.md`
7. David push sur nouvelle branche, PR, test preview, merge
8. David clique "Synchroniser maintenant"

## 🎨 Variables CSS clés
- `--red`, `--amber`, `--green`, `--blue`, `--purple` : couleurs principales
- `--red-dim`, `--amber-dim`, `--green-dim`, `--blue-dim`, `--purple-dim` : variantes diluées (15% opacité)
- `--bg2/3/4`, `--border/2`, `--text/2/3` : structure visuelle

## 👥 Équipe (rôles)
- **Chef** : Benjamin (par défaut), autres à compléter
- **Journalistes** : Augustin, Julien, Nico, Mathilde, Mickael, Juliette, etc.
- **Brand** : Victor (vic26), Louise (lou26), Arnaud C (arc26)
- **David** : développeur principal
- **Arnaud** : responsable côté Réel Média

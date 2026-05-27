# Contexte projet — Réel Média Production App

## 📝 Historique des modifs

> Section maintenue automatiquement. Les modifs les plus récentes sont en haut.
> Format : ### YYYY-MM-DD — Titre court / Liste de points / Optionnel : raison

### 2026-05-27 — Fix R2 : Pastille priorité (comparaison défensive)
- **Problème détecté en preview** : la pastille colorée n'apparaissait sur aucune carte de la vue "Par journaliste", alors que le tri par priorité fonctionnait correctement.
- **Cause identifiée** : la comparaison stricte par clé d'objet (`{'🔴 Haute': ...}[s.priorite]`) échouait probablement à cause d'une variation d'encodage de l'emoji ou d'un caractère invisible dans la valeur stockée côté Notion (variant selector, espace insécable, etc.). Le tri fonctionnait car la valeur restait égale à elle-même dans la comparaison du sort, mais la lookup par clé d'objet est plus stricte.
- **Fix appliqué** : remplacement de la comparaison stricte par une détection par contenu via `.includes()`. Une seule ligne modifiée (ligne 3323).
  - Avant : `const priCol={'🔴 Haute':'var(--red)',...}[s.priorite]||'';`
  - Après : `const priCol = s.priorite.includes('Haute') ? 'var(--red)' : s.priorite.includes('Normale') ? 'var(--amber)' : s.priorite.includes('Basse') ? 'var(--green)' : '';`
- Le fix est défensif : il fonctionne quelle que soit la variation d'encodage de l'emoji.
- `s.priorite` est garanti d'être une string (jamais null) grâce au `||''` dans `parsePage`, donc `.includes()` ne plante jamais.
- `index.html` : 4938 lignes (inchangé), 1 seule ligne modifiée.

### 2026-05-27 — Régression 2 + Task Reminder V2 (refonte 2 systèmes)
- **Régression 2 — Pastille priorité vue journaliste** : pastille colorée 6×6px ajoutée à côté du code sujet sur chaque carte de `renderJournaliste()`. Couleurs : Haute=`var(--red)`, Normale=`var(--amber)`, Basse=`var(--green)`. Réutilise la classe `.sdot` existante.
- **Task Reminder V2 — Refonte en 2 systèmes distincts** :
  - **Système 1 — Tâches personnelles (sidebar privée)** : entrée sidebar `📋 Tâches`, badge rouge, vue groupée (En retard / Aujourd'hui / À venir / Terminées), tâches privées (filtre Sujet lié vide). Fonctions : `parseTache`, `loadTachesPerso`, `loadTachesBadgeSilent`, `renderTachesPerso`, `openNouvelleTache`, `creerTachePerso`, `toggleTachePerso`, `archiverTachePerso`, `updateBadgeTaches`.
  - **Système 2 — Tâches de sujet (fiche détail partagée)** : section `✅ Tâches` entre `📋 Retours équipe` et `💬 Commentaires`. Tâches partagées (visibles par toute l'équipe). Créateur = Assigné par défaut. Fonctions : `loadTachesSujet`, `openAjoutTacheSujet`, `creerTacheSujet`, `toggleTacheSujet`, `archiverTacheSujet`.
  - **Distinction stricte** : le champ `Sujet lié` (vide ou rempli) distingue les 2 systèmes.
  - **Fix bug init dashboard** : `loadTachesBadgeSilent()` met à jour le badge au login sans toucher `main-content`.
- Base Notion `📋 Tâches` (DB_TACHES = `0241d8dc-00a1-461c-9efa-00eb7e5fac70`) avec 7 propriétés.
- `index.html` : 4614 → 4938 lignes (+324).

### 2026-05-27 — Régression 1 : Liens multiples à la création d'une nouvelle idée
- Modal "Nouvelle idée" : système de liens multiples ajouté, aligné sur la modal "Nouveau sujet Desk" existante.
- Variable `let ideeRefs = []` (séparée de `modalRefs`).
- Fonctions ajoutées : `ajouterRefIdee()`, `refreshIdeeRefs()`.
- `soumettreidee()` modifiée : boucle `await Promise.all(ideeRefs.map(...))` crée toutes les références dans la base 📎 Références.
- `ideeRefs = []` réinitialisée au début de `openNouvelleIdee()`.
- `index.html` : 4583 → 4614 lignes (+31).

### 2026-05-27 — Phase B PR1 : Extraction CSS vers fichiers séparés
- Bloc `<style>` inline (~479 lignes) sorti vers 4 fichiers `/css/` : `base.css` (12), `layout.css` (217), `components.css` (130), `views.css` (124).
- `index.html` : 5060 → 4583 lignes (-477).
- Nouveau `netlify.toml` à la racine avec cache-control.

### 2026-05-22 — Phase A : gestion d'erreur globale
- `window.onerror` + `window.onunhandledrejection` : capture erreurs JS et promesses rejetées.
- Bandeau `#notion-banner` : apparaît dès le 1er échec d'appel `/.netlify/functions/notion`.
- Bouton "Réessayer" rejoue la dernière requête échouée (`_lastFailedCall`).
- La fonction `api()` enveloppée par réassignation (`_apiOriginal`).

### 2026-05-22 — Harmonisation sidebar bas
- 3 boutons en bas de sidebar uniformisés : `+ Nouveau sujet` (rouge plein), `💡 Nouvelle idée` (amber plein), `👥 Gérer l'équipe` (bg2 + bordure subtile).

### 2026-05-21 — Dashboard restructuré en 4 niveaux
- N1 : KPIs Vue globale encadrés / N2 : Alertes | Activité récente / N3 : Activité mensuelle + Formats/Journaliste / N4 : Délais | Export stats. Espacement 28px entre niveaux.

### 2026-05-21 — Ajout entrée Export stats dans sidebar
- Modal léger avec sélecteurs Mois + Année.

### 2026-05-20 — Modal idée consultation corrigé
- Padding interne corrigé.

---

## Infos projet
- **URL** : reel-media-production.netlify.app
- **GitHub** : David-f10/reel-media-production
- **Fichier principal** : `index.html` (~4938 lignes)
- **CSS** : 4 fichiers dans `/css/` (base, layout, components, views)
- **Build config** : `netlify.toml`
- **Netlify Functions** : notion.js (proxy API Notion) + login.js (auth)
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

## ⚠️ Règles d'or à respecter (ne jamais casser)
- Le fichier `index.html` dans le project knowledge est **LA SOURCE OFFICIELLE À JOUR**
- **Ne jamais repartir de zéro** — toujours modifier le fichier existant
- **Toute modif** doit être livrée sous forme d'un fichier `index.html` complet à télécharger
- **À chaque modif d'index.html**, livrer aussi un `CONTEXT_REEL_MEDIA.md` à jour (avec nouvelle entrée historique en haut)
- `EQUIPE_FALLBACK = []` — ne JAMAIS remettre les codes en clair dans le HTML
- `CHEF_PAR_DEFAUT = 'Benjamin'`
- Communication en français
- **À chaque nouvelle PR**, Claude Code part du `main` à jour via curl
- **Format des prompts Claude Code** : intention + emplacement, pas de code prescriptif. Décrire l'intention fonctionnelle, où dans le code, les patterns à réutiliser, les contraintes et vérifications grep.
- **Privilégier les comparaisons par contenu (`.includes`) plutôt que par égalité stricte** quand on travaille avec des valeurs contenant des emojis (pour éviter les bugs d'encodage)

## 🏗️ Architecture — Phase B (refonte modulaire) — EN PAUSE
- **PR 1 ✅** (2026-05-27) : extraction CSS vers 4 fichiers `/css/*.css`
- **Régression 1 ✅** (2026-05-27) : liens multiples à la création d'une idée
- **Régression 2 ✅** (2026-05-27) : pastilles priorité vue journaliste (fix .includes appliqué)
- **Task Reminder V2 ✅** (2026-05-27) : 2 systèmes distincts (perso + sujet)
- **PR 2-6** : EN PAUSE jusqu'à utilisation réelle avec les journalistes
- Cible : `index.html` squelette ~200 lignes en fin de phase B

## État du code — corrections déjà appliquées

### 🔐 Sécurité / Authentification
- `doLogin()` async → appelle `/.netlify/functions/login` côté serveur
- `EQUIPE_FALLBACK = []` — aucun code en clair dans le HTML
- Modal "Changer mon code" (bouton 🔑 dans header)
- Session persistante via `localStorage.setItem('rm-user', ...)`

### 👥 Équipe
- Victor (vic26), Louise (lou26), Arnaud C (arc26) — rôle Brand
- `renderEquipeList()` groupé par rôle
- `equippeAjouter()` crée dans Notion avec code auto

### 🎵 Musiques / PAD
- Boutons 🎵 Avec musique / 🔇 Sans musique dans le step PAD
- `padPret = capDeposee && (sansMusique || releveMusique)`

### 🛡️ Robustesse
- Retry API 429/503 (3 tentatives, backoff exponentiel)
- Guard `_createEnCours` sur `createSujet`
- Filtre `Archivé=false` + `page_size:100`
- Archives chargées à la demande
- **Phase A** : gestion d'erreur globale (window.onerror + bandeau #notion-banner)

### 🚦 Priorité
- `priorite` dans `parsePage`
- Select Priorité dans la fiche détail (valeurs : `🔴 Haute`, `🟡 Normale`, `🟢 Basse`)
- Tri par priorité dans `renderJournaliste`
- **Pastille colorée sur les cartes** de la vue Par journaliste (R2 + fix .includes du 2026-05-27) : `var(--red)` / `var(--amber)` / `var(--green)` selon Haute/Normale/Basse. Détection par `.includes()` pour résister aux variations d'encodage emoji.

### 🔔 Notifications
- `updStatut` : notifs PAD→journaliste, Retours→journaliste, MontageV1→chef
- `toggleRetour` : notif chef quand retour corrigé

### ✏️ Pré-remplissage
- `CHEF_PAR_DEFAUT = 'Benjamin'`
- Chef auto-rempli selon rôle

### ✅ Task Reminder (2 systèmes — depuis V2 du 2026-05-27)
- **Système 1 — Tâches personnelles** : sidebar `📋 Tâches`, privées, sans sujet lié
  - Badge rouge sidebar si ≥1 tâche en retard/aujourd'hui (point 7×7px)
  - Vue groupée par sections (En retard / Aujourd'hui / À venir / Terminées)
  - Initialisation silencieuse au login (`loadTachesBadgeSilent`)
- **Système 2 — Tâches de sujet** : section dans `openDetail()` entre Retours et Commentaires
  - Visibles par toute l'équipe (collaboratif)
  - Créateur = Assigné par défaut
- **Distinction Notion** : champ `Sujet lié` vide (perso) ou rempli (sujet)

### 🪟 UX divers
- Modal idée consultation : `padding:0 20px 20px`
- Modal "Nouvelle idée" : système de liens multiples (R1)
- Variable `ideeRefs` (Idée) séparée de `modalRefs` (Desk)

## 🔧 Ce qui reste à faire
1. **Phase B PR2-6** (en pause) : reprendre quand on travaille avec les journalistes en live
2. **Backup automatique** (GitHub Actions, export Notion → JSON nightly)
3. **Monitoring Sentry**
4. **Migration bases Notion** vers workspace Réel Média (attendre invitation d'Arnaud)
5. **Compteur Notion** : bug du formulaire `prop("Dernier numéro") + 1` qui reset à zéro
6. **Notifications pour tâches de sujet** (à évaluer à l'usage)

## 📋 Workflow de modification
1. David décrit la modif voulue
2. Claude lit le fichier `index.html` dans le project knowledge
3. Claude rédige le prompt pour Claude Code (format intention + emplacement)
4. Claude Code part du main à jour via curl, applique les modifs, livre un fichier
5. Claude vérifie programmatiquement (grep + hash)
6. **Claude livre DEUX fichiers** : `index.html` + `CONTEXT_REEL_MEDIA.md` mis à jour
7. David push les 2 fichiers sur une nouvelle branche GitHub (ou met à jour la branche en cours)
8. Preview Netlify automatique, tests utilisateur
9. Merge si OK, suppression de la branche
10. David clique "Synchroniser maintenant" dans le project knowledge

## 🎨 Variables CSS clés
- `--red` : rouge principal (boutons primaires, alertes, priorité Haute)
- `--amber` : jaune ambre (idées, priorité Normale)
- `--green` : vert (validations, priorité Basse)
- `--bg2`, `--bg3`, `--bg4` : fonds secondaires
- `--border`, `--border2` : bordures subtiles
- `--text`, `--text2`, `--text3` : hiérarchie de texte
- `--font` : police principale
- `--mono` : police monospace

## 👥 Équipe (rôles)
- **Chef** : Benjamin (chef principal par défaut), autres chefs à compléter
- **Journalistes** : Augustin, Julien, Nico, Mathilde, Mickael, Juliette, etc.
- **Brand** : Victor (vic26), Louise (lou26), Arnaud C (arc26)
- **David** : développeur principal de l'app
- **Arnaud** : responsable côté Réel Média (migration Notion à venir)

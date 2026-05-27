# Contexte projet — Réel Média Production App

## 📝 Historique des modifs

> Section maintenue automatiquement. Les modifs les plus récentes sont en haut.
> Format : ### YYYY-MM-DD — Titre court / Liste de points / Optionnel : raison

### 2026-05-27 — Régression 2 + Task Reminder V2 (refonte 2 systèmes)
- **Régression 2 — Pastille priorité vue journaliste** : pastille colorée 6×6px ajoutée à côté du code sujet sur chaque carte de `renderJournaliste()`. Couleurs alignées sur les variables CSS : Haute=`var(--red)`, Normale=`var(--amber)`, Basse=`var(--green)`. Réutilise la classe `.sdot` existante. Pas de pastille si priorité vide. Le tri par priorité (qui existait déjà) reste inchangé. Aucune modif des autres vues.
- **Task Reminder V2 — Refonte en 2 systèmes distincts** suite à clarification produit :
  - **Système 1 — Tâches personnelles (sidebar privée)** :
    - Nouvelle entrée sidebar `📋 Tâches` entre Idées et Archives
    - Badge rouge discret (point 7×7px) si ≥1 tâche perso en retard/aujourd'hui
    - Tâches PRIVÉES : chaque user voit uniquement les siennes
    - Filtre Notion : `Archivé=false AND Assigné=currentUser AND Sujet lié=vide`
    - Vue groupée 4 sections : 🔴 En retard / 🟠 Aujourd'hui / 🔵 À venir / ✓ Terminées (20 dernières)
    - Modal création : Titre + Date (PAS de champ Sujet lié)
    - Fonctions : `parseTache`, `loadTachesPerso`, `loadTachesBadgeSilent`, `renderTachesPerso`, `openNouvelleTache`, `creerTachePerso`, `toggleTachePerso`, `archiverTachePerso`, `updateBadgeTaches`
  - **Système 2 — Tâches de sujet (fiche détail partagée)** :
    - Nouvelle section `✅ Tâches` dans la fiche détail d'un sujet, entre `📋 Retours équipe` et `💬 Commentaires`
    - Pattern visuel/code identique à la section Retours équipe (cloné)
    - Tâches PARTAGÉES : tous les users voient les tâches d'un sujet (collaboratif comme les retours)
    - Filtre Notion : `Archivé=false AND Sujet lié=sujetId`
    - Modal création : Titre + Date (Sujet lié auto = sujet courant, Créateur = Assigné par défaut)
    - Affichage : checkbox, titre, date, "par [créateur]", bouton corbeille, statut Fait avec line-through
    - Fonctions : `loadTachesSujet`, `openAjoutTacheSujet`, `creerTacheSujet`, `toggleTacheSujet`, `archiverTacheSujet`
  - **Distinction stricte** : la seule différence Notion entre les 2 systèmes est le champ `Sujet lié`. Une tâche perso a Sujet lié vide, une tâche de sujet a Sujet lié rempli avec un UUID.
  - **Fix bug init dashboard** : `loadTachesBadgeSilent()` est appelée après `navTo('dashboard')` au login. Cette fonction met à jour le badge sans toucher `main-content`, évitant que le dashboard soit écrasé par la vue Tâches au démarrage.
- Base Notion `📋 Tâches` (DB_TACHES = `0241d8dc-00a1-461c-9efa-00eb7e5fac70`) créée préalablement par le chat master, avec 7 propriétés : Titre (title), Statut (select À faire/Fait), Date échéance (date), Assigné (rich_text), Créé par (rich_text), Sujet lié (rich_text), Archivé (checkbox).
- `index.html` : 4614 → 4938 lignes (+324 lignes ajoutées).

### 2026-05-27 — Régression 1 : Liens multiples à la création d'une nouvelle idée
- Régression corrigée : à la création d'une nouvelle idée (modal "Nouvelle idée"), on ne pouvait ajouter qu'un seul lien de référence. Le système existait avant, perdu en route lors d'une reconstruction depuis une version ancienne par Claude Code.
- Implémentation alignée à 100% sur le système existant de la modal "Nouveau sujet Desk" (mêmes styles, mêmes comportements).
- Nouveau système ajouté dans `openNouvelleIdee()` :
  - Variable `let ideeRefs = []` (séparée de `modalRefs` pour éviter les collisions)
  - Fonction `ajouterRefIdee()` : ajoute un lien à `ideeRefs` après normalisation (ajout de `https://` si manquant)
  - Fonction `refreshIdeeRefs()` : rafraîchit l'affichage de la liste avec bouton × pour retirer chaque lien
  - Champ unique `id="ni-ref"` remplacé par : liste `id="ni-refs-list"` + input `id="ni-ref-input"` + bouton "+ Ajouter"
- `soumettreidee()` modifiée : boucle `await Promise.all(ideeRefs.map(...))` crée toutes les références dans la base 📎 Références.
- `ideeRefs = []` réinitialisée au début de `openNouvelleIdee()` à chaque ouverture.
- `index.html` : 4583 → 4614 lignes (+31 lignes).

### 2026-05-27 — Phase B PR1 : Extraction CSS vers fichiers séparés
- Tout le bloc `<style>` inline (~479 lignes) sorti de `index.html` vers 4 fichiers :
  - `css/base.css` (12 lignes), `css/layout.css` (217 lignes), `css/components.css` (130 lignes), `css/views.css` (124 lignes)
- `index.html` : `<style>...</style>` remplacé par 4 `<link rel="stylesheet">` dans le `<head>`
- `index.html` passe de 5060 à 4583 lignes (-477 lignes)
- Nouveau fichier `netlify.toml` à la racine : cache-control sur `/css/*` et `/index.html`

### 2026-05-22 — Phase A : gestion d'erreur globale
- `window.onerror` + `window.onunhandledrejection` : capture erreurs JS et promesses rejetées
- Bandeau `#notion-banner` : apparaît dès le 1er échec d'appel `/.netlify/functions/notion`
- Bouton "Réessayer" rejoue la dernière requête échouée (`_lastFailedCall`)
- Garde de visibilité : bandeau supprimé si `#app-shell` masqué
- La fonction `api()` enveloppée par réassignation (`_apiOriginal`)
- Regex de détection réseau : `failed to fetch | networkerror | load failed | timeout | aborted`

### 2026-05-22 — Harmonisation sidebar bas
- 3 boutons en bas de sidebar uniformisés : `+ Nouveau sujet` (rouge plein), `💡 Nouvelle idée` (amber plein), `👥 Gérer l'équipe` (bg2 + bordure subtile)
- Ligne user : avatar 26px, boutons 🔑 et ↩ regroupés à droite

### 2026-05-21 — Dashboard restructuré en 4 niveaux
- N1 : KPIs Vue globale encadrés
- N2 : Alertes (8 visibles) | Activité récente
- N3 : Activité mensuelle + Formats/Journaliste
- N4 : Délais | Export stats
- Espacement 28px entre chaque niveau

### 2026-05-21 — Ajout entrée Export stats dans sidebar
- Modal léger avec sélecteurs Mois + Année

### 2026-05-20 — Modal idée consultation corrigé
- Padding interne corrigé

---

## Infos projet
- **URL** : reel-media-production.netlify.app
- **GitHub** : David-f10/reel-media-production
- **Fichier principal** : `index.html` (~4938 lignes depuis R2 + Task Reminder V2)
- **CSS** : 4 fichiers dans `/css/` (base, layout, components, views) — depuis PR1 Phase B
- **Build config** : `netlify.toml` à la racine
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
- **À chaque modif d'index.html**, livrer aussi un `CONTEXT_REEL_MEDIA.md` à jour (avec nouvelle entrée dans l'historique en haut)
- `EQUIPE_FALLBACK = []` — ne JAMAIS remettre les codes en clair dans le HTML
- `CHEF_PAR_DEFAUT = 'Benjamin'`
- Les IDs des bases Notion ne changent pas après déplacement workspace
- Communication en français
- **À chaque nouvelle PR**, Claude Code doit partir du `main` à jour : `curl -sL https://raw.githubusercontent.com/David-f10/reel-media-production/main/index.html -o index.html`
- **Format des prompts Claude Code** : intention + emplacement, sans coller le code JS/HTML. Décrire l'intention fonctionnelle, où dans le code, les patterns à réutiliser, les contraintes et vérifications grep. Laisser Claude Code écrire le code lui-même.

## 🏗️ Architecture — Phase B (refonte modulaire) — EN PAUSE
- **PR 1 ✅** (2026-05-27) : extraction CSS vers 4 fichiers `/css/*.css`
- **Régression 1 ✅** (2026-05-27) : liens multiples à la création d'une idée
- **Régression 2 ✅** (2026-05-27) : pastilles priorité vue journaliste
- **Task Reminder V2 ✅** (2026-05-27) : 2 systèmes distincts (perso + sujet)
- **PR 2-6** : EN PAUSE jusqu'à utilisation réelle avec les journalistes
  - PR 2 : passage en modules ES6 + extraction utilitaires
  - PR 3 : extraction `js/core/` (auth, api, errors, notifications)
  - PR 4 : extraction `js/views/` (dashboard, production, idées, archives, tâches)
  - PR 5 : extraction `js/modals/` (detail, nouveau-sujet, versions, retours, équipe, export)
  - PR 6 : nettoyage final + documentation
- Cible : `index.html` squelette ~200 lignes en fin de phase B

## État du code — corrections déjà appliquées

### 🔐 Sécurité / Authentification
- `doLogin()` async → appelle `/.netlify/functions/login` côté serveur
- `EQUIPE_FALLBACK = []` — aucun code en clair dans le HTML
- `login.js` lit les membres depuis Notion avec cache 1 minute
- Modal "Changer mon code" (bouton 🔑 dans header)
- Session persistante via `localStorage.setItem('rm-user', ...)`

### 👥 Équipe
- Victor (vic26), Louise (lou26), Arnaud C (arc26) — rôle Brand
- `renderEquipeList()` groupé par rôle (Chef/Journaliste/Monteur/Brand)
- `equippeAjouter()` crée dans Notion avec code auto (3 lettres + 26)

### 🎵 Musiques / PAD
- Boutons 🎵 Avec musique / 🔇 Sans musique dans le step PAD
- `padPret = capDeposee && (sansMusique || releveMusique)`

### 🛡️ Robustesse
- Retry API 429/503 (3 tentatives, backoff exponentiel)
- Guard `_createEnCours` sur `createSujet`
- Filtre `Archivé=false` + `page_size:100`
- Archives chargées à la demande (`async renderArchives`)
- **Phase A (2026-05-22)** : `window.onerror` + `window.onunhandledrejection` + bandeau `#notion-banner`

### 🚦 Priorité
- `priorite` dans `parsePage`
- Select Priorité dans la fiche détail
- Tri par priorité dans `renderJournaliste`
- **Pastille colorée sur les cartes de la vue Par journaliste** (depuis R2 du 2026-05-27) : `var(--red)` / `var(--amber)` / `var(--green)` selon Haute/Normale/Basse

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
  - Pattern visuel cloné de la section Retours équipe
- **Distinction Notion** : champ `Sujet lié` vide (perso) ou rempli (sujet)

### 🪟 UX divers
- Modal idée consultation : `padding:0 20px 20px`
- Modal "Nouvelle idée" : **système de liens multiples** depuis Régression 1
- Variable `ideeRefs` (liens multiples Idée) séparée de `modalRefs` (liens multiples Desk)

## 🔧 Ce qui reste à faire
1. **Phase B PR2-6** (en pause) : reprendre quand on travaille avec les journalistes en live
2. **Backup automatique** (GitHub Actions, export Notion → JSON nightly)
3. **Monitoring Sentry**
4. **Migration bases Notion** vers workspace Réel Média (attendre invitation d'Arnaud)
5. **Compteur Notion** : bug du formulaire `prop("Dernier numéro") + 1` qui reset à zéro
6. **Notifications pour tâches de sujet** (à évaluer à l'usage : faut-il notifier quand quelqu'un crée une tâche sur un sujet dont je suis chef/journaliste ?)

## 📋 Workflow de modification
1. David décrit la modif voulue
2. Claude lit le fichier `index.html` dans le project knowledge
3. Claude rédige le prompt pour Claude Code (format intention + emplacement)
4. Claude Code part du main à jour via curl, applique les modifs, livre un fichier
5. Claude vérifie programmatiquement (grep + hash)
6. **Claude livre DEUX fichiers** : `index.html` complet + `CONTEXT_REEL_MEDIA.md` mis à jour
7. David push les 2 fichiers sur une nouvelle branche GitHub
8. Preview Netlify automatique, tests utilisateur
9. Merge si OK, suppression de la branche
10. David clique "Synchroniser maintenant" dans le project knowledge

## 🎨 Variables CSS clés
- `--red` : rouge principal (boutons primaires, alertes, priorité Haute)
- `--amber` : jaune ambre (idées, attention, priorité Normale)
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

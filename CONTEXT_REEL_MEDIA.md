# Contexte projet — Réel Média Production App

## 📝 Historique des modifs

> Section maintenue automatiquement. Les modifs les plus récentes sont en haut.
> Format : ### YYYY-MM-DD — Titre court / Liste de points / Optionnel : raison

### 2026-05-27 — Évolutions UX Tâches perso (stats, modification, toggle terminées)
- **Évolution A — Stats pills en haut** : 4 pills colorés alignés horizontalement au-dessus de la liste, affichant les compteurs : `🔴 X en retard` / `🟠 X aujourd'hui` / `🔵 X à venir` / `✓ X terminée(s) aujourd'hui`. Style discret (font-size 11px, padding 4×10px, border-radius 6px). Fond `var(--*-dim)` quand count > 0, fond `var(--bg3)` neutre quand count = 0. Pluralisation auto pour "terminée(s)".
- **Évolution B — Modification d'une tâche** : click sur le TITRE d'une tâche (zone dédiée avec `cursor:pointer`) → ouvre une modale "Modifier la tâche" avec champs Titre et Date pré-remplis. Bouton "Sauver" appelle `sauverModifTache()` qui PATCH la page Notion (Titre + Date échéance), affiche un toast, et recharge la liste. Zones de clic isolées : checkbox toggle, titre modifie, corbeille archive.
- **Évolution C — Toggle "Afficher terminées"** : checkbox discrète à droite des stats (style accent-color vert). Par défaut OFF → la section "Terminées" est exclue du rendu. Quand ON → la section apparaît avec les 20 dernières tâches faites. Variable globale `afficherTerminees = false` + fonction `toggleAfficherTerminees()` qui inverse l'état et re-render (pas de re-fetch).
- **Nouvelles fonctions** : `openModifierTache(id)`, `sauverModifTache()`, `toggleAfficherTerminees()`.
- **Variables globales** : `afficherTerminees`, `tacheEditId`.
- **Périmètre strict** : Tâches PERSO uniquement (sidebar). Les Tâches de sujet (fiche détail partagée) sont inchangées.
- `index.html` : 4947 → 5018 lignes (+71).

### 2026-05-27 — UX Pastille priorité : bordure droite colorée sur toutes les vues
- Remplacement de la pastille ronde par une bordure verticale droite 3px sur toutes les cartes (Cartes, Par statut, Par journaliste)
- Nouvelle colonne "Prio" (50px) avec point coloré 8x8px dans la vue Liste
- Vue Calendrier non modifiée
- Détection via `.includes()` pour résister aux variations d'encodage emoji

### 2026-05-27 — Fix R2 : Pastille priorité (comparaison défensive)
- Problème : pastille colorée (R2 initiale) n'apparaissait pas alors que le tri marchait
- Cause : comparaison stricte par clé d'objet `{'🔴 Haute': ...}[s.priorite]` échouait
- Fix : remplacement par `.includes()` pour matcher par contenu

### 2026-05-27 — Régression 2 + Task Reminder V2 (refonte 2 systèmes)
- R2 : pastille couleur priorité sur cartes vue journaliste
- **Task Reminder V2 — 2 systèmes distincts** :
  - **Système 1 — Tâches personnelles (sidebar privée)** : entrée sidebar `📋 Tâches`, badge rouge, vue groupée, filtre Sujet lié vide
  - **Système 2 — Tâches de sujet (fiche détail partagée)** : section `✅ Tâches` entre Retours et Commentaires, partagée toute équipe
  - Distinction : champ `Sujet lié` vide (perso) ou rempli (sujet)
- Base Notion `📋 Tâches` (DB_TACHES = `0241d8dc-00a1-461c-9efa-00eb7e5fac70`)
- `index.html` : 4614 → 4938 lignes (+324)

### 2026-05-27 — Régression 1 : Liens multiples à la création d'une nouvelle idée
- Modal "Nouvelle idée" : système de liens multiples
- Variable `ideeRefs` séparée de `modalRefs`

### 2026-05-27 — Phase B PR1 : Extraction CSS vers fichiers séparés
- Bloc `<style>` inline sorti vers 4 fichiers `/css/`
- Nouveau `netlify.toml` avec cache-control

### 2026-05-22 — Phase A : gestion d'erreur globale
- `window.onerror` + `window.onunhandledrejection`
- Bandeau `#notion-banner` avec bouton "Réessayer"

### 2026-05-22 — Harmonisation sidebar bas
- 3 boutons uniformisés

### 2026-05-21 — Dashboard restructuré en 4 niveaux
- N1 KPIs / N2 Alertes+Activité / N3 Mensuel+Formats / N4 Délais+Export

### 2026-05-21 — Ajout entrée Export stats dans sidebar
### 2026-05-20 — Modal idée consultation corrigé

---

## Infos projet
- **URL** : reel-media-production.netlify.app
- **GitHub** : David-f10/reel-media-production
- **Fichier principal** : `index.html` (~5018 lignes)
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
- **Toute modif** doit être livrée sous forme d'un fichier `index.html` complet
- **À chaque modif d'index.html**, livrer aussi un `CONTEXT_REEL_MEDIA.md` à jour
- `EQUIPE_FALLBACK = []` — ne JAMAIS remettre les codes en clair
- `CHEF_PAR_DEFAUT = 'Benjamin'`
- Communication en français
- **À chaque nouvelle PR**, Claude Code part du `main` à jour via curl
- **Format des prompts Claude Code** : intention + emplacement, pas de code prescriptif
- **Privilégier les comparaisons par contenu (`.includes`) plutôt que par égalité stricte** avec emojis

## 🏗️ Architecture — Phase B (refonte modulaire) — EN PAUSE
- **PR 1 ✅** (2026-05-27) : extraction CSS vers 4 fichiers
- **R1 ✅** (2026-05-27) : liens multiples idée
- **R2 + Task Reminder V2 ✅** (2026-05-27) : 2 systèmes tâches
- **Fix R2 .includes ✅** (2026-05-27)
- **UX Pastille bordure droite ✅** (2026-05-27)
- **Évolutions Tâches perso ✅** (2026-05-27) : stats + modification + toggle terminées
- **PR 2-6** : EN PAUSE jusqu'à utilisation réelle avec les journalistes

## État du code — corrections déjà appliquées

### 🔐 Sécurité / Authentification
- `doLogin()` async → appelle `/.netlify/functions/login`
- `EQUIPE_FALLBACK = []`, session persistante via localStorage

### 👥 Équipe
- Brand : Victor, Louise, Arnaud C
- `renderEquipeList()` groupé par rôle

### 🎵 Musiques / PAD
- Boutons 🎵/🔇 dans le step PAD

### 🛡️ Robustesse
- Retry API 429/503 (3 tentatives)
- Guards anti-doubles soumissions
- **Phase A** : gestion d'erreur globale

### 🚦 Priorité (état actuel — UX complète)
- Select Priorité dans la fiche détail (3 valeurs)
- Tri par priorité dans `renderJournaliste`
- **Indicateur visuel UX** : bordure verticale droite 3px sur cartes + colonne dédiée "Prio" dans Liste
- Détection par `.includes()` pour résister aux variations d'encodage emoji
- Vue Calendrier non affectée

### 🔔 Notifications
- `updStatut` : notifs PAD→journaliste, Retours→journaliste, MontageV1→chef

### ✏️ Pré-remplissage
- `CHEF_PAR_DEFAUT = 'Benjamin'`

### ✅ Task Reminder — État complet (V2 + évolutions UX)
- **Système 1 — Tâches personnelles** (sidebar `📋 Tâches`) :
  - Filtre Notion : Archivé=false + Assigné=currentUser + Sujet lié vide
  - **Stats pills en haut** : 4 compteurs colorés (En retard / Aujourd'hui / À venir / Terminées aujourd'hui)
  - **Toggle "Afficher terminées"** à droite des stats (OFF par défaut)
  - Vue groupée 4 sections (la 4e Terminées masquée par défaut)
  - Badge rouge sidebar si ≥1 tâche en retard/aujourd'hui
  - **Modification d'une tâche** : click sur titre → modale (Titre + Date pré-remplis) → "Sauver"
  - Initialisation silencieuse via `loadTachesBadgeSilent` (login)
  - Variables : `afficherTerminees`, `tacheEditId`
  - Fonctions principales : `loadTachesPerso`, `loadTachesBadgeSilent`, `renderTachesPerso`, `openNouvelleTache`, `creerTachePerso`, `toggleTachePerso`, `archiverTachePerso`, `openModifierTache`, `sauverModifTache`, `toggleAfficherTerminees`, `updateBadgeTaches`
- **Système 2 — Tâches de sujet** (fiche détail) : INCHANGÉ depuis V2
  - Section `✅ Tâches` entre Retours et Commentaires
  - Partagées par toute l'équipe
  - Créateur = Assigné par défaut
  - Fonctions : `loadTachesSujet`, `openAjoutTacheSujet`, `creerTacheSujet`, `toggleTacheSujet`, `archiverTacheSujet`
- **Distinction Notion** : champ `Sujet lié` vide (perso) ou rempli (sujet)

### 🪟 UX divers
- Modal "Nouvelle idée" : système de liens multiples (R1)
- Variable `ideeRefs` séparée de `modalRefs`
- Bordure droite colorée pour priorité (cohérence visuelle toutes vues)

## 🔧 Ce qui reste à faire
1. **Test journalistes en live** : c'est l'étape suivante ! Observer leurs usages réels du Task Reminder + bordure priorité
2. **Phase B PR2-6** (en pause) : reprendre quand on travaille avec les journalistes en live
3. **Backup automatique** (GitHub Actions, export Notion → JSON nightly)
4. **Monitoring Sentry**
5. **Migration bases Notion** vers workspace Réel Média (attendre invitation d'Arnaud)
6. **Compteur Notion** : bug du formulaire `prop("Dernier numéro") + 1` reset à zéro
7. **Notifications pour tâches de sujet** (à évaluer à l'usage)
8. **Évolutions Task Reminder V3** (à évaluer après test journalistes) : tâches récurrentes, sous-tâches, description, catégories/tags, épingler

## 📋 Workflow de modification
1. David décrit la modif voulue
2. Claude lit le fichier `index.html` dans le project knowledge
3. Claude rédige le prompt pour Claude Code (format intention + emplacement)
4. Claude Code part du main à jour via curl, applique les modifs
5. Claude vérifie programmatiquement (grep + hash)
6. Claude livre DEUX fichiers : `index.html` + `CONTEXT_REEL_MEDIA.md`
7. David push sur une nouvelle branche GitHub
8. Preview Netlify, tests utilisateur
9. Merge si OK
10. David clique "Synchroniser maintenant"

## 🎨 Variables CSS clés
- `--red`, `--amber`, `--green`, `--blue`, `--purple` : couleurs principales
- `--red-dim`, `--amber-dim`, `--green-dim`, `--blue-dim`, `--purple-dim` : variantes "diluées" (15% opacité) pour fonds de pills/badges
- `--bg2`, `--bg3`, `--bg4` : fonds
- `--border`, `--border2` : bordures
- `--text`, `--text2`, `--text3` : hiérarchie texte
- `--font` : DM Sans
- `--mono` : DM Mono

## 👥 Équipe (rôles)
- **Chef** : Benjamin (par défaut), autres à compléter
- **Journalistes** : Augustin, Julien, Nico, Mathilde, Mickael, Juliette, etc.
- **Brand** : Victor (vic26), Louise (lou26), Arnaud C (arc26)
- **David** : développeur principal
- **Arnaud** : responsable côté Réel Média

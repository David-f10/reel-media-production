# Contexte projet — Réel Média Production App

## 📝 Historique des modifs

> Section maintenue automatiquement. Les modifs les plus récentes sont en haut.
> Format : ### YYYY-MM-DD — Titre court / Liste de points / Optionnel : raison

### 2026-05-27 — UX Pastille priorité : bordure droite colorée sur toutes les vues
- **Problème UX détecté** : la petite pastille ronde colorée à gauche du code (R2 + fix .includes) se confondait visuellement avec les autres points sur la carte (code rouge, statut .sdot). Distinction faible. De plus, elle n'était que sur 1 vue (Par journaliste) alors qu'on voulait une cohérence globale.
- **Solution UX appliquée** : remplacement par une **bordure verticale droite colorée 3px**, de haut en bas de la carte, appliquée sur **toutes les vues de cartes** :
  - Vue Cartes (`cardHTML()`) : bordure droite sur chaque `<div class="card">`
  - Vue Par statut (`renderStatut()`) : bordure droite sur chaque `<div class="kanban-card">`
  - Vue Par journaliste (`renderJournaliste()`) : idem
- **Vue Liste** : nouvelle colonne **"Prio"** (largeur 50px) ajoutée entre "Statut" et "Journaliste". Affiche un petit point coloré 8×8px centré (rond), couleur selon priorité, ou rien si vide.
- **Vue Calendrier** : pas de modif (la couleur de chaque événement représente déjà le format, ajouter la couleur de priorité créerait du conflit visuel).
- L'ancienne pastille ronde .sdot du fix R2 a été supprimée de `renderJournaliste()`.
- Détection des priorités via `.includes()` (résiste aux variations d'encodage emoji) :
  - Contient 'Haute' → `var(--red)`
  - Contient 'Normale' → `var(--amber)`
  - Contient 'Basse' → `var(--green)`
  - Sinon → pas d'indicateur
- `index.html` : 4938 → 4947 lignes (+9 lignes nettes, ajustements chirurgicaux).

### 2026-05-27 — Fix R2 : Pastille priorité (comparaison défensive)
- Problème : pastille colorée (R2 initiale) n'apparaissait pas alors que le tri marchait
- Cause : comparaison stricte par clé d'objet `{'🔴 Haute': ...}[s.priorite]` échouait à cause d'une variation d'encodage emoji dans Notion
- Fix : remplacement par `.includes()` pour matcher par contenu
- 1 seule ligne modifiée (ligne 3323)

### 2026-05-27 — Régression 2 + Task Reminder V2 (refonte 2 systèmes)
- **R2** : pastille couleur de priorité sur cartes vue journaliste (remplacée ensuite par bordure droite UX)
- **Task Reminder V2 — 2 systèmes distincts** :
  - **Système 1 — Tâches personnelles (sidebar privée)** : entrée sidebar `📋 Tâches`, badge rouge, vue groupée, tâches privées (filtre Sujet lié vide). Fonctions : `parseTache`, `loadTachesPerso`, `loadTachesBadgeSilent`, `renderTachesPerso`, `openNouvelleTache`, `creerTachePerso`, `toggleTachePerso`, `archiverTachePerso`, `updateBadgeTaches`
  - **Système 2 — Tâches de sujet (fiche détail partagée)** : section `✅ Tâches` entre Retours et Commentaires. Visible par toute l'équipe. Créateur = Assigné par défaut. Fonctions : `loadTachesSujet`, `openAjoutTacheSujet`, `creerTacheSujet`, `toggleTacheSujet`, `archiverTacheSujet`
  - Distinction : champ `Sujet lié` vide (perso) ou rempli (sujet)
  - Fix bug init dashboard via `loadTachesBadgeSilent()`
- Base Notion `📋 Tâches` (DB_TACHES = `0241d8dc-00a1-461c-9efa-00eb7e5fac70`) avec 7 propriétés
- `index.html` : 4614 → 4938 lignes (+324)

### 2026-05-27 — Régression 1 : Liens multiples à la création d'une nouvelle idée
- Modal "Nouvelle idée" : système de liens multiples (aligné sur modal Desk)
- Variable `ideeRefs` séparée de `modalRefs`
- Fonctions : `ajouterRefIdee()`, `refreshIdeeRefs()`
- `index.html` : 4583 → 4614 lignes

### 2026-05-27 — Phase B PR1 : Extraction CSS vers fichiers séparés
- Bloc `<style>` inline (~479 lignes) sorti vers 4 fichiers `/css/`
- `index.html` : 5060 → 4583 lignes
- Nouveau `netlify.toml` avec cache-control

### 2026-05-22 — Phase A : gestion d'erreur globale
- `window.onerror` + `window.onunhandledrejection`
- Bandeau `#notion-banner`
- Bouton "Réessayer" rejoue la dernière requête échouée

### 2026-05-22 — Harmonisation sidebar bas
- 3 boutons en bas de sidebar uniformisés

### 2026-05-21 — Dashboard restructuré en 4 niveaux
- N1 KPIs / N2 Alertes+Activité / N3 Mensuel+Formats / N4 Délais+Export

### 2026-05-21 — Ajout entrée Export stats dans sidebar
- Modal léger avec sélecteurs Mois + Année

### 2026-05-20 — Modal idée consultation corrigé
- Padding interne corrigé

---

## Infos projet
- **URL** : reel-media-production.netlify.app
- **GitHub** : David-f10/reel-media-production
- **Fichier principal** : `index.html` (~4947 lignes)
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
- **Fix R2 .includes ✅** (2026-05-27) : pastille fonctionne
- **UX Pastille bordure droite ✅** (2026-05-27) : cohérence sur toutes les vues
- **PR 2-6** : EN PAUSE jusqu'à utilisation réelle avec les journalistes

## État du code — corrections déjà appliquées

### 🔐 Sécurité / Authentification
- `doLogin()` async → appelle `/.netlify/functions/login`
- `EQUIPE_FALLBACK = []`, session persistante via localStorage

### 👥 Équipe
- Brand : Victor, Louise, Arnaud C
- `renderEquipeList()` groupé par rôle
- `equippeAjouter()` crée dans Notion avec code auto

### 🎵 Musiques / PAD
- Boutons 🎵/🔇 dans le step PAD
- `padPret = capDeposee && (sansMusique || releveMusique)`

### 🛡️ Robustesse
- Retry API 429/503 (3 tentatives)
- Guards anti-doubles soumissions
- **Phase A** : gestion d'erreur globale

### 🚦 Priorité (état actuel — UX complète)
- `priorite` dans `parsePage`
- Select Priorité dans la fiche détail (3 valeurs : Haute / Normale / Basse)
- Tri par priorité dans `renderJournaliste`
- **Indicateur visuel UX** : bordure verticale droite 3px colorée sur les cartes (Cartes, Par statut, Par journaliste) + colonne dédiée "Prio" avec point coloré dans la vue Liste
- Détection par `.includes()` pour résister aux variations d'encodage emoji
- Vue Calendrier non affectée (la couleur format est déjà visuellement présente)

### 🔔 Notifications
- `updStatut` : notifs PAD→journaliste, Retours→journaliste, MontageV1→chef
- `toggleRetour` : notif chef quand retour corrigé

### ✏️ Pré-remplissage
- `CHEF_PAR_DEFAUT = 'Benjamin'`

### ✅ Task Reminder (2 systèmes)
- **Système 1 — Tâches personnelles** : sidebar `📋 Tâches`, privées, badge rouge, init silencieuse
- **Système 2 — Tâches de sujet** : section dans `openDetail()` entre Retours et Commentaires, partagées
- Distinction Notion : champ `Sujet lié`

### 🪟 UX divers
- Modal "Nouvelle idée" : système de liens multiples (R1)
- Variable `ideeRefs` (Idée) séparée de `modalRefs` (Desk)
- Bordure droite colorée pour priorité (cohérence visuelle toutes vues)

## 🔧 Ce qui reste à faire
1. **Phase B PR2-6** (en pause) : reprendre quand on travaille avec les journalistes en live
2. **Backup automatique** (GitHub Actions, export Notion → JSON nightly)
3. **Monitoring Sentry**
4. **Migration bases Notion** vers workspace Réel Média (attendre invitation d'Arnaud)
5. **Compteur Notion** : bug du formulaire `prop("Dernier numéro") + 1` reset à zéro
6. **Notifications pour tâches de sujet** (à évaluer à l'usage)

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
- `--red`, `--amber`, `--green` : indicateurs priorité (Haute/Normale/Basse)
- `--bg2`, `--bg3`, `--bg4` : fonds
- `--border`, `--border2` : bordures
- `--text`, `--text2`, `--text3` : hiérarchie texte

## 👥 Équipe (rôles)
- **Chef** : Benjamin (par défaut), autres à compléter
- **Journalistes** : Augustin, Julien, Nico, Mathilde, Mickael, Juliette, etc.
- **Brand** : Victor (vic26), Louise (lou26), Arnaud C (arc26)
- **David** : développeur principal
- **Arnaud** : responsable côté Réel Média

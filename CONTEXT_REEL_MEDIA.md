# Contexte projet — Réel Média Production App

## 📝 Historique des modifs

> Section maintenue automatiquement. Les modifs les plus récentes sont en haut.
> Format : ### YYYY-MM-DD — Titre court / Liste de points / Optionnel : raison

### 2026-05-27 — Régression 1 : Liens multiples à la création d'une nouvelle idée
- Régression corrigée : à la création d'une nouvelle idée (modal "Nouvelle idée"), on ne pouvait ajouter qu'un seul lien de référence. Le système existait avant, perdu en route lors d'une reconstruction depuis une version ancienne par Claude Code.
- Implémentation alignée à 100% sur le système existant de la modal "Nouveau sujet Desk" (mêmes styles, mêmes comportements).
- Nouveau système ajouté dans `openNouvelleIdee()` :
  - Variable `let ideeRefs = []` (séparée de `modalRefs` pour éviter les collisions)
  - Fonction `ajouterRefIdee()` : ajoute un lien à `ideeRefs` après normalisation (ajout de `https://` si manquant)
  - Fonction `refreshIdeeRefs()` : rafraîchit l'affichage de la liste avec bouton × pour retirer chaque lien
  - Champ unique `id="ni-ref"` remplacé par : liste `id="ni-refs-list"` + input `id="ni-ref-input"` + bouton "+ Ajouter"
  - Validation Enter sur l'input ajoute le lien directement
- `soumettreidee()` modifiée : ancien bloc qui créait 1 seule référence remplacé par une boucle `await Promise.all(ideeRefs.map(...))` qui crée toutes les références dans la base 📎 Références (DB_REFS) avec propriété `Sujet ID` pointant vers l'idée.
- `ideeRefs = []` est réinitialisée au début de `openNouvelleIdee()` à chaque ouverture, évitant que les liens d'une création précédente persistent.
- `index.html` : 4583 → 4614 lignes (+31 lignes ajoutées).

### 2026-05-27 — Phase B PR1 : Extraction CSS vers fichiers séparés
- Tout le bloc `<style>` inline (~479 lignes) sorti de `index.html` vers 4 fichiers :
  - `css/base.css` (12 lignes) : `@import` fonts, `:root` variables, reset, body, inputs génériques
  - `css/layout.css` (217 lignes) : `nav`, `app-shell`, `app-body`, sidebar, main-area, view-tabs, media queries mobile
  - `css/components.css` (130 lignes) : boutons, cards, modals, pills, toast, search, spinners
  - `css/views.css` (124 lignes) : kanban, calendrier, dashboard, notifications, retours, liste
- `index.html` : `<style>...</style>` remplacé par 4 `<link rel="stylesheet">` dans le `<head>`, ordre cascade respecté (base → layout → components → views)
- `index.html` passe de 5060 à 4583 lignes (-477 lignes)
- Zéro changement de règle CSS ni de logique JS, juste déplacement
- Bloc `<script>` strictement identique (vérifié par diff) — Phase A préservée intacte
- Nouveau fichier `netlify.toml` à la racine : cache-control `max-age=0, must-revalidate` sur `/css/*` et `/index.html` pour éviter le cache obsolète pendant la phase B

### 2026-05-22 — Phase A : gestion d'erreur globale
- `window.onerror` : capture des erreurs JS non gérées → toast user-friendly
- `window.onunhandledrejection` : capture des promesses rejetées → toast + bandeau Notion si erreur réseau
- Bandeau `#notion-banner` : apparaît dès le 1er échec d'appel `/.netlify/functions/notion`, disparaît auto au prochain succès
- Bouton "Réessayer" rejoue la dernière requête échouée (`_lastFailedCall`)
- Garde de visibilité : bandeau supprimé si `#app-shell` est masqué (pas d'affichage par-dessus login)
- La fonction `api()` reste inchangée, on l'enveloppe par réassignation (`_apiOriginal`)
- Regex de détection réseau : `failed to fetch | networkerror | load failed | timeout | aborted`
- Debounce 3s anti-spam sur les toasts d'erreur globaux

### 2026-05-22 — Harmonisation sidebar bas
- 3 boutons en bas de sidebar maintenant uniformes (largeur, padding, border-radius, font)
- + Nouveau sujet : fond rouge plein
- 💡 Nouvelle idée : fond amber plein
- 👥 Gérer l'équipe : fond `bg2` + bordure subtile
- Ligne user : avatar 26px, boutons 🔑 et ↩ regroupés à droite, ellipsis sur nom long

### 2026-05-21 — Dashboard restructuré en 4 niveaux
- N1 : KPIs Vue globale encadrés
- N2 : Alertes (8 visibles) | Activité récente
- N3 : Activité mensuelle + Formats/Journaliste
- N4 : Délais | Export stats
- Espacement 28px entre chaque niveau

### 2026-05-21 — Ajout entrée Export stats dans sidebar
- Modal léger avec sélecteurs Mois + Année
- Fonctions ajoutées : `ouvrirExportStats()`, `exportStatsFromModal()`

### 2026-05-20 — Modal idée consultation corrigé
- Padding interne corrigé : `padding:0 20px 20px`

---

## Infos projet
- **URL** : reel-media-production.netlify.app
- **GitHub** : David-f10/reel-media-production
- **Fichier principal** : `index.html` (squelette HTML + JS inline, ~4614 lignes depuis Régression 1)
- **CSS** : 4 fichiers dans `/css/` (base, layout, components, views) — depuis PR1 Phase B
- **Build config** : `netlify.toml` à la racine (cache-control sur `/css/*` et `/index.html`)
- **Netlify Functions** : netlify/functions/notion.js (proxy API Notion) + netlify/functions/login.js (auth)
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

## 🏗️ Architecture en cours — Phase B (refonte modulaire)
- **PR 1 ✅** (2026-05-27) : extraction CSS vers 4 fichiers `/css/*.css`
- **Régression 1 ✅** (2026-05-27) : liens multiples à la création d'une idée
- **Régression 2** : priorités dans la vue par journaliste (à venir)
- **PR 2** : passage en modules ES6 + extraction utilitaires (toast, format, overlay, parsing)
- **PR 3** : extraction `js/core/` (auth, api, errors, notifications)
- **PR 4** : extraction `js/views/` (dashboard, production, idées, archives) + intégration Task Reminder
- **PR 5** : extraction `js/modals/` (detail, nouveau-sujet, versions, retours, équipe, export)
- **PR 6** : nettoyage final + documentation
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
- Guard `_creerDecliEnCours` sur `creerDeclinaison`
- Guard retours ouverts dans `ajouterVersion`
- Filtre `Archivé=false` + `page_size:100`
- Archives chargées à la demande (`async renderArchives`)
- **Phase A (2026-05-22)** : `window.onerror` + `window.onunhandledrejection` + bandeau `#notion-banner`

### 🚦 Priorité
- `priorite` dans `parsePage`
- Select Priorité dans la fiche détail
- Tri par priorité dans `renderJournaliste`
- ⚠️ Régression 2 à venir : remettre le tri + pastille couleur dans la vue Par journaliste

### 🔔 Notifications
- `updStatut` : notifs PAD→journaliste, Retours→journaliste, MontageV1→chef
- `toggleRetour` : notif chef quand retour corrigé

### ✏️ Pré-remplissage
- `CHEF_PAR_DEFAUT = 'Benjamin'`
- Chef auto-rempli selon rôle

### 🪟 UX divers
- Modal idée consultation : `padding:0 20px 20px`
- Modal "Nouvelle idée" : **système de liens multiples** depuis Régression 1 (aligné sur le modal Desk)
- Variable `ideeRefs` (liens multiples Idée) séparée de `modalRefs` (liens multiples Desk)

## 🔧 Ce qui reste à faire
1. **Régression 2** : priorité dans la vue par journaliste (3 couleurs Haute/Normale/Basse + tri + pastille)
2. **Phase B PR2-6** (en cours) : finir la refonte modulaire (ES6, core, views, modals, cleanup)
3. **Task Reminder** : nouvelle feature à intégrer dans PR4 (nouvelle base Notion `📋 Tâches` + entrée sidebar + tâches liées aux sujets)
4. **Backup automatique** (GitHub Actions, export Notion → JSON nightly)
5. **Monitoring Sentry**
6. **Migration bases Notion** vers workspace Réel Média (attendre invitation d'Arnaud)
7. **Compteur Notion** : bug du formulaire `prop("Dernier numéro") + 1` qui reset à zéro

## 📋 Workflow de modification
1. David décrit la modif voulue
2. Claude lit le fichier `index.html` dans le project knowledge
3. Claude effectue la modif
4. **Claude livre DEUX fichiers** : `index.html` complet modifié + `CONTEXT_REEL_MEDIA.md` mis à jour
5. David push les 2 fichiers sur GitHub `David-f10/reel-media-production`
6. David clique "Synchroniser maintenant" dans le project knowledge
7. Netlify déploie automatiquement le site

## 🎨 Variables CSS clés (pour cohérence visuelle)
- `--red` : rouge principal (boutons primaires, alertes)
- `--amber` : jaune ambre (idées, attention)
- `--bg2` : fond secondaire (cartes, modals)
- `--border` / `--border2` : bordures subtiles
- `--text` / `--text2` / `--text3` : hiérarchie de texte
- `--font` : police principale
- `--mono` : police monospace

## 👥 Équipe (rôles)
- **Chef** : Benjamin (chef principal par défaut), autres chefs à compléter
- **Journalistes** : Augustin, Julien, Nico, Mathilde, Mickael, Juliette, etc.
- **Brand** : Victor (vic26), Louise (lou26), Arnaud C (arc26)
- **David** : développeur principal de l'app
- **Arnaud** : responsable côté Réel Média

# Contexte projet — Réel Média Production App

## 📝 Historique des modifs

> Section maintenue automatiquement. Les modifs les plus récentes sont en haut.
> Format : ### YYYY-MM-DD — Titre court / Liste de points / Optionnel : raison

### 2026-05-27 — Phase B PR1 : Extraction CSS vers fichiers séparés
- Tout le bloc `<style>` inline (~479 lignes) sorti de `index.html` vers 4 fichiers :
  - `css/base.css` (12 lignes) : `@import` fonts, `:root` variables, reset, body, inputs génériques
  - `css/layout.css` (217 lignes) : `nav`, `app-shell`, `app-body`, sidebar, main-area, view-tabs, media queries mobile
  - `css/components.css` (130 lignes) : boutons, cards, modals, pills, toast, search, spinners
  - `css/views.css` (124 lignes) : kanban, calendrier, dashboard, notifications, retours, liste
- `index.html` : `<style>...</style>` remplacé par 4 `<link rel="stylesheet">` dans le `<head>`, ordre cascade respecté (base → layout → components → views)
- `index.html` passe de 5060 à ~4584 lignes (-477 lignes)
- Zéro changement de règle CSS ni de logique JS, juste déplacement
- Bloc `<script>` strictement identique (vérifié par diff) — Phase A préservée intacte
- Nouveau fichier `netlify.toml` à la racine : cache-control `max-age=0, must-revalidate` sur `/css/*` et `/index.html` pour éviter le cache obsolète pendant la phase B
- Doublons CSS présents dans le bloc original ont été préservés tels quels (sections "NOUVELLE ARCHITECTURE" qui redéclaraient des sélecteurs comme `.sidebar`, `nav`, `.kpi-row`). Pas de nettoyage dans cette PR — déplacement uniquement.

### 2026-05-22 — Phase A : gestion d'erreur globale
- `window.onerror` : capture des erreurs JS non gérées → toast user-friendly (TypeError/ReferenceError/SyntaxError mappés vers messages non-techniques)
- `window.onunhandledrejection` : capture des promesses rejetées (await sans try/catch) → toast + déclenche bandeau Notion si erreur réseau
- Bandeau `#notion-banner` placé en flex-item dans `.app-shell` (entre `<nav>` et `.app-body`, pas de sticky/z-index) : apparaît dès le 1er échec d'appel `/.netlify/functions/notion` (réseau/timeout/aborted), disparaît auto au prochain succès
- Bouton "Réessayer" rejoue uniquement la dernière requête échouée (`_lastFailedCall`) ; listener lié en lazy dans `showNotionBanner()` avec garde anti double-binding
- Garde de visibilité : bandeau supprimé si `#app-shell` est masqué (évite l'affichage par-dessus l'écran de login pendant `initLogin()`)
- La fonction `api()` reste inchangée, on l'enveloppe par réassignation (`_apiOriginal`) — interception transparente succès/échec
- Regex de détection réseau : `failed to fetch | networkerror | load failed | timeout | aborted` (pas de match sur codes HTTP 5xx pour éviter les faux positifs)
- Debounce 3s anti-spam sur les toasts d'erreur globaux
- Variables CSS réutilisées : `--red-dim`, `--red`, `--text`. Réutilise `toast()` existant et la classe `.nav-btn`

### 2026-05-22 — Harmonisation sidebar bas
- 3 boutons en bas de sidebar maintenant uniformes (même largeur, padding, border-radius, font)
- **+ Nouveau sujet** : fond rouge plein (`var(--red)`)
- **💡 Nouvelle idée** : fond amber plein (`var(--amber)`)
- **👥 Gérer l'équipe** : fond `var(--bg2)` + bordure subtile (style atténué car action de gestion, pas de création)
- Icônes alignées (largeur fixe 16px) pour que les textes commencent à la même position
- Ligne user retravaillée : avatar 26px (au lieu de 24px), boutons 🔑 et ↩ regroupés à droite avec même style (bordure + padding 4px 7px), nom utilisateur tronque avec ellipsis si trop long

### 2026-05-21 — Dashboard restructuré en 4 niveaux
- N1 : KPIs **Vue globale** encadrés (bg2 + border + padding 24px) — mise en valeur du résumé
- N2 : grid 2 colonnes `1fr 1fr` → **Alertes (8 visibles)** | **Activité récente**
- N3 : **Activité mensuelle** + two-col Formats/Journaliste
- N4 : two-col **Délais** | **Export stats**
- Espacement vertical 28px entre chaque niveau
- `max-width` supprimé du dashboard (pleine largeur disponible)
- `main-content` padding ajusté à 24px 32px
- `toggleDashAlertes()` ajouté — alertes pliables
- Helpers ajoutés : `buildMoisSelect`, `buildAnneeSelect`, `exportStatsTxt`

### 2026-05-21 — Ajout entrée Export stats dans sidebar
- Nouvelle entrée 📊 **Export stats** dans la navigation (sous Archives)
- Au clic : modal léger avec sélecteurs Mois + Année pré-remplis
- Fonctions ajoutées : `ouvrirExportStats()`, `exportStatsFromModal()`
- Le bloc Export stats du dashboard reste intact (double accès)

### 2026-05-20 — Modal idée consultation corrigé
- Padding interne corrigé : `padding:0 20px 20px`
- Cohérence visuelle avec les modals "Nouveau sujet" et "Nouvelle idée"

---

## Infos projet
- **URL** : reel-media-production.netlify.app
- **GitHub** : David-f10/reel-media-production
- **Fichier principal** : `index.html` (squelette HTML + JS inline, ~4584 lignes depuis PR1)
- **CSS** : 4 fichiers dans `/css/` (base, layout, components, views) — depuis PR1
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

## 🏗️ Architecture en cours — Phase B (refonte modulaire)
- **PR 1 ✅** (2026-05-27) : extraction CSS vers 4 fichiers `/css/*.css`
- **PR 2** : passage en modules ES6 + extraction utilitaires (toast, format, overlay, parsing)
- **PR 3** : extraction `js/core/` (auth, api, errors, notifications)
- **PR 4** : extraction `js/views/` (dashboard, production, idées, archives)
- **PR 5** : extraction `js/modals/` (detail, nouveau-sujet, versions, retours, équipe, export)
- **PR 6** : nettoyage final + documentation
- Cible : `index.html` squelette ~200 lignes en fin de phase B

## État du code — corrections déjà appliquées

### 🔐 Sécurité / Authentification
- `doLogin()` async → appelle `/.netlify/functions/login` côté serveur (ligne ~2598)
- `EQUIPE_FALLBACK = []` — aucun code en clair dans le HTML (ligne ~2554)
- `login.js` lit les membres depuis Notion avec cache 1 minute
- Modal "Changer mon code" (bouton 🔑 dans header)
- `validerChangerCode()` vérifie l'ancien code via Function (ligne ~2675)
- Session persistante via `localStorage.setItem('rm-user', ...)`

### 👥 Équipe
- Victor (vic26), Louise (lou26), Arnaud C (arc26) — rôle Brand
- `renderEquipeList()` groupé par rôle (Chef/Journaliste/Monteur/Brand)
- `equippeAjouter()` crée dans Notion avec code auto (3 lettres + 26)
- `equipeSupprimerJournaliste()` archive dans Notion
- `confirmerAction()` toast de confirmation (pas de `confirm` natif)
- Formulaire ajout : champ Nom + select Rôle + bouton

### 🎵 Musiques / PAD
- Boutons 🎵 Avec musique / 🔇 Sans musique dans le step PAD
- `sansMusique` local défini dans `openDetail`
- `padPret = capDeposee && (sansMusique || releveMusique)`
- `ajouterMusiqueEtVerif()` ajoutée
- `exporterReleve()` cherche aussi dans `sujetsArchives`
- Step Musiques séparé supprimé

### 🛡️ Robustesse
- Retry API 429/503 (3 tentatives, backoff exponentiel)
- Guard `_createEnCours` sur `createSujet`
- Guard `_creerDecliEnCours` sur `creerDeclinaison`
- Guard retours ouverts dans `ajouterVersion`
- Filtre `Archivé=false` + `page_size:100`
- Archives chargées à la demande (`async renderArchives`)
- **Phase A (2026-05-22)** : `window.onerror` + `window.onunhandledrejection` + bandeau `#notion-banner` (voir historique)

### 🚦 Priorité
- `priorite` dans `parsePage`
- Select Priorité dans la fiche détail
- Tri par priorité dans `renderJournaliste`

### 🔔 Notifications
- `updStatut` : notifs PAD→journaliste, Retours→journaliste, MontageV1→chef
- `toggleRetour` : notif chef quand retour corrigé

### ✏️ Pré-remplissage
- `CHEF_PAR_DEFAUT = 'Benjamin'`
- Chef auto-rempli selon rôle

### 📊 Dashboard (4 niveaux avec 28px d'espace entre chaque)
- **N1** : KPIs encadrés (bg2 + border + padding 24px) — "Vue globale"
- **N2** : grid inline 1fr 1fr → Alertes (8 visibles) | Activité récente
- **N3** : Activité mensuelle + two-col Formats/Journaliste
- **N4** : two-col Délais | Export stats
- `toggleDashAlertes()` — alertes pliables
- `buildMoisSelect` / `buildAnneeSelect` / `exportStatsTxt`
- `max-width` supprimé du dashboard (pleine largeur)
- `main-content` padding:24px 32px

### 🎛️ Sidebar (3 boutons harmonisés)
Les 3 boutons en bas de sidebar ont le même format :
- Même largeur (100%), même padding (`9px 14px`), même `border-radius` (6px)
- Même `font-size` (12px) et `font-weight` (600)
- Icônes alignées (largeur fixe 16px) pour que les textes commencent à la même position

| Bouton | Style | Couleur |
|--------|-------|---------|
| **+ Nouveau sujet** | fond plein | `var(--red)` |
| **💡 Nouvelle idée** | fond plein | `var(--amber)` |
| **👥 Gérer l'équipe** | fond `bg2` + bordure subtile `border2` | (gris foncé) |
| **📊 Export stats** | entrée menu (au-dessus, dans la liste de navigation) | — |

**Ligne user (en bas de sidebar) :**
- Avatar 26px (au lieu de 24px) pour mieux respirer
- 🔑 (changer code) et ↩ (déconnexion) regroupés à droite avec même style (bordure + padding 4px 7px)
- Nom utilisateur tronque proprement avec ellipsis si trop long

`ouvrirExportStats()` + `exportStatsFromModal()` : modal léger avec sélecteurs mois/année.

### 🪟 UX divers
- Modal idée consultation : `padding:0 20px 20px`
- Modal "Nouvelle idée" : padding cohérent avec les autres modals

## 🔧 Ce qui reste à faire
1. **Phase B PR2-6** (en cours) : finir la refonte modulaire (ES6, core, views, modals, cleanup)
2. **Backup automatique** (GitHub Actions, export Notion → JSON nightly)
3. **Monitoring Sentry**
4. **Migration bases Notion** vers workspace Réel Média (attendre invitation d'Arnaud)
5. **Compteur Notion** : bug du formulaire `prop("Dernier numéro") + 1` qui reset à zéro — root cause à investiguer

## 📋 Workflow de modification
1. David décrit la modif voulue (en français, avec capture d'écran si possible)
2. Claude lit le fichier `index.html` dans le project knowledge
3. Claude effectue la modif
4. **Claude livre DEUX fichiers** :
   - `index.html` complet modifié
   - `CONTEXT_REEL_MEDIA.md` mis à jour avec nouvelle entrée d'historique en haut
5. David push les 2 fichiers sur GitHub `David-f10/reel-media-production`
6. David clique "Synchroniser maintenant" dans le project knowledge
7. Netlify déploie automatiquement le site
8. David sauvegarde une copie en local (système de versions personnel)

## 🎨 Variables CSS clés (pour cohérence visuelle)
- `--red` : rouge principal (boutons primaires, alertes)
- `--amber` : jaune ambre (idées, attention)
- `--bg2` : fond secondaire (cartes, modals)
- `--border` / `--border2` : bordures subtiles
- `--text` / `--text2` / `--text3` : hiérarchie de texte (clair → atténué)
- `--font` : police principale
- `--mono` : police monospace (codes, IDs)

## 👥 Équipe (rôles)
- **Chef** : Benjamin (chef principal par défaut), autres chefs à compléter
- **Journalistes** : Augustin, Julien, Nico, Mathilde, Mickael, Juliette, etc.
- **Brand** : Victor (vic26), Louise (lou26), Arnaud C (arc26)
- **David** : développeur principal de l'app
- **Arnaud** : responsable côté Réel Média (gère la migration Notion à venir)

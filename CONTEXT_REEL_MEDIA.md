# Contexte projet — Réel Média Production App

## Infos projet
- **URL** : reel-media-production.netlify.app
- **GitHub** : David-f10/reel-media-production
- **Fichier principal** : index.html (fichier unique HTML/CSS/JS, ~4976 lignes, ~263 Ko)
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

## ⚠️ État actuel du code — IMPORTANT
Le fichier `index.html` dans le project knowledge est **LA SOURCE OFFICIELLE À JOUR**.
- Il contient TOUTES les corrections déjà appliquées.
- **Ne jamais repartir de zéro.**
- **Ne jamais recréer du code from scratch** — toujours modifier le fichier existant.
- Toute modif doit être livrée sous forme d'un fichier `index.html` complet à télécharger.

## Règles importantes (ne pas casser)
- `EQUIPE_FALLBACK = []` — ne JAMAIS remettre les codes en clair dans le HTML
- `CHEF_PAR_DEFAUT = 'Benjamin'`
- Les IDs des bases Notion ne changent pas après déplacement workspace
- Communication en français
- Quand David demande une modif UX, lui livrer un fichier index.html complet modifié à télécharger

## Corrections déjà appliquées

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
Les 3 boutons en bas de sidebar ont maintenant le même format :
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
1. **Backup automatique** (GitHub Actions, export Notion → JSON nightly)
2. **Monitoring Sentry**
3. **Migration bases Notion** vers workspace Réel Média (attendre invitation d'Arnaud)
4. **Compteur Notion** : bug du formulaire `prop("Dernier numéro") + 1` qui reset à zéro — root cause à investiguer

## 📋 Workflow recommandé pour les modifications
1. David décrit la modif voulue (en français, avec capture d'écran si possible)
2. Claude lit le fichier `index.html` dans le project knowledge
3. Claude effectue la modif via `str_replace` ou édition ciblée
4. Claude livre un nouveau fichier `index.html` complet à télécharger
5. David upload sur GitHub `David-f10/reel-media-production` → Netlify déploie automatiquement
6. David sauvegarde la version localement (il a un système de stockage local de toutes les versions)
7. **Important** : David doit remplacer le `index.html` dans le project knowledge pour la prochaine session

## 🎨 Variables CSS clés (pour cohérence visuelle)
- `--red` : rouge principal (boutons primaires, alertes)
- `--amber` : jaune ambre (idées, attention)
- `--bg2` : fond secondaire (cartes, modals)
- `--border` / `--border2` : bordures subtiles
- `--text` / `--text2` / `--text3` : hiérarchie de texte (clair → atténué)
- `--font` : police principale
- `--mono` : police monospace (codes, IDs)

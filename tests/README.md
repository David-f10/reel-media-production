# Bancs de non-régression (Playwright)

Chaque banc sert le vrai `index.html` en local, mocke le réseau Notion/Drive,
et vérifie un comportement critique du relevé musique et du dépôt `.prproj`.

## Lancer

```sh
npm test                 # les quatre bancs à la suite
node tests/ui-bench.js    # un seul banc
```

Nécessite Playwright + Chromium (préinstallés dans l'environnement cloud ;
sinon `npm i -D playwright && npx playwright install chromium`).

## Les bancs

- `fix-bench`     — atomicité d'écriture du relevé (`prpEcrire`, #219) : un échec
                    ne laisse jamais de ligne derrière lui, la case n'est armée
                    qu'avec une liste exacte.
- `fenetre-bench` — fenêtre unique de dépôt + pop-up après le dépôt d'un lien de
                    version (#218).
- `verrou-bench`  — verrou relevé Brand post-seuil (dépôt bloqué tant que le relevé
                    manque), rollback, déblocage chef, export.
- `ui-bench`      — extraction `.prproj` (ticks → durées, séquences, parsing du nom
                    de fichier) + overlay de choix + écriture.
- `rearm-bench`   — réarmement atomique du relevé à l'ajout de version (#222) :
                    version + réarmement ensemble, rollback (y compris partiel et
                    rollback-en-échec), monteur après réarmement.
- `releve-affichage-bench` — affichage « relevé manquant » (pastille/compte/filtre) découplé du
                    verrou : en mémoire, sans seuil (statut ∈ STATUTS_MONTAGE), tandis que le verrou
                    garde le seuil ; agrégat « dernier monteur » paresseux (ouverture du filtre) +
                    état d'échec contenu à cette seule colonne.
- `releve-sans-musique-bench` — geste « sans musique » confirmer + produire : le document
                    est téléchargé AVANT la pose de la case (jamais de case sans document),
                    export affirmatif piloté par le flag, disponible post-seuil sans .prproj,
                    zéro écriture « Notes chef ».
- `lecteur-etape2.bench.js` — lecteur vidéo natif (étape 2) : repli iOS, pas de
                    `<video>` en bureau, bouton Télécharger, messages.

## Données

Aucune donnée client, aucun nom de personne, aucune référence de banque réelle.
Les fixtures de `ui-bench` sont **synthétiques**, fabriquées dans le code (un
`.prproj` minimal gzippé avec des valeurs inventées). `verrou-bench` utilise des
placeholders de rôle (`TESTEUR_M`, `TESTEUR_C`…), jamais de vrais noms.

Le dossier `tests/` est renvoyé en 404 par `netlify.toml` : rien ici n'est servi
publiquement. Voir `fixtures-local/README.md` pour le mode réel optionnel d'`ui-bench`.

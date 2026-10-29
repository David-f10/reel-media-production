# Maquettes de référence — espace client

Maquettes **de référence** de la vue montage de l'espace client, validées par David.
Elles fixent la **disposition** (en-tête pleine largeur, colonne principale qui s'étale,
colonne retours pleine hauteur, bande + légende, bloc d'écriture sous le lecteur).

- `maquette-B-16x9.html` — montage horizontal (16:9), bureau.
- `maquette-C-9x16.html` — montage vertical (9:16), bureau.
- `maquette-mobile.html` — vue empilée, 390 px.

**Ce ne sont pas du code de production.** Largeur de référence : **1440 px** de viewport.
Elles portent une enveloppe de l'outil de maquettage (`<x-dc>`, `support.js`, `helmet`)
à ignorer : seule la disposition fait foi. La production vit dans `client.html`, avec ses
propres conventions (tokens CSS, classes, échappement).

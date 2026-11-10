# Fixtures locales (optionnel, hors repo)

`ui-bench` tourne par défaut sur des fixtures **synthétiques** (aucune donnée
réelle). Si vous voulez EN PLUS valider l'extraction sur de vrais projets
Premiere, déposez-les ici :

- `B08Y.prproj`
- `Marais.prproj`

Présents, `ui-bench` joue aussi les assertions réelles (titres, durées,
références exactes). Absents, il saute simplement ce bloc.

⚠️ Ces fichiers sont **gitignorés** (`*.prproj`) : ils ne sont jamais commités.
Ils contiennent de vraies données projet et de vraies références de banque — et
`/tests/*` est de toute façon servi en 404 par Netlify.

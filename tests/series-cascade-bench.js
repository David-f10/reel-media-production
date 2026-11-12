'use strict';
// Banc — cascade « tour N sur X » (lot 2) : seriesAccordees(pr, defautMarque) = CARTE si posée (>0),
// sinon MARQUE si posée (>0), sinon 5. Le défaut marque ne devient JAMAIS une garde ; absence → repli 5.
// Helper PUR, testé directement (pas de navigateur, pas de réseau) via l'export additif d'espace-client.
const { seriesAccordees } = require('../netlify/functions/espace-client.js');

const carte = (n) => (n === undefined ? {} : { 'Séries accordées': { number: n } });

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };

console.log('\n\x1b[1mCascade carte → marque → 5\x1b[0m');

// 1) Valeur de carte posée : elle prime, quel que soit le défaut marque.
ok('carte=3, marque=5 → 3 (la carte prime)',               seriesAccordees(carte(3), 5) === 3);
ok('carte=8, marque absent → 8',                           seriesAccordees(carte(8), null) === 8);
ok('carte=2, marque=9 → 2 (la carte prime, jamais la marque)', seriesAccordees(carte(2), 9) === 2);

// 2) Carte vide : on retombe sur la marque.
ok('carte vide, marque=3 → 3 (hérité de la marque)',       seriesAccordees(carte(), 3) === 3);
ok('carte vide, marque=7 → 7',                             seriesAccordees(carte(), 7) === 7);

// 3) Carte vide ET marque absente/nulle → 5 (comportement d'avant le lot 2, inchangé).
ok('carte vide, marque null → 5',                          seriesAccordees(carte(), null) === 5);
ok('carte vide, marque undefined → 5',                     seriesAccordees(carte(), undefined) === 5);
ok('carte vide, APPEL SANS 2e argument → 5 (rétro-compat)', seriesAccordees(carte()) === 5);

// 4) Valeurs non positives ignorées des DEUX côtés (jamais 0 ou négatif affiché) → on descend d'un cran.
ok('carte=0, marque=4 → 4 (0 carte ignoré)',               seriesAccordees(carte(0), 4) === 4);
ok('carte=-1, marque absent → 5',                          seriesAccordees(carte(-1), null) === 5);
ok('carte vide, marque=0 → 5 (0 marque ignoré)',           seriesAccordees(carte(), 0) === 5);
ok('carte vide, marque=-2 → 5',                            seriesAccordees(carte(), -2) === 5);

// 5) Garde-fou : le helper RÉPOND toujours un nombre ≥ 1, jamais une fermeture (c'est de l'affichage).
ok('toujours un number',                                   typeof seriesAccordees(carte(), null) === 'number');

console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
process.exit(fails ? 1 : 0);

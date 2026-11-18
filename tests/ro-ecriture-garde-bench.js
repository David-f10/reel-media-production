'use strict';
// Banc — GARDE-FOU « écriture Notion brute sous emprunt ro ». JEU DE TEST UNIQUEMENT (aucune ligne de comportement).
//
// INVARIANT : dans un fichier joignable par un client, toute écriture Notion en `fetch` BRUT (hors du funnel
// `appelNotion`) est interdite, SAUF une liste d'exceptions explicite — aujourd'hui code-client.js, et lui seul.
// appelNotion (_notionio.js) refuse déjà toute mutation sous ro AVANT le réseau ; mais il ne couvre que les routes
// qui y passent. Les écritures BRUTES (fetch direct vers api.notion.com) lui échappent et doivent chacune porter
// leur propre garde ro locale. Ce banc empêche qu'on en ajoute une sans y penser.
//
// COMMENT (et ce qu'il ne voit PAS) :
//  • Périmètre DÉRIVÉ, pas gelé : clôture transitive des require('./_x') depuis les fichiers qui importent
//    _clienttoken. Un nouveau fichier client entre tout seul. (Angle mort B5 : un import exotique — require
//    dynamique, ré-export — ferait manquer le fichier.)
//  • « Lecture » n'est JAMAIS redéfinie : on importe estLecture de _notionio et on la laisse trancher. Si la prod
//    change estLecture, le garde-fou change avec.
//  • FAIL-CLOSED sur l'ambigu : un appel Notion dont la méthode ne se résout pas en littéral (ni au site direct, ni
//    aux sites d'appel du wrapper qui l'enveloppe) est compté ÉCRITURE. « Pas prouvé lecture » ⇒ « écriture ».
//  • Funnel exclu : _notionio.js (qui DÉFINIT appelNotion) n'est pas un contournement, c'est la voie sanctionnée —
//    son fetch interne n'est pas une « écriture brute ». (Angle mort : une écriture glissée DANS _notionio ne serait
//    pas vue ici — mais ce fichier est minuscule et central, toute modif y est scrutée.)
//  • Statique, pas runtime : on lit TOUTE la source, pas seulement l'exécuté — pas de trou de couverture (une
//    écriture derrière une branche non exécutée serait invisible à un banc runtime). (Angle mort B2 : un hôte Notion
//    assemblé par morceaux / tiré d'une variable d'env échappe à la reconnaissance du littéral 'api.notion.com'.)
//  • Hors périmètre volontaire (B3) : écritures Drive / Slack / Blobs sous emprunt — autre invariant, autre lot.

const fs = require('fs'), path = require('path');
const { estLecture } = require('../netlify/functions/_notionio'); // ⛔ LA définition de « lecture », jamais redéfinie.

const DIR = path.join(__dirname, '..', 'netlify', 'functions');
const HOST = 'api.notion.com';
const FUNNEL = '_notionio.js';                 // le funnel appelNotion lui-même — voie sanctionnée, pas un contournement
const EXCEPTIONS = ['code-client.js'];         // écritures Notion BRUTES autorisées (chacune gardée localement ro→403). UNE entrée.
const METH_LIT = "(?:'|\")(GET|HEAD|POST|PATCH|PUT|DELETE)(?:'|\")";

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };
const src = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');

// ── Clôture transitive des require('./_x') depuis les importeurs de _clienttoken ──
function localRequires(s) { const out = new Set(); const re = /require\(\s*['"]\.\/([A-Za-z0-9_.-]+)['"]\s*\)/g; let m; while ((m = re.exec(s))) { let d = m[1]; if (!d.endsWith('.js')) d += '.js'; out.add(d); } return out; }
const allFiles = fs.readdirSync(DIR).filter(f => f.endsWith('.js'));
const seeds = allFiles.filter(f => /require\(\s*['"]\.\/_clienttoken['"]\s*\)/.test(src(f)));
const closure = new Set(seeds);
(function () { const stack = [...seeds]; while (stack.length) { const f = stack.pop(); for (const dep of localRequires(src(f))) { if (allFiles.includes(dep) && !closure.has(dep)) { closure.add(dep); stack.push(dep); } } } })();

// ── Outils d'extraction (équilibrage des parenthèses, en sautant chaînes et gabarits) ──
// Depuis l'index de '(' : rend { inner, end } — texte entre parenthèses, et l'index après ')'.
function balanced(s, open) {
  let depth = 0, i = open, q = null;
  for (; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) return { inner: s.slice(open + 1, i), end: i + 1 }; }
  }
  return null;
}
// Découpe en arguments de premier niveau (virgules hors parenthèses/chaînes).
function splitArgs(inner) {
  const args = []; let depth = 0, q = null, start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) { args.push(inner.slice(start, i)); start = i + 1; }
  }
  args.push(inner.slice(start));
  return args.map(a => a.trim());
}
const hasQuery = (t) => t.indexOf('/query') !== -1;
// classe un appel résolu (méthode littérale + texte de chemin) via la VRAIE estLecture.
const classer = (methLit, pathText) => estLecture(methLit, hasQuery(pathText) ? '/d/query' : '/d') ? 'LECTURE' : 'ECRITURE';

// Méthode portée par l'objet d'options d'un fetch : { lit } | { v:true } (variable/shorthand/opts nu) | { lit:'GET' } si absent.
function methodeDesOptions(optsText) {
  if (optsText == null || optsText.trim() === '') return { lit: 'GET' };      // fetch(url) sans options = GET
  const t = optsText.trim();
  if (t[0] === '{') {
    let m = t.match(new RegExp('\\bmethod\\s*:\\s*' + METH_LIT, 'i'));
    if (m) return { lit: m[1].toUpperCase() };
    if (/\bmethod\s*:/.test(t)) return { v: true };                          // method: <identifiant/expression>
    if (/[{,]\s*method\s*[,}]/.test(t)) return { v: true };                  // shorthand { method }
    return { lit: 'GET' };                                                   // objet sans method = GET par défaut
  }
  return { v: true };                                                        // opts = identifiant nu (ex. `opt`)
}

// Nom de la fonction englobant l'index idx (heuristique : dernière en-tête de fonction avant idx).
function fonctionEnglobante(s, idx) {
  const before = s.slice(0, idx);
  let name = null, best = -1, m;
  const re1 = /(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = re1.exec(before))) if (m.index > best) { best = m.index; name = m[1]; }
  const re2 = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\()/g;
  while ((m = re2.exec(before))) if (m.index > best) { best = m.index; name = m[1]; }
  return name;
}

// Décisions aux sites d'appel d'un wrapper nommé : littéral de méthode + chemin parmi les args. Fail-closed si pas de littéral.
function decisionsSitesAppel(s, name) {
  const out = []; const re = new RegExp('\\b' + name + '\\s*\\(', 'g'); let m;
  while ((m = re.exec(s))) {
    const before = s.slice(0, m.index);
    if (/(?:function|const|let|var)\s+$/.test(before)) continue;             // la DÉFINITION du wrapper, pas un appel
    if (/\.\s*$/.test(before)) continue;                                     // accès propriété x.name( — pas notre wrapper
    const open = s.indexOf('(', m.index);
    const b = balanced(s, open); if (!b) continue;
    const argsText = b.inner;
    const lit = argsText.match(new RegExp(METH_LIT, 'i'));
    if (!lit) { out.push('ECRITURE'); continue; }                            // appel sans méthode littérale → fail-closed
    out.push(classer(lit[1].toUpperCase(), argsText));
  }
  return out;
}

// Un fichier écrit-il en Notion BRUT ? (funnel exclu en amont)
function ecritNotionBrut(f) {
  const s = src(f);
  const decisions = [];
  const wrappersVus = new Set();
  const re = /fetch\s*\(/g; let m;
  while ((m = re.exec(s))) {
    const open = s.indexOf('(', m.index);
    const b = balanced(s, open); if (!b) continue;
    const args = splitArgs(b.inner);
    const url = args[0] || '';
    if (url.indexOf(HOST) === -1) continue;                                  // fetch non-Notion → ignoré
    const meth = methodeDesOptions(args[1]);
    if (meth.lit) { decisions.push(classer(meth.lit, url)); continue; }      // méthode littérale inline → directe
    // méthode non littérale : corps d'un wrapper (ou écriture variable ponctuelle) → résoudre via les sites d'appel
    const enc = fonctionEnglobante(s, m.index);
    if (enc && !wrappersVus.has(enc)) {
      wrappersVus.add(enc);
      const d = decisionsSitesAppel(s, enc).filter(x => x !== undefined);
      if (d.length) { d.forEach(x => decisions.push(x)); continue; }
    }
    decisions.push('ECRITURE');                                             // méthode irrésolue → fail-closed
  }
  return decisions.indexOf('ECRITURE') !== -1;
}

const scope = [...closure].filter(f => f !== FUNNEL);
const writers = scope.filter(ecritNotionBrut);

console.log('\n\x1b[1mGarde-fou « écriture Notion brute sous ro » — clôture ' + closure.size + ' fichiers (funnel exclu : ' + scope.length + ')\x1b[0m');
console.log('  écrivains Notion bruts détectés : ' + (writers.join(', ') || '(aucun)'));

// (a) COUVERTURE : aucun écrivain brut hors de la liste d'exceptions.
const horsListe = writers.filter(w => EXCEPTIONS.indexOf(w) === -1);
ok('COUVERTURE : aucune écriture Notion brute hors EXCEPTIONS' + (horsListe.length ? ' (fuite : ' + horsListe.join(', ') + ')' : ''), horsListe.length === 0);

// (b) MINIMALITÉ : aucune exception morte — chaque entrée est dans la clôture ET écrit vraiment en brut.
const mortes = EXCEPTIONS.filter(e => !closure.has(e) || writers.indexOf(e) === -1);
ok('MINIMALITÉ : aucune exception morte dans EXCEPTIONS' + (mortes.length ? ' (morte : ' + mortes.join(', ') + ')' : ''), mortes.length === 0);

// Ancres de réalité : le scanner colle au code tel qu'il est ce soir.
ok('la clôture est dérivée et non triviale (≥ 20 fichiers)', closure.size >= 20);
ok('code-client.js est dans la clôture ET détecté écrivain', closure.has('code-client.js') && writers.indexOf('code-client.js') !== -1);
ok('espace-client.js est dans la clôture ET N\'est PAS écrivain (lecture /query inline)', closure.has('espace-client.js') && writers.indexOf('espace-client.js') === -1);
ok('sequencier-doc.js est dans la clôture ET N\'est PAS écrivain (wrapper, appel POST /query)', closure.has('sequencier-doc.js') && writers.indexOf('sequencier-doc.js') === -1);
ok('le funnel _notionio.js est exclu du périmètre d\'écrivains', !scope.includes(FUNNEL) && closure.has(FUNNEL));

console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
process.exit(fails ? 1 : 0);

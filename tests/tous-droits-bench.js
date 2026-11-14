'use strict';
// Banc — « Tous les droits » (vérification, David) sur la garde de RÔLE de l'envoi au client
// (envoyer-version.js). Trois cas imposés + un témoin :
//   • Monteur + Tous les droits → PASSE la garde de rôle (n'est plus « Réservé aux contacts Brand ou aux chefs ») ;
//   • Monteur sans → 403 (garde de rôle) ;
//   • Externe + Tous les droits → 403 QUAND MÊME, et pour la raison Externe (l'ordre : Externe refusé AVANT le rôle) ;
//   • Chef (témoin) → passe.
// La garde serveur est la vraie frontière ; on la teste directement, réseau mocké.

process.env.NOTION_TOKEN = 'banc-token';
const DB_EQUIPE = 'df0e44e1-7c9c-4427-a9c2-af7b6da78fcb';

const M = (id, code, role, extra) => ({ id, properties: Object.assign({
  'Nom': { title: [{ plain_text: id }] }, 'Code acces': { rich_text: [{ plain_text: code }] }, 'Role': { select: { name: role } }
}, extra || {}) });
const DAVID   = M('david',   'DAVIDCODE', 'Monteur', { 'Tous les droits': { checkbox: true } });
const MONTEUR = M('paul',    'PAULCODE',  'Monteur', {});                                   // ni rôle ni tous droits
const EXTERNE = M('ext',     'EXTCODE',   'Monteur', { 'Tous les droits': { checkbox: true }, 'Accès': { select: { name: 'Externe' } } });
const CHEF    = M('chloe',   'CHLOECODE', 'Chef',    {});

const rep = (obj, status) => Promise.resolve({ ok: (status || 200) < 400, status: status || 200, headers: { get: () => null }, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
global.fetch = function (url) {
  const u = String(url);
  if (/\/databases\/(.+?)\/query$/.test(u)) return rep({ results: [DAVID, MONTEUR, EXTERNE, CHEF] });
  if (/\/pages\//.test(u)) return rep({}, 404); // version introuvable → le cas « passe la garde » atterrit ici, pas sur le 403 de rôle
  return rep({});
};

const { handler } = require('../netlify/functions/envoyer-version');
const evt = (id, code) => ({ httpMethod: 'POST', headers: { 'x-rm-id': id, 'x-rm-code': code }, body: JSON.stringify({ versionId: 'v1' }) });
const ROLE_403 = 'Réservé aux contacts Brand ou aux chefs';
const EXT_403 = 'Réservé à l\'équipe';

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };

(async () => {
  console.log('\n\x1b[1mTous les droits — garde de rôle de l\'envoi au client\x1b[0m');

  const d = await handler(evt('david', 'DAVIDCODE'));
  ok('Monteur + Tous les droits → PASSE la garde de rôle (plus de 403 « Brand/chefs »)', (d.body || '').indexOf(ROLE_403) === -1);
  ok('  … et atteint la suite (version introuvable → 404)', d.statusCode === 404);

  const m = await handler(evt('paul', 'PAULCODE'));
  const mb = JSON.parse(m.body || '{}');
  ok('Monteur sans le droit → 403 garde de rôle', m.statusCode === 403 && mb.error === ROLE_403);

  const e = await handler(evt('ext', 'EXTCODE'));
  const eb = JSON.parse(e.body || '{}');
  ok('Externe + Tous les droits → 403 QUAND MÊME', e.statusCode === 403);
  ok('  … et pour la raison Externe, pas la raison de rôle (Externe refusé en premier)', eb.error === EXT_403);

  const c = await handler(evt('chloe', 'CHLOECODE'));
  ok('Chef (témoin) → passe la garde de rôle', (c.body || '').indexOf(ROLE_403) === -1);

  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

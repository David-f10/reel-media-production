'use strict';
// Banc — miroir Slack à sens unique (M1). Réseau mocké.
// Prouve les deux invariants que David a verrouillés + le contrat best-effort :
//   • ⛔ ZÉRO texte client dans la charge Slack (on dépose un message/objet sentinelle, absent du POST Slack).
//   • ⛔ ZÉRO secret dans une réponse (le webhook sentinelle n'apparaît dans aucun body renvoyé, ni dans un log).
//   • NO-OP SILENCIEUX sans SLACK_WEBHOOK_URL (marche dès maintenant) : dépôt 200, aucun POST Slack.
//   • Slack en panne (500 / rejet / absent) NE FAIT JAMAIS échouer le dépôt (toujours 200), et ne lance jamais.
//   • Le message porte le NOM de la marque + « voir dans HAVANA », pas le code.

process.env.CLIENT_SIGN_SECRET = 'banc-secret';
process.env.NOTION_TOKEN = 'banc-token';
process.env.DB_CONTACTS_CLIENT = 'dbcontacts';
delete process.env.SLACK_WEBHOOK_URL; // on part SANS webhook (no-op), on le posera par test

const HOOK = 'https://hooks.slack.test/ZZSLACK-SECRET-TOKEN'; // le webhook = LE secret : ne doit jamais fuir
const DB_CLIENTS_BRAND = '67abbb5f-f6a6-4937-89e3-6c852c515a8e';
const DB_DEMANDES = '41875d81-5951-8115-b6c0-ede198a923ab';
const DB_MISSIONS = '41875d81-5951-81b6-a6aa-ff03bfbcfd49';
const ID = '11111111-1111-1111-1111-111111111111';
const TXT_DEMANDE = 'TEXTE-CLIENT-PRIVE-777'; // ne doit JAMAIS atterrir dans Slack
const TXT_MISSION = 'OBJET-CLIENT-PRIVE-888';

const { signer } = require('../netlify/functions/_clienttoken');
const { signalerSlack } = require('../netlify/functions/_slack');

const CONTACT = { id: ID, properties: { 'Mail': { email: 'c@refashion.fr' }, 'Nom': { title: [{ plain_text: 'Claire' }] }, 'Actif': { checkbox: true }, 'Code Brand': { rich_text: [{ plain_text: 'B33' }] }, 'Marque': { rich_text: [{ plain_text: 'Refashion' }] } } };
const BRAND = { id: 'brand', properties: { 'Code': { rich_text: [{ plain_text: 'B33' }] }, 'Espace client activé': { checkbox: true } } };

let slackPosts = []; // { body }
let slackMode = 'ok'; // 'ok' | '500' | 'throw'
const rep = (obj, status) => Promise.resolve({ ok: (status || 200) < 400, status: status || 200, headers: { get: () => null }, json: () => Promise.resolve(obj), text: () => Promise.resolve(JSON.stringify(obj)) });
global.fetch = function (url, opt) {
  const u = String(url), method = (opt && opt.method) || 'GET';
  if (process.env.SLACK_WEBHOOK_URL && u === process.env.SLACK_WEBHOOK_URL) {
    slackPosts.push({ body: (opt && opt.body) || '' });
    if (slackMode === 'throw') return Promise.reject(new Error('réseau'));
    if (slackMode === '500') return rep({ error: 'nope' }, 500);
    return rep({ ok: true });
  }
  const mq = u.match(/\/databases\/(.+?)\/query$/);
  if (mq) {
    const db = mq[1];
    if (db === process.env.DB_CONTACTS_CLIENT) return rep({ results: [CONTACT] });
    if (db === DB_CLIENTS_BRAND) return rep({ results: [BRAND] });
    return rep({ results: [] });
  }
  if (/\/pages(\/|$)/.test(u)) return rep({ id: 'created' }); // POST create
  return rep({});
};

const demandeClient = require('../netlify/functions/demande-client').handler;
const missionClient = require('../netlify/functions/mission-client').handler;
const evtC = (jeton, body) => ({ httpMethod: 'POST', headers: { 'x-rmc-token': jeton }, body: JSON.stringify(body) });
const jNorm = signer(ID).token;

let fails = 0;
const ok = (n, c) => { console.log((c ? '  \x1b[32m✓\x1b[0m ' : '  \x1b[31m✗ ') + n + (c ? '' : '\x1b[0m')); if (!c) fails++; };
const dernierSlack = () => (slackPosts.length ? slackPosts[slackPosts.length - 1].body : '');

(async () => {
  // ── Unitaire _slack.js ───────────────────────────────────────────────────────────────────────────
  console.log('\n\x1b[1m_slack — helper\x1b[0m');
  delete process.env.SLACK_WEBHOOK_URL; slackPosts = [];
  let jeta = false; try { await signalerSlack({ marque: 'Refashion', type: 'nouvelle demande' }); } catch (e) { jeta = true; }
  ok('sans SLACK_WEBHOOK_URL → no-op (aucun POST), ne lance pas', !jeta && slackPosts.length === 0);

  process.env.SLACK_WEBHOOK_URL = HOOK; slackPosts = []; slackMode = 'ok';
  await signalerSlack({ marque: 'Refashion', type: 'nouvelle demande' });
  ok('avec webhook → 1 POST Slack', slackPosts.length === 1);
  ok('message : NOM de marque + « voir dans HAVANA »', dernierSlack().indexOf('Refashion') >= 0 && dernierSlack().indexOf('voir dans HAVANA') >= 0);

  // Panne : ne lance jamais, et ne logge jamais l'URL.
  const vraiErr = console.error; let logs = '';
  console.error = (...a) => { logs += a.join(' ') + '\n'; };
  slackMode = '500'; jeta = false; try { await signalerSlack({ marque: 'X', type: 'y' }); } catch (e) { jeta = true; }
  ok('Slack 500 → ne lance pas', !jeta);
  slackMode = 'throw'; jeta = false; try { await signalerSlack({ marque: 'X', type: 'y' }); } catch (e) { jeta = true; }
  ok('Slack rejet réseau → ne lance pas', !jeta);
  console.error = vraiErr;
  ok('échec loggé SANS jamais l\'URL du webhook', logs.length > 0 && logs.indexOf(HOOK) === -1 && logs.indexOf('ZZSLACK-SECRET') === -1);

  // ── Intégration : écriture client → miroir ───────────────────────────────────────────────────────
  console.log('\n\x1b[1mdemande-client → Slack\x1b[0m');
  process.env.SLACK_WEBHOOK_URL = HOOK; slackPosts = []; slackMode = 'ok';
  let r = await demandeClient(evtC(jNorm, { action: 'creer', type: 'Autre', message: TXT_DEMANDE }));
  ok('dépôt → 200', r.statusCode === 200 && JSON.parse(r.body).ok);
  ok('un ping Slack est parti', slackPosts.length === 1);
  ok('⛔ le texte du client N\'EST PAS dans la charge Slack', dernierSlack().indexOf(TXT_DEMANDE) === -1);
  ok('message porte le nom de marque', dernierSlack().indexOf('Refashion') >= 0);
  ok('⛔ le webhook n\'apparaît PAS dans la réponse', r.body.indexOf(HOOK) === -1 && r.body.indexOf('ZZSLACK-SECRET') === -1);

  slackPosts = []; slackMode = '500';
  r = await demandeClient(evtC(jNorm, { action: 'creer', type: 'Autre', message: 'x' }));
  ok('Slack 500 → dépôt toujours 200 (jamais bloquant)', r.statusCode === 200 && JSON.parse(r.body).ok);
  slackPosts = []; slackMode = 'throw';
  r = await demandeClient(evtC(jNorm, { action: 'creer', type: 'Autre', message: 'x' }));
  ok('Slack rejet → dépôt toujours 200', r.statusCode === 200 && JSON.parse(r.body).ok);

  slackPosts = []; slackMode = 'ok'; delete process.env.SLACK_WEBHOOK_URL;
  r = await demandeClient(evtC(jNorm, { action: 'creer', type: 'Autre', message: 'x' }));
  ok('sans webhook (no-op) → dépôt 200, aucun ping', r.statusCode === 200 && slackPosts.length === 0);

  console.log('\n\x1b[1mmission-client → Slack\x1b[0m');
  process.env.SLACK_WEBHOOK_URL = HOOK; slackPosts = []; slackMode = 'ok';
  r = await missionClient(evtC(jNorm, { action: 'creer', objet: TXT_MISSION }));
  ok('dépôt → 200', r.statusCode === 200 && JSON.parse(r.body).ok);
  ok('un ping Slack est parti', slackPosts.length === 1);
  ok('⛔ l\'objet du client N\'EST PAS dans la charge Slack', dernierSlack().indexOf(TXT_MISSION) === -1);
  ok('message porte le nom de marque + libellé « nouvelle mission »', dernierSlack().indexOf('Refashion') >= 0 && dernierSlack().indexOf('nouvelle mission') >= 0);
  ok('⛔ le webhook n\'apparaît PAS dans la réponse', r.body.indexOf(HOOK) === -1);

  delete process.env.SLACK_WEBHOOK_URL;
  console.log('\n' + (fails ? '\x1b[31m' + fails + ' FAIL' : '\x1b[32mTOUT VERT') + '\x1b[0m');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

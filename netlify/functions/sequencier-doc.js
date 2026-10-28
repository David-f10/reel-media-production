// netlify/functions/sequencier-doc.js
// Lot G tranche 2 — AFFICHAGE DU SÉQUENCIER (Google Doc) dans l'espace client, pour le bloc « À valider ».
//
// MÉCANISME (tranché) : API Docs `documents.get` avec `suggestionsViewMode=PREVIEW_WITHOUT_SUGGESTIONS`,
// PAS d'export HTML, PAS de permission publique créée. On lit le Doc avec le COMPTE DE SERVICE (scope drive
// complet, _drive.getSA) — son propre accès, jamais un partage « anyone with link ».
//
// ÉTANCHÉITÉ (le point bloquant) — rien d'autre que le texte choisi ne transite :
//   • PREVIEW_WITHOUT_SUGGESTIONS → le Doc est rendu comme si toutes les suggestions étaient REJETÉES.
//   • Les COMMENTAIRES ne sont pas dans la ressource `documents.get` (ils vivent dans l'API Drive comments) ;
//     `COMMENTS_VIEW_MODE_INCLUDED` exigerait `SUGGESTIONS_INLINE` (400 sinon) — donc en preview, omis par
//     construction. Aucune ancre de commentaire ne ressort du corps.
//   • GARDE RUNTIME (ce que la doc ne garantit pas, notamment les ancres) : on PARCOURT nous-mêmes la
//     structure et on n'émet QUE le texte des `textRun` qui ne portent NI `suggestedInsertionIds` NI
//     `suggestedDeletionIds`. Si un run suggéré apparaissait malgré le mode, il est IGNORÉ (et compté/loggé).
//   Deux mécanismes indépendants → aucun commentaire, aucune ancre, aucune suggestion ne peut transiter.
//
// IMAGES : PLACEHOLDER TEXTE (« [image du séquencier] »), jamais de base64 (N appels Drive contre le budget
// 10 s, page alourdie, gain faible). Jamais une icône cassée muette.
//
// DÉGRADATION PROPRE : SA sans accès au Doc (403/404), pas de Lien sequencier, ou id illisible → { ok:true,
// indisponible:true }. L'espace affiche « Le séquencier n'est pas encore disponible ici » ; la validation et
// « Demander des corrections » restent actives. Jamais un bloc cassé.
//
// PORTIER : identique à valider-sequencier-client (duplication assumée, lane client) — session + contact
// actif (porte l'activation marque) + projet Brand de SA marque + « Validation Brand » posée.

const { verifier } = require('./_clienttoken');
const { contactActif } = require('./_authclient');
const { CODE_BRAND_RE } = require('./_perimetreclient');
const { getSA } = require('./_drive');

const DB_PROD = '01a8dc7d-1cc2-4209-9afe-a3bd90a87e20';
const DOCS_API = 'https://docs.googleapis.com/v1/documents/';

const _sel = (pr, k) => (pr && pr[k] && pr[k].select && pr[k].select.name) || '';
const _cb = (pr, k) => !!(pr && pr[k] && pr[k].checkbox);
const _rt = (pr, k) => ((pr && pr[k] && pr[k].rich_text) || []).map(t => t.plain_text || '').join('');
const _ti = (pr, k) => ((pr && pr[k] && pr[k].title) || []).map(t => t.plain_text || '').join('');
const _url = (pr, k) => (pr && pr[k] && pr[k].url) || '';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Id d'un lien Google (Docs `/document/d/ID`, Drive `/file/d/ID`, `/d/ID`, ou `?id=ID`). extractFileId de
// _drive ne gère que `/file/d/` → insuffisant pour une URL de Doc.
function docId(url) {
  const s = String(url || '');
  const m = s.match(/\/d\/([\w-]+)/) || s.match(/[?&]id=([\w-]{10,})/);
  return m ? m[1] : '';
}

function acao(event) {
  const o = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const hotes = [process.env.SITE_ORIGIN, 'https://reel-media-production.netlify.app'].filter(Boolean);
  return (o && hotes.indexOf(o) !== -1) ? o : '';
}
async function notionFetch(pathApi, method, token, bodyObj) {
  const r = await fetch('https://api.notion.com/v1' + pathApi, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined
  });
  if (!r.ok) throw new Error(method + ' ' + pathApi.slice(0, 16) + ' ' + r.status);
  return r.json();
}

// Parcours SÉLECTIF de la structure Docs → HTML sûr. LISTE BLANCHE de balises STATIQUES uniquement :
// p, h3, h4, strong, em, ul, li, table, tr, td — aucune balise porteuse de style arbitraire. Tout texte est
// ÉCHAPPÉ par run avant mise en forme. N'émet JAMAIS un run suggéré (garde runtime, cf. en-tête). Les
// éléments structurels NON rendus (TOC, tableau trop imbriqué, autres) sont COMPTÉS → le client est prévenu
// qu'une partie n'est pas affichée (jamais une troncature silencieuse). Renvoie
// { html, suggestionsIgnorees, structurelsIgnores }.
const MAX_TABLE_PROF = 1; // tableau + 1 niveau d'imbrication ; au-delà → compté comme ignoré

// Un run → texte échappé, enveloppé selon gras/italique (liste blanche). '' si run suggéré (ignoré).
function rendreRun(tr, ctx) {
  if ((tr.suggestedInsertionIds && tr.suggestedInsertionIds.length) || (tr.suggestedDeletionIds && tr.suggestedDeletionIds.length)) { ctx.suggestionsIgnorees++; return ''; }
  let t = esc(tr.content || '');
  if (!t) return '';
  const st = tr.textStyle || {};
  if (st.italic) t = '<em>' + t + '</em>';
  if (st.bold) t = '<strong>' + t + '</strong>';
  return t;
}
// Contenu INTÉRIEUR d'un paragraphe (runs + images), HTML déjà échappé. L'appelant choisit la balise bloc.
function contenuParagraphe(par, ctx) {
  let h = '';
  for (const pe of (par.elements || [])) {
    if (pe.textRun) { h += rendreRun(pe.textRun, ctx); continue; }
    if (pe.inlineObjectElement) { h += '[image du séquencier] '; continue; }
    // person (@ d'une personne) et richLink (lien intelligent vers un autre Doc) : on rend leur TEXTE
    // (nom / titre), échappé, en texte simple — jamais l'URI, aucune balise, aucun lien sortant. Préserve
    // le sens sans élargir la liste blanche.
    if (pe.person) { h += esc((pe.person.personProperties && pe.person.personProperties.name) || ''); continue; }
    if (pe.richLink) { h += esc((pe.richLink.richLinkProperties && pe.richLink.richLinkProperties.title) || ''); continue; }
    // Tout autre élément de paragraphe (footnoteReference, equation, autoText, pageBreak, horizontalRule…)
    // n'est pas rendu → COMPTÉ comme les structurels, pour que la mention « certaines parties ne s'affichent
    // pas ici » se déclenche. Plus de troncature silencieuse AU NIVEAU DU PARAGRAPHE non plus.
    ctx.structurelsIgnores++;
  }
  return h.replace(/\s+$/, '');
}
// Rend une liste d'éléments structurels. profondeur = niveau d'imbrication de tableau courant.
function rendreContenu(contenu, profondeur, ctx) {
  const out = [];
  let li = []; // tampon de puces consécutives → un seul <ul>
  const flush = () => { if (li.length) { out.push('<ul>' + li.join('') + '</ul>'); li = []; } };
  for (const el of (contenu || [])) {
    if (el.paragraph) {
      const par = el.paragraph;
      const h = contenuParagraphe(par, ctx);
      if (!h) continue; // paragraphe vide (ou tout suggéré) → rien
      if (par.bullet) { li.push('<li>' + h + '</li>'); continue; } // puce
      flush();
      const style = (par.paragraphStyle && par.paragraphStyle.namedStyleType) || '';
      const tag = /^HEADING_[1-3]$/.test(style) ? 'h3' : (/^HEADING_/.test(style) ? 'h4' : 'p');
      out.push('<' + tag + '>' + h + '</' + tag + '>');
    } else if (el.table) {
      flush();
      if (profondeur >= MAX_TABLE_PROF) { ctx.structurelsIgnores++; continue; } // trop imbriqué → compté
      const rows = (el.table.tableRows || []).map(row =>
        '<tr>' + (row.tableCells || []).map(cell => '<td>' + rendreContenu(cell.content, profondeur + 1, ctx) + '</td>').join('') + '</tr>'
      ).join('');
      out.push('<table>' + rows + '</table>');
    } else if (el.tableOfContents) {
      flush(); ctx.structurelsIgnores++; // un sommaire ne s'affiche pas ici → signalé
    }
    // sectionBreak & co : rien d'affichable, on n'incrémente PAS (ce n'est pas du contenu tronqué).
  }
  flush();
  return out.join('\n');
}
function rendreDoc(doc) {
  const ctx = { suggestionsIgnorees: 0, structurelsIgnores: 0 };
  const html = rendreContenu((doc && doc.body && doc.body.content) || [], 0, ctx);
  return { html, suggestionsIgnorees: ctx.suggestionsIgnorees, structurelsIgnores: ctx.structurelsIgnores };
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type, x-rmc-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
  const origin = acao(event);
  if (origin) { headers['Access-Control-Allow-Origin'] = origin; headers['Vary'] = 'Origin'; }
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };

  const token = process.env.NOTION_TOKEN;
  if (!token) { console.error('sequencier-doc indispo : NOTION_TOKEN manquant'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  let body; try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'JSON invalide' }) }; }
  const sujetCode = String(body.sujetCode || '').trim();
  if (!sujetCode) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'sujetCode manquant' }) };

  // ── Portier (identique à valider-sequencier-client) ──
  const jeton = (event.headers && (event.headers['x-rmc-token'] || event.headers['X-Rmc-Token'])) || '';
  const vt = verifier(jeton);
  if (!vt.ok) return { statusCode: vt.raison === 'config' ? 503 : 401, headers, body: JSON.stringify({ ok: false, error: vt.raison === 'config' ? 'Service temporairement indisponible' : 'Authentification requise' }) };
  const liv = await contactActif(vt.id);
  if (!liv.ok) return { statusCode: liv.raison === 'indispo' ? 503 : 401, headers, body: JSON.stringify({ ok: false, error: liv.raison === 'indispo' ? 'Service temporairement indisponible' : 'Authentification requise' }) };
  const codeBrand = String(liv.codeBrand || '').trim();
  if (!CODE_BRAND_RE.test(codeBrand)) { console.error('sequencier-doc : code marque invalide'); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }
  const reCode = new RegExp('^' + codeBrand + '[A-Za-z]+$');
  if (!reCode.test(sujetCode)) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Accès refusé' }) };

  let sujet;
  try {
    const d = await notionFetch('/databases/' + DB_PROD + '/query', 'POST', token, { filter: { property: 'Code', rich_text: { equals: sujetCode } }, page_size: 1 });
    sujet = d.results && d.results[0];
  } catch (e) { console.error('sequencier-doc indispo (lecture sujet) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }
  if (!sujet) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Accès refusé' }) };
  const pr = sujet.properties || {};
  if (_sel(pr, 'Format') !== 'Brand' || !reCode.test(_rt(pr, 'Code'))) return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Accès refusé' }) };
  if (!_cb(pr, 'Validation Brand')) return { statusCode: 409, headers, body: JSON.stringify({ ok: false, error: 'Le séquencier n\'est pas encore prêt pour validation.' }) };

  // ── Résolution de l'id de Doc. Absent / illisible → DÉGRADATION (pas une erreur). ──
  const id = docId(_url(pr, 'Lien sequencier'));
  if (!id) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, indisponible: true }) };

  // ── Lecture via le SA (API Docs, mode sans suggestions). 403/404 (SA sans accès) → DÉGRADATION. ──
  let sa;
  try { sa = await getSA(); }
  catch (e) { console.error('sequencier-doc indispo (SA) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }
  let doc;
  try {
    const r = await fetch(DOCS_API + encodeURIComponent(id) + '?suggestionsViewMode=PREVIEW_WITHOUT_SUGGESTIONS', { headers: { 'Authorization': `Bearer ${sa.token}` } });
    if (r.status === 403 || r.status === 404) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, indisponible: true }) };
    if (!r.ok) throw new Error('docs.get ' + r.status);
    doc = await r.json();
  } catch (e) { console.error('sequencier-doc indispo (docs.get) : ' + (e && e.message || '')); return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: 'Service temporairement indisponible' }) }; }

  const { html, suggestionsIgnorees, structurelsIgnores } = rendreDoc(doc);
  if (suggestionsIgnorees) console.error('sequencier-doc : ' + suggestionsIgnorees + ' run(s) suggéré(s) ignoré(s) pour ' + sujetCode + ' (garde runtime — le mode preview aurait dû les retirer)');
  if (structurelsIgnores) console.error('sequencier-doc : ' + structurelsIgnores + ' élément(s) structurel(s) non affiché(s) pour ' + sujetCode + ' (sommaire / tableau trop imbriqué / autre) → client prévenu');
  // tronque = une partie du Doc n'a pas pu être rendue → le client doit le savoir (jamais de troncature muette).
  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, titre: _ti(pr, 'Titre'), html, tronque: structurelsIgnores > 0 }) };
};

module.exports._test = { rendreDoc, docId };

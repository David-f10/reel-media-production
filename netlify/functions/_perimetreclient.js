// netlify/functions/_perimetreclient.js
// Lot G — SOCLE ESPACE CLIENT (tranche 1). Périmètre d'un CONTACT CLIENT : tous les projets de SA marque
// qui sont EXPOSÉS. Rien à voir avec le périmètre équipe/externe (les 5 champs select journaliste/monteurs
// ne concernent pas un client). Ici le rattachement sujet↔marque passe par la CONVENTION DE CODE déjà en
// place : le `Code` d'un sujet Brand = `Code` de la marque (🏷️ Clients Brand, ex. "B33" Refashion) + une
// ou plusieurs LETTRES de déclinaison (B33D, B09AA). Les 63 codes marque sont des `B`+chiffres UNIQUES.
//
// Contrat de SORTIE — statut DISTINGUABLE (réserve de David) : un ÉCHEC ne doit jamais ressembler à
// « aucun projet ». On renvoie :
//   • { ok:true,  projets:[{code,titre}, …] } — périmètre CALCULÉ (la liste peut être vide : c'est un
//     VRAI vide, le client n'a aucun projet exposé) ;
//   • { ok:false, raison:'code-invalide'|'query' } — ÉCHEC : AUCUNE donnée, et un statut que l'écran peut
//     traduire en « temporairement indisponible » au lieu d'un « vous n'avez aucun projet » mensonger.
// Fail-closed : aucune issue ne renvoie de projets hors périmètre ; le seul chemin vers des projets est une
// query scopée RÉUSSIE. Jamais d'exception propagée (l'appelant lit `ok`), l'échec est loggé côté serveur.
//
// Code Brand (réserve de David) : il NE DOIT JAMAIS être saisi au clavier. En tranche 3, l'écran d'admin le
// pose depuis la marque CHOISIE dans la liste 🏷️ Clients Brand (valeur `Code` recopiée), jamais tapé —
// une faute de frappe donnerait un périmètre vide au mieux, celui d'une autre marque au pire. Ce module le
// VALIDE défensivement de toute façon (^B\d{2,}$) et ne construit la query que sur une valeur conforme.
//
// Leçon du soir : le filtre n'utilise que des champs STABLES et vérifiés — `Code` (text), `Visible espace
// client` (checkbox), `Format` (select, option fixe 'Brand'). AUCUN select:{equals:X} sur une valeur
// dynamique (le piège qui a coûté la soirée). Une dérive de schéma se traduirait par un 400 Notion →
// capté → { ok:false } + log, jamais un périmètre faussement vide ni un plantage.

const DB_PROD = '01a8dc7d-1cc2-4209-9afe-a3bd90a87e20';
const WAIT_CAP_MS = 4000;          // plafond d'UNE attente (Retry-After inclus)
const DEFAULT_BUDGET_MS = 6000;    // budget de temps global par défaut (< timeout Netlify 10 s)
const CODE_BRAND_RE = /^B\d{2,}$/; // forme d'un code marque : B + au moins 2 chiffres

// HYGIÈNE, PAS UN CORRECTIF DE BUG : on JOINT tous les runs rich_text (comme espace-client/montage-client),
// au lieu de ne lire que le premier. Rien de cassé aujourd'hui ; mise en cohérence, d'autant que ce module
// décide de ce qu'un client a le droit de voir — une valeur scindée en runs ne doit pas y être tronquée.
const rt = (p) => ((p && p.rich_text) || []).map(t => t.plain_text || '').join('');
const ti = (p) => (p && p.title && p.title[0] && p.title[0].plain_text) || '';

// Tous les projets EXPOSÉS de la marque `codeBrand`. Voir le contrat de sortie en tête.
async function projetsDeMarque(codeBrand, token, deadline) {
  const code = String(codeBrand == null ? '' : codeBrand).trim();
  // 1) Garde-fou d'entrée : un code marque malformé/absent est un ÉCHEC distinguable, PAS un vide.
  //    On ne lance AUCUNE query (pas de starts_with sur une valeur douteuse).
  if (!CODE_BRAND_RE.test(code)) {
    console.error('perimetre client : code marque invalide (' + JSON.stringify(code) + ')');
    return { ok: false, raison: 'code-invalide' };
  }
  const dl = deadline || (Date.now() + DEFAULT_BUDGET_MS);
  // 2) Filtre Notion : préfixe de Code (validé) + exposé + Brand. Champs stables, pas de select dynamique.
  const filter = { and: [
    { property: 'Code', rich_text: { starts_with: code } },
    { property: 'Visible espace client', checkbox: { equals: true } },
    { property: 'Format', select: { equals: 'Brand' } }
  ] };
  // 3) Re-filtre de SORTIE incontournable (défense en profondeur) : le Code doit être EXACTEMENT le code
  //    marque suivi d'au moins une LETTRE (exclut une collision B33 vs B330 — le suffixe est des lettres,
  //    jamais un chiffre), ET on re-vérifie `Visible` côté serveur même si le filtre l'a déjà fait.
  const reCode = new RegExp('^' + code + '[A-Za-z]+$'); // `code` est ^B\d+$ → aucun métacaractère regex
  const projets = [];
  let cursor = null, pages = 0;
  do {
    const b = { filter, page_size: 100 };
    if (cursor) b.start_cursor = cursor;
    let r, tent = 0;
    for (;;) {
      r = await fetch('https://api.notion.com/v1/databases/' + DB_PROD + '/query', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify(b)
      });
      if (r.status !== 429 || tent >= 4) break;        // réessai sur 429 SEULEMENT
      const ra = parseFloat(r.headers && r.headers.get && r.headers.get('retry-after'));
      const attente = Math.min(WAIT_CAP_MS, ra > 0 ? ra * 1000 : 400 * Math.pow(2, tent));
      if (Date.now() + attente > dl) break;            // budget global épuisé → on cesse → échec distinguable
      await new Promise(res => setTimeout(res, attente));
      tent++;
    }
    if (!r.ok) {
      console.error('perimetre client query ' + r.status + ' : ' + await r.text().catch(() => '')); // corps Notion
      return { ok: false, raison: 'query' }; // ÉCHEC : aucune donnée, statut distinguable d'un vrai vide
    }
    const d = await r.json();
    for (const page of (d.results || [])) {
      const pr = page.properties || {};
      const c = rt(pr['Code']);
      const visible = !!(pr['Visible espace client'] && pr['Visible espace client'].checkbox);
      if (!visible || !reCode.test(c)) continue;       // garde de sortie
      projets.push({ code: c, titre: ti(pr['Titre']) });
    }
    cursor = d.has_more ? d.next_cursor : null;
    pages++;
  } while (cursor && pages < 20);
  return { ok: true, projets };
}

// Statuts AVANT le tournage. SOURCE UNIQUE partagée par l'affichage (espace-client : ne proposer « à
// valider » QUE des séquenciers pré-tournage) ET l'écriture (valider-sequencier-client : refuser la
// validation d'un film déjà en production). Un seul endroit, jamais deux copies à tenir synchrones.
const PRE_TOURNAGE = ['Brief / Idée', 'Séquencier en cours', 'Séquencier validé'];

module.exports = { projetsDeMarque, CODE_BRAND_RE, PRE_TOURNAGE };

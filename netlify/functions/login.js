// netlify/functions/login.js
// Vérifie le code d'accès côté serveur — les codes ne sont jamais exposés dans le HTML

exports.handler = async (event) => {
  // CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { id, code } = JSON.parse(event.body || '{}');
    if (!id || !code) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: 'Paramètres manquants' }) };
    }

    // Liste des membres — stockée côté serveur uniquement
    const EQUIPE = [
      { id: 'ben', nom: 'Benjamin', code: process.env.CODE_BEN || 'ben26', role: 'Chef' },
      { id: 'arn', nom: 'Arnaud',   code: process.env.CODE_ARN || 'arn26', role: 'Chef' },
      { id: 'chl', nom: 'Chloé',    code: process.env.CODE_CHL || 'chl26', role: 'Chef' },
      { id: 'jul', nom: 'Julien',   code: process.env.CODE_JUL || 'jul26', role: 'Journaliste' },
      { id: 'aug', nom: 'Augustin', code: process.env.CODE_AUG || 'aug26', role: 'Journaliste' },
      { id: 'nic', nom: 'Nico',     code: process.env.CODE_NIC || 'nic26', role: 'Journaliste' },
      { id: 'mic', nom: 'Mickael',  code: process.env.CODE_MIC || 'mic26', role: 'Journaliste' },
      { id: 'jlt', nom: 'Juliette', code: process.env.CODE_JLT || 'jlt26', role: 'Journaliste' },
      { id: 'mat', nom: 'Mathilde', code: process.env.CODE_MAT || 'mat26', role: 'Journaliste' },
      { id: 'lea', nom: 'Léa',      code: process.env.CODE_LEA || 'lea26', role: 'Journaliste' },
      { id: 'elo', nom: 'Éloise',   code: process.env.CODE_ELO || 'elo26', role: 'Journaliste' },
      { id: 'thi', nom: 'Thierry',  code: process.env.CODE_THI || 'thi26', role: 'Monteur' },
      { id: 'dav', nom: 'David',    code: process.env.CODE_DAV || 'dav26', role: 'Monteur' },
      { id: 'vic', nom: 'Victor',   code: process.env.CODE_VIC || 'vic26', role: 'Brand' },
      { id: 'lou', nom: 'Louise',   code: process.env.CODE_LOU || 'lou26', role: 'Brand' },
      { id: 'arc', nom: 'Arnaud C', code: process.env.CODE_ARC || 'arc26', role: 'Brand' },
    ];

    const membre = EQUIPE.find(m => m.id === id);

    if (!membre || membre.code !== code) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ ok: false, error: 'Code incorrect' })
      };
    }

    // Retourner les infos du membre sans le code
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        user: { id: membre.id, nom: membre.nom, role: membre.role }
      })
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: e.message })
    };
  }
};

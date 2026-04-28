const { google } = require('googleapis');

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if(event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Récupérer l'ID du fichier depuis les query params
    const fileId = event.queryStringParameters?.fileId;
    if(!fileId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'fileId manquant' }) };
    }

    // Authentification via Service Account
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly']
    });

    const drive = google.drive({ version: 'v3', auth });

    // Récupérer les infos du fichier (dont le dossier parent)
    const file = await drive.files.get({
      fileId,
      fields: 'id,name,parents',
      supportsAllDrives: true
    });

    const parents = file.data.parents;
    if(!parents || parents.length === 0) {
      return {
        statusCode: 200, headers,
        body: JSON.stringify({ folderId: null, folderUrl: null })
      };
    }

    const folderId = parents[0];
    const folderUrl = `https://drive.google.com/drive/folders/${folderId}`;

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ folderId, folderUrl })
    };

  } catch(e) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: e.message })
    };
  }
};

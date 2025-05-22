// ===== NEW FUNCTION 1: check-season-status.js =====
const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  const { seasonCode, userName } = event.queryStringParameters;
  
  if (!seasonCode || !userName) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing seasonCode or userName parameters' })
    };
  }
  
  try {
    const doc = new GoogleSpreadsheet('1p4w-0Mr7zff5bVesjFpn01GixiOt_CGTzuwDjmvv-mQ');
    
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    });
    
    await doc.loadInfo();
    
    const seasonsSheet = doc.sheetsByTitle['Seasons'];
    if (!seasonsSheet) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Seasons not found' })
      };
    }
    
    const rows = await seasonsSheet.getRows();
    const seasonRow = rows.find(row => row['Season Code'] === seasonCode);
    
    if (!seasonRow) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Season not found' })
      };
    }
    
    const participants = JSON.parse(seasonRow['Participants'] || '[]');
    const participant = participants.find(p => p.name === userName);
    
    const isAdmin = participant?.isAdmin || false;
    const isParticipant = !!participant;
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        isAdmin,
        isParticipant,
        participants: participants,
        seasonInfo: {
          name: seasonRow['Season Code'],
          createdAt: seasonRow['Created At'],
          participantCount: participants.length
        }
      })
    };
  } catch (error) {
    console.log('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to check season status',
        message: error.message
      })
    };
  }
};
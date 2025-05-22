
// ===== NEW FUNCTION 4: remove-participant.js =====
const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  try {
    const { seasonCode, participantName, adminName } = JSON.parse(event.body);
    
    if (!seasonCode || !participantName || !adminName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }
    
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
    
    // Verify admin access
    const participants = JSON.parse(seasonRow['Participants'] || '[]');
    const adminUser = participants.find(p => p.name === adminName && p.isAdmin);
    
    if (!adminUser) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }
    
    // Remove participant
    const updatedParticipants = participants.filter(p => p.name !== participantName);
    seasonRow['Participants'] = JSON.stringify(updatedParticipants);
    await seasonRow.save();
    
    // Remove participant's rounds from the main sheet
    const mainSheet = doc.sheetsByIndex[0];
    const roundRows = await mainSheet.getRows();
    
    // Find and delete all rounds for this participant in this season
    for (let i = roundRows.length - 1; i >= 0; i--) {
      const row = roundRows[i];
      if (row['Player'] === participantName && row['Season Code'] === seasonCode) {
        await row.delete();
      }
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.log('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to remove participant',
        message: error.message
      })
    };
  }
};
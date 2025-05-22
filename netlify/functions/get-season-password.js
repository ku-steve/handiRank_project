
// ===== NEW FUNCTION 3: get-season-password.js =====
const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  const { seasonCode, adminName } = event.queryStringParameters;
  
  if (!seasonCode || !adminName) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing required parameters' })
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
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ password: seasonRow['Password'] })
    };
  } catch (error) {
    console.log('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to get season password',
        message: error.message
      })
    };
  }
};
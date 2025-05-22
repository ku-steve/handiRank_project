
const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  try {
    const doc = new GoogleSpreadsheet('1p4w-0Mr7zff5bVesjFpn01GixiOt_CGTzuwDjmvv-mQ');
    
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    });
    
    await doc.loadInfo();
    
    // Try to get from Seasons sheet first
    const seasonsSheet = doc.sheetsByTitle['Seasons'];
    if (seasonsSheet) {
      const rows = await seasonsSheet.getRows();
      const seasons = rows.map(row => row['Season Code']).filter(code => code && code.trim() !== '');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(seasons)
      };
    } else {
      // Fallback to main sheet if Seasons sheet doesn't exist
      const mainSheet = doc.sheetsByIndex[0];
      const rows = await mainSheet.getRows();
      
      const seasons = [...new Set(
        rows.map(row => row['Season Code'])
            .filter(code => code && code.trim() !== '')
            .map(code => code.trim())
      )];
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(seasons)
      };
    }
  } catch (error) {
    console.log('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fetch seasons',
        message: error.message
      })
    };
  }
};
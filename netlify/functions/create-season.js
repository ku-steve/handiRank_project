// netlify/functions/create-season.js
const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  try {
    const { seasonCode, userName } = JSON.parse(event.body);
    
    if (!seasonCode) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Season code is required' })
      };
    }
    
    const doc = new GoogleSpreadsheet('1p4w-0Mr7zff5bVesjFpn01GixiOt_CGTzuwDjmvv-mQ');
    
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    });
    
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0]; // First sheet
    
    // Check if season exists
    const rows = await sheet.getRows();
    const existingSeasons = [...new Set(
      rows.map(row => row['Season Code'])
          .filter(code => code && code.trim() !== '')
          .map(code => code.trim().toLowerCase())
    )];
    
    if (existingSeasons.includes(seasonCode.toLowerCase())) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Season already exists' })
      };
    }
    
    // Add a "season creation" record
    await sheet.addRow({
      Date: new Date().toLocaleString(),
      Player: userName || 'System',
      'Season Code': seasonCode
    });
    
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
        error: 'Failed to create season',
        message: error.message
      })
    };
  }
};
// netlify/functions/add-round.js
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
    const roundData = JSON.parse(event.body);
    
    // Basic validation
    if (!roundData.userName || !roundData.gross || !roundData.rating || !roundData.slope || !roundData.seasonCode) {
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
    const sheet = doc.sheetsByIndex[0]; // First sheet
    
    // Add the new row
    await sheet.addRow({
      Date: roundData.timestamp || new Date().toLocaleString(),
      Player: roundData.userName,
      Gross: roundData.gross,
      Rating: roundData.rating,
      Slope: roundData.slope,
      Holes: roundData.holes || 18,
      'Adjusted Gross': roundData.adjustedGross,
      Differential: roundData.differential,
      'Season Code': roundData.seasonCode,
      'Profile Image': roundData.userPhoto || ''
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
        error: 'Failed to add round',
        message: error.message
      })
    };
  }
};
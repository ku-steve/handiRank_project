// netlify/functions/get-season-data.js
const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  // Get season code from query parameters
  const seasonCode = event.queryStringParameters.seasonCode;
  if (!seasonCode) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Season code is required' })
    };
  }
  
  try {
    const doc = new GoogleSpreadsheet('1p4w-0Mr7zff5bVesjFpn01GixiOt_CGTzuwDjmvv-mQ');
    
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    });
    
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0]; // First sheet
    
    const rows = await sheet.getRows();
    
    // Filter rows by season code
    const filteredRows = rows.filter(row => row['Season Code'] === seasonCode);
    
    // Map the spreadsheet data to the format your application expects
    const formattedRows = filteredRows.map(row => {
      return [
        row.Date || '',               // timestamp
        row.Player || '',             // name
        row.Gross || '',              // gross
        row.Rating || '',             // rating
        row.Slope || '',              // slope
        row.Holes || '',              // holes
        row['Adjusted Gross'] || '',  // adjustedGross
        row.Differential || '',       // diff
        row['Season Code'] || '',     // code
        row['Profile Image'] || ''    // photo
      ];
    });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(formattedRows)
    };
  } catch (error) {
    console.log('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fetch season data',
        message: error.message
      })
    };
  }
};
// netlify/functions/get-leaderboard.js
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
    const sheet = doc.sheetsByIndex[0]; // First sheet
    
    const rows = await sheet.getRows();
    
    // Map the spreadsheet data to the format your application expects
    // Ensure we include the photo/profile URL in the response
// Replace or modify this part of your get-leaderboard.js file:

// Replace the mapping section in your get-leaderboard.js with this:

    // Print out the column headers from the original data
    console.log("Sheet column headers:", Object.keys(rows[0]));

    // Map the spreadsheet data to the format your application expects
    const formattedRows = rows.map(row => {
      // Check all possible sources for the photo URL
      const photoUrl = row.Profile || row.Photo || row['profile photo'] || row['Profile Photo'] || row.Avatar || row.userPhoto || '';
      
      // For debugging, log every row's player name and photo URL
      console.log(`Player: ${row.Player}, Photo URL: ${photoUrl}`);
      
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
        row['Profile Image'] || ''    // Use the exact column name from your spreadsheet
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
        error: 'Failed to fetch leaderboard data',
        message: error.message
      })
    };
  }
};
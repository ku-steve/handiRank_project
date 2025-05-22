// ===== 2. UPDATE add-round.js =====
// Replace your existing add-round.js with this enhanced version

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
    
    // If this is an admin entry, verify admin status
    if (roundData.isAdminEntry && roundData.addedBy) {
      const seasonsSheet = doc.sheetsByTitle['Seasons'];
      if (seasonsSheet) {
        const seasonRows = await seasonsSheet.getRows();
        const seasonRow = seasonRows.find(row => row['Season Code'] === roundData.seasonCode);
        
        if (seasonRow) {
          const participants = JSON.parse(seasonRow['Participants'] || '[]');
          const adminUser = participants.find(p => p.name === roundData.addedBy && p.isAdmin);
          
          if (!adminUser) {
            return {
              statusCode: 403,
              headers,
              body: JSON.stringify({ error: 'Unauthorized: Admin access required' })
            };
          }
          
          // Verify the target player is a participant
          const targetPlayer = participants.find(p => p.name === roundData.userName);
          if (!targetPlayer) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ error: 'Player not found in season participants' })
            };
          }
        }
      }
    }
    
    const sheet = doc.sheetsByIndex[0]; // Main rounds sheet
    
    // Add the new row with additional tracking fields
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
      'Profile Image': roundData.userPhoto || '',
      'Added By': roundData.addedBy || roundData.userName,
      'Is Admin Entry': roundData.isAdminEntry || false,
      'Added At': new Date().toISOString()
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
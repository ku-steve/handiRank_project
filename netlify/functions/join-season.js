
// ===== NEW FUNCTION 2: join-season.js =====
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
    const { seasonCode, password, userName, userEmail, userPhoto } = JSON.parse(event.body);
    
    if (!seasonCode || !password || !userName) {
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
    
    // Verify password
    if (seasonRow['Password'] !== password) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid password' })
      };
    }
    
    // Check if user is already a participant
    const participants = JSON.parse(seasonRow['Participants'] || '[]');
    const existingParticipant = participants.find(p => p.name === userName);
    
    if (existingParticipant) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'Already a participant' })
      };
    }
    
    // Add user as participant
    const newParticipant = {
      name: userName,
      email: userEmail || '',
      photo: userPhoto || '',
      isAdmin: false,
      joinedAt: new Date().toISOString()
    };
    
    participants.push(newParticipant);
    seasonRow['Participants'] = JSON.stringify(participants);
    await seasonRow.save();
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: 'Joined season successfully' })
    };
  } catch (error) {
    console.log('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to join season',
        message: error.message
      })
    };
  }
};
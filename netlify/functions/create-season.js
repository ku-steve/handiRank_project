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
    const { seasonCode, password, adminName, adminEmail, adminPhoto } = JSON.parse(event.body);
    
    if (!seasonCode || !password || !adminName) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Season code, password, and admin name are required' })
      };
    }
    
    const doc = new GoogleSpreadsheet('1p4w-0Mr7zff5bVesjFpn01GixiOt_CGTzuwDjmvv-mQ');
    
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    });
    
    await doc.loadInfo();
    
    // Check if we have a "Seasons" sheet, if not create it
    let seasonsSheet = doc.sheetsByTitle['Seasons'];
    if (!seasonsSheet) {
      seasonsSheet = await doc.addSheet({
        title: 'Seasons',
        headerValues: [
          'Season Code', 'Password', 'Admin Name', 'Admin Email', 'Admin Photo',
          'Participants', 'Created At', 'Settings'
        ]
      });
    }
    
    // Check if season already exists
    const rows = await seasonsSheet.getRows();
    const existingSeasons = rows.map(row => row['Season Code']?.toLowerCase()).filter(Boolean);
    
    if (existingSeasons.includes(seasonCode.toLowerCase())) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'Season already exists' })
      };
    }
    
    // Create the season record
    const participants = [{
      name: adminName,
      email: adminEmail || '',
      photo: adminPhoto || '',
      isAdmin: true,
      joinedAt: new Date().toISOString()
    }];
    
    const settings = {
      requireApproval: false,
      maxParticipants: 50
    };
    
    await seasonsSheet.addRow({
      'Season Code': seasonCode,
      'Password': password, // In production, hash this
      'Admin Name': adminName,
      'Admin Email': adminEmail || '',
      'Admin Photo': adminPhoto || '',
      'Participants': JSON.stringify(participants),
      'Created At': new Date().toISOString(),
      'Settings': JSON.stringify(settings)
    });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, seasonCode })
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
// ===== UPDATED add-round.js with Auto Admin Transfer =====
const { GoogleSpreadsheet } = require('google-spreadsheet');

// Helper function to calculate handicap
function calculateHandicap(diffs) {
  if (!diffs || diffs.length === 0) return 999; // High number for no rounds
  
  const sortedDiffs = [...diffs].sort((a, b) => a - b);
  
  let scoresToUse = 0;
  if (sortedDiffs.length >= 20) {
    scoresToUse = 8;
  } else if (sortedDiffs.length >= 15) {
    scoresToUse = 6;
  } else if (sortedDiffs.length >= 10) {
    scoresToUse = 4;
  } else if (sortedDiffs.length >= 5) {
    scoresToUse = 3;
  } else {
    scoresToUse = sortedDiffs.length;
  }
  
  const bestScores = sortedDiffs.slice(0, scoresToUse);
  return bestScores.reduce((sum, score) => sum + score, 0) / bestScores.length;
}

// Function to update admin based on leaderboard
async function updateAdminBasedOnLeaderboard(doc, seasonCode) {
  try {
    const mainSheet = doc.sheetsByIndex[0];
    const seasonsSheet = doc.sheetsByTitle['Seasons'];
    
    if (!seasonsSheet) return false;
    
    // Get all rounds for this season
    const roundRows = await mainSheet.getRows();
    const seasonRounds = roundRows.filter(row => row['Season Code'] === seasonCode);
    
    if (seasonRounds.length === 0) return false;
    
    // Calculate leaderboard
    const playerStats = {};
    
    seasonRounds.forEach(row => {
      const playerName = row.Player;
      const differential = parseFloat(row.Differential);
      
      if (isNaN(differential)) return;
      
      if (!playerStats[playerName]) {
        playerStats[playerName] = {
          diffs: [],
          photo: row['Profile Image'] || ''
        };
      }
      
      playerStats[playerName].diffs.push(differential);
    });
    
    // Sort players by handicap to find the leader
    const sortedPlayers = Object.entries(playerStats).sort((a, b) => {
      const hcpA = calculateHandicap(a[1].diffs);
      const hcpB = calculateHandicap(b[1].diffs);
      return hcpA - hcpB;
    });
    
    if (sortedPlayers.length === 0) return false;
    
    const newLeader = sortedPlayers[0][0]; // First player name
    
    // Get season row and update admin
    const seasonRows = await seasonsSheet.getRows();
    const seasonRow = seasonRows.find(row => row['Season Code'] === seasonCode);
    
    if (!seasonRow) return false;
    
    const participants = JSON.parse(seasonRow['Participants'] || '[]');
    
    // Check if leader is already admin
    const currentAdmin = participants.find(p => p.isAdmin);
    if (currentAdmin && currentAdmin.name === newLeader) {
      return false; // No change needed
    }
    
    // Find the new leader in participants
    const newAdminParticipant = participants.find(p => p.name === newLeader);
    if (!newAdminParticipant) return false; // Leader must be a participant
    
    // Update admin status
    participants.forEach(p => {
      p.isAdmin = (p.name === newLeader);
    });
    
    // Update admin fields in season row
    seasonRow['Admin Name'] = newLeader;
    seasonRow['Admin Email'] = newAdminParticipant.email || '';
    seasonRow['Admin Photo'] = newAdminParticipant.photo || '';
    seasonRow['Participants'] = JSON.stringify(participants);
    seasonRow['Last Admin Update'] = new Date().toISOString();
    
    await seasonRow.save();
    
    console.log(`Admin updated to: ${newLeader} for season: ${seasonCode}`);
    return true;
    
  } catch (error) {
    console.error('Error updating admin:', error);
    return false;
  }
}

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
    
    // Add the new round
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
    
    // *** NEW: Update admin based on current leaderboard ***
    const adminUpdated = await updateAdminBasedOnLeaderboard(doc, roundData.seasonCode);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        success: true,
        adminUpdated: adminUpdated
      })
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
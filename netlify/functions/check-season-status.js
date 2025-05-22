// ===== UPDATED check-season-status.js with Dynamic Admin Check =====
const { GoogleSpreadsheet } = require('google-spreadsheet');

// Helper function to calculate handicap (same as add-round.js)
function calculateHandicap(diffs) {
  if (!diffs || diffs.length === 0) return 999;
  
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

// Function to verify and update admin if needed
async function verifyAndUpdateAdmin(doc, seasonCode) {
  try {
    const mainSheet = doc.sheetsByIndex[0];
    const seasonsSheet = doc.sheetsByTitle['Seasons'];
    
    if (!seasonsSheet) return null;
    
    // Get season data
    const seasonRows = await seasonsSheet.getRows();
    const seasonRow = seasonRows.find(row => row['Season Code'] === seasonCode);
    
    if (!seasonRow) return null;
    
    // Get all rounds for this season
    const roundRows = await mainSheet.getRows();
    const seasonRounds = roundRows.filter(row => row['Season Code'] === seasonCode);
    
    if (seasonRounds.length === 0) {
      return JSON.parse(seasonRow['Participants'] || '[]');
    }
    
    // Calculate current leaderboard
    const playerStats = {};
    
    seasonRounds.forEach(row => {
      const playerName = row.Player;
      const differential = parseFloat(row.Differential);
      
      if (isNaN(differential)) return;
      
      if (!playerStats[playerName]) {
        playerStats[playerName] = { diffs: [] };
      }
      
      playerStats[playerName].diffs.push(differential);
    });
    
    // Find current leader
    const sortedPlayers = Object.entries(playerStats).sort((a, b) => {
      const hcpA = calculateHandicap(a[1].diffs);
      const hcpB = calculateHandicap(b[1].diffs);
      return hcpA - hcpB;
    });
    
    if (sortedPlayers.length === 0) {
      return JSON.parse(seasonRow['Participants'] || '[]');
    }
    
    const currentLeader = sortedPlayers[0][0];
    const participants = JSON.parse(seasonRow['Participants'] || '[]');
    
    // Check if leader is already admin
    const currentAdmin = participants.find(p => p.isAdmin);
    const leaderParticipant = participants.find(p => p.name === currentLeader);
    
    if (!leaderParticipant) {
      // Leader is not a participant, no change
      return participants;
    }
    
    if (currentAdmin && currentAdmin.name === currentLeader) {
      // Leader is already admin, no change needed
      return participants;
    }
    
    // Update admin status
    participants.forEach(p => {
      p.isAdmin = (p.name === currentLeader);
    });
    
    // Update season row
    seasonRow['Admin Name'] = currentLeader;
    seasonRow['Admin Email'] = leaderParticipant.email || '';
    seasonRow['Admin Photo'] = leaderParticipant.photo || '';
    seasonRow['Participants'] = JSON.stringify(participants);
    seasonRow['Last Admin Update'] = new Date().toISOString();
    
    await seasonRow.save();
    
    console.log(`Admin auto-updated to: ${currentLeader} for season: ${seasonCode}`);
    return participants;
    
  } catch (error) {
    console.error('Error verifying admin:', error);
    return null;
  }
}

exports.handler = async function(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  const { seasonCode, userName } = event.queryStringParameters;
  
  if (!seasonCode || !userName) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing seasonCode or userName parameters' })
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
    
    // Verify and update admin based on current leaderboard
    const updatedParticipants = await verifyAndUpdateAdmin(doc, seasonCode);
    
    if (!updatedParticipants) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Season not found' })
      };
    }
    
    const participant = updatedParticipants.find(p => p.name === userName);
    
    const isAdmin = participant?.isAdmin || false;
    const isParticipant = !!participant;
    
    // Get updated season row for current admin info
    const seasonRows = await seasonsSheet.getRows();
    const seasonRow = seasonRows.find(row => row['Season Code'] === seasonCode);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        isAdmin,
        isParticipant,
        participants: updatedParticipants,
        currentAdmin: updatedParticipants.find(p => p.isAdmin)?.name || 'Unknown',
        seasonInfo: {
          name: seasonRow['Season Code'],
          createdAt: seasonRow['Created At'],
          participantCount: updatedParticipants.length,
          lastAdminUpdate: seasonRow['Last Admin Update'] || null
        }
      })
    };
  } catch (error) {
    console.log('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to check season status',
        message: error.message
      })
    };
  }
};
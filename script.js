document.addEventListener("DOMContentLoaded", function () {
  const CLIENT_ID = '253158971830-4g4aujib258a1aop14h8uitgu5lhnc7q.apps.googleusercontent.com';
  const SPREADSHEET_ID = '1p4w-0Mr7zff5bVesjFpn01GixiOt_CGTzuwDjmvv-mQ';
  const SCOPES = 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';

  // Global variables
  let accessToken = '';
  let userName = '';
  let userPhoto = '';
  let seasonCode = '';
  let isWorldView = true; // Track if we're in world view
  let isLoggedIn = false;
  let playersData = {}; // Track player data globally for stats
  let modalCreated = false; // Track if the modal has been created
  let userEmail = '';
  let isSeasonAdmin = false;
  let isSeasonParticipant = false;
  let seasonParticipants = [];
  let previousAdmin = null;


  // DOM Elements
  const signinBtn = document.getElementById('signinBtn');
  const signinDiv = document.getElementById('signinDiv');
  const roundForm = document.getElementById('roundForm');
  const leaderboard = document.querySelector('#leaderboard tbody');
  const leaderboardTitle = document.getElementById('leaderboardTitle');
  const currentSeasonDiv = document.getElementById('currentSeason');

  const seasonModal = document.getElementById('seasonModal');

  // Debug function
  function inspectDataStructure() {
    leaderboard.innerHTML = '<tr><td colspan="5">Inspecting data structure...</td></tr>';
    
    fetch('/.netlify/functions/get-leaderboard')
      .then(response => response.json())
      .then(rows => {
        console.log("Full data from server:", rows);
        
        if (rows.length > 0) {
          console.log("First row data:", rows[0]);
          console.log("Number of columns in first row:", rows[0].length);
          
          if (rows[0].length >= 10) {
            console.log("Column 9 (potential photo URL):", rows[0][9]);
          }
          
          let dataStructure = '<tr><td colspan="5"><strong>Data Structure Inspection:</strong><br>';
          dataStructure += '<pre>' + JSON.stringify(rows[0], null, 2) + '</pre>';
          dataStructure += '<button onclick="window.location.reload()">Reload Normal View</button>';
          dataStructure += '</td></tr>';
          
          leaderboard.innerHTML = dataStructure;
        } else {
          leaderboard.innerHTML = '<tr><td colspan="5">No data available to inspect</td></tr>';
        }
      })
      .catch(error => {
        console.error("Error inspecting data:", error);
        leaderboard.innerHTML = '<tr><td colspan="5">Error inspecting data: ' + error.message + '</td></tr>';
      });
  }

  /**
   * Calculate handicap based on USGA rules
   */
  function calculateHandicap(diffs) {
    if (!diffs || diffs.length === 0) return 0;
    
    // Sort differentials from lowest to highest
    const sortedDiffs = [...diffs].sort((a, b) => a - b);
    
    // Determine how many scores to use
    let scoresToUse = 0;
    if (sortedDiffs.length >= 20) {
      scoresToUse = 8; // Use best 8 of 20
    } else if (sortedDiffs.length >= 15) {
      scoresToUse = 6; // Use best 6 of 15-19
    } else if (sortedDiffs.length >= 10) {
      scoresToUse = 4; // Use best 4 of 10-14
    } else if (sortedDiffs.length >= 5) {
      scoresToUse = 3; // Use best 3 of 5-9
    } else {
      scoresToUse = sortedDiffs.length; // Use all available if fewer than 5
    }
    
    // Take the best scores
    const bestScores = sortedDiffs.slice(0, scoresToUse);
    
    // Calculate the average
    return bestScores.reduce((sum, score) => sum + score, 0) / bestScores.length;
  }

  /**
   * Helper function to determine how many scores to use based on total rounds
   */
  function getScoresToUse(totalRounds) {
    if (totalRounds >= 20) return 8;
    if (totalRounds >= 15) return 6;
    if (totalRounds >= 10) return 4;
    if (totalRounds >= 5) return 3;
    return totalRounds;
  }

  /**
   * Load world leaderboard
   */
  async function loadWorldLeaderboardPublic() {
    leaderboard.innerHTML = '<tr><td colspan="5">Loading data...</td></tr>';
    
    try {
      const response = await fetch('/.netlify/functions/get-leaderboard');
      
      if (!response.ok) {
        throw new Error(`Failed to load data: ${response.status}`);
      }
      
      const rows = await response.json();
      console.log("Raw data from server:", rows);
      
      if (rows.length === 0) {
        leaderboard.innerHTML = '<tr><td colspan="5">No data available.</td></tr>';
        return;
      }
      
      // Create a player map
      const playerMap = {};
      
      // Process all scores
      rows.forEach(row => {
        // Ensure we have the minimum data needed
        if (row.length < 8) return;
        
        const name = row[1];           // Player name
        const gross = parseInt(row[2]); // Gross score
        const rating = parseFloat(row[3]); // Course rating
        const slope = parseFloat(row[4]);  // Slope
        const diffStr = row[7];        // Differential
        const diff = parseFloat(diffStr);
        const timestamp = row[0];      // Timestamp
        const photoUrl = row[9] || ''; // Photo URL - 10th column
        
        // Skip invalid differentials
        if (isNaN(diff)) return;
        
        // Initialize player if needed
        if (!playerMap[name]) {
          playerMap[name] = {
            diffs: [],
            photo: photoUrl,
            recentScore: null,
            recentTimestamp: null,
            rounds: []
          };
        } else if (photoUrl && !playerMap[name].photo) {
          // Update photo if we find a better one
          playerMap[name].photo = photoUrl;
        }
        
        // Add differential and round data
        playerMap[name].diffs.push(diff);
        playerMap[name].rounds.push({
          timestamp,
          gross,
          rating,
          slope,
          differential: diff
        });
        
        // Update recent score if this is newer
        if (!playerMap[name].recentTimestamp || 
            new Date(timestamp) > new Date(playerMap[name].recentTimestamp)) {
          playerMap[name].recentScore = gross;
          playerMap[name].recentTimestamp = timestamp;
        }
      });
      
      // Check if we have any valid players
      if (Object.keys(playerMap).length === 0) {
        leaderboard.innerHTML = '<tr><td colspan="5">No valid data available.</td></tr>';
        return;
      }
      
      // Update global player data
      playersData = playerMap;
      
      // Sort players by handicap
      const sortedPlayers = Object.entries(playerMap).sort((a, b) => {
        const hcpA = calculateHandicap(a[1].diffs);
        const hcpB = calculateHandicap(b[1].diffs);
        return hcpA - hcpB;
      });
      
    // Clear and rebuild the leaderboard
    leaderboard.innerHTML = '';

    sortedPlayers.forEach(([name, data], index) => {
      const avg = calculateHandicap(data.diffs);
      const handicap = +(avg * 0.96).toFixed(1);
      const rank = index + 1;
      const isFirstPlace = index === 0;
      
      // Create rank badge with appropriate styling
      const rankBadge = `<div class="rank-badge rank-${rank <= 3 ? rank : 'other'}">${rank}</div>`;
      
      // Create image tag
      let imgHtml = '';
      if (data.photo && data.photo.trim() !== '') {
        const avatarClass = isFirstPlace ? 'avatar first-place-avatar' : 'avatar';
        imgHtml = `<img src="${data.photo}" class="${avatarClass}" alt="avatar" onerror="console.log('Image failed to load: ${data.photo}')" />`;
      }
      
      // Add trophy icon for top 3
      let trophyIcon = '';
      if (rank === 1) {
        trophyIcon = '<span class="trophy-icon">🥇</span>';
      } else if (rank === 2) {
        trophyIcon = '<span class="trophy-icon">🥈</span>';
      } else if (rank === 3) {
        trophyIcon = '<span class="trophy-icon">🥉</span>';
      }
      
      // Create handicap badge
      const handicapBadge = `<span class="handicap-badge">${handicap}</span>`;
      
      // Add row to table
      leaderboard.innerHTML += `
        <tr class="${isFirstPlace ? 'first-place-row' : ''}">
          <td class="rank-cell">${rankBadge}</td>
          <td style="display:flex; align-items:center; gap:10px;">
            ${trophyIcon}
            ${imgHtml}
            <span class="player-name" style="cursor:pointer; text-decoration:underline; color:#0066cc;">
              ${name}
            </span>
          </td>
          <td>${data.diffs.length}</td>
          <td>${handicapBadge}</td>
          <td>${data.recentScore !== null ? data.recentScore : '-'}</td>
        </tr>`;
    });
      
      
      // Make player names clickable
      makePlayerNamesClickable();
      
      // Make the table responsive
      makeTableResponsive();
      console.log('Check button conditions:', { isLoggedIn, seasonCode });

      
    } catch (err) {
      console.error('Error loading public world leaderboard:', err);
      leaderboard.innerHTML = '<tr><td colspan="5">Error loading data: ' + err.message + '</td></tr>';
    }
  }

  
  /**
   * Load season-specific leaderboard
   */
  async function loadLeaderboard() {
    leaderboard.innerHTML = '<tr><td colspan="5">Loading data...</td></tr>'; // Show loading indicator
    
    try {
      console.log(`Loading leaderboard for season: ${seasonCode}`);
      const response = await fetch(`/.netlify/functions/get-season-data?seasonCode=${encodeURIComponent(seasonCode)}`);
      
      if (!response.ok) {
        throw new Error(`Failed to load data: ${response.status}`);
      }
      
      const rows = await response.json();
      
      if (rows.length === 0) {
        leaderboard.innerHTML = '<tr><td colspan="5">No data available for this season. Submit your first round to get started!</td></tr>';
        return;
      }
      
      const players = {};
      playersData = {}; // Reset global player data
      
      // Process all rows to gather data for each player
      for (const row of rows) {
        // Skip rows that don't have enough data
        if (row.length < 8) continue;
        
        const [timestamp, name, gross, rating, slope, holes, adjustedGross, diff, code, photo] = row;
        
        const differential = parseFloat(diff);
        if (isNaN(differential)) continue;
        
        const grossScore = parseInt(gross);
        
        if (!players[name]) {
          players[name] = { 
            diffs: [], 
            photo, 
            recentScore: null,
            recentTimestamp: null,
            rounds: []
          };
        }
        
        // Add round data
        players[name].rounds.push({
          timestamp,
          gross: grossScore,
          rating,
          slope,
          holes,
          differential,
          season: code
        });
        
        players[name].diffs.push(differential);
        
        // Check if this is the most recent score for this player
        if (!players[name].recentTimestamp || new Date(timestamp) > new Date(players[name].recentTimestamp)) {
          players[name].recentScore = grossScore;
          players[name].recentTimestamp = timestamp;
        }
      }
  
      // Check if we have any valid player data after processing
      if (Object.keys(players).length === 0) {
        leaderboard.innerHTML = '<tr><td colspan="5">No valid data available for this season. Submit your first round to get started!</td></tr>';
        return;
      }
  
      // Update global player data
      playersData = players;
  
      // Sort players by handicap
      const sorted = Object.entries(players).sort((a, b) => {
        const avgA = calculateHandicap(a[1].diffs);
        const avgB = calculateHandicap(b[1].diffs);
        return avgA - avgB;
      });
      
      // Clear the leaderboard before adding new rows
        // Clear the leaderboard before adding new rows
    leaderboard.innerHTML = '';

    sorted.forEach(([name, data], index) => {
      const avg = calculateHandicap(data.diffs);
      const handicap = +(avg * 0.96).toFixed(1);
      const rank = index + 1;
      const isFirstPlace = index === 0;
      
      // Create rank badge with appropriate styling
      const rankBadge = `<div class="rank-badge rank-${rank <= 3 ? rank : 'other'}">${rank}</div>`;
      
      // Create a different image tag for first place
      let imgHtml = '';
      if (data.photo) {
        const avatarClass = isFirstPlace ? 'avatar first-place-avatar' : 'avatar';
        imgHtml = `<img src="${data.photo}" class="${avatarClass}" alt="avatar" />`;
      }
      
      // Add trophy icon for top 3
      let trophyIcon = '';
      if (rank === 1) {
        trophyIcon = '<span class="trophy-icon">🥇</span>';
      } else if (rank === 2) {
        trophyIcon = '<span class="trophy-icon">🥈</span>';
      } else if (rank === 3) {
        trophyIcon = '<span class="trophy-icon">🥉</span>';
      }
      
      const recentScore = data.recentScore !== null ? data.recentScore : '-';
      
      // Create a handicap badge
      const handicapBadge = `<span class="handicap-badge">${handicap}</span>`;
      
      // Add the row to the table with clickable name
      const rowClass = isFirstPlace ? 'first-place-row' : '';
      
      leaderboard.innerHTML += `
        <tr class="${rowClass}">
          <td class="rank-cell">${rankBadge}</td>
          <td style="display:flex; align-items:center; gap:10px;">
            ${trophyIcon}
            ${imgHtml}
            <span class="player-name" style="cursor:pointer; text-decoration:underline; color:#0066cc;">${name}</span>
          </td>
          <td>${data.diffs.length}</td>
          <td>${handicapBadge}</td>
          <td>${recentScore}</td>
        </tr>`;
    });
      
      // Make player names clickable after loading data
      makePlayerNamesClickable();
      makeTableResponsive();
      
    } catch (err) {
      console.error('Error loading leaderboard:', err);
      leaderboard.innerHTML = '<tr><td colspan="5">Error loading data: ' + err.message + '</td></tr>';
    }
  }

  /**
   * Make player names clickable to show stats
   */
  function makePlayerNamesClickable() {
    const playerNameSpans = document.querySelectorAll('.player-name');
    
    playerNameSpans.forEach(span => {
      // Remove any existing click handlers to avoid duplicates
      const newSpan = span.cloneNode(true);
      span.parentNode.replaceChild(newSpan, span);
      
      // Add click handler to the new span
      newSpan.addEventListener('click', (e) => {
        const playerName = e.target.textContent;
        showPlayerStats(playerName);
      });
    });
  }

  /**
   * Display player stats in a modal
   */
  function showPlayerStats(playerName) {
    // Get player data
    const playerData = playersData[playerName];
    if (!playerData) {
      showNotification('Player data not available', 'error');
      return;
    }
    
    // Create player stats modal if it doesn't exist
    let statsModal = document.getElementById('playerStatsModal');
    if (!statsModal) {
      statsModal = document.createElement('div');
      statsModal.id = 'playerStatsModal';
      statsModal.className = 'modal';
      
      const modalContent = document.createElement('div');
      modalContent.className = 'modal-content stats-modal';
      
      // Add close button
      const closeButton = document.createElement('button');
      closeButton.className = 'close-button';
      closeButton.innerHTML = '&times;';
      closeButton.addEventListener('click', () => {
        statsModal.style.display = 'none';
      });
      
      modalContent.appendChild(closeButton);
      statsModal.appendChild(modalContent);
      document.body.appendChild(statsModal);
    }
    
    // Get the modal content element
    const modalContent = statsModal.querySelector('.modal-content');
    
    // Clear previous content
    modalContent.innerHTML = '';
    
    // Add close button
    const closeButton = document.createElement('button');
    closeButton.className = 'close-button';
    closeButton.innerHTML = '&times;';
    closeButton.addEventListener('click', () => {
      statsModal.style.display = 'none';
    });
    modalContent.appendChild(closeButton);
    
    // Calculate handicap
    const avg = calculateHandicap(playerData.diffs);
    const handicap = +(avg * 0.96).toFixed(1);
    
    // Add large handicap display
    const handicapDisplay = document.createElement('div');
    handicapDisplay.className = 'large-handicap';
    handicapDisplay.innerText = handicap;
    modalContent.appendChild(handicapDisplay);
    
    // Add player name and handicap header
    const header = document.createElement('div');
    header.className = 'player-stats-header';
    
    // Include player avatar if available
    let avatarHtml = '';
    if (playerData.photo) {
      avatarHtml = `<img src="${playerData.photo}" class="stats-avatar" alt="${playerName}" />`;
    }
    
    header.innerHTML = `
      <div class="player-info">
        ${avatarHtml}
        <div>
          <h3>${playerName}</h3>
          <div>Handicap Index: <span class="handicap-badge">${handicap}</span></div>
          <div>Average Differential: ${avg.toFixed(2)}</div>
        </div>
      </div>
    `;
    modalContent.appendChild(header);
    
    // Add tabs for different stats views
    const tabContainer = document.createElement('div');
    tabContainer.className = 'tab-container stats-tabs';
    tabContainer.innerHTML = `
      <button class="tab-button active" data-tab="progress">Progress</button>
      <button class="tab-button" data-tab="rounds">Recent Rounds</button>
    `;
    modalContent.appendChild(tabContainer);
    
    // Create tab content containers
    const progressTab = document.createElement('div');
    progressTab.id = 'progress-tab';
    progressTab.className = 'tab-content active';
    
    const roundsTab = document.createElement('div');
    roundsTab.id = 'rounds-tab';
    roundsTab.className = 'tab-content';
    
    modalContent.appendChild(progressTab);
    modalContent.appendChild(roundsTab);
    
    // Add chart to progress tab
    createHandicapChart(progressTab, playerName, playerData);
    
    // Add recent rounds to rounds tab
    createRecentRoundsTable(roundsTab, playerData);
    
    // Setup tab switching
    const tabButtons = tabContainer.querySelectorAll('.tab-button');
    const tabContents = modalContent.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        // Deactivate all tabs
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        // Activate the clicked tab
        button.classList.add('active');
        const tabId = button.getAttribute('data-tab');
        document.getElementById(`${tabId}-tab`).classList.add('active');
      });
    });
    
    // Show the modal
    statsModal.style.display = 'flex';
  }

  /**
   * Create handicap trend chart for player stats
   */
  function createHandicapChart(container, playerName, playerData) {
    // Check if we have enough data
    if (!playerData.rounds || playerData.rounds.length < 2) {
      container.innerHTML = '<div class="no-data">Not enough rounds to show progress chart</div>';
      return;
    }
    
    // Create chart container
    const chartContainer = document.createElement('div');
    chartContainer.className = 'chart-container';
    chartContainer.style.height = '250px';
    container.appendChild(chartContainer);
    
    // Sort rounds by date
    const sortedRounds = [...playerData.rounds].sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );
    
    // Calculate running handicap
    const chartData = [];
    let runningDiffs = [];
    
    sortedRounds.forEach(round => {
      runningDiffs.push(parseFloat(round.differential));
      
      // Only keep most recent 20 rounds
      if (runningDiffs.length > 20) {
        runningDiffs.shift();
      }
      
      const hcpAvg = calculateHandicap(runningDiffs);
      const handicap = +(hcpAvg * 0.96).toFixed(1);
      
      chartData.push({
        date: new Date(round.timestamp).toLocaleDateString(),
        handicap: handicap,
        differential: parseFloat(round.differential)
      });
    });
    
    // Create chart using HTML and CSS
    let chartHtml = `<div class="chart-title">Handicap Trend</div><div class="chart">`;
    
    // Find min and max values for scaling
    const handicaps = chartData.map(d => d.handicap);
    const differentials = chartData.map(d => d.differential);
    const allValues = [...handicaps, ...differentials];
    const minValue = Math.floor(Math.min(...allValues));
    const maxValue = Math.ceil(Math.max(...allValues));
    const range = maxValue - minValue;
    
    // Create grid lines
    chartHtml += `<div class="chart-grid">`;
    for (let i = 0; i <= 4; i++) {
      const value = maxValue - (i * (range / 4));
      const position = i * 25;
      chartHtml += `<div class="grid-line" style="top: ${position}%">${value.toFixed(1)}</div>`;
    }
    chartHtml += `</div>`;
    
    // Create handicap line
    chartHtml += `<div class="chart-line handicap-line">`;
    chartData.forEach((point, index) => {
      const x = (index / (chartData.length - 1)) * 100;
      const y = 100 - (((point.handicap - minValue) / range) * 100);
      
      // Add point
      chartHtml += `<div class="chart-point" style="left: ${x}%; top: ${y}%" title="Handicap: ${point.handicap} (${point.date})"></div>`;
      
      // Add line segment (except for first point)
      if (index > 0) {
        const prevPoint = chartData[index - 1];
        const prevX = ((index - 1) / (chartData.length - 1)) * 100;
        const prevY = 100 - (((prevPoint.handicap - minValue) / range) * 100);
        
        // Calculate line position and angle
        const length = Math.sqrt(Math.pow(x - prevX, 2) + Math.pow(y - prevY, 2));
        const angle = Math.atan2(y - prevY, x - prevX) * (180 / Math.PI);
        const left = prevX;
        const top = prevY;
        
        chartHtml += `<div class="line-segment" style="width: ${length}%; left: ${left}%; top: ${top}%; transform: rotate(${angle}deg); transform-origin: 0 50%;"></div>`;
      }
    });
    chartHtml += `</div>`;
    
    // Add differential points
    chartHtml += `<div class="chart-points differential-points">`;
    chartData.forEach((point, index) => {
      const x = (index / (chartData.length - 1)) * 100;
      const y = 100 - (((point.differential - minValue) / range) * 100);
      chartHtml += `<div class="diff-point" style="left: ${x}%; top: ${y}%" title="Differential: ${point.differential} (${point.date})"></div>`;
    });
    chartHtml += `</div>`;
    
    // Add x-axis dates (first, middle, last)
    chartHtml += `<div class="chart-x-axis">`;
    chartHtml += `<div class="x-label" style="left: 0%">${chartData[0].date}</div>`;
    if (chartData.length > 2) {
      const middleIndex = Math.floor(chartData.length / 2);
      chartHtml += `<div class="x-label" style="left: 50%">${chartData[middleIndex].date}</div>`;
    }
    chartHtml += `<div class="x-label" style="left: 100%">${chartData[chartData.length - 1].date}</div>`;
    chartHtml += `</div>`;
    
    // Add legend
    chartHtml += `<div class="chart-legend">
      <div class="legend-item"><span class="legend-color handicap-color"></span> Handicap</div>
      <div class="legend-item"><span class="legend-color differential-color"></span> Differentials</div>
    </div>`;
    
    chartHtml += `</div>`;
    chartContainer.innerHTML = chartHtml;
  }

  // Add this function to your script.js file

/**
 * Show guidance message for first-time users
 */
function showFirstTimeGuidance() {
  if (!isLoggedIn || !seasonCode || localStorage.getItem('guidanceShown')) {
    return;
  }
  // Check if we've already shown the guidance (using localStorage)
  if (localStorage.getItem('guidanceShown')) {
    return;
  }
  
  // Create a guidance container
  const guidanceContainer = document.createElement('div');
  guidanceContainer.className = 'guidance-container';
  guidanceContainer.innerHTML = `
    <div class="guidance-content">
      <h3>👋 Welcome to HandiRank!</h3>
      <p>To get started:</p>
      <ol>
        <li>Click "Choose Season" to create or join a golf group</li>
        <li>Add your rounds to track your handicap</li>
        <li>Compare your progress with others in your group</li>
      </ol>
      <button class="guidance-dismiss">Got it!</button>
    </div>
  `;
  
  // Add to document
  document.body.appendChild(guidanceContainer);
  
  // Add dismiss handler
  const dismissButton = guidanceContainer.querySelector('.guidance-dismiss');
  if (dismissButton) {
    dismissButton.addEventListener('click', () => {
      guidanceContainer.style.opacity = '0';
      setTimeout(() => {
        guidanceContainer.remove();
      }, 300);
      
      // Remember that we've shown the guidance
      localStorage.setItem('guidanceShown', 'true');
    });
  }
}
  /**
   * Create recent rounds table for player stats
   */
  function createRecentRoundsTable(container, playerData) {
    if (!playerData.rounds || playerData.rounds.length === 0) {
      container.innerHTML = '<div class="no-data">No rounds available</div>';
      return;
    }
    
    // Sort rounds by date (newest first)
    const sortedRounds = [...playerData.rounds].sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    // Create table
    const tableHtml = `
      <table class="rounds-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Score</th>
            <th>Course Info</th>
            <th>Diff</th>
            <th>Used</th>
          </tr>
        </thead>
        <tbody>
          ${sortedRounds.map((round, index) => {
            const date = new Date(round.timestamp).toLocaleDateString();
            const isUsedForHandicap = index < getScoresToUse(sortedRounds.length);
            return `
              <tr class="${isUsedForHandicap ? 'used-for-handicap' : ''}">
                <td>${date}</td>
                <td>${round.gross}</td>
                <td>Rating: ${round.rating}<br>Slope: ${round.slope}</td>
                <td>${round.differential}</td>
                <td>${isUsedForHandicap ? '<span class="used-badge">✓</span>' : ''}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
    
    container.innerHTML = tableHtml;
  }

  /**
   * Setup the Round Form Modal
   * This creates the modal structure but doesn't add the button until a season is selected
   */
  function setupRoundFormModal() {
    if (modalCreated) return; // Only create the modal once
      // Check if modal already exists and remove it
  const existingModal = document.getElementById('roundFormModal');
  if (existingModal) {
    existingModal.remove();
  }

    // Get the existing form
    const roundForm = document.getElementById('roundForm');
    if (!roundForm) return;
    
    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'round-form-modal';
    modal.id = 'roundFormModal';
    
    // Create modal content
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    // Create close button
    const closeButton = document.createElement('button');
    closeButton.className = 'modal-close';
    closeButton.innerHTML = '&times;';
    
    // Add a title to the modal
    const modalTitle = document.createElement('h2');
    modalTitle.textContent = 'Enter New Round';
    
    // Structure the modal
    modalContent.appendChild(closeButton);
    modalContent.appendChild(modalTitle);
    
    // Move the form into the modal content
    modalContent.appendChild(roundForm);
    console.log('Form appended to modal:', roundForm.parentElement === modalContent);
    modal.appendChild(modalContent);
    
    // Add to document
    document.body.appendChild(modal);
    
    // Set up click handlers
    closeButton.addEventListener('click', function() {
      modal.classList.remove('active');
        // Hide the form when closing
      if (roundForm) {
        roundForm.style.display = 'none';
      }
    });
    
    // Also close when clicking outside the modal content
    modal.addEventListener('click', function(event) {
      if (event.target === modal) {
        modal.classList.remove('active');
        if (roundForm) {
          roundForm.style.display = 'none';
        }
      }
    });
    
    // Initially hide the original form
    roundForm.style.display = 'none';
    
    // Mark as created
    modalCreated = true;
  }

  /**
   * Add the button to open the modal - only called after season is selected
   */
  function addRoundFormButton() {
    // Check if button already exists
    if (document.querySelector('.add-round-button')) return;
    
    // Create button to open modal
    const openModalButton = document.createElement('button');
    openModalButton.className = 'add-round-button';
    openModalButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="16"></line>
        <line x1="8" y1="12" x2="16" y2="12"></line>
      </svg>
      Add New Round
    `;
    
    // Insert the button in the action buttons container
    const actionButtons = document.getElementById('actionButtons');
    if (actionButtons) {
      actionButtons.appendChild(openModalButton);
    } else {
      // Fallback - add before the leaderboard title
      const leaderboardTitle = document.getElementById('leaderboardTitle');
      if (leaderboardTitle && leaderboardTitle.parentNode) {
        leaderboardTitle.parentNode.insertBefore(openModalButton, leaderboardTitle);
      }
    }
    
    // Update the click handler with debugging
    openModalButton.addEventListener('click', function() {
      console.log('Add New Round button clicked');
      
      const modal = document.getElementById('roundFormModal');
      const roundForm = document.getElementById('roundForm');
      
      console.log('Modal found:', !!modal);
      console.log('Form found:', !!roundForm);
      
      if (modal) {
        modal.classList.add('active');
        console.log('Modal active class added');
        
        // IMPORTANT: Make sure to show the form when opening the modal
        if (roundForm) {
          roundForm.style.display = 'block';
          console.log('Form display set to block');
          console.log('Form current display:', roundForm.style.display);
        } else {
          console.log('Form not found in click handler');
        }
      } else {
        console.log('Modal not found in click handler');
      }
    });
  }

  /**
   * Add differential preview to the round form
   */
  function setupRoundFormHandicapPreview() {
    const roundForm = document.getElementById('roundForm');
    if (!roundForm) return;
    
    const grossInput = document.getElementById('gross');
    const ratingInput = document.getElementById('rating');
    const slopeInput = document.getElementById('slope');
    const holesSelect = document.getElementById('holes');
    
    if (!grossInput || !ratingInput || !slopeInput || !holesSelect) return;
    
    // Create preview element if it doesn't exist
    let previewElement = document.getElementById('handicapPreview');
    if (!previewElement) {
      previewElement = document.createElement('div');
      previewElement.id = 'handicapPreview';
      previewElement.className = 'handicap-preview';
      previewElement.innerHTML = '<span>Differential Preview: <b>-</b></span>';
      
      // Insert after the form fields, before the submit button
      const submitButton = roundForm.querySelector('button[type="submit"]');
      if (submitButton) {
        submitButton.parentNode.insertBefore(previewElement, submitButton);
      }
    }
    
    // Update preview when inputs change
    const updatePreview = () => {
      const gross = parseFloat(grossInput.value);
      const rating = parseFloat(ratingInput.value);
      const slope = parseFloat(slopeInput.value);
      
      if (!isNaN(gross) && !isNaN(rating) && !isNaN(slope)) {
        const adjustedGross = gross - 2; // Same adjustment as in your existing code
        const differential = ((adjustedGross - rating) * 113 / slope).toFixed(2);
        previewElement.innerHTML = `<span>Differential Preview: <b>${differential}</b></span>`;
      } else {
        previewElement.innerHTML = '<span>Differential Preview: <b>-</b></span>';
      }
    };
    
    // Add event listeners
    grossInput.addEventListener('input', updatePreview);
    ratingInput.addEventListener('input', updatePreview);
    slopeInput.addEventListener('input', updatePreview);
    holesSelect.addEventListener('change', updatePreview);
  }

  /**
   * Setup the tabbed interface for season selection
   */
  function setupSeasonModal() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const closeButton = document.querySelector('.close-button');
    const joinConfirmBtn = document.getElementById('joinConfirmBtn');
    const createConfirmBtn = document.getElementById('createConfirmBtn');
    const joinSeasonInput = document.getElementById('joinSeasonInput');
    const createSeasonInput = document.getElementById('createSeasonInput');
    const recentSeasonsList = document.getElementById('recentSeasonsList');
    
    if (!tabButtons.length || !tabContents.length) return;
    
    // Handle tab switching
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        // Deactivate all tabs
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        // Activate the clicked tab
        button.classList.add('active');
        const tabId = button.getAttribute('data-tab');
        document.getElementById(`${tabId}-tab`).classList.add('active');
      });
    });
    
    // Close button functionality
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        document.getElementById('seasonModal').style.display = 'none';
      });
    }
    
    // Join season button
    if (joinConfirmBtn && joinSeasonInput) {
      joinConfirmBtn.addEventListener('click', () => {
        const seasonCode = joinSeasonInput.value.trim();
        if (seasonCode) {
          handleSeasonSelection(seasonCode, false);
        } else {
          showNotification('Please enter a season code', 'error');
        }
      });
    }
    
    // Create season button
    if (createConfirmBtn && createSeasonInput) {
      createConfirmBtn.addEventListener('click', () => {
        const seasonCode = createSeasonInput.value.trim();
        if (seasonCode) {
          handleSeasonSelection(seasonCode, true);
        } else {
          showNotification('Please enter a season name', 'error');
        }
      });
    }
    
    // Load recent seasons (if available)
    loadRecentSeasons();
  }

  /**
   * Fetch and display recent seasons
   */
/**
 * Fetch and display recent seasons
 */
      async function loadRecentSeasons() {
        const recentSeasonsList = document.getElementById('recentSeasonsList');
        if (!recentSeasonsList) return;
        
        // Check if we're logged in and have access token
        if (!isLoggedIn || !accessToken) {
          recentSeasonsList.innerHTML = '<div class="no-seasons">Sign in to see available seasons</div>';
          return;
        }
        
        try {
          // Get all available seasons from the new Seasons sheet
          const allSeasons = await getExistingSeasons();
          
          // Get recent seasons from local storage
          const storedSeasons = localStorage.getItem('recentSeasons');
          const recentSeasons = storedSeasons ? JSON.parse(storedSeasons) : [];
          
          // Combine and prioritize recent seasons, but show all available seasons
          const seasonsToShow = [
            ...recentSeasons.filter(season => allSeasons.includes(season)), // Recent seasons that still exist
            ...allSeasons.filter(season => !recentSeasons.includes(season)) // Other available seasons
          ];
          
          if (seasonsToShow.length === 0) {
            recentSeasonsList.innerHTML = '<div class="no-seasons">No seasons available</div>';
            return;
          }
          
          // Display seasons with better styling
          recentSeasonsList.innerHTML = `
            <div class="seasons-list-header">
              <h4>Available Seasons (${seasonsToShow.length})</h4>
            </div>
          `;
          
          seasonsToShow.forEach((season, index) => {
            const seasonItem = document.createElement('div');
            seasonItem.className = 'recent-season-item';
            
            // Mark recent seasons
            const isRecent = recentSeasons.includes(season);
            if (isRecent) {
              seasonItem.classList.add('recent-season');
            }
            
            seasonItem.innerHTML = `
              <div class="season-info">
                <span class="season-name">${season}</span>
                ${isRecent ? '<span class="recent-badge">Recent</span>' : ''}
              </div>
            `;
            
            seasonItem.addEventListener('click', () => {
              document.getElementById('joinSeasonInput').value = season;
              // Add visual feedback
              document.querySelectorAll('.recent-season-item').forEach(item => {
                item.classList.remove('selected');
              });
              seasonItem.classList.add('selected');
            });
            
            recentSeasonsList.appendChild(seasonItem);
          });
          
        } catch (error) {
          console.error('Error loading seasons:', error);
          recentSeasonsList.innerHTML = '<div class="no-seasons">Error loading seasons</div>';
        }
      }

    function maybeShowViewSeasonsButton() {
      console.log("Check button conditions:", {
        isLoggedIn,
        seasonCode,
        isWorldView
      });
      
      if (isLoggedIn && !seasonCode && isWorldView) {
        console.log("Trying to show view seasons button...")
        const actionButtons = document.getElementById('actionButtons');
        if (actionButtons) {
          // Clear any existing buttons
          actionButtons.innerHTML = '';
          
          // Add the view seasons button (renamed from select season)
          const viewSeasonsBtn = document.createElement('button');
          viewSeasonsBtn.className = 'select-season-button'; // Keep same styling
          viewSeasonsBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
            View Seasons
          `;
          actionButtons.appendChild(viewSeasonsBtn);
          
          // Add click event listener
          viewSeasonsBtn.addEventListener('click', () => {
            showSeasonModal();
          });
        }
      } else {
        // Hide buttons when a season is active
        const actionButtons = document.getElementById('actionButtons');
        if (actionButtons) actionButtons.innerHTML = '';
      }
    }
  /**
   * Handle season selection (join or create)
   */
  async function handleSeasonSelection(code, isCreating) {
    try {
      // Trim the code for consistent checking
      code = code.trim();
      
      // First hide the modal
      seasonModal.style.display = 'none';
      
      // Get existing seasons
      const existingSeasons = await getExistingSeasons();
      
      // Convert everything to lowercase for case-insensitive comparison
      const existingSeasonsLower = existingSeasons.map(s => s.toLowerCase());
      const codeLower = code.toLowerCase();
      
      if (isCreating) {
        // Check if season already exists (case-insensitive)
        if (existingSeasonsLower.includes(codeLower)) {
          showNotification('That season name already exists. Please choose another.', 'error');
          // Re-open the modal and focus on the create input
          seasonModal.style.display = 'flex';
          document.getElementById('createSeasonInput').focus();
          return; // Stop execution here
        }
        
        // Create the new season
        await createNewSeason(code);
        showNotification(`Season "${code}" created successfully!`);
      } else {
        // For joining, we need to handle case sensitivity
        if (!existingSeasonsLower.includes(codeLower)) {
          showNotification('Season not found. Please check the code and try again.', 'error');
          seasonModal.style.display = 'flex';
          document.getElementById('joinSeasonInput').focus();
          return; // Stop execution here
        }
        
        // Use the original case from the stored seasons
        const matchIndex = existingSeasonsLower.indexOf(codeLower);
        if (matchIndex >= 0) {
          code = existingSeasons[matchIndex]; // Use the original case
        }
        
        showNotification(`Joined season "${code}"`);
      }
      
      // Continue with the season setup
      saveToRecentSeasons(code);
      seasonCode = code;
      
      // Store the selected season in localStorage for persistence
      localStorage.setItem('currentSeasonCode', code);
      
      // Update UI
      currentSeasonDiv.innerText = `Current Season: ${seasonCode}`;
      currentSeasonDiv.style.display = 'block';
      leaderboardTitle.innerText = `${seasonCode} Leaderboard`;
      
      isWorldView = false;
      maybeShowViewSeasonsButton(); 
      // Now that we have a season, we can add the round form button
      setupRoundFormModal(); // Ensure modal is created
      addRoundFormButton(); // Add the button to open it
      
      // Add the season management button
      addSeasonManagementButton();
      
      // Load the season's leaderboard
      await checkSeasonStatus();
      loadLeaderboard();
    } catch (error) {
      console.error('Error in season selection:', error);
      showNotification('An error occurred. Please try again.', 'error');
      // Re-open the modal in case of error
      seasonModal.style.display = 'flex';
    }
  }

  /**
   * Get all existing seasons from the server
   */

async function getExistingSeasons() {
  try {
    // First try to get from the new Seasons sheet
    const response = await fetch('/.netlify/functions/get-all-seasons');
    if (response.ok) {
      const seasons = await response.json();
      return seasons;
    } else {
      // Fallback to old method if new function doesn't exist yet
      const fallbackResponse = await fetch('/.netlify/functions/get-seasons');
      if (fallbackResponse.ok) {
        const seasons = await fallbackResponse.json();
        return seasons;
      }
    }
    return [];
  } catch (error) {
    console.error('Error fetching seasons:', error);
    return [];
  }
}

  /**
   * Save a season to recent seasons in local storage
   */
  function saveToRecentSeasons(code) {
    try {
      // Get existing recent seasons
      const storedSeasons = localStorage.getItem('recentSeasons');
      let recentSeasons = storedSeasons ? JSON.parse(storedSeasons) : [];
      
      // Add new season to the beginning if not already in the list
      if (!recentSeasons.includes(code)) {
        recentSeasons.unshift(code);
        
        // Keep only the 5 most recent
        if (recentSeasons.length > 5) {
          recentSeasons = recentSeasons.slice(0, 5);
        }
        
        // Save back to local storage
        localStorage.setItem('recentSeasons', JSON.stringify(recentSeasons));
      }
    } catch (error) {
      console.error('Error saving recent season:', error);
    }
  }

  /**
   * Create a new season
   */
    async function createNewSeason(code, password = '') {
      try {
        const requestBody = {
          seasonCode: code,
          userName: userName
        };
        
        // If password is provided, this is an admin season
        if (password) {
          requestBody.password = password;
          requestBody.adminName = userName;
          requestBody.adminEmail = userEmail;
          requestBody.adminPhoto = userPhoto;
        }
        
        const response = await fetch('/.netlify/functions/create-season', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Error creating season');
        }

        // If password was provided, user becomes admin
        if (password) {
          isSeasonAdmin = true;
          isSeasonParticipant = true;
        }

        return true;
      } catch (err) {
        console.error("Error creating new season:", err);
        showNotification(err.message, 'error');
        return false;
      }
    }

  /**
   * Validate round form and show errors
   */
  function validateRoundForm() {
    let isValid = true;
    const gross = document.getElementById('gross').value;
    const rating = document.getElementById('rating').value;
    const slope = document.getElementById('slope').value;
    
    // Clear previous errors
    clearFormErrors();
    
    // Validate gross score (reasonable golf score)
    if (!gross || isNaN(gross) || gross < 50 || gross > 200) {
      showError('gross', 'Please enter a valid score between 50 and 200');
      isValid = false;
    }
    
    // Validate course rating (valid range)
    if (!rating || isNaN(rating) || rating < 60 || rating > 80) {
      showError('rating', 'Course rating should be between 60 and 80');
      isValid = false;
    }
    
    // Validate slope (valid slope range is 55-155 per USGA)
    if (!slope || isNaN(slope) || slope < 55 || slope > 155) {
      showError('slope', 'Slope should be between 55 and 155');
      isValid = false;
    }
    
    return isValid;
  }

  /**
   * Show error message for form validation
   */
  function showError(fieldId, message) {
    const field = document.getElementById(fieldId);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    errorDiv.style.color = '#f44336';
    errorDiv.style.fontSize = '0.8em';
    errorDiv.style.marginTop = '4px';
    field.parentNode.insertBefore(errorDiv, field.nextSibling);
    field.style.borderColor = '#f44336';
  }

  /**
   * Clear all error messages
   */
  function clearFormErrors() {
    const errorMessages = document.querySelectorAll('.error-message');
    errorMessages.forEach(msg => msg.remove());
    
    const formInputs = document.querySelectorAll('#roundForm input');
    formInputs.forEach(input => input.style.borderColor = '');
  }

  /**
   * Add tooltips to form fields
   */
  function addFormTooltips() {
    const ratingField = document.getElementById('rating');
    if (ratingField) {
      ratingField.title = "Course rating represents the expected score for a scratch golfer under normal conditions";
    }
    
    const slopeField = document.getElementById('slope');
    if (slopeField) {
      slopeField.title = "Slope rating represents the relative difficulty of a course for a bogey golfer compared to a scratch golfer";
    }
  }

  /**
   * Show notification message
   */
// OPTIONAL: Enhance your existing showNotification function to handle new notification types:
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  notification.style.position = 'fixed';
  notification.style.top = '20px';
  notification.style.right = '20px';
  notification.style.padding = '10px 20px';
  notification.style.borderRadius = '4px';
  notification.style.zIndex = '1000';
  notification.style.maxWidth = '300px';
  notification.style.wordWrap = 'break-word';
  
  if (type === 'success') {
    notification.style.backgroundColor = '#4CAF50';
    notification.style.color = 'white';
  } else if (type === 'error') {
    notification.style.backgroundColor = '#f44336';
    notification.style.color = 'white';
  } else if (type === 'admin') {
    notification.style.background = 'linear-gradient(145deg, #f2d50f, #e6c60e)';
    notification.style.color = '#333';
    notification.style.fontWeight = 'bold';
  } else if (type === 'info') {
    notification.style.background = 'linear-gradient(145deg, #2196F3, #1976D2)';
    notification.style.color = 'white';
  } else if (type === 'participant') {
    notification.style.background = 'linear-gradient(145deg, #4CAF50, #45a049)';
    notification.style.color = 'white';
  }
  
  document.body.appendChild(notification);
  
  // Auto remove after 3 seconds (longer for admin notifications)
  const timeout = type === 'admin' ? 5000 : 3000;
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.5s';
    setTimeout(() => notification.remove(), 500);
  }, timeout);
}

  /**
   * Make the table responsive
   */
  function makeTableResponsive() {
    const table = document.getElementById('leaderboard');
    if (!table) return;
    
    const headers = table.querySelectorAll('thead th');
    const headerTexts = Array.from(headers).map(header => header.textContent);
    
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      cells.forEach((cell, index) => {
        if (index > 0) { // Skip the first cell (player name with avatar)
          cell.setAttribute('data-label', headerTexts[index]);
        }
      });
    });
  }

  /**
   * Show season modal
   */
  function showSeasonModal() {
    if (seasonModal) {
      seasonModal.style.display = 'flex';
    } else {
      console.error("Season modal element not found!");
    }
  }

  /**
   * Add a button to change/exit season
   */
  function addSeasonManagementButton() {
    // Remove any existing button first
    const existingButton = document.querySelector('.season-manage-button');
    if (existingButton) existingButton.remove();
    
    // Create the button
    const seasonManageBtn = document.createElement('button');
    seasonManageBtn.className = 'season-manage-button';
    seasonManageBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 6h18"></path>
        <path d="M3 12h18"></path>
        <path d="M3 18h18"></path>
      </svg>
      Change Season
    `;
    
    // Add it to the action buttons container
    const actionButtons = document.getElementById('actionButtons');
    if (actionButtons) {
      actionButtons.appendChild(seasonManageBtn);
    } else {
      // Fallback - add near the leaderboard title
      const leaderboardTitle = document.getElementById('leaderboardTitle');
      if (leaderboardTitle && leaderboardTitle.parentNode) {
        leaderboardTitle.parentNode.insertBefore(seasonManageBtn, leaderboardTitle);
      }
    }
    
    // Add click handler
    seasonManageBtn.addEventListener('click', showSeasonManagementOptions);
  }

  /**
   * Show options for season management
   */
  function showSeasonManagementOptions() {
    // Create a custom dropdown/popover menu
    const popover = document.createElement('div');
    popover.className = 'season-popover';
    popover.innerHTML = `
      <div class="season-popover-content">
        <h3>Season Options</h3>
        <button class="season-option" data-action="view-world">View World Rankings</button>
        <button class="season-option" data-action="change-season">Select Different Season</button>
        <button class="season-option" data-action="create-season">Create New Season</button>
      </div>
    `;
    
    // Style for the popover
    popover.style.position = 'fixed';
    popover.style.zIndex = '1000';
    popover.style.backgroundColor = 'white';
    popover.style.borderRadius = '8px';
    popover.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    popover.style.padding = '15px';
    
    // Get position from the button that was clicked
    const button = document.querySelector('.season-manage-button');
    const buttonRect = button.getBoundingClientRect();
    popover.style.top = (buttonRect.bottom + 10) + 'px';
    popover.style.left = buttonRect.left + 'px';
    
    // Add to document
    document.body.appendChild(popover);
    
    // Add click handlers for options
    popover.querySelectorAll('.season-option').forEach(option => {
      option.addEventListener('click', () => {
        const action = option.getAttribute('data-action');
        handleSeasonAction(action);
        // Remove the popover
        popover.remove();
      });
    });
    
    // Click outside to dismiss
    document.addEventListener('click', function dismissPopover(e) {
      if (!popover.contains(e.target) && e.target !== button) {
        popover.remove();
        document.removeEventListener('click', dismissPopover);
      }
    });
  }

  /**
   * Handle season management actions
   */
  function handleSeasonAction(action) {
    switch (action) {
      case 'view-world':
        // Switch to world view
        isWorldView = true;
        seasonCode = ''; // ✅ Clear active season
        localStorage.removeItem('currentSeasonCode');
        leaderboardTitle.innerText = 'World Leaderboard';
        loadWorldLeaderboardPublic();
        // Hide season-specific UI elements
        setTimeout(() => {
          maybeShowViewSeasonsButton();  // 🕒 DOM should be ready now
        }, 100); // slight delay to ensure the view changes and DOM is rendered
        currentSeasonDiv.style.display = 'none';
        const actionButtons = document.getElementById('actionButtons');
        if (actionButtons) actionButtons.innerHTML = '';
        break;
        
      case 'change-season':
        // Show the season selection modal
        showSeasonModal();
        break;
        
      case 'create-season':
        // Show the season creation modal
        showSeasonModal();
        // Switch to create tab
        const createTabButton = document.querySelector('.tab-button[data-tab="create"]');
        if (createTabButton) {
          createTabButton.click();
        }
        break;
    }
  }


  /**
   * Show main content after successful login
   */
  function showMainContent() {
    const preLoginContent = document.querySelector('.pre-login-content');
    const mainContent = document.querySelector('.main-content');
    
    // First, stop all animations on the logo
    const logo = document.getElementById('appLogo');
    if (logo) {
      logo.style.animationPlayState = 'paused';
    }
    
    // Hide all modals immediately
    const allModals = document.querySelectorAll('.modal');
    allModals.forEach(modal => {
      modal.style.display = 'none';
      modal.classList.remove('active');
    });
    
    // Clear any inline styles that might be interfering
    const seasonModal = document.getElementById('seasonModal');
    if (seasonModal) {
      seasonModal.style.display = 'none';
      seasonModal.removeAttribute('style');
    }

    if (preLoginContent) {
      // Add fade-out class
      preLoginContent.classList.add('fade-out');
      
      // Wait for animation to complete before hiding
      setTimeout(() => {
        preLoginContent.style.display = 'none';
        // Ensure it's completely hidden
        preLoginContent.style.opacity = '0';
        preLoginContent.style.pointerEvents = 'none';
        
        // Show main content and fade it in
        if (mainContent) {
          mainContent.style.display = 'block';
          
          // Trigger reflow to ensure proper rendering
          mainContent.offsetHeight;
          
          // Then fade in
          setTimeout(() => {
            mainContent.classList.add('fade-in');
            // Add logged-in class to body
            document.body.classList.add('logged-in');
          }, 50);
        }
      }, 800); // Match transition duration
    }
    
    // Call guidance after transition completes
    setTimeout(() => {
      showFirstTimeGuidance();
    }, 1000);
  }

  /**
   * Check if user is already logged in from previous session
   * and restore their session
   */
  function checkPreviousLogin() {
    const storedToken = localStorage.getItem('accessToken');
    const storedName = localStorage.getItem('userName');
    const storedPhoto = localStorage.getItem('userPhoto');
    const storedSeasonCode = localStorage.getItem('currentSeasonCode');
    
    if (storedToken) {
      // Restore session data
      accessToken = storedToken;
      userName = storedName || 'Unknown Player';
      userEmail = localStorage.getItem('userEmail') || '';
      userPhoto = storedPhoto || '';
      isLoggedIn = true;
      
      // Show main content
      showMainContent();
      
      // Hide sign-in button
      if (signinDiv) {
        signinDiv.style.display = 'none';
      }
      
      // If they had a season selected, restore it
      if (storedSeasonCode) {
        seasonCode = storedSeasonCode;
        currentSeasonDiv.innerText = `Current Season: ${seasonCode}`;
        currentSeasonDiv.style.display = 'block';
        leaderboardTitle.innerText = `${seasonCode} Leaderboard`;
     
        isWorldView = false;
        
        // Setup form modal and add button
        setupRoundFormModal();
        addRoundFormButton();
        
        // Add season management button
        addSeasonManagementButton();
        
        // Load the season-specific leaderboard
        checkSeasonStatus().then(() => {
          loadLeaderboard();
        });
      } else {
        // Just load the world leaderboard
        loadWorldLeaderboardPublic();
      }
      
      return true;
    }
    
    return false;
  }

    // REPLACE your existing checkSeasonStatus function with this enhanced version:
    async function checkSeasonStatus() {
      if (!seasonCode || !userName) return;
      
      try {
        const response = await fetch(`/.netlify/functions/check-season-status?seasonCode=${encodeURIComponent(seasonCode)}&userName=${encodeURIComponent(userName)}`);
        
        if (response.ok) {
          const data = await response.json();
          
          // Check for admin changes
          const currentAdmin = data.currentAdmin;
          if (previousAdmin && previousAdmin !== currentAdmin) {
            handleAdminChange(previousAdmin, currentAdmin);
          }
          previousAdmin = currentAdmin;
          
          // Update global status variables
          isSeasonAdmin = data.isAdmin;
          isSeasonParticipant = data.isParticipant;
          seasonParticipants = data.participants || [];
          
          updateSeasonUI();
          
          // Show admin status if user is the admin
          if (data.isAdmin && userName === currentAdmin) {
            showAdminStatusNotification();
          }
        }
      } catch (error) {
        console.error('Error checking season status:', error);
      }
    }

      /**
       * Update UI based on season status
       */
    // REPLACE your existing updateSeasonUI function with this enhanced version:
      function updateSeasonUI() {
        const actionButtons = document.getElementById('actionButtons');
        if (!actionButtons) return;
        
        actionButtons.innerHTML = '';
        
        if (isSeasonAdmin) {
          // Show admin crown indicator
          const adminIndicator = document.createElement('div');
          adminIndicator.className = 'season-status-indicator admin';
          adminIndicator.innerHTML = `You're the Admin (Ranked #1)`;
          actionButtons.appendChild(adminIndicator);
          
          // Admin gets "Add Round for Player" button
          const adminBtn = document.createElement('button');
          adminBtn.className = 'admin-add-round-button';
          adminBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="16"></line>
              <line x1="8" y1="12" x2="16" y2="12"></line>
            </svg>
            Add Round for Player
          `;
          adminBtn.addEventListener('click', showAdminRoundForm);
          actionButtons.appendChild(adminBtn);
          
          // Admin gets "Manage Season" button
          const manageBtn = document.createElement('button');
          manageBtn.className = 'manage-season-button';
          manageBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="8.5" cy="7" r="4"></circle>
              <path d="M20 8v6M23 11h-6"></path>
            </svg>
            Manage Season
          `;
          manageBtn.addEventListener('click', showSeasonManagement);
          actionButtons.appendChild(manageBtn);
          
        } else if (isSeasonParticipant) {
          // Participants see status message with admin transfer info
          const statusDiv = document.createElement('div');
          statusDiv.className = 'participant-status-message';
          statusDiv.innerHTML = `
            <span class="participant-badge">✓ Season Participant</span>
            <p>Contact the season admin to add your golf rounds.</p>
            <p class="admin-transfer-note">💡 Tip: The admin role transfers to whoever ranks #1!</p>
          `;
          actionButtons.appendChild(statusDiv);
          
        } else if (isLoggedIn) {
          // Non-participants can join
          const joinBtn = document.createElement('button');
          joinBtn.className = 'join-season-button';
          joinBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="8.5" cy="7" r="4"></circle>
              <line x1="20" y1="8" x2="20" y2="14"></line>
              <line x1="23" y1="11" x2="17" y2="11"></line>
            </svg>
            Join This Season
          `;
          joinBtn.addEventListener('click', showJoinPasswordDialog);
          actionButtons.appendChild(joinBtn);
        }
        
        if (isLoggedIn) {
          addSeasonManagementButton();
        }
      }
      /**
       * Show admin round form
       */
// REPLACE your existing showAdminRoundForm function with this enhanced version:
      function showAdminRoundForm() {
        if (seasonParticipants.length === 0) {
          showNotification('No participants in this season yet.', 'error');
          return;
        }
        
        const modal = document.createElement('div');
        modal.className = 'simple-modal';
        modal.innerHTML = `
          <div class="simple-modal-content">
            <button class="simple-close" onclick="this.closest('.simple-modal').remove()">&times;</button>
            <h3>Add Round for Player</h3>
            
            <div class="admin-note-box" style="background: rgba(242, 213, 15, 0.1); border: 1px solid #f2d50f; border-radius: 6px; padding: 10px; margin-bottom: 15px;">
              <p style="margin: 0; font-size: 0.9em; color: #333;"><strong>💡 Admin Transfer Note:</strong> Adding rounds may change leaderboard rankings and admin status.</p>
            </div>
            
            <form id="adminRoundForm">
              <label>Select Player:</label>
              <select id="adminPlayerSelect" required>
                <option value="">Choose a player...</option>
                ${seasonParticipants.map(p => `
                  <option value="${p.name}" data-photo="${p.photo || ''}" ${p.isAdmin ? 'data-current-admin="true"' : ''}>
                    ${p.name} ${p.isAdmin ? '👑 (Current Admin)' : ''}
                  </option>
                `).join('')}
              </select>
              
              <label>Gross Score:</label>
              <input type="number" id="adminGross" required min="50" max="200" />
              
              <label>Course Rating:</label>
              <input type="number" step="0.1" id="adminRating" required min="60" max="80" />
              
              <label>Slope:</label>
              <input type="number" id="adminSlope" required min="55" max="155" />
              
              <label>Holes:</label>
              <select id="adminHoles">
                <option value="18">18</option>
                <option value="9">9</option>
              </select>
              
              <button type="submit" class="primary-button">Add Round</button>
            </form>
          </div>
        `;
        
        document.body.appendChild(modal);
        modal.style.display = 'flex';
        
        document.getElementById('adminRoundForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const playerSelect = document.getElementById('adminPlayerSelect');
          const selectedPlayer = playerSelect.value;
          const selectedPhoto = playerSelect.selectedOptions[0]?.getAttribute('data-photo') || '';
          
          if (!selectedPlayer) {
            showNotification('Please select a player', 'error');
            return;
          }
          
          const roundData = {
            timestamp: new Date().toLocaleString(),
            userName: selectedPlayer,
            userPhoto: selectedPhoto,
            gross: parseFloat(document.getElementById('adminGross').value),
            rating: parseFloat(document.getElementById('adminRating').value),
            slope: parseFloat(document.getElementById('adminSlope').value),
            holes: parseInt(document.getElementById('adminHoles').value),
            seasonCode,
            addedBy: userName,
            isAdminEntry: true
          };
          
          const adjustedGross = roundData.gross - 2;
          roundData.adjustedGross = adjustedGross;
          roundData.differential = ((adjustedGross - roundData.rating) * 113 / roundData.slope).toFixed(2);
          
          // Use the enhanced submission function
          await handleRoundSubmission(roundData);
          modal.remove();
        });
      }

      /**
       * Show season management modal
       */
          // REPLACE your existing showSeasonManagement function with this enhanced version:
       function showSeasonManagement() {
            const modal = document.createElement('div');
            modal.className = 'simple-modal';
            modal.innerHTML = `
              <div class="simple-modal-content">
                <button class="simple-close" onclick="this.closest('.simple-modal').remove()">&times;</button>
                <h3>Season Management</h3>
                
                <div class="admin-info-section">
                  <h4>👑 Admin Status</h4>
                  <div class="admin-transfer-info">
                    <p><strong>Dynamic Admin System:</strong> The admin role automatically transfers to whoever is ranked #1 on the leaderboard.</p>
                    <p>Current admin: <strong>${previousAdmin || 'Unknown'}</strong></p>
                    <p class="admin-note">💡 Stay at the top to keep admin privileges!</p>
                  </div>
                </div>
                
                <div class="season-password-section">
                  <h4>Season Password</h4>
                  <p>Share this password for others to join:</p>
                  <div class="password-row">
                    <span id="passwordDisplay">••••••••</span>
                    <button id="togglePassword" class="small-button">Show</button>
                  </div>
                </div>
                
                <div class="participants-section">
                  <h4>Participants (${seasonParticipants.length})</h4>
                  <div id="participantsList">
                    ${seasonParticipants.map(p => `
                      <div class="participant-row">
                        ${p.photo ? `<img src="${p.photo}" class="small-avatar" />` : ''}
                        <span>${p.name} ${p.isAdmin ? '👑 (Admin)' : ''}</span>
                        ${!p.isAdmin ? `<button onclick="removeParticipant('${p.name}')" class="remove-button">Remove</button>` : ''}
                      </div>
                    `).join('')}
                  </div>
                </div>
              </div>
            `;
            
            document.body.appendChild(modal);
            modal.style.display = 'flex';
            
            // Add password toggle functionality
            document.getElementById('togglePassword').addEventListener('click', async () => {
              const display = document.getElementById('passwordDisplay');
              const button = document.getElementById('togglePassword');
              
              if (display.textContent === '••••••••') {
                try {
                  const response = await fetch(`/.netlify/functions/get-season-password?seasonCode=${encodeURIComponent(seasonCode)}&adminName=${encodeURIComponent(userName)}`);
                  if (response.ok) {
                    const data = await response.json();
                    display.textContent = data.password;
                    button.textContent = 'Hide';
                  }
                } catch (error) {
                  showNotification('Error getting password', 'error');
                }
              } else {
                display.textContent = '••••••••';
                button.textContent = 'Show';
              }
            });
          }
      /**
       * Show join password dialog
       */
      function showJoinPasswordDialog() {
        const password = prompt('Enter the season password to join:');
        if (!password) return;
        
        joinSeasonWithPassword(password);
      }

      /**
       * Join season with password
       */
      async function joinSeasonWithPassword(password) {
        try {
          const response = await fetch('/.netlify/functions/join-season', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              seasonCode,
              password,
              userName,
              userEmail,
              userPhoto
            })
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to join season');
          }

          showNotification('Successfully joined the season!', 'success');
          await checkSeasonStatus();
          
        } catch (error) {
          showNotification(error.message, 'error');
        }
      }

      /**
       * Remove participant (global function for onclick)
       */
      window.removeParticipant = async function(participantName) {
        if (!confirm(`Remove ${participantName} from the season? This will delete all their rounds.`)) {
          return;
        }
        
        try {
          const response = await fetch('/.netlify/functions/remove-participant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              seasonCode,
              participantName,
              adminName: userName
            })
          });
          
          if (!response.ok) throw new Error('Failed to remove participant');
          
          showNotification(`${participantName} removed from season`, 'success');
          
          document.querySelector('.simple-modal').remove();
          await checkSeasonStatus();
          loadLeaderboard();
          
        } catch (error) {
          showNotification('Error removing participant', 'error');
        }
      };

      /**
       * Enhance season creation modal
       */
      function enhanceCreateSeasonTab() {
        const createTab = document.getElementById('create-tab');
        if (!createTab) return;
        
        createTab.innerHTML = `
          <p>Create a new season for your golf group.</p>
          <input type="text" id="createSeasonInput" placeholder="Enter season name" maxlength="30" />
          
          <div class="admin-season-option">
            <label>
              <input type="checkbox" id="makeAdminSeason" />
              Make me the admin (password protected)
            </label>
            <input type="password" id="createSeasonPassword" placeholder="Set password" style="display:none;" />
          </div>
          
          <button id="createConfirmBtn" class="primary-button">Create Season</button>
        `;
        
        document.getElementById('makeAdminSeason').addEventListener('change', (e) => {
          const passwordField = document.getElementById('createSeasonPassword');
          passwordField.style.display = e.target.checked ? 'block' : 'none';
          if (!e.target.checked) passwordField.value = '';
        });
        
        document.getElementById('createConfirmBtn').addEventListener('click', async () => {
          const seasonName = document.getElementById('createSeasonInput').value.trim();
          const isAdmin = document.getElementById('makeAdminSeason').checked;
          const password = document.getElementById('createSeasonPassword').value.trim();
          
          if (!seasonName) {
            showNotification('Please enter a season name', 'error');
            return;
          }
          
          if (isAdmin && !password) {
            showNotification('Please set a password for admin season', 'error');
            return;
          }
          
          const success = await createNewSeason(seasonName, isAdmin ? password : '');
          if (success) {
            document.getElementById('seasonModal').style.display = 'none';
            handleSeasonSelection(seasonName, true);
          }
        });
      }
  /**
   * Initialize the app with login-first flow
   */
      // ADD these new functions to your script.js:

    /**
     * Handle admin change notifications
     */
    function handleAdminChange(oldAdmin, newAdmin) {
      if (userName === newAdmin) {
        // User became admin
        showNotification(`🎉 Congratulations! You're now the season admin (ranked #1)!`, 'admin');
      } else if (userName === oldAdmin) {
        // User lost admin status
        showNotification(`Admin role transferred to ${newAdmin} (new #1 player)`, 'participant');
      } else {
        // Admin changed to someone else
        showNotification(`${newAdmin} is now the season admin (ranked #1)`, 'info');
      }
    }

    /**
     * Show admin status notification for current admins
     */
    function showAdminStatusNotification() {
      // Only show this once per session
      if (localStorage.getItem(`adminNotified_${seasonCode}_${userName}`)) {
        return;
      }
      
      const adminNotification = document.createElement('div');
      adminNotification.className = 'admin-status-notification';
      adminNotification.innerHTML = `
        <div class="admin-crown">👑</div>
        <div class="admin-message">
          <h4>You're the Season Admin!</h4>
          <p>You're currently ranked #1. Admin privileges transfer automatically to whoever leads the leaderboard.</p>
          <button onclick="this.parentElement.parentElement.remove()">Got it!</button>
        </div>
      `;
      
      document.body.appendChild(adminNotification);
      
      // Mark as shown for this session
      localStorage.setItem(`adminNotified_${seasonCode}_${userName}`, 'true');
      
      // Auto-remove after 8 seconds
      setTimeout(() => {
        if (adminNotification.parentElement) {
          adminNotification.remove();
        }
      }, 8000);
    }

    /**
     * Enhanced round form submission with admin update handling
     */
    async function handleRoundSubmission(roundData) {
      try {
        const response = await fetch('/.netlify/functions/add-round', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(roundData)
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Error submitting round');
        }

        const result = await response.json();
        
        // Show success message
        showNotification('Round added successfully!');
        
        // Check if admin was updated
        if (result.adminUpdated) {
          showNotification('Leaderboard updated - checking for admin changes...', 'info');
          
          // Delay the status check slightly to ensure all updates are complete
          setTimeout(async () => {
            await checkSeasonStatus();
          }, 1000);
        } else {
          // Regular status check
          await checkSeasonStatus();
        }
        
        // Close modal and reload leaderboard
        const modal = document.querySelector('.round-form-modal');
        if (modal) {
          modal.classList.remove('active');
        }
        
        // Reset form
        document.getElementById('roundForm').reset();
        
        // Reload appropriate leaderboard
        if (isWorldView) {
          loadWorldLeaderboardPublic();
        } else {
          loadLeaderboard();
        }
        
      } catch (err) {
        console.error('Error submitting round:', err);
        showNotification('Error submitting round. Please try again.', 'error');
      }
    }
  function initializeApp() {
    const preLoginContent = document.querySelector('.pre-login-content');
    const mainContent = document.querySelector('.main-content');
    const mainSigninBtn = document.getElementById('mainSigninBtn');
    const signinBtn = document.getElementById('signinBtn'); // Your existing sign-in button
    
    console.log('Main signin button found:', !!mainSigninBtn);
    console.log('Hidden signin button found:', !!signinBtn);
    

    const logo = document.getElementById('appLogo');
    if (logo) {
      setTimeout(() => {
        logo.classList.add('visible');
      }, 100); // short delay to allow browser to register class
    }

    // First check if user is already logged in from previous session
    const storedToken = localStorage.getItem('accessToken');
    if (storedToken) {
      // User is logged in, show main content
      if (preLoginContent) preLoginContent.style.display = 'none';
      if (mainContent) mainContent.style.display = 'block';
      
      // Continue with the existing login restoration
      checkPreviousLogin();
    } else {
      // User is not logged in, keep pre-login screen
      if (preLoginContent){
        preLoginContent.classList.add('visible');  // ADD THIS LINE
        preLoginContent.style.display = 'flex';
        preLoginContent.style.opacity = '1';  // ADD THIS LINE
      } 
      if (mainContent) mainContent.style.display = 'none';
      
      // Set up click handler for the main sign-in button
      if (mainSigninBtn && signinBtn) {
        mainSigninBtn.addEventListener('click', () => {
          // Trigger the existing sign-in button's click event
          signinBtn.click();
        });
      }
      loadWorldLeaderboardPublic();
    }
  }
  maybeShowViewSeasonsButton();
  // ----- EVENT LISTENERS -----



  // Round form submission
      // Round form submission - Clean version:
    roundForm.addEventListener('submit', async function (event) {
      event.preventDefault();

      // First, validate the form
      if (!validateRoundForm()) {
        return;
      }

      const gross = parseFloat(document.getElementById('gross').value);
      const rating = parseFloat(document.getElementById('rating').value);
      const slope = parseFloat(document.getElementById('slope').value);
      const holes = parseInt(document.getElementById('holes').value);
      const adjustedGross = gross - 2;
      const differential = ((adjustedGross - rating) * 113 / slope).toFixed(2);
      const timestamp = new Date().toLocaleString();

      const roundData = {
        timestamp,
        userName,
        gross,
        rating,
        slope,
        holes,
        adjustedGross,
        differential,
        seasonCode,
        userPhoto
      };

      // ✅ This handles everything: admin updates, notifications, modal closing, form reset, AND leaderboard reloading
      await handleRoundSubmission(roundData);
    });

  // Google Sign-in setup
  const waitForGoogle = setInterval(() => {
    if (typeof google === 'undefined' || !google.accounts?.oauth2) return;

    clearInterval(waitForGoogle);


    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async (tokenResponse) => {
        accessToken = tokenResponse.access_token;
        isLoggedIn = true;

        await gapi.load('client', async () => {
          await gapi.client.init({
            apiKey: null,
            discoveryDocs: [
              "https://sheets.googleapis.com/$discovery/rest?version=v4",
              "https://people.googleapis.com/$discovery/rest?version=v1"
            ]
          });
          
          gapi.client.setToken({ access_token: accessToken });

          try {
            const response = await fetch('https://people.googleapis.com/v1/people/me?personFields=names,photos,emailAddresses', {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            });

            if (!response.ok) {
              throw new Error(`People API request failed: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.names && data.names.length > 0) {
              userName = data.names[0].displayName;
            } else if (data.emailAddresses && data.emailAddresses.length > 0) {
              userName = data.emailAddresses[0].value;
            } else {
              userName = 'Unknown Player';
            }

            // GET EMAIL - This is the important addition
            if (data.emailAddresses && data.emailAddresses.length > 0) {
              userEmail = data.emailAddresses[0].value;
            }

            if (data.photos && data.photos.length > 0) {
              userPhoto = data.photos[0].url;
            }

            console.log("User info loaded:", userName, userEmail, userPhoto);
            
            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('userName', userName);
            localStorage.setItem('userEmail', userEmail); // Store email
            localStorage.setItem('userPhoto', userPhoto);
            
            maybeShowViewSeasonsButton();
          } catch (err) {
            console.error('Failed to fetch user info:', err);
            userName = 'Unknown Player';
            userPhoto = '';
          }

          signinDiv.style.display = 'none';
          showMainContent();
          
          const storedSeasonCode = localStorage.getItem('currentSeasonCode');
          if (!storedSeasonCode) {
            showNotification('Welcome to HandiRank! Please select or create a season to get started.', 'success');
            setTimeout(() => {
              showSeasonModal();
            }, 500);
          } else {
            loadWorldLeaderboardPublic();
          }
        });
      }
    });


    signinBtn.onclick = () => tokenClient.requestAccessToken();
  }, 100); // retry every 100ms

  // ----- INITIALIZATION -----

  // Initialize tooltips and form features
  addFormTooltips();
  
  // Setup the form preview functionality
  setupRoundFormHandicapPreview();
  
  // Setup the season selection modal
  setupSeasonModal();
  
  // Initialize the app with the login-first flow
  initializeApp();
  setTimeout(() => {
  enhanceCreateSeasonTab();
}, 1000);
// Initialize admin transfer system
if (seasonCode) {
  // Clear old admin notifications from other seasons
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('adminNotified_') && !key.includes(seasonCode)) {
      localStorage.removeItem(key);
    }
  });
  
  // Add periodic status checks (every 30 seconds)
  setInterval(async () => {
    if (seasonCode && userName && isSeasonParticipant) {
      await checkSeasonStatus();
    }
  }, 30000);
}
});
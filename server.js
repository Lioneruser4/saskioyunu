const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const NodeCache = require('node-cache');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;

// SQLite database for game persistence
const db = new sqlite3.Database(':memory:');

// Initialize database
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS games (
      roomId TEXT PRIMARY KEY,
      gameData TEXT,
      lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      userId TEXT PRIMARY KEY,
      userData TEXT,
      lastSeen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// In-memory cache with 5 minute TTL
const gameCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Game state
const games = new Map();
const users = new Map();
const socketToUser = new Map();
const reconnectionTokens = new Map();

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Keep Render awake endpoint
app.get('/ping', (req, res) => {
  res.json({ status: 'alive', timestamp: Date.now() });
});

// WebApp authentication endpoint
app.post('/api/auth', async (req, res) => {
  try {
    const { initData } = req.body;
    
    // Parse Telegram WebApp initData
    const params = new URLSearchParams(initData);
    const userStr = params.get('user');
    
    if (!userStr) {
      return res.status(400).json({ error: 'Invalid Telegram data' });
    }
    
    const userData = JSON.parse(userStr);
    
    // Generate reconnection token
    const token = uuidv4();
    
    // Save user to database
    const user = {
      id: userData.id.toString(),
      username: userData.username || `User_${userData.id}`,
      firstName: userData.first_name,
      lastName: userData.last_name,
      photoUrl: userData.photo_url,
      token: token,
      lastSeen: Date.now()
    };
    
    db.run(
      'INSERT OR REPLACE INTO users (userId, userData, lastSeen) VALUES (?, ?, ?)',
      [user.id, JSON.stringify(user), new Date().toISOString()]
    );
    
    users.set(user.id, user);
    reconnectionTokens.set(token, user.id);
    
    res.json({
      success: true,
      token: token,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        photoUrl: user.photoUrl
      }
    });
    
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Reconnection endpoint
app.post('/api/reconnect', (req, res) => {
  const { token, roomId } = req.body;
  
  const userId = reconnectionTokens.get(token);
  if (!userId) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  const user = users.get(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const game = games.get(roomId);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  
  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      photoUrl: user.photoUrl
    },
    gameState: game.gameState,
    roomId: roomId
  });
});

// Save game state to database
function saveGameState(roomId, game) {
  try {
    const gameData = JSON.stringify({
      ...game,
      players: game.players.map(pId => users.get(pId)),
      lastUpdated: Date.now()
    });
    
    db.run(
      'INSERT OR REPLACE INTO games (roomId, gameData, lastUpdated) VALUES (?, ?, ?)',
      [roomId, gameData, new Date().toISOString()]
    );
    
    gameCache.set(roomId, gameData);
  } catch (error) {
    console.error('Save game error:', error);
  }
}

// Load game state from database
async function loadGameState(roomId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT gameData FROM games WHERE roomId = ?', [roomId], (err, row) => {
      if (err || !row) {
        resolve(null);
        return;
      }
      
      try {
        const gameData = JSON.parse(row.gameData);
        resolve(gameData);
      } catch (error) {
        resolve(null);
      }
    });
  });
}

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send ping every 20 seconds to keep connection alive
  const pingInterval = setInterval(() => {
    socket.emit('ping');
  }, 20000);
  
  socket.on('pong', () => {
    // Connection is alive
  });
  
  socket.on('authenticate', async ({ token, roomId }) => {
    try {
      const userId = reconnectionTokens.get(token);
      if (!userId) {
        socket.emit('auth-error', 'Invalid token');
        return;
      }
      
      let user = users.get(userId);
      if (!user) {
        // Try to load from database
        db.get('SELECT userData FROM users WHERE userId = ?', [userId], (err, row) => {
          if (row) {
            user = JSON.parse(row.userData);
            users.set(userId, user);
          }
        });
        
        if (!user) {
          socket.emit('auth-error', 'User not found');
          return;
        }
      }
      
      user.socketId = socket.id;
      user.lastSeen = Date.now();
      socketToUser.set(socket.id, userId);
      
      let game = null;
      if (roomId) {
        game = games.get(roomId);
        if (!game) {
          // Try to load from database
          const savedGame = await loadGameState(roomId);
          if (savedGame) {
            game = savedGame;
            games.set(roomId, game);
          }
        }
        
        if (game) {
          socket.join(roomId);
          user.roomId = roomId;
          
          // Notify room
          io.to(roomId).emit('player-reconnected', {
            userId: user.id,
            username: user.username
          });
          
          // Send current game state
          socket.emit('game-state', getGameStateForPlayer(roomId, userId));
        }
      }
      
      socket.emit('auth-success', {
        user: {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          photoUrl: user.photoUrl
        },
        currentRoom: roomId,
        gameState: game ? game.gameState : null
      });
      
      if (!roomId) {
        updateLobby();
      }
      
    } catch (error) {
      console.error('Authentication error:', error);
      socket.emit('auth-error', 'Authentication failed');
    }
  });
  
  socket.on('create-room', (settings) => {
    const userId = socketToUser.get(socket.id);
    const user = users.get(userId);
    
    if (!user) {
      socket.emit('error', 'User not found');
      return;
    }
    
    const roomId = uuidv4().substring(0, 6).toUpperCase();
    const game = {
      id: roomId,
      owner: userId,
      players: [userId],
      settings: {
        mafiaCount: Math.max(1, parseInt(settings.mafiaCount) || 2),
        doctorCount: Math.max(0, parseInt(settings.doctorCount) || 1),
        policeCount: Math.max(0, parseInt(settings.policeCount) || 1),
        citizenCount: Math.max(3, parseInt(settings.citizenCount) || 5)
      },
      gameState: 'waiting',
      phase: 'waiting',
      dayNumber: 1,
      votes: {},
      nightActions: {},
      killedTonight: null,
      savedTonight: null,
      chatHistory: [],
      dayChatEnabled: false,
      mafiaChatEnabled: false,
      lastActionTime: Date.now()
    };
    
    games.set(roomId, game);
    user.roomId = roomId;
    
    socket.join(roomId);
    saveGameState(roomId, game);
    
    socket.emit('room-created', { roomId });
    updateRoom(roomId);
    updateLobby();
  });
  
  socket.on('join-room', (roomId) => {
    const userId = socketToUser.get(socket.id);
    const user = users.get(userId);
    
    if (!user) return;
    
    const game = games.get(roomId.toUpperCase());
    if (!game) {
      socket.emit('error', 'Room not found');
      return;
    }
    
    if (game.gameState !== 'waiting') {
      socket.emit('error', 'Game already started');
      return;
    }
    
    const maxPlayers = game.settings.mafiaCount + game.settings.doctorCount + 
                      game.settings.policeCount + game.settings.citizenCount;
    
    if (game.players.length >= maxPlayers) {
      socket.emit('error', 'Room is full');
      return;
    }
    
    if (game.players.includes(userId)) {
      socket.emit('error', 'Already in room');
      return;
    }
    
    game.players.push(userId);
    user.roomId = roomId.toUpperCase();
    socket.join(roomId.toUpperCase());
    
    saveGameState(roomId.toUpperCase(), game);
    updateRoom(roomId.toUpperCase());
    updateLobby();
  });
  
  socket.on('start-game', () => {
    const userId = socketToUser.get(socket.id);
    const game = getGameByUserId(userId);
    
    if (!game || game.owner !== userId || game.gameState !== 'waiting') {
      return;
    }
    
    assignRoles(game);
    game.gameState = 'playing';
    game.phase = 'night';
    game.dayNumber = 1;
    game.lastActionTime = Date.now();
    
    // Notify all players
    io.to(game.id).emit('game-started', {
      roomId: game.id,
      dayNumber: game.dayNumber
    });
    
    // Send role information privately
    game.players.forEach(playerId => {
      const player = users.get(playerId);
      const playerSocket = getSocketByUserId(playerId);
      
      if (playerSocket) {
        playerSocket.emit('your-role', {
          role: player.role,
          description: getRoleDescription(player.role),
          abilities: getRoleAbilities(player.role)
        });
        
        // Send mafia team info to mafias
        if (player.role === 'mafia') {
          const mafiaTeam = game.players
            .filter(pId => users.get(pId).role === 'mafia')
            .map(pId => ({
              id: pId,
              username: users.get(pId).username,
              photoUrl: users.get(pId).photoUrl
            }));
          playerSocket.emit('mafia-team', mafiaTeam);
        }
      }
    });
    
    saveGameState(game.id, game);
    startNightPhase(game);
  });
  
  socket.on('mafia-vote', (targetUserId) => {
    const userId = socketToUser.get(socket.id);
    const user = users.get(userId);
    const game = getGameByUserId(userId);
    
    if (!game || game.phase !== 'night' || user.role !== 'mafia' || !user.isAlive) {
      return;
    }
    
    game.nightActions.mafia = game.nightActions.mafia || {};
    game.nightActions.mafia[userId] = targetUserId;
    
    socket.emit('action-confirmed', 'Hedef seçildi');
    saveGameState(game.id, game);
    
    // Notify other mafias
    game.players.forEach(pId => {
      const pUser = users.get(pId);
      if (pUser.role === 'mafia' && pUser.isAlive && pId !== userId) {
        const pSocket = getSocketByUserId(pId);
        if (pSocket) {
          pSocket.emit('mafia-action', {
            mafiaId: userId,
            mafiaName: user.username,
            targetId: targetUserId
          });
        }
      }
    });
  });
  
  socket.on('doctor-save', (targetUserId) => {
    const userId = socketToUser.get(socket.id);
    const user = users.get(userId);
    const game = getGameByUserId(userId);
    
    if (!game || game.phase !== 'night' || user.role !== 'doctor' || !user.isAlive) {
      return;
    }
    
    game.nightActions.doctor = game.nightActions.doctor || {};
    game.nightActions.doctor[userId] = targetUserId;
    
    socket.emit('action-confirmed', 'Hasta seçildi');
    saveGameState(game.id, game);
  });
  
  socket.on('police-check', (targetUserId) => {
    const userId = socketToUser.get(socket.id);
    const user = users.get(userId);
    const game = getGameByUserId(userId);
    
    if (!game || game.phase !== 'night' || user.role !== 'police' || !user.isAlive) {
      return;
    }
    
    const targetUser = users.get(targetUserId);
    game.nightActions.police = game.nightActions.police || {};
    game.nightActions.police[userId] = targetUserId;
    
    socket.emit('police-result', {
      targetId: targetUserId,
      targetName: targetUser.username,
      isMafia: targetUser.role === 'mafia'
    });
    
    saveGameState(game.id, game);
  });
  
  socket.on('day-vote', (targetUserId) => {
    const userId = socketToUser.get(socket.id);
    const user = users.get(userId);
    const game = getGameByUserId(userId);
    
    if (!game || game.phase !== 'voting' || !user.isAlive) {
      return;
    }
    
    game.votes.day = game.votes.day || {};
    game.votes.day[userId] = targetUserId;
    
    socket.emit('vote-recorded', 'Oy verildi');
    saveGameState(game.id, game);
    
    checkDayVotes(game);
  });
  
  socket.on('send-chat', ({ message, isMafiaChat }) => {
    const userId = socketToUser.get(socket.id);
    const user = users.get(userId);
    const game = getGameByUserId(userId);
    
    if (!game || !user.isAlive) return;
    
    const chatMessage = {
      id: uuidv4(),
      userId: user.id,
      username: user.username,
      message: message,
      timestamp: Date.now(),
      role: user.role,
      isMafiaChat: isMafiaChat || false
    };
    
    // Mafia chat (only at night)
    if (isMafiaChat && game.phase === 'night' && user.role === 'mafia') {
      game.players.forEach(pId => {
        const pUser = users.get(pId);
        if (pUser.role === 'mafia' && pUser.isAlive) {
          const pSocket = getSocketByUserId(pId);
          if (pSocket) {
            pSocket.emit('mafia-chat', chatMessage);
          }
        }
      });
    }
    // Day chat
    else if (!isMafiaChat && game.dayChatEnabled) {
      game.chatHistory.push(chatMessage);
      io.to(game.id).emit('day-chat', chatMessage);
    }
    
    saveGameState(game.id, game);
  });
  
  socket.on('kick-player', (targetUserId) => {
    const userId = socketToUser.get(socket.id);
    const game = getGameByUserId(userId);
    
    if (!game || game.owner !== userId || game.gameState !== 'waiting') {
      return;
    }
    
    const targetUser = users.get(targetUserId);
    if (targetUser) {
      game.players = game.players.filter(id => id !== targetUserId);
      targetUser.roomId = null;
      
      const targetSocket = getSocketByUserId(targetUserId);
      if (targetSocket) {
        targetSocket.leave(game.id);
        targetSocket.emit('kicked', 'Odadan atıldınız');
      }
      
      io.to(game.id).emit('player-kicked', {
        playerId: targetUserId,
        playerName: targetUser.username
      });
      
      saveGameState(game.id, game);
      updateRoom(game.id);
      updateLobby();
    }
  });
  
  socket.on('leave-room', () => {
    const userId = socketToUser.get(socket.id);
    leaveRoom(userId);
  });
  
  socket.on('disconnect', () => {
    clearInterval(pingInterval);
    
    const userId = socketToUser.get(socket.id);
    if (userId) {
      const user = users.get(userId);
      if (user) {
        user.lastSeen = Date.now();
        user.socketId = null;
        
        // Save to database
        db.run(
          'UPDATE users SET userData = ?, lastSeen = ? WHERE userId = ?',
          [JSON.stringify(user), new Date().toISOString(), userId]
        );
      }
      
      const game = getGameByUserId(userId);
      if (game) {
        io.to(game.id).emit('player-disconnected', {
          playerId: userId,
          playerName: user.username
        });
      }
    }
    
    socketToUser.delete(socket.id);
    console.log('Client disconnected:', socket.id);
  });
});

// Game Logic Functions
function getGameByUserId(userId) {
  const user = users.get(userId);
  return user && user.roomId ? games.get(user.roomId) : null;
}

function getSocketByUserId(userId) {
  const user = users.get(userId);
  if (user && user.socketId) {
    return io.sockets.sockets.get(user.socketId);
  }
  return null;
}

function updateLobby() {
  const lobbyGames = Array.from(games.values())
    .filter(game => game.gameState === 'waiting')
    .map(game => ({
      id: game.id,
      owner: users.get(game.owner)?.username,
      players: game.players.length,
      maxPlayers: getMaxPlayers(game.settings),
      settings: game.settings
    }));
  
  io.emit('lobby-update', lobbyGames);
}

function updateRoom(roomId) {
  const game = games.get(roomId);
  if (game) {
    const roomInfo = {
      id: game.id,
      owner: game.owner,
      players: getRoomPlayersInfo(game),
      gameState: game.gameState,
      settings: game.settings,
      phase: game.phase,
      dayNumber: game.dayNumber
    };
    
    io.to(roomId).emit('room-update', roomInfo);
  }
}

function getRoomPlayersInfo(game) {
  return game.players.map(playerId => {
    const user = users.get(playerId);
    return {
      id: playerId,
      username: user.username,
      photoUrl: user.photoUrl,
      isAlive: user.isAlive,
      role: game.gameState === 'playing' ? user.role : null,
      isOwner: game.owner === playerId
    };
  });
}

function getMaxPlayers(settings) {
  return settings.mafiaCount + settings.doctorCount + 
         settings.policeCount + settings.citizenCount;
}

function assignRoles(game) {
  const players = [...game.players];
  const roles = [];
  
  // Add mafias
  for (let i = 0; i < game.settings.mafiaCount; i++) {
    roles.push('mafia');
  }
  
  // Add doctor
  for (let i = 0; i < game.settings.doctorCount; i++) {
    roles.push('doctor');
  }
  
  // Add police
  for (let i = 0; i < game.settings.policeCount; i++) {
    roles.push('police');
  }
  
  // Add citizens
  for (let i = 0; i < game.settings.citizenCount; i++) {
    roles.push('citizen');
  }
  
  // Shuffle roles
  shuffleArray(roles);
  
  players.forEach((playerId, index) => {
    const user = users.get(playerId);
    if (user) {
      user.role = roles[index] || 'citizen';
      user.isAlive = true;
      user.votesAgainst = 0;
    }
  });
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function startNightPhase(game) {
  game.phase = 'night';
  game.votes = {};
  game.nightActions = {};
  game.killedTonight = null;
  game.savedTonight = null;
  game.dayChatEnabled = false;
  game.mafiaChatEnabled = true;
  game.lastActionTime = Date.now();
  
  io.to(game.id).emit('phase-changed', {
    phase: 'night',
    dayNumber: game.dayNumber,
    message: '🌙 Gece vakti... Rollerinizi kullanın!',
    timer: 45
  });
  
  // Enable mafia chat
  game.players.forEach(playerId => {
    const user = users.get(playerId);
    if (user.role === 'mafia' && user.isAlive) {
      const socket = getSocketByUserId(playerId);
      if (socket) {
        socket.emit('mafia-chat-enabled', true);
      }
    }
  });
  
  saveGameState(game.id, game);
  
  // Night phase timer
  setTimeout(() => {
    resolveNightActions(game);
  }, 45000);
}

function resolveNightActions(game) {
  const mafiaVotes = game.nightActions.mafia || {};
  const doctorSaves = game.nightActions.doctor || {};
  
  // Count mafia votes
  const voteCount = {};
  Object.values(mafiaVotes).forEach(targetId => {
    const user = users.get(targetId);
    if (user && user.isAlive) {
      voteCount[targetId] = (voteCount[targetId] || 0) + 1;
    }
  });
  
  // Find player with most votes
  let targetToKill = null;
  let maxVotes = 0;
  Object.entries(voteCount).forEach(([playerId, votes]) => {
    if (votes > maxVotes) {
      maxVotes = votes;
      targetToKill = playerId;
    }
  });
  
  // Check if doctor saved
  let savedPlayer = null;
  Object.values(doctorSaves).forEach(savedId => {
    const user = users.get(savedId);
    if (user && user.isAlive) {
      savedPlayer = savedId;
    }
  });
  
  // Apply night actions
  if (targetToKill) {
    if (targetToKill === savedPlayer) {
      // Doctor saved the player
      game.savedTonight = targetToKill;
      io.to(game.id).emit('night-result', {
        message: `Mafialar ${users.get(targetToKill).username}'ı vurdu ama Doktor onu kurtardı!`,
        savedPlayer: {
          id: targetToKill,
          name: users.get(targetToKill).username
        }
      });
    } else {
      // Player is killed
      const killedUser = users.get(targetToKill);
      killedUser.isAlive = false;
      game.killedTonight = targetToKill;
      
      io.to(game.id).emit('night-result', {
        message: `Sabah oldu! ${killedUser.username} ölü bulundu!`,
        killedPlayer: {
          id: targetToKill,
          name: killedUser.username,
          role: killedUser.role
        }
      });
    }
  } else {
    io.to(game.id).emit('night-result', {
      message: 'Sabah oldu! Kimse öldürülmedi.',
      killedPlayer: null
    });
  }
  
  // Start day phase
  startDayPhase(game);
}

function startDayPhase(game) {
  game.phase = 'day';
  game.dayChatEnabled = true;
  game.mafiaChatEnabled = false;
  game.lastActionTime = Date.now();
  
  io.to(game.id).emit('phase-changed', {
    phase: 'day',
    dayNumber: game.dayNumber,
    message: '☀️ Gündüz vakti! 2 dakika tartışma süresi.',
    timer: 120
  });
  
  saveGameState(game.id, game);
  
  // 2-minute discussion
  setTimeout(() => {
    startVotingPhase(game);
  }, 120000);
}

function startVotingPhase(game) {
  game.phase = 'voting';
  game.dayChatEnabled = false;
  game.votes = {};
  game.lastActionTime = Date.now();
  
  io.to(game.id).emit('phase-changed', {
    phase: 'voting',
    dayNumber: game.dayNumber,
    message: '🗳️ Oylama zamanı! Şüphelendiğiniz kişiyi seçin.',
    timer: 30
  });
  
  saveGameState(game.id, game);
  
  // 30-second voting
  setTimeout(() => {
    resolveVoting(game);
  }, 30000);
}

function resolveVoting(game) {
  const dayVotes = game.votes.day || {};
  const voteCount = {};
  const alivePlayers = game.players.filter(playerId => {
    const user = users.get(playerId);
    return user && user.isAlive;
  });
  
  // Count votes
  Object.values(dayVotes).forEach(targetId => {
    if (alivePlayers.includes(targetId)) {
      voteCount[targetId] = (voteCount[targetId] || 0) + 1;
    }
  });
  
  // Find player with most votes
  let playerToExecute = null;
  let maxVotes = 0;
  Object.entries(voteCount).forEach(([playerId, votes]) => {
    if (votes > maxVotes) {
      maxVotes = votes;
      playerToExecute = playerId;
    }
  });
  
  // Check for ties
  const tiedPlayers = Object.entries(voteCount)
    .filter(([, votes]) => votes === maxVotes)
    .map(([playerId]) => playerId);
  
  if (tiedPlayers.length > 1) {
    // Tie - no one dies
    io.to(game.id).emit('vote-result', {
      message: 'Oylama berabere! Kimse asılmadı.',
      executedPlayer: null
    });
  } else if (playerToExecute && maxVotes > 0) {
    // Execute player
    const executedUser = users.get(playerToExecute);
    executedUser.isAlive = false;
    
    io.to(game.id).emit('vote-result', {
      message: `${executedUser.username} oylama sonucunda asıldı! (Rolü: ${getRoleName(executedUser.role)})`,
      executedPlayer: {
        id: playerToExecute,
        name: executedUser.username,
        role: executedUser.role
      }
    });
  } else {
    // No votes
    io.to(game.id).emit('vote-result', {
      message: 'Kimse oy vermedi!',
      executedPlayer: null
    });
  }
  
  // Check game end
  if (checkGameEnd(game)) {
    return;
  }
  
  // Next night
  game.dayNumber++;
  saveGameState(game.id, game);
  
  setTimeout(() => {
    startNightPhase(game);
  }, 5000);
}

function checkDayVotes(game) {
  const alivePlayers = game.players.filter(playerId => {
    const user = users.get(playerId);
    return user && user.isAlive;
  });
  
  const dayVotes = game.votes.day || {};
  const votedPlayers = Object.keys(dayVotes);
  
  // Check if all alive players have voted
  if (alivePlayers.every(playerId => votedPlayers.includes(playerId))) {
    resolveVoting(game);
  }
}

function checkGameEnd(game) {
  const alivePlayers = game.players.filter(playerId => {
    const user = users.get(playerId);
    return user && user.isAlive;
  });
  
  const aliveMafias = alivePlayers.filter(playerId => 
    users.get(playerId).role === 'mafia'
  );
  
  const aliveCivilians = alivePlayers.filter(playerId => {
    const role = users.get(playerId).role;
    return role === 'citizen' || role === 'doctor' || role === 'police';
  });
  
  let winner = null;
  let message = '';
  
  if (aliveMafias.length === 0) {
    winner = 'citizens';
    message = '🎉 Tebrikler! Vatandaşlar tüm mafiaları yakaladı ve kazandı!';
  } else if (aliveMafias.length >= aliveCivilians.length) {
    winner = 'mafia';
    message = `😈 Mafialar kazandı! ${aliveMafias.length} mafia sokaklarda hâlâ serbest!`;
  }
  
  if (winner) {
    game.gameState = 'ended';
    
    // Reveal all roles
    const playerRoles = game.players.map(playerId => {
      const user = users.get(playerId);
      return {
        id: playerId,
        name: user.username,
        photoUrl: user.photoUrl,
        role: user.role,
        roleName: getRoleName(user.role),
        isAlive: user.isAlive
      };
    });
    
    io.to(game.id).emit('game-ended', {
      winner: winner,
      message: message,
      playerRoles: playerRoles
    });
    
    // Clean up
    game.players.forEach(playerId => {
      const user = users.get(playerId);
      if (user) {
        user.roomId = null;
        user.role = null;
        user.isAlive = true;
        
        const socket = getSocketByUserId(playerId);
        if (socket) {
          socket.leave(game.id);
        }
      }
    });
    
    games.delete(game.id);
    db.run('DELETE FROM games WHERE roomId = ?', [game.id]);
    updateLobby();
    
    return true;
  }
  
  return false;
}

function leaveRoom(userId) {
  const user = users.get(userId);
  if (!user || !user.roomId) return;
  
  const game = games.get(user.roomId);
  if (game) {
    game.players = game.players.filter(id => id !== userId);
    
    if (game.players.length === 0) {
      games.delete(game.id);
      db.run('DELETE FROM games WHERE roomId = ?', [game.id]);
    } else {
      if (game.owner === userId) {
        game.owner = game.players[0];
      }
      
      io.to(game.id).emit('player-left', {
        playerId: userId,
        playerName: user.username
      });
      
      saveGameState(game.id, game);
      updateRoom(game.id);
    }
    
    user.roomId = null;
  }
  
  updateLobby();
}

function getGameStateForPlayer(roomId, userId) {
  const game = games.get(roomId);
  if (!game) return null;
  
  const user = users.get(userId);
  const gameState = {
    roomId: game.id,
    phase: game.phase,
    dayNumber: game.dayNumber,
    gameState: game.gameState,
    players: getRoomPlayersInfo(game),
    chatHistory: game.chatHistory.slice(-50),
    dayChatEnabled: game.dayChatEnabled,
    mafiaChatEnabled: game.mafiaChatEnabled && user.role === 'mafia',
    yourRole: user.role,
    yourStatus: user.isAlive ? 'alive' : 'dead'
  };
  
  return gameState;
}

function getRoleDescription(role) {
  const descriptions = {
    mafia: 'Gece vakti diğer mafialarla birlikte birini öldürebilirsin. Mafia sohbetini kullanarak plan yapabilirsin.',
    doctor: 'Gece vakti birini tedavi edebilirsin. Eğer mafialar o kişiyi vurursa, sen onu kurtarırsın.',
    police: 'Gece vakti birinin mafia olup olmadığını kontrol edebilirsin.',
    citizen: 'Mafiaları bulup oylamada asmaya çalış. Diğer vatandaşlarla işbirliği yap.'
  };
  return descriptions[role] || 'Bilinmeyen rol';
}

function getRoleAbilities(role) {
  const abilities = {
    mafia: ['Gece vakti öldürme', 'Mafia sohbeti', 'Diğer mafiaları görme'],
    doctor: ['Gece vakti tedavi', 'Bir kişiyi kurtarma'],
    police: ['Gece vakti sorgulama', 'Mafia tespit etme'],
    citizen: ['Gündüz oy verme', 'Tartışmaya katılma']
  };
  return abilities[role] || [];
}

function getRoleName(role) {
  const names = {
    mafia: 'Mafia',
    doctor: 'Doktor',
    police: 'Polis',
    citizen: 'Vatandaş'
  };
  return names[role] || 'Bilinmeyen';
}

// Keep Render awake
setInterval(() => {
  http.get(`http://localhost:${PORT}/ping`, (res) => {
    console.log('Ping sent to keep Render awake');
  }).on('error', (err) => {
    console.log('Ping error:', err.message);
  });
}, 30000); // Her 30 saniyede bir

// Cleanup old games
setInterval(() => {
  const now = Date.now();
  Array.from(games.entries()).forEach(([roomId, game]) => {
    if (now - game.lastActionTime > 3600000) { // 1 saat
      games.delete(roomId);
      db.run('DELETE FROM games WHERE roomId = ?', [roomId]);
      console.log('Cleaned up old game:', roomId);
    }
  });
}, 600000); // Her 10 dakikada bir

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Telegram WebApp ready!`);
});

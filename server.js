const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const NodeCache = require('node-cache');
const sqlite3 = require('sqlite3').verbose();
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://telegram.org", "https://cdn.socket.io"],
      connectSrc: ["'self'", "wss://saskioyunu-1.onrender.com", "https://saskioyunu-1.onrender.com"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const db = new sqlite3.Database(':memory:');
db.serialize(() => {
  db.run(`
    CREATE TABLE games (
      roomId TEXT PRIMARY KEY,
      gameData TEXT,
      lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      isDemo INTEGER DEFAULT 0
    )
  `);
  
  db.run(`
    CREATE TABLE users (
      userId TEXT PRIMARY KEY,
      userData TEXT,
      lastSeen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  db.run(`
    CREATE TABLE game_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roomId TEXT,
      event TEXT,
      data TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Cache
const gameCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Game state
const games = new Map();
const users = new Map();
const socketToUser = new Map();
const reconnectionTokens = new Map();
const demoGames = new Map();

// Game constants
const ROLES = {
  MAFIA: 'mafia',
  DOCTOR: 'doctor',
  POLICE: 'police',
  CITIZEN: 'citizen'
};

const PHASES = {
  NIGHT: 'night',
  DAY: 'day',
  VOTING: 'voting',
  WAITING: 'waiting'
};

// Helper functions
function logGameEvent(roomId, event, data) {
  db.run(
    'INSERT INTO game_logs (roomId, event, data) VALUES (?, ?, ?)',
    [roomId, event, JSON.stringify(data)]
  );
}

function saveGameState(roomId, game) {
  try {
    const gameData = JSON.stringify(game);
    db.run(
      'INSERT OR REPLACE INTO games (roomId, gameData, lastUpdated, isDemo) VALUES (?, ?, ?, ?)',
      [roomId, gameData, new Date().toISOString(), game.isDemo ? 1 : 0]
    );
    gameCache.set(roomId, gameData);
  } catch (error) {
    console.error('Save game error:', error);
  }
}

async function loadGameState(roomId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT gameData FROM games WHERE roomId = ?', [roomId], (err, row) => {
      if (err || !row) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(row.gameData));
      } catch (error) {
        resolve(null);
      }
    });
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    games: games.size,
    users: users.size,
    uptime: process.uptime()
  });
});

// Keep alive endpoint
app.get('/ping', (req, res) => {
  res.json({ 
    status: 'alive', 
    timestamp: Date.now(),
    server: 'Mafia Game Server'
  });
});

// Authentication endpoints
app.post('/api/auth/telegram', async (req, res) => {
  try {
    const { initData } = req.body;
    
    // Simple Telegram validation (in production use proper validation)
    const params = new URLSearchParams(initData);
    const userStr = params.get('user');
    
    if (!userStr) {
      return res.status(400).json({ error: 'Invalid Telegram data' });
    }
    
    const userData = JSON.parse(userStr);
    const token = uuidv4();
    
    const user = {
      id: `tg_${userData.id}`,
      telegramId: userData.id,
      username: userData.username || `User_${userData.id}`,
      firstName: userData.first_name,
      lastName: userData.last_name,
      photoUrl: userData.photo_url,
      token: token,
      isDemo: false,
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
    console.error('Telegram auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.post('/api/auth/demo', (req, res) => {
  try {
    const { username, photoUrl } = req.body;
    const token = uuidv4();
    const demoId = `demo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const user = {
      id: demoId,
      username: username || `Demo_${Math.floor(Math.random() * 1000)}`,
      firstName: username || 'Demo Player',
      photoUrl: photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(username || 'Demo')}&background=random`,
      token: token,
      isDemo: true,
      lastSeen: Date.now()
    };
    
    users.set(user.id, user);
    reconnectionTokens.set(token, user.id);
    
    res.json({
      success: true,
      token: token,
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        photoUrl: user.photoUrl,
        isDemo: true
      }
    });
    
  } catch (error) {
    console.error('Demo auth error:', error);
    res.status(500).json({ error: 'Demo authentication failed' });
  }
});

// Game creation endpoint
app.post('/api/game/create', (req, res) => {
  try {
    const { token, settings, isDemo } = req.body;
    const userId = reconnectionTokens.get(token);
    
    if (!userId && !isDemo) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    const roomId = uuidv4().substr(0, 6).toUpperCase();
    const game = {
      id: roomId,
      owner: userId || 'demo_system',
      players: userId ? [userId] : [],
      settings: {
        mafiaCount: Math.min(Math.max(1, parseInt(settings.mafiaCount) || 2), 4),
        doctorCount: Math.min(Math.max(0, parseInt(settings.doctorCount) || 1), 2),
        policeCount: Math.min(Math.max(0, parseInt(settings.policeCount) || 1), 2),
        citizenCount: Math.min(Math.max(3, parseInt(settings.citizenCount) || 5), 10),
        isDemo: isDemo || false,
        selectedRole: settings.selectedRole // For solo play
      },
      gameState: 'waiting',
      phase: PHASES.WAITING,
      dayNumber: 1,
      votes: {},
      nightActions: {},
      killedTonight: null,
      savedTonight: null,
      chatHistory: [],
      dayChatEnabled: false,
      mafiaChatEnabled: false,
      lastActionTime: Date.now(),
      isDemo: isDemo || false,
      botPlayers: []
    };
    
    games.set(roomId, game);
    saveGameState(roomId, game);
    
    if (isDemo) {
      demoGames.set(roomId, game);
    }
    
    res.json({
      success: true,
      roomId: roomId,
      game: game
    });
    
  } catch (error) {
    console.error('Game creation error:', error);
    res.status(500).json({ error: 'Game creation failed' });
  }
});

// Add bot players for demo/solo mode
function addBotPlayers(game, count, excludedRole = null) {
  const roles = [];
  const totalPlayers = game.settings.mafiaCount + game.settings.doctorCount + 
                      game.settings.policeCount + game.settings.citizenCount;
  
  // Add mafias
  for (let i = 0; i < game.settings.mafiaCount; i++) {
    roles.push(ROLES.MAFIA);
  }
  
  // Add doctor
  for (let i = 0; i < game.settings.doctorCount; i++) {
    roles.push(ROLES.DOCTOR);
  }
  
  // Add police
  for (let i = 0; i < game.settings.policeCount; i++) {
    roles.push(ROLES.POLICE);
  }
  
  // Add citizens
  for (let i = 0; i < game.settings.citizenCount; i++) {
    roles.push(ROLES.CITIZEN);
  }
  
  // Remove the player's selected role if playing solo
  if (excludedRole) {
    const index = roles.indexOf(excludedRole);
    if (index > -1) {
      roles.splice(index, 1);
    }
  }
  
  // Create bot players
  for (let i = 0; i < count; i++) {
    const botId = `bot_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 6)}`;
    const bot = {
      id: botId,
      username: `Bot_${i + 1}`,
      firstName: `Bot ${i + 1}`,
      photoUrl: `https://ui-avatars.com/api/?name=Bot${i + 1}&background=random&color=fff`,
      isBot: true,
      role: roles[i] || ROLES.CITIZEN,
      isAlive: true
    };
    
    game.players.push(botId);
    game.botPlayers.push(bot);
    users.set(botId, bot);
  }
}

// Socket.IO setup
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);
  
  // Connection health
  const pingInterval = setInterval(() => {
    socket.emit('ping');
  }, 20000);
  
  socket.on('pong', () => {
    // Connection alive
  });
  
  socket.on('authenticate', async ({ token, roomId }) => {
    try {
      const userId = reconnectionTokens.get(token);
      if (!userId) {
        socket.emit('auth-error', 'Invalid session');
        return;
      }
      
      let user = users.get(userId);
      if (!user) {
        // Try to load from database
        const savedUser = await new Promise((resolve) => {
          db.get('SELECT userData FROM users WHERE userId = ?', [userId], (err, row) => {
            if (row) {
              resolve(JSON.parse(row.userData));
            } else {
              resolve(null);
            }
          });
        });
        
        if (savedUser) {
          user = savedUser;
          users.set(userId, user);
        } else {
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
          const savedGame = await loadGameState(roomId);
          if (savedGame) {
            game = savedGame;
            games.set(roomId, game);
          }
        }
        
        if (game) {
          socket.join(roomId);
          user.roomId = roomId;
          
          // Add player to game if not already
          if (!game.players.includes(userId)) {
            game.players.push(userId);
            saveGameState(roomId, game);
          }
          
          socket.emit('auth-success', {
            user: {
              id: user.id,
              username: user.username,
              firstName: user.firstName,
              photoUrl: user.photoUrl,
              isDemo: user.isDemo
            },
            currentRoom: roomId,
            gameState: game.gameState
          });
          
          // Send game state
          if (game.gameState === 'playing') {
            socket.emit('game-state', getGameStateForPlayer(roomId, userId));
          } else {
            updateRoom(roomId);
          }
          
          logGameEvent(roomId, 'player_reconnected', { userId, username: user.username });
        }
      } else {
        socket.emit('auth-success', {
          user: {
            id: user.id,
            username: user.username,
            firstName: user.firstName,
            photoUrl: user.photoUrl,
            isDemo: user.isDemo
          },
          currentRoom: null,
          gameState: null
        });
      }
      
      updateLobby();
      
    } catch (error) {
      console.error('Auth error:', error);
      socket.emit('auth-error', 'Authentication failed');
    }
  });
  
  socket.on('create-room', (settings) => {
    const userId = socketToUser.get(socket.id);
    const user = users.get(userId);
    
    if (!user && !settings.isDemo) {
      socket.emit('error', 'User not found');
      return;
    }
    
    const roomId = uuidv4().substr(0, 6).toUpperCase();
    const game = {
      id: roomId,
      owner: userId || 'demo_system',
      players: userId ? [userId] : [],
      settings: {
        mafiaCount: Math.min(Math.max(1, parseInt(settings.mafiaCount) || 2), 4),
        doctorCount: Math.min(Math.max(0, parseInt(settings.doctorCount) || 1), 2),
        policeCount: Math.min(Math.max(0, parseInt(settings.policeCount) || 1), 2),
        citizenCount: Math.min(Math.max(3, parseInt(settings.citizenCount) || 5), 10),
        isDemo: settings.isDemo || false,
        selectedRole: settings.selectedRole
      },
      gameState: 'waiting',
      phase: PHASES.WAITING,
      dayNumber: 1,
      votes: {},
      nightActions: {},
      killedTonight: null,
      savedTonight: null,
      chatHistory: [],
      dayChatEnabled: false,
      mafiaChatEnabled: false,
      lastActionTime: Date.now(),
      isDemo: settings.isDemo || false,
      botPlayers: []
    };
    
    games.set(roomId, game);
    if (game.isDemo) {
      demoGames.set(roomId, game);
    }
    
    if (userId) {
      user.roomId = roomId;
    }
    
    socket.join(roomId);
    saveGameState(roomId, game);
    
    socket.emit('room-created', { roomId });
    updateRoom(roomId);
    updateLobby();
    
    logGameEvent(roomId, 'room_created', { 
      userId, 
      settings: game.settings,
      isDemo: game.isDemo 
    });
  });
  
  socket.on('join-room', (roomId) => {
    const userId = socketToUser.get(socket.id);
    const user = users.get(userId);
    
    if (!user) {
      socket.emit('error', 'Please authenticate first');
      return;
    }
    
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
    
    logGameEvent(roomId, 'player_joined', { userId, username: user.username });
  });
  
  socket.on('start-game', ({ withBots = false, selectedRole = null }) => {
    const userId = socketToUser.get(socket.id);
    const game = getGameByUserId(userId);
    
    if (!game || game.owner !== userId) {
      return;
    }
    
    // For solo play with bots
    if (withBots || game.isDemo) {
      const totalPlayers = game.settings.mafiaCount + game.settings.doctorCount + 
                          game.settings.policeCount + game.settings.citizenCount;
      const botCount = totalPlayers - game.players.length;
      
      if (botCount > 0) {
        addBotPlayers(game, botCount, selectedRole);
      }
    }
    
    assignRoles(game, selectedRole);
    game.gameState = 'playing';
    game.phase = PHASES.NIGHT;
    game.dayNumber = 1;
    game.lastActionTime = Date.now();
    
    // Notify all players
    io.to(game.id).emit('game-started', {
      roomId: game.id,
      dayNumber: game.dayNumber,
      totalPlayers: game.players.length
    });
    
    // Send role information
    game.players.forEach(playerId => {
      const player = users.get(playerId);
      if (!player) return;
      
      const playerSocket = getSocketByUserId(playerId);
      if (playerSocket) {
        playerSocket.emit('your-role', {
          role: player.role,
          description: getRoleDescription(player.role),
          abilities: getRoleAbilities(player.role)
        });
        
        if (player.role === ROLES.MAFIA) {
          const mafiaTeam = game.players
            .filter(pId => {
              const p = users.get(pId);
              return p && p.role === ROLES.MAFIA;
            })
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
    logGameEvent(game.id, 'game_started', { 
      players: game.players.length,
      withBots: withBots,
      selectedRole: selectedRole 
    });
    
    startNightPhase(game);
  });
  
  // Game actions
  socket.on('mafia-vote', (targetUserId) => {
    const userId = socketToUser.get(socket.id);
    const user = users.get(userId);
    const game = getGameByUserId(userId);
    
    if (!game || game.phase !== PHASES.NIGHT || user.role !== ROLES.MAFIA || !user.isAlive) {
      return;
    }
    
    game.nightActions.mafia = game.nightActions.mafia || {};
    game.nightActions.mafia[userId] = targetUserId;
    
    socket.emit('action-confirmed', 'Hedef seçildi');
    saveGameState(game.id, game);
    
    // Process bot actions
    processBotActions(game);
  });
  
  socket.on('doctor-save', (targetUserId) => {
    const userId = socketToUser.get(socket.id);
    const user = users.get(userId);
    const game = getGameByUserId(userId);
    
    if (!game || game.phase !== PHASES.NIGHT || user.role !== ROLES.DOCTOR || !user.isAlive) {
      return;
    }
    
    game.nightActions.doctor = game.nightActions.doctor || {};
    game.nightActions.doctor[userId] = targetUserId;
    
    socket.emit('action-confirmed', 'Hasta seçildi');
    saveGameState(game.id, game);
    
    processBotActions(game);
  });
  
  socket.on('police-check', (targetUserId) => {
    const userId = socketToUser.get(socket.id);
    const user = users.get(userId);
    const game = getGameByUserId(userId);
    
    if (!game || game.phase !== PHASES.NIGHT || user.role !== ROLES.POLICE || !user.isAlive) {
      return;
    }
    
    const targetUser = users.get(targetUserId);
    game.nightActions.police = game.nightActions.police || {};
    game.nightActions.police[userId] = targetUserId;
    
    socket.emit('police-result', {
      targetId: targetUserId,
      targetName: targetUser.username,
      isMafia: targetUser.role === ROLES.MAFIA
    });
    
    saveGameState(game.id, game);
    processBotActions(game);
  });
  
  socket.on('day-vote', (targetUserId) => {
    const userId = socketToUser.get(socket.id);
    const user = users.get(userId);
    const game = getGameByUserId(userId);
    
    if (!game || game.phase !== PHASES.VOTING || !user.isAlive) {
      return;
    }
    
    game.votes.day = game.votes.day || {};
    game.votes.day[userId] = targetUserId;
    
    socket.emit('vote-recorded', 'Oy verildi');
    saveGameState(game.id, game);
    
    processBotActions(game);
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
    
    // Mafia chat
    if (isMafiaChat && game.phase === PHASES.NIGHT && user.role === ROLES.MAFIA) {
      game.players.forEach(pId => {
        const pUser = users.get(pId);
        if (pUser && pUser.role === ROLES.MAFIA && pUser.isAlive) {
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

// Game logic functions
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
    .filter(game => game.gameState === 'waiting' && !game.isDemo)
    .map(game => ({
      id: game.id,
      owner: users.get(game.owner)?.username || 'System',
      players: game.players.filter(id => !users.get(id)?.isBot).length,
      botPlayers: game.players.filter(id => users.get(id)?.isBot).length,
      maxPlayers: getMaxPlayers(game.settings),
      settings: game.settings
    }));
  
  io.emit('lobby-update', lobbyGames);
}

function updateRoom(roomId) {
  const game = games.get(roomId);
  if (!game) return;
  
  const roomInfo = {
    id: game.id,
    owner: game.owner,
    players: getRoomPlayersInfo(game),
    gameState: game.gameState,
    settings: game.settings,
    phase: game.phase,
    dayNumber: game.dayNumber,
    isDemo: game.isDemo
  };
  
  io.to(roomId).emit('room-update', roomInfo);
}

function getRoomPlayersInfo(game) {
  return game.players.map(playerId => {
    const user = users.get(playerId);
    if (!user) return null;
    
    return {
      id: playerId,
      username: user.username,
      photoUrl: user.photoUrl,
      isAlive: user.isAlive !== false,
      role: game.gameState === 'playing' ? user.role : null,
      isOwner: game.owner === playerId,
      isBot: user.isBot || false
    };
  }).filter(Boolean);
}

function getMaxPlayers(settings) {
  return settings.mafiaCount + settings.doctorCount + 
         settings.policeCount + settings.citizenCount;
}

function assignRoles(game, selectedRole = null) {
  const humanPlayers = game.players.filter(id => !users.get(id)?.isBot);
  const botPlayers = game.players.filter(id => users.get(id)?.isBot);
  
  const roles = [];
  
  // Add roles based on settings
  for (let i = 0; i < game.settings.mafiaCount; i++) {
    roles.push(ROLES.MAFIA);
  }
  for (let i = 0; i < game.settings.doctorCount; i++) {
    roles.push(ROLES.DOCTOR);
  }
  for (let i = 0; i < game.settings.policeCount; i++) {
    roles.push(ROLES.POLICE);
  }
  for (let i = 0; i < game.settings.citizenCount; i++) {
    roles.push(ROLES.CITIZEN);
  }
  
  // Shuffle roles
  shuffleArray(roles);
  
  // Assign selected role to human player if specified
  let assignedRoles = [...roles];
  if (selectedRole && humanPlayers.length > 0) {
    const selectedIndex = assignedRoles.indexOf(selectedRole);
    if (selectedIndex > -1) {
      assignedRoles.splice(selectedIndex, 1);
      const user = users.get(humanPlayers[0]);
      if (user) {
        user.role = selectedRole;
        user.isAlive = true;
      }
    }
  }
  
  // Assign remaining roles
  let roleIndex = 0;
  game.players.forEach(playerId => {
    const user = users.get(playerId);
    if (!user || user.role) return; // Skip if already assigned (selected role)
    
    user.role = assignedRoles[roleIndex] || ROLES.CITIZEN;
    user.isAlive = true;
    roleIndex++;
  });
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function startNightPhase(game) {
  game.phase = PHASES.NIGHT;
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
    timer: 45,
    canChat: false
  });
  
  // Enable mafia chat for mafias
  game.players.forEach(playerId => {
    const user = users.get(playerId);
    if (user && user.role === ROLES.MAFIA && user.isAlive) {
      const socket = getSocketByUserId(playerId);
      if (socket) {
        socket.emit('mafia-chat-enabled', true);
      }
    }
  });
  
  saveGameState(game.id, game);
  logGameEvent(game.id, 'night_started', { dayNumber: game.dayNumber });
  
  // Night phase timer
  const nightTimer = setTimeout(() => {
    resolveNightActions(game);
  }, 45000);
  
  // Store timer reference for cleanup
  game.nightTimer = nightTimer;
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
        },
        killedPlayer: null
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
        },
        savedPlayer: null
      });
    }
  } else {
    io.to(game.id).emit('night-result', {
      message: 'Sabah oldu! Kimse öldürülmedi.',
      killedPlayer: null,
      savedPlayer: null
    });
  }
  
  // Start day phase
  setTimeout(() => {
    startDayPhase(game);
  }, 5000);
}

function startDayPhase(game) {
  game.phase = PHASES.DAY;
  game.dayChatEnabled = true;
  game.mafiaChatEnabled = false;
  game.lastActionTime = Date.now();
  
  io.to(game.id).emit('phase-changed', {
    phase: 'day',
    dayNumber: game.dayNumber,
    message: '☀️ Gündüz vakti! 2 dakika tartışma süresi.',
    timer: 120,
    canChat: true
  });
  
  saveGameState(game.id, game);
  logGameEvent(game.id, 'day_started', { dayNumber: game.dayNumber });
  
  // 2-minute discussion
  const dayTimer = setTimeout(() => {
    startVotingPhase(game);
  }, 120000);
  
  game.dayTimer = dayTimer;
}

function startVotingPhase(game) {
  game.phase = PHASES.VOTING;
  game.dayChatEnabled = false;
  game.votes = {};
  game.lastActionTime = Date.now();
  
  io.to(game.id).emit('phase-changed', {
    phase: 'voting',
    dayNumber: game.dayNumber,
    message: '🗳️ Oylama zamanı! Şüphelendiğiniz kişiyi seçin.',
    timer: 30,
    canChat: false
  });
  
  saveGameState(game.id, game);
  logGameEvent(game.id, 'voting_started', { dayNumber: game.dayNumber });
  
  // 30-second voting
  const votingTimer = setTimeout(() => {
    resolveVoting(game);
  }, 30000);
  
  game.votingTimer = votingTimer;
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
  
  let resultMessage = '';
  let executedPlayer = null;
  
  if (tiedPlayers.length > 1) {
    resultMessage = 'Oylama berabere! Kimse asılmadı.';
  } else if (playerToExecute && maxVotes > 0) {
    const executedUser = users.get(playerToExecute);
    executedUser.isAlive = false;
    executedPlayer = {
      id: playerToExecute,
      name: executedUser.username,
      role: executedUser.role
    };
    resultMessage = `${executedUser.username} oylama sonucunda asıldı! (Rolü: ${getRoleName(executedUser.role)})`;
  } else {
    resultMessage = 'Kimse oy vermedi!';
  }
  
  io.to(game.id).emit('vote-result', {
    message: resultMessage,
    executedPlayer: executedPlayer
  });
  
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
    return user && user.isAlive && !user.isBot;
  });
  
  const dayVotes = game.votes.day || {};
  const votedPlayers = Object.keys(dayVotes);
  
  // Check if all alive human players have voted
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
    users.get(playerId).role === ROLES.MAFIA
  );
  
  const aliveCivilians = alivePlayers.filter(playerId => {
    const role = users.get(playerId).role;
    return role === ROLES.CITIZEN || role === ROLES.DOCTOR || role === ROLES.POLICE;
  });
  
  let winner = null;
  let message = '';
  
  if (aliveMafias.length === 0) {
    winner = 'citizens';
    message = '🎉 Tebrikler! Vatandaşlar tüm mafiaları yakaladı ve kazandı!';
  } else if (aliveMafias.length >= aliveCivilians.length) {
    winner = 'mafia';
    const mafiaNames = aliveMafias.map(id => users.get(id).username).join(', ');
    message = `😈 Mafialar kazandı! ${aliveMafias.length} mafia (${mafiaNames}) sokaklarda hâlâ serbest!`;
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
        isAlive: user.isAlive,
        isBot: user.isBot || false
      };
    });
    
    io.to(game.id).emit('game-ended', {
      winner: winner,
      message: message,
      playerRoles: playerRoles,
      dayNumber: game.dayNumber
    });
    
    // Clean up timers
    if (game.nightTimer) clearTimeout(game.nightTimer);
    if (game.dayTimer) clearTimeout(game.dayTimer);
    if (game.votingTimer) clearTimeout(game.votingTimer);
    
    // Clean up
    game.players.forEach(playerId => {
      const user = users.get(playerId);
      if (user && !user.isBot) {
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
    if (game.isDemo) {
      demoGames.delete(game.id);
    }
    db.run('DELETE FROM games WHERE roomId = ?', [game.id]);
    
    logGameEvent(game.id, 'game_ended', { winner, message });
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
      if (game.isDemo) demoGames.delete(game.id);
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
    mafiaChatEnabled: game.mafiaChatEnabled && user.role === ROLES.MAFIA,
    yourRole: user.role,
    yourStatus: user.isAlive ? 'alive' : 'dead',
    isDemo: game.isDemo
  };
  
  return gameState;
}

function processBotActions(game) {
  // Process bot actions based on game phase and role
  game.players.forEach(playerId => {
    const user = users.get(playerId);
    if (!user || !user.isBot || !user.isAlive) return;
    
    // Bot logic based on role
    switch (user.role) {
      case ROLES.MAFIA:
        processMafiaBot(game, user);
        break;
      case ROLES.DOCTOR:
        processDoctorBot(game, user);
        break;
      case ROLES.POLICE:
        processPoliceBot(game, user);
        break;
      case ROLES.CITIZEN:
        processCitizenBot(game, user);
        break;
    }
  });
}

function processMafiaBot(game, bot) {
  if (game.phase !== PHASES.NIGHT) return;
  
  // Choose a random alive non-mafia player
  const targets = game.players.filter(id => {
    const targetUser = users.get(id);
    return targetUser && targetUser.isAlive && targetUser.role !== ROLES.MAFIA;
  });
  
  if (targets.length > 0) {
    const randomTarget = targets[Math.floor(Math.random() * targets.length)];
    game.nightActions.mafia = game.nightActions.mafia || {};
    game.nightActions.mafia[bot.id] = randomTarget;
  }
}

function processDoctorBot(game, bot) {
  if (game.phase !== PHASES.NIGHT) return;
  
  // Choose a random alive player (including self)
  const targets = game.players.filter(id => {
    const targetUser = users.get(id);
    return targetUser && targetUser.isAlive;
  });
  
  if (targets.length > 0) {
    const randomTarget = targets[Math.floor(Math.random() * targets.length)];
    game.nightActions.doctor = game.nightActions.doctor || {};
    game.nightActions.doctor[bot.id] = randomTarget;
  }
}

function processPoliceBot(game, bot) {
  if (game.phase !== PHASES.NIGHT) return;
  
  // Choose a random alive player
  const targets = game.players.filter(id => {
    const targetUser = users.get(id);
    return targetUser && targetUser.isAlive && id !== bot.id;
  });
  
  if (targets.length > 0) {
    const randomTarget = targets[Math.floor(Math.random() * targets.length)];
    game.nightActions.police = game.nightActions.police || {};
    game.nightActions.police[bot.id] = randomTarget;
  }
}

function processCitizenBot(game, bot) {
  if (game.phase !== PHASES.VOTING) return;
  
  // Vote for a random alive player (not self)
  const targets = game.players.filter(id => {
    const targetUser = users.get(id);
    return targetUser && targetUser.isAlive && id !== bot.id;
  });
  
  if (targets.length > 0) {
    const randomTarget = targets[Math.floor(Math.random() * targets.length)];
    game.votes.day = game.votes.day || {};
    game.votes.day[bot.id] = randomTarget;
  }
}

function getRoleDescription(role) {
  const descriptions = {
    [ROLES.MAFIA]: 'Gece vakti diğer mafialarla birlikte birini öldürebilirsin. Mafia sohbetini kullanarak plan yapabilirsin.',
    [ROLES.DOCTOR]: 'Gece vakti birini tedavi edebilirsin. Eğer mafialar o kişiyi vurursa, sen onu kurtarırsın.',
    [ROLES.POLICE]: 'Gece vakti birinin mafia olup olmadığını kontrol edebilirsin.',
    [ROLES.CITIZEN]: 'Mafiaları bulup oylamada asmaya çalış. Diğer vatandaşlarla işbirliği yap.'
  };
  return descriptions[role] || 'Bilinmeyen rol';
}

function getRoleAbilities(role) {
  const abilities = {
    [ROLES.MAFIA]: ['Gece vakti öldürme', 'Mafia sohbeti', 'Diğer mafiaları görme'],
    [ROLES.DOCTOR]: ['Gece vakti tedavi', 'Bir kişiyi kurtarma'],
    [ROLES.POLICE]: ['Gece vakti sorgulama', 'Mafia tespit etme'],
    [ROLES.CITIZEN]: ['Gündüz oy verme', 'Tartışmaya katılma']
  };
  return abilities[role] || [];
}

function getRoleName(role) {
  const names = {
    [ROLES.MAFIA]: 'Mafia',
    [ROLES.DOCTOR]: 'Doktor',
    [ROLES.POLICE]: 'Polis',
    [ROLES.CITIZEN]: 'Vatandaş'
  };
  return names[role] || 'Bilinmeyen';
}

// Cleanup old games
setInterval(() => {
  const now = Date.now();
  const oneHour = 3600000;
  
  Array.from(games.entries()).forEach(([roomId, game]) => {
    if (now - game.lastActionTime > oneHour) {
      games.delete(roomId);
      demoGames.delete(roomId);
      db.run('DELETE FROM games WHERE roomId = ?', [roomId]);
      console.log('Cleaned up old game:', roomId);
    }
  });
}, 600000);

// Keep Render awake
setInterval(() => {
  const keepAliveUrl = 'https://saskioyunu-1.onrender.com/ping';
  fetch(keepAliveUrl).catch(() => {
    console.log('Keep-alive ping failed');
  });
}, 25000);

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Mafia Game Server running on port ${PORT}`);
  console.log(`🔗 Server URL: https://saskioyunu-1.onrender.com`);
  console.log(`📱 Telegram WebApp ready!`);
  console.log(`🎮 Demo mode enabled!`);
});

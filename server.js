const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || 'YOUR_BOT_TOKEN_HERE';
let telegramBot = null;

if (TELEGRAM_TOKEN !== 'YOUR_BOT_TOKEN_HERE') {
  telegramBot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
}

// Oyuncular və otaqlar
const players = new Map();
const rooms = new Map();
const activeGames = new Map();
let roomCounter = 1000;

// Among Us rəngləri
const colors = [
  { id: 0, name: 'Qırmızı', code: '#c51111', emoji: '🔴' },
  { id: 1, name: 'Mavi', code: '#132fd2', emoji: '🔵' },
  { id: 2, name: 'Yaşıl', code: '#117f2d', emoji: '🟢' },
  { id: 3, name: 'Çəhrayı', code: '#ed54ba', emoji: '🌸' },
  { id: 4, name: 'Narıncı', code: '#ef7d0d', emoji: '🟠' },
  { id: 5, name: 'Sarı', code: '#f5f557', emoji: '🟡' },
  { id: 6, name: 'Qara', code: '#3f474e', emoji: '⚫' },
  { id: 7, name: 'Ağ', code: '#d6e0f0', emoji: '⚪' },
  { id: 8, name: 'Bənövşəyi', code: '#6b2fbb', emoji: '🟣' },
  { id: 9, name: 'Qəhvəyi', code: '#71491e', emoji: '🟤' },
  { id: 10, name: 'Firuzəyi', code: '#28a79d', emoji: '🧊' },
  { id: 11, name: 'Limon', code: '#4baf3b', emoji: '🍋' }
];

// Xəritələr
const maps = [
  { id: 'skeld', name: 'The Skeld', maxPlayers: 10, tasks: 10 },
  { id: 'mira', name: 'MIRA HQ', maxPlayers: 10, tasks: 8 },
  { id: 'polus', name: 'Polus', maxPlayers: 12, tasks: 12 },
  { id: 'airship', name: 'The Airship', maxPlayers: 15, tasks: 15 }
];

// Tapşırıqlar
const tasks = {
  skeld: [
    { id: 'upload', name: 'Məlumat Yüklə', location: 'Admin', duration: 10, type: 'common' },
    { id: 'download', name: 'Məlumat Endir', location: 'Əlaqə', duration: 8, type: 'common' },
    { id: 'wires', name: 'Kablolar', location: 'Elektrik', duration: 5, type: 'short' },
    { id: 'key', name: 'Açar Kart', location: 'Giriş', duration: 3, type: 'short' },
    { id: 'engine', name: 'Mühərriki Tənzimlə', location: 'Mühərrik Otağı', duration: 7, type: 'common' },
    { id: 'trash', name: 'Zibili At', location: 'O2', duration: 4, type: 'short' },
    { id: 'scan', name: 'Bədən Skanneri', location: 'Tibb', duration: 12, type: 'long' },
    { id: 'stabilize', name: 'Gəmini Sabitlə', location: 'Təyyarə', duration: 9, type: 'common' }
  ],
  mira: [
    { id: 'temp', name: 'Temperaturu Tənzimlə', location: 'Laboratoriya', duration: 9, type: 'common' },
    { id: 'id', name: 'ID Skanneri', location: 'Ofis', duration: 4, type: 'short' },
    { id: 'reactor', name: 'Reaktor Başlat', location: 'Reaktor', duration: 15, type: 'long' }
  ],
  polus: [
    { id: 'weather', name: 'Havanı Tənzimlə', location: 'Ofis', duration: 8, type: 'common' },
    { id: 'record', name: 'Qeydləri Sırala', location: 'Arxiv', duration: 6, type: 'short' },
    { id: 'artifacts', name: 'Artefaktları Təhlil Et', location: 'Laboratoriya', duration: 11, type: 'long' }
  ],
  airship: [
    { id: 'unlock', name: 'Qapını Aç', location: 'Mətbəx', duration: 5, type: 'short' },
    { id: 'records', name: 'Qeydləri Yoxla', location: 'Arxiv', duration: 7, type: 'common' },
    { id: 'engine', name: 'Mühərriki Tənzimlə', location: 'Mühərrik', duration: 10, type: 'common' }
  ]
};

// Botlar
class Bot {
  constructor(name, color) {
    this.id = 'bot_' + Math.random().toString(36).substr(2, 9);
    this.name = name;
    this.color = color;
    this.isBot = true;
    this.isAlive = true;
    this.role = 'crewmate';
    this.tasks = [];
    this.location = 'cafeteria';
    this.position = { x: 0, y: 0 };
  }
}

// Oyun otağı klassı
class GameRoom {
  constructor(id, name, hostId, mapId, maxPlayers) {
    this.id = id;
    this.name = name;
    this.hostId = hostId;
    this.mapId = mapId;
    this.maxPlayers = maxPlayers;
    this.players = [];
    this.bots = [];
    this.status = 'waiting'; // waiting, starting, inprogress, meeting, ended
    this.settings = {
      impostorCount: 1,
      discussionTime: 60,
      votingTime: 30,
      killCooldown: 30,
      emergencyMeetings: 1,
      visualTasks: true,
      confirmEjects: true
    };
    this.meeting = null;
    this.votes = new Map();
    this.deadPlayers = [];
    this.tasksCompleted = 0;
    this.totalTasks = maps.find(m => m.id === mapId).tasks;
  }

  addPlayer(player) {
    if (this.players.length >= this.maxPlayers) return false;
    
    // Boş rəng tap
    const usedColors = [...this.players, ...this.bots].map(p => p.color.id);
    const availableColor = colors.find(c => !usedColors.includes(c.id));
    
    if (availableColor) {
      player.color = availableColor;
      this.players.push(player);
      return true;
    }
    return false;
  }

  addBot() {
    if (this.players.length + this.bots.length >= this.maxPlayers) return false;
    
    const usedColors = [...this.players, ...this.bots].map(p => p.color.id);
    const availableColor = colors.find(c => !usedColors.includes(c.id));
    
    if (availableColor) {
      const botNames = ['Bot Ali', 'Bot Aydın', 'Bot Nərmin', 'Bot Orxan', 'Bot Ləman', 'Bot Elnur', 'Bot Sevda', 'Bot Rəşad'];
      const bot = new Bot(
        botNames[Math.floor(Math.random() * botNames.length)],
        availableColor
      );
      this.bots.push(bot);
      return true;
    }
    return false;
  }

  removeBot() {
    if (this.bots.length > 0) {
      this.bots.pop();
      return true;
    }
    return false;
  }

  startGame() {
    if (this.players.length < 2) return false;
    
    this.status = 'starting';
    
    // Rolları təyin et
    const impostorCount = Math.min(this.settings.impostorCount, Math.floor(this.players.length / 3));
    const allPlayers = [...this.players];
    
    // İmpostorları seç
    for (let i = 0; i < impostorCount; i++) {
      const randomIndex = Math.floor(Math.random() * allPlayers.length);
      allPlayers[randomIndex].role = 'impostor';
      allPlayers.splice(randomIndex, 1);
    }
    
    // Qalanlar crewmate
    allPlayers.forEach(player => {
      player.role = 'crewmate';
    });
    
    // Botları da əlavə et
    this.bots.forEach(bot => {
      bot.role = 'crewmate';
    });
    
    // Tapşırıqları payla
    this.assignTasks();
    
    return true;
  }

  assignTasks() {
    const mapTasks = tasks[this.mapId];
    const taskCount = Math.min(4, mapTasks.length);
    
    this.players.forEach(player => {
      if (player.role === 'crewmate') {
        player.tasks = [];
        const shuffled = [...mapTasks].sort(() => Math.random() - 0.5);
        
        for (let i = 0; i < taskCount; i++) {
          player.tasks.push({
            ...shuffled[i],
            completed: false,
            progress: 0
          });
        }
      } else {
        player.tasks = [];
      }
    });
  }

  getPlayerCount() {
    return this.players.length + this.bots.length;
  }

  getAliveCount() {
    const alivePlayers = this.players.filter(p => p.isAlive).length;
    const aliveBots = this.bots.filter(b => b.isAlive).length;
    return alivePlayers + aliveBots;
  }

  getImpostorCount() {
    return this.players.filter(p => p.role === 'impostor' && p.isAlive).length;
  }
}

app.use(express.static('.'));

// API endpointləri
app.get('/api/maps', (req, res) => {
  res.json(maps);
});

app.get('/api/rooms', (req, res) => {
  const roomsList = Array.from(rooms.values()).map(room => ({
    id: room.id,
    name: room.name,
    host: room.hostId,
    map: room.mapId,
    playerCount: room.getPlayerCount(),
    maxPlayers: room.maxPlayers,
    status: room.status,
    hasPassword: room.password ? true : false
  }));
  res.json(roomsList);
});

// WebSocket bağlantısı
io.on('connection', (socket) => {
  console.log('Yeni oyunçu bağlandı:', socket.id);

  socket.on('register', (userData) => {
    const playerId = socket.id;
    const player = {
      id: playerId,
      socketId: playerId,
      telegramId: userData.telegramId,
      name: userData.name,
      photo: userData.photo,
      color: null,
      isAlive: true,
      role: null,
      tasks: [],
      location: 'lobby',
      position: { x: 0, y: 0 },
      vote: null,
      isHost: false
    };
    
    players.set(playerId, player);
    socket.playerId = playerId;
    
    // Boş otaqları göndər
    updateRoomList();
    
    socket.emit('registered', {
      success: true,
      playerId: playerId,
      player: player,
      colors: colors,
      maps: maps
    });
  });

  socket.on('createRoom', (roomData) => {
    const player = players.get(socket.playerId);
    if (!player) return;
    
    roomCounter++;
    const roomId = roomCounter.toString();
    const room = new GameRoom(
      roomId,
      roomData.name || `${player.name}'in Otağı`,
      socket.playerId,
      roomData.mapId || 'skeld',
      roomData.maxPlayers || 10
    );
    
    if (roomData.password) {
      room.password = roomData.password;
    }
    
    // Oyunçuya host statusu ver
    player.isHost = true;
    
    // Otağa qoşul
    room.addPlayer(player);
    player.currentRoom = roomId;
    
    rooms.set(roomId, room);
    socket.join(roomId);
    
    // Otaq məlumatlarını göndər
    socket.emit('roomCreated', {
      roomId: roomId,
      room: getRoomInfo(room)
    });
    
    updateRoomList();
    updateRoomPlayers(roomId);
  });

  socket.on('joinRoom', (data) => {
    const player = players.get(socket.playerId);
    const room = rooms.get(data.roomId);
    
    if (!player || !room) return;
    
    // Şifrə yoxla
    if (room.password && room.password !== data.password) {
      socket.emit('joinError', { message: 'Yanlış şifrə!' });
      return;
    }
    
    // Otaq doludursa
    if (room.getPlayerCount() >= room.maxPlayers) {
      socket.emit('joinError', { message: 'Otaq doludur!' });
      return;
    }
    
    // Köhnə otaqdan çıx
    if (player.currentRoom) {
      leaveRoom(socket.playerId);
    }
    
    // Yeni otağa qoşul
    if (room.addPlayer(player)) {
      player.currentRoom = room.id;
      socket.join(room.id);
      
      socket.emit('roomJoined', {
        roomId: room.id,
        room: getRoomInfo(room)
      });
      
      // Digər oyunçulara bildir
      socket.to(room.id).emit('playerJoined', {
        player: getPlayerInfo(player)
      });
      
      updateRoomPlayers(room.id);
      updateRoomList();
    }
  });

  socket.on('leaveRoom', () => {
    leaveRoom(socket.playerId);
  });

  socket.on('addBot', () => {
    const player = players.get(socket.playerId);
    if (!player || !player.currentRoom) return;
    
    const room = rooms.get(player.currentRoom);
    if (!room || room.hostId !== socket.playerId) return;
    
    if (room.addBot()) {
      updateRoomPlayers(room.id);
    }
  });

  socket.on('removeBot', () => {
    const player = players.get(socket.playerId);
    if (!player || !player.currentRoom) return;
    
    const room = rooms.get(player.currentRoom);
    if (!room || room.hostId !== socket.playerId) return;
    
    if (room.removeBot()) {
      updateRoomPlayers(room.id);
    }
  });

  socket.on('startGame', () => {
    const player = players.get(socket.playerId);
    if (!player || !player.currentRoom) return;
    
    const room = rooms.get(player.currentRoom);
    if (!room || room.hostId !== socket.playerId) return;
    
    if (room.startGame()) {
      room.status = 'inprogress';
      
      // Bütün oyunçulara oyun başladı bildir
      io.to(room.id).emit('gameStarted', {
        role: player.role,
        tasks: player.tasks,
        impostorCount: room.settings.impostorCount,
        map: room.mapId
      });
      
      updateRoomList();
    }
  });

  socket.on('movePlayer', (data) => {
    const player = players.get(socket.playerId);
    if (!player || !player.currentRoom) return;
    
    const room = rooms.get(player.currentRoom);
    if (!room || room.status !== 'inprogress') return;
    
    // Yerini yenilə
    player.position = data.position;
    player.location = data.location;
    
    // Digər oyunçulara bildir
    socket.to(room.id).emit('playerMoved', {
      playerId: socket.playerId,
      position: data.position,
      location: data.location
    });
  });

  socket.on('completeTask', (taskId) => {
    const player = players.get(socket.playerId);
    if (!player || !player.currentRoom) return;
    
    const room = rooms.get(player.currentRoom);
    if (!room || room.status !== 'inprogress') return;
    
    // Tapşırığı tamamla
    const task = player.tasks.find(t => t.id === taskId);
    if (task && !task.completed) {
      task.completed = true;
      room.tasksCompleted++;
      
      // Bütün oyunçulara bildir
      io.to(room.id).emit('taskCompleted', {
        playerId: socket.playerId,
        taskId: taskId,
        totalCompleted: room.tasksCompleted,
        totalTasks: room.totalTasks
      });
      
      // Bütün tapşırıqlar tamamlandısa
      if (room.tasksCompleted >= room.totalTasks) {
        endGame(room.id, 'crewmates');
      }
    }
  });

  socket.on('reportBody', (bodyPosition) => {
    const player = players.get(socket.playerId);
    if (!player || !player.currentRoom) return;
    
    const room = rooms.get(player.currentRoom);
    if (!room || room.status !== 'inprogress') return;
    
    // Görüş başlat
    startMeeting(room.id, socket.playerId, 'report', bodyPosition);
  });

  socket.on('callMeeting', () => {
    const player = players.get(socket.playerId);
    if (!player || !player.currentRoom) return;
    
    const room = rooms.get(player.currentRoom);
    if (!room || room.status !== 'inprogress' || room.settings.emergencyMeetings <= 0) return;
    
    // Görüş başlat
    room.settings.emergencyMeetings--;
    startMeeting(room.id, socket.playerId, 'emergency');
  });

  socket.on('vote', (votedPlayerId) => {
    const player = players.get(socket.playerId);
    if (!player || !player.currentRoom) return;
    
    const room = rooms.get(player.currentRoom);
    if (!room || room.status !== 'meeting') return;
    
    // Səs ver
    player.vote = votedPlayerId;
    room.votes.set(socket.playerId, votedPlayerId);
    
    // Bütün səslər toplanıbsa
    const aliveCount = room.getAliveCount();
    if (room.votes.size >= aliveCount) {
      endVoting(room.id);
    }
  });

  socket.on('killPlayer', (targetPlayerId) => {
    const player = players.get(socket.playerId);
    if (!player || !player.currentRoom) return;
    
    const room = rooms.get(player.currentRoom);
    if (!room || room.status !== 'inprogress' || player.role !== 'impostor') return;
    
    const target = players.get(targetPlayerId) || room.bots.find(b => b.id === targetPlayerId);
    if (target && target.isAlive) {
      target.isAlive = false;
      room.deadPlayers.push(target.id);
      
      // Bütün oyunçulara bildir
      io.to(room.id).emit('playerKilled', {
        victimId: target.id,
        killerId: socket.playerId,
        position: target.position
      });
      
      // Ölü sayını yoxla
      checkGameEnd(room.id);
    }
  });

  socket.on('disconnect', () => {
    console.log('Oyunçu ayrıldı:', socket.playerId);
    if (socket.playerId) {
      leaveRoom(socket.playerId);
      players.delete(socket.playerId);
    }
  });

  // Köməkçi funksiyalar
  function leaveRoom(playerId) {
    const player = players.get(playerId);
    if (!player || !player.currentRoom) return;
    
    const room = rooms.get(player.currentRoom);
    if (!room) return;
    
    // Oyunçunu otaqdan sil
    const index = room.players.findIndex(p => p.id === playerId);
    if (index !== -1) {
      room.players.splice(index, 1);
    }
    
    // Host ayrılıbsa yeni host seç
    if (room.hostId === playerId && room.players.length > 0) {
      room.hostId = room.players[0].id;
      room.players[0].isHost = true;
    }
    
    // Otaq boşdursa sil
    if (room.players.length === 0) {
      rooms.delete(room.id);
    } else {
      // Digər oyunçulara bildir
      io.to(room.id).emit('playerLeft', { playerId: playerId });
      updateRoomPlayers(room.id);
    }
    
    player.currentRoom = null;
    player.isHost = false;
    
    updateRoomList();
  }

  function getRoomInfo(room) {
    return {
      id: room.id,
      name: room.name,
      hostId: room.hostId,
      mapId: room.mapId,
      playerCount: room.getPlayerCount(),
      maxPlayers: room.maxPlayers,
      status: room.status,
      settings: room.settings,
      players: room.players.map(p => getPlayerInfo(p)),
      bots: room.bots.map(b => ({
        id: b.id,
        name: b.name,
        color: b.color,
        isAlive: b.isAlive
      }))
    };
  }

  function getPlayerInfo(player) {
    return {
      id: player.id,
      name: player.name,
      color: player.color,
      isAlive: player.isAlive,
      role: player.role,
      isHost: player.isHost,
      tasks: player.tasks
    };
  }

  function updateRoomList() {
    const roomsList = Array.from(rooms.values()).map(room => ({
      id: room.id,
      name: room.name,
      map: room.mapId,
      playerCount: room.getPlayerCount(),
      maxPlayers: room.maxPlayers,
      status: room.status,
      hasPassword: !!room.password
    }));
    
    io.emit('roomListUpdated', roomsList);
  }

  function updateRoomPlayers(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    io.to(roomId).emit('roomUpdated', getRoomInfo(room));
  }

  function startMeeting(roomId, reporterId, type, bodyPosition = null) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    room.status = 'meeting';
    room.meeting = {
      reporterId: reporterId,
      type: type,
      bodyPosition: bodyPosition,
      startTime: Date.now(),
      discussionTime: room.settings.discussionTime
    };
    
    // Səsləri sıfırla
    room.votes.clear();
    room.players.forEach(p => p.vote = null);
    
    // Bütün oyunçulara bildir
    io.to(roomId).emit('meetingStarted', {
      reporterId: reporterId,
      type: type,
      discussionTime: room.settings.discussionTime,
      votingTime: room.settings.votingTime
    });
    
    // Müzakirə müddəti
    setTimeout(() => {
      if (room.status === 'meeting') {
        io.to(roomId).emit('startVoting', {
          votingTime: room.settings.votingTime
        });
      }
    }, room.settings.discussionTime * 1000);
    
    // Ümumi səsvermə müddəti
    setTimeout(() => {
      if (room.status === 'meeting') {
        endVoting(roomId);
      }
    }, (room.settings.discussionTime + room.settings.votingTime) * 1000);
    
    updateRoomList();
  }

  function endVoting(roomId) {
    const room = rooms.get(roomId);
    if (!room || room.status !== 'meeting') return;
    
    // Səsləri say
    const voteCount = {};
    room.votes.forEach(vote => {
      if (vote !== 'skip') {
        voteCount[vote] = (voteCount[vote] || 0) + 1;
      }
    });
    
    // Ən çox səs alanı tap
    let ejectedPlayerId = null;
    let maxVotes = 0;
    
    Object.entries(voteCount).forEach(([playerId, votes]) => {
      if (votes > maxVotes) {
        maxVotes = votes;
        ejectedPlayerId = playerId;
      }
    });
    
    // Beraberlik
    const tie = Object.values(voteCount).filter(v => v === maxVotes).length > 1;
    
    if (tie || maxVotes === 0) {
      ejectedPlayerId = null;
    }
    
    // Oyunçunu at
    if (ejectedPlayerId) {
      const player = players.get(ejectedPlayerId) || room.bots.find(b => b.id === ejectedPlayerId);
      if (player) {
        player.isAlive = false;
        room.deadPlayers.push(ejectedPlayerId);
      }
    }
    
    // Nəticələri göndər
    io.to(roomId).emit('votingEnded', {
      ejectedPlayerId: ejectedPlayerId,
      votes: Object.fromEntries(room.votes),
      tie: tie,
      role: ejectedPlayerId ? 
        (players.get(ejectedPlayerId)?.role || room.bots.find(b => b.id === ejectedPlayerId)?.role) : 
        null
    });
    
    // Oyunu davam etdir
    setTimeout(() => {
      if (room.status === 'meeting') {
        room.status = 'inprogress';
        io.to(roomId).emit('meetingEnded');
        checkGameEnd(roomId);
      }
    }, 5000);
  }

  function checkGameEnd(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const aliveCrewmates = room.players.filter(p => p.role === 'crewmate' && p.isAlive).length +
                          room.bots.filter(b => b.role === 'crewmate' && b.isAlive).length;
    const aliveImpostors = room.getImpostorCount();
    
    if (aliveImpostors === 0) {
      endGame(roomId, 'crewmates');
    } else if (aliveImpostors >= aliveCrewmates) {
      endGame(roomId, 'impostors');
    } else if (room.tasksCompleted >= room.totalTasks) {
      endGame(roomId, 'crewmates');
    }
  }

  function endGame(roomId, winner) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    room.status = 'ended';
    
    // Rolları açıqla
    const playerRoles = {};
    room.players.forEach(p => {
      playerRoles[p.id] = p.role;
    });
    
    io.to(roomId).emit('gameEnded', {
      winner: winner,
      playerRoles: playerRoles,
      tasksCompleted: room.tasksCompleted
    });
    
    // Oyunçuları lobbiyə qaytar
    setTimeout(() => {
      room.players.forEach(p => {
        p.currentRoom = null;
        p.isHost = false;
        p.role = null;
        p.tasks = [];
        p.isAlive = true;
      });
      
      // Otağı sil
      rooms.delete(roomId);
      updateRoomList();
      
      io.to(roomId).emit('returnToLobby');
      io.socketsLeave(roomId);
    }, 10000);
  }
});

// Telegram bot entegrasiyası
if (telegramBot) {
  telegramBot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userName = msg.from.first_name || 'Oyunçu';
    
    telegramBot.sendMessage(chatId, 
      `Salam ${userName}!\n\n` +
      `Among Us tipli oyunumuza xoş gəlmisiniz. ` +
      `Telegram məlumatlarınız avtomatik alınacaq və oyuna qoşula biləcəksiniz.\n\n` +
      `🎮 [OYUNU AÇ](https://saskioyunu.onrender.com)\n\n` +
      `Oyun xüsusiyyətləri:\n` +
      `• Real oyunçularla və botlarla oynaya bilərsiniz\n` +
      `• Öz otağınızı yarada bilərsiniz\n` +
      `• 4 fərqli xəritə\n` +
      `• Həqiqi Among Us kontrolları\n` +
      `• Canlı animasiyalar\n\n` +
      `Tərtibatçı: @BTbots\n` +
      `Bütün hüquqlar qorunur © 2023`
    );
  });
  
  telegramBot.onText(/\/oyun/, (msg) => {
    const chatId = msg.chat.id;
    
    telegramBot.sendMessage(chatId, 
      `🎮 Oyunu başlatmaq üçün:\n\n` +
      `1. Aşağıdakı düyməni sıxın\n` +
      `2. Telegram məlumatlarınız avtomatik yüklənəcək\n` +
      `3. Otaq yaradın və ya mövcud otağa qoşulun\n` +
      `4. Oyunu başladın!\n\n` +
      `[OYUNU BAŞLAT](https://saskioyunu.onrender.com)`,
      { parse_mode: 'Markdown' }
    );
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server ${PORT} portunda işləyir`);
});

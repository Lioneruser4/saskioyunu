const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// ==================== VERİTABANI ====================
const players = new Map();
const rooms = new Map();

// ==================== ODA YÖNETİMİ ====================
class RoomManager {
  constructor() {
    this.rooms = rooms;
    this.maxPlayers = 10; // 5v5
  }

  createRoom(options = {}) {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const room = {
      id: roomId,
      name: options.name || `Oda ${roomId}`,
      map: options.map || 'backrooms',
      mode: options.mode || 'tdm',
      state: 'waiting',
      players: new Map(),
      redTeam: [],
      blueTeam: [],
      redScore: 0,
      blueScore: 0,
      created: Date.now()
    };
    this.rooms.set(roomId, room);
    return room;
  }

  findRoom() {
    for (const room of this.rooms.values()) {
      if (room.players.size < this.maxPlayers && room.state === 'waiting') {
        return room;
      }
    }
    return this.createRoom();
  }

  joinRoom(roomId, player) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    // Takım seç (dengeleme)
    const team = room.redTeam.length <= room.blueTeam.length ? 'red' : 'blue';
    
    const playerData = {
      id: player.id,
      username: player.username,
      team: team,
      health: 100,
      kills: 0,
      deaths: 0,
      position: { x: Math.random() * 20 - 10, y: 1, z: Math.random() * 20 - 10 }
    };

    room.players.set(player.id, playerData);
    if (team === 'red') {
      room.redTeam.push(player.id);
    } else {
      room.blueTeam.push(player.id);
    }

    return { room, playerData, team };
  }

  leaveRoom(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players.get(playerId);
    if (player) {
      room.players.delete(playerId);
      if (player.team === 'red') {
        room.redTeam = room.redTeam.filter(id => id !== playerId);
      } else {
        room.blueTeam = room.blueTeam.filter(id => id !== playerId);
      }
    }

    if (room.players.size === 0) {
      this.rooms.delete(roomId);
    }
  }
}

const roomManager = new RoomManager();

// ==================== API ROUTES ====================
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    players: io.engine.clientsCount,
    rooms: rooms.size 
  });
});

app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.values()).map(r => ({
    id: r.id,
    name: r.name,
    map: r.map,
    red: r.redTeam.length,
    blue: r.blueTeam.length,
    total: r.players.size,
    max: 10
  }));
  res.json(roomList);
});

app.post('/api/rooms/create', (req, res) => {
  const room = roomManager.createRoom(req.body);
  res.json({ id: room.id });
});

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
  console.log(`🔌 Bağlandı: ${socket.id}`);

  let currentRoom = null;
  let playerName = 'Oyuncu';

  // Giriş
  socket.on('auth', (data) => {
    playerName = data.username || 'Oyuncu';
    players.set(socket.id, { username: playerName });
    socket.emit('auth:success', { 
      id: socket.id,
      username: playerName 
    });
  });

  // Odaya katıl
  socket.on('joinRoom', (data) => {
    const room = roomManager.findRoom();
    const result = roomManager.joinRoom(room.id, {
      id: socket.id,
      username: playerName
    });

    if (result) {
      socket.join(room.id);
      currentRoom = room.id;

      // Kendine bilgi gönder
      socket.emit('roomJoined', {
        roomId: room.id,
        players: Array.from(room.players.values()),
        yourTeam: result.team
      });

      // Diğerlerine yeni oyuncuyu bildir
      socket.to(room.id).emit('playerJoined', {
        id: socket.id,
        username: playerName,
        team: result.team
      });

      console.log(`${playerName} ${room.id} odasına katıldı`);
    }
  });

  // Hareket
  socket.on('playerMove', (position) => {
    if (currentRoom) {
      socket.to(currentRoom).emit('playerMoved', {
        id: socket.id,
        position: position
      });
    }
  });

  // Ateş et
  socket.on('playerShoot', (data) => {
    if (currentRoom) {
      io.to(currentRoom).emit('playerShot', {
        id: socket.id,
        ...data
      });

      // Hasar hesapla
      const damage = data.hitZone === 'head' ? 100 : 
                     data.hitZone === 'body' ? 35 : 20;

      io.to(currentRoom).emit('playerHit', {
        shooter: socket.id,
        target: data.targetId,
        damage: damage,
        hitZone: data.hitZone
      });
    }
  });

  // Yeniden doğ
  socket.on('playerRespawn', () => {
    if (currentRoom) {
      io.to(currentRoom).emit('playerRespawned', {
        id: socket.id,
        position: { x: Math.random() * 20 - 10, y: 1, z: Math.random() * 20 - 10 }
      });
    }
  });

  // Sohbet
  socket.on('chatMessage', (message) => {
    if (currentRoom) {
      io.to(currentRoom).emit('chatMessage', {
        id: socket.id,
        username: playerName,
        message: message
      });
    }
  });

  // Ayrılma
  socket.on('disconnect', () => {
    if (currentRoom) {
      roomManager.leaveRoom(currentRoom, socket.id);
      io.to(currentRoom).emit('playerLeft', socket.id);
    }
    players.delete(socket.id);
    console.log(`❌ Ayrıldı: ${socket.id}`);
  });
});

// 20 saniyede bir ping
setInterval(() => {
  io.emit('ping', Date.now());
}, 20000);

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Sunucu ${PORT} portunda çalışıyor`);
});

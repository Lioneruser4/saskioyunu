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
const db = {
  players: new Map(),
  rooms: new Map(),
  stats: new Map()
};

// ==================== ODA YÖNETİCİSİ ====================
class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.maxPlayersPerRoom = 10; // 5v5
  }

  generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  createRoom(options = {}) {
    const roomId = this.generateRoomId();
    const room = {
      id: roomId,
      name: options.name || `Oda ${roomId}`,
      map: options.map || 'backrooms',
      mode: options.mode || 'tdm',
      state: 'waiting',
      createdAt: Date.now(),
      players: new Map(),
      teams: {
        red: { players: [], score: 0 },
        blue: { players: [], score: 0 }
      },
      redCount: 0,
      blueCount: 0,
      maxPlayers: 10
    };
    
    this.rooms.set(roomId, room);
    return room;
  }

  findAvailableRoom() {
    // Önce boş oda bul
    for (const [id, room] of this.rooms) {
      const totalPlayers = room.redCount + room.blueCount;
      if (totalPlayers < room.maxPlayers && room.state === 'waiting') {
        return room;
      }
    }
    // Yoksa yeni oda oluştur
    return this.createRoom();
  }

  addPlayerToRoom(roomId, player) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    // Takım seçimi (dengeleme)
    const team = room.redCount <= room.blueCount ? 'red' : 'blue';
    
    const playerData = {
      id: player.id,
      username: player.username,
      team: team,
      health: 100,
      kills: 0,
      deaths: 0,
      position: { x: Math.random() * 10 - 5, y: 1, z: Math.random() * 10 - 5 }
    };

    room.players.set(player.id, playerData);
    room.teams[team].players.push(player.id);
    
    if (team === 'red') room.redCount++;
    else room.blueCount++;

    return { team, playerData };
  }

  removePlayerFromRoom(roomId, playerId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const player = room.players.get(playerId);
    if (player) {
      room.players.delete(playerId);
      room.teams[player.team].players = room.teams[player.team].players.filter(id => id !== playerId);
      
      if (player.team === 'red') room.redCount--;
      else room.blueCount--;
    }

    // Oda boşsa sil
    if (room.players.size === 0) {
      this.rooms.delete(roomId);
    }
  }
}

const roomManager = new RoomManager();

// ==================== API ROUTES ====================
app.get('/', (req, res) => {
  res.json({
    name: 'SAŞKİ OYUNU Sunucusu',
    status: 'online',
    players: io.engine.clientsCount,
    rooms: roomManager.rooms.size,
    timestamp: Date.now()
  });
});

app.get('/api/rooms', (req, res) => {
  const rooms = Array.from(roomManager.rooms.values()).map(room => ({
    id: room.id,
    name: room.name,
    map: room.map,
    mode: room.mode,
    state: room.state,
    redCount: room.redCount,
    blueCount: room.blueCount,
    total: room.redCount + room.blueCount,
    max: room.maxPlayers
  }));
  res.json(rooms);
});

app.post('/api/rooms/create', (req, res) => {
  const { name, map, mode } = req.body;
  const room = roomManager.createRoom({ name, map, mode });
  res.json({ id: room.id, name: room.name });
});

app.get('/api/stats', (req, res) => {
  res.json({
    online: io.engine.clientsCount,
    rooms: roomManager.rooms.size,
    totalPlayers: db.players.size
  });
});

// ==================== SOCKET.IO ====================
io.on('connection', (socket) => {
  console.log(`✅ Yeni bağlantı: ${socket.id} (Toplam: ${io.engine.clientsCount})`);

  let currentRoom = null;
  let playerData = null;

  // Kimlik doğrulama
  socket.on('auth', (data) => {
    const { telegramId, username } = data;
    
    playerData = {
      id: socket.id,
      telegramId: telegramId || 'guest_' + Math.random(),
      username: username || 'Oyuncu',
      connectedAt: Date.now()
    };

    db.players.set(socket.id, playerData);
    
    socket.emit('auth:success', {
      player: {
        id: playerData.id,
        username: playerData.username,
        level: 1,
        kills: 0,
        deaths: 0,
        wins: 0
      },
      server: {
        players: io.engine.clientsCount,
        rooms: roomManager.rooms.size
      }
    });

    console.log(`👤 Giriş yaptı: ${playerData.username}`);
  });

  // Odaya katılma
  socket.on('room:join', (data) => {
    const { roomId, preferences } = data;
    
    let room;
    if (roomId) {
      room = roomManager.rooms.get(roomId);
    } else {
      room = roomManager.findAvailableRoom();
    }

    if (!room) {
      socket.emit('error', { message: 'Oda bulunamadı' });
      return;
    }

    const result = roomManager.addPlayerToRoom(room.id, playerData);
    if (!result) {
      socket.emit('error', { message: 'Oda dolu' });
      return;
    }

    socket.join(room.id);
    currentRoom = room.id;

    // Odaya katılan kişiye bilgi gönder
    socket.emit('room:joined', {
      roomId: room.id,
      roomName: room.name,
      map: room.map,
      mode: room.mode,
      team: result.team,
      redCount: room.redCount,
      blueCount: room.blueCount,
      players: Array.from(room.players.values()).map(p => ({
        id: p.id,
        username: p.username,
        team: p.team,
        health: p.health
      }))
    });

    // Diğer oyunculara yeni oyuncuyu bildir
    socket.to(room.id).emit('room:player_joined', {
      id: playerData.id,
      username: playerData.username,
      team: result.team,
      health: 100
    });

    console.log(`🎮 ${playerData.username} odaya katıldı: ${room.id} (${result.team})`);
  });

  // Oyuncu hareketi
  socket.on('player:move', (data) => {
    if (!currentRoom) return;
    
    socket.to(currentRoom).emit('player:moved', {
      id: socket.id,
      position: data.position,
      rotation: data.rotation
    });
  });

  // Ateş etme
  socket.on('player:shoot', (data) => {
    if (!currentRoom) return;

    const room = roomManager.rooms.get(currentRoom);
    if (!room) return;

    const target = room.players.get(data.targetId);
    if (!target) return;

    // Hasar hesapla
    const damage = data.hitZone === 'head' ? 100 : 
                   data.hitZone === 'body' ? 35 : 20;
    
    target.health -= damage;

    // Vuruş bilgisini gönder
    io.to(currentRoom).emit('game:player_hit', {
      shooterId: socket.id,
      targetId: data.targetId,
      hitZone: data.hitZone,
      damage: damage,
      remainingHealth: target.health
    });

    // Ölüm kontrolü
    if (target.health <= 0) {
      const shooter = room.players.get(socket.id);
      shooter.kills++;
      target.deaths++;

      io.to(currentRoom).emit('game:player_died', {
        killerId: socket.id,
        killerName: shooter.username,
        victimId: data.targetId,
        victimName: target.username,
        weapon: data.weapon
      });

      // 5 saniye sonra yeniden doğ
      setTimeout(() => {
        if (room.players.has(data.targetId)) {
          target.health = 100;
          target.position = {
            x: Math.random() * 10 - 5,
            y: 1,
            z: Math.random() * 10 - 5
          };
          
          io.to(currentRoom).emit('game:player_respawned', {
            playerId: data.targetId,
            position: target.position
          });
        }
      }, 5000);
    }
  });

  // Sohbet mesajı
  socket.on('room:chat', (data) => {
    if (!currentRoom) return;
    
    io.to(currentRoom).emit('room:chat', {
      id: socket.id,
      username: playerData?.username || 'Bilinmiyor',
      message: data.message,
      timestamp: Date.now()
    });
  });

  // Hazır durumu
  socket.on('player:ready', (data) => {
    if (!currentRoom) return;
    
    io.to(currentRoom).emit('room:player_ready', {
      playerId: socket.id,
      isReady: data.isReady
    });
  });

  // Oda listesi isteği
  socket.on('rooms:request', () => {
    const rooms = Array.from(roomManager.rooms.values()).map(room => ({
      id: room.id,
      name: room.name,
      map: room.map,
      redCount: room.redCount,
      blueCount: room.blueCount,
      total: room.redCount + room.blueCount,
      max: room.maxPlayers,
      hasPassword: false
    }));
    socket.emit('rooms:list', rooms);
  });

  // Bağlantı kopması
  socket.on('disconnect', () => {
    if (currentRoom) {
      roomManager.removePlayerFromRoom(currentRoom, socket.id);
      io.to(currentRoom).emit('room:player_left', {
        playerId: socket.id,
        username: playerData?.username
      });
    }
    
    db.players.delete(socket.id);
    console.log(`❌ Bağlantı koptu: ${socket.id} (Kalan: ${io.engine.clientsCount})`);
  });
});

// ==================== PING (UYANIK TUT) ====================
setInterval(() => {
  const clients = io.engine.clientsCount;
  const rooms = roomManager.rooms.size;
  console.log(`💓 Heartbeat - Online: ${clients}, Odalar: ${rooms}`);
}, 30000);

// ==================== SUNUCUYU BAŞLAT ====================
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════╗
║     SAŞKİ OYUNU SUNUCUSU                   ║
╠════════════════════════════════════════════╣
║  📡 Port: ${PORT}                             
║  🔗 URL: https://saskioyunu-1-2d6i.onrender.com
║  🕒 ${new Date().toLocaleString('tr-TR')}         
╚════════════════════════════════════════════╝
  `);
});

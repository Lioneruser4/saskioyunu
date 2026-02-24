const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ============================================================
// GAME CONSTANTS
// ============================================================
const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 700;
const TICK_RATE = 20; // ms per tick = 50 ticks/sec
const MOVE_SPEED = 5;
const JUMP_FORCE = -15;
const GRAVITY = 0.65;
const MAX_HP = 100;
const ATTACK_DAMAGE = 12;
const ATTACK_RANGE = 80;
const PLAYER_W = 32;
const PLAYER_H = 56;
const ROOM_MAX = 20;
const RESPAWN_DELAY = 4000;

// ============================================================
// PLATFORMS (x, y, w, h)
// ============================================================
const BASE_PLATFORMS = [
  // Ground
  { x: 0, y: WORLD_HEIGHT - 50, w: WORLD_WIDTH, h: 50 },
  // Layer 1
  { x: 150, y: 550, w: 200, h: 18 },
  { x: 420, y: 490, w: 180, h: 18 },
  { x: 680, y: 430, w: 200, h: 18 },
  { x: 950, y: 500, w: 160, h: 18 },
  { x: 1200, y: 440, w: 210, h: 18 },
  { x: 1500, y: 390, w: 180, h: 18 },
  { x: 1760, y: 460, w: 200, h: 18 },
  { x: 2050, y: 420, w: 170, h: 18 },
  { x: 2300, y: 500, w: 200, h: 18 },
  { x: 2580, y: 450, w: 190, h: 18 },
  { x: 2830, y: 390, w: 180, h: 18 },
  { x: 3100, y: 480, w: 200, h: 18 },
  { x: 3380, y: 430, w: 170, h: 18 },
  { x: 3650, y: 500, w: 200, h: 18 },
  // Layer 2
  { x: 300, y: 380, w: 160, h: 18 },
  { x: 560, y: 320, w: 180, h: 18 },
  { x: 830, y: 360, w: 160, h: 18 },
  { x: 1100, y: 300, w: 200, h: 18 },
  { x: 1380, y: 280, w: 160, h: 18 },
  { x: 1650, y: 310, w: 180, h: 18 },
  { x: 1920, y: 280, w: 200, h: 18 },
  { x: 2200, y: 340, w: 160, h: 18 },
  { x: 2460, y: 290, w: 180, h: 18 },
  { x: 2720, y: 320, w: 160, h: 18 },
  { x: 2980, y: 280, w: 200, h: 18 },
  { x: 3250, y: 310, w: 170, h: 18 },
  { x: 3520, y: 290, w: 180, h: 18 },
  { x: 3780, y: 340, w: 160, h: 18 },
  // Layer 3 (top)
  { x: 450, y: 220, w: 160, h: 18 },
  { x: 750, y: 200, w: 180, h: 18 },
  { x: 1050, y: 180, w: 160, h: 18 },
  { x: 1350, y: 160, w: 200, h: 18 },
  { x: 1700, y: 180, w: 160, h: 18 },
  { x: 2000, y: 160, w: 200, h: 18 },
  { x: 2300, y: 180, w: 160, h: 18 },
  { x: 2600, y: 200, w: 180, h: 18 },
  { x: 2900, y: 180, w: 200, h: 18 },
  { x: 3200, y: 160, w: 160, h: 18 },
  { x: 3500, y: 200, w: 180, h: 18 },
  // Boxes / crates feel
  { x: 80, y: WORLD_HEIGHT - 100, w: 60, h: 50 },
  { x: 340, y: WORLD_HEIGHT - 100, w: 60, h: 50 },
  { x: 700, y: WORLD_HEIGHT - 100, w: 60, h: 50 },
  { x: 1100, y: WORLD_HEIGHT - 100, w: 60, h: 50 },
  { x: 1600, y: WORLD_HEIGHT - 100, w: 60, h: 50 },
  { x: 2100, y: WORLD_HEIGHT - 100, w: 60, h: 50 },
  { x: 2600, y: WORLD_HEIGHT - 100, w: 60, h: 50 },
  { x: 3000, y: WORLD_HEIGHT - 100, w: 60, h: 50 },
  { x: 3500, y: WORLD_HEIGHT - 100, w: 60, h: 50 },
  { x: 3900, y: WORLD_HEIGHT - 100, w: 80, h: 50 },
];

// Health packs
function genPickups() {
  const p = [];
  for (let i = 0; i < 20; i++) {
    p.push({ id: i, x: 200 + Math.random() * 3600, y: 100, active: true, respawnAt: 0 });
  }
  return p;
}

// ============================================================
// ROOMS
// ============================================================
const rooms = new Map();

function createRoom(id, name, password = '', hostId = null) {
  const r = {
    id, name, password, hostId,
    players: new Map(),
    chat: [],
    pickups: genPickups(),
    projectiles: [],
    projIdCounter: 0,
    tickInterval: null,
    createdAt: Date.now()
  };
  startRoomTick(r);
  return r;
}

// Start public room
rooms.set('public', createRoom('public', '🌍 Public World', ''));

function startRoomTick(room) {
  room.tickInterval = setInterval(() => tickRoom(room), TICK_RATE);
}

function stopRoom(room) {
  if (room.tickInterval) clearInterval(room.tickInterval);
}

function getRoomList() {
  const list = [];
  rooms.forEach(r => {
    if (r.id !== 'public') {
      list.push({
        id: r.id,
        name: r.name,
        hasPassword: !!r.password,
        playerCount: r.players.size,
        maxPlayers: ROOM_MAX
      });
    }
  });
  return list;
}

function getPublicInfo() {
  const pub = rooms.get('public');
  return { playerCount: pub ? pub.players.size : 0, maxPlayers: ROOM_MAX };
}

// ============================================================
// PHYSICS TICK
// ============================================================
function tickRoom(room) {
  const now = Date.now();
  const updates = [];

  // Respawn pickups
  room.pickups.forEach(pk => {
    if (!pk.active && now >= pk.respawnAt) {
      pk.active = true;
      io.to(room.id).emit('pickupSpawn', pk.id);
    }
  });

  room.players.forEach(p => {
    if (!p.alive) {
      if (now >= p.respawnAt) {
        respawnPlayer(p, room);
      }
      return;
    }

    // Apply gravity
    p.vy += GRAVITY;

    // Move
    p.x += p.vx;
    p.y += p.vy;

    // Platform collision
    let onGround = false;
    for (const plat of BASE_PLATFORMS) {
      if (
        p.vy >= 0 &&
        p.x + PLAYER_W > plat.x &&
        p.x < plat.x + plat.w &&
        p.y + PLAYER_H > plat.y &&
        p.y + PLAYER_H < plat.y + plat.h + Math.abs(p.vy) + 2
      ) {
        p.y = plat.y - PLAYER_H;
        p.vy = 0;
        onGround = true;
      }
    }
    p.onGround = onGround;

    // World bounds
    if (p.x < 0) p.x = 0;
    if (p.x + PLAYER_W > WORLD_WIDTH) p.x = WORLD_WIDTH - PLAYER_W;
    if (p.y > WORLD_HEIGHT + 200) {
      // fell off
      p.hp = 0;
      killPlayer(p, room, null);
      return;
    }

    // Pickup collision
    room.pickups.forEach(pk => {
      if (!pk.active) return;
      if (Math.abs(p.x - pk.x) < 40 && Math.abs(p.y - pk.y) < 40) {
        pk.active = false;
        pk.respawnAt = now + 15000;
        p.hp = Math.min(MAX_HP, p.hp + 30);
        io.to(room.id).emit('pickupCollect', { pkId: pk.id, playerId: p.id, hp: p.hp });
      }
    });

    updates.push(getPlayerState(p));
  });

  // Projectile tick
  const aliveProjIds = [];
  for (let i = room.projectiles.length - 1; i >= 0; i--) {
    const proj = room.projectiles[i];
    proj.x += proj.vx;
    proj.y += proj.vy;
    proj.vy += GRAVITY * 0.3;
    proj.life--;

    let hit = false;

    // Check platform collision
    for (const plat of BASE_PLATFORMS) {
      if (
        proj.x > plat.x && proj.x < plat.x + plat.w &&
        proj.y > plat.y && proj.y < plat.y + plat.h
      ) { hit = true; break; }
    }

    if (!hit) {
      // Check player collision
      room.players.forEach(p => {
        if (hit || p.id === proj.ownerId || !p.alive) return;
        if (
          proj.x > p.x && proj.x < p.x + PLAYER_W &&
          proj.y > p.y && proj.y < p.y + PLAYER_H
        ) {
          hit = true;
          p.hp -= proj.damage;
          if (p.hp <= 0) {
            killPlayer(p, room, proj.ownerId);
          }
          io.to(room.id).emit('playerHit', { id: p.id, hp: p.hp, attackerId: proj.ownerId });
        }
      });
    }

    if (hit || proj.life <= 0 || proj.x < 0 || proj.x > WORLD_WIDTH) {
      room.projectiles.splice(i, 1);
      io.to(room.id).emit('projRemove', proj.id);
    } else {
      aliveProjIds.push({ id: proj.id, x: Math.round(proj.x), y: Math.round(proj.y) });
    }
  }

  if (updates.length > 0) {
    io.to(room.id).emit('stateUpdate', { players: updates, projs: aliveProjIds });
  }
}

function getPlayerState(p) {
  return {
    id: p.id, x: Math.round(p.x), y: Math.round(p.y),
    vx: p.vx, vy: p.vy, hp: p.hp, alive: p.alive,
    facing: p.facing, state: p.state, kills: p.kills, deaths: p.deaths
  };
}

function respawnPlayer(p, room) {
  const sp = getRandomSpawn();
  p.x = sp.x; p.y = sp.y;
  p.vx = 0; p.vy = 0;
  p.hp = MAX_HP;
  p.alive = true;
  p.state = 'idle';
  p.attackCooldown = 0;
  io.to(room.id).emit('playerRespawn', getPlayerState(p));
}

function killPlayer(p, room, killerId) {
  p.alive = false;
  p.hp = 0;
  p.deaths++;
  p.state = 'dead';
  p.respawnAt = Date.now() + RESPAWN_DELAY;

  if (killerId) {
    const killer = room.players.get(killerId);
    if (killer) {
      killer.kills++;
      io.to(room.id).emit('killFeed', {
        killerName: killer.name,
        victimName: p.name
      });
    }
  }
  io.to(room.id).emit('playerDied', { id: p.id, killerId });
}

function getRandomSpawn() {
  return { x: 100 + Math.random() * (WORLD_WIDTH - 300), y: 200 };
}

// Character generation
const SKINS = [
  { skin: '#FFDBB4', hair: '#3B1F0A', shirt: '#E53935', pants: '#1565C0' },
  { skin: '#C68642', hair: '#1A1A1A', shirt: '#43A047', pants: '#4A148C' },
  { skin: '#F1C27D', hair: '#6D3B1B', shirt: '#FB8C00', pants: '#263238' },
  { skin: '#FFDBAC', hair: '#B5651D', shirt: '#8E24AA', pants: '#1B5E20' },
  { skin: '#8D5524', hair: '#0D0D0D', shirt: '#00ACC1', pants: '#BF360C' },
  { skin: '#D4956A', hair: '#FFD700', shirt: '#F06292', pants: '#006064' },
  { skin: '#E8BEAC', hair: '#C0392B', shirt: '#3949AB', pants: '#4E342E' },
  { skin: '#A0522D', hair: '#2C2C2C', shirt: '#7CB342', pants: '#37474F' },
  { skin: '#FDEBD0', hair: '#4A3728', shirt: '#EF5350', pants: '#1A237E' },
  { skin: '#CB9E6E', hair: '#191919', shirt: '#26C6DA', pants: '#558B2F' },
];

let playerIdCounter = 0;

function createPlayer(socketId, name, telegramId) {
  const sp = getRandomSpawn();
  const appearance = SKINS[Math.floor(Math.random() * SKINS.length)];
  return {
    id: socketId,
    name: name || `Player${++playerIdCounter}`,
    telegramId: telegramId || null,
    x: sp.x, y: sp.y,
    vx: 0, vy: 0,
    hp: MAX_HP, alive: true,
    onGround: false,
    facing: 1,
    state: 'idle',
    attackCooldown: 0,
    kills: 0, deaths: 0,
    respawnAt: 0,
    appearance,
    roomId: null
  };
}

// ============================================================
// SOCKET.IO
// ============================================================
io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);
  let player = null;
  let currentRoom = null;

  // --- JOIN LOBBY ---
  socket.on('joinLobby', ({ name, telegramId }) => {
    player = createPlayer(socket.id, name, telegramId);
    socket.emit('lobbyJoined', {
      playerId: socket.id,
      appearance: player.appearance,
      platforms: BASE_PLATFORMS,
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      roomList: getRoomList(),
      publicInfo: getPublicInfo()
    });
    console.log(`[Lobby] ${player.name} joined lobby`);
  });

  // --- GET ROOM LIST ---
  socket.on('getRoomList', () => {
    socket.emit('roomList', { rooms: getRoomList(), publicInfo: getPublicInfo() });
  });

  // --- JOIN PUBLIC WORLD ---
  socket.on('joinPublic', () => {
    if (!player) return;
    joinRoom(socket, player, 'public', '');
  });

  // --- QUICK JOIN (random room with space) ---
  socket.on('quickJoin', () => {
    if (!player) return;
    // Find available unlocked room
    let target = null;
    rooms.forEach(r => {
      if (!target && r.id !== 'public' && !r.password && r.players.size < ROOM_MAX) {
        target = r;
      }
    });
    if (!target) {
      // join public
      joinRoom(socket, player, 'public', '');
    } else {
      joinRoom(socket, player, target.id, '');
    }
  });

  // --- CREATE ROOM ---
  socket.on('createRoom', ({ name, password }) => {
    if (!player) return;
    const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const room = createRoom(roomId, name || `${player.name}'s Room`, password || '', socket.id);
    rooms.set(roomId, room);
    joinRoom(socket, player, roomId, password || '');
    // Notify all lobby users
    io.emit('roomListUpdate', { rooms: getRoomList(), publicInfo: getPublicInfo() });
  });

  // --- JOIN ROOM BY ID ---
  socket.on('joinRoom', ({ roomId, password }) => {
    if (!player) return;
    const room = rooms.get(roomId);
    if (!room) { socket.emit('joinError', 'Oda bulunamadı'); return; }
    if (room.password && room.password !== password) {
      socket.emit('joinError', 'Yanlış şifre'); return;
    }
    if (room.players.size >= ROOM_MAX) {
      socket.emit('joinError', 'Oda dolu'); return;
    }
    joinRoom(socket, player, roomId, password);
  });

  function joinRoom(socket, player, roomId, password) {
    // Leave current room
    if (currentRoom) leaveRoom(socket, player, currentRoom);

    const room = rooms.get(roomId);
    if (!room) { socket.emit('joinError', 'Oda bulunamadı'); return; }

    // Respawn position
    const sp = getRandomSpawn();
    player.x = sp.x; player.y = sp.y;
    player.vx = 0; player.vy = 0;
    player.hp = MAX_HP; player.alive = true;
    player.state = 'idle'; player.kills = 0; player.deaths = 0;
    player.roomId = roomId;

    currentRoom = room;
    room.players.set(socket.id, player);
    socket.join(roomId);

    // Send current state to newcomer
    const existingPlayers = [];
    room.players.forEach(p => { if (p.id !== socket.id) existingPlayers.push(getPlayerState(p)); });

    const existingAppearances = {};
    room.players.forEach(p => { existingAppearances[p.id] = { name: p.name, appearance: p.appearance }; });

    socket.emit('roomJoined', {
      roomId, roomName: room.name,
      playerId: socket.id,
      players: existingPlayers,
      appearances: existingAppearances,
      chat: room.chat.slice(-30),
      pickups: room.pickups,
      worldWidth: WORLD_WIDTH,
      worldHeight: WORLD_HEIGHT,
      platforms: BASE_PLATFORMS
    });

    // Notify others
    socket.to(roomId).emit('playerJoined', {
      ...getPlayerState(player),
      name: player.name,
      appearance: player.appearance
    });

    io.emit('roomListUpdate', { rooms: getRoomList(), publicInfo: getPublicInfo() });
    console.log(`[Room:${roomId}] ${player.name} joined (${room.players.size}/${ROOM_MAX})`);
  }

  // --- PLAYER INPUT ---
  socket.on('input', (data) => {
    if (!player || !player.alive || !currentRoom) return;

    const now = Date.now();

    // Movement
    player.vx = 0;
    if (data.left) { player.vx = -MOVE_SPEED; player.facing = -1; }
    if (data.right) { player.vx = MOVE_SPEED; player.facing = 1; }
    if (data.jump && player.onGround) {
      player.vy = JUMP_FORCE;
      player.onGround = false;
    }

    // State
    if (Math.abs(player.vx) > 0) player.state = 'run';
    else player.state = 'idle';

    if (!player.onGround) player.state = player.vy < 0 ? 'jump' : 'fall';

    // Melee attack
    if (data.attack && now - player.attackCooldown > 600) {
      player.attackCooldown = now;
      player.state = 'attack';
      // Check hit on nearby players
      currentRoom.players.forEach(target => {
        if (target.id === socket.id || !target.alive) return;
        const dx = (target.x + PLAYER_W / 2) - (player.x + PLAYER_W / 2);
        const dy = (target.y + PLAYER_H / 2) - (player.y + PLAYER_H / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const facingMatch = player.facing > 0 ? dx > 0 : dx < 0;
        if (dist < ATTACK_RANGE && facingMatch) {
          target.hp -= ATTACK_DAMAGE;
          if (target.hp <= 0) killPlayer(target, currentRoom, socket.id);
          else io.to(currentRoom.id).emit('playerHit', { id: target.id, hp: target.hp, attackerId: socket.id });
        }
      });
      io.to(currentRoom.id).emit('meleeEffect', { x: player.x + (player.facing > 0 ? PLAYER_W : -20), y: player.y + 10 });
    }

    // Throw/shoot (secondary)
    if (data.shoot && now - (player.shootCooldown || 0) > 800) {
      player.shootCooldown = now;
      const proj = {
        id: currentRoom.projIdCounter++,
        ownerId: socket.id,
        x: player.x + PLAYER_W / 2,
        y: player.y + PLAYER_H / 3,
        vx: player.facing * 12,
        vy: -4,
        damage: 20,
        life: 80
      };
      currentRoom.projectiles.push(proj);
      io.to(currentRoom.id).emit('projCreate', proj);
    }
  });

  // --- CHAT ---
  socket.on('chat', (msg) => {
    if (!player || !currentRoom) return;
    const text = String(msg).trim().slice(0, 150);
    if (!text) return;
    const chatMsg = { name: player.name, text, ts: Date.now() };
    currentRoom.chat.push(chatMsg);
    if (currentRoom.chat.length > 50) currentRoom.chat.shift();
    io.to(currentRoom.id).emit('chatMsg', chatMsg);
  });

  // --- LEAVE ROOM ---
  socket.on('leaveRoom', () => {
    if (currentRoom && player) {
      leaveRoom(socket, player, currentRoom);
      currentRoom = null;
      player.roomId = null;
    }
  });

  function leaveRoom(socket, player, room) {
    room.players.delete(socket.id);
    socket.leave(room.id);
    socket.to(room.id).emit('playerLeft', socket.id);

    // Delete empty non-public rooms
    if (room.id !== 'public' && room.players.size === 0) {
      stopRoom(room);
      rooms.delete(room.id);
    }
    io.emit('roomListUpdate', { rooms: getRoomList(), publicInfo: getPublicInfo() });
  }

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    if (currentRoom && player) leaveRoom(socket, player, currentRoom);
  });
});

// ============================================================
// START SERVER
// ============================================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 SaskiOyunu Server running on port ${PORT}`);
});

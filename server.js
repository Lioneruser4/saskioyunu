const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const MAX_ROOM_SIZE = 10;
const ROOM_WIDTH = 3200;
const ROOM_HEIGHT = 3200;
const TILE_SIZE = 80;

// Game state
const rooms = {}; // roomId -> room data
const players = {}; // socketId -> player data

function generateMaze(cols, rows) {
  // Simple maze generation - walls grid
  const walls = [];
  const grid = Array.from({ length: rows }, () => Array(cols).fill(1));
  
  function carve(x, y) {
    grid[y][x] = 0;
    const dirs = [[0,-2],[0,2],[-2,0],[2,0]].sort(() => Math.random()-0.5);
    for (const [dx, dy] of dirs) {
      const nx = x+dx, ny = y+dy;
      if (ny>=0&&ny<rows&&nx>=0&&nx<cols&&grid[ny][nx]===1) {
        grid[y+dy/2][x+dx/2] = 0;
        carve(nx, ny);
      }
    }
  }
  carve(1, 1);
  
  // Add extra openings
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(Math.random()*(cols-2))+1;
    const y = Math.floor(Math.random()*(rows-2))+1;
    grid[y][x] = 0;
  }
  
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (grid[y][x] === 1) walls.push({ x: x*TILE_SIZE, y: y*TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE });
    }
  }
  return { walls, grid };
}

function findOpenSpot(grid, cols, rows, excludeSpots = []) {
  let x, y, tries = 0;
  do {
    x = Math.floor(Math.random()*(cols-2))+1;
    y = Math.floor(Math.random()*(rows-2))+1;
    tries++;
    if (tries > 200) break;
  } while (
    grid[y][x] === 1 ||
    excludeSpots.some(s => Math.abs(s.gx-x)<5 && Math.abs(s.gy-y)<5)
  );
  return { x: x*TILE_SIZE + TILE_SIZE/2, y: y*TILE_SIZE + TILE_SIZE/2, gx: x, gy: y };
}

function createRoom(roomId, options = {}) {
  const cols = 40, rows = 40;
  const { walls, grid } = generateMaze(cols, rows);
  
  // Key position - far from spawn
  const spawn = findOpenSpot(grid, cols, rows);
  const keyPos = findOpenSpot(grid, cols, rows, [spawn]);
  const exitPos = findOpenSpot(grid, cols, rows, [spawn, keyPos]);
  
  // AI spawn - far from player spawn
  const aiSpawn = findOpenSpot(grid, cols, rows, [spawn]);
  
  rooms[roomId] = {
    id: roomId,
    players: {},
    ai: null,
    walls,
    grid,
    cols,
    rows,
    key: { x: keyPos.x, y: keyPos.y, collected: false, collectedBy: null },
    exit: { x: exitPos.x, y: exitPos.y },
    spawn: { x: spawn.x, y: spawn.y },
    aiSpawn: { x: aiSpawn.x, y: aiSpawn.y },
    creatorId: options.creatorId || null,
    creatorName: options.creatorName || 'Unknown',
    monsterType: options.monsterType || 'ai', // 'ai' or 'player'
    monsterPlayerId: null,
    status: 'waiting', // waiting, playing, finished
    maxPlayers: MAX_ROOM_SIZE,
    started: false,
    gameLoop: null,
    aiState: {
      x: aiSpawn.x,
      y: aiSpawn.y,
      targetId: null,
      speed: 2.5,
      path: [],
      lastPathUpdate: 0,
      visible: false
    }
  };
  
  return rooms[roomId];
}

function getRoomList() {
  return Object.values(rooms).map(r => ({
    id: r.id,
    creatorName: r.creatorName,
    monsterType: r.monsterType,
    playerCount: Object.keys(r.players).length,
    maxPlayers: r.maxPlayers,
    status: r.status
  }));
}

function startGameLoop(roomId) {
  const room = rooms[roomId];
  if (!room || room.gameLoop) return;
  
  room.status = 'playing';
  room.started = true;
  
  // Broadcast game start
  io.to(roomId).emit('gameStart', {
    walls: room.walls,
    key: room.key,
    exit: room.exit,
    cols: room.cols,
    rows: room.rows,
    tileSize: TILE_SIZE,
    ai: room.aiState
  });
  
  const TICK = 50; // 20fps server
  room.gameLoop = setInterval(() => {
    if (!rooms[roomId]) { clearInterval(room.gameLoop); return; }
    updateAI(roomId);
    // Broadcast state
    io.to(roomId).emit('gameState', {
      players: room.players,
      ai: room.monsterType === 'ai' ? room.aiState : null,
      key: room.key,
      monsterPlayerId: room.monsterPlayerId
    });
  }, TICK);
}

function updateAI(roomId) {
  const room = rooms[roomId];
  if (!room || room.monsterType !== 'ai') return;
  
  const ai = room.aiState;
  const playerList = Object.values(room.players);
  if (playerList.length === 0) return;
  
  // Find nearest player
  let nearest = null, minDist = Infinity;
  for (const p of playerList) {
    const d = Math.hypot(p.x - ai.x, p.y - ai.y);
    if (d < minDist) { minDist = d; nearest = p; }
  }
  if (!nearest) return;
  
  ai.targetId = nearest.id;
  
  const now = Date.now();
  // Simple pursuit - move towards target
  const dx = nearest.x - ai.x;
  const dy = nearest.y - ai.y;
  const dist = Math.hypot(dx, dy);
  
  if (dist > 5) {
    const spd = ai.speed;
    let nx = ai.x + (dx/dist)*spd;
    let ny = ai.y + (dy/dist)*spd;
    
    // Wall collision
    if (!checkWallCollision(room, nx, ai.y, 20)) ai.x = nx;
    if (!checkWallCollision(room, ai.x, ny, 20)) ai.y = ny;
  }
  
  // Check catch
  if (dist < 40) {
    io.to(roomId).emit('playerCaught', { playerId: nearest.id });
    // Remove caught player after delay
    setTimeout(() => {
      if (rooms[roomId] && rooms[roomId].players[nearest.id]) {
        delete rooms[roomId].players[nearest.id];
        io.to(nearest.id).emit('youDied');
        io.to(roomId).emit('playerLeft', { id: nearest.id });
      }
    }, 500);
  }
}

function checkWallCollision(room, x, y, radius) {
  const { walls } = room;
  for (const w of walls) {
    if (x + radius > w.x && x - radius < w.x + w.w &&
        y + radius > w.y && y - radius < w.y + w.h) {
      return true;
    }
  }
  return false;
}

let roomCounter = 0;

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);
  
  // Rejoin on reconnect
  socket.on('rejoin', ({ roomId, playerData }) => {
    if (rooms[roomId] && playerData) {
      socket.join(roomId);
      rooms[roomId].players[socket.id] = { ...playerData, id: socket.id };
      players[socket.id] = { roomId, ...playerData };
      socket.emit('rejoined', {
        room: rooms[roomId],
        players: rooms[roomId].players,
        ai: rooms[roomId].aiState
      });
    }
  });
  
  socket.on('getRooms', () => {
    socket.emit('roomList', getRoomList());
  });
  
  socket.on('quickPlay', ({ name }) => {
    // Find available room or create new
    let targetRoom = Object.values(rooms).find(r => 
      r.status === 'waiting' && 
      Object.keys(r.players).length < r.maxPlayers
    );
    
    if (!targetRoom) {
      const roomId = 'room_' + (++roomCounter);
      targetRoom = createRoom(roomId, { 
        creatorId: socket.id, 
        creatorName: name,
        monsterType: 'ai'
      });
    }
    
    joinRoom(socket, targetRoom.id, name);
    
    // Auto start if first join or after 3s
    clearTimeout(targetRoom._startTimer);
    targetRoom._startTimer = setTimeout(() => {
      if (rooms[targetRoom.id] && !rooms[targetRoom.id].started) {
        startGameLoop(targetRoom.id);
      }
    }, 3000);
  });
  
  socket.on('createRoom', ({ name, monsterType }) => {
    const roomId = 'room_' + (++roomCounter);
    const room = createRoom(roomId, { creatorId: socket.id, creatorName: name, monsterType });
    joinRoom(socket, roomId, name);
    socket.emit('roomCreated', { roomId });
    io.emit('roomListUpdate', getRoomList());
  });
  
  socket.on('joinRoom', ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room) { socket.emit('error', 'Room not found'); return; }
    if (Object.keys(room.players).length >= room.maxPlayers) { socket.emit('error', 'Room full'); return; }
    joinRoom(socket, roomId, name);
  });
  
  socket.on('playerMove', ({ x, y, vx, vy, dir, state }) => {
    const p = players[socket.id];
    if (!p || !rooms[p.roomId]) return;
    const room = rooms[p.roomId];
    
    // Server-side validation (basic)
    const prev = room.players[socket.id];
    if (!prev) return;
    
    const maxMove = 10;
    const dx = Math.abs(x - prev.x);
    const dy = Math.abs(y - prev.y);
    if (dx > maxMove * 2 || dy > maxMove * 2) return; // teleport protection
    
    // Wall collision check
    if (!checkWallCollision(room, x, y, 18)) {
      room.players[socket.id] = { ...prev, x, y, vx, vy, dir, state };
    }
    
    // Check key pickup
    if (!room.key.collected) {
      const kd = Math.hypot(x - room.key.x, y - room.key.y);
      if (kd < 40) {
        room.key.collected = true;
        room.key.collectedBy = socket.id;
        io.to(p.roomId).emit('keyCollected', { playerId: socket.id, playerName: prev.name });
      }
    }
    
    // Check exit
    if (room.key.collected && room.key.collectedBy === socket.id) {
      const ed = Math.hypot(x - room.exit.x, y - room.exit.y);
      if (ed < 50) {
        io.to(p.roomId).emit('playerEscaped', { playerId: socket.id, playerName: prev.name });
        endRoom(p.roomId);
      }
    }
  });
  
  socket.on('monsterMove', ({ x, y, dir, state }) => {
    const p = players[socket.id];
    if (!p || !rooms[p.roomId]) return;
    const room = rooms[p.roomId];
    if (room.monsterType === 'player' && room.monsterPlayerId === socket.id) {
      // Update monster position
      room.aiState.x = x;
      room.aiState.y = y;
    }
  });
  
  socket.on('disconnect', () => {
    const p = players[socket.id];
    if (p && rooms[p.roomId]) {
      delete rooms[p.roomId].players[socket.id];
      io.to(p.roomId).emit('playerLeft', { id: socket.id });
      
      // If room empty, cleanup
      const room = rooms[p.roomId];
      if (Object.keys(room.players).length === 0) {
        if (room.gameLoop) clearInterval(room.gameLoop);
        delete rooms[p.roomId];
        io.emit('roomListUpdate', getRoomList());
      }
    }
    delete players[socket.id];
  });
});

function joinRoom(socket, roomId, name) {
  const room = rooms[roomId];
  socket.join(roomId);
  
  const spawn = room.spawn;
  // Randomize spawn a bit
  const sx = spawn.x + (Math.random()-0.5)*100;
  const sy = spawn.y + (Math.random()-0.5)*100;
  
  room.players[socket.id] = {
    id: socket.id,
    name,
    x: sx, y: sy,
    vx: 0, vy: 0,
    dir: 'down',
    state: 'idle',
    hasKey: false,
    escaped: false
  };
  
  players[socket.id] = { roomId, name };
  
  // If monster type is player and no monster yet, assign
  if (room.monsterType === 'player' && !room.monsterPlayerId) {
    room.monsterPlayerId = socket.id;
    socket.emit('youAreMonster', { spawn: room.aiSpawn });
    room.players[socket.id].x = room.aiSpawn.x;
    room.players[socket.id].y = room.aiSpawn.y;
    room.players[socket.id].isMonster = true;
  }
  
  socket.emit('joinedRoom', {
    roomId,
    playerId: socket.id,
    isMonster: room.monsterPlayerId === socket.id,
    room: {
      walls: room.walls,
      key: room.key,
      exit: room.exit,
      cols: room.cols,
      rows: room.rows,
      tileSize: TILE_SIZE,
      ai: room.aiState,
      monsterType: room.monsterType,
      monsterPlayerId: room.monsterPlayerId,
      status: room.status
    },
    players: room.players,
    spawn: { x: sx, y: sy }
  });
  
  socket.to(roomId).emit('playerJoined', room.players[socket.id]);
  io.emit('roomListUpdate', getRoomList());
  
  // Auto start when full
  if (Object.keys(room.players).length >= room.maxPlayers && !room.started) {
    startGameLoop(roomId);
  }
}

function endRoom(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  if (room.gameLoop) clearInterval(room.gameLoop);
  io.to(roomId).emit('gameOver', { reason: 'escaped' });
  setTimeout(() => {
    delete rooms[roomId];
    io.emit('roomListUpdate', getRoomList());
  }, 5000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Backrooms server running on port ${PORT}`));

// Keep alive for Render free tier
setInterval(() => {
  console.log('Heartbeat - rooms:', Object.keys(rooms).length, 'players:', Object.keys(players).length);
}, 30000);

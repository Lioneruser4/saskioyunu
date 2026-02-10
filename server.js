const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static('public'));

const rooms = new Map();
const players = new Map();

const ROOM_CAPACITY = 10;
const MAP_SIZE = 200;

// Random character types
const CHARACTER_TYPES = [
  { color: '#FF6B6B', name: 'Warrior' },
  { color: '#4ECDC4', name: 'Scout' },
  { color: '#FFE66D', name: 'Medic' },
  { color: '#95E1D3', name: 'Tank' },
  { color: '#F38181', name: 'Sniper' },
  { color: '#AA96DA', name: 'Engineer' },
  { color: '#FCBAD3', name: 'Assassin' },
  { color: '#A8E6CF', name: 'Support' }
];

function createRoom(roomId, password = null) {
  rooms.set(roomId, {
    id: roomId,
    password: password,
    players: new Map(),
    messages: [],
    maxPlayers: ROOM_CAPACITY
  });
  return rooms.get(roomId);
}

function getRandomPosition() {
  return {
    x: (Math.random() - 0.5) * MAP_SIZE,
    y: 1,
    z: (Math.random() - 0.5) * MAP_SIZE
  };
}

function getRandomCharacter() {
  return CHARACTER_TYPES[Math.floor(Math.random() * CHARACTER_TYPES.length)];
}

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('get_rooms', () => {
    const roomsList = Array.from(rooms.values()).map(room => ({
      id: room.id,
      playerCount: room.players.size,
      maxPlayers: room.maxPlayers,
      hasPassword: !!room.password
    }));
    socket.emit('rooms_list', roomsList);
  });

  socket.on('create_room', ({ roomName, password, telegramData }) => {
    const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    createRoom(roomId, password);
    socket.emit('room_created', { roomId });
  });

  socket.on('join_lobby', ({ telegramData }) => {
    const character = getRandomCharacter();
    const playerData = {
      id: socket.id,
      username: telegramData?.username || `Player${Math.floor(Math.random() * 9999)}`,
      firstName: telegramData?.first_name || 'Guest',
      character: character,
      health: 100,
      inLobby: true
    };
    
    players.set(socket.id, playerData);
    socket.emit('lobby_joined', { 
      player: playerData,
      rooms: Array.from(rooms.values()).map(room => ({
        id: room.id,
        playerCount: room.players.size,
        maxPlayers: room.maxPlayers,
        hasPassword: !!room.password
      }))
    });
  });

  socket.on('join_random_room', ({ telegramData }) => {
    // Find or create a public room with space
    let targetRoom = null;
    
    for (const room of rooms.values()) {
      if (!room.password && room.players.size < room.maxPlayers) {
        targetRoom = room;
        break;
      }
    }

    if (!targetRoom) {
      const roomId = `public_${Date.now()}`;
      targetRoom = createRoom(roomId);
    }

    joinRoom(socket, targetRoom.id, null, telegramData);
  });

  socket.on('join_room', ({ roomId, password, telegramData }) => {
    joinRoom(socket, roomId, password, telegramData);
  });

  function joinRoom(socket, roomId, password, telegramData) {
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (room.password && room.password !== password) {
      socket.emit('error', { message: 'Invalid password' });
      return;
    }

    if (room.players.size >= room.maxPlayers) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    const position = getRandomPosition();
    const character = getRandomCharacter();
    
    const playerData = {
      id: socket.id,
      roomId: roomId,
      username: telegramData?.username || `Player${Math.floor(Math.random() * 9999)}`,
      firstName: telegramData?.first_name || 'Guest',
      position: position,
      rotation: { x: 0, y: 0, z: 0 },
      character: character,
      health: 100,
      kills: 0,
      deaths: 0
    };

    players.set(socket.id, playerData);
    room.players.set(socket.id, playerData);
    socket.join(roomId);

    // Send current players to new player
    const currentPlayers = Array.from(room.players.values());
    socket.emit('room_joined', {
      roomId: roomId,
      player: playerData,
      players: currentPlayers
    });

    // Notify others
    socket.to(roomId).emit('player_joined', playerData);
  }

  socket.on('player_move', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    player.position = data.position;
    player.rotation = data.rotation;

    socket.to(player.roomId).emit('player_moved', {
      id: socket.id,
      position: data.position,
      rotation: data.rotation
    });
  });

  socket.on('player_shoot', () => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    socket.to(player.roomId).emit('player_shot', {
      id: socket.id,
      position: player.position,
      rotation: player.rotation
    });
  });

  socket.on('player_hit', ({ targetId, damage }) => {
    const shooter = players.get(socket.id);
    const target = players.get(targetId);
    
    if (!shooter || !target || shooter.roomId !== target.roomId) return;

    target.health -= damage;

    if (target.health <= 0) {
      target.health = 0;
      target.deaths++;
      shooter.kills++;

      // Respawn after 3 seconds
      io.to(targetId).emit('player_died', { killerId: socket.id });
      
      setTimeout(() => {
        target.health = 100;
        target.position = getRandomPosition();
        
        io.to(target.roomId).emit('player_respawned', {
          id: targetId,
          position: target.position,
          health: target.health
        });
      }, 3000);
    }

    io.to(target.roomId).emit('player_damaged', {
      id: targetId,
      health: target.health,
      shooterId: socket.id
    });
  });

  socket.on('chat_message', ({ message }) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const chatMsg = {
      id: Date.now(),
      playerId: socket.id,
      username: player.username,
      message: message,
      timestamp: Date.now()
    };

    io.to(player.roomId).emit('chat_message', chatMsg);
  });

  socket.on('leave_room', () => {
    leaveRoom(socket);
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    leaveRoom(socket);
    players.delete(socket.id);
  });

  function leaveRoom(socket) {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;

    const room = rooms.get(player.roomId);
    if (room) {
      room.players.delete(socket.id);
      socket.to(player.roomId).emit('player_left', { id: socket.id });

      // Delete empty rooms (except persistent public ones)
      if (room.players.size === 0 && !room.id.startsWith('public_')) {
        rooms.delete(player.roomId);
      }
    }

    socket.leave(player.roomId);
    player.roomId = null;
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

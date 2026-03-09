const express = require(‘express’);
const http = require(‘http’);
const WebSocket = require(‘ws’);
const path = require(‘path’);

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(__dirname));
app.get(’/’, (req, res) => res.sendFile(path.join(__dirname, ‘index.html’)));

// Game State Management
const gameState = {
rooms: new Map(),
players: new Map(),
nextRoomId: 1
};

class GameRoom {
constructor(id) {
this.id = id;
this.players = new Map();
this.maxPlayers = 10;
this.gameStarted = false;
this.creatorId = null;
this.creatorName = ‘Unknown’;
this.monsterType = ‘ai’;
this.monsterId = null;
this.keyPosition = { x: Math.random() * 2800 + 100, y: Math.random() * 2800 + 100 };
this.keyCollected = false;
this.keyCollectorId = null;
this.width = 3000;
this.height = 3000;
this.walls = this.generateWalls();
this.spawnPoints = this.generateSpawns();
this.createdAt = Date.now();
}

generateWalls() {
const walls = [];
walls.push({ x: 0, y: 0, w: this.width, h: 50 });
walls.push({ x: 0, y: this.height - 50, w: this.width, h: 50 });
walls.push({ x: 0, y: 0, w: 50, h: this.height });
walls.push({ x: this.width - 50, y: 0, w: 50, h: this.height });

```
for (let i = 1; i < 5; i++) {
  walls.push({ x: i * 600, y: 0, w: 50, h: this.height });
  walls.push({ x: 0, y: i * 600, w: this.width, h: 50 });
}
return walls;
```

}

generateSpawns() {
const spawns = [];
for (let i = 0; i < this.maxPlayers; i++) {
spawns.push({
x: Math.random() * 400 + 100,
y: Math.random() * 400 + 100
});
}
return spawns;
}

addPlayer(id, data) {
this.players.set(id, data);
if (this.players.size === 1) {
this.creatorId = id;
this.creatorName = data.username;
}
}

removePlayer(id) {
this.players.delete(id);
if (this.monsterId === id) {
this.monsterId = null;
this.gameStarted = false;
}
}

isFull() {
return this.players.size >= this.maxPlayers;
}

canJoin() {
return !this.isFull() && !this.gameStarted;
}

startGame() {
if (this.players.size < 1) return false;
this.gameStarted = true;

```
if (this.monsterType === 'ai') {
  this.monsterId = 'monster_' + this.id;
} else {
  const ids = Array.from(this.players.keys());
  this.monsterId = ids[Math.floor(Math.random() * ids.length)];
}
return true;
```

}

getRoomInfo() {
return {
id: this.id,
playerCount: this.players.size,
maxPlayers: this.maxPlayers,
isFull: this.isFull(),
gameStarted: this.gameStarted,
creatorName: this.creatorName,
monsterType: this.monsterType === ‘ai’ ? ‘Bot’ : ‘Player’
};
}
}

// WebSocket Connection Handler
const clients = new Map();

wss.on(‘connection’, (ws) => {
let clientId = null;
let roomId = null;
let clientData = null;

ws.on(‘message’, (data) => {
try {
const msg = JSON.parse(data);

```
  if (msg.type === 'INIT') {
    clientId = msg.id;
    clientData = {
      id: clientId,
      username: msg.username,
      avatar: '👤',
      ws: ws
    };
    clients.set(clientId, clientData);
    ws.send(JSON.stringify({ type: 'INIT_SUCCESS', id: clientId }));
  }

  else if (msg.type === 'GET_ROOMS') {
    const rooms = Array.from(gameState.rooms.values()).map(r => r.getRoomInfo());
    ws.send(JSON.stringify({ type: 'ROOMS_LIST', rooms }));
  }

  else if (msg.type === 'CREATE_ROOM') {
    const newId = gameState.nextRoomId++;
    const room = new GameRoom(newId);
    gameState.rooms.set(newId, room);
    roomId = newId;

    const spawn = room.spawnPoints[0];
    room.addPlayer(clientId, {
      id: clientId,
      username: msg.username,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      alive: true,
      hasKey: false
    });

    ws.send(JSON.stringify({
      type: 'ROOM_CREATED',
      roomId: newId,
      room: room.getRoomInfo(),
      layout: {
        width: room.width,
        height: room.height,
        walls: room.walls,
        keyPos: room.keyPosition,
        spawns: room.spawnPoints,
        players: Array.from(room.players.values())
      }
    }));

    broadcast({ type: 'ROOM_UPDATED', rooms: Array.from(gameState.rooms.values()).map(r => r.getRoomInfo()) });
  }

  else if (msg.type === 'JOIN_ROOM') {
    const room = gameState.rooms.get(msg.roomId);
    if (room && room.canJoin()) {
      roomId = msg.roomId;
      const spawn = room.spawnPoints[room.players.size] || room.spawnPoints[0];
      
      room.addPlayer(clientId, {
        id: clientId,
        username: msg.username,
        x: spawn.x,
        y: spawn.y,
        vx: 0,
        vy: 0,
        alive: true,
        hasKey: false
      });

      ws.send(JSON.stringify({
        type: 'ROOM_JOINED',
        roomId: msg.roomId,
        layout: {
          width: room.width,
          height: room.height,
          walls: room.walls,
          keyPos: room.keyPosition,
          spawns: room.spawnPoints,
          players: Array.from(room.players.values())
        }
      }));

      broadcastRoom(msg.roomId, {
        type: 'PLAYER_JOINED',
        player: room.players.get(clientId),
        count: room.players.size
      });

      if (room.isFull()) {
        broadcast({ type: 'ROOM_FULL', roomId: msg.roomId });
      }
    }
  }

  else if (msg.type === 'START_GAME') {
    const room = gameState.rooms.get(msg.roomId);
    if (room) {
      room.monsterType = msg.monsterType || 'ai';
      if (room.startGame()) {
        broadcastRoom(msg.roomId, {
          type: 'GAME_START',
          monsterId: room.monsterId,
          isAI: room.monsterType === 'ai'
        });
      }
    }
  }

  else if (msg.type === 'PLAYER_MOVE') {
    const room = gameState.rooms.get(msg.roomId);
    if (room && room.players.has(clientId)) {
      const p = room.players.get(clientId);
      p.x = msg.x;
      p.y = msg.y;
      p.vx = msg.vx;
      p.vy = msg.vy;
      p.anim = msg.anim;

      broadcastRoom(msg.roomId, {
        type: 'PLAYER_MOVE',
        playerId: clientId,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        anim: p.anim
      });
    }
  }

  else if (msg.type === 'MONSTER_MOVE') {
    broadcastRoom(msg.roomId, {
      type: 'MONSTER_MOVE',
      x: msg.x,
      y: msg.y,
      anim: msg.anim
    });
  }

  else if (msg.type === 'KEY_COLLECTED') {
    const room = gameState.rooms.get(msg.roomId);
    if (room) {
      room.keyCollected = true;
      room.keyCollectorId = clientId;
      broadcastRoom(msg.roomId, {
        type: 'KEY_COLLECTED',
        playerId: clientId
      });
    }
  }

  else if (msg.type === 'PLAYER_CAUGHT') {
    const room = gameState.rooms.get(msg.roomId);
    if (room && room.players.has(msg.targetId)) {
      const p = room.players.get(msg.targetId);
      p.alive = false;
      broadcastRoom(msg.roomId, {
        type: 'PLAYER_CAUGHT',
        playerId: msg.targetId
      });
    }
  }

  else if (msg.type === 'ESCAPE') {
    const room = gameState.rooms.get(msg.roomId);
    if (room) {
      broadcastRoom(msg.roomId, {
        type: 'PLAYER_ESCAPED',
        playerId: clientId,
        username: msg.username
      });
      room.gameStarted = false;
    }
  }

  else if (msg.type === 'LEAVE_ROOM') {
    if (roomId) {
      const room = gameState.rooms.get(roomId);
      if (room) {
        room.removePlayer(clientId);
        broadcastRoom(roomId, {
          type: 'PLAYER_LEFT',
          playerId: clientId,
          count: room.players.size
        });

        if (room.players.size === 0) {
          gameState.rooms.delete(roomId);
        }
      }
      roomId = null;
    }
  }
} catch (e) {
  console.error('Message error:', e);
}
```

});

ws.on(‘close’, () => {
if (roomId) {
const room = gameState.rooms.get(roomId);
if (room) {
room.removePlayer(clientId);
broadcastRoom(roomId, {
type: ‘PLAYER_LEFT’,
playerId: clientId,
count: room.players.size
});
if (room.players.size === 0) {
gameState.rooms.delete(roomId);
}
}
}
clients.delete(clientId);
});
});

function broadcastRoom(roomId, msg) {
clients.forEach((client) => {
if (client.ws.readyState === WebSocket.OPEN) {
try {
client.ws.send(JSON.stringify(msg));
} catch (e) {}
}
});
}

function broadcast(msg) {
clients.forEach((client) => {
if (client.ws.readyState === WebSocket.OPEN) {
try {
client.ws.send(JSON.stringify(msg));
} catch (e) {}
}
});
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
console.log(`🎮 THE BACKROOMS Server running on port ${PORT}`);
});

const express = require(‘express’);
const http = require(‘http’);
const WebSocket = require(‘ws’);
const path = require(‘path’);

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(__dirname));
app.get(’/’, (req, res) => res.sendFile(path.join(__dirname, ‘index.html’)));

// Oyun State
const gameState = {
rooms: {},
players: {},
nextRoomId: 1
};

// Oda Yönetimi
class GameRoom {
constructor(id) {
this.id = id;
this.players = new Map();
this.maxPlayers = 10;
this.monsterType = ‘ai’; // ‘ai’ veya random player seçimi
this.monsterId = null;
this.gameStarted = false;
this.keyPosition = { x: 0, y: 0 };
this.keyCollected = false;
this.keyCollectorId = null;
this.activeSince = Date.now();
this.generateLayout();
this.spawnPositions = this.generateSpawnPositions();
}

generateLayout() {
this.width = 3000;
this.height = 3000;
this.walls = [];

```
// Duvarlar
this.walls.push({ x: 0, y: 0, width: this.width, height: 50 }); // Üst
this.walls.push({ x: 0, y: this.height - 50, width: this.width, height: 50 }); // Alt
this.walls.push({ x: 0, y: 0, width: 50, height: this.height }); // Sol
this.walls.push({ x: this.width - 50, y: 0, width: 50, height: this.height }); // Sağ

// İç duvarlar (backrooms efekti)
for (let i = 1; i < 4; i++) {
  this.walls.push({ x: i * 600, y: 0, width: 50, height: this.height });
  this.walls.push({ x: 0, y: i * 600, width: this.width, height: 50 });
}

// Anahtar konumu
this.keyPosition = {
  x: Math.random() * (this.width - 100) + 50,
  y: Math.random() * (this.height - 100) + 50
};
```

}

generateSpawnPositions() {
const positions = [];
const gridSize = 10;
for (let i = 0; i < this.maxPlayers; i++) {
positions.push({
x: Math.random() * 500 + 100,
y: Math.random() * 500 + 100
});
}
return positions;
}

isSpaceFull() {
return this.players.size >= this.maxPlayers;
}

canJoin() {
return !this.isSpaceFull() && !this.gameStarted;
}

addPlayer(id, playerData) {
this.players.set(id, playerData);
}

removePlayer(id) {
this.players.delete(id);
if (this.monsterId === id) {
this.monsterId = null;
this.gameStarted = false;
}
}

getPlayerCount() {
return this.players.size;
}

startGame() {
if (this.players.size < 2) return false;

```
this.gameStarted = true;

// Monster seçimi
const playerIds = Array.from(this.players.keys());
if (this.monsterType === 'ai') {
  this.monsterId = 'ai_monster_' + this.id;
} else {
  this.monsterId = playerIds[Math.floor(Math.random() * playerIds.length)];
}

return true;
```

}

getRoomInfo() {
return {
id: this.id,
playerCount: this.players.size,
maxPlayers: this.maxPlayers,
isFull: this.isSpaceFull(),
gameStarted: this.gameStarted,
creatorName: Array.from(this.players.values())[0]?.username || ‘Unknown’,
monsterType: this.monsterType === ‘ai’ ? ‘Bot’ : ‘Player’
};
}
}

// WebSocket Bağlantıları
const clients = new Map();

wss.on(‘connection’, (ws) => {
let clientId = null;
let currentRoomId = null;

ws.on(‘message’, (data) => {
try {
const message = JSON.parse(data);

```
  switch (message.type) {
    case 'INIT':
      clientId = message.clientId;
      clients.set(clientId, {
        ws,
        userData: message.userData,
        roomId: null
      });
      ws.send(JSON.stringify({ type: 'INIT_SUCCESS', clientId }));
      break;

    case 'GET_ROOMS':
      const roomsList = Array.from(gameState.rooms.values()).map(r => r.getRoomInfo());
      ws.send(JSON.stringify({ type: 'ROOMS_LIST', rooms: roomsList }));
      break;

    case 'CREATE_ROOM':
      const newRoomId = gameState.nextRoomId++;
      const newRoom = new GameRoom(newRoomId);
      gameState.rooms.set(newRoomId, newRoom);
      currentRoomId = newRoomId;
      
      const clientData = clients.get(clientId);
      const spawnPos = newRoom.spawnPositions[0];
      
      newRoom.addPlayer(clientId, {
        id: clientId,
        username: message.username || clientData?.userData?.username || 'Player',
        x: spawnPos.x,
        y: spawnPos.y,
        vx: 0,
        vy: 0,
        alive: true,
        isMonster: false,
        avatar: message.avatar || '👤'
      });

      broadcastToRoom(newRoomId, {
        type: 'ROOM_CREATED',
        room: newRoom.getRoomInfo(),
        roomData: {
          layout: newRoom.walls,
          keyPosition: newRoom.keyPosition,
          width: newRoom.width,
          height: newRoom.height
        },
        players: Array.from(newRoom.players.values())
      });
      break;

    case 'JOIN_ROOM':
      const room = gameState.rooms.get(message.roomId);
      if (room && room.canJoin()) {
        currentRoomId = message.roomId;
        const spawnPos = room.spawnPositions[room.players.size];
        
        const newPlayer = {
          id: clientId,
          username: message.username || clients.get(clientId)?.userData?.username || 'Player',
          x: spawnPos?.x || 200,
          y: spawnPos?.y || 200,
          vx: 0,
          vy: 0,
          alive: true,
          isMonster: false,
          avatar: message.avatar || '👤'
        };
        
        room.addPlayer(clientId, newPlayer);
        broadcastToRoom(message.roomId, {
          type: 'PLAYER_JOINED',
          player: newPlayer,
          totalPlayers: room.players.size,
          roomInfo: room.getRoomInfo()
        });

        // Eğer oda dolu ise yeni oda oluştur
        if (room.isSpaceFull()) {
          const nextRoom = new GameRoom(gameState.nextRoomId++);
          gameState.rooms.set(nextRoom.id, nextRoom);
          broadcastToAll({
            type: 'NEW_ROOM_CREATED',
            room: nextRoom.getRoomInfo()
          });
        }
      }
      break;

    case 'START_GAME':
      const gameRoom = gameState.rooms.get(message.roomId);
      if (gameRoom && !gameRoom.gameStarted) {
        gameRoom.monsterType = message.monsterType || 'ai';
        if (gameRoom.startGame()) {
          broadcastToRoom(message.roomId, {
            type: 'GAME_STARTED',
            monsterId: gameRoom.monsterId,
            isAI: gameRoom.monsterType === 'ai',
            keyPosition: gameRoom.keyPosition
          });
        }
      }
      break;

    case 'PLAYER_MOVE':
      const moveRoom = gameState.rooms.get(message.roomId);
      if (moveRoom && moveRoom.players.has(clientId)) {
        const player = moveRoom.players.get(clientId);
        player.x = Math.max(40, Math.min(moveRoom.width - 40, message.x));
        player.y = Math.max(40, Math.min(moveRoom.height - 40, message.y));
        player.vx = message.vx;
        player.vy = message.vy;
        player.animation = message.animation;

        broadcastToRoom(message.roomId, {
          type: 'PLAYER_UPDATED',
          player: {
            id: clientId,
            x: player.x,
            y: player.y,
            vx: player.vx,
            vy: player.vy,
            animation: player.animation,
            username: player.username,
            avatar: player.avatar
          }
        });
      }
      break;

    case 'MONSTER_MOVE':
      const monsterRoom = gameState.rooms.get(message.roomId);
      if (monsterRoom && monsterRoom.gameStarted) {
        broadcastToRoom(message.roomId, {
          type: 'MONSTER_UPDATED',
          x: message.x,
          y: message.y,
          animation: message.animation
        });
      }
      break;

    case 'KEY_COLLECTED':
      const keyRoom = gameState.rooms.get(message.roomId);
      if (keyRoom) {
        keyRoom.keyCollected = true;
        keyRoom.keyCollectorId = clientId;
        broadcastToRoom(message.roomId, {
          type: 'KEY_COLLECTED',
          collectingPlayerId: clientId
        });
      }
      break;

    case 'PLAYER_CAUGHT':
      const caughtRoom = gameState.rooms.get(message.roomId);
      if (caughtRoom && caughtRoom.players.has(message.targetId)) {
        const caughtPlayer = caughtRoom.players.get(message.targetId);
        caughtPlayer.alive = false;

        broadcastToRoom(message.roomId, {
          type: 'PLAYER_CAUGHT',
          playerId: message.targetId,
          by: clientId
        });

        // Tüm oyuncular öldüyse
        const alivePlayers = Array.from(caughtRoom.players.values()).filter(p => p.alive);
        if (alivePlayers.length <= 1) {
          broadcastToRoom(message.roomId, {
            type: 'GAME_OVER',
            survivors: alivePlayers.map(p => ({ id: p.id, username: p.username }))
          });
          caughtRoom.gameStarted = false;
        }
      }
      break;

    case 'GAME_WON':
      broadcastToRoom(message.roomId, {
        type: 'PLAYERS_ESCAPED',
        escapedPlayers: message.players
      });
      const winRoom = gameState.rooms.get(message.roomId);
      if (winRoom) {
        winRoom.gameStarted = false;
      }
      break;

    case 'LEAVE_ROOM':
      if (currentRoomId) {
        const leftRoom = gameState.rooms.get(currentRoomId);
        if (leftRoom) {
          leftRoom.removePlayer(clientId);
          broadcastToRoom(currentRoomId, {
            type: 'PLAYER_LEFT',
            playerId: clientId,
            remainingPlayers: leftRoom.players.size
          });

          // Oda boşsa sil
          if (leftRoom.players.size === 0) {
            gameState.rooms.delete(currentRoomId);
          }
        }
      }
      currentRoomId = null;
      break;
  }
} catch (err) {
  console.error('Message error:', err);
}
```

});

ws.on(‘close’, () => {
if (clientId && currentRoomId) {
const room = gameState.rooms.get(currentRoomId);
if (room) {
room.removePlayer(clientId);
broadcastToRoom(currentRoomId, {
type: ‘PLAYER_LEFT’,
playerId: clientId
});

```
    if (room.players.size === 0) {
      gameState.rooms.delete(currentRoomId);
    }
  }
}
clients.delete(clientId);
```

});

ws.on(‘error’, (err) => console.error(‘WebSocket error:’, err));
});

function broadcastToRoom(roomId, message) {
clients.forEach((client) => {
if (client.roomId === roomId && client.ws.readyState === WebSocket.OPEN) {
client.ws.send(JSON.stringify(message));
}
});
}

function broadcastToAll(message) {
clients.forEach((client) => {
if (client.ws.readyState === WebSocket.OPEN) {
client.ws.send(JSON.stringify(message));
}
});
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
console.log(`🎮 Backrooms Server çalışıyor: http://localhost:${PORT}`);
});

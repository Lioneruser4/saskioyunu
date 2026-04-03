const express = require(‘express’);
const http = require(‘http’);
const { Server } = require(‘socket.io’);
const path = require(‘path’);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
cors: { origin: ‘*’ },
pingInterval: 2000,
pingTimeout: 5000
});

app.use(express.static(path.join(__dirname, ‘public’)));
app.get(’/’, (req, res) => res.sendFile(path.join(__dirname, ‘public’, ‘index.html’)));

// ─── CONSTANTS ───────────────────────────────────────────────
const TICK_RATE = 60;          // ms per server tick
const MAP_W = 2400;
const MAP_H = 1800;
const PLAYER_SPEED = 180;      // px/s
const BULLET_SPEED = 700;
const BULLET_MAX_DIST = 1400;
const PLAYER_RADIUS = 18;
const PLAYER_HP = 100;
const RESPAWN_TIME = 4000;     // ms
const WIN_KILLS = 15;
const LOBBY_MIN_PLAYERS = 2;

// ─── MAP WALLS ────────────────────────────────────────────────
const WALLS = [
// Outer boundary
{ x: 0,    y: 0,    w: MAP_W, h: 20   },
{ x: 0,    y: MAP_H-20, w: MAP_W, h: 20 },
{ x: 0,    y: 0,    w: 20,   h: MAP_H },
{ x: MAP_W-20, y: 0, w: 20, h: MAP_H },

// Center structure
{ x: 1050, y: 750,  w: 300, h: 300 },

// Left area
{ x: 180,  y: 180,  w: 220, h: 30  },
{ x: 180,  y: 180,  w: 30,  h: 200 },
{ x: 180,  y: 550,  w: 220, h: 30  },
{ x: 180,  y: 750,  w: 30,  h: 200 },
{ x: 180,  y: 950,  w: 220, h: 30  },
{ x: 180,  y: 1200, w: 220, h: 30  },
{ x: 180,  y: 1200, w: 30,  h: 180 },
{ x: 180,  y: 1380, w: 220, h: 30  },

// Right area
{ x: 2000, y: 180,  w: 220, h: 30  },
{ x: 2190, y: 180,  w: 30,  h: 200 },
{ x: 2000, y: 550,  w: 220, h: 30  },
{ x: 2190, y: 750,  w: 30,  h: 200 },
{ x: 2000, y: 950,  w: 220, h: 30  },
{ x: 2000, y: 1200, w: 220, h: 30  },
{ x: 2190, y: 1200, w: 30,  h: 180 },
{ x: 2000, y: 1380, w: 220, h: 30  },

// Mid corridors
{ x: 600,  y: 400,  w: 30,  h: 280 },
{ x: 600,  y: 1120, w: 30,  h: 280 },
{ x: 1770, y: 400,  w: 30,  h: 280 },
{ x: 1770, y: 1120, w: 30,  h: 280 },

// Crates / covers
{ x: 450,  y: 820,  w: 90,  h: 90  },
{ x: 700,  y: 620,  w: 90,  h: 90  },
{ x: 700,  y: 1100, w: 90,  h: 90  },
{ x: 1600, y: 820,  w: 90,  h: 90  },
{ x: 1860, y: 620,  w: 90,  h: 90  },
{ x: 1860, y: 1100, w: 90,  h: 90  },
{ x: 1100, y: 480,  w: 200, h: 30  },
{ x: 1100, y: 1290, w: 200, h: 30  },
];

// ─── GAME STATE ───────────────────────────────────────────────
const rooms = {};   // roomId -> room object
const players = {}; // socketId -> player object

function createRoom(id) {
return {
id,
state: ‘lobby’,    // lobby | countdown | playing | ended
players: {},
bullets: [],
scores: { T: 0, CT: 0 },
countdown: 0,
startTime: 0,
bulletIdCounter: 0,
};
}

function createPlayer(socketId, name, room) {
const team = assignTeam(room);
const spawn = getSpawn(team, room);
return {
id: socketId,
name: name.substring(0, 16) || ‘Player’,
room: room.id,
team,
x: spawn.x,
y: spawn.y,
angle: 0,
hp: PLAYER_HP,
alive: true,
kills: 0,
deaths: 0,
vx: 0,
vy: 0,
input: { up: false, down: false, left: false, right: false, shoot: false, angle: 0 },
lastShot: 0,
respawnAt: 0,
flashAlpha: 0,
};
}

function assignTeam(room) {
const ps = Object.values(room.players);
const ts = ps.filter(p => p.team === ‘T’).length;
const cts = ps.filter(p => p.team === ‘CT’).length;
return ts <= cts ? ‘T’ : ‘CT’;
}

function getSpawn(team, room) {
const spawns = team === ‘T’
? [{ x: 280, y: 300 }, { x: 280, y: 900 }, { x: 280, y: 1500 }, { x: 500, y: 600 }, { x: 500, y: 1200 }]
: [{ x: 2120, y: 300 }, { x: 2120, y: 900 }, { x: 2120, y: 1500 }, { x: 1900, y: 600 }, { x: 1900, y: 1200 }];

// pick least crowded
const occ = Object.values(room.players).filter(p => p.alive && p.team === team);
for (const sp of spawns) {
const near = occ.some(p => dist(p, sp) < 80);
if (!near) return { x: sp.x, y: sp.y };
}
return spawns[Math.floor(Math.random() * spawns.length)];
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// ─── COLLISION ───────────────────────────────────────────────
function aabbCircle(cx, cy, r, wx, wy, ww, wh) {
const nearX = Math.max(wx, Math.min(cx, wx + ww));
const nearY = Math.max(wy, Math.min(cy, wy + wh));
return Math.hypot(cx - nearX, cy - nearY) < r;
}

function resolvePlayer(p) {
for (const w of WALLS) {
if (!aabbCircle(p.x, p.y, PLAYER_RADIUS, w.x, w.y, w.w, w.h)) continue;
// push out
const cx = w.x + w.w / 2;
const cy = w.y + w.h / 2;
const overlapX = (w.w / 2 + PLAYER_RADIUS) - Math.abs(p.x - cx);
const overlapY = (w.h / 2 + PLAYER_RADIUS) - Math.abs(p.y - cy);
if (overlapX < overlapY) {
p.x += p.x < cx ? -overlapX : overlapX;
} else {
p.y += p.y < cy ? -overlapY : overlapY;
}
}
p.x = Math.max(PLAYER_RADIUS + 20, Math.min(MAP_W - PLAYER_RADIUS - 20, p.x));
p.y = Math.max(PLAYER_RADIUS + 20, Math.min(MAP_H - PLAYER_RADIUS - 20, p.y));
}

function bulletHitsWall(b) {
return WALLS.some(w =>
b.x >= w.x && b.x <= w.x + w.w && b.y >= w.y && b.y <= w.y + w.h
);
}

// ─── SOCKET.IO ───────────────────────────────────────────────
const ROOM_ID = ‘main’; // single room for now
rooms[ROOM_ID] = createRoom(ROOM_ID);

io.on(‘connection’, socket => {
console.log(’+ connected:’, socket.id);

socket.on(‘join’, ({ name }) => {
const room = rooms[ROOM_ID];
const player = createPlayer(socket.id, name, room);
room.players[socket.id] = player;
players[socket.id] = player;
socket.join(ROOM_ID);

```
socket.emit('joined', {
  id: socket.id,
  team: player.team,
  walls: WALLS,
  mapW: MAP_W,
  mapH: MAP_H,
  room: sanitizeRoom(room),
});

io.to(ROOM_ID).emit('playerJoined', sanitizePlayer(player));

checkLobby(room);
```

});

socket.on(‘input’, (data) => {
const p = players[socket.id];
if (!p) return;
p.input = data;
});

socket.on(‘chat’, (msg) => {
const p = players[socket.id];
if (!p) return;
io.to(ROOM_ID).emit(‘chat’, { name: p.name, team: p.team, msg: String(msg).substring(0, 80) });
});

socket.on(‘disconnect’, () => {
const p = players[socket.id];
if (!p) return;
const room = rooms[p.room];
if (room) delete room.players[socket.id];
delete players[socket.id];
io.to(ROOM_ID).emit(‘playerLeft’, socket.id);
console.log(’- disconnected:’, socket.id);
});
});

function checkLobby(room) {
const count = Object.keys(room.players).length;
if (room.state === ‘lobby’ && count >= LOBBY_MIN_PLAYERS) {
startCountdown(room);
}
}

function startCountdown(room) {
room.state = ‘countdown’;
room.countdown = 5;
io.to(room.id).emit(‘countdown’, room.countdown);

const iv = setInterval(() => {
room.countdown–;
io.to(room.id).emit(‘countdown’, room.countdown);
if (room.countdown <= 0) {
clearInterval(iv);
startGame(room);
}
}, 1000);
}

function startGame(room) {
room.state = ‘playing’;
room.scores = { T: 0, CT: 0 };
room.bullets = [];
// respawn all
for (const p of Object.values(room.players)) {
const sp = getSpawn(p.team, room);
p.x = sp.x; p.y = sp.y;
p.hp = PLAYER_HP;
p.alive = true;
p.kills = 0;
p.deaths = 0;
}
io.to(room.id).emit(‘gameStart’, sanitizeRoom(room));
}

function endGame(room, winTeam) {
room.state = ‘ended’;
io.to(room.id).emit(‘gameEnd’, { winTeam, scores: room.scores, players: sanitizePlayers(room) });
setTimeout(() => resetRoom(room), 8000);
}

function resetRoom(room) {
room.state = ‘lobby’;
room.bullets = [];
room.scores = { T: 0, CT: 0 };
for (const p of Object.values(room.players)) {
const sp = getSpawn(p.team, room);
p.x = sp.x; p.y = sp.y;
p.hp = PLAYER_HP;
p.alive = true;
p.kills = 0;
p.deaths = 0;
}
io.to(room.id).emit(‘lobbyReset’, sanitizeRoom(room));
checkLobby(room);
}

// ─── GAME LOOP ────────────────────────────────────────────────
const DT = TICK_RATE / 1000;

setInterval(() => {
const room = rooms[ROOM_ID];
if (!room || room.state !== ‘playing’) return;

const now = Date.now();

// Move players
for (const p of Object.values(room.players)) {
if (!p.alive) {
if (now >= p.respawnAt) {
const sp = getSpawn(p.team, room);
p.x = sp.x; p.y = sp.y;
p.hp = PLAYER_HP;
p.alive = true;
io.to(room.id).emit(‘respawn’, { id: p.id, x: p.x, y: p.y });
}
continue;
}

```
const inp = p.input;
p.angle = inp.angle || 0;

let dx = 0, dy = 0;
if (inp.up)    dy -= 1;
if (inp.down)  dy += 1;
if (inp.left)  dx -= 1;
if (inp.right) dx += 1;

if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

p.x += dx * PLAYER_SPEED * DT;
p.y += dy * PLAYER_SPEED * DT;
resolvePlayer(p);

// Shoot
if (inp.shoot && now - p.lastShot > 100) {
  p.lastShot = now;
  room.bullets.push({
    id: room.bulletIdCounter++,
    ownerId: p.id,
    team: p.team,
    x: p.x + Math.cos(p.angle) * 22,
    y: p.y + Math.sin(p.angle) * 22,
    vx: Math.cos(p.angle) * BULLET_SPEED,
    vy: Math.sin(p.angle) * BULLET_SPEED,
    dist: 0,
    dead: false,
  });
}
```

}

// Move bullets
const events = [];
room.bullets = room.bullets.filter(b => {
if (b.dead) return false;
b.x += b.vx * DT;
b.y += b.vy * DT;
b.dist += BULLET_SPEED * DT;

```
if (b.dist > BULLET_MAX_DIST) return false;
if (bulletHitsWall(b)) {
  events.push({ type: 'bulletHitWall', x: b.x, y: b.y });
  return false;
}

// Hit player
for (const p of Object.values(room.players)) {
  if (!p.alive || p.id === b.ownerId || p.team === b.team) continue;
  if (dist(b, p) < PLAYER_RADIUS + 5) {
    const dmg = 26 + Math.random() * 10 | 0;
    p.hp -= dmg;
    events.push({ type: 'hit', targetId: p.id, dmg, x: b.x, y: b.y });
    b.dead = true;

    if (p.hp <= 0) {
      p.alive = false;
      p.hp = 0;
      p.deaths++;
      p.respawnAt = now + RESPAWN_TIME;

      const shooter = room.players[b.ownerId];
      if (shooter) shooter.kills++;
      room.scores[b.team]++;

      events.push({ type: 'kill', killerId: b.ownerId, victimId: p.id, scores: room.scores });

      if (room.scores[b.team] >= WIN_KILLS) {
        endGame(room, b.team);
      }
    }
    return false;
  }
}
return true;
```

});

// Emit state
io.to(room.id).emit(‘state’, {
players: sanitizePlayers(room),
bullets: room.bullets.map(b => ({ id: b.id, x: b.x, y: b.y, team: b.team })),
events,
scores: room.scores,
ts: now,
});
}, TICK_RATE);

// ─── HELPERS ─────────────────────────────────────────────────
function sanitizePlayer(p) {
return { id: p.id, name: p.name, team: p.team, x: p.x, y: p.y, angle: p.angle, hp: p.hp, alive: p.alive, kills: p.kills, deaths: p.deaths };
}
function sanitizePlayers(room) {
return Object.values(room.players).map(sanitizePlayer);
}
function sanitizeRoom(room) {
return { state: room.state, scores: room.scores, players: sanitizePlayers(room), countdown: room.countdown };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`FPS Server running on port ${PORT}`));

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║           SaskiOyunu - Professional Game Server             ║
 * ║           Multiplayer 2D Battle Platform                    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

'use strict';

const express   = require('express');
const http      = require('http');
const { Server } = require('socket.io');
const path      = require('path');
const { v4: uuidv4 } = require('uuid');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] },
  pingTimeout: 30000,
  pingInterval: 10000,
  transports: ['websocket','polling']
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/health', (_req, res) => res.json({ status: 'ok', rooms: rooms.size, players: playerCount() }));

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
const TICK_MS        = 16;       // ~60 ticks/sec
const WORLD_W        = 6000;
const WORLD_H        = 800;
const GRAVITY        = 0.55;
const MAX_FALL       = 22;
const MOVE_SPEED     = 5.5;
const DASH_SPEED     = 16;
const DASH_FRAMES    = 12;
const JUMP_FORCE     = -15;
const DOUBLE_JUMP    = -12;
const PLAYER_W       = 30;
const PLAYER_H       = 52;
const MAX_HP         = 100;
const MAX_SHIELD     = 50;
const MELEE_DMG      = 14;
const MELEE_RANGE    = 85;
const MELEE_CD       = 550;
const ARROW_SPEED    = 14;
const ARROW_DMG      = 22;
const ARROW_CD       = 900;
const BOMB_DMG       = 45;
const BOMB_RADIUS    = 100;
const BOMB_CD        = 4000;
const RESPAWN_MS     = 5000;
const ROOM_MAX       = 20;
const PICKUP_RESPAWN = 18000;
const MAX_CHAT       = 50;
const INACTIVITY_MS  = 300000; // 5 min empty room cleanup

// ═══════════════════════════════════════════════════════════════
// WORLD: PLATFORMS
// ═══════════════════════════════════════════════════════════════
const PLATFORMS = [
  // GROUND
  { x:0,    y:750, w:6000, h:50, type:'ground' },

  // Zone 1 – Starting Area
  { x:80,   y:650, w:220,  h:18, type:'wood' },
  { x:350,  y:580, w:180,  h:18, type:'wood' },
  { x:580,  y:510, w:200,  h:18, type:'stone' },
  { x:820,  y:600, w:160,  h:18, type:'wood' },
  { x:50,   y:500, w:140,  h:18, type:'stone' },
  { x:260,  y:430, w:160,  h:18, type:'wood' },
  { x:480,  y:370, w:200,  h:18, type:'stone' },
  { x:700,  y:440, w:140,  h:18, type:'wood' },
  { x:900,  y:490, w:180,  h:18, type:'stone' },

  // Zone 1 – High Platforms
  { x:150,  y:340, w:160,  h:18, type:'cloud' },
  { x:400,  y:280, w:180,  h:18, type:'cloud' },
  { x:650,  y:310, w:160,  h:18, type:'cloud' },
  { x:880,  y:260, w:200,  h:18, type:'cloud' },

  // Crates Zone 1
  { x:100,  y:700, w:55,   h:50, type:'crate' },
  { x:450,  y:700, w:55,   h:50, type:'crate' },
  { x:750,  y:700, w:55,   h:50, type:'crate' },

  // Zone 2 – Middle
  { x:1050, y:650, w:200,  h:18, type:'wood' },
  { x:1300, y:580, w:180,  h:18, type:'stone' },
  { x:1530, y:510, w:220,  h:18, type:'wood' },
  { x:1780, y:600, w:160,  h:18, type:'stone' },
  { x:2000, y:540, w:200,  h:18, type:'wood' },
  { x:1100, y:460, w:160,  h:18, type:'stone' },
  { x:1340, y:400, w:200,  h:18, type:'cloud' },
  { x:1600, y:360, w:180,  h:18, type:'stone' },
  { x:1850, y:420, w:160,  h:18, type:'cloud' },
  { x:2050, y:380, w:180,  h:18, type:'stone' },
  { x:1200, y:300, w:160,  h:18, type:'cloud' },
  { x:1450, y:250, w:200,  h:18, type:'cloud' },
  { x:1700, y:280, w:160,  h:18, type:'cloud' },
  { x:1950, y:240, w:200,  h:18, type:'cloud' },
  // Crates Zone 2
  { x:1100, y:700, w:55,   h:50, type:'crate' },
  { x:1400, y:700, w:55,   h:50, type:'crate' },
  { x:1700, y:700, w:55,   h:50, type:'crate' },
  { x:2000, y:700, w:55,   h:50, type:'crate' },

  // Zone 3 – Mid-Right
  { x:2200, y:670, w:210,  h:18, type:'stone' },
  { x:2450, y:600, w:190,  h:18, type:'wood' },
  { x:2680, y:530, w:200,  h:18, type:'stone' },
  { x:2910, y:610, w:170,  h:18, type:'wood' },
  { x:3100, y:540, w:200,  h:18, type:'stone' },
  { x:2250, y:460, w:160,  h:18, type:'cloud' },
  { x:2490, y:400, w:200,  h:18, type:'stone' },
  { x:2740, y:440, w:160,  h:18, type:'cloud' },
  { x:2960, y:380, w:200,  h:18, type:'stone' },
  { x:3120, y:430, w:160,  h:18, type:'cloud' },
  { x:2300, y:310, w:180,  h:18, type:'cloud' },
  { x:2570, y:270, w:200,  h:18, type:'cloud' },
  { x:2830, y:300, w:160,  h:18, type:'cloud' },
  { x:3050, y:250, w:200,  h:18, type:'cloud' },
  // Crates Zone 3
  { x:2250, y:700, w:55,   h:50, type:'crate' },
  { x:2600, y:700, w:55,   h:50, type:'crate' },
  { x:2900, y:700, w:55,   h:50, type:'crate' },

  // Zone 4 – Far Right
  { x:3300, y:660, w:220,  h:18, type:'wood' },
  { x:3560, y:590, w:190,  h:18, type:'stone' },
  { x:3790, y:520, w:210,  h:18, type:'wood' },
  { x:4030, y:610, w:170,  h:18, type:'stone' },
  { x:4230, y:550, w:200,  h:18, type:'wood' },
  { x:3350, y:460, w:160,  h:18, type:'cloud' },
  { x:3590, y:400, w:200,  h:18, type:'stone' },
  { x:3840, y:440, w:160,  h:18, type:'cloud' },
  { x:4080, y:380, w:200,  h:18, type:'stone' },
  { x:4280, y:430, w:160,  h:18, type:'cloud' },
  { x:3420, y:310, w:180,  h:18, type:'cloud' },
  { x:3680, y:260, w:200,  h:18, type:'cloud' },
  { x:3950, y:290, w:180,  h:18, type:'cloud' },
  { x:4200, y:250, w:200,  h:18, type:'cloud' },
  // Crates Zone 4
  { x:3350, y:700, w:55,   h:50, type:'crate' },
  { x:3700, y:700, w:55,   h:50, type:'crate' },
  { x:4050, y:700, w:55,   h:50, type:'crate' },
  { x:4300, y:700, w:55,   h:50, type:'crate' },

  // Zone 5 – End Zone
  { x:4500, y:650, w:220,  h:18, type:'wood' },
  { x:4760, y:580, w:180,  h:18, type:'stone' },
  { x:4990, y:510, w:210,  h:18, type:'wood' },
  { x:5230, y:600, w:170,  h:18, type:'stone' },
  { x:5450, y:540, w:200,  h:18, type:'wood' },
  { x:5680, y:610, w:170,  h:18, type:'stone' },
  { x:4550, y:450, w:160,  h:18, type:'cloud' },
  { x:4800, y:390, w:200,  h:18, type:'stone' },
  { x:5060, y:430, w:160,  h:18, type:'cloud' },
  { x:5300, y:380, w:200,  h:18, type:'stone' },
  { x:5560, y:420, w:160,  h:18, type:'cloud' },
  { x:4620, y:300, w:180,  h:18, type:'cloud' },
  { x:4880, y:250, w:200,  h:18, type:'cloud' },
  { x:5150, y:280, w:180,  h:18, type:'cloud' },
  { x:5420, y:240, w:200,  h:18, type:'cloud' },
  { x:5700, y:270, w:180,  h:18, type:'cloud' },
  // Crates Zone 5
  { x:4550, y:700, w:55,   h:50, type:'crate' },
  { x:4850, y:700, w:55,   h:50, type:'crate' },
  { x:5200, y:700, w:55,   h:50, type:'crate' },
  { x:5500, y:700, w:55,   h:50, type:'crate' },
  { x:5800, y:700, w:55,   h:50, type:'crate' },

  // Floating towers (mid-world landmarks)
  { x:1000, y:200, w:120,  h:18, type:'stone' },
  { x:2000, y:160, w:120,  h:18, type:'stone' },
  { x:3000, y:180, w:120,  h:18, type:'stone' },
  { x:4000, y:160, w:120,  h:18, type:'stone' },
  { x:5000, y:180, w:120,  h:18, type:'stone' },
];

// ═══════════════════════════════════════════════════════════════
// PICKUP SPAWN POINTS
// ═══════════════════════════════════════════════════════════════
function generatePickups() {
  const spawns = [
    // Health packs spread across world
    ...Array.from({length:30}, (_, i) => ({
      id: i, type:'health', value:35,
      x: 300 + i * 190, y: 680,
      active: true, respawnAt: 0
    })),
    // Shield packs
    ...Array.from({length:15}, (_, i) => ({
      id: 30 + i, type:'shield', value:30,
      x: 500 + i * 380, y: 630,
      active: true, respawnAt: 0
    })),
    // Speed boots
    ...Array.from({length:8}, (_, i) => ({
      id: 45 + i, type:'speed', value:5, duration:8000,
      x: 800 + i * 700, y: 660,
      active: true, respawnAt: 0
    })),
    // Ammo (arrow refill)
    ...Array.from({length:12}, (_, i) => ({
      id: 53 + i, type:'ammo', value:5,
      x: 400 + i * 500, y: 640,
      active: true, respawnAt: 0
    })),
  ];
  return spawns;
}

// ═══════════════════════════════════════════════════════════════
// CHARACTER APPEARANCES
// ═══════════════════════════════════════════════════════════════
const APPEARANCES = [
  { id:0,  name:'Red Warrior',    skin:'#FFDBB4', hair:'#1a0a00', shirt:'#c62828', pants:'#1565c0', belt:'#4a3728', shoe:'#212121' },
  { id:1,  name:'Green Ranger',   skin:'#C68642', hair:'#0d0d0d', shirt:'#2e7d32', pants:'#1a237e', belt:'#3e2723', shoe:'#1b1b1b' },
  { id:2,  name:'Blue Knight',    skin:'#F1C27D', hair:'#5d3a1a', shirt:'#1565c0', pants:'#263238', belt:'#3e2723', shoe:'#212121' },
  { id:3,  name:'Purple Mage',    skin:'#FFDBAC', hair:'#b71c1c', shirt:'#6a1b9a', pants:'#1b5e20', belt:'#4a148c', shoe:'#1a1a2e' },
  { id:4,  name:'Dark Assassin',  skin:'#8D5524', hair:'#050505', shirt:'#212121', pants:'#212121', belt:'#b71c1c', shoe:'#0d0d0d' },
  { id:5,  name:'Golden Hero',    skin:'#D4956A', hair:'#f9a825', shirt:'#f57f17', pants:'#37474f', belt:'#795548', shoe:'#3e2723' },
  { id:6,  name:'White Paladin',  skin:'#FDEBD0', hair:'#bdbdbd', shirt:'#eceff1', pants:'#546e7a', belt:'#78909c', shoe:'#455a64' },
  { id:7,  name:'Crimson Ninja',  skin:'#A0522D', hair:'#0d0d0d', shirt:'#b71c1c', pants:'#0d0d0d', belt:'#f44336', shoe:'#1a0000' },
  { id:8,  name:'Teal Scout',     skin:'#FFDBB4', hair:'#33691e', shirt:'#00695c', pants:'#bf360c', belt:'#006064', shoe:'#1b3a2e' },
  { id:9,  name:'Orange Brawler', skin:'#CB9E6E', hair:'#1a1a1a', shirt:'#e65100', pants:'#1a237e', belt:'#bf360c', shoe:'#0d0d0d' },
  { id:10, name:'Ice Wizard',     skin:'#DCEEF7', hair:'#b2ebf2', shirt:'#b3e5fc', pants:'#1565c0', belt:'#4dd0e1', shoe:'#0d47a1' },
  { id:11, name:'Shadow Monk',    skin:'#6D4C41', hair:'#1a1a1a', shirt:'#37474f', pants:'#263238', belt:'#546e7a', shoe:'#212121' },
];

// ═══════════════════════════════════════════════════════════════
// ROOM MANAGEMENT
// ═══════════════════════════════════════════════════════════════
const rooms   = new Map();
const sockets = new Map(); // socketId -> { player, roomId }

function playerCount() {
  let n = 0;
  rooms.forEach(r => { n += r.players.size; });
  return n;
}

function createRoom(id, name, password = '', hostId = null) {
  const room = {
    id, name, password, hostId,
    players:    new Map(),
    chat:       [],
    pickups:    generatePickups(),
    projectiles:new Map(),
    effects:    [],
    projCounter: 0,
    tickInterval: null,
    emptyAt:    null,
    createdAt:  Date.now(),
    stats: { totalKills: 0, totalDeaths: 0 }
  };
  room.tickInterval = setInterval(() => tickRoom(room), TICK_MS);
  return room;
}

// Public room always exists
rooms.set('public', createRoom('public', '🌍 Public World'));

function destroyRoom(roomId) {
  if (roomId === 'public') return;
  const room = rooms.get(roomId);
  if (!room) return;
  clearInterval(room.tickInterval);
  rooms.delete(roomId);
}

function getRoomList() {
  const list = [];
  rooms.forEach(r => {
    list.push({
      id:          r.id,
      name:        r.name,
      hasPassword: !!r.password,
      playerCount: r.players.size,
      maxPlayers:  ROOM_MAX,
      isPublic:    r.id === 'public'
    });
  });
  return list.sort((a,b) => b.playerCount - a.playerCount);
}

// ═══════════════════════════════════════════════════════════════
// PHYSICS ENGINE
// ═══════════════════════════════════════════════════════════════
function rectOverlap(ax,ay,aw,ah, bx,by,bw,bh) {
  return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
}

function resolvePlayerPlatforms(p) {
  let onGround = false;
  for (const plat of PLATFORMS) {
    // Only top collision for non-crate
    if (plat.type !== 'crate') {
      if (
        p.vy >= 0 &&
        p.x + PLAYER_W > plat.x + 4 &&
        p.x < plat.x + plat.w - 4 &&
        p.y + PLAYER_H > plat.y &&
        p.y + PLAYER_H <= plat.y + plat.h + Math.abs(p.vy) + 2
      ) {
        p.y = plat.y - PLAYER_H;
        p.vy = 0;
        onGround = true;
      }
    } else {
      // Full collision for crates
      if (rectOverlap(p.x, p.y, PLAYER_W, PLAYER_H, plat.x, plat.y, plat.w, plat.h)) {
        const overlapX = Math.min(p.x+PLAYER_W - plat.x, plat.x+plat.w - p.x);
        const overlapY = Math.min(p.y+PLAYER_H - plat.y, plat.y+plat.h - p.y);
        if (overlapY < overlapX) {
          if (p.vy >= 0 && p.y < plat.y) {
            p.y = plat.y - PLAYER_H;
            p.vy = 0;
            onGround = true;
          } else if (p.vy < 0) {
            p.y = plat.y + plat.h;
            p.vy = 0;
          }
        } else {
          if (p.x < plat.x) p.x = plat.x - PLAYER_W;
          else               p.x = plat.x + plat.w;
          p.vx = 0;
        }
      }
    }
  }
  return onGround;
}

// ═══════════════════════════════════════════════════════════════
// GAME TICK
// ═══════════════════════════════════════════════════════════════
function tickRoom(room) {
  if (room.players.size === 0) {
    if (!room.emptyAt) room.emptyAt = Date.now();
    else if (Date.now() - room.emptyAt > INACTIVITY_MS && room.id !== 'public') {
      destroyRoom(room.id);
    }
    return;
  }
  room.emptyAt = null;

  const now      = Date.now();
  const updates  = [];
  const toKill   = [];

  // ── Players
  room.players.forEach(p => {
    if (!p.alive) {
      if (now >= p.respawnAt) respawnPlayer(p, room);
      return;
    }

    // Speed buff
    const speedMult = (p.speedBuff && now < p.speedBuffEnd) ? 1.5 : 1;

    // Horizontal
    if (p.dashFrames > 0) {
      p.x += p.dashDir * DASH_SPEED;
      p.dashFrames--;
    } else {
      p.x += p.vx * speedMult;
    }

    // Gravity
    p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);
    p.y += p.vy;

    // Platform
    const ground = resolvePlayerPlatforms(p);
    if (ground && !p.onGround) {
      p.jumpsLeft  = 2;
      p.onGround   = true;
    } else if (!ground) {
      p.onGround = false;
    }

    // World bounds
    if (p.x < 0)                   { p.x = 0; p.vx = 0; }
    if (p.x + PLAYER_W > WORLD_W)  { p.x = WORLD_W - PLAYER_W; p.vx = 0; }

    // Fell out of world
    if (p.y > WORLD_H + 300) {
      toKill.push({ victimId: p.id, killerId: null, reason: 'fall' });
      return;
    }

    // Pickups
    room.pickups.forEach(pk => {
      if (!pk.active) return;
      if (Math.abs((p.x+15) - pk.x) < 30 && Math.abs((p.y+26) - pk.y) < 30) {
        pk.active    = false;
        pk.respawnAt = now + PICKUP_RESPAWN;
        applyPickup(p, pk);
        io.to(room.id).emit('pickupCollected', { pkId: pk.id, playerId: p.id, hp: p.hp, shield: p.shield });
      }
    });

    // Respawn pickups
    room.pickups.forEach(pk => {
      if (!pk.active && now >= pk.respawnAt) {
        pk.active = true;
        io.to(room.id).emit('pickupSpawned', pk.id);
      }
    });

    updates.push(snapState(p));
  });

  // ── Kill queue
  toKill.forEach(({ victimId, killerId, reason }) => {
    const victim = room.players.get(victimId);
    if (!victim) return;
    doKill(victim, killerId, room, reason);
  });

  // ── Projectiles
  const projUpdates = [];
  const removedProjs = [];
  room.projectiles.forEach((proj, id) => {
    proj.x  += proj.vx;
    proj.y  += proj.vy;
    if (proj.type === 'arrow') proj.vy += 0.18;
    proj.life--;

    // Wall/floor hit
    let destroyed = proj.x < 0 || proj.x > WORLD_W || proj.y > WORLD_H || proj.life <= 0;

    // Platform hit
    if (!destroyed) {
      for (const plat of PLATFORMS) {
        if (rectOverlap(proj.x-4, proj.y-4, 8, 8, plat.x, plat.y, plat.w, plat.h)) {
          destroyed = true;
          break;
        }
      }
    }

    // Player hit
    if (!destroyed) {
      room.players.forEach(p => {
        if (destroyed || p.id === proj.ownerId || !p.alive) return;
        if (rectOverlap(proj.x-6, proj.y-6, 12, 12, p.x, p.y, PLAYER_W, PLAYER_H)) {
          destroyed = true;
          let dmg = proj.damage;
          if (p.shield > 0) {
            const abs = Math.min(p.shield, dmg);
            p.shield -= abs;
            dmg      -= abs;
          }
          p.hp -= dmg;
          if (p.hp <= 0) {
            doKill(p, proj.ownerId, room, proj.type);
          } else {
            io.to(room.id).emit('playerHurt', { id: p.id, hp: p.hp, shield: p.shield, attackerId: proj.ownerId });
          }
        }
      });
    }

    if (destroyed) {
      removedProjs.push({ id, x: proj.x, y: proj.y, type: proj.type });
      room.projectiles.delete(id);
    } else {
      projUpdates.push({ id, x: Math.round(proj.x), y: Math.round(proj.y) });
    }
  });

  if (removedProjs.length) io.to(room.id).emit('projsRemoved', removedProjs);

  // ── Broadcast
  if (updates.length || projUpdates.length) {
    io.to(room.id).emit('tick', { players: updates, projs: projUpdates });
  }
}

function snapState(p) {
  return {
    id: p.id,
    x:  Math.round(p.x),
    y:  Math.round(p.y),
    vx: p.vx,
    vy: p.vy,
    hp: p.hp,
    shield: p.shield,
    alive: p.alive,
    facing: p.facing,
    anim:   p.anim,
    kills:  p.kills,
    deaths: p.deaths
  };
}

function applyPickup(p, pk) {
  if (pk.type === 'health') p.hp = Math.min(MAX_HP, p.hp + pk.value);
  if (pk.type === 'shield') p.shield = Math.min(MAX_SHIELD, p.shield + pk.value);
  if (pk.type === 'speed')  { p.speedBuff = true; p.speedBuffEnd = Date.now() + pk.duration; }
  if (pk.type === 'ammo')   p.arrows = Math.min(p.arrows + pk.value, 15);
}

function doKill(victim, killerId, room, reason) {
  victim.alive     = false;
  victim.hp        = 0;
  victim.deaths++;
  victim.anim      = 'dead';
  victim.respawnAt = Date.now() + RESPAWN_MS;
  room.stats.totalDeaths++;

  let killerName = null;
  if (killerId) {
    const killer = room.players.get(killerId);
    if (killer) {
      killer.kills++;
      killerName = killer.name;
      room.stats.totalKills++;
    }
  }

  io.to(room.id).emit('killed', {
    victimId: victim.id,
    victimName: victim.name,
    killerId,
    killerName,
    reason,
    respawnIn: RESPAWN_MS
  });
}

function respawnPlayer(p, room) {
  const sp = randomSpawn();
  p.x = sp.x; p.y = sp.y;
  p.vx = 0; p.vy = 0;
  p.hp = MAX_HP; p.shield = 0;
  p.alive = true; p.onGround = false;
  p.jumpsLeft = 2; p.anim = 'idle';
  p.dashFrames = 0; p.speedBuff = false;
  p.arrows = 10;
  io.to(room.id).emit('respawned', snapState(p));
}

function randomSpawn() {
  return {
    x: 100 + Math.random() * (WORLD_W - 300),
    y: 300
  };
}

// ═══════════════════════════════════════════════════════════════
// PLAYER FACTORY
// ═══════════════════════════════════════════════════════════════
let uidCounter = 0;
function createPlayer(socketId, name, telegramId) {
  const sp   = randomSpawn();
  const app  = APPEARANCES[Math.floor(Math.random() * APPEARANCES.length)];
  return {
    id:         socketId,
    name:       String(name || `Hero${++uidCounter}`).slice(0, 20),
    telegramId: telegramId || null,
    appearance: app,
    x: sp.x, y: sp.y,
    vx: 0, vy: 0,
    hp: MAX_HP, shield: 0,
    alive: true, onGround: false,
    facing: 1,
    anim: 'idle',
    jumpsLeft: 2,
    dashFrames: 0, dashDir: 1,
    arrows: 10,
    speedBuff: false, speedBuffEnd: 0,
    kills: 0, deaths: 0,
    respawnAt: 0,
    lastMelee: 0, lastArrow: 0, lastBomb: 0,
    roomId: null,
    connectedAt: Date.now()
  };
}

// ═══════════════════════════════════════════════════════════════
// SOCKET.IO – CONNECTION HANDLER
// ═══════════════════════════════════════════════════════════════
io.on('connection', socket => {
  console.log(`[+] ${socket.id} connected`);
  sockets.set(socket.id, { player: null, roomId: null });

  // ── Lobby join
  socket.on('joinLobby', ({ name, telegramId }) => {
    const player = createPlayer(socket.id, name, telegramId);
    sockets.get(socket.id).player = player;
    socket.emit('lobbyReady', {
      playerId:   socket.id,
      appearance: player.appearance,
      worldW:     WORLD_W,
      worldH:     WORLD_H,
      platforms:  PLATFORMS,
      appearances: APPEARANCES,
      roomList:   getRoomList()
    });
  });

  // ── Room list
  socket.on('getRooms', () => {
    socket.emit('roomList', getRoomList());
  });

  // ── Join public
  socket.on('joinPublic', () => {
    const sd = sockets.get(socket.id);
    if (!sd?.player) return;
    doJoinRoom(socket, sd.player, 'public', '');
  });

  // ── Quick join
  socket.on('quickJoin', () => {
    const sd = sockets.get(socket.id);
    if (!sd?.player) return;
    let target = null;
    rooms.forEach(r => {
      if (!target && r.id !== 'public' && !r.password && r.players.size < ROOM_MAX) {
        target = r;
      }
    });
    doJoinRoom(socket, sd.player, target ? target.id : 'public', '');
  });

  // ── Create room
  socket.on('createRoom', ({ name, password }) => {
    const sd = sockets.get(socket.id);
    if (!sd?.player) return;
    const id   = 'r_' + uuidv4().slice(0,8);
    const room = createRoom(id, String(name||'My Room').slice(0,30), password||'', socket.id);
    rooms.set(id, room);
    io.emit('roomListUpdate', getRoomList());
    doJoinRoom(socket, sd.player, id, password||'');
  });

  // ── Join room by id
  socket.on('joinRoom', ({ roomId, password }) => {
    const sd = sockets.get(socket.id);
    if (!sd?.player) return;
    const room = rooms.get(roomId);
    if (!room) { socket.emit('joinError', 'Oda bulunamadı'); return; }
    if (room.password && room.password !== password) { socket.emit('joinError', 'Yanlış şifre!'); return; }
    if (room.players.size >= ROOM_MAX) { socket.emit('joinError', 'Oda dolu!'); return; }
    doJoinRoom(socket, sd.player, roomId, password||'');
  });

  // ── Input
  socket.on('input', data => {
    const sd = sockets.get(socket.id);
    if (!sd?.player) return;
    const p    = sd.player;
    const room = sd.roomId ? rooms.get(sd.roomId) : null;
    if (!room || !p.alive) return;

    const now = Date.now();
    p.vx = 0;
    if (data.left)  { p.vx = -MOVE_SPEED; p.facing = -1; }
    if (data.right) { p.vx =  MOVE_SPEED; p.facing =  1; }

    // Anim state
    if (!p.onGround) p.anim = p.vy < 0 ? 'jump' : 'fall';
    else if (Math.abs(p.vx) > 0.1) p.anim = 'run';
    else p.anim = 'idle';

    // Jump / double jump
    if (data.jump && p.jumpsLeft > 0) {
      const jf = p.jumpsLeft === 2 ? JUMP_FORCE : DOUBLE_JUMP;
      p.vy = jf;
      p.jumpsLeft--;
      p.onGround = false;
      p.anim = 'jump';
    }

    // Dash
    if (data.dash && p.onGround && p.dashFrames <= 0) {
      p.dashFrames = DASH_FRAMES;
      p.dashDir    = p.facing;
      p.anim       = 'dash';
    }

    // Melee
    if (data.attack && now - p.lastMelee > MELEE_CD) {
      p.lastMelee = now;
      p.anim = 'attack';
      const hitIds = [];
      room.players.forEach(t => {
        if (t.id === socket.id || !t.alive) return;
        const dx  = (t.x + 15) - (p.x + 15);
        const dy  = (t.y + 26) - (p.y + 26);
        const dist = Math.hypot(dx, dy);
        if (dist < MELEE_RANGE && (p.facing > 0 ? dx > -20 : dx < 20)) {
          let dmg = MELEE_DMG;
          if (t.shield > 0) { const a = Math.min(t.shield, dmg); t.shield -= a; dmg -= a; }
          t.hp -= dmg;
          hitIds.push(t.id);
          if (t.hp <= 0) doKill(t, socket.id, room, 'melee');
          else io.to(room.id).emit('playerHurt', { id: t.id, hp: t.hp, shield: t.shield, attackerId: socket.id });
        }
      });
      io.to(room.id).emit('meleeSwing', {
        id: socket.id, x: p.x, y: p.y, facing: p.facing, hitIds
      });
    }

    // Arrow
    if (data.shoot && now - p.lastArrow > ARROW_CD && p.arrows > 0) {
      p.lastArrow = now;
      p.arrows--;
      p.anim = 'shoot';
      const pid = room.projCounter++;
      const angle = data.aimAngle || 0;
      const proj = {
        id: pid, ownerId: socket.id, type: 'arrow',
        x: p.x + (p.facing > 0 ? PLAYER_W : 0),
        y: p.y + 20,
        vx: Math.cos(angle) * ARROW_SPEED * p.facing,
        vy: Math.sin(angle) * ARROW_SPEED - 2,
        damage: ARROW_DMG,
        life: 90
      };
      room.projectiles.set(pid, proj);
      io.to(room.id).emit('projCreated', proj);
    }

    // Bomb
    if (data.bomb && now - p.lastBomb > BOMB_CD) {
      p.lastBomb = now;
      p.anim = 'throw';
      const pid = room.projCounter++;
      const proj = {
        id: pid, ownerId: socket.id, type: 'bomb',
        x: p.x + 15, y: p.y + 10,
        vx: p.facing * 8, vy: -10,
        damage: BOMB_DMG,
        radius: BOMB_RADIUS,
        life: 60
      };
      room.projectiles.set(pid, proj);
      io.to(room.id).emit('projCreated', proj);

      // Bomb explodes on timer
      setTimeout(() => {
        if (!room.projectiles.has(pid)) return;
        const bm = room.projectiles.get(pid);
        room.projectiles.delete(pid);
        io.to(room.id).emit('bombExplode', { id: pid, x: bm.x, y: bm.y, radius: BOMB_RADIUS });
        // AOE damage
        room.players.forEach(t => {
          if (!t.alive) return;
          const dx = (t.x+15) - bm.x;
          const dy = (t.y+26) - bm.y;
          if (Math.hypot(dx,dy) < BOMB_RADIUS) {
            let dmg = BOMB_DMG;
            if (t.shield > 0) { const a = Math.min(t.shield, dmg); t.shield -= a; dmg -= a; }
            t.hp -= dmg;
            if (t.hp <= 0) doKill(t, socket.id, room, 'bomb');
            else io.to(room.id).emit('playerHurt', { id: t.id, hp: t.hp, shield: t.shield, attackerId: socket.id });
          }
        });
      }, 2500);
    }
  });

  // ── Chat
  socket.on('chat', msg => {
    const sd   = sockets.get(socket.id);
    const room = sd?.roomId ? rooms.get(sd.roomId) : null;
    if (!room || !sd.player) return;
    const clean = String(msg).trim().slice(0, 150);
    if (!clean) return;
    const entry = { name: sd.player.name, text: clean, ts: Date.now() };
    room.chat.push(entry);
    if (room.chat.length > MAX_CHAT) room.chat.shift();
    io.to(room.id).emit('chatMessage', entry);
  });

  // ── Leave room
  socket.on('leaveRoom', () => {
    const sd = sockets.get(socket.id);
    if (sd?.roomId && sd?.player) doLeaveRoom(socket, sd);
  });

  // ── Disconnect
  socket.on('disconnect', () => {
    console.log(`[-] ${socket.id} disconnected`);
    const sd = sockets.get(socket.id);
    if (sd?.roomId && sd?.player) doLeaveRoom(socket, sd);
    sockets.delete(socket.id);
  });

  // ═════════════════════════════
  // HELPERS
  // ═════════════════════════════
  function doJoinRoom(socket, player, roomId, _password) {
    const sd = sockets.get(socket.id);
    if (!sd) return;

    // Leave old room
    if (sd.roomId) doLeaveRoom(socket, sd);

    const room = rooms.get(roomId);
    if (!room) { socket.emit('joinError', 'Oda silinmiş'); return; }

    // Reset player state
    const sp = randomSpawn();
    player.x = sp.x; player.y = sp.y;
    player.vx = 0; player.vy = 0;
    player.hp = MAX_HP; player.shield = 0;
    player.alive = true; player.onGround = false;
    player.jumpsLeft = 2; player.anim = 'idle';
    player.kills = 0; player.deaths = 0;
    player.arrows = 10; player.dashFrames = 0;
    player.roomId = roomId;
    sd.roomId = roomId;

    room.players.set(socket.id, player);
    socket.join(roomId);

    // Existing state for newcomer
    const existing = [];
    const appMap   = {};
    room.players.forEach(p => {
      if (p.id !== socket.id) existing.push(snapState(p));
      appMap[p.id] = { name: p.name, appearance: p.appearance };
    });

    socket.emit('roomJoined', {
      roomId, roomName: room.name,
      self:     snapState(player),
      players:  existing,
      appMap,
      pickups:  room.pickups,
      chat:     room.chat.slice(-30),
      worldW:   WORLD_W,
      worldH:   WORLD_H,
      platforms: PLATFORMS,
      maxArrows: 15
    });

    socket.to(roomId).emit('playerJoined', {
      state:      snapState(player),
      name:       player.name,
      appearance: player.appearance
    });

    io.emit('roomListUpdate', getRoomList());
  }

  function doLeaveRoom(socket, sd) {
    if (!sd.roomId) return;
    const room = rooms.get(sd.roomId);
    if (room) {
      room.players.delete(socket.id);
      socket.to(sd.roomId).emit('playerLeft', socket.id);
      socket.leave(sd.roomId);
      if (room.players.size === 0 && sd.roomId !== 'public') {
        room.emptyAt = Date.now();
      }
    }
    sd.roomId = null;
    if (sd.player) sd.player.roomId = null;
    io.emit('roomListUpdate', getRoomList());
  }
});

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🎮 SaskiOyunu Server v2.0 running on port ${PORT}`);
  console.log(`   Public room active | Tick: ${TICK_MS}ms (~${Math.round(1000/TICK_MS)} tps)\n`);
});

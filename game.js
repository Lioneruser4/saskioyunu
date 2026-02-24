// =====================================================================
// SaskiOyunu - Game Engine
// =====================================================================
'use strict';

const SERVER_URL = 'https://saskioyunu.onrender.com';

// ---- Socket ----
const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });

// ---- DOM ----
const loadingScreen   = document.getElementById('loadingScreen');
const lobbyScreen     = document.getElementById('lobbyScreen');
const gameScreen      = document.getElementById('gameScreen');
const canvas          = document.getElementById('gameCanvas');
const ctx             = canvas.getContext('2d');
const minimapCanvas   = document.getElementById('minimapCanvas2');
const minimapCtx      = minimapCanvas.getContext('2d');

// Lobby
const playerNameDisplay = document.getElementById('playerNameDisplay');
const roomListEl        = document.getElementById('roomList');
const roomCountBadge    = document.getElementById('roomCountBadge');
const joinPublicBtn     = document.getElementById('joinPublicBtn');
const quickJoinBtn      = document.getElementById('quickJoinBtn');
const createRoomBtn     = document.getElementById('createRoomBtn');
const refreshBtn        = document.getElementById('refreshBtn');

// HUD
const hpFill        = document.getElementById('hpFill');
const hpText        = document.getElementById('hpText');
const killCountEl   = document.getElementById('killCount');
const deathCountEl  = document.getElementById('deathCount');
const roomNameTag   = document.getElementById('roomNameTag');
const leaveBtn      = document.getElementById('leaveBtn');
const killFeedEl    = document.getElementById('killFeed');
const respawnOverlay= document.getElementById('respawnOverlay');
const chatMessages  = document.getElementById('chatMessages');
const chatInput     = document.getElementById('chatInput');
const chatSend      = document.getElementById('chatSend');
const scoreBoard    = document.getElementById('scoreBoard');
const scoreList     = document.getElementById('scoreList');

// Modals
const createRoomModal    = document.getElementById('createRoomModal');
const joinPasswordModal  = document.getElementById('joinPasswordModal');
const newRoomName        = document.getElementById('newRoomName');
const newRoomPass        = document.getElementById('newRoomPass');
const joinPassInput      = document.getElementById('joinPassInput');
const notifEl            = document.getElementById('notif');

// =====================================================================
// STATE
// =====================================================================
let myId = null;
let myName = 'Player';
let myAppearance = null;
let myRoomId = null;
let myRoomName = '';
let platforms = [];
let worldWidth = 4000;
let worldHeight = 700;
let players = {};        // id -> player state
let appearances = {};    // id -> { name, appearance }
let pickups = [];
let projectiles = {};    // id -> { x,y,vx,vy }
let activeEffects = [];  // visual effects
let pendingRoomId = null;

// Input state
const keys = { left:false, right:false, jump:false, attack:false, shoot:false };

// Camera
let camX = 0, camY = 0;
let targetCamX = 0, targetCamY = 0;

// Touch tracking
const touches = {};

// Animation
let lastTime = 0;
let animFrames = {};  // id -> frame counter

// Scoreboard toggle
let showScore = false;

// =====================================================================
// UTILS
// =====================================================================
function showNotif(msg, color = '#ff4444') {
  notifEl.textContent = msg;
  notifEl.style.background = color;
  notifEl.classList.remove('hidden');
  setTimeout(() => notifEl.classList.add('hidden'), 2500);
}

function showScreen(name) {
  loadingScreen.classList.add('hidden');
  lobbyScreen.classList.add('hidden');
  gameScreen.classList.add('hidden');
  if (name === 'loading') loadingScreen.classList.remove('hidden');
  else if (name === 'lobby') lobbyScreen.classList.remove('hidden');
  else if (name === 'game') gameScreen.classList.remove('hidden');
}

// =====================================================================
// TELEGRAM WebApp integration
// =====================================================================
let tgUser = null;
function getTelegramUser() {
  try {
    const tg = window.Telegram?.WebApp;
    if (tg && tg.initDataUnsafe?.user) {
      tg.expand();
      tg.enableClosingConfirmation();
      return tg.initDataUnsafe.user;
    }
  } catch(e) {}
  return null;
}

// =====================================================================
// INIT
// =====================================================================
window.addEventListener('load', () => {
  tgUser = getTelegramUser();

  // After loading animation
  setTimeout(() => {
    let name, telegramId;

    if (tgUser) {
      name = tgUser.first_name + (tgUser.last_name ? ' ' + tgUser.last_name : '');
      telegramId = String(tgUser.id);
    } else {
      // Web fallback - ask name or use stored
      name = localStorage.getItem('sask_name') || '';
      if (!name) {
        name = prompt('Kullanıcı adın:') || 'Misafir' + Math.floor(Math.random()*9000+1000);
        localStorage.setItem('sask_name', name);
      }
      telegramId = localStorage.getItem('sask_tgid') || null;
    }

    myName = name;
    playerNameDisplay.textContent = myName;
    socket.emit('joinLobby', { name: myName, telegramId });
    showScreen('lobby');
  }, 2200);

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  setupControls();
});

// =====================================================================
// CANVAS RESIZE
// =====================================================================
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

// =====================================================================
// SOCKET EVENTS
// =====================================================================
socket.on('connect', () => console.log('Connected:', socket.id));
socket.on('disconnect', () => showNotif('Bağlantı kesildi! Yeniden bağlanıyor...'));
socket.on('reconnect', () => { showNotif('Yeniden bağlandı!', '#00e676'); socket.emit('joinLobby', { name: myName, telegramId: tgUser?.id }); });

socket.on('lobbyJoined', (data) => {
  myId = data.playerId;
  myAppearance = data.appearance;
  platforms = data.platforms || [];
  worldWidth = data.worldWidth;
  worldHeight = data.worldHeight;
  if (data.roomList) updateRoomList(data.roomList, data.publicInfo);
});

socket.on('roomList', (data) => updateRoomList(data.rooms, data.publicInfo));
socket.on('roomListUpdate', (data) => {
  if (gameScreen.classList.contains('hidden')) updateRoomList(data.rooms, data.publicInfo);
});

socket.on('roomJoined', (data) => {
  myRoomId = data.roomId;
  myRoomName = data.roomName;
  platforms = data.platforms || platforms;
  worldWidth = data.worldWidth || worldWidth;
  worldHeight = data.worldHeight || worldHeight;

  // Init players
  players = {};
  appearances = data.appearances || {};
  animFrames = {};

  // Load existing players
  if (data.players) {
    data.players.forEach(p => {
      players[p.id] = { ...p };
      animFrames[p.id] = 0;
    });
  }

  // Add self
  players[myId] = players[myId] || { id: myId, x: 500, y: 300, vx:0,vy:0, hp:100, alive:true, facing:1, state:'idle', kills:0, deaths:0 };
  if (!appearances[myId]) appearances[myId] = { name: myName, appearance: myAppearance };
  animFrames[myId] = 0;

  // Pickups
  pickups = data.pickups || [];
  projectiles = {};

  // Load chat
  chatMessages.innerHTML = '';
  if (data.chat) data.chat.forEach(m => addChatMsg(m.name, m.text));

  roomNameTag.textContent = myRoomName;
  showScreen('game');
  startGameLoop();

  // Close password modal if open
  joinPasswordModal.classList.add('hidden');
  createRoomModal.classList.add('hidden');
});

socket.on('joinError', (msg) => {
  showNotif('❌ ' + msg);
  joinPasswordModal.classList.add('hidden');
});

socket.on('stateUpdate', (data) => {
  data.players.forEach(p => {
    if (!players[p.id]) { players[p.id] = p; animFrames[p.id] = 0; }
    else Object.assign(players[p.id], p);
  });
  // Update projectile positions
  if (data.projs) {
    data.projs.forEach(pr => {
      if (projectiles[pr.id]) { projectiles[pr.id].x = pr.x; projectiles[pr.id].y = pr.y; }
    });
  }
  // Update my HUD
  const me = players[myId];
  if (me) updateHUD(me);
});

socket.on('playerJoined', (p) => {
  players[p.id] = p;
  appearances[p.id] = { name: p.name, appearance: p.appearance };
  animFrames[p.id] = 0;
  addChatMsg('System', `👋 ${p.name} katıldı`, '#aaa');
});

socket.on('playerLeft', (id) => {
  const nm = appearances[id]?.name || id;
  addChatMsg('System', `🚪 ${nm} ayrıldı`, '#aaa');
  delete players[id];
  delete appearances[id];
  delete animFrames[id];
});

socket.on('playerHit', (data) => {
  if (players[data.id]) players[data.id].hp = data.hp;
  if (data.id === myId) updateHUD(players[myId]);
  // Flash
  spawnHitEffect(players[data.id]);
});

socket.on('playerDied', (data) => {
  if (players[data.id]) { players[data.id].alive = false; players[data.id].hp = 0; }
  if (data.id === myId) {
    respawnOverlay.classList.remove('hidden');
    updateHUD({ hp: 0, kills: players[myId]?.kills || 0, deaths: players[myId]?.deaths || 0 });
  }
});

socket.on('playerRespawn', (p) => {
  players[p.id] = { ...players[p.id], ...p };
  if (p.id === myId) {
    respawnOverlay.classList.add('hidden');
    updateHUD(p);
  }
});

socket.on('killFeed', (data) => {
  addKillFeed(data.killerName, data.victimName);
  if (players[myId]) { updateHUD(players[myId]); }
});

socket.on('meleeEffect', (data) => {
  activeEffects.push({ type:'melee', x:data.x, y:data.y, life:12, maxLife:12 });
});

socket.on('projCreate', (p) => {
  projectiles[p.id] = { ...p };
});

socket.on('projRemove', (id) => {
  if (projectiles[id]) {
    const p = projectiles[id];
    activeEffects.push({ type:'explosion', x:p.x, y:p.y, life:15, maxLife:15 });
    delete projectiles[id];
  }
});

socket.on('pickupSpawn', (id) => {
  const pk = pickups.find(p => p.id === id);
  if (pk) pk.active = true;
});

socket.on('pickupCollect', (data) => {
  const pk = pickups.find(p => p.id === data.pkId);
  if (pk) pk.active = false;
  if (data.playerId === myId && players[myId]) {
    players[myId].hp = data.hp;
    updateHUD(players[myId]);
    activeEffects.push({ type:'heal', x: players[myId].x + 16, y: players[myId].y, life:30, maxLife:30 });
  }
});

socket.on('chatMsg', (data) => addChatMsg(data.name, data.text));

// =====================================================================
// HUD
// =====================================================================
function updateHUD(p) {
  const pct = Math.max(0, Math.min(100, (p.hp / 100) * 100));
  hpFill.style.width = pct + '%';
  hpText.textContent = Math.max(0, Math.round(p.hp));
  if (p.kills !== undefined) killCountEl.textContent = p.kills;
  if (p.deaths !== undefined) deathCountEl.textContent = p.deaths;
}

function addKillFeed(killer, victim) {
  const el = document.createElement('div');
  el.className = 'kill-entry';
  el.textContent = `⚔️ ${killer} → ${victim}`;
  killFeedEl.appendChild(el);
  setTimeout(() => el.remove(), 3100);
}

function addChatMsg(name, text, color = null) {
  const el = document.createElement('div');
  el.className = 'chat-msg';
  el.innerHTML = `<span class="cn" style="${color ? 'color:'+color : ''}">${escHtml(name)}</span>: ${escHtml(text)}`;
  chatMessages.appendChild(el);
  if (chatMessages.children.length > 20) chatMessages.firstChild.remove();
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function spawnHitEffect(p) {
  if (!p) return;
  activeEffects.push({ type:'hit', x: p.x + 16, y: p.y + 10, life:10, maxLife:10 });
}

// =====================================================================
// ROOM LIST UI
// =====================================================================
function updateRoomList(rooms, publicInfo) {
  let html = '';

  // Public world entry
  const pubCount = publicInfo?.playerCount || 0;
  html += `<div class="room-item" data-id="public" data-locked="false">
    <div class="room-info">
      <div class="room-name">🌍 Public World</div>
      <div class="room-meta">${pubCount} / 20 oyuncu</div>
    </div>
  </div>`;

  if (rooms.length === 0) {
    html += '<div class="empty-state" style="margin-top:.5rem">Henüz özel oda yok</div>';
  } else {
    rooms.forEach(r => {
      html += `<div class="room-item" data-id="${escHtml(r.id)}" data-locked="${r.hasPassword}">
        <div class="room-info">
          <div class="room-name">${escHtml(r.name)}${r.hasPassword ? ' 🔒' : ''}</div>
          <div class="room-meta">${r.playerCount}/${r.maxPlayers} oyuncu</div>
        </div>
        <div class="room-count">${r.hasPassword ? '🔐' : '🔓'}</div>
      </div>`;
    });
  }

  roomListEl.innerHTML = html;
  roomCountBadge.textContent = `(${rooms.length + 1})`;

  // Bind click
  roomListEl.querySelectorAll('.room-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const locked = el.dataset.locked === 'true';
      if (id === 'public') { socket.emit('joinPublic'); return; }
      if (locked) {
        pendingRoomId = id;
        joinPassInput.value = '';
        joinPasswordModal.classList.remove('hidden');
      } else {
        socket.emit('joinRoom', { roomId: id, password: '' });
      }
    });
  });
}

// =====================================================================
// GAME LOOP
// =====================================================================
let gameLoopId = null;
function startGameLoop() {
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  lastTime = performance.now();
  function loop(now) {
    const dt = Math.min((now - lastTime) / 16.667, 3);
    lastTime = now;
    update(dt);
    render();
    gameLoopId = requestAnimationFrame(loop);
  }
  gameLoopId = requestAnimationFrame(loop);
}

// =====================================================================
// UPDATE (client side prediction for smoothness)
// =====================================================================
let inputSendTimer = 0;
function update(dt) {
  inputSendTimer++;
  if (inputSendTimer >= 2) {
    inputSendTimer = 0;
    socket.emit('input', {
      left:   keys.left,
      right:  keys.right,
      jump:   keys.jump,
      attack: keys.attack,
      shoot:  keys.shoot
    });
    keys.attack = false;
    keys.shoot  = false;
  }

  // Update animation counters
  Object.keys(players).forEach(id => {
    if (animFrames[id] === undefined) animFrames[id] = 0;
    animFrames[id] += dt;
  });

  // Update effects
  for (let i = activeEffects.length - 1; i >= 0; i--) {
    activeEffects[i].life -= dt;
    if (activeEffects[i].life <= 0) activeEffects.splice(i, 1);
  }

  // Smooth camera
  const me = players[myId];
  if (me) {
    targetCamX = me.x + 16 - canvas.width / 2;
    targetCamY = me.y + 28 - canvas.height / 2;
    targetCamX = Math.max(0, Math.min(worldWidth - canvas.width, targetCamX));
    targetCamY = Math.max(0, Math.min(worldHeight - canvas.height, targetCamY));
  }
  camX += (targetCamX - camX) * 0.12;
  camY += (targetCamY - camY) * 0.12;
}

// =====================================================================
// RENDER
// =====================================================================
function render() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#0d0d2b');
  sky.addColorStop(1, '#1a1a4a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Stars (parallax)
  drawStars();

  ctx.save();
  ctx.translate(-Math.round(camX), -Math.round(camY));

  // Background hills
  drawBackground();

  // Platforms
  drawPlatforms();

  // Pickups
  drawPickups();

  // Projectiles
  Object.values(projectiles).forEach(p => drawProjectile(p));

  // Players
  Object.values(players).forEach(p => {
    if (p.alive) drawPlayer(p);
    else drawDeadPlayer(p);
  });

  // Effects
  activeEffects.forEach(e => drawEffect(e));

  ctx.restore();

  // Minimap
  drawMinimap();
}

// ---- Stars ----
const STARS = Array.from({length:80}, () => ({
  x: Math.random() * 4000, y: Math.random() * 300,
  r: Math.random() * 1.5 + 0.3, speed: Math.random() * 0.3 + 0.1
}));
function drawStars() {
  STARS.forEach(s => {
    const sx = ((s.x - camX * s.speed) % canvas.width + canvas.width) % canvas.width;
    const sy = s.y * (canvas.height / 700);
    ctx.fillStyle = `rgba(255,255,255,${0.3 + s.r * 0.3})`;
    ctx.beginPath();
    ctx.arc(sx, sy, s.r, 0, Math.PI*2);
    ctx.fill();
  });
}

// ---- Background hills ----
function drawBackground() {
  // Far mountains
  ctx.fillStyle = '#1e1e4a';
  ctx.beginPath();
  ctx.moveTo(0, worldHeight - 50);
  for (let x = 0; x <= worldWidth; x += 200) {
    const h = 120 + Math.sin(x * 0.003) * 80;
    ctx.lineTo(x, worldHeight - 50 - h);
  }
  ctx.lineTo(worldWidth, worldHeight - 50);
  ctx.closePath();
  ctx.fill();

  // Near hills
  ctx.fillStyle = '#14142e';
  ctx.beginPath();
  ctx.moveTo(0, worldHeight - 50);
  for (let x = 0; x <= worldWidth; x += 100) {
    const h = 60 + Math.sin(x * 0.007 + 1) * 40;
    ctx.lineTo(x, worldHeight - 50 - h);
  }
  ctx.lineTo(worldWidth, worldHeight - 50);
  ctx.closePath();
  ctx.fill();
}

// ---- Platforms ----
function drawPlatforms() {
  platforms.forEach((p, i) => {
    if (i === 0) {
      // Ground
      const grad = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
      grad.addColorStop(0, '#2d5a27');
      grad.addColorStop(0.3, '#1e3d1b');
      grad.addColorStop(1, '#0f1f0e');
      ctx.fillStyle = grad;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // Grass top
      ctx.fillStyle = '#4caf50';
      ctx.fillRect(p.x, p.y, p.w, 5);
    } else if (p.w <= 80) {
      // Crate
      const grad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
      grad.addColorStop(0, '#8B6914');
      grad.addColorStop(1, '#5a4010');
      ctx.fillStyle = grad;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = '#6b4f11';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x, p.y, p.w, p.h);
      // Cross lines
      ctx.beginPath();
      ctx.moveTo(p.x + p.w/2, p.y); ctx.lineTo(p.x + p.w/2, p.y + p.h);
      ctx.moveTo(p.x, p.y + p.h/2); ctx.lineTo(p.x + p.w, p.y + p.h/2);
      ctx.stroke();
    } else {
      // Floating platform
      const grad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
      grad.addColorStop(0, '#4a3728');
      grad.addColorStop(1, '#2d1f14');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, p.w, p.h, 4);
      ctx.fill();
      // Top grass
      ctx.fillStyle = '#5c8a3c';
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, p.w, 5, [4, 4, 0, 0]);
      ctx.fill();
      // Border glow
      ctx.strokeStyle = 'rgba(92,138,60,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });
}

// ---- Pickups ----
function drawPickups() {
  const t = Date.now() / 600;
  pickups.forEach(pk => {
    if (!pk.active) return;
    const bob = Math.sin(t + pk.id) * 5;
    const gx = pk.x, gy = pk.y + bob;

    // Glow
    const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, 20);
    glow.addColorStop(0, 'rgba(0,230,118,0.3)');
    glow.addColorStop(1, 'rgba(0,230,118,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(gx - 20, gy - 20, 40, 40);

    // Heart icon
    ctx.fillStyle = '#e91e63';
    ctx.font = '22px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('❤️', gx, gy);
  });
}

// ---- Projectiles ----
function drawProjectile(p) {
  ctx.save();
  ctx.translate(p.x, p.y);

  // Trail
  ctx.fillStyle = 'rgba(255,200,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(-p.vx * 2, 0, 8, 4, Math.atan2(p.vy, p.vx), 0, Math.PI*2);
  ctx.fill();

  // Arrow
  ctx.fillStyle = '#ffca28';
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}

// ---- Draw Player ----
const PLAYER_W = 32;
const PLAYER_H = 56;

function drawPlayer(p) {
  const app = appearances[p.id]?.appearance || { skin:'#FFDBB4', hair:'#3B1F0A', shirt:'#E53935', pants:'#1565C0' };
  const isMe = p.id === myId;
  const frame = animFrames[p.id] || 0;

  ctx.save();
  ctx.translate(p.x + PLAYER_W / 2, p.y);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, PLAYER_H + 2, 14, 4, 0, 0, Math.PI*2);
  ctx.fill();

  ctx.scale(p.facing, 1);

  const isRunning = p.state === 'run';
  const isJumping = p.state === 'jump' || p.state === 'fall';
  const isAttacking = p.state === 'attack';

  // Leg animation
  const legSwing = isRunning ? Math.sin(frame * 0.35) * 12 : 0;
  const bodyBob  = isRunning ? Math.abs(Math.sin(frame * 0.35)) * 2 : 0;
  const jumpLean = isJumping ? -8 : 0;
  const armSwing = isRunning ? Math.sin(frame * 0.35 + Math.PI) * 14 : (isAttacking ? 35 : 5);

  // ---- LEGS ----
  drawLimb(ctx, -7, PLAYER_H * 0.55 + bodyBob, 7, 25, app.pants, legSwing);
  drawLimb(ctx,  7, PLAYER_H * 0.55 + bodyBob, 7, 25, app.pants, -legSwing);

  // Shoes
  ctx.fillStyle = '#222';
  ctx.fillRect(-14, PLAYER_H - 9, 14, 8);
  ctx.fillRect(  1, PLAYER_H - 9, 14, 8);

  // ---- BODY ----
  const bodyTop = PLAYER_H * 0.28 + bodyBob;
  const bodyH   = PLAYER_H * 0.35;
  ctx.fillStyle = app.shirt;
  ctx.beginPath();
  ctx.roundRect(-12, bodyTop, 24, bodyH, 3);
  ctx.fill();

  // Belt
  ctx.fillStyle = '#333';
  ctx.fillRect(-12, bodyTop + bodyH - 6, 24, 5);

  // ---- ARMS ----
  // Back arm
  drawLimb(ctx, -8, bodyTop + 4, 6, 20, app.skin, -armSwing + jumpLean);
  // Front arm
  drawLimb(ctx,  8, bodyTop + 4, 6, 20, app.skin,  armSwing + jumpLean);

  // Weapon in front hand (sword)
  ctx.save();
  ctx.translate(8, bodyTop + 4);
  ctx.rotate((armSwing + jumpLean) * Math.PI / 180);
  ctx.strokeStyle = '#ccc';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 18);
  ctx.lineTo(6, 40);
  ctx.stroke();
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-4, 20);
  ctx.lineTo(4, 20);
  ctx.stroke();
  ctx.restore();

  // ---- HEAD ----
  const headY = bodyTop - 26;
  // Neck
  ctx.fillStyle = app.skin;
  ctx.fillRect(-4, bodyTop - 8, 8, 10);

  // Head
  ctx.fillStyle = app.skin;
  ctx.beginPath();
  ctx.roundRect(-12, headY, 24, 24, 5);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.fillRect(-7, headY + 7, 5, 6);
  ctx.fillRect( 2, headY + 7, 5, 6);
  ctx.fillStyle = '#222';
  ctx.fillRect(-5, headY + 9, 3, 4);
  ctx.fillRect( 4, headY + 9, 3, 4);

  // Eyebrows
  ctx.fillStyle = app.hair;
  ctx.fillRect(-8, headY + 5, 7, 2);
  ctx.fillRect( 1, headY + 5, 7, 2);

  // Mouth (smile)
  ctx.strokeStyle = '#8b4513';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, headY + 17, 4, 0, Math.PI);
  ctx.stroke();

  // Hair
  ctx.fillStyle = app.hair;
  ctx.beginPath();
  ctx.roundRect(-12, headY, 24, 10, [5, 5, 0, 0]);
  ctx.fill();

  ctx.restore(); // unscale facing

  // Name tag + HP bar
  drawNameTag(ctx, p, isMe, bodyBob);
}

function drawLimb(ctx, x, y, w, h, color, angleDeg) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angleDeg * Math.PI / 180);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-w/2, 0, w, h, 3);
  ctx.fill();
  ctx.restore();
}

function drawNameTag(ctx, p, isMe, bodyBob) {
  ctx.save();
  ctx.scale(p.facing, 1); // undo facing flip for text

  const name = appearances[p.id]?.name || '?';
  const tagY  = -28 + bodyBob;

  // HP bar
  const hpW = 40;
  const hpPct = Math.max(0, p.hp / 100);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.roundRect(-hpW/2, tagY - 8, hpW, 5, 2);
  ctx.fill();
  const hpColor = hpPct > 0.6 ? '#00e676' : hpPct > 0.3 ? '#ffeb3b' : '#f44336';
  ctx.fillStyle = hpColor;
  ctx.beginPath();
  ctx.roundRect(-hpW/2, tagY - 8, hpW * hpPct, 5, 2);
  ctx.fill();

  // Name
  ctx.font = isMe ? 'bold 10px sans-serif' : '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = isMe ? '#00e5ff' : '#eee';
  ctx.shadowColor = 'rgba(0,0,0,.8)';
  ctx.shadowBlur = 4;
  ctx.fillText(name, 0, tagY - 11);
  ctx.shadowBlur = 0;

  ctx.restore();
}

function drawDeadPlayer(p) {
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.translate(p.x + PLAYER_W / 2, p.y + PLAYER_H * 0.8);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = '#555';
  ctx.fillRect(-PLAYER_W/2, -PLAYER_H/4, PLAYER_W, PLAYER_H/2);
  ctx.globalAlpha = 1;
  ctx.font = '20px serif';
  ctx.textAlign = 'center';
  ctx.fillText('💀', 0, 0);
  ctx.restore();
}

// ---- Effects ----
function drawEffect(e) {
  const t = e.life / e.maxLife;
  ctx.save();

  if (e.type === 'melee') {
    ctx.globalAlpha = t;
    ctx.strokeStyle = '#ffca28';
    ctx.lineWidth = 3;
    const sweep = (1-t) * 60;
    ctx.beginPath();
    ctx.arc(e.x, e.y, 25, -sweep * Math.PI/180, sweep * Math.PI/180);
    ctx.stroke();
    ctx.globalAlpha = 0.3 * t;
    ctx.fillStyle = '#ffca28';
    ctx.fill();
  }

  if (e.type === 'explosion') {
    ctx.globalAlpha = t;
    const r = (1-t) * 25 + 5;
    const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.3,'#ffca28');
    g.addColorStop(1,'rgba(255,80,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r, 0, Math.PI*2);
    ctx.fill();
  }

  if (e.type === 'hit') {
    ctx.globalAlpha = t;
    ctx.fillStyle = '#f44336';
    ctx.font = `${14 + (1-t)*8}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('💥', e.x, e.y - (1-t)*20);
  }

  if (e.type === 'heal') {
    ctx.globalAlpha = t;
    ctx.font = `${14 + (1-t)*6}px serif`;
    ctx.textAlign = 'center';
    ctx.fillText('💚', e.x, e.y - (1-t)*30);
  }

  ctx.restore();
}

// ---- Minimap ----
function drawMinimap() {
  const mw = minimapCanvas.width;
  const mh = minimapCanvas.height;
  minimapCtx.clearRect(0, 0, mw, mh);

  // Background
  minimapCtx.fillStyle = 'rgba(0,0,20,0.7)';
  minimapCtx.fillRect(0, 0, mw, mh);

  const scX = mw / worldWidth;
  const scY = mh / worldHeight;

  // Ground
  minimapCtx.fillStyle = '#2d5a27';
  minimapCtx.fillRect(0, mh - 4, mw, 4);

  // Platforms
  minimapCtx.fillStyle = '#4a3728';
  platforms.forEach((p, i) => {
    if (i === 0) return;
    minimapCtx.fillRect(p.x * scX, p.y * scY, p.w * scX, 2);
  });

  // Pickups
  minimapCtx.fillStyle = '#e91e63';
  pickups.forEach(pk => {
    if (!pk.active) return;
    minimapCtx.fillRect(pk.x * scX - 1, pk.y * scY - 1, 3, 3);
  });

  // Players
  Object.values(players).forEach(p => {
    if (!p.alive) return;
    minimapCtx.fillStyle = p.id === myId ? '#00e5ff' : '#ff5722';
    const mx = p.x * scX, my = p.y * scY;
    minimapCtx.beginPath();
    minimapCtx.arc(mx, my, 2.5, 0, Math.PI*2);
    minimapCtx.fill();
  });

  // Camera view box
  minimapCtx.strokeStyle = 'rgba(255,255,255,0.3)';
  minimapCtx.lineWidth = 0.5;
  minimapCtx.strokeRect(
    camX * scX, camY * scY,
    canvas.width * scX, canvas.height * scY
  );

  minimapCtx.strokeStyle = 'rgba(255,255,255,0.5)';
  minimapCtx.lineWidth = 1;
  minimapCtx.strokeRect(0, 0, mw, mh);
}

// =====================================================================
// SCOREBOARD
// =====================================================================
function updateScoreboard() {
  const sorted = Object.values(players).sort((a, b) => b.kills - a.kills);
  let html = sorted.map(p => {
    const nm = appearances[p.id]?.name || p.id;
    const isMe = p.id === myId;
    return `<div class="score-row ${isMe?'me':''}">
      <span>${escHtml(nm)} ${isMe?'(Sen)':''}</span>
      <span>⚔️${p.kills} 💀${p.deaths}</span>
    </div>`;
  }).join('');
  scoreList.innerHTML = html || '<div style="color:#666;text-align:center">Veri yok</div>';
}

// =====================================================================
// CONTROLS
// =====================================================================
function setupControls() {
  // Keyboard
  document.addEventListener('keydown', e => {
    switch(e.code) {
      case 'ArrowLeft':  case 'KeyA': keys.left  = true; break;
      case 'ArrowRight': case 'KeyD': keys.right = true; break;
      case 'ArrowUp': case 'KeyW': case 'Space':
        if (!keys.jump) keys.jump = true;
        break;
      case 'KeyZ': case 'KeyJ': keys.attack = true; break;
      case 'KeyX': case 'KeyK': keys.shoot  = true; break;
      case 'Tab':
        e.preventDefault();
        showScore = !showScore;
        scoreBoard.style.display = showScore ? 'block' : 'none';
        if (showScore) updateScoreboard();
        break;
    }
  });
  document.addEventListener('keyup', e => {
    switch(e.code) {
      case 'ArrowLeft':  case 'KeyA': keys.left  = false; break;
      case 'ArrowRight': case 'KeyD': keys.right = false; break;
      case 'ArrowUp': case 'KeyW': case 'Space': keys.jump = false; break;
    }
  });

  // Mobile buttons
  function bindBtn(id, keyName, toggle = false) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('touchstart', e => { e.preventDefault(); keys[keyName] = true; btn.classList.add('pressed'); }, { passive:false });
    btn.addEventListener('touchend',   e => { e.preventDefault(); if(!toggle) keys[keyName] = false; btn.classList.remove('pressed'); }, { passive:false });
    btn.addEventListener('mousedown', () => { keys[keyName] = true; });
    btn.addEventListener('mouseup',   () => { if(!toggle) keys[keyName] = false; });
  }

  bindBtn('btnLeft',  'left');
  bindBtn('btnRight', 'right');
  bindBtn('btnJump',  'jump');
  bindBtn('btnAtk',   'attack', true);
  bindBtn('btnShoot', 'shoot', true);

  // Chat button
  const btnChat = document.getElementById('btnChat');
  btnChat.addEventListener('click', () => {
    if (chatInput.style.display === 'none' || !chatInput.style.display) {
      chatInput.style.display = 'block';
      chatInput.focus();
    } else {
      chatInput.style.display = 'none';
    }
  });

  // Lobby buttons
  joinPublicBtn.addEventListener('click', () => socket.emit('joinPublic'));
  quickJoinBtn.addEventListener('click',  () => socket.emit('quickJoin'));
  refreshBtn.addEventListener('click',    () => socket.emit('getRoomList'));

  createRoomBtn.addEventListener('click', () => {
    newRoomName.value = '';
    newRoomPass.value = '';
    createRoomModal.classList.remove('hidden');
  });
  document.getElementById('confirmCreateRoom').addEventListener('click', () => {
    const n = newRoomName.value.trim() || `${myName}'s Room`;
    const p = newRoomPass.value.trim();
    socket.emit('createRoom', { name: n, password: p });
  });
  document.getElementById('cancelCreateRoom').addEventListener('click', () => createRoomModal.classList.add('hidden'));

  document.getElementById('confirmJoinPass').addEventListener('click', () => {
    if (!pendingRoomId) return;
    socket.emit('joinRoom', { roomId: pendingRoomId, password: joinPassInput.value });
  });
  document.getElementById('cancelJoinPass').addEventListener('click', () => {
    joinPasswordModal.classList.add('hidden');
    pendingRoomId = null;
  });

  // In-game leave
  leaveBtn.addEventListener('click', () => {
    if (confirm('Odadan çıkmak istiyor musun?')) {
      socket.emit('leaveRoom');
      if (gameLoopId) cancelAnimationFrame(gameLoopId);
      gameLoopId = null;
      players = {}; appearances = {}; pickups = []; projectiles = {};
      showScreen('lobby');
      socket.emit('getRoomList');
    }
  });

  // Chat send
  chatSend.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { sendChat(); e.preventDefault(); }
    e.stopPropagation();
  });
  chatInput.addEventListener('keyup',  e => e.stopPropagation());

  // Touch on canvas for scoreboard
  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      showScore = !showScore;
      scoreBoard.style.display = showScore ? 'block' : 'none';
      if (showScore) updateScoreboard();
    }
  }, { passive:false });
}

function sendChat() {
  const txt = chatInput.value.trim();
  if (!txt || !myRoomId) return;
  socket.emit('chat', txt);
  chatInput.value = '';
}

// =====================================================================
// ROUNDRECT POLYFILL (older browsers)
// =====================================================================
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (typeof r === 'number') r = [r, r, r, r];
    const [tl, tr, br, bl] = Array.isArray(r) ? [...r, ...r].slice(0, 4) : [r, r, r, r];
    this.beginPath();
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y);
    this.arcTo(x + w, y, x + w, y + tr, tr);
    this.lineTo(x + w, y + h - br);
    this.arcTo(x + w, y + h, x + w - br, y + h, br);
    this.lineTo(x + bl, y + h);
    this.arcTo(x, y + h, x, y + h - bl, bl);
    this.lineTo(x, y + tl);
    this.arcTo(x, y, x + tl, y, tl);
    this.closePath();
    return this;
  };
}

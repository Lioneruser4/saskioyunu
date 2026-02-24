/**
 * SaskiOyunu v2.1 – Fixed & Professional Game Engine
 */
'use strict';

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const SERVER_URL = 'https://saskioyunu.onrender.com';
const PLAYER_W   = 30;
const PLAYER_H   = 52;
const MAX_HP     = 100;
const MAX_SHIELD = 50;
const CAM_LERP   = 0.1;

// ═══════════════════════════════════════════════════════════════
// DOM REFS
// ═══════════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);
const canvas   = $('gameCanvas');
const ctx      = canvas.getContext('2d');
const mmCanvas = $('minimapCanvas');
const mmCtx    = mmCanvas.getContext('2d');

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let socket;
let myId, myName = '', myAppearance = null, myRoomId = null, myRoomName = '';
let platforms = [], worldW = 6000, worldH = 800;
let players = {}, appMap = {}, pickups = [], projectiles = {}, particles = [];
let pendingRoomId = null, pendingRoomName = '';
let selectedCharIdx = 0;
let APPEARANCES_CLIENT = [];
let raf = 0, lastTs = 0;
let camX = 0, camY = 0;
let scoreVisible = false;
let respawnInterval = null;

// Input state
const inp = { left:false, right:false };
let jumpQ=false, atkQ=false, shootQ=false, bombQ=false, dashQ=false;

// ═══════════════════════════════════════════════════════════════
// SCREEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════
const SCREENS = ['screenLoad','screenLobby','screenGame'];

function showScreen(id) {
  SCREENS.forEach(s => {
    const el = $(s);
    if (!el) return;
    if (s === id) {
      el.style.display = 'flex';
      el.style.opacity = '0';
      el.style.pointerEvents = 'all';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { el.style.opacity = '1'; });
      });
    } else {
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      setTimeout(() => { if (el.style.opacity === '0') el.style.display = 'none'; }, 300);
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICATION
// ═══════════════════════════════════════════════════════════════
function notif(msg, type = 'info') {
  const stack = $('notifStack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `notif-item ${type}`;
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════
function clamp(v,a,b){ return v<a?a:v>b?b:v; }
function lerp(a,b,t){ return a+(b-a)*t; }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function roundRect(c, x, y, w, h, r) {
  r = typeof r==='number'?[r,r,r,r]:r;
  const [tl,tr,br,bl] = r.length===4 ? r : [r[0],r[0],r[0],r[0]];
  c.beginPath();
  c.moveTo(x+tl,y);
  c.lineTo(x+w-tr,y); c.arcTo(x+w,y,x+w,y+tr,tr);
  c.lineTo(x+w,y+h-br); c.arcTo(x+w,y+h,x+w-br,y+h,br);
  c.lineTo(x+bl,y+h); c.arcTo(x,y+h,x,y+h-bl,bl);
  c.lineTo(x,y+tl); c.arcTo(x,y,x+tl,y,tl);
  c.closePath();
}

// ═══════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Apply CSS transitions
  SCREENS.forEach(s => {
    const el = $(s);
    if (el) el.style.transition = 'opacity 0.3s ease';
  });

  // Loading screen status
  const loadStatus = $('loadStatus');

  // Get name
  const tgUser = getTelegramUser();
  if (tgUser) {
    myName = (tgUser.first_name + (tgUser.last_name ? ' ' + tgUser.last_name : '')).slice(0,20);
  } else {
    myName = localStorage.getItem('sask_name') || '';
    if (!myName) {
      myName = prompt('Kullanıcı adın:')?.trim() || 'Savaşçı' + Math.floor(Math.random()*9000+1000);
      localStorage.setItem('sask_name', myName);
    }
  }

  if (loadStatus) loadStatus.textContent = 'Sunucuya bağlanılıyor...';

  // Init socket
  try {
    socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      timeout: 30000
    });
  } catch(e) {
    if (loadStatus) loadStatus.textContent = 'Socket.IO yüklenemedi: ' + e.message;
    return;
  }

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
    if (loadStatus) loadStatus.textContent = 'Bağlandı! Giriş yapılıyor...';
    socket.emit('joinLobby', { name: myName, telegramId: tgUser?.id || null });
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] connect_error:', err.message);
    if (loadStatus) loadStatus.textContent = '⚠️ Bağlanamadı: ' + err.message + ' — yeniden deneniyor...';
  });

  socket.on('disconnect', (reason) => {
    console.warn('[Socket] disconnect:', reason);
    notif('Bağlantı kesildi: ' + reason, 'err');
  });

  socket.on('reconnect', () => {
    notif('Yeniden bağlandı!', 'ok');
    socket.emit('joinLobby', { name: myName, telegramId: tgUser?.id || null });
  });

  setupSocketHandlers();
  setupUI();
  setupControls();
});

// ═══════════════════════════════════════════════════════════════
// TELEGRAM
// ═══════════════════════════════════════════════════════════════
function getTelegramUser() {
  try {
    const tg = window.Telegram?.WebApp;
    if (tg?.initDataUnsafe?.user) {
      tg.expand();
      tg.enableClosingConfirmation();
      return tg.initDataUnsafe.user;
    }
  } catch(e) {}
  return null;
}

// ═══════════════════════════════════════════════════════════════
// SOCKET HANDLERS
// ═══════════════════════════════════════════════════════════════
function setupSocketHandlers() {

  socket.on('lobbyReady', data => {
    console.log('[Socket] lobbyReady received');
    myId = data.playerId;
    platforms = data.platforms || [];
    worldW = data.worldW || 6000;
    worldH = data.worldH || 800;
    APPEARANCES_CLIENT = data.appearances || [];
    myAppearance = data.appearance || APPEARANCES_CLIENT[0] || null;

    $('displayName').textContent = myName;
    buildCharPreviews();
    showScreen('screenLobby');
    socket.emit('getRooms');
  });

  socket.on('roomList', list => {
    renderRoomList(list);
    let n = 0; list.forEach(r => n += r.playerCount);
    $('onlineCount').textContent = `🌐 ${n} oyuncu online`;
    $('roomCountLabel').textContent = `(${list.length})`;
  });

  socket.on('roomListUpdate', list => {
    if ($('screenLobby').style.display !== 'none') renderRoomList(list);
    let n = 0; list.forEach(r => n += r.playerCount);
    const el = $('onlineCount');
    if (el) el.textContent = `🌐 ${n} oyuncu online`;
  });

  socket.on('roomJoined', data => {
    myRoomId   = data.roomId;
    myRoomName = data.roomName;
    platforms  = data.platforms || platforms;
    worldW     = data.worldW || worldW;
    worldH     = data.worldH || worldH;

    players = {}; appMap = data.appMap || {};
    pickups = data.pickups || [];
    projectiles = {}; particles = [];

    if (data.players) data.players.forEach(p => { players[p.id] = p; });
    if (data.self)    players[myId] = data.self;
    if (!appMap[myId]) appMap[myId] = { name: myName, appearance: myAppearance };

    $('hudRoomName').textContent = myRoomName;
    $('chatMessages').innerHTML  = '';
    if (data.chat) data.chat.forEach(m => appendChat(m.name, m.text, 'normal'));

    $('modalPassword').style.display    = 'none';
    $('modalCreateRoom').style.display  = 'none';

    updateHUD();
    showScreen('screenGame');

    if (raf) cancelAnimationFrame(raf);
    lastTs = performance.now();
    raf = requestAnimationFrame(gameLoop);
  });

  socket.on('joinError', msg => {
    notif('❌ ' + msg, 'err');
    $('modalPassword').style.display = 'none';
  });

  socket.on('tick', data => {
    if (data.players) data.players.forEach(p => {
      if (!players[p.id]) players[p.id] = p;
      else Object.assign(players[p.id], p);
    });
    if (data.projs) data.projs.forEach(pr => {
      if (projectiles[pr.id]) { projectiles[pr.id].x = pr.x; projectiles[pr.id].y = pr.y; }
    });
    const me = players[myId];
    if (me) updateHUD(me);
  });

  socket.on('playerJoined', data => {
    players[data.state.id] = data.state;
    appMap[data.state.id]  = { name: data.name, appearance: data.appearance };
    appendChat('', `👋 ${esc(data.name)} katıldı`, 'sys');
    updateHUDCount();
    spawnParticles(data.state.x+15, data.state.y+20, '#00e5ff', 12);
  });

  socket.on('playerLeft', id => {
    const nm = appMap[id]?.name || '?';
    appendChat('', `🚪 ${esc(nm)} ayrıldı`, 'sys');
    delete players[id]; delete appMap[id];
    updateHUDCount();
  });

  socket.on('playerHurt', data => {
    if (players[data.id]) { players[data.id].hp = data.hp; players[data.id].shield = data.shield; }
    if (data.id === myId) updateHUD(players[myId]);
    const p = players[data.id];
    if (p) spawnParticles(p.x+15, p.y+20, '#ff1744', 6);
  });

  socket.on('killed', data => {
    if (players[data.victimId]) { players[data.victimId].alive = false; players[data.victimId].hp = 0; }
    if (data.victimId === myId) {
      startRespawnTimer(data.respawnIn || 5000);
      updateHUD({ hp:0, shield:0, kills: players[myId]?.kills||0, deaths:(players[myId]?.deaths||0)+1, arrows:players[myId]?.arrows||0 });
    }
    const vp = players[data.victimId];
    if (vp) spawnParticles(vp.x+15, vp.y+20, '#ff1744', 20);
    addKillFeed(data.killerName, data.victimName, data.reason);
    if (data.killerName === myName) notif('💀 Kill! +1', 'ok');
  });

  socket.on('respawned', data => {
    players[data.id] = { ...(players[data.id]||{}), ...data };
    if (data.id === myId) {
      endRespawnTimer();
      updateHUD(data);
      spawnParticles(data.x+15, data.y+20, '#00e676', 15);
    }
  });

  socket.on('projCreated', p  => { projectiles[p.id] = { ...p }; });

  socket.on('projsRemoved', list => {
    list.forEach(item => {
      const p = projectiles[item.id];
      if (p) spawnParticles(p.x, p.y, item.type==='bomb'?'#ff6d00':'#ffea00', item.type==='bomb'?30:8);
      delete projectiles[item.id];
    });
  });

  socket.on('bombExplode', data => {
    spawnExplosion(data.x, data.y, data.radius);
  });

  socket.on('meleeSwing', data => {
    spawnMeleeEffect(data.x, data.y, data.facing);
    (data.hitIds||[]).forEach(id => {
      const p = players[id];
      if (p) spawnParticles(p.x+15, p.y+20, '#ff1744', 8);
    });
  });

  socket.on('pickupCollected', data => {
    const pk = pickups.find(p => p.id===data.pkId);
    if (pk) { pk.active = false; spawnParticles(pk.x, pk.y, '#00e676', 10); }
    if (data.playerId === myId) {
      if (players[myId]) { players[myId].hp = data.hp; players[myId].shield = data.shield; }
      updateHUD(players[myId]);
    }
  });

  socket.on('pickupSpawned', id => {
    const pk = pickups.find(p => p.id===id);
    if (pk) { pk.active = true; spawnParticles(pk.x, pk.y, '#00e5ff', 6); }
  });

  socket.on('chatMessage', data => appendChat(data.name, data.text, 'normal'));
}

// ═══════════════════════════════════════════════════════════════
// GAME LOOP
// ═══════════════════════════════════════════════════════════════
let inputTick = 0;
function gameLoop(ts) {
  raf = requestAnimationFrame(gameLoop);
  const dt = clamp((ts - lastTs) / 16.667, 0.1, 4);
  lastTs = ts;

  // Send input every 2 frames (~30/sec)
  inputTick++;
  if (inputTick >= 2) {
    inputTick = 0;
    const j=jumpQ; jumpQ=false;
    const a=atkQ;  atkQ=false;
    const s=shootQ; shootQ=false;
    const b=bombQ;  bombQ=false;
    const d=dashQ;  dashQ=false;
    socket.emit('input', { left:inp.left, right:inp.right, jump:j||inp.jump, attack:a, shoot:s, bomb:b, dash:d, aimAngle:0 });
  }

  updateParticles(dt);
  updateCamera(dt);
  renderFrame();
}

// ═══════════════════════════════════════════════════════════════
// CAMERA
// ═══════════════════════════════════════════════════════════════
function updateCamera(dt) {
  const me = players[myId];
  if (!me) return;
  const tx = clamp(me.x + PLAYER_W/2 - canvas.width/2,  0, Math.max(0, worldW - canvas.width));
  const ty = clamp(me.y + PLAYER_H/2 - canvas.height/2, 0, Math.max(0, worldH - canvas.height));
  camX = lerp(camX, tx, CAM_LERP * dt * 2);
  camY = lerp(camY, ty, CAM_LERP * dt * 2);
}

// ═══════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════
let pkTime = 0, cloudT = 0, starT = 0;

// Pre-generate stars
const STARS = Array.from({length:120}, () => ({
  wx: Math.random()*6000, wy: Math.random()*380,
  r: Math.random()*1.4+0.3,
  twinkle: Math.random()*Math.PI*2,
  speed: 0.05+Math.random()*0.15
}));

// Pre-generate clouds
const CLOUDS = Array.from({length:18}, () => ({
  x: Math.random()*8000-500, y: 60+Math.random()*220,
  w: 120+Math.random()*200, h: 40+Math.random()*55,
  speed: 0.06+Math.random()*0.1, alpha: 0.04+Math.random()*0.07
}));

function renderFrame() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  starT  += 0.015; pkTime += 0.04; cloudT += 0.003;

  // Sky
  const sky = ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0, '#030310'); sky.addColorStop(0.7,'#0a0a22'); sky.addColorStop(1,'#141432');
  ctx.fillStyle = sky; ctx.fillRect(0,0,W,H);

  // Stars (screen-space with parallax)
  STARS.forEach(s => {
    const sx = ((s.wx - camX * s.speed) % W + W) % W;
    const sy = s.wy * (H / 380);
    ctx.globalAlpha = 0.3 + 0.35 * Math.sin(starT + s.twinkle);
    ctx.fillStyle = '#c8c8ff';
    ctx.beginPath(); ctx.arc(sx, sy, s.r, 0, Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(-Math.round(camX), -Math.round(camY));

  // Clouds (world-space)
  CLOUDS.forEach(c => {
    const cx = ((c.x + cloudT * 40 * c.speed) % (worldW+800)) - 400;
    ctx.globalAlpha = c.alpha;
    ctx.fillStyle = '#9090cc';
    ctx.beginPath(); ctx.ellipse(cx, c.y, c.w/2, c.h/2, 0, 0, Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha = 1;

  drawPlatforms();
  drawPickups();
  drawProjectiles();
  drawAllPlayers();
  drawParticles();

  ctx.restore();
  drawMinimap();
}

// ──────────── PLATFORMS ────────────
const platGradCache = {};
function getPlatGrad(type, y, h) {
  const key = type + '_' + Math.round(y);
  if (platGradCache[key]) return platGradCache[key];
  const g = ctx.createLinearGradient(0, y, 0, y+h);
  switch(type) {
    case 'ground': g.addColorStop(0,'#2d5a27'); g.addColorStop(.12,'#1a3616'); g.addColorStop(1,'#080f07'); break;
    case 'wood':   g.addColorStop(0,'#9a7430'); g.addColorStop(1,'#4a3206'); break;
    case 'stone':  g.addColorStop(0,'#62626e'); g.addColorStop(1,'#2a2a3a'); break;
    case 'cloud':  g.addColorStop(0,'rgba(190,210,255,.22)'); g.addColorStop(1,'rgba(110,130,220,.08)'); break;
    case 'crate':  g.addColorStop(0,'#b07838'); g.addColorStop(1,'#5a3810'); break;
    default:       g.addColorStop(0,'#555'); g.addColorStop(1,'#222');
  }
  platGradCache[key] = g;
  return g;
}

function drawPlatforms() {
  platforms.forEach((p, i) => {
    if (p.x+p.w < camX-5 || p.x > camX+canvas.width+5) return;
    ctx.fillStyle = getPlatGrad(p.type||'wood', p.y, p.h);

    if (p.type === 'cloud') {
      roundRect(ctx, p.x, p.y, p.w, p.h, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(160,180,255,.3)'; ctx.lineWidth = 1.5; ctx.stroke();
    } else if (p.type === 'crate') {
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = '#3a2008'; ctx.lineWidth = 1.5;
      ctx.strokeRect(p.x+.5, p.y+.5, p.w-1, p.h-1);
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x+p.w/2,p.y); ctx.lineTo(p.x+p.w/2,p.y+p.h);
      ctx.moveTo(p.x,p.y+p.h/2); ctx.lineTo(p.x+p.w,p.y+p.h/2);
      ctx.stroke();
    } else {
      ctx.fillRect(p.x, p.y, p.w, p.h);
      if (i === 0) {
        // Ground grass
        ctx.fillStyle = '#4caf50'; ctx.fillRect(p.x, p.y, p.w, 6);
        ctx.fillStyle = '#66bb6a';
        for (let gx = p.x+8; gx < p.x+p.w; gx+=16) {
          ctx.fillRect(gx, p.y-3, 2, 4); ctx.fillRect(gx+7, p.y-2, 2, 3);
        }
      } else {
        ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(p.x, p.y, p.w, 3);
        ctx.fillStyle = 'rgba(0,0,0,.4)';       ctx.fillRect(p.x, p.y+p.h-3, p.w, 3);
        if (p.type === 'stone') {
          ctx.strokeStyle = 'rgba(80,80,100,.5)'; ctx.lineWidth = .8;
          for (let bx = p.x+20; bx < p.x+p.w; bx+=20) {
            ctx.beginPath(); ctx.moveTo(bx,p.y); ctx.lineTo(bx,p.y+p.h); ctx.stroke();
          }
        }
      }
    }
  });
}

// ──────────── PICKUPS ────────────
function drawPickups() {
  pickups.forEach(pk => {
    if (!pk.active) return;
    if (pk.x+25 < camX || pk.x-25 > camX+canvas.width) return;
    const bob = Math.sin(pkTime*2 + pk.id*0.7) * 4;
    const gx = pk.x, gy = pk.y + bob;
    const col = {health:'#ff1744',shield:'#00e5ff',speed:'#ffea00',ammo:'#ff9800'}[pk.type]||'#fff';
    const glow = ctx.createRadialGradient(gx,gy,0,gx,gy,22);
    glow.addColorStop(0, col+'55'); glow.addColorStop(1, col+'00');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(gx,gy,22,0,Math.PI*2); ctx.fill();
    ctx.save(); ctx.translate(gx,gy);
    ctx.scale(1+Math.sin(pkTime*3+pk.id)*.04, 1+Math.sin(pkTime*3+pk.id)*.04);
    ctx.font = '20px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText({health:'❤️',shield:'🛡️',speed:'⚡',ammo:'🏹'}[pk.type]||'?', 0, 0);
    ctx.restore();
  });
}

// ──────────── PROJECTILES ────────────
function drawProjectiles() {
  Object.values(projectiles).forEach(p => {
    if (p.x < camX-20 || p.x > camX+canvas.width+20) return;
    ctx.save(); ctx.translate(p.x, p.y);
    if (p.type === 'arrow') {
      const angle = Math.atan2(p.vy||0, p.vx||0);
      ctx.rotate(angle);
      ctx.strokeStyle='#8B6914'; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.moveTo(-14,0); ctx.lineTo(10,0); ctx.stroke();
      ctx.fillStyle='#c0c0c0';
      ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(4,-3); ctx.lineTo(4,3); ctx.closePath(); ctx.fill();
      ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.moveTo(-14,0); ctx.lineTo(-10,-4); ctx.lineTo(-8,0); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-14,0); ctx.lineTo(-10,4);  ctx.lineTo(-8,0); ctx.closePath(); ctx.fill();
    } else if (p.type === 'bomb') {
      ctx.fillStyle='#1a1a1a'; ctx.beginPath(); ctx.arc(0,0,7,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#555';    ctx.beginPath(); ctx.arc(-2,-2,3,0,Math.PI*2); ctx.fill();
      const t=(Date.now()%500)/500;
      ctx.fillStyle=`rgba(255,${Math.floor(150+100*t)},0,${0.7+t*.3})`;
      ctx.beginPath(); ctx.arc(0,-7-t*3,2+t,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  });
}

// ──────────── PLAYERS ────────────
function drawAllPlayers() {
  const sorted = Object.values(players).sort((a,b) => (a.id===myId?1:0)-(b.id===myId?1:0));
  sorted.forEach(p => {
    if (p.x+PLAYER_W < camX-10 || p.x > camX+canvas.width+10) return;
    if (!p.alive) { drawDeadPlayer(p); return; }
    drawPlayer(p);
  });
}

function drawPlayer(p) {
  const app  = appMap[p.id]?.appearance || APPEARANCES_CLIENT[0] || {};
  const skin  = app.skin  || '#FFDBB4';
  const hair  = app.hair  || '#1a0a00';
  const shirt = app.shirt || '#E53935';
  const pants = app.pants || '#1565c0';
  const belt  = app.belt  || '#3e2723';
  const shoe  = app.shoe  || '#212121';
  const isMe  = p.id === myId;
  const t     = Date.now() * 0.001;

  ctx.save();
  ctx.translate(p.x + PLAYER_W/2, p.y);
  ctx.scale(p.facing||1, 1);

  const anim  = p.anim || 'idle';
  const isRun = anim==='run';
  const isJmp = anim==='jump';
  const isAtk = anim==='attack';
  const isDsh = anim==='dash';

  const legA  = isRun ? Math.sin(t*10)*28 : 0;
  const armA  = isRun ? Math.sin(t*10+Math.PI)*20 : isAtk ? 38 : isJmp ? -12 : 5;
  const lean  = isDsh ? 0.18 : 0;

  ctx.rotate(lean);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(0, PLAYER_H+2, 13, 4, 0, 0, Math.PI*2); ctx.fill();

  // === LEGS ===
  drawLimb(ctx, -7, PLAYER_H*.56, 8, 22, pants,  legA);
  drawLimb(ctx,  7, PLAYER_H*.56, 8, 22, pants, -legA);
  // Shoes
  ctx.fillStyle = shoe;
  ctx.fillRect(-15, PLAYER_H-9, 15, 8);
  ctx.fillRect(  1, PLAYER_H-9, 15, 8);

  // === BODY ===
  const torsoY = PLAYER_H*.28, torsoH = PLAYER_H*.35;
  ctx.fillStyle = shirt;
  roundRect(ctx, -12, torsoY, 24, torsoH, 3); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(-12, torsoY, 12, torsoH*.5);
  ctx.fillStyle = belt; ctx.fillRect(-12, torsoY+torsoH-7, 24, 6);

  // === ARMS ===
  drawLimb(ctx, -10, torsoY+2, 7, 20, skin,  armA);
  drawLimb(ctx,  10, torsoY+2, 7, 20, skin, -armA+5);

  // Sword (front hand)
  ctx.save();
  ctx.translate(10, torsoY+2);
  ctx.rotate((-armA+5)*Math.PI/180);
  ctx.fillStyle = '#795548'; ctx.fillRect(-2,18,5,8);
  ctx.fillStyle = '#9e9e9e'; ctx.fillRect(-5,16,11,4);
  const bladeG = ctx.createLinearGradient(-1,0,3,0);
  bladeG.addColorStop(0,'#e0e0e0'); bladeG.addColorStop(1,'#9e9e9e');
  ctx.fillStyle = bladeG;
  ctx.beginPath(); ctx.moveTo(-1,16); ctx.lineTo(3,16); ctx.lineTo(2,-6); ctx.lineTo(1,-8); ctx.lineTo(0,-6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(0,0,1,12);
  ctx.restore();

  // === HEAD ===
  const headY = torsoY-26;
  ctx.fillStyle = skin; ctx.fillRect(-4, torsoY-8, 8, 10); // neck
  ctx.fillStyle = skin; roundRect(ctx,-12,headY,24,24,5); ctx.fill();
  ctx.fillStyle = skin; ctx.fillRect(10,headY+8,3,6); // ear

  // Eyes
  ctx.fillStyle='#fff'; ctx.fillRect(-8,headY+8,5,6); ctx.fillRect(3,headY+8,5,6);
  ctx.fillStyle='#1a1a2e'; ctx.fillRect(-7,headY+9,3,4); ctx.fillRect(4,headY+9,3,4);
  ctx.fillStyle='#fff'; ctx.fillRect(-6,headY+9,1,2); ctx.fillRect(5,headY+9,1,2);

  // Eyebrows
  ctx.fillStyle=hair; ctx.fillRect(-9,headY+5,7,2); ctx.fillRect(2,headY+5,7,2);

  // Nose
  ctx.fillStyle='rgba(0,0,0,.12)'; ctx.fillRect(1,headY+13,2,3);

  // Mouth
  ctx.strokeStyle='rgba(80,30,0,.6)'; ctx.lineWidth=1.5;
  ctx.beginPath();
  if (isAtk) { ctx.arc(0,headY+19,4,0.15,Math.PI-.15); }
  else        { ctx.arc(0,headY+20,3,Math.PI+.35,-.35); }
  ctx.stroke();

  // Hair
  ctx.fillStyle=hair; roundRect(ctx,-12,headY,24,9,[5,5,0,0]); ctx.fill();
  ctx.fillRect(-13,headY+2,3,8);

  // My player glow ring
  if (isMe) {
    ctx.strokeStyle='rgba(0,229,255,.4)'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(0,headY+12,14,0,Math.PI*2); ctx.stroke();
  }

  // Shield aura
  if (p.shield > 0) {
    const sa = p.shield/MAX_SHIELD;
    ctx.strokeStyle=`rgba(0,229,255,${sa*.5})`; ctx.lineWidth=2+sa*2;
    ctx.beginPath(); ctx.arc(0,PLAYER_H/2,PLAYER_W/2+7,0,Math.PI*2); ctx.stroke();
  }

  // Dash trail
  if (isDsh) { ctx.globalAlpha=.25; ctx.fillStyle='#9c4dff'; ctx.fillRect(-15,0,30,PLAYER_H); ctx.globalAlpha=1; }

  ctx.restore(); // unscale facing

  // Nametag (always right-way)
  drawNameTag(p, isMe);
}

function drawLimb(c, ox, oy, w, h, color, angleDeg) {
  c.save();
  c.translate(ox, oy);
  c.rotate(angleDeg*Math.PI/180);
  c.fillStyle = color;
  roundRect(c,-w/2,0,w,h,3); c.fill();
  c.fillStyle='rgba(255,255,255,.1)'; c.fillRect(-w/2,0,w/2,h*.55);
  c.restore();
}

function drawNameTag(p, isMe) {
  const cx = p.x + PLAYER_W/2;
  const ty = p.y - 30;
  const hpPct = clamp((p.hp||0)/MAX_HP, 0, 1);
  const name  = appMap[p.id]?.name || '?';

  // HP bar
  ctx.fillStyle='rgba(0,0,0,.5)';
  roundRect(ctx,cx-22,ty-8,44,6,3); ctx.fill();
  ctx.fillStyle = hpPct>.6?'#00e676':hpPct>.3?'#ffea00':'#ff1744';
  roundRect(ctx,cx-22,ty-8,44*hpPct,6,3); ctx.fill();

  // Shield bar
  if (p.shield > 0) {
    ctx.fillStyle='rgba(0,0,0,.4)'; roundRect(ctx,cx-22,ty-15,44,4,2); ctx.fill();
    ctx.fillStyle='#00e5ff'; roundRect(ctx,cx-22,ty-15,44*(p.shield/MAX_SHIELD),4,2); ctx.fill();
  }

  // Name
  ctx.save();
  ctx.font     = isMe ? 'bold 10px system-ui' : '9px system-ui';
  ctx.textAlign='center'; ctx.textBaseline='bottom';
  ctx.fillStyle   = isMe ? '#00e5ff' : '#e0e0ff';
  ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur=5;
  ctx.fillText(name, cx, ty-17);
  ctx.shadowBlur=0; ctx.restore();
}

function drawDeadPlayer(p) {
  const cx = p.x+PLAYER_W/2, cy = p.y+PLAYER_H*.65;
  ctx.save();
  ctx.globalAlpha=.35;
  ctx.translate(cx,cy); ctx.rotate(Math.PI/2);
  ctx.fillStyle=(appMap[p.id]?.appearance?.shirt)||'#555';
  ctx.fillRect(-PLAYER_W/2,-10,PLAYER_W,20);
  ctx.globalAlpha=.7; ctx.font='20px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('💀',0,0);
  ctx.restore();
}

// ──────────── PARTICLES ────────────
function spawnParticles(x, y, color, count) {
  for (let i=0; i<count; i++) {
    const a=Math.random()*Math.PI*2, sp=1+Math.random()*4;
    particles.push({ x,y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-2, life:.8+Math.random()*.4, maxLife:1.2, r:2+Math.random()*3, color, g:.15 });
  }
}
function spawnMeleeEffect(x, y, facing) {
  for (let i=0; i<8; i++) {
    particles.push({ x:x+(facing>0?20:-20), y:y+15, vx:(facing>0?1:-1)*(3+Math.random()*5), vy:(Math.random()-.5)*4-1, life:.4, maxLife:.4, r:4+Math.random()*4, color:'#ffca28', g:.1 });
  }
}
function spawnExplosion(x, y, radius) {
  const colors=['#ff6d00','#ffea00','#ff1744','#fff'];
  for (let i=0; i<30; i++) {
    const a=(i/30)*Math.PI*2, sp=2+Math.random()*6;
    particles.push({ x,y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-2, life:.8+Math.random()*.5, maxLife:1.3, r:3+Math.random()*6, color:colors[i%4], g:.2 });
  }
  particles.push({ x,y, vx:0,vy:0, life:.35,maxLife:.35, r:radius, color:'rgba(255,180,80,0.35)', type:'ring', g:0 });
}
function updateParticles(dt) {
  for (let i=particles.length-1; i>=0; i--) {
    const p=particles[i];
    p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=p.g*dt;
    p.life-=dt*.06; p.vx*=.96; p.vy*=.97;
    if (p.life<=0) particles.splice(i,1);
  }
}
function drawParticles() {
  particles.forEach(p => {
    const a = clamp(p.life/p.maxLife,0,1);
    ctx.save(); ctx.globalAlpha=a;
    if (p.type==='ring') {
      ctx.strokeStyle=p.color; ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*(1.2-(a*.5))+5,0,Math.PI*2); ctx.stroke();
    } else {
      ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  });
}

// ──────────── MINIMAP ────────────
function drawMinimap() {
  const mW=mmCanvas.width, mH=mmCanvas.height;
  mmCtx.clearRect(0,0,mW,mH);
  mmCtx.fillStyle='rgba(4,4,16,.78)'; mmCtx.fillRect(0,0,mW,mH);
  const sx=mW/worldW, sy=mH/worldH;

  // Ground line
  mmCtx.fillStyle='#2d5a27'; mmCtx.fillRect(0,mH-4,mW,4);

  // Platforms
  platforms.forEach((p,i)=>{
    if(i===0) return;
    mmCtx.fillStyle=p.type==='cloud'?'rgba(150,160,255,.4)':p.type==='stone'?'#5a5a6e':'#8B6914';
    mmCtx.fillRect(p.x*sx, p.y*sy, Math.max(p.w*sx,2), 2);
  });

  // Pickups
  pickups.forEach(pk=>{
    if(!pk.active) return;
    mmCtx.fillStyle={health:'#ff1744',shield:'#00e5ff',speed:'#ffea00',ammo:'#ff9800'}[pk.type]||'#fff';
    mmCtx.fillRect(pk.x*sx-1,pk.y*sy-1,3,3);
  });

  // Players
  Object.values(players).forEach(p=>{
    if(!p.alive) return;
    const mx=p.x*sx, my=p.y*sy;
    if(p.id===myId){
      mmCtx.fillStyle='#00e5ff';
      mmCtx.beginPath(); mmCtx.arc(mx,my,3,0,Math.PI*2); mmCtx.fill();
      mmCtx.strokeStyle='rgba(0,229,255,.5)'; mmCtx.lineWidth=1;
      mmCtx.beginPath(); mmCtx.arc(mx,my,5,0,Math.PI*2); mmCtx.stroke();
    } else {
      mmCtx.fillStyle='#ff5722';
      mmCtx.beginPath(); mmCtx.arc(mx,my,2.5,0,Math.PI*2); mmCtx.fill();
    }
  });

  // Camera rect
  mmCtx.strokeStyle='rgba(255,255,255,.18)'; mmCtx.lineWidth=.6;
  mmCtx.strokeRect(camX*sx,camY*sy,canvas.width*sx,canvas.height*sy);
  mmCtx.strokeStyle='rgba(255,255,255,.22)'; mmCtx.lineWidth=1;
  mmCtx.strokeRect(0,0,mW,mH);
}

// ═══════════════════════════════════════════════════════════════
// HUD
// ═══════════════════════════════════════════════════════════════
function updateHUD(p) {
  const me = p || players[myId];
  if (!me) return;
  const hp = clamp(me.hp||0, 0, MAX_HP);
  const sh = clamp(me.shield||0, 0, MAX_SHIELD);
  const hpEl=$('hpFill'), shEl=$('shFill'), hpVEl=$('hpVal'), shVEl=$('shVal');
  if(hpEl) hpEl.style.width=(hp/MAX_HP*100)+'%';
  if(shEl) shEl.style.width=(sh/MAX_SHIELD*100)+'%';
  if(hpVEl) hpVEl.textContent=Math.round(hp);
  if(shVEl) shVEl.textContent=Math.round(sh);
  const kEl=$('hudKills'),dEl=$('hudDeaths'),aEl=$('hudArrows');
  if(kEl) kEl.textContent=me.kills||0;
  if(dEl) dEl.textContent=me.deaths||0;
  if(aEl && me.arrows!==undefined) aEl.textContent=me.arrows;
  updateHUDCount();
}
function updateHUDCount() {
  const el=$('hudPlayerCount');
  if(el) el.textContent=Object.keys(players).length+' oyuncu';
}

function addKillFeed(killerName, victimName, reason) {
  const icons={melee:'⚔️',arrow:'🏹',bomb:'💣',fall:'💨'};
  const el=document.createElement('div');
  el.className='kf-entry '+(reason||'');
  el.textContent=(killerName?`${icons[reason]||'💀'} ${killerName} → ${victimName}`:`${icons[reason]||'💀'} ${victimName} düştü!`);
  $('killFeed').appendChild(el);
  setTimeout(()=>el.remove(),3200);
}

function startRespawnTimer(ms) {
  $('respawnScreen').classList.remove('hidden');
  let rem=Math.ceil(ms/1000);
  $('respawnTimer').textContent=rem;
  clearInterval(respawnInterval);
  respawnInterval=setInterval(()=>{
    rem--; $('respawnTimer').textContent=Math.max(0,rem);
    if(rem<=0) endRespawnTimer();
  },1000);
}
function endRespawnTimer() {
  clearInterval(respawnInterval);
  $('respawnScreen').classList.add('hidden');
}

function appendChat(name, text, type) {
  const el=document.createElement('div');
  el.className='chat-msg '+(type||'normal');
  if(type==='sys') el.textContent=text;
  else el.innerHTML=`<span class="cn">${esc(name)}</span>: ${esc(text)}`;
  const box=$('chatMessages'); box.appendChild(el);
  if(box.children.length>25) box.firstChild.remove();
  box.scrollTop=box.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════
// ROOM LIST UI
// ═══════════════════════════════════════════════════════════════
function renderRoomList(list) {
  const container=$('roomList');
  if(!container) return;
  if(!list||list.length===0){
    container.innerHTML='<div class="empty-rooms">Oda yok — ilk odayı sen oluştur!</div>'; return;
  }
  container.innerHTML=list.map(r=>{
    const pct=(r.playerCount/r.maxPlayers)*100;
    const fill=pct<50?'var(--green)':pct<80?'var(--yellow)':'var(--red)';
    const icon=r.isPublic?'🌍':r.hasPassword?'🔒':'🏠';
    const lock=r.hasPassword?'<span class="room-pill locked">🔐</span>':'<span class="room-pill open">🔓</span>';
    return `<div class="room-card" data-id="${esc(r.id)}" data-locked="${!!r.hasPassword}" data-name="${esc(r.name)}">
      <div class="room-icon">${icon}</div>
      <div class="room-info"><div class="room-name">${esc(r.name)}</div><div class="room-meta">${r.playerCount}/${r.maxPlayers}</div></div>
      <div class="room-right">${lock}<div class="room-bar"><div class="room-bar-fill" style="width:${pct}%;background:${fill}"></div></div></div>
    </div>`;
  }).join('');
  container.querySelectorAll('.room-card').forEach(card=>{
    card.addEventListener('click',()=>{
      const id=card.dataset.id, locked=card.dataset.locked==='true', name=card.dataset.name;
      if(id==='public'){socket.emit('joinPublic');return;}
      if(locked){
        pendingRoomId=id; pendingRoomName=name;
        $('modalPassRoomName').textContent=`"${name}" için şifre gerekli`;
        $('fJoinPass').value='';
        $('modalPassword').style.display='flex';
      } else socket.emit('joinRoom',{roomId:id,password:''});
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// SCOREBOARD
// ═══════════════════════════════════════════════════════════════
function renderScoreboard() {
  const sorted=Object.values(players).map(p=>({...p,name:appMap[p.id]?.name||'?'})).sort((a,b)=>(b.kills-b.deaths)-(a.kills-a.deaths));
  $('scoreBoardList').innerHTML=sorted.map((p,i)=>{
    const icon=i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`;
    return `<div class="sc-row ${p.id===myId?'me':''}">
      <span class="sc-rank">${icon}</span>
      <span class="sc-name" style="color:${appMap[p.id]?.appearance?.shirt||'#eee'}">${esc(p.name)}${p.id===myId?' ★':''}</span>
      <span class="sc-kd">⚔️${p.kills||0} 💀${p.deaths||0}</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// CHARACTER PREVIEW
// ═══════════════════════════════════════════════════════════════
function buildCharPreviews() {
  const row=$('charRow'); if(!row) return;
  row.innerHTML='';
  APPEARANCES_CLIENT.forEach((app,i)=>{
    const wrap=document.createElement('div');
    wrap.className='char-thumb'+(i===selectedCharIdx?' selected':'');
    const c=document.createElement('canvas'); c.width=56; c.height=72;
    drawCharThumb(c.getContext('2d'),app);
    wrap.appendChild(c);
    const lbl=document.createElement('div');
    lbl.style.cssText='font-size:.5rem;text-align:center;color:#8888cc;padding:.1rem';
    lbl.textContent=(app.name||'').split(' ')[0];
    wrap.appendChild(lbl);
    wrap.addEventListener('click',()=>{
      selectedCharIdx=i; myAppearance=app;
      row.querySelectorAll('.char-thumb').forEach(e=>e.classList.remove('selected'));
      wrap.classList.add('selected');
    });
    row.appendChild(wrap);
  });
}

function drawCharThumb(c, app) {
  if(!app) return;
  c.clearRect(0,0,56,72);
  const cx=28, by=68;
  const skin=app.skin||'#FFDBB4',hair=app.hair||'#1a0a00',shirt=app.shirt||'#E53935',pants=app.pants||'#1565c0',shoe=app.shoe||'#212121';
  c.fillStyle='rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(cx,by,10,3,0,0,Math.PI*2); c.fill();
  c.fillStyle=pants; c.fillRect(cx-9,by-20,8,18); c.fillRect(cx+1,by-20,8,18);
  c.fillStyle=shoe;  c.fillRect(cx-10,by-7,10,7); c.fillRect(cx+1,by-7,10,7);
  c.fillStyle=shirt; c.beginPath(); c.roundRect?c.roundRect(cx-11,by-40,22,22,3):c.rect(cx-11,by-40,22,22); c.fill();
  c.fillStyle='rgba(255,255,255,.1)'; c.fillRect(cx-11,by-40,11,22*.5);
  c.fillStyle=app.belt||'#3e2723'; c.fillRect(cx-11,by-22,22,5);
  c.fillStyle=skin; c.fillRect(cx-16,by-38,6,16); c.fillRect(cx+10,by-38,6,16);
  c.fillStyle=skin; c.fillRect(cx-4,by-44,8,6);
  c.fillStyle=skin; c.beginPath(); c.roundRect?c.roundRect(cx-11,by-62,22,20,5):c.rect(cx-11,by-62,22,20); c.fill();
  c.fillStyle='#fff'; c.fillRect(cx-8,by-57,4,5); c.fillRect(cx+4,by-57,4,5);
  c.fillStyle='#1a1a2e'; c.fillRect(cx-7,by-56,2,3); c.fillRect(cx+5,by-56,2,3);
  c.strokeStyle='rgba(80,30,0,.6)'; c.lineWidth=1.2;
  c.beginPath(); c.arc(cx,by-47,3,Math.PI+.4,-.4); c.stroke();
  c.fillStyle=hair; c.beginPath(); c.roundRect?c.roundRect(cx-11,by-62,22,8,[5,5,0,0]):c.rect(cx-11,by-62,22,8); c.fill();
}

// ═══════════════════════════════════════════════════════════════
// LEAVE ROOM
// ═══════════════════════════════════════════════════════════════
function leaveRoom() {
  if(!confirm('Odadan çıkmak istiyor musun?')) return;
  socket.emit('leaveRoom');
  if(raf){ cancelAnimationFrame(raf); raf=0; }
  players={}; appMap={}; pickups=[]; projectiles=[]; particles=[];
  showScreen('screenLobby');
  socket.emit('getRooms');
}

// ═══════════════════════════════════════════════════════════════
// UI EVENTS
// ═══════════════════════════════════════════════════════════════
function setupUI() {
  $('btnJoinPublic').addEventListener('click', ()=> socket.emit('joinPublic'));
  $('btnQuickJoin').addEventListener('click',  ()=> socket.emit('quickJoin'));
  $('btnRefresh').addEventListener('click',    ()=> socket.emit('getRooms'));

  $('btnCreateRoom').addEventListener('click', ()=>{
    $('fRoomName').value=''; $('fRoomPass').value='';
    $('modalCreateRoom').style.display='flex';
  });
  $('btnConfirmCreate').addEventListener('click', ()=>{
    const name=$('fRoomName').value.trim()||`${myName}'ın Odası`;
    socket.emit('createRoom',{name,password:$('fRoomPass').value.trim()});
  });
  $('btnCancelCreate').addEventListener('click', ()=>{ $('modalCreateRoom').style.display='none'; });

  $('btnConfirmPass').addEventListener('click', ()=>{
    if(!pendingRoomId) return;
    socket.emit('joinRoom',{roomId:pendingRoomId,password:$('fJoinPass').value});
  });
  $('btnCancelPass').addEventListener('click', ()=>{ $('modalPassword').style.display='none'; pendingRoomId=null; });
  $('fJoinPass').addEventListener('keydown', e=>{ if(e.key==='Enter') $('btnConfirmPass').click(); });
  $('fRoomName').addEventListener('keydown',  e=>{ if(e.key==='Enter') $('btnConfirmCreate').click(); });

  $('hudLeave').addEventListener('click', leaveRoom);

  $('chatSendBtn').addEventListener('click', sendChat);
  $('chatInput').addEventListener('keydown', e=>{ if(e.key==='Enter'){ sendChat(); e.preventDefault(); } e.stopPropagation(); });
  $('chatInput').addEventListener('keyup', e=> e.stopPropagation());
  $('chatInput').addEventListener('touchstart', e=> e.stopPropagation(), {passive:true});

  $('abtScore').addEventListener('click', toggleScore);
  document.addEventListener('keydown', e=>{ if(e.key==='Tab'){ e.preventDefault(); toggleScore(); } });

  // 2-finger scoreboard on canvas
  canvas.addEventListener('touchstart', e=>{
    if(e.touches.length===2){ e.preventDefault(); toggleScore(); }
  },{passive:false});
}

function toggleScore() {
  scoreVisible=!scoreVisible;
  const sb=$('scoreBoard');
  sb.style.display=scoreVisible?'block':'none';
  if(scoreVisible) renderScoreboard();
}

function sendChat() {
  const input=$('chatInput'), txt=input.value.trim();
  if(!txt||!myRoomId) return;
  socket.emit('chat',txt); input.value='';
}

// ═══════════════════════════════════════════════════════════════
// CONTROLS
// ═══════════════════════════════════════════════════════════════
function setupControls() {
  // Keyboard
  const keyDown = {ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right'};
  document.addEventListener('keydown', e=>{
    if(keyDown[e.code]) inp[keyDown[e.code]]=true;
    if(['ArrowUp','KeyW','Space'].includes(e.code)){ e.preventDefault(); jumpQ=true; }
    if(['KeyZ','KeyJ'].includes(e.code)) atkQ=true;
    if(['KeyX','KeyK'].includes(e.code)) shootQ=true;
    if(['KeyC','KeyB'].includes(e.code)) bombQ=true;
    if(['ShiftLeft','ShiftRight'].includes(e.code)) dashQ=true;
  });
  document.addEventListener('keyup', e=>{
    if(keyDown[e.code]) inp[keyDown[e.code]]=false;
  });

  // Touch buttons
  holdBtn('cbtLeft',  ()=>inp.left=true,  ()=>inp.left=false);
  holdBtn('cbtRight', ()=>inp.right=true, ()=>inp.right=false);
  tapBtn('abtJump',   ()=>jumpQ=true);
  tapBtn('abtAtk',    ()=>{ atkQ=true;   cdVis('abtAtk',550); });
  tapBtn('abtShoot',  ()=>{ shootQ=true; cdVis('abtShoot',900); });
  tapBtn('abtBomb',   ()=>{ bombQ=true;  cdVis('abtBomb',4000); });
  tapBtn('abtDash',   ()=>{ dashQ=true;  cdVis('abtDash',1200); });
}

function holdBtn(id, onDown, onUp) {
  const el=$(id); if(!el) return;
  const dn=()=>{ onDown(); el.classList.add('pressed'); };
  const up=()=>{ onUp(); el.classList.remove('pressed'); };
  el.addEventListener('pointerdown', dn);
  el.addEventListener('pointerup',   up);
  el.addEventListener('pointerleave',up);
  el.addEventListener('touchstart', e=>{ e.preventDefault(); dn(); },{passive:false});
  el.addEventListener('touchend',   e=>{ e.preventDefault(); up(); },{passive:false});
}

function tapBtn(id, onDown) {
  const el=$(id); if(!el) return;
  el.addEventListener('pointerdown', e=>{ e.preventDefault(); onDown(); el.classList.add('pressed'); });
  el.addEventListener('pointerup',   ()=> el.classList.remove('pressed'));
  el.addEventListener('pointerleave',()=> el.classList.remove('pressed'));
}

function cdVis(id, ms) {
  const el=$(id); if(!el) return;
  el.classList.add('on-cooldown');
  setTimeout(()=>el.classList.remove('on-cooldown'),ms);
}

// ═══════════════════════════════════════════════════════════════
// CANVAS RESIZE
// ═══════════════════════════════════════════════════════════════
function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

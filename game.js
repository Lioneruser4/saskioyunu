/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         SaskiOyunu v2.0 – Full Game Engine                 ║
 * ║         Professional Multiplayer 2D Battle Platform        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
'use strict';

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const SERVER_URL   = 'https://saskioyunu.onrender.com';
const PLAYER_W     = 30;
const PLAYER_H     = 52;
const MAX_HP       = 100;
const MAX_SHIELD   = 50;
const MAX_ARROWS   = 15;
const MELEE_CD     = 550;
const ARROW_CD     = 900;
const BOMB_CD      = 4000;
const DASH_CD      = 1200;
const RESPAWN_MS   = 5000;
const CAM_LERP     = 0.1;
const TIP_MSGS     = [
  '💡 Çift zıplama için zıpla tuşuna 2 kez bas!',
  '💡 Kalkan toplayarak hasarı azalt!',
  '💡 Bomba 2.5 saniye sonra patlar!',
  '💡 Dash ile düşmanlardan kaç!',
  '💡 Harita kenarlarından düşmemeye dikkat!',
  '💡 Skor tablosu için 2 parmak kullan!',
];

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let socket, myId, myName, myAppearance, myRoomId, myRoomName;
let platforms = [], worldW = 6000, worldH = 800;
let players   = {};   // id → full state
let appMap    = {};   // id → { name, appearance }
let pickups   = [];
let projectiles = {}; // id → { x,y,vx,vy,type }
let particles   = []; // visual only
let pendingRoomId = null, pendingRoomName = '';
let selectedCharIdx = 0;
const APPEARANCES_CLIENT = [];

// Input
const inp = { left:false, right:false, jump:false, attack:false, shoot:false, bomb:false, dash:false };
let jumpQueued = false, attackQueued = false, shootQueued = false, bombQueued = false, dashQueued = false;
let lastJump=0, lastAtk=0, lastShoot=0, lastBomb=0, lastDash=0;

// Camera
let camX=0, camY=0;

// Frame / timing
let raf=0, lastTs=0;
let scoreVisible=false;
let respawnCountdown=0, respawnInterval=null;

// Canvas
const canvas    = document.getElementById('gameCanvas');
const ctx       = canvas.getContext('2d');
const mmCanvas  = document.getElementById('minimapCanvas');
const mmCtx     = mmCanvas.getContext('2d');

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════
function clamp(v,min,max){ return v<min?min:v>max?max:v; }
function lerp(a,b,t){ return a+(b-a)*t; }
function dist2(ax,ay,bx,by){ const dx=ax-bx,dy=ay-by; return dx*dx+dy*dy; }
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function showNotif(msg, type='info'){
  const stack = document.getElementById('notifStack');
  const el    = document.createElement('div');
  el.className = `notif-item ${type}`;
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(()=> el.remove(), 2800);
}

function setScreen(name){
  ['screenLoad','screenLobby','screenGame'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    if(id === `screen${capitalize(name)}`){
      el.classList.remove('hidden','out');
    } else {
      el.classList.add('out');
      setTimeout(()=>el.classList.add('hidden'),260);
    }
  });
}
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

// ═══════════════════════════════════════════════════════════════
// TELEGRAM
// ═══════════════════════════════════════════════════════════════
function getTelegramUser(){
  try{
    const tg = window.Telegram?.WebApp;
    if(tg?.initDataUnsafe?.user){
      tg.expand();
      tg.enableClosingConfirmation();
      tg.setHeaderColor('#090912');
      return tg.initDataUnsafe.user;
    }
  }catch(e){}
  return null;
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
window.addEventListener('load', ()=>{
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const tgUser = getTelegramUser();
  if(tgUser){
    myName = (tgUser.first_name + (tgUser.last_name?' '+tgUser.last_name:'')).slice(0,20);
  } else {
    myName = localStorage.getItem('sask_name') || '';
    if(!myName){
      myName = prompt('Kullanıcı adın:')?.trim() || 'Savaşçı'+Math.floor(Math.random()*9000+1000);
      localStorage.setItem('sask_name', myName);
    }
  }

  // Rotate tips
  let tipIdx = 0;
  const tipEl = document.getElementById('loadTip');
  const tipTimer = setInterval(()=>{
    tipIdx = (tipIdx+1)%TIP_MSGS.length;
    if(tipEl) tipEl.textContent = TIP_MSGS[tipIdx];
  }, 900);

  // Connect
  socket = io(SERVER_URL, {
    transports:['websocket','polling'],
    reconnection:true, reconnectionAttempts:Infinity,
    reconnectionDelay:1500, timeout:20000
  });

  socket.on('connect', ()=>{
    clearInterval(tipTimer);
    socket.emit('joinLobby', { name: myName, telegramId: tgUser?.id||null });
  });

  socket.on('disconnect', ()=> showNotif('Bağlantı kesildi, yeniden bağlanılıyor...','err'));
  socket.on('reconnect',  ()=>{
    showNotif('Yeniden bağlandı!','ok');
    socket.emit('joinLobby', { name: myName, telegramId: tgUser?.id||null });
  });

  setupSocketHandlers();
  setupUI();
  setupControls();
});

// ═══════════════════════════════════════════════════════════════
// SOCKET HANDLERS
// ═══════════════════════════════════════════════════════════════
function setupSocketHandlers(){

  socket.on('lobbyReady', data=>{
    myId = data.playerId;
    platforms = data.platforms || [];
    worldW = data.worldW || 6000;
    worldH = data.worldH || 800;
    if(data.appearances) data.appearances.forEach((a,i)=>{ APPEARANCES_CLIENT[i]=a; });

    // Find closest appearance
    if(data.appearance) myAppearance = data.appearance;

    document.getElementById('displayName').textContent = myName;
    buildCharacterPreviews();
    setScreen('Lobby');
    socket.emit('getRooms');
  });

  socket.on('roomList', list=>{
    renderRoomList(list);
    let total = 0;
    list.forEach(r=> total += r.playerCount);
    document.getElementById('onlineCount').textContent = `🌐 ${total} oyuncu online`;
    document.getElementById('roomCountLabel').textContent = `(${list.length})`;
  });

  socket.on('roomListUpdate', list=>{
    if(document.getElementById('screenLobby').classList.contains('hidden')) return;
    renderRoomList(list);
  });

  socket.on('roomJoined', data=>{
    myRoomId   = data.roomId;
    myRoomName = data.roomName;
    platforms  = data.platforms || platforms;
    worldW     = data.worldW || worldW;
    worldH     = data.worldH || worldH;

    players = {};
    appMap  = data.appMap || {};
    pickups = data.pickups || [];
    projectiles = {};
    particles   = [];

    // Load existing players
    if(data.players) data.players.forEach(p=>{ players[p.id]=p; });

    // Self
    if(data.self) players[myId] = data.self;
    if(!appMap[myId]) appMap[myId] = { name: myName, appearance: myAppearance };

    document.getElementById('hudRoomName').textContent = myRoomName;
    document.getElementById('hudLeave').onclick = leaveRoom;
    document.getElementById('chatMessages').innerHTML = '';
    if(data.chat) data.chat.forEach(m=> appendChat(m.name, m.text));

    updateHUD();

    document.getElementById('modalPassword').classList.add('hidden');
    document.getElementById('modalCreateRoom').classList.add('hidden');

    setScreen('Game');
    if(raf) cancelAnimationFrame(raf);
    lastTs = performance.now();
    raf = requestAnimationFrame(gameLoop);
  });

  socket.on('joinError', msg=>{
    showNotif('❌ '+msg, 'err');
    document.getElementById('modalPassword').classList.add('hidden');
  });

  socket.on('tick', data=>{
    if(data.players) data.players.forEach(p=>{
      if(!players[p.id]) players[p.id] = p;
      else Object.assign(players[p.id], p);
    });
    if(data.projs) data.projs.forEach(pr=>{
      if(projectiles[pr.id]) { projectiles[pr.id].x=pr.x; projectiles[pr.id].y=pr.y; }
    });
    const me = players[myId];
    if(me) updateHUD(me);
  });

  socket.on('playerJoined', data=>{
    players[data.state.id] = data.state;
    appMap[data.state.id]  = { name: data.name, appearance: data.appearance };
    appendChat('', `👋 ${esc(data.name)} katıldı`, 'sys');
    updateHUDCount();
    spawnParticles(data.state.x, data.state.y, '#00e5ff', 12);
  });

  socket.on('playerLeft', id=>{
    const nm = appMap[id]?.name || id;
    appendChat('', `🚪 ${esc(nm)} ayrıldı`, 'sys');
    delete players[id];
    delete appMap[id];
    updateHUDCount();
  });

  socket.on('playerHurt', data=>{
    if(players[data.id]){ players[data.id].hp=data.hp; players[data.id].shield=data.shield; }
    if(data.id===myId) updateHUD(players[myId]);
    showDmgPopup(players[data.id], PLAYER_H+10);
    spawnParticles(players[data.id]?.x+15||0, players[data.id]?.y+20||0, '#ff1744', 6);
  });

  socket.on('killed', data=>{
    if(players[data.victimId]){ players[data.victimId].alive=false; players[data.victimId].hp=0; }
    if(data.victimId===myId){
      startRespawnTimer(data.respawnIn||RESPAWN_MS);
      updateHUD({ hp:0, shield:0, kills:players[myId]?.kills||0, deaths:(players[myId]?.deaths||0)+1 });
    }
    spawnParticles(players[data.victimId]?.x+15||0, players[data.victimId]?.y+20||0, '#ff1744', 20);
    addKillFeed(data.killerName, data.victimName, data.reason);
    if(data.killerName === myName) showNotif('💀 Kill! +1', 'ok');
  });

  socket.on('respawned', data=>{
    players[data.id] = { ...(players[data.id]||{}), ...data };
    if(data.id===myId){
      endRespawnTimer();
      updateHUD(data);
      spawnParticles(data.x+15, data.y+20, '#00e676', 15);
    }
  });

  socket.on('projCreated', p=>{
    projectiles[p.id] = { ...p };
  });

  socket.on('projsRemoved', list=>{
    list.forEach(item=>{
      const p = projectiles[item.id];
      if(p) spawnParticles(p.x, p.y, item.type==='bomb'?'#ff6d00':'#ffea00', item.type==='bomb'?30:8);
      delete projectiles[item.id];
    });
  });

  socket.on('bombExplode', data=>{
    spawnExplosion(data.x, data.y, data.radius);
  });

  socket.on('meleeSwing', data=>{
    spawnMeleeEffect(data.x, data.y, data.facing);
    data.hitIds?.forEach(id=>{
      if(players[id]) spawnParticles(players[id].x+15, players[id].y+20, '#ff1744', 8);
    });
  });

  socket.on('pickupCollected', data=>{
    const pk = pickups.find(p=>p.id===data.pkId);
    if(pk){ pk.active=false; spawnParticles(pk.x, pk.y, '#00e676', 10); }
    if(data.playerId===myId){
      if(players[myId]){ players[myId].hp=data.hp; players[myId].shield=data.shield; }
      updateHUD(players[myId]);
    }
  });

  socket.on('pickupSpawned', id=>{
    const pk = pickups.find(p=>p.id===id);
    if(pk){ pk.active=true; spawnParticles(pk.x, pk.y, '#00e5ff', 6); }
  });

  socket.on('chatMessage', data=>{
    appendChat(data.name, data.text, 'normal');
  });
}

// ═══════════════════════════════════════════════════════════════
// GAME LOOP
// ═══════════════════════════════════════════════════════════════
let inputTick = 0;
function gameLoop(ts){
  raf = requestAnimationFrame(gameLoop);
  const dt = clamp((ts-lastTs)/16.667, 0.1, 4);
  lastTs = ts;

  sendInput();
  updateParticles(dt);
  updateCamera(dt);
  renderFrame(dt);
}

function sendInput(){
  inputTick++;
  if(inputTick < 2) return;
  inputTick = 0;

  const now = Date.now();
  const jmp  = jumpQueued;   jumpQueued   = false;
  const atk  = attackQueued; attackQueued = false;
  const sht  = shootQueued;  shootQueued  = false;
  const bmb  = bombQueued;   bombQueued   = false;
  const dsh  = dashQueued;   dashQueued   = false;

  socket.emit('input', {
    left:   inp.left,
    right:  inp.right,
    jump:   jmp  || inp.jump,
    attack: atk,
    shoot:  sht,
    bomb:   bmb,
    dash:   dsh,
    aimAngle: 0
  });
}

// ═══════════════════════════════════════════════════════════════
// CAMERA
// ═══════════════════════════════════════════════════════════════
function updateCamera(dt){
  const me = players[myId];
  if(!me) return;
  const tx = clamp(me.x+PLAYER_W/2 - canvas.width/2,  0, worldW-canvas.width);
  const ty = clamp(me.y+PLAYER_H/2 - canvas.height/2, 0, worldH-canvas.height);
  camX = lerp(camX, tx, CAM_LERP*(dt*2));
  camY = lerp(camY, ty, CAM_LERP*(dt*2));
}

// ═══════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════
function renderFrame(){
  const W=canvas.width, H=canvas.height;
  ctx.clearRect(0,0,W,H);

  // Sky
  drawSky(W,H);
  drawStars(W,H);

  ctx.save();
  ctx.translate(-Math.round(camX), -Math.round(camY));

  drawClouds();
  drawPlatforms();
  drawPickups();
  drawProjectiles();
  drawPlayers();
  drawParticles();

  ctx.restore();

  // Minimap
  drawMinimap();
}

// ──────────── Sky ────────────
const skyGrad = [];
function drawSky(W,H){
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#040410');
  g.addColorStop(.6,'#0d0d28');
  g.addColorStop(1,'#1a1a3a');
  ctx.fillStyle=g;
  ctx.fillRect(0,0,W,H);
}

// ──────────── Stars ────────────
const STARS = Array.from({length:120},()=>({
  wx: Math.random()*6000, wy: Math.random()*400,
  r:  Math.random()*1.4+0.3,
  twinkle: Math.random()*Math.PI*2,
  speed: 0.05+Math.random()*0.15
}));
let starTime=0;
function drawStars(W,H){
  starTime += 0.02;
  STARS.forEach(s=>{
    const sx = ((s.wx - camX*s.speed) % W + W) % W;
    const sy = s.wy * (H/400);
    const alpha = 0.35 + 0.35*Math.sin(starTime+s.twinkle);
    ctx.fillStyle = `rgba(200,200,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(sx,sy,s.r,0,Math.PI*2);
    ctx.fill();
  });
}

// ──────────── Clouds ────────────
const CLOUDS = Array.from({length:18},()=>({
  x: Math.random()*7000-500,
  y: 50+Math.random()*250,
  w: 120+Math.random()*200,
  h: 40+Math.random()*60,
  speed: 0.08+Math.random()*0.12,
  alpha: 0.04+Math.random()*0.08
}));
let cloudT=0;
function drawClouds(){
  cloudT += 0.005;
  CLOUDS.forEach(c=>{
    const cx = ((c.x + cloudT*50*c.speed) % (worldW+600)) - 300;
    ctx.fillStyle = `rgba(150,150,255,${c.alpha})`;
    ctx.beginPath();
    ctx.ellipse(cx, c.y, c.w/2, c.h/2, 0, 0, Math.PI*2);
    ctx.fill();
  });
}

// ──────────── Platforms ────────────
const platCache = new Map();
function getPlatGrad(type, y, h){
  const key = type+y;
  if(platCache.has(key)) return platCache.get(key);
  const g = ctx.createLinearGradient(0,y,0,y+h);
  switch(type){
    case 'ground':
      g.addColorStop(0,'#2d5a27'); g.addColorStop(.12,'#1e3d1b'); g.addColorStop(1,'#0a1409'); break;
    case 'wood':
      g.addColorStop(0,'#8B6914'); g.addColorStop(1,'#4a3206'); break;
    case 'stone':
      g.addColorStop(0,'#5a5a6e'); g.addColorStop(1,'#2a2a3a'); break;
    case 'cloud':
      g.addColorStop(0,'rgba(180,200,255,0.25)'); g.addColorStop(1,'rgba(100,120,200,0.1)'); break;
    case 'crate':
      g.addColorStop(0,'#a07030'); g.addColorStop(1,'#5a3810'); break;
    default:
      g.addColorStop(0,'#555'); g.addColorStop(1,'#222');
  }
  platCache.set(key, g);
  return g;
}

function drawPlatforms(){
  platforms.forEach((p,i)=>{
    const inView = p.x+p.w > camX-10 && p.x < camX+canvas.width+10;
    if(!inView) return;
    const g = getPlatGrad(p.type||'wood', p.y, p.h);
    ctx.fillStyle = g;
    if(p.type==='cloud'){
      ctx.beginPath();
      roundRect(ctx, p.x, p.y, p.w, p.h, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,180,255,0.35)';
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    } else if(p.type==='crate'){
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeStyle = '#3a2008';
      ctx.lineWidth   = 1.5;
      ctx.strokeRect(p.x+1, p.y+1, p.w-2, p.h-2);
      // Cross
      ctx.beginPath();
      ctx.moveTo(p.x+p.w/2, p.y); ctx.lineTo(p.x+p.w/2, p.y+p.h);
      ctx.moveTo(p.x, p.y+p.h/2); ctx.lineTo(p.x+p.w, p.y+p.h/2);
      ctx.strokeStyle='rgba(0,0,0,.3)'; ctx.lineWidth=1;
      ctx.stroke();
    } else {
      ctx.fillRect(p.x, p.y, p.w, p.h);
      if(i===0){
        // Ground grass
        ctx.fillStyle='#4caf50';
        ctx.fillRect(p.x, p.y, p.w, 6);
        // Grass blades
        ctx.fillStyle='#66bb6a';
        for(let gx=p.x+8; gx<p.x+p.w; gx+=16){
          ctx.fillRect(gx, p.y-3, 2, 4);
          ctx.fillRect(gx+6, p.y-2, 2, 3);
        }
      } else {
        // Platform top highlight
        ctx.fillStyle='rgba(255,255,255,.1)';
        ctx.fillRect(p.x, p.y, p.w, 3);
        // Bottom shadow
        ctx.fillStyle='rgba(0,0,0,.4)';
        ctx.fillRect(p.x, p.y+p.h-3, p.w, 3);
        // Edge detail
        if(p.type==='stone'){
          ctx.strokeStyle='rgba(80,80,100,.6)';
          ctx.lineWidth=1;
          for(let bx=p.x; bx<p.x+p.w; bx+=20){
            ctx.beginPath(); ctx.moveTo(bx, p.y); ctx.lineTo(bx, p.y+p.h); ctx.stroke();
          }
        }
      }
    }
  });
}

// ──────────── Pickups ────────────
let pkTime=0;
function drawPickups(){
  pkTime += 0.04;
  pickups.forEach(pk=>{
    if(!pk.active) return;
    if(pk.x+20 < camX || pk.x-20 > camX+canvas.width) return;
    const bob = Math.sin(pkTime*2 + pk.id*0.7)*4;
    const gx  = pk.x, gy = pk.y+bob;

    // Glow
    const typeCol = pk.type==='health'?'#ff1744':pk.type==='shield'?'#00e5ff':pk.type==='speed'?'#ffea00':'#ff9800';
    const glow = ctx.createRadialGradient(gx,gy,0,gx,gy,22);
    glow.addColorStop(0, hexAlpha(typeCol, 0.35));
    glow.addColorStop(1, hexAlpha(typeCol, 0));
    ctx.fillStyle=glow;
    ctx.beginPath(); ctx.arc(gx,gy,22,0,Math.PI*2); ctx.fill();

    // Icon
    ctx.save();
    ctx.translate(gx,gy);
    ctx.scale(1+Math.sin(pkTime*3+pk.id)*.04, 1+Math.sin(pkTime*3+pk.id)*.04);
    ctx.font='20px serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    const icons={health:'❤️',shield:'🛡️',speed:'⚡',ammo:'🏹'};
    ctx.fillText(icons[pk.type]||'?', 0, 0);
    ctx.restore();
  });
}

// ──────────── Projectiles ────────────
function drawProjectiles(){
  Object.values(projectiles).forEach(p=>{
    if(p.x < camX-20 || p.x > camX+canvas.width+20) return;
    ctx.save();
    ctx.translate(p.x, p.y);

    if(p.type==='arrow'){
      const angle = Math.atan2(p.vy, p.vx);
      ctx.rotate(angle);
      // Shaft
      ctx.strokeStyle='#8B6914'; ctx.lineWidth=2.5;
      ctx.beginPath(); ctx.moveTo(-14,0); ctx.lineTo(10,0); ctx.stroke();
      // Head
      ctx.fillStyle='#c0c0c0';
      ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(4,-3); ctx.lineTo(4,3); ctx.closePath(); ctx.fill();
      // Feathers
      ctx.fillStyle='#fff';
      ctx.beginPath(); ctx.moveTo(-14,0); ctx.lineTo(-10,-4); ctx.lineTo(-8,0); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-14,0); ctx.lineTo(-10,4); ctx.lineTo(-8,0); ctx.closePath(); ctx.fill();
    } else if(p.type==='bomb'){
      // Bomb
      ctx.fillStyle='#222';
      ctx.beginPath(); ctx.arc(0,0,7,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#444';
      ctx.beginPath(); ctx.arc(-2,-2,3,0,Math.PI*2); ctx.fill();
      // Fuse spark
      const spark = (Date.now()%400)/400;
      ctx.fillStyle=`rgba(255,${Math.floor(200*spark)},0,${0.8+spark*0.2})`;
      ctx.beginPath(); ctx.arc(0,-7-spark*3, 2+spark, 0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  });
}

// ──────────── Players ────────────
function drawPlayers(){
  const sorted = Object.values(players).sort((a,b)=>{
    if(a.id===myId) return 1;
    if(b.id===myId) return -1;
    return 0;
  });
  sorted.forEach(p=>{
    if(p.x+PLAYER_W < camX-10 || p.x > camX+canvas.width+10) return;
    if(!p.alive){ drawDeadPlayer(p); return; }
    drawPlayer(p);
  });
}

function drawPlayer(p){
  const app   = appMap[p.id]?.appearance || { skin:'#FFDBB4',hair:'#1a0a00',shirt:'#E53935',pants:'#1565c0',belt:'#3e2723',shoe:'#212121' };
  const isMe  = p.id === myId;
  const t     = (Date.now()/1000);

  ctx.save();
  ctx.translate(p.x + PLAYER_W/2, p.y);
  ctx.scale(p.facing||1, 1);

  const isRun  = p.anim==='run';
  const isJump = p.anim==='jump';
  const isFall = p.anim==='fall';
  const isAtk  = p.anim==='attack';
  const isDash = p.anim==='dash';
  const isDead = !p.alive;

  const runF   = isRun ? Math.sin(t*10)*1 : 0;       // run phase
  const bodyBob= isRun ? Math.abs(Math.sin(t*10))*.015 : 0; // subtle
  const legAng = isRun ? Math.sin(t*10)*28 : 0;
  const armAng = isRun ? Math.sin(t*10+Math.PI)*20 : (isAtk?40:(isJump?-15:5));
  const lean   = isRun ? Math.sin(t*10)*.04 : (isDash?.2:0);

  ctx.rotate(lean);

  // ── Shadow ──
  ctx.fillStyle='rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(0, PLAYER_H+2, 13, 4, 0, 0, Math.PI*2); ctx.fill();

  // ── Legs ──
  drawLimb(ctx, -7, PLAYER_H*.56, 8, 22, app.pants, legAng);
  drawLimb(ctx,  7, PLAYER_H*.56, 8, 22, app.pants,-legAng);

  // Shoes
  ctx.fillStyle=app.shoe||'#212121';
  ctx.fillRect(-15, PLAYER_H-9, 15, 8);
  ctx.fillRect(  1, PLAYER_H-9, 15, 8);

  // ── Torso ──
  const torsoY = PLAYER_H*.28;
  const torsoH = PLAYER_H*.35;
  ctx.fillStyle=app.shirt;
  roundRect(ctx,-12,torsoY,24,torsoH,3); ctx.fill();

  // Torso detail (vertical line)
  ctx.strokeStyle='rgba(0,0,0,.2)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(0,torsoY+3); ctx.lineTo(0,torsoY+torsoH-4); ctx.stroke();

  // Belt
  ctx.fillStyle=app.belt||'#3e2723';
  ctx.fillRect(-12, torsoY+torsoH-7, 24, 6);

  // ── Arms ──
  drawLimb(ctx,-10, torsoY+2, 7, 20, app.skin, armAng);   // back
  drawLimb(ctx, 10, torsoY+2, 7, 20, app.skin,-armAng+5); // front with sword

  // Sword in front hand
  ctx.save();
  ctx.translate(10, torsoY+2);
  ctx.rotate((-armAng+5)*Math.PI/180);
  // Handle
  ctx.fillStyle='#795548';
  ctx.fillRect(-2, 18, 5, 8);
  // Guard
  ctx.fillStyle='#9e9e9e';
  ctx.fillRect(-5, 16, 11, 4);
  // Blade
  const bladeG = ctx.createLinearGradient(-1,0,3,0);
  bladeG.addColorStop(0,'#e0e0e0'); bladeG.addColorStop(1,'#9e9e9e');
  ctx.fillStyle=bladeG;
  ctx.beginPath();
  ctx.moveTo(-1,16); ctx.lineTo(3,16); ctx.lineTo(2,-6); ctx.lineTo(1,-8); ctx.lineTo(0,-6); ctx.closePath();
  ctx.fill();
  // Shine
  ctx.fillStyle='rgba(255,255,255,.5)';
  ctx.fillRect(0, 0, 1, 12);
  ctx.restore();

  // ── Head ──
  const headY = torsoY-26;
  // Neck
  ctx.fillStyle=app.skin;
  ctx.fillRect(-4, torsoY-8, 8, 10);

  // Head base
  ctx.fillStyle=app.skin;
  roundRect(ctx,-12,headY,24,24,5); ctx.fill();

  // Ear
  ctx.fillStyle=app.skin;
  ctx.fillRect(10,headY+8,3,6);

  // Eyes
  const eyeY = headY+8;
  // White
  ctx.fillStyle='#fff';
  roundRect(ctx,-8,eyeY,6,7,2); ctx.fill();
  roundRect(ctx, 2,eyeY,6,7,2); ctx.fill();
  // Iris
  ctx.fillStyle='#1a1a2e';
  ctx.fillRect(-6, eyeY+1, 3, 5);
  ctx.fillRect( 4, eyeY+1, 3, 5);
  // Highlight
  ctx.fillStyle='#fff';
  ctx.fillRect(-5, eyeY+1, 1, 2);
  ctx.fillRect( 5, eyeY+1, 1, 2);

  // Eyebrows
  ctx.fillStyle=app.hair;
  ctx.fillRect(-9,headY+5,7,2);
  ctx.fillRect( 2,headY+5,7,2);

  // Nose
  ctx.fillStyle='rgba(0,0,0,.15)';
  ctx.fillRect(1,headY+13,2,3);

  // Mouth
  ctx.strokeStyle='rgba(80,30,0,.6)'; ctx.lineWidth=1.5;
  ctx.beginPath();
  if(isAtk){ ctx.arc(0,headY+19,4,0.1,Math.PI-.1); }
  else      { ctx.arc(0,headY+20,3,Math.PI+.3,-.3); }
  ctx.stroke();

  // Hair
  ctx.fillStyle=app.hair;
  roundRect(ctx,-12,headY,24,9,[5,5,0,0]); ctx.fill();
  // Side hair
  ctx.fillRect(-13,headY+2,3,8);

  // Helmet glow for me
  if(isMe){
    ctx.strokeStyle='rgba(0,229,255,.4)';
    ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(0,headY+12,14,0,Math.PI*2); ctx.stroke();
  }

  // Shield aura
  if(p.shield>0){
    const sa = p.shield/MAX_SHIELD;
    ctx.strokeStyle=`rgba(0,229,255,${sa*.5})`;
    ctx.lineWidth=2+sa*2;
    ctx.beginPath(); ctx.arc(0,PLAYER_H/2,PLAYER_W/2+6,0,Math.PI*2); ctx.stroke();
  }

  // Dash trail
  if(isDash){
    ctx.fillStyle='rgba(150,50,255,.3)';
    ctx.fillRect(-15,0,30,PLAYER_H);
  }

  ctx.restore(); // unscale facing

  // ── Name tag & HP bar ──
  drawNameTag(p, isMe);
}

function drawLimb(ctx, ox, oy, w, h, color, angleDeg){
  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(angleDeg*Math.PI/180);
  ctx.fillStyle=color;
  roundRect(ctx,-w/2,0,w,h,3); ctx.fill();
  // Highlight
  ctx.fillStyle='rgba(255,255,255,.12)';
  ctx.fillRect(-w/2,0,w/2,h*.6);
  ctx.restore();
}

function drawNameTag(p, isMe){
  const cx   = p.x + PLAYER_W/2;
  const ty   = p.y - 30;
  const name = appMap[p.id]?.name || '?';
  const hpPct= clamp(p.hp/MAX_HP,0,1);

  // HP bar background
  ctx.fillStyle='rgba(0,0,0,.55)';
  roundRect(ctx, cx-22, ty-8, 44, 6, 3); ctx.fill();

  // HP bar fill
  const hc = hpPct>.6?'#00e676':hpPct>.3?'#ffea00':'#ff1744';
  ctx.fillStyle=hc;
  roundRect(ctx, cx-22, ty-8, 44*hpPct, 6, 3); ctx.fill();

  // Shield bar (above HP if exists)
  if(p.shield>0){
    const sp = p.shield/MAX_SHIELD;
    ctx.fillStyle='rgba(0,0,0,.4)';
    roundRect(ctx, cx-22, ty-16, 44, 4, 2); ctx.fill();
    ctx.fillStyle='#00e5ff';
    roundRect(ctx, cx-22, ty-16, 44*sp, 4, 2); ctx.fill();
  }

  // Name
  ctx.save();
  ctx.font = isMe ? 'bold 10px -apple-system,sans-serif' : '9px -apple-system,sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='bottom';
  ctx.fillStyle = isMe ? '#00e5ff' : '#ddd';
  ctx.shadowColor='rgba(0,0,0,.9)'; ctx.shadowBlur=5;
  ctx.fillText(name, cx, ty-18);
  ctx.shadowBlur=0;
  ctx.restore();
}

function drawDeadPlayer(p){
  const cx = p.x+PLAYER_W/2, cy = p.y+PLAYER_H*.6;
  ctx.save();
  ctx.globalAlpha=.35;
  ctx.translate(cx,cy);
  ctx.rotate(Math.PI/2);
  const app = appMap[p.id]?.appearance || {};
  ctx.fillStyle=app.shirt||'#555';
  ctx.fillRect(-PLAYER_W/2,-PLAYER_H/5,PLAYER_W,PLAYER_H*.4);
  ctx.globalAlpha=.7;
  ctx.font='18px serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('💀',0,0);
  ctx.restore();
}

// ──────────── Particles ────────────
function spawnParticles(x, y, color, count){
  for(let i=0;i<count;i++){
    const angle = Math.random()*Math.PI*2;
    const speed = 1+Math.random()*4;
    particles.push({
      x, y,
      vx: Math.cos(angle)*speed,
      vy: Math.sin(angle)*speed-2,
      life: 0.6+Math.random()*.4,
      maxLife: 1,
      r: 2+Math.random()*3,
      color,
      gravity: 0.15
    });
  }
}

function spawnMeleeEffect(x, y, facing){
  for(let i=0;i<8;i++){
    particles.push({
      x: x+(facing>0?20:-20),
      y: y+15,
      vx: (facing>0?1:-1)*(3+Math.random()*5),
      vy: (Math.random()-.5)*4-1,
      life:0.4, maxLife:0.4,
      r: 4+Math.random()*4,
      color:'#ffca28', gravity:0.1
    });
  }
}

function spawnExplosion(x, y, radius){
  const count = 30;
  for(let i=0;i<count;i++){
    const angle = (i/count)*Math.PI*2;
    const speed = 2+Math.random()*6;
    const colors=['#ff6d00','#ffea00','#ff1744','#fff'];
    particles.push({
      x, y,
      vx: Math.cos(angle)*speed,
      vy: Math.sin(angle)*speed-2,
      life:0.8+Math.random()*.5, maxLife:1.3,
      r: 3+Math.random()*6,
      color: colors[Math.floor(Math.random()*colors.length)],
      gravity:0.2
    });
  }
  // Shockwave ring (special)
  particles.push({ x,y,vx:0,vy:0, life:.4,maxLife:.4, r:radius, color:'rgba(255,200,100,0.4)', type:'ring', gravity:0 });
}

function updateParticles(dt){
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    p.x    += p.vx*dt;
    p.y    += p.vy*dt;
    p.vy   += p.gravity*dt;
    p.life -= dt*0.06;
    if(p.life<=0) { particles.splice(i,1); continue; }
    p.vx   *= 0.96;
    p.vy   *= 0.97;
  }
}

function drawParticles(){
  particles.forEach(p=>{
    const alpha = clamp(p.life/p.maxLife,0,1);
    ctx.save();
    ctx.globalAlpha=alpha;
    if(p.type==='ring'){
      ctx.strokeStyle=p.color;
      ctx.lineWidth=3;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*(1-alpha)*2+5,0,Math.PI*2); ctx.stroke();
    } else {
      ctx.fillStyle=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();
  });
}

// ──────────── Minimap ────────────
function drawMinimap(){
  const mW=mmCanvas.width, mH=mmCanvas.height;
  mmCtx.clearRect(0,0,mW,mH);

  // Background
  mmCtx.fillStyle='rgba(5,5,20,.75)';
  mmCtx.fillRect(0,0,mW,mH);

  const sx=mW/worldW, sy=mH/worldH;

  // Ground
  mmCtx.fillStyle='#2d5a27';
  mmCtx.fillRect(0,mH-4,mW,4);

  // Platforms
  platforms.forEach((p,i)=>{
    if(i===0) return;
    if(p.type==='cloud') mmCtx.fillStyle='rgba(150,160,255,.4)';
    else if(p.type==='stone') mmCtx.fillStyle='#5a5a6e';
    else mmCtx.fillStyle='#8B6914';
    mmCtx.fillRect(p.x*sx, p.y*sy, Math.max(p.w*sx,2), 2);
  });

  // Pickups
  pickups.forEach(pk=>{
    if(!pk.active) return;
    const col={health:'#ff1744',shield:'#00e5ff',speed:'#ffea00',ammo:'#ff9800'}[pk.type]||'#fff';
    mmCtx.fillStyle=col;
    mmCtx.fillRect(pk.x*sx-1,pk.y*sy-1,3,3);
  });

  // Players
  Object.values(players).forEach(p=>{
    if(!p.alive) return;
    mmCtx.fillStyle = p.id===myId ? '#00e5ff' : '#ff5722';
    const mx=p.x*sx, my=p.y*sy;
    mmCtx.beginPath(); mmCtx.arc(mx,my,p.id===myId?2.5:2,0,Math.PI*2); mmCtx.fill();
    if(p.id===myId){
      mmCtx.strokeStyle='rgba(0,229,255,.6)';
      mmCtx.lineWidth=1;
      mmCtx.beginPath(); mmCtx.arc(mx,my,4,0,Math.PI*2); mmCtx.stroke();
    }
  });

  // Camera viewport
  mmCtx.strokeStyle='rgba(255,255,255,.2)';
  mmCtx.lineWidth=0.5;
  mmCtx.strokeRect(camX*sx, camY*sy, canvas.width*sx, canvas.height*sy);

  // Border
  mmCtx.strokeStyle='rgba(255,255,255,.25)';
  mmCtx.lineWidth=1;
  mmCtx.strokeRect(0,0,mW,mH);
}

// ═══════════════════════════════════════════════════════════════
// HUD UPDATES
// ═══════════════════════════════════════════════════════════════
function updateHUD(p){
  const me = p || players[myId];
  if(!me) return;
  const hpPct = clamp((me.hp||0)/MAX_HP*100,0,100);
  const shPct = clamp((me.shield||0)/MAX_SHIELD*100,0,100);
  document.getElementById('hpFill').style.width  = hpPct+'%';
  document.getElementById('shFill').style.width  = shPct+'%';
  document.getElementById('hpVal').textContent   = Math.max(0,Math.round(me.hp||0));
  document.getElementById('shVal').textContent   = Math.max(0,Math.round(me.shield||0));
  document.getElementById('hudKills').textContent  = me.kills||0;
  document.getElementById('hudDeaths').textContent = me.deaths||0;
  if(me.arrows!==undefined) document.getElementById('hudArrows').textContent = me.arrows;
  updateHUDCount();
}

function updateHUDCount(){
  const n = Object.keys(players).length;
  document.getElementById('hudPlayerCount').textContent = `${n} oyuncu`;
}

// ─── Kill feed ───
function addKillFeed(killerName, victimName, reason){
  const el = document.createElement('div');
  el.className = `kf-entry ${reason||''}`;
  const icons = { melee:'⚔️', arrow:'🏹', bomb:'💣', fall:'💨' };
  const icon = icons[reason]||'💀';
  if(killerName) el.textContent = `${icon} ${killerName} → ${victimName}`;
  else           el.textContent = `${icon} ${victimName} düştü!`;
  document.getElementById('killFeed').appendChild(el);
  setTimeout(()=>el.remove(), 3200);
}

// ─── Damage popup ───
function showDmgPopup(p, yOff){
  if(!p) return;
  const sx = p.x+PLAYER_W/2 - camX;
  const sy = p.y+(yOff||0) - camY;
  if(sx<0||sx>canvas.width||sy<0||sy>canvas.height) return;
  const el = document.createElement('div');
  el.className='dmg-popup';
  el.textContent='-HP';
  el.style.cssText=`left:${sx}px;top:${sy}px`;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 850);
}

// ─── Respawn timer ───
function startRespawnTimer(ms){
  document.getElementById('respawnScreen').classList.remove('hidden');
  let remaining = Math.ceil(ms/1000);
  document.getElementById('respawnTimer').textContent=remaining;
  respawnInterval = setInterval(()=>{
    remaining--;
    document.getElementById('respawnTimer').textContent=Math.max(0,remaining);
    if(remaining<=0) endRespawnTimer();
  },1000);
}
function endRespawnTimer(){
  clearInterval(respawnInterval);
  document.getElementById('respawnScreen').classList.add('hidden');
}

// ─── Chat ───
function appendChat(name, text, type='normal'){
  const el  = document.createElement('div');
  el.className=`chat-msg ${type}`;
  if(type==='sys') el.textContent=text;
  else el.innerHTML=`<span class="cn">${esc(name)}</span>: ${esc(text)}`;
  const box=document.getElementById('chatMessages');
  box.appendChild(el);
  if(box.children.length>25) box.firstChild.remove();
  box.scrollTop=box.scrollHeight;
}

// ─── Scoreboard ───
function renderScoreboard(){
  const sorted = Object.values(players)
    .map(p=>({ ...p, name:appMap[p.id]?.name||'?' }))
    .sort((a,b)=>(b.kills-b.deaths)-(a.kills-a.deaths));
  const container = document.getElementById('scoreBoardList');
  container.innerHTML = sorted.map((p,i)=>{
    const rankClass=i===0?'top1':i===1?'top2':i===2?'top3':'';
    const rankIcon=i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`;
    const isMe = p.id===myId;
    const app  = appMap[p.id]?.appearance||{};
    return `<div class="sc-row ${isMe?'me':''}">
      <span class="sc-rank ${rankClass}">${rankIcon}</span>
      <span class="sc-name" style="color:${app.shirt||'#eee'}">${esc(p.name)}${isMe?' ★':''}</span>
      <span class="sc-kd">⚔️${p.kills||0} 💀${p.deaths||0}</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// ROOM LIST UI
// ═══════════════════════════════════════════════════════════════
function renderRoomList(list){
  const container = document.getElementById('roomList');
  if(!list||list.length===0){
    container.innerHTML='<div class="empty-rooms">Henüz oda yok — ilk odayı sen oluştur!</div>';
    return;
  }
  container.innerHTML = list.map(r=>{
    const pct = (r.playerCount/r.maxPlayers)*100;
    const fill= pct<50?'var(--green)':pct<80?'var(--yellow)':'var(--red)';
    const icon= r.isPublic?'🌍':(r.hasPassword?'🔒':'🏠');
    const lock= r.hasPassword?'<span class="room-pill locked">🔐 Şifreli</span>':'<span class="room-pill open">🔓 Açık</span>';
    return `<div class="room-card" data-id="${esc(r.id)}" data-locked="${r.hasPassword}" data-name="${esc(r.name)}">
      <div class="room-icon">${icon}</div>
      <div class="room-info">
        <div class="room-name">${esc(r.name)}</div>
        <div class="room-meta">${r.playerCount}/${r.maxPlayers} oyuncu</div>
      </div>
      <div class="room-right">
        ${lock}
        <div class="room-bar"><div class="room-bar-fill" style="width:${pct}%;background:${fill}"></div></div>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.room-card').forEach(card=>{
    card.addEventListener('click',()=>{
      const id     = card.dataset.id;
      const locked = card.dataset.locked==='true';
      const name   = card.dataset.name;
      if(id==='public'){ socket.emit('joinPublic'); return; }
      if(locked){
        pendingRoomId   = id;
        pendingRoomName = name;
        document.getElementById('modalPassRoomName').textContent=`"${name}" odası için şifre gerekli`;
        document.getElementById('fJoinPass').value='';
        document.getElementById('modalPassword').classList.remove('hidden');
      } else {
        socket.emit('joinRoom',{roomId:id,password:''});
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// CHARACTER PREVIEWS
// ═══════════════════════════════════════════════════════════════
function buildCharacterPreviews(){
  const row = document.getElementById('charRow');
  row.innerHTML='';
  APPEARANCES_CLIENT.forEach((app,i)=>{
    const wrap = document.createElement('div');
    wrap.className=`char-thumb ${i===selectedCharIdx?'selected':''}`;
    const cvs = document.createElement('canvas');
    cvs.width=56; cvs.height=72;
    drawCharThumb(cvs.getContext('2d'), app, 56, 72);
    wrap.appendChild(cvs);
    const lbl = document.createElement('div');
    lbl.style.cssText='font-size:.55rem;text-align:center;margin-top:.1rem;color:var(--muted2);padding:.1rem;word-break:break-all';
    lbl.textContent=(app.name||'').split(' ')[0];
    wrap.appendChild(lbl);
    wrap.addEventListener('click',()=>{
      selectedCharIdx=i;
      myAppearance=app;
      row.querySelectorAll('.char-thumb').forEach(e=>e.classList.remove('selected'));
      wrap.classList.add('selected');
    });
    row.appendChild(wrap);
  });
}

function drawCharThumb(c, app, W, H){
  c.clearRect(0,0,W,H);
  // Simple front-facing character thumbnail
  const cx=W/2, by=H-6;
  // Shadow
  c.fillStyle='rgba(0,0,0,.3)';
  c.beginPath(); c.ellipse(cx,by,10,3,0,0,Math.PI*2); c.fill();
  // Legs
  c.fillStyle=app.pants||'#1565c0';
  c.fillRect(cx-9,by-20,8,18); c.fillRect(cx+1,by-20,8,18);
  // Shoes
  c.fillStyle=app.shoe||'#212121';
  c.fillRect(cx-10,by-7,10,7); c.fillRect(cx+1,by-7,10,7);
  // Body
  c.fillStyle=app.shirt||'#e53935';
  roundRect(c,cx-11,by-40,22,22,3); c.fill();
  // Belt
  c.fillStyle=app.belt||'#3e2723'; c.fillRect(cx-11,by-22,22,5);
  // Arms
  c.fillStyle=app.skin||'#FFDBB4';
  c.fillRect(cx-16,by-38,6,16); c.fillRect(cx+10,by-38,6,16);
  // Neck
  c.fillStyle=app.skin||'#FFDBB4'; c.fillRect(cx-4,by-44,8,6);
  // Head
  c.fillStyle=app.skin||'#FFDBB4';
  roundRect(c,cx-11,by-62,22,20,5); c.fill();
  // Eyes
  c.fillStyle='#fff'; c.fillRect(cx-8,by-57,4,5); c.fillRect(cx+4,by-57,4,5);
  c.fillStyle='#222'; c.fillRect(cx-7,by-56,2,3); c.fillRect(cx+5,by-56,2,3);
  // Mouth
  c.strokeStyle='rgba(80,30,0,.6)'; c.lineWidth=1.2;
  c.beginPath(); c.arc(cx,by-47,3,Math.PI+.4,-.4); c.stroke();
  // Hair
  c.fillStyle=app.hair||'#1a0a00';
  roundRect(c,cx-11,by-62,22,8,[5,5,0,0]); c.fill();
}

// ═══════════════════════════════════════════════════════════════
// LEAVE ROOM
// ═══════════════════════════════════════════════════════════════
function leaveRoom(){
  if(!confirm('Odadan çıkmak istiyor musun?')) return;
  socket.emit('leaveRoom');
  cancelAnimationFrame(raf); raf=0;
  players={}; appMap={}; pickups=[]; projectiles=[]; particles=[];
  setScreen('Lobby');
  socket.emit('getRooms');
}

// ═══════════════════════════════════════════════════════════════
// UI SETUP
// ═══════════════════════════════════════════════════════════════
function setupUI(){
  // Lobby buttons
  document.getElementById('btnJoinPublic').addEventListener('click',()=> socket.emit('joinPublic'));
  document.getElementById('btnQuickJoin').addEventListener('click', ()=> socket.emit('quickJoin'));
  document.getElementById('btnRefresh').addEventListener('click',   ()=> socket.emit('getRooms'));

  document.getElementById('btnCreateRoom').addEventListener('click',()=>{
    document.getElementById('fRoomName').value='';
    document.getElementById('fRoomPass').value='';
    document.getElementById('modalCreateRoom').classList.remove('hidden');
  });
  document.getElementById('btnConfirmCreate').addEventListener('click',()=>{
    const name = document.getElementById('fRoomName').value.trim()||`${myName}'ın Odası`;
    const pass = document.getElementById('fRoomPass').value.trim();
    socket.emit('createRoom',{name,password:pass});
  });
  document.getElementById('btnCancelCreate').addEventListener('click',()=>
    document.getElementById('modalCreateRoom').classList.add('hidden'));

  document.getElementById('btnConfirmPass').addEventListener('click',()=>{
    if(!pendingRoomId) return;
    socket.emit('joinRoom',{roomId:pendingRoomId,password:document.getElementById('fJoinPass').value});
  });
  document.getElementById('btnCancelPass').addEventListener('click',()=>{
    document.getElementById('modalPassword').classList.add('hidden');
    pendingRoomId=null;
  });
  document.getElementById('fJoinPass').addEventListener('keydown',e=>{
    if(e.key==='Enter') document.getElementById('btnConfirmPass').click();
  });
  document.getElementById('fRoomName').addEventListener('keydown',e=>{
    if(e.key==='Enter') document.getElementById('btnConfirmCreate').click();
  });

  // Chat
  document.getElementById('chatSendBtn').addEventListener('click', doSendChat);
  document.getElementById('chatInput').addEventListener('keydown',e=>{
    if(e.key==='Enter'){ doSendChat(); e.preventDefault(); }
    e.stopPropagation();
  });
  document.getElementById('chatInput').addEventListener('keyup',  e=> e.stopPropagation());
  document.getElementById('chatInput').addEventListener('touchstart',e=> e.stopPropagation());

  // Scoreboard mobile
  document.getElementById('abtScore').addEventListener('click',()=>{
    scoreVisible=!scoreVisible;
    const sb=document.getElementById('scoreBoard');
    sb.style.display=scoreVisible?'block':'none';
    if(scoreVisible) renderScoreboard();
  });

  // Keyboard scoreboard
  document.addEventListener('keydown',e=>{
    if(e.key==='Tab'){ e.preventDefault();
      scoreVisible=!scoreVisible;
      document.getElementById('scoreBoard').style.display=scoreVisible?'block':'none';
      if(scoreVisible) renderScoreboard();
    }
  });

  // 2-finger tap for scoreboard on canvas
  let taps=0;
  canvas.addEventListener('touchstart',e=>{
    if(e.touches.length===2){
      e.preventDefault(); taps++;
      setTimeout(()=>taps=0,400);
      scoreVisible=!scoreVisible;
      document.getElementById('scoreBoard').style.display=scoreVisible?'block':'none';
      if(scoreVisible) renderScoreboard();
    }
  },{passive:false});
}

// ═══════════════════════════════════════════════════════════════
// CONTROLS
// ═══════════════════════════════════════════════════════════════
function setupControls(){
  // ── Keyboard ──
  const keyMap = {
    'ArrowLeft':'left','KeyA':'left',
    'ArrowRight':'right','KeyD':'right',
  };
  document.addEventListener('keydown',e=>{
    if(keyMap[e.code]) inp[keyMap[e.code]]=true;
    if(e.code==='ArrowUp'||e.code==='KeyW'||e.code==='Space'){ e.preventDefault(); jumpQueued=true; }
    if(e.code==='KeyZ'||e.code==='KeyJ') attackQueued=true;
    if(e.code==='KeyX'||e.code==='KeyK') shootQueued=true;
    if(e.code==='KeyC'||e.code==='KeyB') bombQueued=true;
    if(e.code==='ShiftLeft'||e.code==='ShiftRight') dashQueued=true;
  });
  document.addEventListener('keyup',e=>{
    if(keyMap[e.code]) inp[keyMap[e.code]]=false;
    if(e.code==='ArrowUp'||e.code==='KeyW'||e.code==='Space') inp.jump=false;
  });

  // ── Mobile D-Pad ──
  bindHold('cbtLeft',  ()=>{ inp.left=true;  },()=>{ inp.left=false;  });
  bindHold('cbtRight', ()=>{ inp.right=true; },()=>{ inp.right=false; });

  // ── Action buttons ──
  bindTap('abtJump',  ()=>{ jumpQueued=true;   },()=>{});
  bindTap('abtAtk',   ()=>{ attackQueued=true; },()=>{});
  bindTap('abtShoot', ()=>{ shootQueued=true;  },()=>{});
  bindTap('abtBomb',  ()=>{ bombQueued=true;   },()=>{});
  bindTap('abtDash',  ()=>{ dashQueued=true;   },()=>{});

  // Cooldown visual feedback
  // We track client-side visuals for responsiveness
  document.getElementById('abtAtk').addEventListener('pointerdown',()=>   startCDVisual('abtAtk',   550));
  document.getElementById('abtShoot').addEventListener('pointerdown',()=> startCDVisual('abtShoot', 900));
  document.getElementById('abtBomb').addEventListener('pointerdown',()=>  startCDVisual('abtBomb',  4000));
  document.getElementById('abtDash').addEventListener('pointerdown',()=>  startCDVisual('abtDash',  1200));
}

function bindHold(id, onDown, onUp){
  const el=document.getElementById(id);
  if(!el) return;
  const down=()=>{ onDown(); el.classList.add('pressed'); };
  const up=()=>{ onUp(); el.classList.remove('pressed'); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup',   up);
  el.addEventListener('pointerleave',up);
  el.addEventListener('touchstart',  e=>{e.preventDefault();down();},{passive:false});
  el.addEventListener('touchend',    e=>{e.preventDefault();up();},{passive:false});
}

function bindTap(id, onDown, onUp){
  const el=document.getElementById(id);
  if(!el) return;
  el.addEventListener('pointerdown',  e=>{ e.preventDefault(); onDown(); el.classList.add('pressed'); });
  el.addEventListener('pointerup',    e=>{ e.preventDefault(); onUp();   el.classList.remove('pressed'); });
  el.addEventListener('pointerleave', ()=> el.classList.remove('pressed'));
}

function startCDVisual(id, ms){
  const el=document.getElementById(id);
  if(!el) return;
  el.classList.add('on-cooldown');
  setTimeout(()=>el.classList.remove('on-cooldown'), ms);
}

function doSendChat(){
  const input=document.getElementById('chatInput');
  const txt=input.value.trim();
  if(!txt||!myRoomId) return;
  socket.emit('chat',txt);
  input.value='';
}

// ═══════════════════════════════════════════════════════════════
// CANVAS RESIZE
// ═══════════════════════════════════════════════════════════════
function resizeCanvas(){
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function hexAlpha(hex, alpha){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(ctx, x, y, w, h, r){
  if(typeof r === 'number') r=[r,r,r,r];
  const [tl,tr,br,bl] = Array.isArray(r)?[...r,...r].slice(0,4):[r,r,r,r];
  ctx.beginPath();
  ctx.moveTo(x+tl,y);
  ctx.lineTo(x+w-tr,y); ctx.arcTo(x+w,y,x+w,y+tr,tr);
  ctx.lineTo(x+w,y+h-br); ctx.arcTo(x+w,y+h,x+w-br,y+h,br);
  ctx.lineTo(x+bl,y+h); ctx.arcTo(x,y+h,x,y+h-bl,bl);
  ctx.lineTo(x,y+tl); ctx.arcTo(x,y,x+tl,y,tl);
  ctx.closePath();
}

/* ═══════════════════════════════════════════════════════════════
   BACKROOMS — Client Game Engine
   ═══════════════════════════════════════════════════════════════ */

'use strict';

window.GAME = (function(){

/* ─── Config ─────────────────────────────────────────────────── */
const TILE      = 80;
const PLR_R     = 18;
const PLR_SPD   = 3.6;
const PLR_SPRINT= 5.8;
const MON_R     = 26;
const FLASH_R   = 230;   // flashlight radius
const CAM_LERP  = 0.12;
const ANIM_FPS  = 7;
const JUMP_VY   = -11;
const GRAVITY   = 0.55;
const MAX_JUMP  = 34;

/* ─── State ──────────────────────────────────────────────────── */
let canvas, ctx, socket;
let running   = false;
let roomData  = null;
let players   = {};
let walls     = [];
let myId      = '';
let myName    = '';
let isMonster = false;

// Local player
const ME = {
  x:0,y:0,vx:0,vy:0,
  dir:'down',anim:'idle',
  hasKey:false, dead:false, escaped:false,
  jumpOff:0, jumpVY:0, grounded:true,
  animFrame:0, animTimer:0,
  stepTimer:0,
};

// Monster / AI
const MON = { x:0,y:0,phase:'roam',visTimer:0 };

// Key + Exit
let keyObj  = null;
let exitObj = null;
let monsterType = 'ai';
let monPlayerId = null;

// Camera
const CAM = { x:0,y:0 };

// Input
const KEYS   = {};
const JOY    = { active:false,id:null,sx:0,sy:0,dx:0,dy:0 };

// Particles
let parts = [];
// Messages
let msgs  = [];
// Screen effects
let flashRed   = 0;
let flashWhite = 0;
let dangerAmt  = 0;
let shakeX=0,shakeY=0,shakeT=0;

// Timers
let lastTime    = 0;
let fps         = 0;
let fpsCnt      = 0;
let fpsTimer    = 0;
let sendTimer   = 0;
let animTimer   = 0;

/* ─── Callbacks ──────────────────────────────────────────────── */
let onDied     = null;
let onEscaped  = null;
let onGameOver = null;
let onCaught   = null;

/* ─── Init ───────────────────────────────────────────────────── */
function init(cvs, sock, id, name, isMon){
  canvas    = cvs;
  ctx       = cvs.getContext('2d');
  socket    = sock;
  myId      = id;
  myName    = name;
  isMonster = isMon;
  running   = false;

  _initInput();
  _initSocket();
  resize();
  window.addEventListener('resize', resize);
}

function resize(){
  const isSide = window.innerWidth>=768 && window.innerWidth>window.innerHeight;
  canvas.width  = window.innerWidth  - (isSide ? 200 : 0);
  canvas.height = window.innerHeight;
}

function loadRoom(data){
  roomData    = data;
  walls       = data.walls;          // flat [x,y,x,y,...]
  keyObj      = {...data.key};
  exitObj     = {...data.exit};
  monsterType = data.monsterType;
  monPlayerId = data.monPlayerId;
  MON.x=data.mon.x; MON.y=data.mon.y;

  // Existing players
  players={};
  if(data.players){
    for(const[id,p] of Object.entries(data.players)){
      if(id!==myId) players[id]={...p};
    }
  }

  ME.x=data.spawn.x; ME.y=data.spawn.y;
  ME.dead=false; ME.escaped=false; ME.hasKey=false;
  ME.jumpOff=0; ME.grounded=true;
  CAM.x=ME.x-canvas.width/2;
  CAM.y=ME.y-canvas.height/2;

  running=true;
  requestAnimationFrame(_loop);
  showMsg('⚡ OYUN BAŞLADI! KAÇMAYA ÇALIŞ!','#ffcc44',3000);
}

/* ─── Socket Events ──────────────────────────────────────────── */
function _initSocket(){
  socket.on('S_STATE',d=>{
    // Update other players
    for(const[id,p] of Object.entries(d.ps)){
      if(id===myId) continue;
      if(!players[id]) players[id]={...p,animFrame:0,animTimer:0};
      else Object.assign(players[id],p);
    }
    for(const id of Object.keys(players))
      if(!d.ps[id]) delete players[id];

    MON.x=d.mon.x; MON.y=d.mon.y; MON.phase=d.mon.phase;
    if(d.key){keyObj.collected=d.key.c; keyObj.holder=d.key.h;}
  });

  socket.on('S_PJOIN',p=>{
    if(p.id===myId)return;
    players[p.id]={...p,animFrame:0,animTimer:0};
    showMsg(`${p.name} odaya girdi`,'#77ddff',2000);
  });

  socket.on('S_LEFT',({id})=>{
    if(players[id]){showMsg(`${players[id].n||players[id].name} ayrıldı`,'#ffaa55',2000);}
    delete players[id];
  });

  socket.on('S_KEY',({id,name})=>{
    if(id===myId){
      ME.hasKey=true;
      showMsg('🔑 ANAHTAR SENDE! ÇIKIŞA KOŞ!','#ffe044',4500);
      spawnParticles(ME.x,ME.y,'#ffe044',16);
      playSound('key');
    } else {
      showMsg(`🔑 ${name} anahtarı aldı!`,'#ffe044',2500);
    }
    if(keyObj) keyObj.collected=true;
  });

  socket.on('S_CAUGHT',({id,name})=>{
    if(id===myId){
      flashRed=1.2;
      screenShake(12,0.5);
      showMsg('💀 YAKALANDINN!!','#ff2244',6000);
      playSound('caught');
    } else {
      showMsg(`💀 ${name} yakalandı!`,'#ff6644',2500);
    }
    if(onCaught) onCaught(id);
    spawnParticles(id===myId?ME.x:(players[id]?.x||0), id===myId?ME.y:(players[id]?.y||0),'#ff2244',20);
  });

  socket.on('S_DIED',()=>{
    ME.dead=true;
    running=false;
    setTimeout(()=>{ if(onDied) onDied(); },1200);
  });

  socket.on('S_ESCAPED',({id,name})=>{
    if(id===myId){
      ME.escaped=true; ME.hasKey=false;
      flashWhite=1.0;
      showMsg('🏆 KURTULDUN!!!','#44ff99',8000);
      playSound('escape');
      setTimeout(()=>{ if(onEscaped) onEscaped(); },2000);
    } else {
      showMsg(`🏆 ${name} kaçtı!`,'#44ff99',3000);
    }
  });

  socket.on('S_GAMEOVER',({reason})=>{
    running=false;
    setTimeout(()=>{ if(onGameOver) onGameOver(reason); },1500);
  });

  socket.on('S_YOU_MONSTER',()=>{
    isMonster=true;
    showMsg('👹 SEN CANAVARSIN! Oyuncuları yakala!','#ff4422',4000);
    playSound('monster');
  });

  socket.on('S_ERROR',msg=>{
    showMsg('❌ '+msg,'#ff4444',3000);
  });
}

/* ─── Input ──────────────────────────────────────────────────── */
function _initInput(){
  document.addEventListener('keydown',e=>{
    KEYS[e.code]=true;
    if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    if(e.code==='Space') _tryJump();
  });
  document.addEventListener('keyup',e=>{ KEYS[e.code]=false; });

  canvas.addEventListener('touchstart',e=>{
    e.preventDefault();
    for(const t of e.changedTouches){
      const rx=t.clientX/canvas.clientWidth;
      const ry=t.clientY/canvas.clientHeight;
      if(rx<0.55&&!JOY.active){
        JOY.active=true;JOY.id=t.identifier;
        JOY.sx=t.clientX;JOY.sy=t.clientY;JOY.dx=0;JOY.dy=0;
      }
      if(rx>=0.55&&ry<0.7) _tryJump();
    }
  },{passive:false});

  canvas.addEventListener('touchmove',e=>{
    e.preventDefault();
    for(const t of e.changedTouches){
      if(t.identifier===JOY.id){
        JOY.dx=t.clientX-JOY.sx;
        JOY.dy=t.clientY-JOY.sy;
      }
    }
  },{passive:false});

  canvas.addEventListener('touchend',e=>{
    for(const t of e.changedTouches){
      if(t.identifier===JOY.id){
        JOY.active=false;JOY.dx=0;JOY.dy=0;
      }
    }
  });
}

function _tryJump(){
  if(ME.grounded&&!ME.dead&&!ME.escaped){
    ME.grounded=false; ME.jumpVY=JUMP_VY;
    playSound('jump');
  }
}

/* ─── Main Loop ──────────────────────────────────────────────── */
function _loop(ts){
  const dt=Math.min((ts-lastTime)/1000,0.05);
  lastTime=ts;
  fpsCnt++; fpsTimer+=dt;
  if(fpsTimer>=1){fps=fpsCnt;fpsCnt=0;fpsTimer=0;}

  if(running){
    _update(dt);
  }
  _render();
  requestAnimationFrame(_loop);
}

/* ─── Update ─────────────────────────────────────────────────── */
function _update(dt){
  if(ME.dead||ME.escaped) return;

  // ── Gather input ──
  let mx=0,my=0,sprint=false;
  if(KEYS['ArrowLeft']||KEYS['KeyA'])  mx-=1;
  if(KEYS['ArrowRight']||KEYS['KeyD']) mx+=1;
  if(KEYS['ArrowUp']||KEYS['KeyW'])    my-=1;
  if(KEYS['ArrowDown']||KEYS['KeyS'])  my+=1;
  if(KEYS['ShiftLeft']||KEYS['ShiftRight']) sprint=true;

  if(JOY.active){
    const jd=Math.hypot(JOY.dx,JOY.dy);
    if(jd>12){
      const js=Math.min(jd,60);
      mx=JOY.dx/js; my=JOY.dy/js;
      if(js>48) sprint=true;
    }
  }

  const len=Math.hypot(mx,my);
  if(len>1){mx/=len;my/=len;}

  const spd=sprint?PLR_SPRINT:PLR_SPD;
  const vx=mx*spd, vy=my*spd;

  // ── Wall collision (slide) ──
  let nx=ME.x+vx, ny=ME.y+vy;
  if(!_wallHit(nx,ME.y,PLR_R)) ME.x=nx;
  if(!_wallHit(ME.x,ny,PLR_R)) ME.y=ny;

  // ── Jump (visual bobbing) ──
  if(!ME.grounded){
    ME.jumpVY+=GRAVITY;
    ME.jumpOff+=ME.jumpVY;
    if(ME.jumpOff>=0){ME.jumpOff=0;ME.jumpVY=0;ME.grounded=true;}
    ME.jumpOff=Math.max(ME.jumpOff,-MAX_JUMP);
  }

  // ── Direction & anim ──
  if(len>0.1){
    if(Math.abs(mx)>Math.abs(my)) ME.dir=mx>0?'r':'l';
    else ME.dir=my>0?'d':'u';
    ME.anim=sprint?'run':'walk';
    ME.stepTimer+=dt;
    const si=sprint?0.22:0.38;
    if(ME.stepTimer>si){ME.stepTimer=0;playSound('step');}
  } else {
    ME.anim='idle';
  }

  ME.animTimer+=dt;
  if(ME.animTimer>1/ANIM_FPS){ME.animTimer=0;ME.animFrame=(ME.animFrame+1)%4;}

  // ── Send to server ──
  sendTimer+=dt;
  if(sendTimer>0.05){
    sendTimer=0;
    socket.emit('C_MOVE',{x:ME.x,y:ME.y,dir:ME.dir,anim:ME.anim});
  }

  // ── Camera ──
  const tx=ME.x-canvas.width/2;
  const ty=ME.y-canvas.height/2;
  CAM.x+=(tx-CAM.x)*CAM_LERP;
  CAM.y+=(ty-CAM.y)*CAM_LERP;

  // ── Danger proximity ──
  const dd=Math.hypot(ME.x-MON.x,ME.y-MON.y);
  dangerAmt=Math.max(0,1-dd/400);
  if(dangerAmt>0.7) MON.visTimer=Math.min(1,MON.visTimer+dt*3);
  else MON.visTimer=Math.max(0,MON.visTimer-dt*1.5);

  // ── Effects decay ──
  flashRed=Math.max(0,flashRed-dt*2);
  flashWhite=Math.max(0,flashWhite-dt*3);
  if(shakeT>0){
    shakeT-=dt;
    shakeX=(Math.random()-.5)*shakeT*20;
    shakeY=(Math.random()-.5)*shakeT*20;
  } else { shakeX=0;shakeY=0; }

  // ── Particles ──
  parts=parts.filter(p=>p.life>0);
  for(const p of parts){p.x+=p.vx;p.y+=p.vy;p.vy+=0.12;p.life-=dt;p.r=Math.max(0,p.r-dt*3);}

  // ── Other players anim ──
  for(const p of Object.values(players)){
    p.animTimer=(p.animTimer||0)+dt;
    if(p.animTimer>1/ANIM_FPS){p.animTimer=0;p.animFrame=((p.animFrame||0)+1)%4;}
  }
}

/* ─── Wall helper ────────────────────────────────────────────── */
function _wallHit(x,y,r){
  for(let i=0;i<walls.length;i+=2){
    const wx=walls[i],wy=walls[i+1];
    const cx=Math.max(wx,Math.min(x,wx+TILE));
    const cy=Math.max(wy,Math.min(y,wy+TILE));
    if((x-cx)**2+(y-cy)**2<r*r) return true;
  }
  return false;
}

/* ─── Render ─────────────────────────────────────────────────── */
function _render(){
  const cw=canvas.width,ch=canvas.height;
  ctx.clearRect(0,0,cw,ch);
  ctx.fillStyle='#100c04';
  ctx.fillRect(0,0,cw,ch);

  ctx.save();
  ctx.translate(Math.round(-CAM.x+shakeX), Math.round(-CAM.y+shakeY));

  _drawFloor();
  _drawExit();
  _drawKey();
  _drawWalls();

  // Other players
  for(const[id,p] of Object.entries(players)){
    _drawPlayer(p, id===monPlayerId&&monsterType==='player');
  }

  // Self
  _drawSelf();

  // Monster
  _drawMonster();

  // Particles
  for(const p of parts){
    ctx.save();
    ctx.globalAlpha=Math.max(0,p.life);
    ctx.fillStyle=p.col;
    ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  ctx.restore();

  // Flashlight
  _drawFlashlight(cw,ch);

  // Danger vignette
  if(dangerAmt>0){
    const g=ctx.createRadialGradient(cw/2,ch/2,ch*.25,cw/2,ch/2,ch*.8);
    g.addColorStop(0,'rgba(255,0,0,0)');
    g.addColorStop(1,`rgba(200,0,0,${dangerAmt*0.55})`);
    ctx.fillStyle=g;ctx.fillRect(0,0,cw,ch);
  }

  // Flash effects
  if(flashRed>0){ ctx.fillStyle=`rgba(255,0,0,${Math.min(0.7,flashRed*0.6)})`; ctx.fillRect(0,0,cw,ch); }
  if(flashWhite>0){ ctx.fillStyle=`rgba(255,255,255,${flashWhite*0.8})`; ctx.fillRect(0,0,cw,ch); }

  // HUD
  _drawHUD(cw,ch);

  // Mobile UI
  if(window.IS_MOBILE) _drawJoystick(cw,ch);

  // Messages
  _drawMsgs(cw,ch);
}

/* ─── Floor ──────────────────────────────────────────────────── */
function _drawFloor(){
  const sx=Math.floor(CAM.x/TILE)-1;
  const sy=Math.floor(CAM.y/TILE)-1;
  const ex=sx+Math.ceil(canvas.width/TILE)+2;
  const ey=sy+Math.ceil(canvas.height/TILE)+2;
  for(let ty=sy;ty<ey;ty++){
    for(let tx=sx;tx<ex;tx++){
      ctx.fillStyle=(tx+ty)%2?'#1e1608':'#1a1306';
      ctx.fillRect(tx*TILE,ty*TILE,TILE,TILE);
    }
  }
  // subtle grid
  ctx.strokeStyle='rgba(60,45,15,0.25)';
  ctx.lineWidth=0.5;
  for(let ty=sy;ty<ey;ty++)for(let tx=sx;tx<ex;tx++){
    ctx.strokeRect(tx*TILE,ty*TILE,TILE,TILE);
  }
}

/* ─── Walls ──────────────────────────────────────────────────── */
function _drawWalls(){
  const vx1=CAM.x-TILE,vy1=CAM.y-TILE,vx2=CAM.x+canvas.width+TILE,vy2=CAM.y+canvas.height+TILE;
  for(let i=0;i<walls.length;i+=2){
    const wx=walls[i],wy=walls[i+1];
    if(wx>vx2||wx+TILE<vx1||wy>vy2||wy+TILE<vy1)continue;

    // Base
    ctx.fillStyle='#7a6442';
    ctx.fillRect(wx,wy,TILE,TILE);
    // Bricks
    const bh=TILE/3;
    for(let row=0;row<3;row++){
      const off=(row%2)*TILE*.5;
      ctx.fillStyle=row%2?'#6e5938':'#7a6442';
      ctx.fillRect(wx,wy+row*bh,TILE,bh);
      ctx.strokeStyle='#4a3c22';
      ctx.lineWidth=1;
      ctx.strokeRect(wx+off,wy+row*bh,TILE*.5,bh);
      ctx.strokeRect(wx+off+TILE*.5,wy+row*bh,TILE*.5,bh);
    }
    // Top highlight
    ctx.fillStyle='rgba(255,230,150,0.12)';
    ctx.fillRect(wx,wy,TILE,3);
    // Bottom shadow
    ctx.fillStyle='rgba(0,0,0,0.45)';
    ctx.fillRect(wx,wy+TILE-5,TILE,5);
  }
}

/* ─── Exit ───────────────────────────────────────────────────── */
function _drawExit(){
  if(!exitObj)return;
  const{x,y}=exitObj;
  const t=Date.now()/1000;
  const p=(Math.sin(t*2)+1)*.5;

  ctx.save();
  ctx.translate(x,y);
  // Glow
  const g=ctx.createRadialGradient(0,0,8,0,0,70);
  g.addColorStop(0,`rgba(0,255,130,${0.25+p*.18})`);
  g.addColorStop(1,'rgba(0,255,130,0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,70,0,Math.PI*2);ctx.fill();
  // Door frame
  ctx.fillStyle='#004422';
  ctx.fillRect(-22,-35,44,62);
  ctx.fillStyle='#00cc55';
  ctx.fillRect(-18,-30,36,54);
  ctx.fillStyle='rgba(0,255,130,0.3)';
  ctx.fillRect(-18,-30,36,54);
  // Knob
  ctx.fillStyle='#ffcc00';
  ctx.beginPath();ctx.arc(10,0,4,0,Math.PI*2);ctx.fill();
  // Label
  ctx.fillStyle='#00ff88';
  ctx.font='bold 11px monospace';
  ctx.textAlign='center';
  ctx.fillText('ÇIKIŞ',0,42);
  ctx.restore();
}

/* ─── Key ────────────────────────────────────────────────────── */
function _drawKey(){
  if(!keyObj||keyObj.collected)return;
  const{x,y}=keyObj;
  const t=Date.now()/1000;
  const bob=Math.sin(t*3)*5;
  const gp=(Math.sin(t*4)+1)*.5;
  ctx.save();
  ctx.translate(x,y+bob);
  const g=ctx.createRadialGradient(0,0,4,0,0,44);
  g.addColorStop(0,`rgba(255,210,0,${.35+gp*.25})`);
  g.addColorStop(1,'rgba(255,210,0,0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,44,0,Math.PI*2);ctx.fill();
  // Key body
  ctx.fillStyle='#ffd700';
  ctx.beginPath();ctx.arc(0,-8,13,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#1a1000';
  ctx.beginPath();ctx.arc(0,-8,7,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#ffd700';
  ctx.fillRect(-4,3,8,22);
  ctx.fillRect(-4,14,6,5);
  ctx.fillRect(-4,20,8,4);
  ctx.restore();
}

/* ─── Player draw ────────────────────────────────────────────── */
function _drawPlayer(p,isMon){
  if(!p)return;
  const jo=p.jumpOff||0;
  ctx.save();
  ctx.translate(Math.round(p.x),Math.round(p.y+jo));
  if(isMon) _monsterBody(p.animFrame||0);
  else _playerBody(p.dir||'d',p.anim||'idle',p.animFrame||0,p.k||p.hasKey);
  // Name
  const nm=p.n||p.name||'?';
  ctx.font='11px monospace';
  const tw=ctx.measureText(nm).width;
  ctx.fillStyle='rgba(0,0,0,0.65)';
  ctx.fillRect(-tw/2-5,-52,tw+10,17);
  ctx.fillStyle=isMon?'#ff4422':'#e8e8e8';
  ctx.textAlign='center';
  ctx.fillText(nm,0,-39);
  ctx.restore();
}

function _drawSelf(){
  const jo=ME.jumpOff||0;
  ctx.save();
  ctx.translate(Math.round(ME.x),Math.round(ME.y+jo));
  // Selection ring
  ctx.strokeStyle='rgba(255,255,255,0.35)';
  ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(0,-24,16,0,Math.PI*2);ctx.stroke();
  _playerBody(ME.dir,ME.anim,ME.animFrame,ME.hasKey,true);
  // Name
  ctx.font='bold 11px monospace';
  const tw=ctx.measureText(myName).width;
  ctx.fillStyle='rgba(0,0,0,0.65)';
  ctx.fillRect(-tw/2-5,-52,tw+10,17);
  ctx.fillStyle='#44ff99';
  ctx.textAlign='center';
  ctx.fillText(myName,0,-39);
  ctx.restore();
}

function _playerBody(dir,anim,frame,hasKey,isSelf){
  // Shadow
  ctx.fillStyle='rgba(0,0,0,0.28)';
  ctx.beginPath();ctx.ellipse(0,20,13,5,0,0,Math.PI*2);ctx.fill();
  // Body
  ctx.fillStyle=isSelf?'#3a8fff':'#5599ee';
  ctx.beginPath();ctx.roundRect(-11,-18,22,26,4);ctx.fill();
  // Head
  ctx.fillStyle=isSelf?'#ffcc99':'#ffbb88';
  ctx.beginPath();ctx.arc(0,-24,11,0,Math.PI*2);ctx.fill();
  // Eyes
  ctx.fillStyle='#222';
  const ed=dir==='r'?1:dir==='l'?-1:0;
  if(dir!=='u'){
    ctx.beginPath();ctx.arc(-3+ed*4,-25,2,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(3+ed*4,-25,2,0,Math.PI*2);ctx.fill();
  }
  // Legs walk anim
  const ls=anim==='walk'||anim==='run'?Math.sin(frame*Math.PI*.5)*9:0;
  ctx.fillStyle='#224499';
  ctx.fillRect(-8,6,6,13+Math.max(0,ls));
  ctx.fillRect(2,6,6,13+Math.max(0,-ls));
  // Key badge
  if(hasKey){
    ctx.font='13px monospace';ctx.textAlign='center';
    ctx.fillText('🔑',16,-16);
  }
}

/* ─── Monster ────────────────────────────────────────────────── */
function _drawMonster(){
  if(!MON||!roomData)return;
  const visRange=360;
  const dist=Math.hypot(ME.x-MON.x,ME.y-MON.y);
  // Only show if nearby or chasing
  if(dist>visRange&&MON.phase!=='chase'&&MON.visTimer<0.1)return;

  ctx.save();
  ctx.translate(Math.round(MON.x),Math.round(MON.y));
  _monsterBody(0);
  ctx.restore();
}

function _monsterBody(frame){
  const t=Date.now()/1000;
  const wb=Math.sin(t*9)*2;
  // Shadow
  ctx.fillStyle='rgba(180,0,0,0.2)';
  ctx.beginPath();ctx.ellipse(0,24,20,7,0,0,Math.PI*2);ctx.fill();
  // Body
  ctx.fillStyle='#0d0000';
  ctx.beginPath();ctx.ellipse(0,-4,19,24,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#cc1100';ctx.lineWidth=1.5;ctx.stroke();
  // Eyes
  ctx.fillStyle='#ff0000';
  ctx.beginPath();ctx.arc(-7+wb,-11,5.5,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(7-wb,-11,5.5,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#ff8800';
  ctx.beginPath();ctx.arc(-7+wb,-11,2.5,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(7-wb,-11,2.5,0,Math.PI*2);ctx.fill();
  // Mouth
  ctx.strokeStyle='#ff3300';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(0,-1,9,0.2,Math.PI-.2);ctx.stroke();
  // Tendrils
  for(let i=0;i<4;i++){
    const ang=(i/4)*Math.PI*2+Math.sin(t*4+i)*0.4;
    const r1=20,r2=36;
    ctx.strokeStyle=`rgba(180,0,0,0.7)`;ctx.lineWidth=2.5;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang)*r1,-4+Math.sin(ang)*r1);
    ctx.lineTo(Math.cos(ang)*r2,-4+Math.sin(ang)*r2);
    ctx.stroke();
  }
  // Label
  ctx.fillStyle='#ff3322';
  ctx.font='bold 11px monospace';
  ctx.textAlign='center';
  ctx.fillText('CANAVAR',-0,-48);
}

/* ─── Flashlight ─────────────────────────────────────────────── */
function _drawFlashlight(cw,ch){
  const px=ME.x-CAM.x+shakeX;
  const py=ME.y-CAM.y+shakeY;
  const grad=ctx.createRadialGradient(px,py,0,px,py,FLASH_R);
  grad.addColorStop(0,'rgba(0,0,0,0)');
  grad.addColorStop(0.55,'rgba(0,0,0,0.08)');
  grad.addColorStop(0.82,'rgba(0,0,0,0.78)');
  grad.addColorStop(1,'rgba(0,0,0,0.97)');
  ctx.fillStyle=grad;
  ctx.fillRect(0,0,cw,ch);
  // Warm tint
  ctx.fillStyle='rgba(255,200,80,0.025)';
  ctx.fillRect(0,0,cw,ch);
}

/* ─── HUD ────────────────────────────────────────────────────── */
function _drawHUD(cw,ch){
  // Top bar
  ctx.fillStyle='rgba(0,0,0,0.7)';
  ctx.fillRect(0,0,cw,38);
  ctx.strokeStyle='rgba(200,168,75,0.25)';
  ctx.lineWidth=1;
  ctx.strokeRect(0,0,cw,38);

  ctx.font='13px monospace';
  ctx.textAlign='left';
  if(ME.hasKey){
    ctx.fillStyle='#ffe044';
    ctx.fillText('🔑  ANAHTARIN SENDE — ÇIKIŞA KOŞ!',10,24);
  } else {
    ctx.fillStyle='rgba(200,168,75,0.6)';
    ctx.fillText('🔑  Anahtarı bul ve çıkışa kaç...',10,24);
  }

  // FPS
  ctx.fillStyle='rgba(255,255,255,0.2)';
  ctx.font='10px monospace';
  ctx.textAlign='right';
  ctx.fillText(fps+'fps',cw-8,14);

  // Player count
  const cnt=Object.keys(players).length+1;
  ctx.fillStyle='rgba(200,168,75,0.5)';
  ctx.font='11px monospace';
  ctx.fillText(`👥 ${cnt}`,cw-8,30);

  // Monster warning
  if(dangerAmt>0.4&&!ME.dead&&!ME.escaped){
    const pulse=(Math.sin(Date.now()/180)+1)*.5;
    ctx.fillStyle=`rgba(255,50,0,${0.2+pulse*.25})`;
    ctx.fillRect(0,0,cw,ch);
    ctx.font='bold 15px monospace';
    ctx.textAlign='center';
    ctx.fillStyle=`rgba(255,100,50,${0.8+pulse*.2})`;
    ctx.fillText('⚠ CANAVAR YAKIN ⚠',cw/2,ch-28);
  }

  // Dead / escaped overlay hint
  if(ME.dead){
    ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(0,0,cw,ch);
    ctx.font='bold 38px monospace';ctx.textAlign='center';
    ctx.fillStyle='#ff2244';
    ctx.fillText('💀 YAKALANDINN',cw/2,ch/2-20);
    ctx.font='16px monospace';ctx.fillStyle='rgba(255,255,255,0.5)';
    ctx.fillText('Oyun bitti...',cw/2,ch/2+20);
  }
  if(ME.escaped){
    ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fillRect(0,0,cw,ch);
    ctx.font='bold 38px monospace';ctx.textAlign='center';
    ctx.fillStyle='#44ff99';
    ctx.fillText('🏆 KURTULDUN!',cw/2,ch/2-20);
    ctx.font='16px monospace';ctx.fillStyle='rgba(255,255,255,0.5)';
    ctx.fillText('Backrooms\'dan kaçtın!',cw/2,ch/2+20);
  }
}

/* ─── Mobile Joystick ────────────────────────────────────────── */
function _drawJoystick(cw,ch){
  const bx=cw*.18, by=ch*.8;
  // Outer
  ctx.save();
  ctx.globalAlpha=0.28;
  ctx.strokeStyle='#fff';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(bx,by,56,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.06)';ctx.fill();
  ctx.restore();
  // Inner stick
  let sx=bx,sy=by;
  if(JOY.active){
    const d=Math.min(Math.hypot(JOY.dx,JOY.dy),46);
    const a=Math.atan2(JOY.dy,JOY.dx);
    sx=bx+Math.cos(a)*d;sy=by+Math.sin(a)*d;
  }
  ctx.save();
  ctx.globalAlpha=JOY.active?0.7:0.35;
  ctx.fillStyle='rgba(255,255,255,0.9)';
  ctx.beginPath();ctx.arc(sx,sy,24,0,Math.PI*2);ctx.fill();
  ctx.restore();
  // Jump btn
  const jbx=cw*.83, jby=ch*.8;
  ctx.save();
  ctx.globalAlpha=0.38;
  ctx.fillStyle='#3388ff';
  ctx.beginPath();ctx.arc(jbx,jby,40,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#88bbff';ctx.lineWidth=2;ctx.stroke();
  ctx.globalAlpha=0.9;
  ctx.fillStyle='#fff';ctx.font='bold 14px monospace';ctx.textAlign='center';
  ctx.fillText('ZIP',jbx,jby+5);
  ctx.restore();
}

/* ─── Messages ───────────────────────────────────────────────── */
function _drawMsgs(cw,ch){
  const now=Date.now();
  msgs=msgs.filter(m=>now<m.until);
  let y=ch*.22;
  ctx.font='bold 15px monospace';
  ctx.textAlign='center';
  for(const m of msgs){
    const life=Math.min(1,(m.until-now)/400);
    ctx.globalAlpha=life;
    const tw=ctx.measureText(m.text).width;
    ctx.fillStyle='rgba(0,0,0,0.75)';
    ctx.fillRect(cw/2-tw/2-12,y-19,tw+24,27);
    ctx.fillStyle=m.col||'#fff';
    ctx.fillText(m.text,cw/2,y);
    y+=34;
  }
  ctx.globalAlpha=1;
}

/* ─── Utils ──────────────────────────────────────────────────── */
function showMsg(text,col,ms){ msgs.push({text,col,until:Date.now()+ms}); }
function screenShake(amt,dur){ shakeT=dur; }
function spawnParticles(x,y,col,n){
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2;
    const s=1+Math.random()*4;
    parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-2,life:.6+Math.random()*.5,r:3+Math.random()*5,col});
  }
}

// Simple procedural sound
const AC=window.AudioContext||window.webkitAudioContext;
let _ac=null;
function _getAC(){ if(!_ac){try{_ac=new AC();}catch(e){}} return _ac; }
function playSound(type){
  const ac=_getAC(); if(!ac)return;
  try{
    const o=ac.createOscillator();
    const g=ac.createGain();
    o.connect(g);g.connect(ac.destination);
    const now=ac.currentTime;
    if(type==='step'){
      o.type='sawtooth';o.frequency.value=60+Math.random()*30;
      g.gain.setValueAtTime(0.04,now);g.gain.exponentialRampToValueAtTime(0.001,now+0.06);
      o.start(now);o.stop(now+0.06);
    } else if(type==='jump'){
      o.type='sine';o.frequency.setValueAtTime(220,now);o.frequency.linearRampToValueAtTime(440,now+0.12);
      g.gain.setValueAtTime(0.1,now);g.gain.exponentialRampToValueAtTime(0.001,now+0.15);
      o.start(now);o.stop(now+0.15);
    } else if(type==='key'){
      o.type='sine';o.frequency.setValueAtTime(660,now);o.frequency.setValueAtTime(880,now+0.1);
      g.gain.setValueAtTime(0.18,now);g.gain.exponentialRampToValueAtTime(0.001,now+0.4);
      o.start(now);o.stop(now+0.4);
    } else if(type==='caught'){
      o.type='sawtooth';o.frequency.setValueAtTime(220,now);o.frequency.linearRampToValueAtTime(55,now+0.8);
      g.gain.setValueAtTime(0.25,now);g.gain.exponentialRampToValueAtTime(0.001,now+0.9);
      o.start(now);o.stop(now+0.9);
    } else if(type==='escape'){
      o.type='sine';o.frequency.setValueAtTime(440,now);o.frequency.linearRampToValueAtTime(880,now+0.3);
      g.gain.setValueAtTime(0.2,now);g.gain.exponentialRampToValueAtTime(0.001,now+0.6);
      o.start(now);o.stop(now+0.6);
    } else if(type==='monster'){
      o.type='sawtooth';o.frequency.setValueAtTime(110,now);o.frequency.setValueAtTime(80,now+0.4);
      g.gain.setValueAtTime(0.22,now);g.gain.exponentialRampToValueAtTime(0.001,now+1);
      o.start(now);o.stop(now+1);
    }
  }catch(e){}
}

/* ─── Public API ─────────────────────────────────────────────── */
return {
  init, loadRoom, resize, showMsg, playSound,
  set onDied(fn){ onDied=fn; },
  set onEscaped(fn){ onEscaped=fn; },
  set onGameOver(fn){ onGameOver=fn; },
  set onCaught(fn){ onCaught=fn; },
  get running(){ return running; },
  stop(){ running=false; }
};

})(); // GAME IIFE

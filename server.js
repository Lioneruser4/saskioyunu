const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors        : { origin:'*', methods:['GET','POST'] },
  pingTimeout : 60000,
  pingInterval: 20000,
  transports  : ['websocket','polling'],
  allowEIO3   : true
});

app.use(express.static(path.join(__dirname,'public')));
app.get('/ping',(_,res)=>res.json({ok:true,rooms:Object.keys(ROOMS).length,players:Object.keys(REG).length}));

/* ══════════ CONSTANTS ══════════ */
const TILE      = 80;
const COLS      = 50;
const ROWS      = 50;
const MAX_PLR   = 10;
const TICK_MS   = 50;
const PLR_R     = 18;
const MON_R     = 26;
const MON_SP    = 2.7;
const MON_CHASE = 4.3;
const SIGHT     = 340;
const CATCH_D   = PLR_R + MON_R + 5;
const CATCH_CD  = 3000;

/* ══════════ STATE ══════════ */
const ROOMS = {};
const REG   = {};
let   RC    = 0;

/* ══════════ MAZE ══════════ */
function buildMaze(cols, rows) {
  const g = Array.from({length:rows}, ()=>new Uint8Array(cols).fill(1));

  (function carve(x,y){
    g[y][x]=0;
    [[0,-2],[0,2],[-2,0],[2,0]].sort(()=>Math.random()-.5).forEach(([dx,dy])=>{
      const nx=x+dx,ny=y+dy;
      if(ny>0&&ny<rows-1&&nx>0&&nx<cols-1&&g[ny][nx]){g[y+dy/2][x+dx/2]=0;carve(nx,ny);}
    });
  })(1,1);

  for(let i=0;i<90;i++){
    const x=1+Math.floor(Math.random()*(cols-2));
    const y=1+Math.floor(Math.random()*(rows-2));
    g[y][x]=0;
  }
  for(let x=0;x<cols;x++){g[0][x]=1;g[rows-1][x]=1;}
  for(let y=0;y<rows;y++){g[y][0]=1;g[y][cols-1]=1;}

  const walls=[];
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(g[y][x])walls.push(x*TILE,y*TILE);
  return {grid:g,walls};
}

function openSpot(grid,cols,rows,excl=[],away=null,minD=0){
  for(let t=0;t<1000;t++){
    const gx=1+Math.floor(Math.random()*(cols-2));
    const gy=1+Math.floor(Math.random()*(rows-2));
    if(grid[gy][gx])continue;
    const wx=gx*TILE+TILE/2,wy=gy*TILE+TILE/2;
    if(away&&Math.hypot(wx-away.x,wy-away.y)<minD)continue;
    if(excl.some(e=>Math.hypot(wx-e.x,wy-e.y)<TILE*5))continue;
    return{x:wx,y:wy};
  }
  return{x:TILE*3+TILE/2,y:TILE*3+TILE/2};
}

/* ══════════ PHYSICS ══════════ */
function wallHit(walls,x,y,r){
  for(let i=0;i<walls.length;i+=2){
    const wx=walls[i],wy=walls[i+1];
    const cx=Math.max(wx,Math.min(x,wx+TILE));
    const cy=Math.max(wy,Math.min(y,wy+TILE));
    if((x-cx)**2+(y-cy)**2<r*r)return true;
  }
  return false;
}

function slide(walls,ox,oy,vx,vy,r){
  let x=ox,y=oy;
  if(!wallHit(walls,ox+vx,oy,r))x=ox+vx;
  if(!wallHit(walls,x,oy+vy,r))y=oy+vy;
  return{x,y};
}

/* ══════════ ROOM FACTORY ══════════ */
function makeRoom(opts){
  const id='room_'+(++RC);
  const{grid,walls}=buildMaze(COLS,ROWS);
  const spawn =openSpot(grid,COLS,ROWS);
  const keyP  =openSpot(grid,COLS,ROWS,[spawn],spawn,TILE*16);
  const exitP =openSpot(grid,COLS,ROWS,[spawn,keyP],spawn,TILE*14);
  const monP  =openSpot(grid,COLS,ROWS,[spawn,keyP,exitP],spawn,TILE*20);

  const room={
    id, walls, grid,
    creatorName : opts.creatorName||'Sistem',
    monsterType : opts.monsterType||'ai',
    maxPlayers  : MAX_PLR,
    status      : 'playing',
    spawn, keyP, exitP,
    key  :{x:keyP.x,y:keyP.y,collected:false,holder:null},
    exit :{x:exitP.x,y:exitP.y},
    mon  :{x:monP.x,y:monP.y,speed:MON_SP,phase:'roam',roamPt:null,cd:{}},
    monPlayerId:null,
    players:{},
    interval:null
  };
  room.interval=setInterval(()=>tick(room),TICK_MS);
  ROOMS[id]=room;
  console.log(`[+] ${id} by ${room.creatorName} type=${room.monsterType}`);
  return room;
}

/* ══════════ TICK ══════════ */
function tick(room){
  if(!ROOMS[room.id]){clearInterval(room.interval);return;}
  if(room.monsterType==='ai')aiTick(room);

  const alive=Object.values(room.players).filter(p=>!p.dead&&!p.escaped&&!p.isMonster);
  if(alive.length===0&&Object.keys(room.players).length>0){
    io.to(room.id).emit('S_GAMEOVER',{reason:'allCaught'});
    cleanRoom(room.id,5000);
    return;
  }

  io.to(room.id).emit('S_STATE',{
    ps:serP(room.players),
    mon:{x:room.mon.x,y:room.mon.y,phase:room.mon.phase},
    key:{c:room.key.collected,h:room.key.holder}
  });
}

function serP(players){
  const o={};
  for(const[id,p]of Object.entries(players))
    o[id]={x:p.x,y:p.y,d:p.dir,a:p.anim,n:p.name,k:p.hasKey,dead:p.dead,esc:p.escaped,mon:p.isMonster};
  return o;
}

/* ══════════ AI ══════════ */
function aiTick(room){
  const{mon,walls,grid,players}=room;
  const prey=Object.values(players).filter(p=>!p.dead&&!p.escaped&&!p.isMonster);
  if(!prey.length)return;

  let near=null,nd=Infinity;
  for(const p of prey){const d=Math.hypot(p.x-mon.x,p.y-mon.y);if(d<nd){nd=d;near=p;}}

  if(nd<SIGHT){mon.phase='chase';mon.speed=MON_CHASE;}
  else{
    mon.phase='roam';mon.speed=MON_SP;
    if(!mon.roamPt||Math.hypot(mon.x-mon.roamPt.x,mon.y-mon.roamPt.y)<60)
      mon.roamPt=openSpot(grid,COLS,ROWS);
  }

  const tx=mon.phase==='chase'?near.x:mon.roamPt.x;
  const ty=mon.phase==='chase'?near.y:mon.roamPt.y;
  const dd=Math.hypot(tx-mon.x,ty-mon.y);
  if(dd>2){
    const mv=slide(walls,mon.x,mon.y,(tx-mon.x)/dd*mon.speed,(ty-mon.y)/dd*mon.speed,MON_R);
    mon.x=mv.x;mon.y=mv.y;
  }

  const now=Date.now();
  for(const p of prey){
    if((mon.cd[p.id]||0)>now)continue;
    if(Math.hypot(p.x-mon.x,p.y-mon.y)<CATCH_D){
      mon.cd[p.id]=now+CATCH_CD;
      p.dead=true;
      io.to(p.id).emit('S_DIED');
      io.to(room.id).emit('S_CAUGHT',{id:p.id,name:p.name});
      setTimeout(()=>{if(room.players[p.id]){delete room.players[p.id];io.to(room.id).emit('S_LEFT',{id:p.id});}},1500);
    }
  }
}

/* ══════════ JOIN ══════════ */
function joinRoom(socket,room,name){
  const isMonster=room.monsterType==='player'&&!room.monPlayerId;
  let px,py;
  if(isMonster){
    room.monPlayerId=socket.id;
    px=room.mon.x;py=room.mon.y;
  }else{
    px=room.spawn.x+(Math.random()-.5)*TILE*2;
    py=room.spawn.y+(Math.random()-.5)*TILE*2;
  }
  room.players[socket.id]={id:socket.id,name,x:px,y:py,dir:'down',anim:'idle',hasKey:false,dead:false,escaped:false,isMonster};
  REG[socket.id]={roomId:room.id,name};
  socket.join(room.id);

  socket.emit('S_JOINED',{
    roomId:room.id,pid:socket.id,isMonster,
    spawn:{x:px,y:py},
    walls:room.walls,
    key:room.key,exit:room.exit,
    mon:{x:room.mon.x,y:room.mon.y},
    players:serP(room.players),
    cols:COLS,rows:ROWS,tile:TILE,
    monsterType:room.monsterType,monPlayerId:room.monPlayerId
  });
  socket.to(room.id).emit('S_PJOIN',{id:socket.id,name,x:px,y:py,isMonster});
  if(isMonster)socket.emit('S_YOU_MONSTER');
  broadcastList();
}

function cleanRoom(id,ms){
  setTimeout(()=>{
    const r=ROOMS[id];if(!r)return;
    clearInterval(r.interval);delete ROOMS[id];
    broadcastList();
    console.log(`[-] ${id} cleaned`);
  },ms);
}

function broadcastList(){
  io.emit('S_ROOM_LIST',Object.values(ROOMS).map(r=>({
    id:r.id,creatorName:r.creatorName,monsterType:r.monsterType,
    playerCount:Object.keys(r.players).length,maxPlayers:r.maxPlayers
  })));
}

/* ══════════ SOCKET ══════════ */
io.on('connection',socket=>{
  console.log(`[~] connect ${socket.id}`);

  socket.on('C_PING',()=>socket.emit('S_PONG'));

  socket.on('C_GET_ROOMS',()=>{
    socket.emit('S_ROOM_LIST',Object.values(ROOMS).map(r=>({
      id:r.id,creatorName:r.creatorName,monsterType:r.monsterType,
      playerCount:Object.keys(r.players).length,maxPlayers:r.maxPlayers
    })));
  });

  socket.on('C_QUICK_PLAY',({name})=>{
    // Always instant: find room or create new one, start immediately
    let r=Object.values(ROOMS).find(r=>Object.keys(r.players).length<r.maxPlayers);
    if(!r)r=makeRoom({creatorName:name,monsterType:'ai'});
    joinRoom(socket,r,name);
  });

  socket.on('C_CREATE_ROOM',({name,monsterType})=>{
    const r=makeRoom({creatorName:name,monsterType:monsterType||'ai'});
    joinRoom(socket,r,name);
  });

  socket.on('C_JOIN_ROOM',({roomId,name})=>{
    const r=ROOMS[roomId];
    if(!r){socket.emit('S_ERROR','Oda yok');return;}
    if(Object.keys(r.players).length>=r.maxPlayers){socket.emit('S_ERROR','Oda dolu');return;}
    joinRoom(socket,r,name);
  });

  socket.on('C_MOVE',({x,y,dir,anim})=>{
    const reg=REG[socket.id];if(!reg)return;
    const room=ROOMS[reg.roomId];if(!room)return;
    const p=room.players[socket.id];if(!p||p.dead||p.escaped)return;
    if(Math.hypot(x-p.x,y-p.y)>24)return; // speed guard
    if(!wallHit(room.walls,x,p.y,PLR_R))p.x=x;
    if(!wallHit(room.walls,p.x,y,PLR_R))p.y=y;
    p.dir=dir;p.anim=anim;
    if(p.isMonster&&room.monsterType==='player'){room.mon.x=p.x;room.mon.y=p.y;}

    // Key
    if(!room.key.collected&&Math.hypot(p.x-room.key.x,p.y-room.key.y)<42){
      room.key.collected=true;room.key.holder=socket.id;p.hasKey=true;
      io.to(room.id).emit('S_KEY',{id:socket.id,name:p.name});
    }

    // Player-monster catch
    if(room.monsterType==='player'&&room.monPlayerId&&!p.isMonster){
      const mp=room.players[room.monPlayerId];
      if(mp){
        const now=Date.now();
        if((room.mon.cd[p.id]||0)<now&&Math.hypot(p.x-mp.x,p.y-mp.y)<CATCH_D+12){
          room.mon.cd[p.id]=now+CATCH_CD;
          p.dead=true;
          io.to(p.id).emit('S_DIED');
          io.to(room.id).emit('S_CAUGHT',{id:p.id,name:p.name});
        }
      }
    }

    // Exit
    if(room.key.holder===socket.id&&Math.hypot(p.x-room.exit.x,p.y-room.exit.y)<55){
      p.escaped=true;p.hasKey=false;
      io.to(room.id).emit('S_ESCAPED',{id:socket.id,name:p.name});
      if(Object.values(room.players).filter(q=>!q.dead&&!q.escaped&&!q.isMonster).length===0){
        io.to(room.id).emit('S_GAMEOVER',{reason:'escaped'});
        cleanRoom(room.id,5000);
      }
    }
  });

  socket.on('disconnect',()=>{
    const reg=REG[socket.id];
    if(reg){
      const room=ROOMS[reg.roomId];
      if(room){
        delete room.players[socket.id];
        io.to(room.id).emit('S_LEFT',{id:socket.id});
        if(Object.keys(room.players).length===0){clearInterval(room.interval);delete ROOMS[room.id];}
      }
      delete REG[socket.id];
    }
    broadcastList();
    console.log(`[~] disconnect ${socket.id}`);
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`🟢 Backrooms :${PORT}`));
setInterval(()=>console.log(`[♥] rooms=${Object.keys(ROOMS).length} plrs=${Object.keys(REG).length}`),25000);

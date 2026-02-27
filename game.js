window.GAME = (function(){
  const TILE = 80, PLR_R = 18, PLR_SPD = 3.6, MON_R = 26;
  let canvas, ctx, socket, myId, myName, isMonster = false;
  let running = false, players = {}, walls = [], key = null, exit = null;
  let me = {x:0,y:0,vx:0,vy:0,dir:'down',anim:'idle',hasKey:false};
  let keys = {}, joy = {active:false,dx:0,dy:0};
  let camera = {x:0,y:0};

  function init(canvasEl, sock, id, name, monster){
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    socket = sock;
    myId = id;
    myName = name;
    isMonster = monster;
    
    resize();
    window.addEventListener('resize', resize);
    
    // Keyboard controls
    window.addEventListener('keydown', e => keys[e.code] = true);
    window.addEventListener('keyup', e => keys[e.code] = false);
    
    // Touch controls
    canvas.addEventListener('touchstart', handleTouchStart, {passive:false});
    canvas.addEventListener('touchmove', handleTouchMove, {passive:false});
    canvas.addEventListener('touchend', handleTouchEnd, {passive:false});
  }

  function resize(){
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function handleTouchStart(e){
    e.preventDefault();
    const t = e.touches[0];
    const rx = t.clientX / canvas.width;
    if(rx < 0.6 && !joy.active){
      joy.active = true;
      joy.sx = t.clientX;
      joy.sy = t.clientY;
    }
  }

  function handleTouchMove(e){
    e.preventDefault();
    if(joy.active){
      const t = e.touches[0];
      joy.dx = t.clientX - joy.sx;
      joy.dy = t.clientY - joy.sy;
    }
  }

  function handleTouchEnd(e){
    e.preventDefault();
    joy.active = false;
    joy.dx = 0;
    joy.dy = 0;
  }

  function start(data){
    walls = data.walls;
    key = data.key;
    exit = data.exit;
    me.x = data.spawn.x;
    me.y = data.spawn.y;
    players = {};
    running = true;
    gameLoop();
  }

  function update(state){
    players = state.ps || {};
    if(state.mon) updateMonster(state.mon);
    if(state.key) updateKey(state.key);
  }

  function updateMonster(mon){
    // Monster position update handled by server
  }

  function updateKey(keyState){
    key.collected = keyState.c;
    key.holder = keyState.h;
  }

  function gameLoop(){
    if(!running) return;
    
    update();
    render();
    requestAnimationFrame(gameLoop);
  }

  function update(){
    // Input
    let mx = 0, my = 0;
    
    // Keyboard
    if(keys['ArrowLeft'] || keys['KeyA']) mx -= 1;
    if(keys['ArrowRight'] || keys['KeyD']) mx += 1;
    if(keys['ArrowUp'] || keys['KeyW']) my -= 1;
    if(keys['ArrowDown'] || keys['KeyS']) my += 1;
    
    // Joystick
    if(joy.active){
      const len = Math.hypot(joy.dx, joy.dy);
      if(len > 0){
        mx = joy.dx / len;
        my = joy.dy / len;
      }
    }
    
    // Normalize
    const mlen = Math.hypot(mx, my);
    if(mlen > 0){
      mx /= mlen;
      my /= mlen;
    }
    
    // Move
    const vx = mx * PLR_SPD;
    const vy = my * PLR_SPD;
    
    // Collision
    let newX = me.x + vx;
    let newY = me.y + vy;
    
    if(!wallHit(newX, me.y, PLR_R)) me.x = newX;
    if(!wallHit(me.x, newY, PLR_R)) me.y = newY;
    
    // Direction
    if(mlen > 0.1){
      if(Math.abs(mx) > Math.abs(my)){
        me.dir = mx > 0 ? 'right' : 'left';
      } else {
        me.dir = my > 0 ? 'down' : 'up';
      }
      me.anim = 'walk';
    } else {
      me.anim = 'idle';
    }
    
    // Send to server
    socket.emit('C_MOVE', {
      x: me.x,
      y: me.y,
      dir: me.dir,
      anim: me.anim
    });
  }

  function wallHit(x, y, r){
    for(let i = 0; i < walls.length; i += 2){
      const wx = walls[i], wy = walls[i + 1];
      const cx = Math.max(wx, Math.min(x, wx + TILE));
      const cy = Math.max(wy, Math.min(y, wy + TILE));
      if((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
    }
    return false;
  }

  function render(){
    const cw = canvas.width;
    const ch = canvas.height;
    
    // Clear
    ctx.fillStyle = '#0a0806';
    ctx.fillRect(0, 0, cw, ch);
    
    // Camera
    camera.x = me.x - cw / 2;
    camera.y = me.y - ch / 2;
    
    ctx.save();
    ctx.translate(-camera.x, -camera.y);
    
    // Draw floor
    ctx.fillStyle = '#1a1510';
    for(let x = 0; x < 4000; x += TILE){
      for(let y = 0; y < 4000; y += TILE){
        if(!wallHit(x + TILE/2, y + TILE/2, 1)){
          ctx.fillRect(x, y, TILE, TILE);
        }
      }
    }
    
    // Draw walls
    ctx.fillStyle = '#0a0806';
    for(let i = 0; i < walls.length; i += 2){
      ctx.fillRect(walls[i], walls[i + 1], TILE, TILE);
    }
    
    // Draw key
    if(key && !key.collected){
      ctx.fillStyle = '#c8a84b';
      ctx.beginPath();
      ctx.arc(key.x, key.y, 15, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Draw exit
    if(exit){
      ctx.fillStyle = '#1aaa55';
      ctx.fillRect(exit.x - 30, exit.y - 30, 60, 60);
    }
    
    // Draw players
    for(const [id, p] of Object.entries(players)){
      if(id === myId) continue;
      drawPlayer(p);
    }
    
    // Draw me
    drawPlayer({...me, name: myName});
    
    ctx.restore();
    
    // Draw HUD
    drawHUD();
  }

  function drawPlayer(p){
    ctx.fillStyle = p.isMonster ? '#cc2200' : '#c8a84b';
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLR_R, 0, Math.PI * 2);
    ctx.fill();
    
    // Name
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x, p.y - PLR_R - 5);
    
    // Key indicator
    if(p.k){
      ctx.fillStyle = '#c8a84b';
      ctx.beginPath();
      ctx.arc(p.x + PLR_R, p.y - PLR_R, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawHUD(){
    const playerCount = Object.keys(players).length + 1;
    document.getElementById('gameInfo').textContent = `Oyuncular: ${playerCount}/10`;
    
    if(key && key.collected && key.holder === myId){
      ctx.fillStyle = '#c8a84b';
      ctx.font = '20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ANAHTARI ALDIN - ÇIKIŞA GİT!', canvas.width / 2, 50);
    }
  }

  function onDeath(){
    running = false;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#cc2200';
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('YAKALANDIN!', canvas.width / 2, canvas.height / 2);
  }

  function onGameOver(){
    running = false;
  }

  function stop(){
    running = false;
  }

  return {
    init,
    start,
    update,
    onDeath,
    onGameOver,
    stop
  };
})();

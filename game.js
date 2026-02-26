// ==================== BACKROOMS GAME ENGINE ====================
const TILE = 80;
const PLAYER_SPEED = 3.5;
const PLAYER_SPRINT = 5.5;
const JUMP_FORCE = -12;
const GRAVITY = 0.6;
const PLAYER_RADIUS = 18;
const ANIM_FPS = 8;

class BackroomsGame {
  constructor(canvas, socket, playerId, playerName, isMonster) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.socket = socket;
    this.playerId = playerId;
    this.playerName = playerName;
    this.isMonster = isMonster;
    
    this.players = {};
    this.walls = [];
    this.key = null;
    this.exit = null;
    this.ai = null;
    this.monsterPlayerId = null;
    this.monsterType = 'ai';
    
    this.camera = { x: 0, y: 0 };
    this.keys = {};
    this.touches = {};
    
    // Mobile joystick
    this.joystick = { active: false, startX: 0, startY: 0, dx: 0, dy: 0, id: null };
    this.jumpBtn = { active: false };
    
    // Local player state
    this.local = {
      x: 0, y: 0, vx: 0, vy: 0,
      vy2: 0, // vertical for jump effect
      grounded: true,
      dir: 'down',
      state: 'idle',
      animFrame: 0,
      animTimer: 0,
      hasKey: false,
      dead: false,
      escaped: false
    };
    
    // Particles
    this.particles = [];
    
    // Fog of war / flashlight
    this.flashlight = true;
    this.flashRadius = 220;
    
    // Sounds (web audio)
    this.audioCtx = null;
    
    // Render loop
    this.lastTime = 0;
    this.running = false;
    
    // FPS
    this.fps = 0;
    this.fpsTimer = 0;
    this.fpsCount = 0;
    
    this.initInputs();
    this.initSocketEvents();
  }
  
  initAudio() {
    try {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) {}
  }
  
  playTone(freq, type, duration, vol=0.1) {
    if (!this.audioCtx) return;
    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain); gain.connect(this.audioCtx.destination);
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
      osc.start(); osc.stop(this.audioCtx.currentTime + duration);
    } catch(e) {}
  }
  
  footstepSound() {
    this.playTone(80 + Math.random()*40, 'sawtooth', 0.08, 0.05);
  }
  
  initInputs() {
    // Keyboard
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (e.code === 'Space') { e.preventDefault(); this.tryJump(); }
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') e.preventDefault();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    
    // Touch joystick
    this.canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const rect = this.canvas.getBoundingClientRect();
        const tx = t.clientX - rect.left;
        const ty = t.clientY - rect.top;
        const cw = this.canvas.width;
        const ch = this.canvas.height;
        
        // Left half = joystick
        if (tx < cw * 0.5 && !this.joystick.active) {
          this.joystick = { active: true, startX: tx, startY: ty, dx: 0, dy: 0, id: t.identifier, cx: tx, cy: ty };
        }
        // Right half top = jump
        if (tx > cw * 0.5 && ty < ch * 0.65) {
          this.tryJump();
        }
      }
    }, { passive: false });
    
    this.canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this.joystick.id) {
          const rect = this.canvas.getBoundingClientRect();
          const tx = t.clientX - rect.left;
          const ty = t.clientY - rect.top;
          this.joystick.dx = tx - this.joystick.startX;
          this.joystick.dy = ty - this.joystick.startY;
        }
      }
    }, { passive: false });
    
    this.canvas.addEventListener('touchend', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joystick.id) {
          this.joystick.active = false;
          this.joystick.dx = 0; this.joystick.dy = 0;
        }
      }
    });
  }
  
  tryJump() {
    if (this.local.grounded) {
      this.local.vy2 = JUMP_FORCE;
      this.local.grounded = false;
      this.playTone(200, 'sine', 0.15, 0.08);
    }
  }
  
  initSocketEvents() {
    this.socket.on('gameStart', data => {
      this.walls = data.walls;
      this.key = data.key;
      this.exit = data.exit;
      this.ai = data.ai;
      this.running = true;
      this.showMessage('⚠️ KAÇMAYA ÇALIŞ!', '#ffcc00', 3000);
      this.playTone(150, 'sawtooth', 1, 0.15);
    });
    
    this.socket.on('gameState', data => {
      // Update other players
      for (const [id, p] of Object.entries(data.players)) {
        if (id !== this.playerId) {
          this.players[id] = p;
        }
      }
      // Remove disconnected
      for (const id of Object.keys(this.players)) {
        if (!data.players[id]) delete this.players[id];
      }
      if (data.ai) this.ai = data.ai;
      if (data.key) this.key = data.key;
      this.monsterPlayerId = data.monsterPlayerId;
    });
    
    this.socket.on('playerJoined', p => {
      if (p.id !== this.playerId) {
        this.players[p.id] = p;
        this.showMessage(`${p.name} odaya girdi!`, '#4cff91', 2000);
      }
    });
    
    this.socket.on('playerLeft', ({ id }) => {
      if (this.players[id]) {
        const name = this.players[id].name;
        delete this.players[id];
        this.showMessage(`${name} ayrıldı`, '#ff6b6b', 2000);
      }
    });
    
    this.socket.on('playerCaught', ({ playerId }) => {
      if (playerId === this.playerId) {
        this.local.dead = true;
        this.showMessage('YAKALANDINN!!! 💀', '#ff2244', 9999);
        this.playTone(60, 'sawtooth', 2, 0.3);
        // Screen flash
        this.flashRed = 1.0;
      } else {
        this.showMessage(`${this.players[playerId]?.name || ''} yakalandı!`, '#ff6b6b', 2000);
      }
    });
    
    this.socket.on('youDied', () => {
      this.local.dead = true;
      this.running = false;
      setTimeout(() => {
        if (window.showDeathScreen) window.showDeathScreen();
      }, 1000);
    });
    
    this.socket.on('keyCollected', ({ playerId, playerName }) => {
      if (playerId === this.playerId) {
        this.local.hasKey = true;
        this.showMessage('🔑 ANAHTAR ALINDI! Çıkışa koş!', '#ffcc00', 4000);
        this.playTone(880, 'sine', 0.5, 0.2);
      } else {
        this.showMessage(`🔑 ${playerName} anahtarı aldı!`, '#ffcc00', 3000);
      }
    });
    
    this.socket.on('playerEscaped', ({ playerId, playerName }) => {
      if (playerId === this.playerId) {
        this.local.escaped = true;
        this.showMessage('🏆 KURTULDUN!!!', '#4cff91', 9999);
        this.playTone(440, 'sine', 0.3, 0.3);
        this.playTone(880, 'sine', 0.6, 0.3);
      } else {
        this.showMessage(`🏆 ${playerName} kaçtı!`, '#4cff91', 3000);
      }
    });
    
    this.socket.on('gameOver', ({ reason }) => {
      this.running = false;
      setTimeout(() => {
        if (window.showGameOver) window.showGameOver(reason);
      }, 2000);
    });
  }
  
  setRoom(roomData, players, spawn) {
    this.walls = roomData.walls;
    this.key = roomData.key;
    this.exit = roomData.exit;
    this.ai = roomData.ai;
    this.monsterType = roomData.monsterType;
    this.monsterPlayerId = roomData.monsterPlayerId;
    this.players = players || {};
    delete this.players[this.playerId];
    
    this.local.x = spawn.x;
    this.local.y = spawn.y;
    this.camera.x = spawn.x - this.canvas.width/2;
    this.camera.y = spawn.y - this.canvas.height/2;
    
    if (roomData.status === 'playing') {
      this.running = true;
    }
  }
  
  update(dt) {
    if (!this.running || this.local.dead || this.local.escaped) return;
    
    // Input
    let moveX = 0, moveY = 0;
    let sprinting = false;
    
    if (this.keys['ArrowLeft'] || this.keys['KeyA']) moveX -= 1;
    if (this.keys['ArrowRight'] || this.keys['KeyD']) moveX += 1;
    if (this.keys['ArrowUp'] || this.keys['KeyW']) moveY -= 1;
    if (this.keys['ArrowDown'] || this.keys['KeyS']) moveY += 1;
    if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) sprinting = true;
    
    // Joystick
    if (this.joystick.active) {
      const jd = Math.hypot(this.joystick.dx, this.joystick.dy);
      if (jd > 10) {
        moveX = this.joystick.dx / Math.max(jd, 60);
        moveY = this.joystick.dy / Math.max(jd, 60);
        if (jd > 55) sprinting = true;
        // Clamp
        const len = Math.hypot(moveX, moveY);
        if (len > 1) { moveX /= len; moveY /= len; }
      }
    }
    
    const spd = sprinting ? PLAYER_SPRINT : PLAYER_SPEED;
    this.local.vx = moveX * spd;
    this.local.vy = moveY * spd;
    
    // Move with wall collision
    const nx = this.local.x + this.local.vx;
    const ny = this.local.y + this.local.vy;
    
    if (!this.checkWall(nx, this.local.y)) this.local.x = nx;
    if (!this.checkWall(this.local.x, ny)) this.local.y = ny;
    
    // Jump (visual effect only for top-down... but we add it as animation)
    if (!this.local.grounded) {
      this.local.vy2 += GRAVITY;
      this.local.jumpOffset = (this.local.jumpOffset || 0) + this.local.vy2;
      if ((this.local.jumpOffset || 0) >= 0) {
        this.local.jumpOffset = 0;
        this.local.vy2 = 0;
        this.local.grounded = true;
      }
    }
    
    // Direction
    if (Math.abs(moveX) > 0.1 || Math.abs(moveY) > 0.1) {
      if (Math.abs(moveX) > Math.abs(moveY)) {
        this.local.dir = moveX > 0 ? 'right' : 'left';
      } else {
        this.local.dir = moveY > 0 ? 'down' : 'up';
      }
      this.local.state = sprinting ? 'run' : 'walk';
      
      // Footsteps
      this.local.stepTimer = (this.local.stepTimer || 0) + dt;
      const stepInterval = sprinting ? 0.25 : 0.4;
      if (this.local.stepTimer > stepInterval) {
        this.local.stepTimer = 0;
        this.footstepSound();
      }
    } else {
      this.local.state = 'idle';
    }
    
    // Anim
    this.local.animTimer += dt;
    if (this.local.animTimer > 1/ANIM_FPS) {
      this.local.animTimer = 0;
      this.local.animFrame = (this.local.animFrame + 1) % 4;
    }
    
    // Camera follow
    const camSpeed = 8;
    this.camera.x += (this.local.x - this.canvas.width/2 - this.camera.x) * camSpeed * dt;
    this.camera.y += (this.local.y - this.canvas.height/2 - this.camera.y) * camSpeed * dt;
    
    // Emit move
    this.moveEmitTimer = (this.moveEmitTimer || 0) + dt;
    if (this.moveEmitTimer > 0.05) {
      this.moveEmitTimer = 0;
      this.socket.emit('playerMove', {
        x: this.local.x,
        y: this.local.y,
        vx: this.local.vx,
        vy: this.local.vy,
        dir: this.local.dir,
        state: this.local.state
      });
    }
    
    // Monster player control
    if (this.isMonster && this.monsterType === 'player') {
      this.socket.emit('monsterMove', {
        x: this.local.x,
        y: this.local.y,
        dir: this.local.dir,
        state: this.local.state
      });
    }
    
    // Particles
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.particles) {
      p.x += p.vx; p.y += p.vy;
      p.life -= dt;
      p.vy += 0.1;
    }
    
    // Flash effect decay
    if (this.flashRed > 0) this.flashRed -= dt * 2;
    
    // FPS
    this.fpsCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 1) {
      this.fps = this.fpsCount;
      this.fpsCount = 0;
      this.fpsTimer = 0;
    }
    
    // Check AI proximity warning
    if (this.ai && !this.isMonster) {
      const dd = Math.hypot(this.local.x - this.ai.x, this.local.y - this.ai.y);
      this.aiDanger = Math.max(0, 1 - dd / 300);
    }
  }
  
  checkWall(x, y) {
    for (const w of this.walls) {
      if (x + PLAYER_RADIUS > w.x && x - PLAYER_RADIUS < w.x + w.w &&
          y + PLAYER_RADIUS > w.y && y - PLAYER_RADIUS < w.y + w.h) {
        return true;
      }
    }
    return false;
  }
  
  render() {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    
    // Background
    ctx.fillStyle = '#1a1008';
    ctx.fillRect(0, 0, cw, ch);
    
    ctx.save();
    ctx.translate(-this.camera.x, -this.camera.y);
    
    // Draw floor tiles
    this.drawFloor(ctx);
    
    // Draw exit
    if (this.exit) this.drawExit(ctx);
    
    // Draw key
    if (this.key && !this.key.collected) this.drawKey(ctx);
    
    // Draw walls
    this.drawWalls(ctx);
    
    // Draw other players
    for (const [id, p] of Object.entries(this.players)) {
      this.drawPlayer(ctx, p, id === this.monsterPlayerId);
    }
    
    // Draw local player
    this.drawLocalPlayer(ctx);
    
    // Draw AI
    if (this.ai && this.monsterType === 'ai') {
      this.drawMonster(ctx, this.ai);
    }
    
    // Particles
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
    
    ctx.restore();
    
    // Flashlight overlay
    this.drawFlashlight(ctx, cw, ch);
    
    // Danger vignette
    if (this.aiDanger > 0) {
      ctx.save();
      const grad = ctx.createRadialGradient(cw/2,ch/2,ch*0.3,cw/2,ch/2,ch*0.8);
      grad.addColorStop(0, 'rgba(255,0,0,0)');
      grad.addColorStop(1, `rgba(255,0,0,${this.aiDanger * 0.5})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
    }
    
    // Red flash
    if (this.flashRed > 0) {
      ctx.fillStyle = `rgba(255,0,0,${this.flashRed * 0.6})`;
      ctx.fillRect(0, 0, cw, ch);
    }
    
    // HUD
    this.drawHUD(ctx, cw, ch);
    
    // Mobile controls
    if (window.isMobile) this.drawMobileControls(ctx, cw, ch);
    
    // Messages
    this.drawMessages(ctx, cw, ch);
  }
  
  drawFloor(ctx) {
    const startX = Math.floor(this.camera.x / TILE) - 1;
    const startY = Math.floor(this.camera.y / TILE) - 1;
    const endX = startX + Math.ceil(this.canvas.width / TILE) + 2;
    const endY = startY + Math.ceil(this.canvas.height / TILE) + 2;
    
    for (let ty = startY; ty < endY; ty++) {
      for (let tx = startX; tx < endX; tx++) {
        const wx = tx * TILE, wy = ty * TILE;
        // Checker pattern floor
        const even = (tx + ty) % 2 === 0;
        ctx.fillStyle = even ? '#2a1f0a' : '#261c08';
        ctx.fillRect(wx, wy, TILE, TILE);
        
        // Grid lines
        ctx.strokeStyle = 'rgba(80,60,20,0.3)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(wx, wy, TILE, TILE);
      }
    }
  }
  
  drawWalls(ctx) {
    const cx = this.camera.x, cy = this.camera.y;
    const cw = this.canvas.width, ch = this.canvas.height;
    
    for (const w of this.walls) {
      if (w.x + w.w < cx || w.x > cx + cw || w.y + w.h < cy || w.y > cy + ch) continue;
      
      // Wall base
      ctx.fillStyle = '#8B7355';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      
      // Wall texture pattern
      ctx.fillStyle = '#7A6248';
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          if ((i + j) % 2 === 0) {
            ctx.fillRect(w.x + i*(w.w/3), w.y + j*(w.h/3), w.w/3, w.h/3);
          }
        }
      }
      
      // Highlight top
      ctx.fillStyle = 'rgba(255,240,180,0.15)';
      ctx.fillRect(w.x, w.y, w.w, 4);
      
      // Shadow bottom
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(w.x, w.y + w.h - 4, w.w, 4);
      
      // Border
      ctx.strokeStyle = '#5C4A2A';
      ctx.lineWidth = 1;
      ctx.strokeRect(w.x, w.y, w.w, w.h);
    }
  }
  
  drawKey(ctx) {
    const k = this.key;
    const t = Date.now() / 1000;
    const bob = Math.sin(t * 3) * 5;
    const glow = (Math.sin(t * 4) + 1) / 2;
    
    ctx.save();
    ctx.translate(k.x, k.y + bob);
    
    // Glow
    const glowR = ctx.createRadialGradient(0, 0, 5, 0, 0, 40);
    glowR.addColorStop(0, `rgba(255,220,0,${0.4 + glow * 0.3})`);
    glowR.addColorStop(1, 'rgba(255,220,0,0)');
    ctx.fillStyle = glowR;
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI*2);
    ctx.fill();
    
    // Key shape
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(0, -5, 12, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#2a1f0a';
    ctx.beginPath();
    ctx.arc(0, -5, 6, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(-4, 5, 8, 20);
    ctx.fillRect(-4, 15, 5, 5);
    ctx.fillRect(-4, 21, 7, 4);
    
    ctx.restore();
  }
  
  drawExit(ctx) {
    const e = this.exit;
    const t = Date.now() / 1000;
    const pulse = (Math.sin(t * 2) + 1) / 2;
    
    ctx.save();
    ctx.translate(e.x, e.y);
    
    // Exit glow
    const grad = ctx.createRadialGradient(0, 0, 10, 0, 0, 60);
    grad.addColorStop(0, `rgba(0,255,150,${0.3 + pulse * 0.2})`);
    grad.addColorStop(1, 'rgba(0,255,150,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, 60, 0, Math.PI*2);
    ctx.fill();
    
    // Door
    ctx.fillStyle = '#00cc66';
    ctx.fillRect(-20, -30, 40, 55);
    ctx.fillStyle = '#004422';
    ctx.fillRect(-15, -25, 30, 45);
    
    // Exit text
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('EXIT', 0, 40);
    
    ctx.restore();
  }
  
  drawPlayer(ctx, p, isMonsterPlayer) {
    const jo = p.jumpOffset || 0;
    ctx.save();
    ctx.translate(p.x, p.y + jo);
    
    if (isMonsterPlayer) {
      this.drawMonsterBody(ctx);
    } else {
      this.drawPlayerBody(ctx, p);
    }
    
    // Name tag
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const nameW = p.name.length * 6 + 10;
    ctx.fillRect(-nameW/2, -48, nameW, 16);
    ctx.fillStyle = isMonsterPlayer ? '#ff4444' : '#ffffff';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, 0, -35);
    
    ctx.restore();
  }
  
  drawPlayerBody(ctx, p) {
    const frame = (p.animFrame || 0) % 4;
    const dir = p.dir || 'down';
    const state = p.state || 'idle';
    
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 18, 14, 6, 0, 0, Math.PI*2);
    ctx.fill();
    
    // Body
    ctx.fillStyle = '#4a9eff';
    ctx.beginPath();
    ctx.roundRect(-12, -20, 24, 28, 4);
    ctx.fill();
    
    // Head
    ctx.fillStyle = '#ffcc99';
    ctx.beginPath();
    ctx.arc(0, -26, 12, 0, Math.PI*2);
    ctx.fill();
    
    // Eyes based on dir
    ctx.fillStyle = '#333';
    if (dir === 'down') {
      ctx.fillRect(-4, -28, 3, 3);
      ctx.fillRect(2, -28, 3, 3);
    } else if (dir === 'up') {
      // no eyes visible
    } else if (dir === 'right') {
      ctx.fillRect(5, -27, 3, 3);
    } else {
      ctx.fillRect(-8, -27, 3, 3);
    }
    
    // Walk animation legs
    if (state === 'walk' || state === 'run') {
      const legSwing = Math.sin(frame * Math.PI / 2) * 8;
      ctx.fillStyle = '#2244aa';
      // Left leg
      ctx.fillRect(-8, 6, 6, 12 + (legSwing > 0 ? legSwing : 0));
      // Right leg
      ctx.fillRect(2, 6, 6, 12 + (legSwing < 0 ? -legSwing : 0));
    } else {
      ctx.fillStyle = '#2244aa';
      ctx.fillRect(-8, 6, 6, 14);
      ctx.fillRect(2, 6, 6, 14);
    }
    
    // Key badge
    if (p.hasKey) {
      ctx.fillStyle = '#FFD700';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('🔑', 14, -20);
    }
  }
  
  drawLocalPlayer(ctx) {
    const p = this.local;
    const jo = p.jumpOffset || 0;
    ctx.save();
    ctx.translate(p.x, p.y + jo);
    
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 18, 14, 6, 0, 0, Math.PI*2);
    ctx.fill();
    
    // Highlight ring
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -26, 14, 0, Math.PI*2);
    ctx.stroke();
    
    this.drawPlayerBody(ctx, { ...p, hasKey: this.local.hasKey });
    
    // Name tag
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    const nameW = this.playerName.length * 6 + 10;
    ctx.fillRect(-nameW/2, -48, nameW, 16);
    ctx.fillStyle = '#00ff88';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.playerName, 0, -35);
    
    ctx.restore();
  }
  
  drawMonster(ctx, ai) {
    ctx.save();
    ctx.translate(ai.x, ai.y);
    this.drawMonsterBody(ctx);
    ctx.restore();
  }
  
  drawMonsterBody(ctx) {
    const t = Date.now() / 1000;
    const wobble = Math.sin(t * 8) * 2;
    
    // Shadow
    ctx.fillStyle = 'rgba(255,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 22, 20, 8, 0, 0, Math.PI*2);
    ctx.fill();
    
    // Body - creature
    ctx.fillStyle = '#1a0000';
    ctx.beginPath();
    ctx.ellipse(0, -5, 18, 22, 0, 0, Math.PI*2);
    ctx.fill();
    
    // Glow
    ctx.strokeStyle = '#ff2200';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Eyes
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(-7 + wobble, -12, 5, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(7 - wobble, -12, 5, 0, Math.PI*2);
    ctx.fill();
    
    // Pupils
    ctx.fillStyle = '#ff8800';
    ctx.beginPath();
    ctx.arc(-7 + wobble, -12, 2, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(7 - wobble, -12, 2, 0, Math.PI*2);
    ctx.fill();
    
    // Mouth
    ctx.strokeStyle = '#ff4400';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -2, 8, 0.3, Math.PI - 0.3);
    ctx.stroke();
    
    // Arms tentacles
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI + Math.sin(t * 5 + i) * 0.3 - Math.PI/2;
      ctx.strokeStyle = '#cc1100';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * 18, -5 + Math.sin(ang) * 18);
      ctx.lineTo(Math.cos(ang) * 32, -5 + Math.sin(ang) * 32);
      ctx.stroke();
    }
    
    // Label
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CANAVAR', 0, -44);
  }
  
  drawFlashlight(ctx, cw, ch) {
    // Dark overlay with cutout around player
    const px = this.local.x - this.camera.x;
    const py = this.local.y - this.camera.y;
    
    const overlay = ctx.createRadialGradient(px, py, 0, px, py, this.flashRadius);
    overlay.addColorStop(0, 'rgba(0,0,0,0)');
    overlay.addColorStop(0.5, 'rgba(0,0,0,0.1)');
    overlay.addColorStop(0.8, 'rgba(0,0,0,0.7)');
    overlay.addColorStop(1, 'rgba(0,0,0,0.95)');
    
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, cw, ch);
    
    // Ambient light color tint
    ctx.fillStyle = 'rgba(255,200,100,0.02)';
    ctx.fillRect(0, 0, cw, ch);
  }
  
  drawHUD(ctx, cw, ch) {
    ctx.save();
    
    // Top bar
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, cw, 36);
    
    // Key status
    if (this.local.hasKey) {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('🔑 ANAHTARIN SENDE! ÇIKIŞA KOŞ!', 10, 23);
    } else {
      ctx.fillStyle = '#ccaa55';
      ctx.font = '13px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('🔑 Anahtarı bul...', 10, 23);
    }
    
    // FPS (small, right)
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${this.fps}fps`, cw - 5, 14);
    
    // Player count
    const pCount = Object.keys(this.players).length + 1;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`👥 ${pCount}`, cw - 5, 30);
    
    ctx.restore();
  }
  
  drawMobileControls(ctx, cw, ch) {
    // Joystick zone indicator
    const jx = this.joystick.active ? this.joystick.startX : cw * 0.18;
    const jy = this.joystick.active ? this.joystick.startY : ch * 0.78;
    
    // Outer ring
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(jx, jy, 55, 0, Math.PI*2);
    ctx.stroke();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
    
    // Inner stick
    if (this.joystick.active) {
      const len = Math.min(Math.hypot(this.joystick.dx, this.joystick.dy), 45);
      const ang = Math.atan2(this.joystick.dy, this.joystick.dx);
      const sx = jx + Math.cos(ang) * len;
      const sy = jy + Math.sin(ang) * len;
      
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy, 22, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(jx, jy, 22, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
    
    // Jump button (right side)
    const bx = cw * 0.85, by = ch * 0.78;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#44aaff';
    ctx.beginPath();
    ctx.arc(bx, by, 38, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = '#88ccff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ZIP', bx, by + 5);
    ctx.restore();
  }
  
  drawMessages(ctx, cw, ch) {
    if (!this.messages) return;
    const now = Date.now();
    this.messages = this.messages.filter(m => now < m.until);
    
    ctx.save();
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    
    let y = ch * 0.18;
    for (const m of this.messages) {
      const alpha = Math.min(1, (m.until - now) / 500);
      ctx.globalAlpha = alpha;
      
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.8)';
      const tw = ctx.measureText(m.text).width;
      ctx.fillRect(cw/2 - tw/2 - 10, y - 18, tw + 20, 26);
      
      ctx.fillStyle = m.color || '#ffffff';
      ctx.fillText(m.text, cw/2, y);
      y += 32;
    }
    ctx.restore();
  }
  
  showMessage(text, color, duration) {
    if (!this.messages) this.messages = [];
    this.messages.push({ text, color, until: Date.now() + duration });
  }
  
  start() {
    if (!this.audioCtx) this.initAudio();
    this.running = true;
    const loop = (ts) => {
      const dt = Math.min((ts - this.lastTime) / 1000, 0.05);
      this.lastTime = ts;
      this.update(dt);
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(ts => { this.lastTime = ts; requestAnimationFrame(loop); });
  }
  
  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }
  
  addParticle(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 3;
      this.particles.push({
        x, y,
        vx: Math.cos(ang)*spd,
        vy: Math.sin(ang)*spd - 2,
        life: 0.5 + Math.random() * 0.5,
        color,
        r: 2 + Math.random() * 4
      });
    }
  }
}

window.BackroomsGame = BackroomsGame;

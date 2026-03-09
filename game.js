class GameEngine {
constructor(canvas, playerId, layout) {
this.canvas = canvas;
this.ctx = canvas.getContext(‘2d’);
this.playerId = playerId;
this.layout = layout;

```
    this.width = layout.width;
    this.height = layout.height;
    this.walls = layout.walls;
    this.keyPos = layout.keyPos;
    this.spawns = layout.spawns;

    this.players = new Map();
    layout.players.forEach(p => {
        this.players.set(p.id, {
            id: p.id,
            username: p.username,
            x: p.x, y: p.y,
            vx: 0, vy: 0,
            alive: true,
            hasKey: false,
            anim: 'idle'
        });
    });

    this.localPlayer = this.players.get(playerId);
    this.monster = null;
    this.monsterId = null;
    this.monsterSpeed = 2.5;
    this.gameStarted = false;

    this.cameraX = this.localPlayer.x - canvas.width / 2;
    this.cameraY = this.localPlayer.y - canvas.height / 2;

    this.gravity = 0.6;
    this.moveSpeed = 3;
    this.jumpForce = 12;
    this.keys = {};

    this.frameCount = 0;
    this.running = true;

    // Telefon kontrolü
    if (window.innerWidth < window.innerHeight) {
        document.getElementById('controls').classList.add('show');
    }
}

start() {
    this.gameLoop();
}

destroy() {
    this.running = false;
}

gameLoop = () => {
    if (!this.running) return;

    this.update();
    this.render();
    requestAnimationFrame(this.gameLoop);
}

update() {
    if (!this.localPlayer) return;

    // Keyboard + Joystick input
    let moveX = 0, moveY = 0;
    if (gameState.keys['w'] || gameState.keys['arrowup']) moveY -= this.moveSpeed;
    if (gameState.keys['s'] || gameState.keys['arrowdown']) moveY += this.moveSpeed;
    if (gameState.keys['a'] || gameState.keys['arrowleft']) moveX -= this.moveSpeed;
    if (gameState.keys['d'] || gameState.keys['arrowright']) moveX += this.moveSpeed;

    // Joystick from mobile
    if (gameState.keys['joystick_x']) moveX += gameState.keys['joystick_x'] * this.moveSpeed;
    if (gameState.keys['joystick_y']) moveY += gameState.keys['joystick_y'] * this.moveSpeed;

    this.localPlayer.vx = moveX;
    this.localPlayer.vy += this.gravity;
    this.localPlayer.vy = Math.max(-this.jumpForce, Math.min(this.jumpForce, this.localPlayer.vy));

    this.localPlayer.x += this.localPlayer.vx;
    this.localPlayer.y += this.localPlayer.vy;

    // Collision detection
    let onGround = false;
    this.walls.forEach(wall => {
        if (this.checkCollision(this.localPlayer, wall)) {
            if (this.localPlayer.vy > 0 && this.localPlayer.y - 20 < wall.y) {
                this.localPlayer.y = wall.y - 20;
                this.localPlayer.vy = 0;
                onGround = true;
            }
            if (this.localPlayer.vy < 0 && this.localPlayer.y + 20 > wall.y + wall.h) {
                this.localPlayer.y = wall.y + wall.h + 20;
                this.localPlayer.vy = 0;
            }
            if (this.localPlayer.vx < 0) this.localPlayer.x = wall.x + wall.w + 20;
            if (this.localPlayer.vx > 0) this.localPlayer.x = wall.x - 20;
        }
    });

    // Jump
    if (gameState.keys[' '] && onGround) {
        this.localPlayer.vy = -this.jumpForce;
    }

    // Bounds
    this.localPlayer.x = Math.max(20, Math.min(this.width - 20, this.localPlayer.x));
    this.localPlayer.y = Math.max(20, Math.min(this.height - 20, this.localPlayer.y));

    // Animation
    this.localPlayer.anim = (moveX !== 0 || moveY !== 0) ? 'walk' : 'idle';

    // Check key
    const keyDist = Math.hypot(this.localPlayer.x - this.keyPos.x, this.localPlayer.y - this.keyPos.y);
    if (keyDist < 40) {
        this.localPlayer.hasKey = true;
        ws.send(JSON.stringify({
            type: 'KEY_COLLECTED',
            roomId: gameState.roomId
        }));
    }

    // Check escape
    if (this.localPlayer.hasKey && this.localPlayer.x < 100 && this.localPlayer.y < 100) {
        ws.send(JSON.stringify({
            type: 'ESCAPE',
            roomId: gameState.roomId,
            username: gameState.username
        }));
    }

    // Monster AI
    if (this.gameStarted && this.monster) {
        this.updateMonsterAI();
    }

    // Camera follow
    this.cameraX = this.localPlayer.x - this.canvas.width / 2;
    this.cameraY = this.localPlayer.y - this.canvas.height / 2;
    this.cameraX = Math.max(0, Math.min(this.width - this.canvas.width, this.cameraX));
    this.cameraY = Math.max(0, Math.min(this.height - this.canvas.height, this.cameraY));

    // Update server
    if (this.frameCount++ % 2 === 0) {
        ws.send(JSON.stringify({
            type: 'PLAYER_MOVE',
            roomId: gameState.roomId,
            x: this.localPlayer.x,
            y: this.localPlayer.y,
            vx: this.localPlayer.vx,
            vy: this.localPlayer.vy,
            anim: this.localPlayer.anim
        }));
    }

    // Update HUD
    document.getElementById('hud-key').textContent = this.localPlayer.hasKey ? 'YES' : 'NO';
    document.getElementById('hud-players').textContent = this.players.size + '/10';
}

updateMonsterAI() {
    const m = this.monster;
    let closest = null;
    let closestDist = Infinity;

    this.players.forEach(p => {
        if (p.alive && p.id !== this.playerId) {
            const d = Math.hypot(p.x - m.x, p.y - m.y);
            if (d < closestDist) {
                closestDist = d;
                closest = p;
            }
        }
    });

    if (!closest) closest = this.localPlayer;

    const angle = Math.atan2(closest.y - m.y, closest.x - m.x);
    m.vx = Math.cos(angle) * this.monsterSpeed;
    m.vy = Math.sin(angle) * this.monsterSpeed;
    m.vy += this.gravity * 0.5;

    m.x += m.vx;
    m.y += m.vy;

    // Monster collision
    this.walls.forEach(wall => {
        if (this.checkCollision(m, wall)) {
            if (m.vy > 0) {
                m.y = wall.y - 20;
                m.vy = 0;
            }
            if (m.vx < 0) m.x = wall.x + wall.w + 20;
            if (m.vx > 0) m.x = wall.x - 20;
        }
    });

    // Check catches
    this.players.forEach(p => {
        if (p.alive && p.id !== this.playerId) {
            if (Math.hypot(p.x - m.x, p.y - m.y) < 40) {
                if (!m.touchedId) {
                    m.touchedId = p.id;
                    m.touchTime = Date.now();
                } else if (m.touchedId === p.id) {
                    if (Date.now() - m.touchTime > 2000) {
                        ws.send(JSON.stringify({
                            type: 'PLAYER_CAUGHT',
                            roomId: gameState.roomId,
                            targetId: p.id
                        }));
                        p.alive = false;
                        m.touchedId = null;
                    }
                }
            } else {
                if (m.touchedId === p.id) m.touchedId = null;
            }
        }
    });

    ws.send(JSON.stringify({
        type: 'MONSTER_MOVE',
        roomId: gameState.roomId,
        x: m.x,
        y: m.y,
        anim: 'walk'
    }));
}

checkCollision(obj, wall) {
    return obj.x + 20 > wall.x && obj.x - 20 < wall.x + wall.w &&
           obj.y + 20 > wall.y && obj.y - 20 < wall.y + wall.h;
}

render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Background (Backrooms yellow)
    ctx.fillStyle = '#d4a574';
    ctx.fillRect(0, 0, w, h);

    // Walls
    ctx.fillStyle = '#8b7355';
    this.walls.forEach(wall => {
        const x = wall.x - this.cameraX;
        const y = wall.y - this.cameraY;
        ctx.fillRect(x, y, wall.w, wall.h);
    });

    // Grid effect
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 200) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, h);
        ctx.stroke();
    }
    for (let i = 0; i < h; i += 200) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(w, i);
        ctx.stroke();
    }

    // Key
    if (!this.localPlayer.hasKey) {
        const kx = this.keyPos.x - this.cameraX;
        const ky = this.keyPos.y - this.cameraY;
        ctx.font = 'bold 40px Arial';
        ctx.fillText('🔑', kx - 20, ky + 20);
        ctx.strokeStyle = 'rgba(255, 200, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(kx, ky, 40, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Players
    this.players.forEach(p => {
        if (!p.alive) return;
        const px = p.x - this.cameraX;
        const py = p.y - this.cameraY;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(px, py + 25, 20, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body
        ctx.fillStyle = p.id === this.playerId ? '#ff6b6b' : '#4ecdc4';
        ctx.beginPath();
        ctx.arc(px, py, 15, 0, Math.PI * 2);
        ctx.fill();

        // Name
        ctx.fillStyle = '#000';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(p.username, px, py + 35);

        // Key indicator
        if (p.hasKey) {
            ctx.font = 'bold 16px Arial';
            ctx.fillText('🔑', px, py - 25);
        }
    });

    // Monster
    if (this.monster) {
        const mx = this.monster.x - this.cameraX;
        const my = this.monster.y - this.cameraY;

        ctx.fillStyle = '#8b0000';
        ctx.beginPath();
        ctx.arc(mx, my + Math.sin(Date.now() / 200) * 3, 20, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(mx - 8, my - 5, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(mx + 8, my - 5, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}

addPlayer(p) {
    this.players.set(p.id, {
        id: p.id,
        username: p.username,
        x: p.x, y: p.y,
        vx: 0, vy: 0,
        alive: true,
        hasKey: false,
        anim: 'idle'
    });
}

updatePlayer(id, data) {
    if (this.players.has(id) && id !== this.playerId) {
        const p = this.players.get(id);
        p.x = data.x;
        p.y = data.y;
        p.vx = data.vx;
        p.vy = data.vy;
        p.anim = data.anim;
    }
}

updateMonster(x, y, anim) {
    if (this.monster) {
        this.monster.x = x;
        this.monster.y = y;
    }
}

startGame(monsterId, isAI) {
    this.gameStarted = true;
    this.monsterId = monsterId;
    if (isAI) {
        this.monster = {
            id: monsterId,
            x: this.keyPos.x - 300,
            y: this.keyPos.y - 300,
            vx: 0, vy: 0,
            touchedId: null,
            touchTime: 0
        };
    }
}

playerCaught(id) {
    if (this.players.has(id)) {
        this.players.get(id).alive = false;
    }
}

keyCollected(id) {
    if (this.players.has(id)) {
        this.players.get(id).hasKey = true;
    }
}

playerEscaped(id, username) {
    alert(`${username} escaped!`);
}
```

}
